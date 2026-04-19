import { parseISO, startOfDay, differenceInDays } from 'date-fns';
import { MaintenanceStatus } from '../types';

/**
 * Calcula o status de manutenção de um cliente baseado na data da próxima manutenção.
 * @param nextMaintenanceDateStr Data da próxima manutenção em formato ISO string.
 * @returns 'OVERDUE' se vencido, 'WARNING' se faltam 3 dias ou menos, 'OK' caso contrário.
 */
export const calculateClientStatus = (nextMaintenanceDateStr: string): MaintenanceStatus => {
  if (!nextMaintenanceDateStr) return 'OK';
  
  try {
    const nextDate = parseISO(nextMaintenanceDateStr);
    const today = startOfDay(new Date());
    const daysUntil = differenceInDays(nextDate, today);

    if (daysUntil < 0) return 'OVERDUE';
    if (daysUntil <= 3) return 'WARNING';
    return 'OK';
  } catch (error) {
    console.error("Erro ao calcular status de manutenção:", error);
    return 'OK';
  }
};

/**
 * Verifica se um cliente deve receber um alerta de manutenção próxima (1 dia ou menos).
 */
export const isUpcomingMaintenance = (nextMaintenanceDateStr: string): boolean => {
  if (!nextMaintenanceDateStr) return false;
  
  try {
    const nextDate = parseISO(nextMaintenanceDateStr);
    const today = startOfDay(new Date());
    const daysUntil = differenceInDays(nextDate, today);

    // Alerta se faltar exatamente 1 dia ou se já estiver vencido (0 dias até hoje)
    return daysUntil >= 0 && daysUntil <= 1;
  } catch (error) {
    return false;
  }
};

/**
 * Calcula se uma garantia já expirou ou está prestes a expirar.
 */
export const calculateWarrantyStatus = (expiryDateStr: string): MaintenanceStatus => {
  if (!expiryDateStr) return 'OK';
  
  try {
    const expiryDate = parseISO(expiryDateStr);
    const today = startOfDay(new Date());
    const daysUntil = differenceInDays(expiryDate, today);

    if (daysUntil < 0) return 'OVERDUE';
    if (daysUntil <= 7) return 'WARNING'; // Alerta com 7 dias de antecedência para garantias
    return 'OK';
  } catch (error) {
    return 'OK';
  }
};
