/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Search, History, Bell, Settings as SettingsIcon, LogOut, 
  ChevronRight, Trash2, CheckCircle, MessageSquare, ArrowLeft, 
  RefreshCw, Wrench, Filter, UserCheck, UserX, AlertCircle, 
  ExternalLink, MoreVertical, Edit2, CheckCircle2, TrendingUp,
  MessageCircle,
  BarChart3, Calendar, ShieldCheck, Download, FileText, X,
  PieChart, LayoutDashboard, ArrowUpRight, ArrowDownRight,
  TrendingDown, Bike, Users, AlertTriangle, ChevronLeft,
  Droplets, Shield, Lock
} from 'lucide-react';
import { 
  format, parseISO, addDays, isAfter, isBefore, startOfMonth, 
  endOfMonth, isWithinInterval, subMonths, startOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart as RePieChart, Pie 
} from 'recharts';
import { 
  collection, addDoc, query, where, onSnapshot, 
  updateDoc, doc, deleteDoc, getDocs, getDoc,
  getDocFromServer, serverTimestamp, setDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, 
  signOut, User 
} from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { 
  Client, MaintenanceRecord, MessageLog, Settings, 
  UserProfile, Warranty, MaintenanceStatus 
} from './types';
import { cn } from './lib/utils';
import { Toaster, toast as sonnerToast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { AlertService } from './services/alertService';
import { calculateClientStatus, isUpcomingMaintenance, calculateWarrantyStatus } from './utils/maintenanceUtils';

// Toast Component
const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => (
  <div className={cn(
    "fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300",
    type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
  )}>
    {type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
    <p className="font-bold text-sm">{message}</p>
    <button onClick={onClose} className="ml-2 hover:opacity-70">
      <X className="w-4 h-4" />
    </button>
  </div>
);

// --- Components ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      setHasError(true);
      setError(e.message);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-dark p-4">
        <div className="bg-slate-800 p-8 rounded-2xl border border-red-500/30 max-w-md w-full text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Algo deu errado</h1>
          <p className="text-slate-400 mb-6">{error || "Ocorreu um erro inesperado."}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all"
          >
            Recarregar Aplicativo
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const LoadingScreen = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background-dark">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      <Bike className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary" />
    </div>
    <p className="mt-4 text-slate-400 font-medium animate-pulse">Carregando MotoFix...</p>
  </div>
);

const AuthScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-background-dark p-4 overflow-hidden relative">
    {/* Decorative background */}
    <div className="absolute top-0 right-0 -z-10 opacity-10 pointer-events-none">
      <svg width="600" height="600" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="300" cy="100" r="200" fill="url(#grad1)" />
        <defs>
          <linearGradient id="grad1" x1="150" y1="-50" x2="450" y2="250" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f2780d" />
            <stop offset="1" stopColor="#f2780d" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>

    <div className="max-w-md w-full space-y-6 text-center">
      <div className="space-y-3">
        <div className="bg-primary/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-primary/20">
          <Bike className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">MotoFix Manager</h1>
        <p className="text-slate-400 text-sm max-w-[280px] mx-auto">Gerencie trocas de óleo e garantias com alertas inteligentes.</p>
      </div>

      <button 
        onClick={() => signInWithPopup(auth, googleProvider)}
        className="w-full flex items-center justify-center gap-3 py-3.5 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition-all active:scale-95 shadow-xl text-sm"
      >
        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
        Entrar com Google
      </button>

      <div className="pt-4 grid grid-cols-2 gap-3">
        <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
          <Bell className="w-5 h-5 text-primary mb-1.5 mx-auto" />
          <p className="text-[10px] font-bold text-white uppercase tracking-wider">Alertas</p>
          <p className="text-[9px] text-slate-500">WhatsApp automático</p>
        </div>
        <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
          <ShieldCheck className="w-5 h-5 text-primary mb-1.5 mx-auto" />
          <p className="text-[10px] font-bold text-white uppercase tracking-wider">Garantias</p>
          <p className="text-[9px] text-slate-500">Gestão de prazos</p>
        </div>
      </div>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'clients' | 'history' | 'settings' | 'new-client' | 'client-detail' | 'warranties' | 'new-warranty' | 'admin' | 'report'>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('motofix-theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('motofix-theme', theme);
  }, [theme]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingWarranty, setEditingWarranty] = useState<Warranty | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'client' | 'maintenance' | 'warranty' | 'message_log' } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [isNewService, setIsNewService] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    clientName: '',
    serviceType: 'all',
    isRecurring: 'all'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Auto-reset delete confirmation after 3 seconds
  useEffect(() => {
    if (deleteConfirm) {
      const timer = setTimeout(() => setDeleteConfirm(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [deleteConfirm]);

  const ADMIN_EMAILS = ['6snailiw@gmail.com', 'emailgithubb@gmail.com'];

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Chart Data Calculation
  const chartData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const last6Months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last6Months.push({
        month: months[d.getMonth()],
        monthIndex: d.getMonth(),
        year: d.getFullYear(),
        count: 0
      });
    }

    clients.forEach(c => {
      if (!c.lastMaintenanceDate) return;
      const mDate = parseISO(c.lastMaintenanceDate);
      const dataPoint = last6Months.find(p => p.monthIndex === mDate.getMonth() && p.year === mDate.getFullYear());
      if (dataPoint) dataPoint.count++;
    });

    return last6Months;
  }, [clients]);

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Fetch or create user profile
        const userDoc = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDoc);
        
        if (userSnap.exists()) {
          setUserProfile(userSnap.data() as UserProfile);
        } else {
          const isAdminUser = ADMIN_EMAILS.includes(user.email || '');
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'Usuário',
            role: isAdminUser ? 'admin' : 'user',
            isActive: isAdminUser, // Admin is active by default, others need approval
            createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")
          };
          await setDoc(userDoc, newProfile);
          setUserProfile(newProfile);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
  }, []);

  // Subscription expiry check
  useEffect(() => {
    if (!userProfile || userProfile.role === 'admin' || !userProfile.subscriptionExpiresAt || !userProfile.isActive) return;

    const expiryDate = parseISO(userProfile.subscriptionExpiresAt);
    const today = new Date();

    // If today is after expiry date, block the user
    if (isBefore(expiryDate, today)) {
      updateDoc(doc(db, 'users', userProfile.uid), {
        isActive: false
      }).catch(e => console.error("Error auto-blocking expired user", e));
    }
  }, [userProfile]);

  // Data listeners
  useEffect(() => {
    if (!user || !userProfile?.isActive) return;

    const clientsQuery = query(collection(db, 'clients'), where('userId', '==', user.uid));
    const unsubscribeClients = onSnapshot(clientsQuery, (snapshot) => {
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(clientsData);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'clients'));

    const maintenanceQuery = query(collection(db, 'maintenances'), where('userId', '==', user.uid));
    const unsubscribeMaintenances = onSnapshot(maintenanceQuery, (snapshot) => {
      const maintenanceData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRecord));
      setMaintenances(maintenanceData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'maintenances'));

    const warrantyQuery = query(collection(db, 'warranties'), where('userId', '==', user.uid));
    const unsubscribeWarranties = onSnapshot(warrantyQuery, (snapshot) => {
      const warrantyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Warranty));
      setWarranties(warrantyData.sort((a, b) => b.warrantyNumber - a.warrantyNumber));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'warranties'));

    const settingsDoc = doc(db, 'settings', user.uid);
    const unsubscribeSettings = onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const updatedSettings: Settings = {
          userId: user.uid,
          whatsappTemplate: data.whatsappTemplate || "Olá {client}, sua {bike} está agendada para manutenção em {date}. Nos vemos lá!",
          oilTypes: data.oilTypes || ['10W30', '10W40', '20W50', 'Motul 3000', 'Motul 5000', 'Yamalube'],
          warrantyCategories: data.warrantyCategories || ['Motor', 'Câmbio', 'Elétrica', 'Suspensão', 'Freios', 'Pintura', 'Geral'],
          businessName: data.businessName || '',
          businessPhone: data.businessPhone || '',
          businessInstagram: data.businessInstagram || '',
          businessAddress: data.businessAddress || '',
          isProfileComplete: data.isProfileComplete || false
        };
        setSettings(updatedSettings);
        
        // If fields were missing, update the doc only if they are actually missing to avoid loops
        const needsUpdate = !data.oilTypes || !data.warrantyCategories || data.isProfileComplete === undefined;
        if (needsUpdate) {
          updateDoc(settingsDoc, {
            oilTypes: updatedSettings.oilTypes,
            warrantyCategories: updatedSettings.warrantyCategories,
            isProfileComplete: updatedSettings.isProfileComplete
          }).catch(e => console.error("Error updating settings with defaults", e));
        }
      } else {
        // Initial settings
        const initialSettings: Settings = {
          userId: user.uid,
          whatsappTemplate: "Olá {client}, sua {bike} está agendada para manutenção em {date}. Nos vemos lá!",
          oilTypes: ['10W30', '10W40', '20W50', 'Motul 3000', 'Motul 5000', 'Yamalube'],
          warrantyCategories: ['Motor', 'Câmbio', 'Elétrica', 'Suspensão', 'Freios', 'Pintura', 'Geral'],
          businessName: '',
          businessPhone: '',
          businessInstagram: '',
          businessAddress: '',
          isProfileComplete: false
        };
        setDoc(settingsDoc, initialSettings).catch(error => handleFirestoreError(error, OperationType.CREATE, 'settings'));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings'));

    // Admin listener
    let unsubscribeUsers = () => {};
    if (userProfile.role === 'admin') {
      const usersQuery = collection(db, 'users');
      unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const usersData = snapshot.docs.map(doc => doc.data() as UserProfile);
        setAllUsers(usersData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      });
    }

    const messageLogsQuery = query(collection(db, 'message_logs'), where('userId', '==', user.uid));
    const unsubscribeMessageLogs = onSnapshot(messageLogsQuery, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MessageLog));
      setMessageLogs(logsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'message_logs'));

    return () => {
      unsubscribeClients();
      unsubscribeMaintenances();
      unsubscribeWarranties();
      unsubscribeSettings();
      unsubscribeUsers();
      unsubscribeMessageLogs();
    };
  }, [user, userProfile]);

  // Update statuses periodically without infinite loops
  useEffect(() => {
    const checkStatuses = async () => {
      // Usamos o estado atual de clients de forma segura
      for (const client of clients) {
        const currentStatus = calculateClientStatus(client.nextMaintenanceDate);
        if (currentStatus !== client.status) {
          try {
            await updateDoc(doc(db, 'clients', client.id), { status: currentStatus });
          } catch (e) {
            console.error("Erro ao atualizar status do cliente", client.id, e);
          }
        }
      }
    };

    // Executa uma vez ao carregar e depois a cada 5 minutos
    checkStatuses();
    const interval = setInterval(checkStatuses, 300000); 
    return () => clearInterval(interval);
  }, [clients.length]);

  // Notifications logic
  useEffect(() => {
    if (!user || (!clients.length && !warranties.length)) return;

    const notifiedKey = `notified_maint_${user.uid}`;
    const lastNotified = localStorage.getItem(notifiedKey);
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Only notify once per day per user
    if (lastNotified === todayStr) return;

    const upcomingMaint = clients.filter(c => isUpcomingMaintenance(c.nextMaintenanceDate));
    const overdueMaint = clients.filter(c => calculateClientStatus(c.nextMaintenanceDate) === 'OVERDUE');
    
    // Warranty alerts
    const expiringWarranties = warranties.filter(w => {
      const status = calculateWarrantyStatus(w.expiryDate);
      return status === 'WARNING' || status === 'OVERDUE';
    });

    if (upcomingMaint.length > 0 || overdueMaint.length > 0 || expiringWarranties.length > 0) {
      if (overdueMaint.length > 0) {
        sonnerToast.error(`Alerta: ${overdueMaint.length} manutenções VENCIDAS!`, {
          description: "Existem clientes com serviços pendentes que precisam de atenção imediata.",
          duration: 10000,
        });
      }
      
      if (upcomingMaint.length > 0) {
        sonnerToast.info(`Aviso: ${upcomingMaint.length} manutenções para hoje ou amanhã!`, {
          description: "Prepare-se para os atendimentos agendados.",
          duration: 8000,
        });
      }

      if (expiringWarranties.length > 0) {
        const overdueWarranties = expiringWarranties.filter(w => calculateWarrantyStatus(w.expiryDate) === 'OVERDUE');
        if (overdueWarranties.length > 0) {
          sonnerToast.warning(`Garantias: ${overdueWarranties.length} já expiraram.`, {
            duration: 8000,
          });
        } else {
          sonnerToast.info(`Garantias: ${expiringWarranties.length} vencendo em breve (7 dias).`, {
            duration: 8000,
          });
        }
      }

      localStorage.setItem(notifiedKey, todayStr);
    }
  }, [clients.length, warranties.length, user]);

  // --- Handlers ---

  const handleAddMaintenance = async (client: Client, date: string = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")) => {
    if (!user || processingId === client.id) return;

    // CORREÇÃO 1: Impedir marcação dupla de serviço realizado
    if (client.status === 'OK') {
      sonnerToast.error(`O serviço para ${client.name} já foi registrado recentemente.`);
      return;
    }

    setProcessingId(client.id);
    const nextDate = format(addDays(parseISO(date), client.recurrenceDays), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    
    const serviceValue = client.lastServiceValue || client.oilPrice || 0;
    const serviceType = client.lastServiceType || 'Troca de Óleo';

    try {
      // 1. Add to history
      await addDoc(collection(db, 'maintenances'), {
        clientId: client.id,
        clientName: client.name,
        bikeModel: client.bikeModel,
        date: date,
        oilType: client.oilType,
        oilPrice: client.oilPrice || 0,
        serviceType: serviceType,
        serviceValue: serviceValue,
        isRecurringRevenue: client.isRecurringRevenue || false,
        userId: user.uid,
        notes: "Manutenção periódica realizada via botão rápido."
      });

      // 2. Update client
      await updateDoc(doc(db, 'clients', client.id), {
        lastMaintenanceDate: date,
        nextMaintenanceDate: nextDate,
        status: calculateClientStatus(nextDate),
        notificacao_enviada: false,
        notificacaoStatus: 'pendente',
        lastServiceType: serviceType,
        lastServiceValue: serviceValue,
        lastServiceNotes: "Manutenção periódica realizada via botão rápido."
      });
      
      sonnerToast.success(`Serviço de ${client.name} confirmado com sucesso!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'maintenances/clients');
      sonnerToast.error("Erro ao confirmar serviço.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleSaveClient = async (clientData: Partial<Client> & { serviceType?: string, serviceValue?: number, notes?: string }) => {
    if (!user) return;
    setIsSaving(true);

    const lastDate = clientData.lastMaintenanceDate || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const recurrence = clientData.recurrenceDays || 29;
    const nextDate = format(addDays(parseISO(lastDate), recurrence), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    
    const finalClientData = {
      name: clientData.name,
      bikeModel: clientData.bikeModel,
      contact: clientData.contact,
      oilType: clientData.oilType || '',
      oilPrice: clientData.oilPrice || 0,
      userId: user.uid,
      lastMaintenanceDate: lastDate,
      nextMaintenanceDate: nextDate,
      recurrenceDays: recurrence,
      isRecurringRevenue: clientData.isRecurringRevenue || false,
      status: calculateClientStatus(nextDate),
      notificacao_enviada: clientData.notificacao_enviada || false,
      notificacaoStatus: clientData.notificacaoStatus || 'pendente',
      lastServiceType: clientData.serviceType || 'Troca de Óleo',
      lastServiceValue: clientData.serviceValue || clientData.oilPrice || 0,
      lastServiceNotes: clientData.notes || "Serviço registrado via formulário.",
      lastAlertDate: clientData.lastAlertDate || '',
      createdAt: clientData.createdAt || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")
    };

    try {
      let clientId = editingClient?.id;
      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id), finalClientData);
      } else {
        const docRef = await addDoc(collection(db, 'clients'), finalClientData);
        clientId = docRef.id;
      }

      // If it's a new service, record it in history
      if (isNewService || !editingClient) {
        await addDoc(collection(db, 'maintenances'), {
          clientId: clientId,
          clientName: clientData.name,
          bikeModel: clientData.bikeModel,
          date: lastDate,
          oilType: clientData.oilType || 'N/A',
          oilPrice: clientData.oilPrice || 0,
          serviceType: clientData.serviceType || 'Troca de Óleo',
          serviceValue: clientData.serviceValue || clientData.oilPrice || 0,
          isRecurringRevenue: clientData.isRecurringRevenue || false,
          notes: clientData.notes || "Serviço registrado via formulário.",
          userId: user.uid
        });
        sonnerToast.success("Serviço registrado com sucesso!");
      } else {
        sonnerToast.success("Cliente atualizado com sucesso!");
      }

      setEditingClient(null);
      setIsNewService(false);
      setView('clients');
    } catch (error) {
      handleFirestoreError(error, editingClient ? OperationType.UPDATE : OperationType.CREATE, 'clients');
      sonnerToast.error("Erro ao salvar dados.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveWarranty = async (warrantyData: Partial<Warranty>) => {
    if (!user) return;
    setIsSaving(true);

    const serviceDate = warrantyData.serviceDate || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const duration = warrantyData.durationMonths || 3;
    const expiryDate = format(addDays(parseISO(serviceDate), duration * 30), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    
    // Get next warranty number
    const nextNumber = warranties.length > 0 ? Math.max(...warranties.map(w => w.warrantyNumber)) + 1 : 1;

    const finalData = {
      ...warrantyData,
      serviceValue: isNaN(warrantyData.serviceValue || 0) ? 0 : (warrantyData.serviceValue || 0),
      userId: user.uid,
      serviceDate,
      durationMonths: duration,
      expiryDate,
      warrantyNumber: warrantyData.warrantyNumber || nextNumber,
      createdAt: warrantyData.createdAt || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")
    };

    try {
      if (editingWarranty) {
        await updateDoc(doc(db, 'warranties', editingWarranty.id), finalData);
        sonnerToast.success("Garantia atualizada com sucesso!");
      } else {
        const docRef = await addDoc(collection(db, 'warranties'), finalData);
        sonnerToast.success("Garantia registrada com sucesso!");
        
        // Auto-generate PDF for new warranty
        setTimeout(() => {
          generateWarrantyPDF({ ...finalData, id: docRef.id } as Warranty);
        }, 500);
      }
      setEditingWarranty(null);
      setView('warranties');
    } catch (error) {
      handleFirestoreError(error, editingWarranty ? OperationType.UPDATE : OperationType.CREATE, 'warranties');
      sonnerToast.error("Erro ao salvar garantia.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWarranty = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'warranties', id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'warranties');
    }
  };

  const handleDeleteMaintenance = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'maintenances', id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'maintenances');
    }
  };

  const generateWarrantyPDF = async (warranty: Warranty) => {
    if (!settings) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    // Header
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.businessName || 'MOTOFIX', margin, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Serviços Especializados em Manutenção', margin, 26);
    doc.text(`WhatsApp: ${settings.businessPhone || 'N/A'} | Instagram: ${settings.businessInstagram || 'N/A'}`, margin, 30);
    if (settings.businessAddress) {
      doc.text(settings.businessAddress, margin, 34);
    }
    
    doc.setLineWidth(0.5);
    doc.line(margin, 37, pageWidth - margin, 37);

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICADO DE GARANTIA', pageWidth / 2, 47, { align: 'center' });

    // Main Box
    const boxY = 57;
    const boxHeight = 85; // Increased height for long descriptions
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, boxY, pageWidth - (margin * 2), boxHeight, 5, 5);

    // Content inside box
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    let currentY = boxY + 10;
    const lineSpacing = 6;

    doc.text(`Nº da Garantia: ${warranty.warrantyNumber}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Cliente: ${warranty.clientName}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Telefone: ${warranty.clientPhone || 'N/A'}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Serviço: ${warranty.serviceType}`, margin + 5, currentY); currentY += lineSpacing;
    
    // Split description to avoid cutting off
    const splitDescription = doc.splitTextToSize(`Descrição: ${warranty.serviceDescription || 'N/A'}`, pageWidth - (margin * 2) - 10);
    doc.text(splitDescription, margin + 5, currentY); 
    currentY += (splitDescription.length * lineSpacing);

    // Ensure we don't overlap if description is very long
    if (currentY > boxY + boxHeight - 20) {
      // If description is too long, we might need to adjust or add a page, 
      // but for now let's just ensure basic fields are printed
    }

    doc.text(`Valor: R$ ${warranty.serviceValue?.toFixed(2) || '0.00'}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Data do Serviço: ${format(parseISO(warranty.serviceDate), 'yyyy-MM-dd')}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Duração: ${warranty.durationMonths} mês(es)`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Vencimento: ${format(parseISO(warranty.expiryDate), 'yyyy-MM-dd')}`, margin + 5, currentY);

    // Terms
    const termsY = boxY + boxHeight + 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Termos da garantia', pageWidth - margin - 70, termsY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const terms = [
      '1) A garantia cobre exclusivamente o serviço descrito neste certificado.',
      `2) Não cobre mau uso, quedas, adaptações, violação de lacres, ou peças não fornecidas/instaladas pela ${settings.businessName || 'empresa'}.`,
      '3) É obrigatório apresentar este certificado (impresso ou digital) para acionamento.',
      '4) O prazo conta a partir da data do serviço, até a data de vencimento informada.'
    ];
    
    let termY = termsY + 6;
    terms.forEach(term => {
      const splitTerm = doc.splitTextToSize(term, 70);
      doc.text(splitTerm, pageWidth - margin - 70, termY);
      termY += (splitTerm.length * 4) + 1;
    });

    // Signatures
    const sigY = 240;
    doc.line(margin, sigY, margin + 80, sigY);
    doc.text('Assinatura do Cliente', margin + 40, sigY + 5, { align: 'center' });

    doc.line(pageWidth - margin - 80, sigY, pageWidth - margin, sigY);
    doc.text(`Assinatura ${settings.businessName || 'MotoFix'}`, pageWidth - margin - 40, sigY + 5, { align: 'center' });

    // Footer
    doc.setFontSize(7);
    const now = format(new Date(), 'dd/MM/yyyy, HH:mm:ss');
    doc.text(`Emitido automaticamente em ${now}`, pageWidth - margin, 265, { align: 'right' });

    doc.save(`Garantia_${warranty.warrantyNumber}_${warranty.clientName}.pdf`);
  };

  const handleDeleteClient = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'clients', id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'clients');
    }
  };

  const handleDeleteMessageLog = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'message_logs', id));
      setDeleteConfirm(null);
      setToast({ message: "Log excluído com sucesso.", type: 'success' });
    } catch (error) {
      console.error("Erro ao excluir log:", error);
      setToast({ message: "Erro ao excluir log.", type: 'error' });
    }
  };

  const toggleUserStatus = async (targetUser: UserProfile) => {
    if (userProfile?.role !== 'admin') return;
    try {
      // If we are activating a user, we might want to set a default subscription if none exists
      const updates: any = { isActive: !targetUser.isActive };
      
      // If activating and no expiry set, set to 30 days from now by default
      if (!targetUser.isActive && !targetUser.subscriptionExpiresAt) {
        updates.subscriptionExpiresAt = format(addDays(new Date(), 30), "yyyy-MM-dd'T'HH:mm:ss'Z'");
      }

      await updateDoc(doc(db, 'users', targetUser.uid), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const updateSubscription = async (uid: string, days: number) => {
    if (userProfile?.role !== 'admin') return;
    try {
      const targetUser = allUsers.find(u => u.uid === uid);
      if (!targetUser) return;
      
      const currentExpiry = targetUser.subscriptionExpiresAt ? parseISO(targetUser.subscriptionExpiresAt) : new Date();
      
      // If adding days and current is expired, start from today
      // If removing days, always subtract from current expiry
      let baseDate = currentExpiry;
      if (days > 0 && isBefore(currentExpiry, new Date())) {
        baseDate = new Date();
      }
      
      const newExpiry = format(addDays(baseDate, days), "yyyy-MM-dd'T'HH:mm:ss'Z'");
      
      await updateDoc(doc(db, 'users', uid), {
        subscriptionExpiresAt: newExpiry,
        isActive: isAfter(parseISO(newExpiry), new Date())
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const setSubscriptionDate = async (uid: string, dateStr: string) => {
    if (userProfile?.role !== 'admin') return;
    try {
      const newExpiry = `${dateStr}T23:59:59Z`;
      await updateDoc(doc(db, 'users', uid), {
        subscriptionExpiresAt: newExpiry,
        isActive: isAfter(parseISO(newExpiry), new Date())
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const sendWhatsApp = (client: Client) => {
    if (!settings || !user) return;
    
    try {
      // 1. Montar a mensagem e URL de forma SÍNCRONA
      // Isso é CRÍTICO para o iOS não bloquear o pop-up
      const message = AlertService.buildReminderMessage(settings.whatsappTemplate, client);
      const url = AlertService.createWhatsAppUrl(client, message);
      
      // 2. Abrir WhatsApp IMEDIATAMENTE
      // O Safari exige que window.open seja disparado diretamente pelo evento de clique
      // Sem NENHUM await ou chamada assíncrona antes.
      const win = window.open(url, '_blank');
      
      // 3. Registrar a tentativa e atualizar status em segundo plano (async)
      // Não usamos 'await' aqui para não bloquear a UI ou causar comportamentos estranhos
      if (win) {
        AlertService.registerManualReminderAttempt(db, user.uid, client, message)
          .then(result => {
            if (result.success) {
              setToast({ message: "WhatsApp aberto e status atualizado.", type: 'success' });
            }
          })
          .catch(err => console.error("Erro ao registrar log:", err));
      } else {
        setToast({ message: "O navegador bloqueou a abertura do WhatsApp. Por favor, permita pop-ups.", type: 'error' });
      }
    } catch (error) {
      console.error("Erro ao preparar WhatsApp:", error);
      setToast({ 
        message: error instanceof Error ? error.message : "Erro ao abrir WhatsApp. Verifique o cadastro do cliente.", 
        type: 'error' 
      });
    }
  };

  // --- Views ---

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.bikeModel.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const dashboardStats = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    let revenue = 0;
    let recurringRevenue = 0;
    let servicesCount = 0;
    
    clients.forEach(c => {
      if (!c.lastMaintenanceDate) return;
      const mDate = parseISO(c.lastMaintenanceDate);
      if (mDate.getMonth() === currentMonth && mDate.getFullYear() === currentYear) {
        const val = c.lastServiceValue || c.oilPrice || 0;
        revenue += val;
        if (c.isRecurringRevenue) {
          recurringRevenue += val;
        }
        servicesCount++;
      }
    });
    
    return { revenue, recurringRevenue, servicesCount };
  }, [clients]);

  const activeWarrantiesCount = useMemo(() => {
    return warranties.filter(w => isAfter(parseISO(w.expiryDate), new Date())).length;
  }, [warranties]);

  const overdueClients = clients.filter(c => c.status === 'OVERDUE');
  const warningClients = clients.filter(c => c.status === 'WARNING');
  const expiringWarranties = warranties.filter(w => calculateWarrantyStatus(w.expiryDate) !== 'OK');
  const pendingAlerts = AlertService.getDailyPendingAlerts(clients);

  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen />;

  // Blocked Screen
  if (userProfile && !userProfile.isActive) {
    return (
      <div className={cn(
        "min-h-screen flex items-center justify-center p-4 transition-colors duration-300",
        theme === 'dark' ? "bg-background-dark" : "bg-slate-50"
      )}>
        <div className={cn(
          "p-8 rounded-3xl border max-w-md w-full text-center space-y-6 shadow-2xl transition-all",
          theme === 'dark' ? "bg-slate-800 border-primary/20" : "bg-white border-slate-200"
        )}>
          <div className="bg-primary/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <h1 className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-black")}>Acesso Restrito</h1>
          <p className="text-slate-500 text-sm">Sua conta está aguardando ativação pelo administrador. Entre em contato para liberar seu acesso:</p>
          <div className={cn(
            "p-4 rounded-2xl border text-left space-y-3",
            theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-100"
          )}>
            <a 
              href="https://wa.me/556999944024" 
              target="_blank" 
              rel="noopener noreferrer"
              className={cn(
                "text-sm flex items-center gap-2 transition-colors",
                theme === 'dark' ? "text-slate-300 hover:text-primary" : "text-slate-600 hover:text-primary font-medium"
              )}
            >
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="font-bold">WhatsApp:</span> +55 69 99944024
            </a>
            <a 
              href="https://instagram.com/motofix_recorrentes" 
              target="_blank" 
              rel="noopener noreferrer"
              className={cn(
                "text-sm flex items-center gap-2 transition-colors",
                theme === 'dark' ? "text-slate-300 hover:text-primary" : "text-slate-600 hover:text-primary font-medium"
              )}
            >
              <SettingsIcon className="w-4 h-4 text-primary" />
              <span className="font-bold">Instagram:</span> @motofix_recorrentes
            </a>
          </div>
          <div className="pt-4">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2">Seu ID de Usuário:</p>
            <code className={cn(
              "px-3 py-1 rounded-lg text-primary text-xs font-mono",
              theme === 'dark' ? "bg-slate-900" : "bg-slate-100"
            )}>{user.uid}</code>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className={cn(
              "w-full py-3 font-bold rounded-xl transition-all shadow-lg shadow-slate-900/5",
              theme === 'dark' ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-slate-100 text-slate-800 hover:bg-slate-200"
            )}
          >
            Sair da Conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={cn(
        "min-h-screen pb-24 font-display transition-colors duration-300",
        theme === 'dark' ? "bg-background-dark text-slate-100" : "bg-slate-50 text-slate-900"
      )}>
        {/* Header */}
        <header className={cn(
          "sticky top-0 z-50 backdrop-blur-md border-b px-4 py-3 flex items-center justify-between transition-colors",
          theme === 'dark' ? "bg-background-dark/80 border-primary/10" : "bg-white/80 border-slate-200 shadow-sm"
        )}>
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-1.5 rounded-lg",
              theme === 'dark' ? "bg-primary/20" : "bg-primary"
            )}>
              <Bike className={cn("w-5 h-5", theme === 'dark' ? "text-primary" : "text-white")} />
            </div>
            <h1 className="text-lg font-bold tracking-tight">MotoFix</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setView('settings')}
              className={cn(
                "p-1.5 rounded-full transition-colors",
                theme === 'dark' ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"
              )}
            >
              <SettingsIcon className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors text-red-500"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-4 space-y-6">
          {view === 'dashboard' && (
            <div className="space-y-8">
              {/* Resumo Financeiro */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className={cn(
                  "p-3 rounded-2xl border flex flex-col justify-between transition-all",
                  theme === 'dark' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-200"
                )}>
                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Receita (Mês)</p>
                  <p className={cn("text-lg font-bold", theme === 'dark' ? "text-white" : "text-emerald-950")}>R$ {dashboardStats.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <TrendingUp className="w-4 h-4 text-emerald-500 mt-1" />
                </div>
                <div className={cn(
                  "p-3 rounded-2xl border flex flex-col justify-between transition-all",
                  theme === 'dark' ? "bg-primary/10 border-primary/20" : "bg-blue-50 border-blue-200"
                )}>
                  <p className="text-[9px] font-bold text-primary uppercase tracking-widest">Recorrente</p>
                  <p className={cn("text-lg font-bold", theme === 'dark' ? "text-white" : "text-blue-950")}>R$ {dashboardStats.recurringRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <RefreshCw className="w-4 h-4 text-primary mt-1" />
                </div>
                <div className={cn(
                  "p-3 rounded-2xl border flex flex-col justify-between transition-all",
                  theme === 'dark' ? "bg-blue-500/10 border-blue-500/20" : "bg-sky-50 border-sky-200"
                )}>
                  <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">Serviços</p>
                  <p className={cn("text-lg font-bold", theme === 'dark' ? "text-white" : "text-sky-950")}>{dashboardStats.servicesCount}</p>
                  <Wrench className="w-4 h-4 text-blue-500 mt-1" />
                </div>
                <div className={cn(
                  "p-3 rounded-2xl border flex flex-col justify-between transition-all",
                  theme === 'dark' ? "bg-purple-500/10 border-purple-500/20" : "bg-purple-50 border-purple-200"
                )}>
                  <p className="text-[9px] font-bold text-purple-500 uppercase tracking-widest">Garantias</p>
                  <p className={cn("text-lg font-bold", theme === 'dark' ? "text-white" : "text-purple-950")}>{activeWarrantiesCount}</p>
                  <ShieldCheck className="w-4 h-4 text-purple-500 mt-1" />
                </div>
              </div>

              {/* Painel de Envios do Dia */}
              {pendingAlerts.length > 0 && (
                <div className={cn(
                  "border rounded-xl p-3 space-y-2 transition-all",
                  theme === 'dark' ? "bg-primary/5 border-primary/20" : "bg-white border-slate-200 shadow-sm"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/20 p-1 rounded-lg">
                        <Bell className="w-3.5 h-3.5 text-primary animate-bounce" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm">Envios do Dia</h3>
                        <p className={cn("text-[10px]", theme === 'dark' ? "text-slate-400" : "text-slate-500")}>{pendingAlerts.length} pendentes hoje</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {pendingAlerts.slice(0, 4).map(client => (
                      <div key={client.id} className={cn(
                        "p-2.5 rounded-lg border flex items-center justify-between group hover:border-primary/30 transition-all",
                        theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-slate-50 border-slate-100"
                      )}>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center",
                            theme === 'dark' ? "bg-slate-700/50" : "bg-white shadow-sm"
                          )}>
                            <Bike className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-bold text-[11px] leading-tight">{client.name}</p>
                            <p className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">{client.bikeModel}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => sendWhatsApp(client)}
                          className="bg-primary p-1.5 rounded-lg text-white hover:scale-105 transition-transform shadow-md shadow-primary/10"
                        >
                          <MessageSquare className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {pendingAlerts.length > 4 && (
                    <button 
                      onClick={() => setView('clients')}
                      className="text-[9px] text-primary font-bold uppercase tracking-widest hover:underline px-1"
                    >
                      + {pendingAlerts.length - 4} outros alertas
                    </button>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div className={cn(
                  "p-3 rounded-xl border transition-all",
                  theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
                )}>
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Total Clientes</p>
                    <Users className="w-3 h-3 text-primary/60" />
                  </div>
                  <p className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-black")}>{clients.length}</p>
                </div>
                <div className={cn(
                  "p-3 rounded-xl border transition-all",
                  theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
                )}>
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Trocas Hoje</p>
                    <Calendar className="w-3 h-3 text-primary/60" />
                  </div>
                  <p className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-black")}>
                    {maintenances.filter(m => format(parseISO(m.date), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')).length}
                  </p>
                </div>
                <div className={cn(
                  "p-3 rounded-xl border relative overflow-hidden transition-all",
                  theme === 'dark' ? "bg-slate-800/40 border-red-500/20" : "bg-white border-red-200 shadow-sm"
                )}>
                  <div className={cn(
                    "absolute top-0 right-0 w-0.5 h-full",
                    theme === 'dark' ? "bg-red-500/50" : "bg-red-500"
                  )} />
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-red-500/80 uppercase tracking-widest">Vencidos</p>
                    <AlertTriangle className="w-3 h-3 text-red-500/60" />
                  </div>
                  <p className="text-xl font-bold text-red-500">{overdueClients.length}</p>
                </div>
              </div>

              {/* Chart */}
              <div className={cn(
                "p-3.5 rounded-xl border transition-all",
                theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
              )}>
                <div className="flex justify-between items-center mb-3">
                  <h3 className={cn("font-bold text-sm", theme === 'light' && "text-black")}>Histórico Mensal</h3>
                  <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Últimos 6 Meses</p>
                </div>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "#334155" : "#e2e8f0"} vertical={false} strokeOpacity={0.3} />
                      <XAxis 
                        dataKey="month" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 9 }} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 9 }} 
                      />
                      <Tooltip 
                        cursor={{ fill: theme === 'dark' ? 'rgba(242, 120, 13, 0.05)' : 'rgba(242, 120, 13, 0.03)' }}
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', 
                          border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
                          borderRadius: '10px',
                          color: theme === 'dark' ? '#fff' : '#000',
                          fontSize: '9px',
                          padding: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                      />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={24}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#f2780d' : (theme === 'dark' ? '#f2780d33' : '#f2780d44')} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button 
                  onClick={() => { setEditingClient(null); setView('new-client'); }}
                  className="bg-primary py-4 px-6 rounded-2xl flex items-center justify-center gap-3 text-white hover:bg-primary/90 transition-all shadow-xl shadow-primary/10 group"
                >
                  <div className="bg-white/20 p-2 rounded-full group-hover:scale-105 transition-transform">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-base font-bold">Registrar Serviço</span>
                </button>
                <button 
                  onClick={() => { setEditingWarranty(null); setView('new-warranty'); }}
                  className={cn(
                    "py-4 px-6 rounded-2xl border flex items-center justify-center gap-3 transition-all group",
                    theme === 'dark' ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-700" : "bg-white border-slate-200 text-slate-900 shadow-sm hover:shadow-md"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-full group-hover:scale-105 transition-transform",
                    theme === 'dark' ? "bg-slate-700" : "bg-slate-100"
                  )}>
                    <ShieldCheck className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-base font-bold">Registrar Garantia</span>
                </button>
              </div>

              {/* Urgent Alerts */}
              {overdueClients.length > 0 && (
                <div className={cn(
                  "rounded-xl border overflow-hidden transition-all",
                  theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200 shadow-sm"
                )}>
                  <div className={cn(
                    "p-3 border-b flex justify-between items-center",
                    theme === 'dark' ? "border-slate-700" : "border-slate-100"
                  )}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <h3 className="font-bold text-sm">Alertas Urgentes</h3>
                    </div>
                    <span className="bg-red-500/10 text-red-500 text-[10px] font-bold px-2 py-0.5 rounded-md">
                      {overdueClients.length} VENCIDOS
                    </span>
                  </div>
                  <div className={cn(
                    "divide-y",
                    theme === 'dark' ? "divide-slate-700" : "divide-slate-100"
                  )}>
                    {overdueClients.slice(0, 5).map(client => (
                      <div key={client.id} className={cn(
                        "p-3 flex items-center justify-between transition-colors",
                        theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-50"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center",
                            theme === 'dark' ? "bg-slate-700" : "bg-slate-100"
                          )}>
                            <Bike className="w-4.5 h-4.5 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-bold text-xs">{client.name}</p>
                            <p className="text-[10px] text-slate-500 font-medium">{client.bikeModel}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-red-500 font-bold text-[10px]">Vencido</p>
                          <p className={cn("text-[9px]", theme === 'dark' ? "text-slate-500" : "text-slate-600 font-bold")}>{format(parseISO(client.nextMaintenanceDate), 'dd/MM/yyyy')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => setView('clients')}
                    className={cn(
                      "w-full p-3 text-xs font-bold transition-colors",
                      theme === 'dark' ? "text-primary hover:bg-slate-800" : "text-primary hover:bg-slate-50"
                    )}
                  >
                    Ver Todos os Alertas
                  </button>
                </div>
              )}

              {/* Expiring Warranties Alerts */}
              {expiringWarranties.length > 0 && (
                <div className={cn(
                  "rounded-xl border overflow-hidden transition-all",
                  theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200 shadow-sm"
                )}>
                  <div className={cn(
                    "p-3 border-b flex justify-between items-center",
                    theme === 'dark' ? "border-slate-700" : "border-slate-100"
                  )}>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <h3 className="font-bold text-sm">Garantias no Limite</h3>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-md",
                      expiringWarranties.some(w => calculateWarrantyStatus(w.expiryDate) === 'OVERDUE') 
                        ? "bg-red-500/10 text-red-500" 
                        : "bg-yellow-500/10 text-yellow-500"
                    )}>
                      {expiringWarranties.length} TOTAL
                    </span>
                  </div>
                  <div className={cn(
                    "divide-y",
                    theme === 'dark' ? "divide-slate-700" : "divide-slate-100"
                  )}>
                    {expiringWarranties.slice(0, 3).map(warranty => {
                      const status = calculateWarrantyStatus(warranty.expiryDate);
                      return (
                        <div key={warranty.id} className={cn(
                          "p-3 flex items-center justify-between transition-colors",
                          theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-50"
                        )}>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center",
                              theme === 'dark' ? "bg-slate-700" : "bg-slate-100"
                            )}>
                              <Shield className="w-4.5 h-4.5 text-slate-400" />
                            </div>
                            <div>
                              <p className="font-bold text-xs">{warranty.clientName}</p>
                              <p className="text-[10px] text-slate-500 font-medium">{warranty.serviceType}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={cn(
                              "font-bold text-[10px]",
                              status === 'OVERDUE' ? "text-red-500" : "text-yellow-500"
                            )}>
                              {status === 'OVERDUE' ? 'Expirada' : 'Vence em breve'}
                            </p>
                            <p className={cn("text-[9px]", theme === 'dark' ? "text-slate-500" : "text-slate-600 font-bold")}>
                              {format(parseISO(warranty.expiryDate), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button 
                    onClick={() => setView('warranties')}
                    className={cn(
                      "w-full p-3 text-xs font-bold transition-colors",
                      theme === 'dark' ? "text-primary hover:bg-slate-800" : "text-primary hover:bg-slate-50"
                    )}
                  >
                    Ver Todas as Garantias
                  </button>
                </div>
              )}
            </div>
          )}

          {view === 'clients' && (
            <div className="space-y-3">
              {/* Quick Action at Top for Mobile Access */}
              <button 
                onClick={() => { setEditingClient(null); setView('new-client'); }}
                className="w-full bg-primary p-3 rounded-xl flex items-center justify-center gap-2 text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/10"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="font-bold text-xs">Novo Registro</span>
              </button>

              <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
                <h2 className="text-lg font-bold">Serviços</h2>
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                  <input 
                    type="text" 
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={cn(
                      "w-full border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none transition-all",
                      theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {filteredClients.map(client => (
                  <div key={client.id} className={cn(
                    "p-3 rounded-xl border space-y-2.5 relative overflow-hidden transition-all",
                    theme === 'dark' ? "bg-slate-800/30 border-slate-700/40" : "bg-white border-slate-200 shadow-sm"
                  )}>
                    <div className={cn(
                      "absolute top-0 right-0 w-0.5 h-full",
                      client.status === 'OK' ? 'bg-emerald-500' : 
                      client.status === 'WARNING' ? 'bg-yellow-500' : 'bg-red-500'
                    )} />
                    
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-1 h-1 rounded-full",
                          client.status === 'OK' ? 'bg-emerald-500' : 
                          client.status === 'WARNING' ? 'bg-yellow-500' : 'bg-red-500'
                        )} />
                        <div>
                          <h3 className={cn("font-bold text-sm leading-tight", theme === 'light' && "text-black")}>{client.name}</h3>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{client.bikeModel}</p>
                        </div>
                      </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleAddMaintenance(client)}
                            disabled={client.status === 'OK' || processingId === client.id}
                            className={cn(
                              "p-2 rounded-lg transition-all flex items-center gap-1.5",
                              (client.status === 'OK' || processingId === client.id)
                                ? theme === 'dark' ? "bg-slate-700/30 text-slate-500 cursor-not-allowed opacity-50" : "bg-slate-100 text-slate-400 cursor-not-allowed opacity-50"
                                : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 active:scale-95"
                            )}
                            title={client.status === 'OK' ? "Serviço já realizado" : "Confirmar Serviço Realizado"}
                          >
                            {processingId === client.id ? (
                              <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-5 h-5" />
                            )}
                            <span className="text-[10px] font-bold uppercase hidden sm:inline">
                              {processingId === client.id ? "Salvando..." : "Concluir"}
                            </span>
                          </button>
                          <button 
                            onClick={() => sendWhatsApp(client)}
                            className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all active:scale-95 flex items-center gap-1.5"
                            title="Enviar WhatsApp"
                          >
                            <MessageCircle className="w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase hidden sm:inline">Avisar</span>
                          </button>
                          <button 
                            onClick={() => { setSelectedClientId(client.id); setView('client-detail'); }}
                            className={cn(
                              "p-2 rounded-lg transition-all",
                              theme === 'dark' ? "bg-slate-700/50 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                            title="Ver Histórico"
                          >
                            <History className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => { setEditingClient(client); setView('new-client'); }}
                            className={cn(
                              "p-2 rounded-lg transition-all",
                              theme === 'dark' ? "bg-slate-700/50 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => {
                              if (deleteConfirm?.id === client.id) {
                                handleDeleteClient(client.id);
                              } else {
                                setDeleteConfirm({ id: client.id, type: 'client' });
                              }
                            }}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              deleteConfirm?.id === client.id 
                                ? "bg-red-500 text-white animate-pulse" 
                                : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                            )}
                          >
                            {deleteConfirm?.id === client.id ? <CheckCircle className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
                          </button>
                        </div>
                    </div>

                    <div className={cn(
                      "grid grid-cols-2 gap-2 pt-2 border-t",
                      theme === 'dark' ? "border-slate-700/20" : "border-slate-100"
                    )}>
                      <div>
                        <p className={cn(
                          "text-[8px] uppercase font-bold tracking-widest",
                          theme === 'dark' ? "text-slate-500" : "text-slate-400"
                        )}>Último Serviço</p>
                        <p className={cn(
                          "text-[10px] font-bold",
                          theme === 'dark' ? "text-slate-200" : "text-slate-900"
                        )}>{format(parseISO(client.lastMaintenanceDate), 'dd/MM/yyyy')}</p>
                        {client.lastServiceType && (
                          <p className={cn(
                            "text-[9px] mt-0.5",
                            theme === 'dark' ? "text-slate-400" : "text-slate-500 font-medium"
                          )}>{client.lastServiceType} • R$ {client.lastServiceValue?.toFixed(2)}</p>
                        )}
                      </div>
                      <div>
                        <p className={cn(
                          "text-[8px] uppercase font-bold tracking-widest",
                          client.status === 'OK' ? theme === 'dark' ? 'text-slate-500' : 'text-slate-400' : 
                          client.status === 'WARNING' ? 'text-yellow-500' : 'text-red-500'
                        )}>Próximo Alerta</p>
                        <p className={cn(
                          "text-[10px] font-bold",
                          client.status === 'OK' ? theme === 'dark' ? 'text-white' : 'text-slate-900' : 
                          client.status === 'WARNING' ? 'text-yellow-500' : 'text-red-500'
                        )}>
                          {format(parseISO(client.nextMaintenanceDate), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                    {client.lastServiceNotes && (
                      <div className="pt-1.5 font-medium">
                        <p className={cn(
                          "text-[8px] uppercase font-bold tracking-widest",
                          theme === 'dark' ? "text-slate-500" : "text-slate-400"
                        )}>Observações</p>
                        <p className={cn(
                          "text-[9px] line-clamp-1 italic",
                          theme === 'dark' ? "text-slate-400" : "text-slate-700"
                        )}>"{client.lastServiceNotes}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'history' && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                <h2 className="text-lg font-bold">Histórico de Serviços</h2>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setView('report')}
                    className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-primary/20 transition-all"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Relatório Mensal
                  </button>
                </div>
              </div>

              {/* Filtros */}
              <div className={cn(
                "p-4 rounded-2xl border space-y-3 transition-all",
                theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
              )}>
                <div className="flex items-center gap-2 text-primary mb-1">
                  <Filter className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Filtros Avançados</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[8px] font-bold uppercase px-1",
                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                    )}>Início</label>
                    <input 
                      type="date" 
                      value={historyFilters.startDate}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, startDate: e.target.value })}
                      className={cn(
                        "w-full rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-200"
                      )} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[8px] font-bold uppercase px-1",
                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                    )}>Fim</label>
                    <input 
                      type="date" 
                      value={historyFilters.endDate}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, endDate: e.target.value })}
                      className={cn(
                        "w-full rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-200"
                      )} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[8px] font-bold uppercase px-1",
                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                    )}>Cliente</label>
                    <input 
                      type="text" 
                      placeholder="Nome..."
                      value={historyFilters.clientName}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, clientName: e.target.value })}
                      className={cn(
                        "w-full rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-200"
                      )} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[8px] font-bold uppercase px-1",
                      theme === 'dark' ? "text-slate-500" : "text-slate-500"
                    )}>Serviço</label>
                    <select 
                      value={historyFilters.serviceType}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, serviceType: e.target.value })}
                      className={cn(
                        "w-full rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black"
                      )}
                    >
                      <option value="all">Todos</option>
                      <option value="Troca de Óleo">Troca de Óleo</option>
                      <option value="Revisão">Revisão</option>
                      <option value="Pneus">Pneus</option>
                      <option value="Freios">Freios</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[8px] font-bold uppercase px-1",
                      theme === 'dark' ? "text-slate-500" : "text-slate-500"
                    )}>Recorrência</label>
                    <select 
                      value={historyFilters.isRecurring}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, isRecurring: e.target.value })}
                      className={cn(
                        "w-full rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black"
                      )}
                    >
                      <option value="all">Todos</option>
                      <option value="yes">Recorrente</option>
                      <option value="no">Eventual</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {maintenances
                  .filter(record => {
                    const recordDate = parseISO(record.date);
                    const start = parseISO(historyFilters.startDate);
                    const end = parseISO(historyFilters.endDate);
                    const matchesDate = isWithinInterval(recordDate, { start, end });
                    const matchesClient = record.clientName.toLowerCase().includes(historyFilters.clientName.toLowerCase());
                    const matchesType = historyFilters.serviceType === 'all' || record.serviceType === historyFilters.serviceType;
                    const matchesRecurring = historyFilters.isRecurring === 'all' || 
                      (historyFilters.isRecurring === 'yes' && record.isRecurringRevenue) ||
                      (historyFilters.isRecurring === 'no' && !record.isRecurringRevenue);
                    
                    return matchesDate && matchesClient && matchesType && matchesRecurring;
                  })
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map(record => (
                    <div key={record.id} className={cn(
                      "p-3 rounded-xl border flex items-center justify-between group transition-all",
                      theme === 'dark' ? "bg-slate-800/30 border-slate-700/40 hover:bg-slate-800/50" : "bg-white border-slate-200 shadow-sm hover:shadow-md"
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          record.isRecurringRevenue ? "bg-primary/10 text-primary" : theme === 'dark' ? "bg-slate-700/50 text-slate-400" : "bg-slate-100 text-slate-500"
                        )}>
                          {record.isRecurringRevenue ? <RefreshCw className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={cn("font-bold text-sm leading-tight", theme === 'light' && "text-black")}>{record.clientName}</p>
                            {record.isRecurringRevenue && (
                              <span className="text-[7px] bg-primary/20 text-primary px-1 rounded uppercase font-bold">Recorrente</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">
                            {record.bikeModel} • {record.serviceType} • R$ {record.serviceValue?.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={cn("font-bold text-xs", theme === 'dark' ? "text-white" : "text-slate-900")}>{format(parseISO(record.date), 'dd/MM/yyyy')}</p>
                          <p className="text-[8px] text-slate-500 uppercase font-bold tracking-widest">Data</p>
                        </div>
                        <button 
                          onClick={() => {
                            if (deleteConfirm?.id === record.id) {
                              handleDeleteMaintenance(record.id);
                            } else {
                              setDeleteConfirm({ id: record.id, type: 'maintenance' });
                            }
                          }}
                          className={cn(
                            "p-2 rounded-lg transition-all flex items-center gap-2 group-hover:opacity-100",
                            deleteConfirm?.id === record.id 
                              ? "bg-red-500 text-white animate-pulse px-4 ring-2 ring-red-500/50 opacity-100" 
                              : "bg-red-500/10 text-red-500 hover:bg-red-500/20 opacity-0"
                          )}
                        >
                          {deleteConfirm?.id === record.id ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-[10px] font-bold uppercase tracking-tighter">Confirmar?</span>
                            </>
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="space-y-3 pt-8 border-t border-slate-800/50">
                <h2 className={cn("text-lg font-bold flex items-center gap-2", theme === 'light' && "text-black")}>
                  <Bell className="w-4 h-4 text-primary" />
                  Logs de Alertas
                </h2>
                <div className="space-y-1.5">
                  {messageLogs.length === 0 ? (
                    <div className={cn(
                      "text-center py-6 rounded-xl border border-dashed transition-all",
                      theme === 'dark' ? "bg-slate-800/10 border-slate-700/30" : "bg-slate-50 border-slate-200"
                    )}>
                      <p className="text-[10px] text-slate-600 font-medium">Nenhum alerta enviado.</p>
                    </div>
                  ) : (
                    messageLogs.map(log => (
                      <div key={log.id} className={cn(
                        "p-2.5 rounded-xl border flex items-center justify-between transition-all",
                        theme === 'dark' ? "bg-slate-800/30 border-slate-700/40" : "bg-white border-slate-200 shadow-sm"
                      )}>
                        <div className="flex items-center gap-2.5">
                          <div className="bg-emerald-500/10 p-1.5 rounded-lg">
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                          <div>
                            <p className={cn("font-bold text-xs leading-tight", theme === 'light' && "text-black")}>{log.clientName}</p>
                            <p className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">{log.bikeModel}</p>
                          </div>
                        </div>
                          <div className="text-right flex items-center gap-2">
                            <div className="text-right">
                              <p className={cn("font-bold text-[9px]", theme === 'dark' ? "text-white" : "text-slate-900")}>{format(parseISO(log.createdAt), 'dd/MM HH:mm')}</p>
                              <span className="text-[7px] text-emerald-500 font-bold uppercase tracking-widest">
                                Aberto
                              </span>
                            </div>
                            <button 
                              onClick={() => {
                                if (deleteConfirm?.id === log.id) {
                                  handleDeleteMessageLog(log.id!);
                                } else {
                                  setDeleteConfirm({ id: log.id!, type: 'message_log' });
                                }
                              }}
                              className={cn(
                                "p-1.5 rounded-lg transition-all flex items-center gap-1.5",
                                deleteConfirm?.id === log.id 
                                  ? "bg-red-500 text-white animate-pulse px-3 ring-2 ring-red-500/50" 
                                  : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                              )}
                            >
                              {deleteConfirm?.id === log.id ? (
                                <>
                                  <CheckCircle className="w-3 h-3" />
                                  <span className="text-[10px] font-bold uppercase tracking-tighter">Confirmar?</span>
                                </>
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {view === 'report' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setView('history')} 
                  className={cn(
                    "p-1.5 rounded-full transition-colors",
                    theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-100"
                  )}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className={cn("text-xl font-bold", theme === 'light' && "text-black")}>Relatório Mensal</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={cn(
                  "p-5 rounded-2xl border transition-all",
                  theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
                )}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Receita Total (Mês)</p>
                  <p className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-black")}>R$ {dashboardStats.revenue.toFixed(2)}</p>
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-500 font-bold">
                    <TrendingUp className="w-3 h-3" />
                    <span>Estatística do Mês</span>
                  </div>
                </div>
                <div className={cn(
                  "p-5 rounded-2xl border transition-all",
                  theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
                )}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Recorrência</p>
                  <p className="text-2xl font-bold text-primary">R$ {dashboardStats.recurringRevenue.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{(dashboardStats.recurringRevenue / (dashboardStats.revenue || 1) * 100).toFixed(1)}% da receita total</p>
                </div>
                <div className={cn(
                  "p-5 rounded-2xl border transition-all",
                  theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
                )}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Serviços Realizados</p>
                  <p className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-black")}>{dashboardStats.servicesCount}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Média de {(dashboardStats.servicesCount / 30).toFixed(1)} por dia</p>
                </div>
              </div>

              <div className={cn(
                "p-6 rounded-2xl border transition-all",
                theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
              )}>
                <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Evolução de Receita (6 Meses)
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Array.from({ length: 6 }).map((_, i) => {
                      const date = subMonths(new Date(), 5 - i);
                      const monthStr = format(date, 'MMM', { locale: ptBR });
                      const monthYear = format(date, 'yyyy-MM');
                      
                      const monthServices = maintenances.filter(m => m.date.startsWith(monthYear));
                      const total = monthServices.reduce((acc, m) => acc + (m.serviceValue || 0), 0);
                      const recurring = monthServices.filter(m => m.isRecurringRevenue).reduce((acc, m) => acc + (m.serviceValue || 0), 0);
                      
                      return {
                        name: monthStr,
                        total: total,
                        recorrente: recurring
                      };
                    })}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "#334155" : "#e2e8f0"} vertical={false} />
                      <XAxis dataKey="name" stroke={theme === 'dark' ? "#64748b" : "#475569"} fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke={theme === 'dark' ? "#64748b" : "#475569"} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `R$${value}`} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', 
                          border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0', 
                          borderRadius: '12px', 
                          fontSize: '10px',
                          color: theme === 'dark' ? '#ffffff' : '#000000'
                        }}
                        itemStyle={{ fontWeight: 'bold' }}
                      />
                      <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total" />
                      <Bar dataKey="recorrente" fill="#10b981" radius={[4, 4, 0, 0]} name="Recorrente" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
                <div className={cn(
                  "p-6 rounded-2xl border transition-all",
                  theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
                )}>
                  <h3 className="text-sm font-bold mb-4">Serviços por Categoria</h3>
                  <div className="space-y-3">
                    {['Troca de Óleo', 'Revisão', 'Pneus', 'Freios', 'Outros'].map(type => {
                      const count = maintenances.filter(m => m.serviceType === type && m.date.startsWith(format(new Date(), 'yyyy-MM'))).length;
                      const percentage = (count / (dashboardStats.servicesCount || 1)) * 100;
                      return (
                        <div key={type} className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className={theme === 'dark' ? "text-slate-400" : "text-slate-500"}>{type}</span>
                            <span className={theme === 'light' ? "text-black" : ""}>{count} ({percentage.toFixed(0)}%)</span>
                          </div>
                          <div className={cn(
                            "w-full h-1.5 rounded-full overflow-hidden",
                            theme === 'dark' ? "bg-slate-900" : "bg-slate-100"
                          )}>
                            <div className="bg-primary h-full rounded-full" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={cn(
                  "p-6 rounded-2xl border transition-all",
                  theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
                )}>
                  <h3 className="text-sm font-bold mb-4">Top Clientes (Mês)</h3>
                  <div className="space-y-3">
                    {Object.entries(
                      maintenances
                        .filter(m => m.date.startsWith(format(new Date(), 'yyyy-MM')))
                        .reduce((acc, m) => {
                          acc[m.clientName] = (acc[m.clientName] || 0) + (m.serviceValue || 0);
                          return acc;
                        }, {} as Record<string, number>)
                    )
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .slice(0, 5)
                    .map(([name, value]) => (
                      <div key={name} className={cn(
                        "flex justify-between items-center p-2 rounded-lg border",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700/30" : "bg-slate-50 border-slate-100"
                      )}>
                        <span className={cn("text-xs font-bold", theme === 'dark' ? "text-slate-300" : "text-black")}>{name}</span>
                        <span className="text-xs font-bold text-emerald-500">R$ {(value as number).toFixed(2)}</span>
                      </div>
                    ))}
                    {maintenances.filter(m => m.date.startsWith(format(new Date(), 'yyyy-MM'))).length === 0 && (
                      <p className="text-[10px] text-slate-500 text-center py-4 italic">Nenhuma atividade este mês.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'warranties' && (
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
                <h2 className="text-lg font-bold">Garantias</h2>
                <button 
                  onClick={() => { setEditingWarranty(null); setView('new-warranty'); }}
                  className="w-full md:w-auto bg-primary px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all text-xs text-white"
                >
                  <Plus className="w-3.5 h-3.5" /> Registrar Garantia
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {warranties.map(warranty => (
                  <div key={warranty.id} className={cn(
                    "p-3.5 rounded-xl border space-y-2.5 transition-all shadow-sm",
                    theme === 'dark' ? "bg-slate-800/30 border-slate-700/40" : "bg-white border-slate-200"
                  )}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                          <h3 className={cn("font-bold text-sm leading-tight", theme === 'light' && "text-black")}>{warranty.clientName}</h3>
                        </div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{warranty.serviceType}</p>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => generateWarrantyPDF(warranty)}
                          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => { setEditingWarranty(warranty); setView('new-warranty'); }}
                          className={cn(
                            "p-1.5 rounded-lg transition-all",
                            theme === 'dark' ? "bg-slate-700/50 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          )}
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => {
                            if (deleteConfirm?.id === warranty.id) {
                              handleDeleteWarranty(warranty.id);
                            } else {
                              setDeleteConfirm({ id: warranty.id, type: 'warranty' });
                            }
                          }}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            deleteConfirm?.id === warranty.id 
                              ? "bg-red-500 text-white animate-pulse" 
                              : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                          )}
                        >
                          {deleteConfirm?.id === warranty.id ? <CheckCircle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className={cn(
                      "grid grid-cols-2 gap-2 pt-2 border-t",
                      theme === 'dark' ? "border-slate-700/20" : "border-slate-100"
                    )}>
                      <div>
                        <p className="text-[8px] uppercase font-bold text-slate-500 tracking-widest">Nº</p>
                        <p className={cn("text-[10px] font-medium", theme === 'light' && "text-slate-900")}>{warranty.warrantyNumber}</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase font-bold text-slate-500 tracking-widest">Vencimento</p>
                        <p className={cn(
                          "text-[10px] font-bold",
                          calculateWarrantyStatus(warranty.expiryDate) === 'OVERDUE' ? "text-red-500" : 
                          calculateWarrantyStatus(warranty.expiryDate) === 'WARNING' ? "text-yellow-500" :
                          (theme === 'dark' ? "text-emerald-500" : "text-emerald-600")
                        )}>
                          {format(parseISO(warranty.expiryDate), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>

                    {warranty.serviceDescription && (
                      <div className={cn(
                        "pt-2 border-t",
                        theme === 'dark' ? "border-slate-700/10" : "border-slate-50"
                      )}>
                        <p className="text-[10px] text-slate-400 leading-tight line-clamp-1 italic">"{warranty.serviceDescription}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'new-warranty' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setView('warranties')} 
                  className={cn(
                    "p-1.5 rounded-full transition-colors",
                    theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-100"
                  )}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">{editingWarranty ? 'Editar Garantia' : 'Registrar Garantia'}</h2>
              </div>

              <div className={cn(
                "p-5 rounded-2xl border space-y-5 transition-all",
                theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
              )}>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    handleSaveWarranty({
                      clientName: formData.get('clientName') as string,
                      serviceType: formData.get('serviceType') as string,
                      serviceDescription: formData.get('serviceDescription') as string,
                      serviceValue: parseFloat(formData.get('serviceValue') as string),
                      serviceDate: formData.get('serviceDate') ? `${formData.get('serviceDate')}T12:00:00Z` : undefined,
                      durationMonths: parseInt(formData.get('durationMonths') as string),
                      clientPhone: formData.get('clientPhone') as string
                    });
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome do Cliente</label>
                      <input 
                        name="clientName" 
                        defaultValue={editingWarranty?.clientName} 
                        required 
                        placeholder="Ex: João Silva" 
                        className={cn(
                          "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                          theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                        )}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tipo de Serviço</label>
                        <button type="button" onClick={() => setView('settings')} className="text-[9px] text-primary hover:underline font-bold uppercase tracking-tighter">Gerenciar Lista</button>
                      </div>
                      <select 
                        name="serviceType" 
                        defaultValue={editingWarranty?.serviceType || ""} 
                        required 
                        className={cn(
                          "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                          theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black"
                        )}
                      >
                        <option value="" disabled>Selecione um serviço</option>
                        {editingWarranty?.serviceType && !settings?.warrantyCategories?.includes(editingWarranty.serviceType) && (
                          <option value={editingWarranty.serviceType}>{editingWarranty.serviceType}</option>
                        )}
                        {settings?.warrantyCategories?.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Descrição do Serviço</label>
                      <textarea 
                        name="serviceDescription" 
                        defaultValue={editingWarranty?.serviceDescription} 
                        placeholder="Detalhes adicionais do serviço" 
                        className={cn(
                          "w-full rounded-xl p-2.5 text-sm min-h-[80px] focus:ring-1 focus:ring-primary outline-none transition-all",
                          theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Valor (R$)</label>
                        <input 
                          name="serviceValue" 
                          type="number" 
                          step="0.01" 
                          defaultValue={editingWarranty?.serviceValue || 0} 
                          className={cn(
                            "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                            theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black"
                          )}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Data</label>
                        <input 
                          name="serviceDate" 
                          type="date" 
                          defaultValue={editingWarranty ? format(parseISO(editingWarranty.serviceDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} 
                          required 
                          className={cn(
                            "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                            theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black"
                          )} 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Duração (meses)</label>
                        <select 
                          name="durationMonths" 
                          defaultValue={editingWarranty?.durationMonths || 3} 
                          className={cn(
                            "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                            theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black"
                          )}
                        >
                          <option value={1}>1 mês</option>
                          <option value={3}>3 meses</option>
                          <option value={6}>6 meses</option>
                          <option value={12}>12 meses</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Telefone</label>
                        <input 
                          name="clientPhone" 
                          defaultValue={editingWarranty?.clientPhone} 
                          placeholder="(11) 98765-4321" 
                          className={cn(
                            "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                            theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="flex-1 bg-primary py-3 rounded-xl font-bold hover:bg-primary/90 transition-all text-sm shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      editingWarranty ? 'Salvar Alterações' : 'Registrar Garantia'
                    )}
                  </button>
                  <button type="button" onClick={() => setView('warranties')} className="px-6 bg-slate-700/50 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

          {view === 'client-detail' && selectedClientId && (
            <div className="space-y-6">
              {(() => {
                const client = clients.find(c => c.id === selectedClientId);
                const clientHistory = maintenances
                  .filter(m => m.clientId === selectedClientId)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (!client) return (
                  <div className="text-center py-12">
                    <p className="text-slate-400">Cliente não encontrado.</p>
                    <button onClick={() => setView('clients')} className="mt-4 text-primary font-bold underline">Voltar</button>
                  </div>
                );

                return (
                  <>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setView('clients')} 
                        className={cn(
                          "p-1.5 rounded-full transition-colors",
                          theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-100"
                        )}
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div>
                        <h2 className={cn("text-xl font-bold", theme === 'light' && "text-black")}>{client.name}</h2>
                        <p className="text-sm text-slate-500 font-medium uppercase tracking-tighter">{client.bikeModel}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className={cn(
                        "p-4 rounded-xl border transition-all shadow-sm",
                        theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200"
                      )}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status Atual</p>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            client.status === 'OK' ? 'bg-emerald-500' : 
                            client.status === 'WARNING' ? 'bg-yellow-500' : 'bg-red-500'
                          )} />
                          <p className={cn(
                            "text-base font-bold",
                            client.status === 'OK' ? 'text-emerald-500' : 
                            client.status === 'WARNING' ? 'text-yellow-500' : 'text-red-500'
                          )}>
                            {client.status === 'OK' ? 'Em dia' : 
                             client.status === 'WARNING' ? 'Atenção' : 'Atrasado'}
                          </p>
                        </div>
                      </div>
                      <div className={cn(
                        "p-4 rounded-xl border transition-all shadow-sm",
                        theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200"
                      )}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Última Manutenção</p>
                        <p className={cn("text-base font-bold", theme === 'dark' ? "text-white" : "text-black")}>{format(parseISO(client.lastMaintenanceDate), 'dd/MM/yyyy')}</p>
                      </div>
                      <div className={cn(
                        "p-4 rounded-xl border transition-all shadow-sm",
                        theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200"
                      )}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Próxima Manutenção</p>
                        <p className={cn("text-base font-bold", theme === 'dark' ? "text-white" : "text-black")}>{format(parseISO(client.nextMaintenanceDate), 'dd/MM/yyyy')}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className={cn("font-bold flex items-center gap-2", theme === 'light' && "text-black")}>
                        <History className="w-4 h-4 text-primary" />
                        Histórico Cronológico
                      </h3>

                      {clientHistory.length === 0 ? (
                        <div className={cn(
                          "text-center py-12 rounded-2xl border border-dashed",
                          theme === 'dark' ? "bg-slate-800/20 border-slate-700" : "bg-slate-50 border-slate-200"
                        )}>
                          <p className="text-slate-500 text-sm">Nenhuma manutenção registrada para este cliente.</p>
                        </div>
                      ) : (
                        <div className={cn(
                          "relative space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b",
                          theme === 'dark' ? "before:from-slate-700 before:via-slate-700 before:to-transparent" : "before:from-slate-200 before:via-slate-200 before:to-transparent"
                        )}>
                          {clientHistory.map((record, index) => (
                            <div key={record.id} className="relative flex items-start gap-6 group">
                              <div className={cn(
                                "mt-1 w-10 h-10 rounded-full border-4 z-10 flex items-center justify-center shrink-0 transition-colors shadow-lg",
                                theme === 'dark' ? "border-background-dark" : "border-background-light",
                                index === 0 ? "bg-primary text-white" : (theme === 'dark' ? "bg-slate-700 text-slate-400" : "bg-slate-200 text-slate-500")
                              )}>
                                <Wrench className="w-4 h-4" />
                              </div>
                              <div className={cn(
                                "flex-1 p-4 rounded-2xl border transition-all shadow-sm",
                                theme === 'dark' ? "bg-slate-800/30 border-slate-700/50 hover:border-primary/20" : "bg-white border-slate-200 hover:border-primary/30"
                              )}>
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-2">
                                  <div>
                                    <p className={cn("font-bold text-base", theme === 'dark' ? "text-white" : "text-black")}>{record.serviceType}</p>
                                    <p className="text-xs text-slate-500 font-medium">{format(parseISO(record.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                                  </div>
                                  <div className="bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                                    <p className="text-emerald-500 font-bold text-sm">R$ {record.serviceValue?.toFixed(2)}</p>
                                  </div>
                                </div>
                                {record.oilType && record.oilType !== 'N/A' && (
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <Droplets className="w-3 h-3 text-primary/70" />
                                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Óleo: <span className={cn(theme === 'light' && "text-slate-800")}>{record.oilType}</span></p>
                                  </div>
                                )}
                                {record.notes && (
                                  <div className={cn(
                                    "p-3 rounded-xl border",
                                    theme === 'dark' ? "bg-slate-900/40 border-slate-700/30" : "bg-slate-50 border-slate-100"
                                  )}>
                                    <p className={cn("text-xs italic", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>"{record.notes}"</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {view === 'settings' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold">Configurações</h2>
                <div 
                  className={cn(
                    "flex items-center gap-1 p-1 rounded-xl",
                    theme === 'dark' ? "bg-slate-800/50" : "bg-slate-200/50"
                  )}
                >
                  <button 
                    onClick={() => setTheme('light')}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      theme === 'light' ? "bg-white text-primary shadow-sm" : "text-slate-500"
                    )}
                  >
                    <div className="flex items-center gap-1 px-1">
                      <div className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-current rounded-full" />
                      </div>
                      <span className="text-[10px] font-bold uppercase">Claro</span>
                    </div>
                  </button>
                  <button 
                    onClick={() => setTheme('dark')}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      theme === 'dark' ? "bg-slate-700 text-white shadow-sm" : "text-slate-500"
                    )}
                  >
                    <div className="flex items-center gap-1 px-1">
                      <div className="w-3.5 h-3.5 rounded-full border border-current" />
                      <span className="text-[10px] font-bold uppercase">Escuro</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* User Profile Info */}
              <div className={cn(
                "p-4 rounded-xl border flex items-center gap-4 transition-all hover:bg-slate-800/20",
                theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
              )}>
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg",
                  theme === 'dark' ? "bg-primary/20 text-primary border border-primary/20" : "bg-primary text-white"
                )}>
                  {user?.displayName?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">{user?.displayName || 'Usuário MotoFix'}</h3>
                  <p className="text-xs text-slate-500 font-medium">{user?.email}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      userProfile?.isActive ? "bg-emerald-500" : "bg-red-500"
                    )} />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                      Status: {userProfile?.isActive ? 'Ativo' : 'Pendente'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Subscription Status (for non-admins) */}
              {userProfile?.role !== 'admin' && userProfile?.subscriptionExpiresAt && (
                <div className={cn(
                  "p-4 rounded-xl border flex items-center justify-between transition-all",
                  isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date()) 
                    ? "bg-red-500/10 border-red-500/30 text-red-500" 
                    : theme === 'dark' 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                      : "bg-emerald-50/50 border-emerald-100 text-emerald-600"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date()) ? "bg-red-500/20" : "bg-emerald-500/20"
                    )}>
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest opacity-70">Sua Assinatura</p>
                      <p className="text-sm font-bold">
                        {isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date()) 
                          ? "Expirada" 
                          : `Ativa até ${format(parseISO(userProfile.subscriptionExpiresAt), 'dd/MM/yyyy')}`}
                      </p>
                    </div>
                  </div>
                  {isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date()) && (
                    <button 
                      onClick={() => window.open('https://wa.me/5511999999999?text=Olá, gostaria de renovar minha assinatura do MotoFix', '_blank')}
                      className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-600 transition-all text-xs"
                    >
                      Renovar
                    </button>
                  )}
                </div>
              )}
              
              <div className={cn(
                "p-4 rounded-xl border space-y-4 transition-all",
                theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <Bike className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold">Perfil da Empresa</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-1",
                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                    )}>Nome da Empresa</label>
                    <input 
                      value={settings?.businessName || ''}
                      onChange={(e) => setSettings(s => s ? { ...s, businessName: e.target.value } : null)}
                      placeholder="Ex: MotoFix Centro Automotivo"
                      className={cn(
                        "w-full rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-200"
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-1",
                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                    )}>WhatsApp da Empresa</label>
                    <input 
                      value={settings?.businessPhone || ''}
                      onChange={(e) => setSettings(s => s ? { ...s, businessPhone: e.target.value } : null)}
                      placeholder="Ex: (69) 99999-9999"
                      className={cn(
                        "w-full rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-1",
                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                    )}>Instagram (@)</label>
                    <input 
                      value={settings?.businessInstagram || ''}
                      onChange={(e) => setSettings(s => s ? { ...s, businessInstagram: e.target.value } : null)}
                      placeholder="Ex: @motofix_oficial"
                      className={cn(
                        "w-full rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-1",
                      theme === 'dark' ? "text-slate-500" : "text-slate-400"
                    )}>Endereço</label>
                    <input 
                      value={settings?.businessAddress || ''}
                      onChange={(e) => setSettings(s => s ? { ...s, businessAddress: e.target.value } : null)}
                      placeholder="Rua Exemplo, 123 - Centro"
                      className={cn(
                        "w-full rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                      )}
                    />
                  </div>
                </div>
                <button 
                  onClick={async () => {
                    if (user && settings) {
                      const updatedSettings = { ...settings, isProfileComplete: !!settings.businessName };
                      await setDoc(doc(db, 'settings', user.uid), updatedSettings);
                      setSettings(updatedSettings);
                      setSaveMessage("Perfil atualizado com sucesso!");
                      setTimeout(() => setSaveMessage(null), 3000);
                    }
                  }}
                  className="w-full bg-emerald-500/10 text-emerald-500 py-2.5 rounded-lg font-bold hover:bg-emerald-500/20 transition-all border border-emerald-500/20 text-xs"
                >
                  Salvar Perfil da Empresa
                </button>
              </div>

              <div className={cn(
                "p-4 rounded-xl border space-y-4 transition-all",
                theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200 shadow-sm"
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold">Template do WhatsApp</h3>
                </div>
                <p className="text-[10px] text-slate-400">Use as tags: <code>{'{client}'}</code>, <code>{'{bike}'}</code>, <code>{'{date}'}</code></p>
                <textarea 
                  value={settings?.whatsappTemplate || ''}
                  onChange={(e) => setSettings(s => s ? { ...s, whatsappTemplate: e.target.value } : null)}
                  className={cn(
                    "w-full rounded-lg p-3 min-h-[100px] text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                    theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                  )}
                />
                <button 
                  onClick={async () => {
                    if (user && settings) {
                      try {
                        await setDoc(doc(db, 'settings', user.uid), {
                          ...settings,
                          whatsappTemplate: settings.whatsappTemplate
                        }, { merge: true });
                        setSaveMessage("Configurações salvas com sucesso!");
                        setTimeout(() => setSaveMessage(null), 3000);
                      } catch (error) {
                        handleFirestoreError(error, OperationType.UPDATE, 'settings');
                      }
                    }
                  }}
                  className="w-full bg-primary py-2.5 rounded-lg font-bold hover:bg-primary/90 transition-all text-sm"
                >
                  Salvar Configurações
                </button>
                {saveMessage && (
                  <p className="text-emerald-500 text-center text-[10px] font-bold animate-bounce">{saveMessage}</p>
                )}
              </div>

              {/* Oil Types Management */}
              <div className={cn(
                "p-6 rounded-2xl border space-y-4 transition-all",
                theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200 shadow-sm"
              )}>
                <div className="flex items-center gap-3 mb-2">
                  <Droplets className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">Tipos de Óleo Disponíveis</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {settings?.oilTypes?.map((type, index) => (
                    <div key={index} className={cn(
                      "px-3 py-1 rounded-lg border flex items-center gap-2 group",
                      theme === 'dark' ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-700 font-bold"
                    )}>
                      <span className="text-sm">{type}</span>
                      <button 
                        onClick={() => {
                          const newTypes = settings.oilTypes.filter((_, i) => i !== index);
                          setSettings({ ...settings, oilTypes: newTypes });
                        }}
                        className="text-slate-500 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    id="newOilType"
                    placeholder="Novo tipo de óleo"
                    className={cn(
                      "flex-1 rounded-xl p-2 text-sm focus:ring-primary outline-none transition-all",
                      theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black"
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val && settings && !settings.oilTypes.includes(val)) {
                          setSettings({ ...settings, oilTypes: [...settings.oilTypes, val] });
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      const input = document.getElementById('newOilType') as HTMLInputElement;
                      const val = input.value.trim();
                      if (val && settings && !settings.oilTypes.includes(val)) {
                        setSettings({ ...settings, oilTypes: [...settings.oilTypes, val] });
                        input.value = '';
                      }
                    }}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      theme === 'dark' ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                    )}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Warranty Categories Management */}
              <div className={cn(
                "p-6 rounded-2xl border space-y-4 transition-all",
                theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200 shadow-sm"
              )}>
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">Categorias de Garantia</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {settings?.warrantyCategories?.map((cat, index) => (
                    <div key={index} className={cn(
                      "px-3 py-1 rounded-lg border flex items-center gap-2 group",
                      theme === 'dark' ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-700 font-bold"
                    )}>
                      <span className="text-sm">{cat}</span>
                      <button 
                        onClick={() => {
                          const newCats = settings.warrantyCategories.filter((_, i) => i !== index);
                          setSettings({ ...settings, warrantyCategories: newCats });
                        }}
                        className="text-slate-500 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    id="newCategory"
                    placeholder="Nova categoria"
                    className={cn(
                      "flex-1 rounded-xl p-2 text-sm focus:ring-primary outline-none transition-all",
                      theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black"
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val && settings && !settings.warrantyCategories.includes(val)) {
                          setSettings({ ...settings, warrantyCategories: [...settings.warrantyCategories, val] });
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      const input = document.getElementById('newCategory') as HTMLInputElement;
                      const val = input.value.trim();
                      if (val && settings && !settings.warrantyCategories.includes(val)) {
                        setSettings({ ...settings, warrantyCategories: [...settings.warrantyCategories, val] });
                        input.value = '';
                      }
                    }}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      theme === 'dark' ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                    )}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                <h3 className="font-bold mb-4">Sobre o App</h3>
                <p className="text-sm text-slate-400">MotoFix Recorrentes v2.0</p>
                <p className="text-sm text-slate-400">Desenvolvido para gerenciamento de troca de óleo e garantias de serviço.</p>
                <p className="text-xs text-slate-500 mt-4">Todos os direitos reservados.</p>
              </div>
            </div>
          )}

          {view === 'new-client' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setView('clients')} 
                  className={cn(
                    "p-1.5 rounded-full transition-colors",
                    theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-100"
                  )}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">{isNewService ? 'Registrar Serviço' : editingClient ? 'Editar Cliente' : 'Registrar Serviço'}</h2>
              </div>

              <div className={cn(
                "p-5 rounded-2xl border space-y-5 transition-all shadow-sm",
                theme === 'dark' ? "bg-slate-800/40 border-slate-700/50" : "bg-white border-slate-200"
              )}>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    handleSaveClient({
                      name: formData.get('name') as string,
                      bikeModel: formData.get('bikeModel') as string,
                      contact: formData.get('contact') as string,
                      oilType: formData.get('oilType') as string,
                      oilPrice: parseFloat(formData.get('oilPrice') as string) || 0,
                      serviceType: formData.get('serviceType') as string,
                      serviceValue: parseFloat(formData.get('serviceValue') as string) || 0,
                      isRecurringRevenue: formData.get('isRecurringRevenue') === 'on',
                      recurrenceDays: parseInt(formData.get('recurrenceDays') as string) || 29,
                      lastMaintenanceDate: formData.get('lastMaintenanceDate') ? `${formData.get('lastMaintenanceDate')}T12:00:00Z` : undefined,
                      notes: formData.get('notes') as string
                    });
                  }}
                  className="space-y-4"
                >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome do Cliente</label>
                    <input 
                      name="name" 
                      defaultValue={editingClient?.name} 
                      required 
                      placeholder="Ex: João Silva" 
                      className={cn(
                        "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">WhatsApp</label>
                    <input 
                      name="contact" 
                      defaultValue={editingClient?.contact} 
                      required 
                      placeholder="Ex: (69) 99999-9999" 
                      onChange={(e) => {
                        const val = e.target.value;
                        const numeric = val.replace(/\D/g, '');
                        let formatted = numeric;
                        if (numeric.length > 2) {
                          formatted = `(${numeric.slice(0, 2)}) ${numeric.slice(2)}`;
                        }
                        if (numeric.length > 7) {
                          formatted = `(${numeric.slice(0, 2)}) ${numeric.slice(2, 7)}-${numeric.slice(7, 11)}`;
                        }
                        e.target.value = formatted;
                      }}
                      className={cn(
                        "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Modelo da Moto</label>
                    <input 
                      name="bikeModel" 
                      defaultValue={editingClient?.bikeModel} 
                      required 
                      placeholder="Ex: Honda CG 160" 
                      className={cn(
                        "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Tipo de Serviço</label>
                    <select 
                      name="serviceType" 
                      defaultValue={editingClient?.oilType === 'Revisão' ? 'Revisão' : 'Troca de Óleo'} 
                      className={cn(
                        "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                      )}
                    >
                      <option value="Troca de Óleo">Troca de Óleo</option>
                      <option value="Revisão">Revisão</option>
                      <option value="Pneus">Pneus</option>
                      <option value="Freios">Freios</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Valor do Serviço (R$)</label>
                    <input 
                      name="serviceValue" 
                      type="number" 
                      step="0.01" 
                      defaultValue={editingClient?.oilPrice || 0} 
                      required 
                      className={cn(
                        "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Data do Serviço</label>
                    <input 
                      name="lastMaintenanceDate" 
                      type="date" 
                      defaultValue={editingClient ? format(parseISO(editingClient.lastMaintenanceDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} 
                      required 
                      className={cn(
                        "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black"
                      )} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Recorrência (Dias)</label>
                    <input 
                      name="recurrenceDays" 
                      type="number" 
                      defaultValue={editingClient?.recurrenceDays || 29} 
                      required 
                      className={cn(
                        "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                      )}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input 
                      name="isRecurringRevenue" 
                      type="checkbox" 
                      defaultChecked={editingClient?.isRecurringRevenue ?? true} 
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary" 
                    />
                    <label className={cn("text-xs font-bold", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>Receita Recorrente</label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Observações</label>
                  <textarea 
                    name="notes" 
                    placeholder="Detalhes adicionais do serviço..." 
                    className={cn(
                      "w-full rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none h-20 transition-all",
                      theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black placeholder:text-slate-400"
                    )}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="flex-1 bg-primary py-3 rounded-xl font-bold hover:bg-primary/90 transition-all text-sm shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      editingClient ? 'Salvar Alterações' : 'Registrar Serviço'
                    )}
                  </button>
                  <button type="button" onClick={() => setView('clients')} className="px-6 bg-slate-700/50 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
          {view === 'admin' && userProfile?.role === 'admin' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Painel Administrativo</h2>
                <div className="bg-primary/10 px-3 py-1 rounded-full flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-primary">ADMIN</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {allUsers.map(u => (
                  <div key={u.uid} className={cn(
                    "p-5 rounded-2xl border flex items-center justify-between transition-all shadow-sm",
                    theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        u.isActive ? "bg-emerald-500/10" : "bg-red-500/10"
                      )}>
                        {u.isActive ? <UserCheck className="w-6 h-6 text-emerald-500" /> : <UserX className="w-6 h-6 text-red-500" />}
                      </div>
                      <div>
                        <p className={cn("font-bold", theme === 'light' && "text-black")}>{u.displayName}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                        <div className="flex flex-col gap-1 mt-1">
                          <p className="text-[10px] text-slate-600 font-medium">Desde: {format(parseISO(u.createdAt), 'dd/MM/yyyy')}</p>
                          {u.subscriptionExpiresAt && (
                            <p className={cn(
                              "text-[10px] font-bold",
                              isBefore(parseISO(u.subscriptionExpiresAt), new Date()) ? "text-red-500" : (theme === 'dark' ? "text-emerald-500" : "text-emerald-600")
                            )}>
                              Expira: {format(parseISO(u.subscriptionExpiresAt), 'dd/MM/yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest",
                          u.isActive ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500"
                        )}>
                          {u.isActive ? 'Ativo' : 'Bloqueado'}
                        </div>
                        {u.uid !== user.uid && (
                          <button 
                            onClick={() => toggleUserStatus(u)}
                            className={cn(
                              "p-2 rounded-lg transition-all",
                              u.isActive ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                            )}
                          >
                            {u.isActive ? <Lock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                          </button>
                        )}
                      </div>
                      
                      {/* Subscription Quick Actions */}
                      {u.uid !== user.uid && (
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex flex-wrap justify-end gap-1 max-w-[150px]">
                            <button 
                              onClick={() => updateSubscription(u.uid, -30)}
                              className={cn(
                                "px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-[10px] font-bold rounded text-red-500 transition-colors border",
                                theme === 'dark' ? "border-red-500/20" : "border-red-500/30"
                              )}
                              title="Remover 30 dias"
                            >
                              -30d
                            </button>
                            <button 
                              onClick={() => updateSubscription(u.uid, -7)}
                              className={cn(
                                "px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-[10px] font-bold rounded text-red-500 transition-colors border",
                                theme === 'dark' ? "border-red-500/20" : "border-red-500/30"
                              )}
                              title="Remover 7 dias"
                            >
                              -7d
                            </button>
                            <button 
                              onClick={() => updateSubscription(u.uid, 30)}
                              className={cn(
                                "px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] font-bold rounded text-emerald-500 transition-colors border",
                                theme === 'dark' ? "border-emerald-500/20" : "border-emerald-500/30"
                              )}
                              title="Adicionar 30 dias"
                            >
                              +30d
                            </button>
                            <button 
                              onClick={() => updateSubscription(u.uid, 90)}
                              className={cn(
                                "px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] font-bold rounded text-emerald-500 transition-colors border",
                                theme === 'dark' ? "border-emerald-500/20" : "border-emerald-500/30"
                              )}
                              title="Adicionar 90 dias"
                            >
                              +90d
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Vencimento:</span>
                            <input 
                              type="date" 
                              className={cn(
                                "border rounded px-2 py-1 text-[10px] focus:ring-1 focus:ring-primary outline-none transition-all",
                                theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-black"
                              )}
                              defaultValue={u.subscriptionExpiresAt ? format(parseISO(u.subscriptionExpiresAt), 'yyyy-MM-dd') : ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  setSubscriptionDate(u.uid, e.target.value);
                                }
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Bottom Nav */}
        <nav className={cn(
          "fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t px-6 py-2 z-50 transition-colors",
          theme === 'dark' ? "bg-background-dark/95 border-slate-800/50" : "bg-white/95 border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]"
        )}>
          <div className="max-w-md mx-auto flex justify-between items-center">
            <button 
              onClick={() => setView('dashboard')}
              className={cn(
                "flex flex-col items-center gap-0.5 transition-all text-slate-500", 
                view === 'dashboard' && 'text-primary scale-110'
              )}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-tighter">Início</span>
            </button>
            <button 
              onClick={() => setView('clients')}
              className={cn(
                "flex flex-col items-center gap-0.5 transition-all text-slate-500", 
                view === 'clients' && 'text-primary scale-110'
              )}
            >
              <Users className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-tighter">Serviços</span>
            </button>
            {userProfile?.role === 'admin' ? (
              <button 
                onClick={() => setView('admin')}
                className={cn(
                  "flex flex-col items-center gap-0.5 transition-all text-slate-500", 
                  view === 'admin' && 'text-primary scale-110'
                )}
              >
                <Shield className="w-5 h-5" />
                <span className="text-[9px] font-bold uppercase tracking-tighter">Admin</span>
              </button>
            ) : (
              <button 
                onClick={() => setView('warranties')}
                className={cn(
                  "flex flex-col items-center gap-0.5 transition-all text-slate-500", 
                  view === 'warranties' && 'text-primary scale-110'
                )}
              >
                <ShieldCheck className="w-5 h-5" />
                <span className="text-[9px] font-bold uppercase tracking-tighter">Garantias</span>
              </button>
            )}
            <button 
              onClick={() => setView('history')}
              className={cn(
                "flex flex-col items-center gap-0.5 transition-all text-slate-500", 
                view === 'history' && 'text-primary scale-110'
              )}
            >
              <History className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-tighter">Histórico</span>
            </button>
            <button 
              onClick={() => setView('settings')}
              className={cn(
                "flex flex-col items-center gap-0.5 transition-all text-slate-500", 
                view === 'settings' && 'text-primary scale-110'
              )}
            >
              <SettingsIcon className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-tighter">Ajustes</span>
            </button>
          </div>
        </nav>

        {/* First Login Profile Setup Modal */}
        {settings && !settings.isProfileComplete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-800 w-full max-w-md rounded-3xl border border-primary/30 p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="bg-primary/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
                <Bike className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Bem-vindo ao MotoFix!</h2>
              <p className="text-slate-400 mb-8">Para começar, precisamos de alguns dados da sua empresa para os certificados de garantia.</p>
              
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const businessName = formData.get('businessName') as string;
                  if (!businessName) return;

                  const updatedSettings = {
                    ...settings,
                    businessName,
                    businessPhone: formData.get('businessPhone') as string,
                    businessInstagram: formData.get('businessInstagram') as string,
                    businessAddress: formData.get('businessAddress') as string,
                    isProfileComplete: true
                  };
                  
                  if (user) {
                    await setDoc(doc(db, 'settings', user.uid), updatedSettings);
                    setSettings(updatedSettings);
                  }
                }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome da Empresa</label>
                  <input name="businessName" required placeholder="Ex: MotoFix Centro Automotivo" className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">WhatsApp</label>
                  <input name="businessPhone" placeholder="Ex: (69) 99999-9999" className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Instagram (@)</label>
                  <input name="businessInstagram" placeholder="Ex: @motofix_oficial" className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Endereço</label>
                  <input name="businessAddress" placeholder="Rua Exemplo, 123 - Centro" className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary" />
                </div>
                <button type="submit" className="w-full bg-primary py-4 rounded-2xl font-bold text-white mt-4 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                  Concluir Cadastro
                </button>
              </form>
            </div>
          </div>
        )}
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
