import { format, isSameDay, parseISO, startOfDay, isValid } from 'date-fns';
import { Client } from '../types';

export const ReminderEligibility = {
  /**
   * Normaliza uma data para o início do dia para comparações seguras.
   * Retorna null se a data for inválida.
   */
  normalizeDate: (date: string | Date | undefined | null): Date | null => {
    if (!date) return null;
    try {
      const d = typeof date === 'string' ? parseISO(date) : date;
      return isValid(d) ? startOfDay(d) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Verifica se duas datas representam o mesmo dia civil.
   * Retorna false se qualquer uma das datas for inválida.
   */
  isSameDay: (dateA: string | Date | undefined | null, dateB: string | Date | undefined | null): boolean => {
    const d1 = ReminderEligibility.normalizeDate(dateA);
    const d2 = ReminderEligibility.normalizeDate(dateB);
    if (!d1 || !d2) return false;
    return isSameDay(d1, d2);
  },

  /**
   * Obtém a data do último alerta, priorizando o bloco de automação.
   */
  getLastAlertDate: (client: Client): string | undefined => {
    return client.automation?.lastAlertDate || client.lastAlertDate;
  },

  /**
   * Verifica se um lembrete já foi enviado hoje.
   */
  canSendReminderToday: (client: Client): boolean => {
    const lastDate = ReminderEligibility.getLastAlertDate(client);
    if (!lastDate) return true;

    const today = new Date();
    return !ReminderEligibility.isSameDay(lastDate, today);
  },

  /**
   * Lógica principal de elegibilidade para lembrete.
   */
  shouldSendReminder: (client: Client): boolean => {
    // 1. Status deve ser crítico
    const isCriticalStatus = client.status === 'WARNING' || client.status === 'OVERDUE';
    if (!isCriticalStatus) return false;

    // 2. Não pode ter enviado hoje
    if (!ReminderEligibility.canSendReminderToday(client)) return false;

    // 3. Respeita data de elegibilidade futura (se existir)
    if (client.automation?.nextSendEligibleAt) {
      const eligibleAt = ReminderEligibility.normalizeDate(client.automation.nextSendEligibleAt);
      if (eligibleAt) {
        const now = startOfDay(new Date());
        if (now < eligibleAt) return false;
      }
    }

    return true;
  },

  /**
   * Retorna a lista de clientes pendentes de lembrete.
   */
  getPendingReminderClients: (clients: Client[]): Client[] => {
    return clients.filter(client => ReminderEligibility.shouldSendReminder(client));
  }
};
