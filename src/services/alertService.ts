import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  Firestore 
} from 'firebase/firestore';
import { format, parseISO, isValid } from 'date-fns';
import { Client, MessageLog, Settings } from '../types';
import { ReminderEligibility } from '../utils/reminderEligibility';

export const AlertService = {
  /**
   * Filtra clientes que precisam de alerta hoje usando o helper de elegibilidade.
   */
  getPendingAlerts: (clients: Client[]) => {
    return ReminderEligibility.getPendingReminderClients(clients);
  },

  /**
   * Filtra clientes que precisam de alerta hoje (vencem hoje e estão pendentes).
   */
  getDailyPendingAlerts: (clients: Client[]) => {
    const today = new Date().toISOString().split('T')[0];
    return clients.filter(client => {
      const clientDate = client.nextMaintenanceDate.split('T')[0];
      const isToday = clientDate === today;
      const isPending = client.notificacaoStatus !== 'concluido';
      return isToday && isPending;
    });
  },

  /**
   * Substitui as variáveis do template pelos dados reais do cliente com validação de data.
   */
  buildReminderMessage: (template: string, client: Client) => {
    const nextDate = parseISO(client.nextMaintenanceDate);
    const dateStr = isValid(nextDate) ? format(nextDate, 'dd/MM/yyyy') : 'em breve';
    
    return template
      .replace(/{client}/g, client.name)
      .replace(/{bike}/g, client.bikeModel)
      .replace(/{date}/g, dateStr);
  },

  /**
   * Gera a URL do WhatsApp com validação robusta de número (Brasil).
   */
  createWhatsAppUrl: (client: Client, message: string) => {
    // Fallback para campos de telefone comuns para garantir compatibilidade
    const rawPhone = client.contact || (client as any).phone || (client as any).whatsapp || '';
    let phone = rawPhone.replace(/\D/g, '');
    
    if (!phone) {
      throw new Error(`Telefone não informado para o cliente ${client.name}.`);
    }

    // Lógica para números brasileiros
    // 10 dígitos: DDD + Número (8 dígitos) -> Adiciona 55
    // 11 dígitos: DDD + Número (9 dígitos) -> Adiciona 55
    if (phone.length === 10 || phone.length === 11) {
      phone = '55' + phone;
    } 
    // Se já tem 12 ou 13 dígitos, deve começar com 55
    else if ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) {
      // Já está no formato internacional correto
    } 
    else {
      throw new Error(`O número "${rawPhone}" do cliente ${client.name} está em um formato inválido. Use DDD + Número.`);
    }
    
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  },

  /**
   * Envia mensagem automaticamente via Evolution API.
   */
  sendEvolutionMessage: async (settings: Settings, client: Client, message: string) => {
    if (!settings.evolutionApiUrl || !settings.evolutionApiKey || !settings.evolutionInstanceName) {
      throw new Error("Configurações da Evolution API incompletas.");
    }

    const { evolutionApiUrl, evolutionApiKey, evolutionInstanceName } = settings;
    
    // Preparar número do cliente (apenas dígitos)
    const rawPhone = client.contact || (client as any).phone || (client as any).whatsapp || '';
    let phone = rawPhone.replace(/\D/g, '');
    
    // Garante 55 para Brasil se necessário
    if ((phone.length === 10 || phone.length === 11)) {
      phone = '55' + phone;
    }

    const cleanUrl = evolutionApiUrl.replace(/\/$/, ''); // Remove barra final se hovuer
    const endpoint = `${cleanUrl}/message/sendText/${evolutionInstanceName}`;

    // USAMOS PROXY PARA EVITAR MIXED CONTENT (HTTP -> HTTPS)
    const response = await fetch('/api/evolution-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: endpoint,
        apiKey: evolutionApiKey,
        method: 'POST',
        body: {
          number: phone,
          text: message,
          linkPreview: true
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Erro na API: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Testa a conexão com a Evolution API buscando o status da instância.
   */
  checkEvolutionConnection: async (settings: Settings) => {
    if (!settings.evolutionApiUrl || !settings.evolutionApiKey || !settings.evolutionInstanceName) {
      throw new Error("Preencha todos os campos da API antes de testar.");
    }

    const cleanUrl = settings.evolutionApiUrl.replace(/\/$/, '');
    // endpoint para verificar se a instância está conectada ao WhatsApp
    const endpoint = `${cleanUrl}/instance/connectionStatus/${settings.evolutionInstanceName}`;

    try {
      // USAMOS PROXY PARA EVITAR MIXED CONTENT (HTTP -> HTTPS)
      const response = await fetch('/api/evolution-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: endpoint,
          apiKey: settings.evolutionApiKey,
          method: 'GET'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detailedMessage = errorData.message || errorData.error || `Erro ${response.status}`;
        
        if (response.status === 404) {
          throw new Error("Instância não encontrada. Verifique se o nome está correto no Evolution Manager.");
        }
        throw new Error(`Falha na Integração: ${detailedMessage} (${response.status})`);
      }

      const data = await response.json();
      return data; // { instance: { state: "open", ... } }
    } catch (error) {
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new Error("Não foi possível conectar ao servidor. Verifique se o IP e Porta estão corretos e se o Firewall permite conexões externas.");
      }
      throw error;
    }
  },

  /**
   * Registra a tentativa MANUAL de lembrete (abertura do link wa.me).
   */
  registerManualReminderAttempt: async (db: Firestore, userId: string, client: Client, message: string) => {
    const now = new Date().toISOString();
    
    try {
      // 1. Grava na coleção message_logs com semântica correta
      const logData: MessageLog = {
        clientId: client.id,
        clientName: client.name,
        bikeModel: client.bikeModel,
        phone: client.contact,
        channel: 'whatsapp',
        status: 'opened_whatsapp',
        trigger: 'manual',
        message: message,
        createdAt: now,
        userId: userId
      };

      await addDoc(collection(db, 'message_logs'), logData);

      // 2. Atualiza metadados do cliente preservando campos existentes
      await AlertService.updateClientReminderMetadata(db, client, now);

      return { success: true };
    } catch (error) {
      console.error("Erro ao registrar tentativa de lembrete:", error);
      return { success: false, error };
    }
  },

  /**
   * Atualiza os campos de automação e o campo legado do cliente fazendo merge.
   */
  updateClientReminderMetadata: async (db: Firestore, client: Client, timestamp: string) => {
    const dateOnly = timestamp.split('T')[0]; // YYYY-MM-DD
    const currentAttempts = client.automation?.sendAttempts || 0;

    const updateData = {
      lastAlertDate: dateOnly, // Legado
      notificacao_enviada: true,
      notificacaoStatus: 'concluido',
      automation: {
        ...client.automation, // Preserva campos como nextSendEligibleAt e lastError
        lastAlertDate: dateOnly,
        lastSendAt: timestamp,
        lastSendStatus: 'opened_whatsapp',
        lastSendChannel: 'whatsapp',
        sendAttempts: currentAttempts + 1,
        lastError: null // Limpa erro anterior em caso de sucesso na abertura
      }
    };

    await updateDoc(doc(db, 'clients', client.id), updateData);
  },

  /**
   * Registra a tentativa AUTOMÁTICA via API.
   */
  registerAutomaticReminder: async (db: Firestore, userId: string, client: Client, message: string, status: 'sent' | 'failed', error?: string) => {
    const now = new Date().toISOString();
    const dateOnly = now.split('T')[0];
    
    try {
      const logData: MessageLog = {
        clientId: client.id,
        clientName: client.name,
        bikeModel: client.bikeModel,
        phone: client.contact,
        channel: 'whatsapp',
        status: status,
        trigger: 'retry',
        message: message,
        createdAt: now,
        sentAt: status === 'sent' ? now : undefined,
        error: error,
        userId: userId
      };

      await addDoc(collection(db, 'message_logs'), logData);

      if (status === 'sent') {
        await AlertService.updateClientReminderMetadata(db, client, now);
      } else {
        await updateDoc(doc(db, 'clients', client.id), {
          'automation.lastError': error,
          'automation.lastSendStatus': 'failed'
        });
      }

      return { success: true };
    } catch (error) {
      console.error("Erro ao registrar automação:", error);
      return { success: false, error };
    }
  }
};
