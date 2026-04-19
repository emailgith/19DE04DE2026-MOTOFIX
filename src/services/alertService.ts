import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  Firestore 
} from 'firebase/firestore';
import { format, parseISO, isValid } from 'date-fns';
import { Client, MessageLog } from '../types';
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
  }
};
