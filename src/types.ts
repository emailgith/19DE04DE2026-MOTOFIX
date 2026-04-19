export type MaintenanceStatus = 'OK' | 'WARNING' | 'OVERDUE';

export interface Client {
  id: string;
  name: string;
  bikeModel: string;
  oilType: string;
  oilPrice: number;
  contact: string; // Telefone do cliente
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  recurrenceDays: number;
  status: MaintenanceStatus;
  isRecurringRevenue?: boolean;
  notificacao_enviada?: boolean;
  notificacaoStatus?: 'pendente' | 'concluido';
  lastServiceType?: string;
  lastServiceValue?: number;
  lastServiceNotes?: string;
  userId: string;
  createdAt: string;
  lastAlertDate?: string; // Campo legado (YYYY-MM-DD)
  automation?: {
    lastAlertDate?: string; // YYYY-MM-DD
    lastSendAt?: string;    // ISO Timestamp
    lastSendStatus?: 'pending' | 'opened_whatsapp' | 'sent' | 'failed';
    lastSendChannel?: 'whatsapp' | 'email' | 'manual';
    sendAttempts?: number;
    nextSendEligibleAt?: string; // ISO Timestamp ou YYYY-MM-DD
    lastError?: string;
  };
}

export interface MessageLog {
  id?: string;
  clientId: string;
  clientName: string;
  bikeModel?: string;
  phone: string;
  channel: 'whatsapp' | 'email' | 'manual';
  status: 'pending' | 'opened_whatsapp' | 'sent' | 'failed';
  trigger: 'manual' | 'scheduled' | 'retry';
  message: string;
  createdAt: string;
  sentAt?: string;
  error?: string | null;
  userId: string;
}

export interface MaintenanceRecord {
  id: string;
  clientId: string;
  clientName: string;
  bikeModel: string;
  date: string;
  oilType: string;
  oilPrice?: number; // Valor legado para troca de óleo
  serviceType: string; // Tipo de serviço (ex: Troca de Óleo, Revisão)
  serviceValue: number; // Valor total do serviço
  isRecurringRevenue: boolean; // Identifica se é receita recorrente
  notes: string;
  userId: string;
}

export interface Settings {
  userId: string;
  whatsappTemplate: string;
  oilTypes: string[];
  warrantyCategories: string[];
  businessName?: string;
  businessPhone?: string;
  businessInstagram?: string;
  businessAddress?: string;
  isProfileComplete?: boolean;
  // Evolution API Integration
  evolutionApiUrl?: string; // e.g., http://159.65.228.86:8081
  evolutionApiKey?: string; // e.g., MotoFix_Token_2026
  evolutionInstanceName?: string; // e.g., MotoFix_Loja_1
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  isActive: boolean;
  subscriptionExpiresAt?: string;
  createdAt: string;
}

export interface Warranty {
  id: string;
  clientName: string;
  serviceType: string;
  serviceDescription: string;
  serviceValue: number;
  serviceDate: string;
  durationMonths: number;
  expiryDate: string;
  clientPhone: string;
  warrantyNumber: number;
  userId: string;
  createdAt: string;
}
