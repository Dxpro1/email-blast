import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Mail, 
  Users, 
  Send, 
  History, 
  Sparkles, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronRight,
  FileUp,
  BookOpen,
  Info,
  LogOut,
  User as UserIcon,
  RefreshCw,
  AlertTriangle,
  Search,
  LayoutDashboard,
  TrendingUp,
  Clock,
  Shield,
  Lock,
  UserPlus,
  UserCheck,
  Calendar,
  Edit2,
  Pause,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Toaster } from 'sonner';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { auth, db, signInWithGoogle, signInWithEmailAndPassword, createUserWithEmailAndPassword, checkConnection, getSecondaryAuth, getSecondaryDb, sendPasswordResetEmail, sendEmailVerification } from './lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, setDoc, getDocs, where } from 'firebase/firestore';

// Initialize Gemini is handled server-side to protect keys and prevent browser environment crashes

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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  toast.error("Database error. Please try again.");
}

interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'super_admin' | 'user';
  status: 'active' | 'pending' | 'inactive';
  createdAt?: any;
}

interface Contact {
  id: string;
  email: string;
  name?: string;
  // Dynamic fields from CSV
  [key: string]: any;
}

interface BlastHistory {
  id: string;
  timestamp: string;
  subject: string;
  body: string;
  recipientCount: number;
  status: 'success' | 'failed' | 'partial' | 'in_progress' | 'scheduled';
  successCount?: number;
  failedCount?: number;
  failedContacts?: Contact[];
  recipients?: Array<{ email: string; name?: string }>;
  rawContacts?: Contact[];
}

const TEMPLATES = [
  {
    id: 'insurance',
    name: 'INSURANCE',
    subject: 'Insurance Expiry Notice - Encore Leasing & Finance Corp.',
    body: `Hi Ma'am/Sir #firstname we would like to inform you that the insurance of your vehicle(s) mortgaged to us is due to expire. To ensure your continued, protection Encore Leasing & Finance Corp. shall renew the insurance policy of your vehicle if you failed to provide your own insurance policy 5 working days before expiry with details given below: 

Year Model: #yearmodel
Unit : #unit 
Plate No. : #plate 
Expiry Date : #expiry

Should you have any clarification or require further assistance, you may call or text (044) 940-5625 or 0919-067-7719`
  },
  {
    id: 'pdc',
    name: 'PDC',
    subject: 'PDC Reminder - Encore Leasing & Finance Corp.',
    body: `Hi Ma'am/Sir , #firstname just a gentle reminder from Encore Leasing and Finance Corp., that your issued check for insurance payment amounting to #amount  will be deposited on #ddate. If there is no issued check, kindly settie insurance premium via Gcash, 7/11, Maya, Cebuana Lhuilier, ECPay, & BDO. In case of non-payment of insurance premium to ELFC, the company shall apply your payment of the monthly loan amortization to the unpaid insurance premium.

Should you have any clarification, you may call or text (044) 940-5625 or 0919-0677719.`
  },
  {
    id: 'releases',
    name: 'Booked Accounts / Releases',
    subject: 'Thank You - Encore Leasing & Finance Corp.',
    body: `Maraming Salamat #firstname! Masaya po kami na kayo ay aming napagsilbihan. Encore Leasing & Finance Corp.`
  },
  {
    id: 'birthday',
    name: 'Birthday',
    subject: 'Happy Birthday!',
    body: `Happy Birthday #firstname! We wanted to take a moment to send you our warmest wishes. We hope your special day is filled with joy, laughter, and everything you love. Warmest regards from your Encore Leasing & Finance Corp. Family!`
  },
  {
    id: 'due_date',
    name: 'Due Date',
    subject: 'Payment Reminder - Encore Leasing & Finance Corp.',
    body: `Good Day Ms./Mr. #firstname, Just a gentle reminder that your monthly amortization amounting to #periodicins PHP is due on #ddate. Kindly settle your amortization on time to avoid penalties. For inquiries, call us at  0919-077-2664. If payment has been made, please disregard this message`
  }
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<AppUser | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loadingAllUsers, setLoadingAllUsers] = useState(false);
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRefreshingAnalytics, setIsRefreshingAnalytics] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(isPaused);
  
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);
  
  const [blastProgress, setBlastProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [blastQueue, setBlastQueue] = useState<{
    totalBatches: number;
    currentBatchIndex: number;
    status: 'idle' | 'sending' | 'paused' | 'completed' | 'error';
    batches: {
      status: 'pending' | 'processing' | 'completed' | 'error';
      batchNum: number;
      size: number;
    }[];
  } | null>(null);
  const [history, setHistory] = useState<BlastHistory[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<BlastHistory | null>(null);
  const [selectedHistoryRecipientIndex, setSelectedHistoryRecipientIndex] = useState<number>(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [configStatus, setConfigStatus] = useState<{ hasSmtpConfig: boolean; smtpWorking?: boolean; smtpError?: string; hasGeminiKey: boolean } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);

  const isSuperAdmin = userProfile?.role === 'super_admin' || user?.email?.toLowerCase() === 'encorefinancials@gmail.com';

  // User Creation State
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [createUserName, setCreateUserName] = useState('');
  const [createUserEmail, setCreateUserEmail] = useState('');
  const [createUserPassword, setCreateUserPassword] = useState('');
  const [createUserRole, setCreateUserRole] = useState<'super_admin' | 'user'>('user');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // User Editing State
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [editUserName, setEditUserName] = useState('');
  const [editUserRole, setEditUserRole] = useState<'super_admin' | 'user'>('user');
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importedFileName, setImportedFileName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});

  const dashboardStats = useMemo(() => {
    let totalSent = 0;
    let totalFailed = 0;
    history.forEach(item => {
      totalSent += item.successCount ?? (item.status === 'success' || !item.status ? item.recipientCount : 0);
      totalFailed += item.failedCount ?? (item.status === 'failed' ? item.recipientCount : 0);
    });
    const totalAttempted = totalSent + totalFailed;
    const successRate = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 100;
    
    return {
      totalSent,
      totalFailed,
      totalAttempted,
      successRate,
      campaignsCount: history.length,
      currentRecipientsCount: contacts.length
    };
  }, [history, contacts]);

  const blastAnalytics = useMemo(() => {
    const monthlyVolume: Record<string, { month: string, sent: number }> = {};
    const templateUsage: Record<string, number> = {};

    history.forEach(item => {
      const dateStr = item.createdAt || item.timestamp;
      const dateObj = new Date(dateStr);
      if (!isNaN(dateObj.getTime())) {
        const monthKey = dateObj.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        if (!monthlyVolume[monthKey]) {
          monthlyVolume[monthKey] = { month: monthKey, sent: 0 };
        }
        monthlyVolume[monthKey].sent += (item.successCount ?? (item.status === 'success' || !item.status ? item.recipientCount : 0));
      }

      const subject = item.subject || '(No Subject)';
      templateUsage[subject] = (templateUsage[subject] || 0) + 1;
    });

    const sortedMonths = Object.values(monthlyVolume).sort((a, b) => {
      return new Date(a.month).getTime() - new Date(b.month).getTime();
    });

    const topTemplates = Object.entries(templateUsage)
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      monthlyVolume: sortedMonths,
      topTemplates
    };
  }, [history]);

  const refreshAnalytics = async () => {
    if (!user || dbConnected !== true) return;
    setIsRefreshingAnalytics(true);
    try {
      const historyPath = `users/${user.uid}/history`;
      const qHistory = query(collection(db, historyPath), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(qHistory);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BlastHistory));
      setHistory(list);
      localStorage.setItem(`encore_history_${user.uid}`, JSON.stringify(list));
      toast.success("Analytics data refreshed successfully");
    } catch (err) {
      console.error("Failed to refresh history", err);
      toast.error("Failed to refresh analytics data");
    } finally {
      setIsRefreshingAnalytics(false);
    }
  };

  const handleRetryFailedEmails = (historyItem?: BlastHistory) => {
    const targetHistory = historyItem || selectedHistory;
    if (!targetHistory) return;
    
    const failedRawContacts = targetHistory.rawContacts?.filter(c => c.status === 'failed') || [];
    const legacyFailedContacts = targetHistory.failedContacts || [];
    
    const contactsToRetry = failedRawContacts.length > 0 ? failedRawContacts : legacyFailedContacts;
    
    if (contactsToRetry.length === 0) {
      toast.error("No failed contacts found to retry.");
      return;
    }

    if (confirm(`This will discard your current draft and load ${contactsToRetry.length} failed contact(s) into the Compose tab. Proceed?`)) {
      setContacts(contactsToRetry);
      setSubject(targetHistory.subject);
      setBody(targetHistory.body);
      setActiveTab('compose');
      setSelectedHistory(null);
      toast.success(`Loaded ${contactsToRetry.length} failed contact(s). Ready to send.`);
    }
  };

  const saveLocalContacts = (list: Contact[]) => {
    if (user) {
      localStorage.setItem(`encore_contacts_${user.uid}`, JSON.stringify(list));
      setContacts(list);
    }
  };

  const saveLocalHistory = (list: BlastHistory[]) => {
    if (user) {
      localStorage.setItem(`encore_history_${user.uid}`, JSON.stringify(list));
      setHistory(list);
    }
  };

  const [retryLoading, setRetryLoading] = useState(false);

  const triggerConnectionCheck = async () => {
    setRetryLoading(true);
    try {
      const isConnected = await checkConnection();
      setDbConnected(isConnected);
    } catch (e) {
      setDbConnected(false);
    } finally {
      setRetryLoading(false);
    }
  };

  // 2. Entity Validations
  useEffect(() => {
    triggerConnectionCheck();

    // Periodically re-check connection state if currently disconnected (or not verified yet)
    const interval = setInterval(async () => {
      const isConnected = await checkConnection();
      setDbConnected(isConnected);
      if (isConnected) {
        clearInterval(interval);
      }
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  // Auth State and User Access Profile Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      
      if (!u) {
        setUserProfile(null);
        setCheckingProfile(false);
        setAuthLoading(false);
        return;
      }

      if (!u.emailVerified) {
        // Skip Firestore operations to avoid permission errors if rules enforce emailVerified
        setCheckingProfile(false);
        setAuthLoading(false);
        return;
      }

      setCheckingProfile(true);

      const isBootstrappedAdmin = u.email?.toLowerCase() === 'encorefinancials@gmail.com';
      const userDocRef = doc(db, 'users', u.uid);

      if (dbConnected === false) {
        // Offline / cached fallback
        const cached = localStorage.getItem(`encore_profile_${u.uid}`);
        if (cached) {
          try {
            setUserProfile(JSON.parse(cached));
          } catch (_) {}
        } else {
          setUserProfile({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName || 'Team Member',
            photoURL: u.photoURL || '',
            role: isBootstrappedAdmin ? 'super_admin' : 'user',
            status: isBootstrappedAdmin ? 'active' : 'pending'
          });
        }
        setCheckingProfile(false);
        setAuthLoading(false);
        return;
      }

      // Realtime listener for the user profile
      const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const profile: AppUser = {
            uid: u.uid,
            email: u.email || data.email,
            displayName: u.displayName || data.displayName,
            photoURL: u.photoURL || data.photoURL,
            role: data.role || (isBootstrappedAdmin ? 'super_admin' : 'user'),
            status: data.status || (isBootstrappedAdmin ? 'active' : 'pending'),
            createdAt: data.createdAt
          };
          setUserProfile(profile);
          localStorage.setItem(`encore_profile_${u.uid}`, JSON.stringify(profile));
          
          // Auto-update super_admin role for bootstrapped admin if not set
          if (isBootstrappedAdmin && (data.role !== 'super_admin' || data.status !== 'active')) {
            setDoc(userDocRef, { role: 'super_admin', status: 'active' }, { merge: true }).catch(console.warn);
          }
          setCheckingProfile(false);
          setAuthLoading(false);
        } else {
          // Document doesn't exist yet. Check if whitelisted by email.
          const q = query(collection(db, 'users'), where('email', '==', u.email));
          getDocs(q).then((snap) => {
            let whitelistedDoc: any = null;
            let tempDocId: string | null = null;
            snap.forEach((doc) => {
              if (!doc.data().uid) {
                whitelistedDoc = doc.data();
                tempDocId = doc.id;
              }
            });

            const initialProfile: AppUser = {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName || whitelistedDoc?.displayName || 'Team Member',
              photoURL: u.photoURL || '',
              role: whitelistedDoc?.role || (isBootstrappedAdmin ? 'super_admin' : 'user'),
              status: whitelistedDoc?.status || (isBootstrappedAdmin ? 'active' : 'pending'),
            };

            setDoc(userDocRef, {
              ...initialProfile,
              createdAt: whitelistedDoc?.createdAt || serverTimestamp(),
              updatedAt: serverTimestamp()
            }, { merge: true })
            .then(() => {
              if (tempDocId) {
                deleteDoc(doc(db, 'users', tempDocId)).catch(console.warn);
              }
            })
            .catch((err) => {
              console.warn("Could not write user profile automatically:", err);
              // Set local profile so user can proceed
              setUserProfile(initialProfile);
              setCheckingProfile(false);
              setAuthLoading(false);
            });
          }).catch((err) => {
            console.warn("Querying email whitelist failed (likely rules):", err);
            // Fallback: create fresh document
            const initialProfile: AppUser = {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName || 'Team Member',
              photoURL: u.photoURL || '',
              role: isBootstrappedAdmin ? 'super_admin' : 'user',
              status: isBootstrappedAdmin ? 'active' : 'pending',
            };
            setDoc(userDocRef, {
              ...initialProfile,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            }, { merge: true }).then(() => {
              setUserProfile(initialProfile);
              setCheckingProfile(false);
              setAuthLoading(false);
            }).catch((e) => {
              console.warn("Could not create fresh profile doc:", e);
              setUserProfile(initialProfile);
              setCheckingProfile(false);
              setAuthLoading(false);
            });
          });
        }
      }, (err: any) => {
        console.warn("Error listening to user profile snapshots:", err);
        // Fallback: use local or bootstrapped profile
        const cached = localStorage.getItem(`encore_profile_${u.uid}`);
        if (cached) {
          try {
            setUserProfile(JSON.parse(cached));
          } catch (_) {}
        } else {
          setUserProfile({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName || 'Team Member',
            photoURL: u.photoURL || '',
            role: isBootstrappedAdmin ? 'super_admin' : 'user',
            status: isBootstrappedAdmin ? 'active' : 'pending'
          });
        }
        setCheckingProfile(false);
        setAuthLoading(false);
      });

      return () => unsubProfile();
    });

    return () => unsubscribe();
  }, [dbConnected]);

  // Fetch Config
  useEffect(() => {
    fetch('/api/config-status')
      .then(res => res.json())
      .then(setConfigStatus)
      .catch(console.error);
  }, []);

  // Firestore Listeners & Local Fallback
  useEffect(() => {
    if (!user || userProfile?.status !== 'active') {
      setContacts([]);
      setHistory([]);
      return;
    }

    const localContactsKey = `encore_contacts_${user.uid}`;
    const localHistoryKey = `encore_history_${user.uid}`;

    if (dbConnected === false) {
      // Offline fallback: read from local storage
      const cachedContacts = localStorage.getItem(localContactsKey);
      if (cachedContacts) {
        try { setContacts(JSON.parse(cachedContacts)); } catch (_) {}
      }
      const cachedHistory = localStorage.getItem(localHistoryKey);
      if (cachedHistory) {
        try { setHistory(JSON.parse(cachedHistory)); } catch (_) {}
      }
      return;
    }

    if (dbConnected !== true) return; // Keep waiting for connection state to resolve

    const contactsPath = `users/${user.uid}/contacts`;
    const unsubContacts = onSnapshot(collection(db, contactsPath), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact));
      setContacts(list);
      localStorage.setItem(localContactsKey, JSON.stringify(list));
    }, (err) => {
      console.warn("Contacts subscription failed, using local storage fallback", err);
      const cachedContacts = localStorage.getItem(localContactsKey);
      if (cachedContacts) {
        try { setContacts(JSON.parse(cachedContacts)); } catch (_) {}
      }
    });

    const historyPath = `users/${user.uid}/history`;
    const qHistory = query(collection(db, historyPath), orderBy('createdAt', 'desc'));
    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BlastHistory));
      setHistory(list);
      localStorage.setItem(localHistoryKey, JSON.stringify(list));
    }, (err) => {
      console.warn("History subscription failed, using local storage fallback", err);
      const cachedHistory = localStorage.getItem(localHistoryKey);
      if (cachedHistory) {
        try { setHistory(JSON.parse(cachedHistory)); } catch (_) {}
      }
    });

    return () => {
      unsubContacts();
      unsubHistory();
    };
  }, [user, dbConnected, userProfile]);

  // Super Admin: Live list of all portal users
  useEffect(() => {
    if (!user || userProfile?.role !== 'super_admin' || dbConnected !== true) {
      setAllUsers([]);
      return;
    }

    setLoadingAllUsers(true);
    const usersCollectionRef = collection(db, 'users');
    const qUsers = query(usersCollectionRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(qUsers, (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          uid: doc.id,
          email: data.email || null,
          displayName: data.displayName || null,
          photoURL: data.photoURL || null,
          role: data.role || 'user',
          status: data.status || 'pending',
          createdAt: data.createdAt
        } as AppUser;
      });
      setAllUsers(list);
      setLoadingAllUsers(false);
    }, (error) => {
      console.warn("Error listening to all users (offline warning or rules delay):", error);
      setLoadingAllUsers(false);
    });

    return () => unsubscribe();
  }, [user, userProfile, dbConnected]);

  const handleTemplateSelect = (templateId: string) => {
    const template = TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
      toast.success(`Template "${template.name}" applied`);
    }
  };

  // Super Admin: access control and searching filters
  const filteredUsers = useMemo(() => {
    return allUsers.filter(u => {
      const q = userSearchQuery.toLowerCase();
      return (
        u.email?.toLowerCase().includes(q) ||
        u.displayName?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q) ||
        u.status?.toLowerCase().includes(q)
      );
    });
  }, [allUsers, userSearchQuery]);

  const handleToggleUserStatus = async (targetUser: AppUser) => {
    if (targetUser.uid === user?.uid) {
      toast.error("You cannot disable your own Super Admin access.");
      return;
    }
    const nextStatus = targetUser.status === 'active' ? 'inactive' : 'active';
    try {
      await setDoc(doc(db, 'users', targetUser.uid), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast.success(`Access updated: ${targetUser.email} is now ${nextStatus === 'active' ? 'ACTIVE' : 'SUSPENDED'}`);
    } catch (err) {
      console.error("Error setting user status:", err);
      toast.error("Failed to update user status");
    }
  };

  const handleAddTeamMemberByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamEmail) {
      toast.error("Please enter a valid email address.");
      return;
    }
    const emailLower = newTeamEmail.trim().toLowerCase();
    
    // Check if user is already present in our loaded collection
    if (allUsers.some(u => u.email?.toLowerCase() === emailLower)) {
      toast.error("This email address is already registered or whitelisted.");
      return;
    }

    try {
      // Create a temporary document labeled with 'invite_random'
      const userDocName = `invite_${Math.random().toString(36).substring(2, 11)}`;
      await setDoc(doc(db, 'users', userDocName), {
        email: emailLower,
        displayName: newTeamName.trim() || 'Team Member',
        status: 'active',
        role: 'user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success(`${emailLower} has been whitelisted and pre-approved!`);
      setNewTeamEmail('');
      setNewTeamName('');
    } catch (err) {
      console.error("Error writing whitelist document:", err);
      toast.error("Failed to whitelist email.");
    }
  };

  const handleDeleteUserRecord = async (targetUser: AppUser) => {
    if (targetUser.uid === user?.uid) {
      toast.error("You cannot delete your own Super Admin access.");
      return;
    }
    if (!window.confirm(`Are you sure you want to completely delete and revoke portal access for ${targetUser.email || targetUser.displayName}?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', targetUser.uid));
      toast.success("User access deleted successfully.");
    } catch (err) {
      console.error("Error deleting user doc:", err);
      toast.error("Failed to delete user profile.");
    }
  };

  const formatToLongDate = (dateStr: string) => {
    if (!dateStr) return dateStr;
    const normalizedDateStr = dateStr.replace(/-/g, '/');
    const parsed = new Date(normalizedDateStr);
    if (isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleResendActivation = async (email: string) => {
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success(`Password reset / activation email sent to ${email}`);
    } catch (err: any) {
      console.error("Failed to send activation email:", err);
      toast.error(err.message || 'Failed to send activation email');
    }
  };

  const handleUpdateUser = async () => {
    if (!editUserName || !editingUserId) {
      toast.error('Name is required.');
      return;
    }
    
    setIsUpdatingUser(true);
    try {
      await setDoc(doc(db, 'users', editingUserId), {
        displayName: editUserName,
        role: editUserRole,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      toast.success('User updated successfully');
      setIsEditUserOpen(false);
    } catch (e: any) {
      console.error("Failed to update user:", e);
      toast.error(e.message || "Failed to update user");
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createUserName || !createUserEmail || !createUserPassword) {
      toast.error('Name, Email, and Password are required.');
      return;
    }
    if (createUserPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    setIsCreatingUser(true);
    try {
      const secAuth = getSecondaryAuth();
      const userCredential = await createUserWithEmailAndPassword(secAuth, createUserEmail, createUserPassword);

      const newUserId = userCredential.user.uid;
      try {
        await setDoc(doc(db, 'users', newUserId), {
          uid: newUserId,
          email: createUserEmail.toLowerCase(),
          displayName: createUserName,
          role: createUserRole,
          status: 'active',
          createdAt: new Date().toISOString()
        });
      } catch (e: any) {
        console.warn("Could not pre-create user profile document.", e);
        toast.error(`Database Error: ${e.message}. If this persists, please Sign Out and Sign In again.`);
      }

      const greetingLine = `Hi ${createUserName},`;
      const emailBody = `${greetingLine}
        
Your new account for the Encore Leasing & Finance Corp. portal has been created.
        
Login URL: ${window.location.origin}
Your Login Email: ${createUserEmail}
Your Temporary Password: ${createUserPassword}
        
Please log in and change your password as soon as possible.
        
Warmest regards,
Encore Portal Admin`;

      const formattedHtml = emailBody.replace(/\n/g, '<br/>');

      try {
        await fetch('/api/send-blast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              to: createUserEmail,
              subject: 'Your New Account - Encore Portal',
              body: formattedHtml
            }]
          })
        });
      } catch (err) {
        console.error("Failed to send welcome email:", err);
        toast.error("Account created, but failed to send welcome email.");
      }

      toast.success(`User ${createUserName} created successfully!`);
      setIsCreateUserOpen(false);
      setCreateUserName('');
      setCreateUserEmail('');
      setCreateUserPassword('');
      setCreateUserRole('user');
    } catch (err: any) {
      console.error("Error creating user:", err);
      if (err.code === 'auth/email-already-in-use') {
        toast.error('This email is already registered.');
      } else if (err.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please try again later.');
      } else {
        toast.error(err.message || 'Failed to create user account');
      }
    } finally {
      setIsCreatingUser(false);
      try {
        await signOut(getSecondaryAuth());
      } catch (e) {}
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = results.meta.fields || [];
        setCsvHeaders(fields);
        setCsvData(results.data);
        
        const initialMapping: Record<string, string> = {
          email: '', name: '', firstname: '', yearmodel: '', 
          unit: '', plate: '', expiry: '', amount: '', 
          ddate: '', periodicins: ''
        };

        fields.forEach(f => {
          const cleanF = f.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          if (!initialMapping.email && (cleanF.includes('email') || cleanF.includes('emailaddress') || cleanF === 'to' || cleanF === 'recipient' || cleanF === 'contact')) {
             initialMapping.email = f;
          }
          if (!initialMapping.firstname && (cleanF.includes('firstname') || cleanF.includes('first') || cleanF.includes('givenname') || cleanF.includes('given'))) {
             initialMapping.firstname = f;
          }
          if (!initialMapping.name && (cleanF.includes('name') && !cleanF.includes('first'))) {
             initialMapping.name = f;
          }
          if (!initialMapping.yearmodel && (cleanF.includes('yearmodel') || cleanF.includes('model') || cleanF.includes('year'))) {
             initialMapping.yearmodel = f;
          }
          if (!initialMapping.unit && (cleanF.includes('unit') || cleanF.includes('vehicle') || cleanF.includes('car'))) {
             initialMapping.unit = f;
          }
          if (!initialMapping.plate && cleanF.includes('plate')) {
             initialMapping.plate = f;
          }
          if (!initialMapping.expiry && (cleanF.includes('expiry') || cleanF.includes('expire') || cleanF.includes('expiration'))) {
             initialMapping.expiry = f;
          }
          if (!initialMapping.amount && (cleanF.includes('amount') || cleanF.includes('premium') || cleanF.includes('check') || (cleanF.includes('payment') && !cleanF.includes('date')))) {
             initialMapping.amount = f;
          }
          if (!initialMapping.ddate && (cleanF.includes('duedate') || cleanF.includes('ddate') || cleanF.includes('due') || cleanF.includes('date') || cleanF.includes('birthday'))) {
             if (!cleanF.includes('expiry') && !cleanF.includes('expire') && !cleanF.includes('expiration')) {
               initialMapping.ddate = f;
             }
          }
          if (!initialMapping.periodicins && (cleanF.includes('periodicins') || cleanF.includes('amortization') || cleanF.includes('periodic') || cleanF.includes('installment'))) {
             initialMapping.periodicins = f;
          }
        });

        setCsvMapping(initialMapping);
      }
    });
  };

  const handleCsvImport = async () => {
    if (!csvFile || !user || csvData.length === 0) return;
    
    if (!csvMapping.email) {
      toast.error('❌ Missing Email Mapping: Please map a column to Email.', { duration: 8000 });
      return;
    }

    const batch: Contact[] = csvData.map((row: any) => {
      let email = csvMapping.email ? String(row[csvMapping.email] || '').trim() : '';
      let name = csvMapping.name ? String(row[csvMapping.name] || '').trim() : '';
      let firstname = csvMapping.firstname ? String(row[csvMapping.firstname] || '').trim() : '';
      let yearmodel = csvMapping.yearmodel ? String(row[csvMapping.yearmodel] || '').trim() : '';
      let unit = csvMapping.unit ? String(row[csvMapping.unit] || '').trim() : '';
      let plate = csvMapping.plate ? String(row[csvMapping.plate] || '').trim() : '';
      let expiry = csvMapping.expiry ? String(row[csvMapping.expiry] || '').trim() : '';
      let amount = csvMapping.amount ? String(row[csvMapping.amount] || '').trim() : '';
      let ddate = csvMapping.ddate ? String(row[csvMapping.ddate] || '').trim() : '';
      let periodicins = csvMapping.periodicins ? String(row[csvMapping.periodicins] || '').trim() : '';

      if (expiry) expiry = formatToLongDate(expiry);
      if (ddate) ddate = formatToLongDate(ddate);

      if (!firstname && name) firstname = name;
      if (!name && firstname) name = firstname;
      if (!name) name = 'Unnamed';
      if (!firstname) firstname = 'Unnamed';

      const normalizedContact: any = {
        email,
        name,
        firstname,
        createdAt: new Date().toISOString()
      };

      if (yearmodel) normalizedContact.yearmodel = yearmodel;
      if (unit) normalizedContact.unit = unit;
      if (plate) normalizedContact.plate = plate;
      if (expiry) normalizedContact.expiry = expiry;
      if (amount) normalizedContact.amount = amount;
      if (ddate) normalizedContact.ddate = ddate;
      if (periodicins) normalizedContact.periodicins = periodicins;

      // Merge all original attributes just in case
      Object.keys(row).forEach(k => {
        let val = typeof row[k] === 'string' ? row[k].trim() : String(row[k] || '').trim();
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (cleanK.includes('date') || cleanK.includes('birthday') || cleanK.includes('expiry')) {
           val = formatToLongDate(val);
        }

        normalizedContact[cleanK] = val;
        
        const lowK = k.toLowerCase().replace(/\s+/g, '');
        normalizedContact[lowK] = val;
        
        normalizedContact[k] = val;
      });

      return normalizedContact;
    }).filter((c: any) => c.email && c.email.includes('@'));

    if (batch.length === 0) {
      toast.error('No valid contacts with email addresses found in CSV');
      return;
    }

    toast.loading(`Clearing existing contacts & importing ${batch.length} new records...`);
        
        try {
          if (dbConnected === true) {
            // First clear existing contacts
            const contactsPath = `users/${user.uid}/contacts`;
            const snapshot = await getDocs(collection(db, contactsPath));
            for (const d of snapshot.docs) {
              await deleteDoc(d.ref);
            }
            
            // Then add new ones
            const contactsRef = collection(db, contactsPath);
            for (const contact of batch) {
              await addDoc(contactsRef, contact);
            }
          } else {
            // Local fallback
            const localBatch = batch.map(c => ({
              id: Math.random().toString(36).substring(2, 11),
              ...c
            }));
            saveLocalContacts(localBatch);
          }
          toast.dismiss();
          toast.success(`Successfully imported ${batch.length} contacts`);
          if (csvFile) setImportedFileName(csvFile.name);
          setCsvFile(null);
          setCsvHeaders([]);
          setCsvData([]);
          setCsvMapping({});
          setIsImporting(false);
        } catch (err) {
          console.warn("CSV import to Firestore failed, falling back to local import", err);
          const localBatch = batch.map(c => ({
            id: Math.random().toString(36).substring(2, 11),
            ...c
          }));
          saveLocalContacts(localBatch);
          toast.dismiss();
          toast.success(`Imported ${batch.length} contacts (Local Mode)`);
          if (csvFile) setImportedFileName(csvFile.name);
          setCsvFile(null);
          setCsvHeaders([]);
          setCsvData([]);
          setCsvMapping({});
          setIsImporting(false);
        }
  };

  const replacePlaceholders = (text: string, contact: Contact) => {
    let result = text;
    Object.keys(contact).forEach(key => {
      const placeholder = `#${key}`;
      if (result.includes(placeholder)) {
        result = result.replaceAll(placeholder, contact[key] || '');
      }
    });
    return result;
  };

  const addContact = async () => {
    if (!user) return;
    if (!newEmail || !newEmail.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }
    if (contacts.some(c => c.email === newEmail)) {
      toast.error('Contact already exists');
      return;
    }

    const newContactData = {
      email: newEmail,
      name: newName || undefined,
      createdAt: new Date().toISOString()
    };

    try {
      if (dbConnected === true) {
        const contactsPath = `users/${user.uid}/contacts`;
        await addDoc(collection(db, contactsPath), newContactData);
      } else {
        const localContact: Contact = {
          id: Math.random().toString(36).substring(2, 11),
          ...newContactData
        };
        saveLocalContacts([...contacts, localContact]);
      }
      setNewEmail('');
      setNewName('');
      toast.success('Contact added');
    } catch (err) {
      console.warn("Write to Firestore failed, falling back to local addition", err);
      const localContact: Contact = {
        id: Math.random().toString(36).substring(2, 11),
        ...newContactData
      };
      saveLocalContacts([...contacts, localContact]);
      setNewEmail('');
      setNewName('');
      toast.success('Contact added (Local Mode)');
    }
  };

  const removeContact = async (id: string) => {
    if (!user) return;
    try {
      if (dbConnected === true) {
        await deleteDoc(doc(db, `users/${user.uid}/contacts`, id));
      } else {
        saveLocalContacts(contacts.filter(c => c.id !== id));
      }
      toast.success('Contact removed');
    } catch (err) {
      console.warn("Delete in Firestore failed, falling back to local deletion", err);
      saveLocalContacts(contacts.filter(c => c.id !== id));
      toast.success('Contact removed (Local Mode)');
    }
  };
  
  const clearContacts = async () => {
    if (!user) return;
    setIsConfirmClearOpen(false);
    
    try {
      if (dbConnected === true) {
        const contactsPath = `users/${user.uid}/contacts`;
        const snapshot = await getDocs(collection(db, contactsPath));
        for (const d of snapshot.docs) {
          await deleteDoc(d.ref);
        }
      } else {
        saveLocalContacts([]);
      }
      setImportedFileName('');
      toast.success('All contacts cleared');
    } catch (err) {
      console.warn("Clear in Firestore failed, falling back to local clear", err);
      saveLocalContacts([]);
      setImportedFileName('');
      toast.success('All contacts cleared (Local Mode)');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      toast.error("Please enter email and password");
      return;
    }
    
    setIsAuthSubmitting(true);
    try {
      const normalizedEmail = authEmail.toLowerCase();
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, normalizedEmail, authPassword);
        toast.success("Account created!");
      } else {
        await signInWithEmailAndPassword(auth, normalizedEmail, authPassword);
        toast.success("Welcome back!");
      }
    } catch (error: any) {
      console.error("Auth Error:", error);
      if (error.code === 'auth/invalid-credential') {
        toast.error("Invalid email or password.");
      } else if (error.code === 'auth/too-many-requests') {
        toast.error("Too many attempts. Please try again later.");
      } else {
        toast.error(error.message || "Authentication failed");
      }
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const generateContent = async () => {
    if (!subject) {
      toast.error('Please provide a subject line first to help the AI');
      return;
    }
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subject })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate content');
      }

      setBody(data.text || '');
      toast.success('Content generated!');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to generate content');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateEmailHtml = (subjectText: string, bodyText: string) => {
    const isBirthday = subjectText.toLowerCase().includes('birthday') || bodyText.toLowerCase().includes('birthday');
    const currentYear = new Date().getFullYear();

    if (isBirthday) {
      return `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); background-color: #ffffff;">
          <!-- Corporate Branding Header -->
          <div style="background-color: #ffffff; padding: 25px 20px; text-align: center; border-bottom: 1px solid #f1f5f9;">
            <img src="/assets/img/logo.png" alt="Encore Leasing & Finance Corp." style="height: 55px; width: auto; max-width: 100%; display: inline-block;" referrerPolicy="no-referrer" />
          </div>

          <!-- Celebration Banner -->
          <div style="background: linear-gradient(135deg, #102CA4 0%, #1d3dbd 100%); padding: 35px 25px; text-align: center; position: relative;">
            <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.3); padding: 8px 18px; border-radius: 30px;">
              <span style="color: #FFDF00; font-size: 13px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase;">🎂 BIRTHDAY GREETING</span>
            </div>
          </div>
          
          <!-- Festive Gold Stripe -->
          <div style="height: 5px; background: linear-gradient(90deg, #D4AF37, #F3E5AB, #D4AF37);"></div>
          
          <!-- Content Card -->
          <div style="padding: 45px 35px; line-height: 1.8; background-color: #ffffff;">
            <div style="font-size: 48px; margin-bottom: 20px; text-align: center;">🎉</div>
            <div style="white-space: pre-wrap; font-size: 16px; color: #2d3748; line-height: 1.8;">${bodyText}</div>
            
            <!-- Encouragement Block -->
            <div style="background-color: #f0f2fc; border-left: 4px solid #102CA4; padding: 18px; border-radius: 0 8px 8px 0; text-align: left; margin-top: 35px; margin-bottom: 25px;">
              <p style="margin: 0; font-size: 14px; color: #0d238f; font-weight: 600; font-style: italic; line-height: 1.6;">
                "May this special day bring you endless joy, success, and prosperity in all your endeavors. We are truly honored to have you as a valued part of our Encore family!"
              </p>
            </div>

            <div style="margin-top: 40px; padding-top: 25px; border-top: 1px solid #f1f5f9; text-align: left;">
              <p style="margin: 0; font-size: 14px; color: #4b5563; font-weight: 600;">Warmest regards,</p>
              <p style="margin: 5px 0 0 0; font-size: 15px; color: #102CA4; font-weight: 700;">Encore Leasing & Finance Corp. Family</p>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 30px 25px; text-align: center; border-top: 1px solid #e2e8f0;">
            <div style="margin-bottom: 18px;">
              <a href="https://encorefinancials.com/" style="color: #102CA4; text-decoration: none; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; border-bottom: 1.5px solid #102CA4; padding-bottom: 2px;">Visit our Website</a>
            </div>
            <p style="margin: 0; font-size: 11px; color: #64748b;">&copy; ${currentYear} Encore Leasing & Finance Corp. All rights reserved.</p>
            <p style="margin: 8px 0 0 0; font-size: 10px; color: #94a3b8; line-height: 1.6;">
              (044) 940-5625 | 0919-067-7719 | 0919-077-2664<br/>
              Encore Building, Maharlika Highway, Cabanatuan City
            </p>
          </div>
        </div>
      `;
    }

    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); background-color: #ffffff;">
        <!-- Corporate Branding Header -->
        <div style="background-color: #ffffff; padding: 25px 20px; text-align: center; border-bottom: 3px solid #102CA4;">
          <img src="/assets/img/logo.png" alt="Encore Leasing & Finance Corp." style="height: 55px; width: auto; max-width: 100%; display: inline-block;" referrerPolicy="no-referrer" />
        </div>
        <div style="padding: 40px 30px; line-height: 1.8; background-color: white;">
          <div style="white-space: pre-wrap; font-size: 15px; color: #1f2937;">${bodyText}</div>
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
            <p style="margin: 0; font-size: 14px; color: #4b5563; font-weight: 600;">Best regards,</p>
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #102CA4; font-weight: 700;">Encore Leasing & Finance Corp. Team</p>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 25px; text-align: center; border-top: 1px solid #e2e8f0;">
          <div style="margin-bottom: 15px;">
            <a href="https://encorefinancials.com/" style="color: #102CA4; text-decoration: none; font-size: 12px; font-weight: 600;">Visit our Website</a>
          </div>
          <p style="margin: 0; font-size: 11px; color: #64748b;">&copy; ${currentYear} Encore Leasing & Finance Corp. All rights reserved.</p>
          <p style="margin: 8px 0 0 0; font-size: 10px; color: #94a3b8;">
            (044) 940-5625 | 0919-067-7719 | 0919-077-2664<br/>
            Encore Building, Maharlika Highway, Cabanatuan City
          </p>
        </div>
      </div>
    `;
  };

  const extractPlaceholders = (text: string) => {
    const matches = text.match(/#([a-zA-Z0-9_]+)/g);
    return matches ? Array.from(new Set(matches.map(m => m.slice(1)))) : [];
  };

  const getMissingPlaceholders = () => {
    const requiredPlaceholders = Array.from(new Set([
      ...extractPlaceholders(subject),
      ...extractPlaceholders(body)
    ]));

    if (requiredPlaceholders.length === 0 || contacts.length === 0) return [];
    
    return requiredPlaceholders.filter(p => 
      !contacts.some(c => c[p as keyof Contact] && String(c[p as keyof Contact]).trim() !== '')
    );
  };

  const missingPlaceholders = getMissingPlaceholders();

  const sendBlast = async () => {
    if (contacts.length === 0) {
      toast.error('No recipients. Please import a CSV file or add contacts manually.');
      return;
    }
    if (!subject || !body) {
      toast.error('Subject and body are required');
      return;
    }

    if (missingPlaceholders.length > 0) {
      if (!confirm(`Warning: The following placeholders in your template do not seem to have any mapped data in your contacts:\n${missingPlaceholders.map(k => '#' + k).join(', ')}\n\nThis could lead to blank values in the sent emails.\nAre you sure you want to proceed?`)) {
        return;
      }
    }

    setIsSending(true);
    setIsPaused(false);
    setBlastProgress({ current: 0, total: contacts.length, success: 0, failed: 0 });

    try {
      const messages = contacts.map(contact => {
        const personalizedBody = replacePlaceholders(body, contact);
        const personalizedSubject = replacePlaceholders(subject, contact);
        
        const htmlBody = generateEmailHtml(personalizedSubject, personalizedBody);

        return {
          to: [contact.email],
          subject: personalizedSubject,
          body: htmlBody
        };
      });
      
      const batchSize = 25;
      const totalBatches = Math.ceil(messages.length / batchSize);
      const delayBetweenBatches = 500;
      
      setBlastQueue({
        totalBatches,
        currentBatchIndex: -1,
        status: 'sending',
        batches: Array.from({ length: totalBatches }).map((_, idx) => ({
          status: 'pending',
          batchNum: idx + 1,
          size: Math.min(batchSize, messages.length - idx * batchSize)
        }))
      });

      let failedContactsAccumulator: Contact[] = [];
      let successCountAccumulator = 0;
      const finalizedContacts: Contact[] = [];

      let historyDocRef: any = null;
      let localHistoryId = Math.random().toString(36).substring(2, 11);

      // Save initial History stub
      const initialHistoryItem = {
        timestamp: new Date().toLocaleString(),
        subject,
        body,
        recipientCount: contacts.length,
        status: 'in_progress' as const,
        successCount: 0,
        failedCount: 0,
        failedContacts: [],
        recipients: contacts.map(c => ({ email: c.email, name: c.name })),
        rawContacts: contacts.map(c => ({ ...c, status: 'pending' })),
        createdAt: new Date().toISOString()
      };

      if (user) {
        try {
          if (dbConnected === true) {
            const historyPath = `users/${user.uid}/history`;
            historyDocRef = await addDoc(collection(db, historyPath), initialHistoryItem);
          } else {
            saveLocalHistory([{ ...initialHistoryItem, id: localHistoryId } as any, ...history]);
          }
        } catch (histErr: any) {
          console.warn("Failed to write initial online history:", histErr);
          toast.error("Warning: Database write failed (likely missing permissions). Showing local progress only.");
          // To prevent onSnapshot from wiping our local progress, we decouple from the DB list for this specific blast
          historyDocRef = null;
          setHistory(prev => [{ ...initialHistoryItem, id: localHistoryId } as any, ...prev]);
        }
      }

      let toastId: string | number | undefined;
      if (messages.length > batchSize) {
         toastId = toast.loading(`Sending batch 1 of ${totalBatches}...`);
      }

      for (let i = 0; i < messages.length; i += batchSize) {
        const batchIndex = Math.floor(i / batchSize);
        const batchNum = batchIndex + 1;

        setBlastQueue(prev => {
          if (!prev) return prev;
          const newBatches = [...prev.batches];
          newBatches[batchIndex] = { ...newBatches[batchIndex], status: 'processing' };
          return { ...prev, currentBatchIndex: batchIndex, batches: newBatches, status: 'sending' };
        });

        while (isPausedRef.current) {
          setBlastQueue(prev => prev ? { ...prev, status: 'paused' } : prev);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        setBlastQueue(prev => prev ? { ...prev, status: 'sending' } : prev);
        
        const currentBatch = messages.slice(i, i + batchSize);
        const currentContactsBatch = contacts.slice(i, i + batchSize);
        
        if (toastId) {
          toast.loading(`Sending batch ${batchNum} of ${totalBatches}...`, { id: toastId });
        }

        try {
          const response = await fetch('/api/send-blast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: currentBatch })
          });

          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("text/html")) {
            throw new Error("Backend server is not running (received HTML instead of JSON). If deploying to Vercel, ensure you deploy a Node server or use Serverless functions.");
          }

          const text = await response.text();
          let data = {} as any;
          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            data = { error: text || 'Failed to send' };
          }

          if (!response.ok) {
            throw new Error(data?.error || `Failed to send batch ${batchNum}`);
          }
          
          if (data && Array.isArray(data.results)) {
            data.results.forEach((res: any, index: number) => {
              const contactObj = currentContactsBatch[index];
              if (!contactObj) return;
              if (res.success) {
                successCountAccumulator += 1;
                finalizedContacts.push({
                  ...contactObj,
                  status: 'success'
                });
              } else {
                console.error(`Email to ${contactObj.email} failed to send:`, res.error);
                const failedContact = {
                  ...contactObj,
                  status: 'failed',
                  error: res.error || 'Failed to send'
                };
                failedContactsAccumulator.push(failedContact);
                finalizedContacts.push(failedContact);
              }
            });
          } else {
            successCountAccumulator += currentBatch.length;
            currentContactsBatch.forEach(contactObj => {
              finalizedContacts.push({
                ...contactObj,
                status: 'success'
              });
            });
          }
          
          setBlastQueue(prev => {
            if (!prev) return prev;
            const newBatches = [...prev.batches];
            // If all failed in this batch because of the results loop, mark as error? No, just mark completed and blastProgress will show failures
            newBatches[batchIndex] = { ...newBatches[batchIndex], status: 'completed' };
            return { ...prev, batches: newBatches };
          });
        } catch (err: any) {
          console.error(`Batch ${batchNum} failed:`, err);
          const errorMsg = err.message || 'Batch request failed';
          currentContactsBatch.forEach(contactObj => {
            const failedContact = {
              ...contactObj,
              status: 'failed',
              error: errorMsg
            };
            failedContactsAccumulator.push(failedContact);
            finalizedContacts.push(failedContact);
          });
          
          setBlastQueue(prev => {
            if (!prev) return prev;
            const newBatches = [...prev.batches];
            newBatches[batchIndex] = { ...newBatches[batchIndex], status: 'error' };
            return { ...prev, batches: newBatches };
          });
        }
        
        if (i + batchSize < messages.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }

        // Live update the history record
        const liveProgressParams = {
          successCount: successCountAccumulator,
          failedCount: failedContactsAccumulator.length,
          failedContacts: failedContactsAccumulator,
          rawContacts: [
            ...finalizedContacts,
            ...contacts.slice(i + batchSize).map(c => ({ ...c, status: 'pending' }))
          ]
        };

        setBlastProgress({
          current: Math.min(i + batchSize, contacts.length),
          total: contacts.length,
          success: successCountAccumulator,
          failed: failedContactsAccumulator.length
        });

        if (historyDocRef && dbConnected) {
          await setDoc(historyDocRef, liveProgressParams, { merge: true }).catch(console.error);
        } else if (user) {
          setHistory(prev => {
            const newHist = [...prev];
            const idx = newHist.findIndex(h => h.id === localHistoryId);
            if (idx !== -1) {
              newHist[idx] = { ...newHist[idx], ...liveProgressParams };
              localStorage.setItem(`encore_history_${user.uid}`, JSON.stringify(newHist));
            }
            return newHist;
          });
        }
      }
      
      if (toastId) toast.dismiss(toastId);

      const computedCampaignStatus = failedContactsAccumulator.length === 0 
        ? ('success' as const) 
        : (successCountAccumulator === 0 ? ('failed' as const) : ('partial' as const));

      // Final History update
      const finalHistoryUpdate = {
        status: computedCampaignStatus,
        successCount: successCountAccumulator,
        failedCount: failedContactsAccumulator.length,
        failedContacts: failedContactsAccumulator,
        rawContacts: finalizedContacts
      };

      if (historyDocRef && dbConnected) {
        await setDoc(historyDocRef, finalHistoryUpdate, { merge: true }).catch(console.error);
      } else if (user) {
        setHistory(prev => {
          const newHist = [...prev];
          const idx = newHist.findIndex(h => h.id === localHistoryId);
          if (idx !== -1) {
            newHist[idx] = { ...newHist[idx], ...finalHistoryUpdate };
            localStorage.setItem(`encore_history_${user.uid}`, JSON.stringify(newHist));
          }
          return newHist;
        });
      }

      toast.success(`Blast sent to ${contacts.length} recipients!`);
      
      setBlastQueue(prev => prev ? { ...prev, status: 'completed' } : prev);
      
      // Clear form after successful blast
      setSubject('');
      setBody('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send blast');
      setBlastQueue(prev => prev ? { ...prev, status: 'error' } : prev);
    } finally {
      setIsSending(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <Toaster position="top-right" richColors />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
        >
          <div className="bg-brand-600 p-8 flex flex-col items-center justify-center">
            <img 
              src="/assets/img/logo.png" 
              alt="Encore Logo" 
              className="h-14 w-auto object-contain brightness-0 invert"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const sibling = e.currentTarget.nextElementSibling;
                if (sibling) {
                  sibling.classList.remove('hidden');
                  sibling.classList.add('flex');
                }
              }}
            />
            <div className="hidden flex-col items-center">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-2">
                <Mail className="text-white w-6 h-6" />
              </div>
              <h1 className="text-2xl font-black tracking-[4px] text-white m-0">ENCORE</h1>
            </div>
            <p className="text-brand-100 text-[10px] font-bold tracking-widest uppercase mt-3">Leasing & Finance Corp.</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">
                {isRegistering ? 'Create Account' : 'Portal Login'}
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                {isRegistering ? 'Register your employee credentials' : 'Access the Email Blast system'}
              </p>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              {dbConnected === false && (
                <div className="p-3.5 bg-red-50 border border-red-100 rounded-lg flex flex-col gap-2 text-red-700 text-xs shadow-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-red-800">Database Connection Failed (Offline Mode)</p>
                      <p className="mt-1 text-red-600 leading-relaxed">
                        Since you connected your custom Firebase project <strong>email-blast-68861</strong>, you must ensure that <strong>Cloud Firestore</strong> is initialized/enabled in your Firebase Console.
                      </p>
                    </div>
                  </div>
                  <div className="mt-1.5 pl-6 border-t border-red-100 pt-2 text-[11px] text-red-600 space-y-1">
                    <p className="font-medium text-red-700">How to fix this in your Firebase Console:</p>
                    <ol className="list-decimal list-inside space-y-0.5 ml-1">
                      <li>Go to <a href="https://console.firebase.google.com/project/email-blast-68861/firestore" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-red-800">Firebase Console Firestore</a></li>
                      <li>Click <strong>"Create database"</strong>.</li>
                      <li>Select <strong>Production mode</strong>.</li>
                      <li>Choose your preferred region (e.g., <strong>asia-southeast1</strong>) and click <strong>Enable</strong>.</li>
                    </ol>
                  </div>
                  <div className="mt-2 pl-6 flex">
                    <Button 
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={triggerConnectionCheck}
                      disabled={retryLoading}
                      className="bg-white hover:bg-red-100/50 border-red-200 text-red-700 hover:text-red-800 text-[11px] h-8 flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3 h-3 ${retryLoading ? 'animate-spin' : ''}`} />
                      <span>{retryLoading ? 'Checking Database...' : 'Test / Retry Connection Now'}</span>
                    </Button>
                  </div>
                </div>
              )}
              {dbConnected === true && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2 text-emerald-700 text-xs">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <p>System Online: Database Connected</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email"
                  type="email" 
                  placeholder="name@encorefinancials.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input 
                  id="password"
                  type="password" 
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <Button 
                type="submit"
                disabled={isAuthSubmitting}
                className="w-full h-11 bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-lg shadow-brand-200 transition-all"
              >
                {isAuthSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  isRegistering ? 'Create Account' : 'Sign In'
                )}
              </Button>
            </form>


            
            <p className="text-[10px] text-gray-400 text-center">
              Restricted access. Authorized Encore employees only.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  const handleSendVerificationInfo = async () => {
    try {
      if (user) {
        await sendEmailVerification(user);
        toast.success("Verification email sent! Please check your inbox.");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to send email.");
    }
  };

  if (user && !user.emailVerified) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <Toaster position="top-right" richColors />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
        >
          <div className="bg-orange-500 p-8 flex flex-col items-center justify-center text-center">
            <Mail className="w-12 h-12 text-white animate-bounce mb-3" />
            <h1 className="text-2xl font-bold text-white">
              Verify Your Email
            </h1>
            <p className="text-orange-100 text-xs mt-1.5 uppercase font-semibold tracking-wider">
              Verification Required
            </p>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="border-t border-gray-100 pt-3 text-xs text-gray-600 space-y-2 leading-relaxed text-center">
                <p>
                  To secure your portal, you must verify your email address. 
                  Please check your inbox at <strong>{user.email}</strong> and click the verification link.
                </p>
                <p className="text-[11px] text-gray-400 italic">
                  Once verified, simply reload this page to access the portal.
                </p>
              </div>
            </div>

            <Button
              onClick={handleSendVerificationInfo}
              className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-medium transition-all"
            >
              <Send className="w-4 h-4 mr-2" />
              Resend Verification Email
            </Button>

            <Button
              onClick={() => signOut(auth)}
              variant="outline"
              className="w-full h-11 border-gray-200 text-gray-700 hover:bg-gray-50 font-medium transition-all"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out / Switch Account
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (user && checkingProfile) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          <p className="text-xs text-gray-500 font-medium animate-pulse">Initializing Portal Access...</p>
        </div>
      </div>
    );
  }

  if (user && userProfile && userProfile.status !== 'active') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
        >
          <div className="bg-brand-600 p-8 flex flex-col items-center justify-center text-center">
            {userProfile.status === 'pending' ? (
              <Clock className="w-12 h-12 text-white animate-bounce mb-3" />
            ) : (
              <AlertTriangle className="w-12 h-12 text-white mb-3 animate-pulse" />
            )}
            <h1 className="text-2xl font-bold text-white">
              {userProfile.status === 'pending' ? 'Approval Pending' : 'Access Suspended'}
            </h1>
            <p className="text-brand-100 text-xs mt-1.5 uppercase font-semibold tracking-wider">
              Encore Leasing & Finance Corp.
            </p>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                {userProfile.photoURL ? (
                  <img src={userProfile.photoURL} alt="Profile" className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                    {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'E'}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-xs text-gray-800">{userProfile.displayName || 'Encore Employee'}</p>
                  <p className="text-[10px] text-gray-500">{userProfile.email}</p>
                </div>
              </div>
              
              <div className="border-t border-gray-100 pt-3 text-xs text-gray-600 space-y-2 leading-relaxed">
                {userProfile.status === 'pending' ? (
                  <p>
                    Your account is currently <strong>Pending Administrator Approval</strong>. A Super Administrator (<strong>encorefinancials@gmail.com</strong>) has been notified.
                  </p>
                ) : (
                  <p>
                    Your account access to the Encore Email Blast system has been <strong>suspended or disabled</strong>. Please contact your manager or the administrator.
                  </p>
                )}
                <p className="text-[11px] text-gray-400 italic">
                  Once your status is configured by the Super Admin, this page will unlock instantly.
                </p>
              </div>
            </div>

            <Button
              onClick={() => signOut(auth)}
              variant="outline"
              className="w-full h-11 border-gray-200 text-gray-700 hover:bg-gray-50 font-medium transition-all"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out / Switch Account
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-brand-100">
      <Toaster position="top-right" richColors />
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/assets/img/logo.png" 
              alt="Encore Logo" 
              className="h-10 w-auto object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const sibling = e.currentTarget.nextElementSibling;
                if (sibling) {
                  sibling.classList.remove('hidden');
                  sibling.classList.add('flex');
                }
              }}
            />
            <div className="hidden items-center gap-2">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                <Mail className="text-white w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">Encore</h1>
            </div>
          </div>
            <div className="flex items-center gap-6">
              {dbConnected === true && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 hidden md:flex">
                  <CheckCircle2 className="w-3 h-3" />
                  Database Connected
                </Badge>
              )}
              {dbConnected === false && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1 hidden md:flex">
                    <AlertCircle className="w-3 h-3" />
                    Database Disconnected
                  </Badge>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={triggerConnectionCheck}
                    disabled={retryLoading}
                    className="h-7 text-xs px-2 text-[#4B5563] hover:text-[#111827] hover:bg-gray-100 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3 h-3 ${retryLoading ? 'animate-spin' : ''}`} />
                    <span>{retryLoading ? 'Checking...' : 'Check Database'}</span>
                  </Button>
                </div>
              )}
            {configStatus && (!configStatus.hasSmtpConfig || !configStatus.smtpWorking) && (
              <Badge variant="destructive" className="animate-pulse">
                <AlertCircle className="w-3 h-3 mr-1" />
                {!configStatus.hasSmtpConfig ? 'Missing SMTP Config' : 'SMTP Error'}
              </Badge>
            )}
            <div className="flex items-center gap-3 pl-6 border-l border-gray-100">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-gray-900 leading-none">{user.displayName || 'Team Member'}</p>
                <p className="text-[10px] text-gray-500 mt-1">{user.email}</p>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => signOut(auth)}
                className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="flex items-center justify-between">
            <TabsList className="bg-white border border-gray-200 p-1 h-12">
              <TabsTrigger value="dashboard" className="px-6 data-[state=active]:bg-brand-50 data-[state=active]:text-brand-700">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="compose" className="px-6 data-[state=active]:bg-brand-50 data-[state=active]:text-brand-700">
                <Send className="w-4 h-4 mr-2" />
                Compose & Blast
              </TabsTrigger>
              <TabsTrigger value="contacts" className="px-6 data-[state=active]:bg-brand-50 data-[state=active]:text-brand-700">
                <Users className="w-4 h-4 mr-2" />
                Recipients ({contacts.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="px-6 data-[state=active]:bg-brand-50 data-[state=active]:text-brand-700">
                <History className="w-4 h-4 mr-2" />
                History
              </TabsTrigger>
              {isSuperAdmin && (
                <TabsTrigger value="admin" className="px-6 data-[state=active]:bg-brand-50 data-[state=active]:text-brand-700">
                  <Shield className="w-4 h-4 mr-2" />
                  Admin Panel
                </TabsTrigger>
              )}
            </TabsList>
            
            {contacts.length > 0 && (
              <div className="flex gap-2">
              <Button 
                onClick={sendBlast} 
                disabled={isSending || isScheduling || !subject || !body}
                className="bg-brand-600 hover:bg-brand-700 text-white px-6 shadow-lg shadow-brand-200 transition-all active:scale-95"
              >
                {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send Now
              </Button>
              <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
                <DialogTrigger render={
                  <Button 
                    variant="outline"
                    disabled={isSending || isScheduling || !subject || !body}
                    className="border-brand-200 text-brand-700 hover:bg-brand-50 shadow-sm"
                  >
                    Schedule
                  </Button>
                } />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Schedule Campaign</DialogTitle>
                    <DialogDescription>
                      Select a date and time to send this email blast.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="schedule-time" className="mb-2 block text-sm font-medium">Select Date & Time</Label>
                    <input 
                      type="datetime-local" 
                      id="schedule-time"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full flex h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      min={new Date().toISOString().slice(0, 16)}
                      required
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsScheduleOpen(false)}>Cancel</Button>
                    <Button 
                      className="bg-brand-600 hover:bg-brand-700 text-white"
                      disabled={!scheduledDate || isScheduling}
                      onClick={async () => {
                        if (!scheduledDate) return;
                        setIsScheduling(true);
                        try {
                          const messages = contacts.map(contact => {
                            const personalizedBody = replacePlaceholders(body, contact);
                            const personalizedSubject = replacePlaceholders(subject, contact);
                            const htmlBody = generateEmailHtml(personalizedSubject, personalizedBody);
                            return {
                              to: [contact.email],
                              subject: personalizedSubject,
                              body: htmlBody
                            };
                          });

                          const response = await fetch('/api/schedule-blast', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              messages,
                              scheduledFor: new Date(scheduledDate).toISOString()
                            })
                          });

                          const data = await response.json();
                          if (!response.ok) throw new Error(data.error || 'Failed to schedule');
                          
                          toast.success('Campaign scheduled successfully!');
                          setIsScheduleOpen(false);
                          
                          // Save history stub
                          const historyItem = {
                            timestamp: new Date().toLocaleString(),
                            subject,
                            body,
                            recipientCount: contacts.length,
                            status: 'scheduled' as const,
                            successCount: 0,
                            failedCount: 0,
                            failedContacts: [],
                            recipients: contacts.map(c => ({ email: c.email, name: c.name })),
                            rawContacts: contacts,
                            createdAt: new Date().toISOString(),
                            scheduledFor: new Date(scheduledDate).toISOString()
                          };

                          if (user && dbConnected) {
                            const historyPath = `users/${user.uid}/history`;
                            await addDoc(collection(db, historyPath), historyItem);
                          }
                          
                        } catch (err: any) {
                          toast.error(err.message || 'Failed to schedule campaign');
                        } finally {
                          setIsScheduling(false);
                        }
                      }}
                    >
                        {isScheduling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Confirm Schedule
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            )}
          </div>

          <AnimatePresence mode="wait">
            {/* Dashboard Tab */}
            <TabsContent value="dashboard" key="dashboard-content">
              <motion.div
                key="dashboard-motion"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="border-gray-200 shadow-sm">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 font-medium">Total Emails Reached</p>
                        <p className="text-3xl font-extrabold text-gray-900">{dashboardStats.totalSent}</p>
                      </div>
                      <div className="p-3 bg-brand-50 rounded-xl text-brand-600">
                        <Mail className="w-6 h-6" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-gray-200 shadow-sm">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 font-medium">Delivery Success Rate</p>
                        <p className="text-3xl font-extrabold text-green-600">{dashboardStats.successRate}%</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-xl text-green-600">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-gray-200 shadow-sm">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 font-medium">Campaigns Blasted</p>
                        <p className="text-3xl font-extrabold text-gray-900">{dashboardStats.campaignsCount}</p>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
                        <History className="w-6 h-6" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-gray-200 shadow-sm">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 font-medium">Loaded Recipients</p>
                        <p className="text-3xl font-extrabold text-gray-900">{dashboardStats.currentRecipientsCount}</p>
                      </div>
                      <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                        <Users className="w-6 h-6" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Dashboard Main Visual */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Performance Chart */}
                  <Card className="lg:col-span-2 border-gray-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Blast Performance History</CardTitle>
                          <CardDescription>Visual metrics tracking delivery success over past blasts</CardDescription>
                        </div>
                        <TrendingUp className="w-5 h-5 text-gray-400" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                          <History className="w-12 h-12 mb-4 opacity-20" />
                          <p className="text-sm">No campaign history available yet.</p>
                          <Button variant="outline" size="sm" className="mt-4" onClick={() => setActiveTab('compose')}>
                            Create a Blast
                          </Button>
                        </div>
                      ) : (
                        <div className="h-72 mt-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={[...history].reverse().slice(0, 10).reverse().map((item, idx) => ({
                                name: `Blast ${idx + 1}`,
                                Sent: item.successCount ?? (item.status === 'success' || !item.status ? item.recipientCount : 0),
                                Failed: item.failedCount ?? (item.status === 'failed' ? item.recipientCount : 0),
                                date: item.timestamp,
                                subject: item.subject
                              }))}
                              margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
                            >
                              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                              <Tooltip
                                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                contentStyle={{
                                  borderRadius: '8px',
                                  border: '1px solid #f3f4f6',
                                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                  fontSize: '11px',
                                  padding: '8px'
                                }}
                              />
                              <Bar dataKey="Sent" stackId="sum" fill="#16a34a" radius={[0, 0, 4, 4]} barSize={28} />
                              <Bar dataKey="Failed" stackId="sum" fill="#dc2626" radius={[4, 4, 0, 0]} barSize={28} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Actions & Health Card */}
                  <div className="space-y-6">
                    <Card className="border-gray-200 shadow-sm">
                      <CardHeader>
                        <CardTitle>Quick Navigation</CardTitle>
                        <CardDescription>Fast access controls for email blasts</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left h-12 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 group transition-all"
                          onClick={() => setActiveTab('compose')}
                        >
                          <Send className="w-4 h-4 mr-3 text-gray-400 group-hover:text-brand-600" />
                          <div>
                            <p className="font-bold text-xs">Compose & Blast</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Write message, pick templates, & send</p>
                          </div>
                        </Button>

                        <Button
                          variant="outline"
                          className="w-full justify-start text-left h-12 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 group transition-all"
                          onClick={() => setActiveTab('contacts')}
                        >
                          <Users className="w-4 h-4 mr-3 text-gray-400 group-hover:text-brand-600" />
                          <div>
                            <p className="font-bold text-xs">Manage Recipients</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Import CSV lists or enter emails</p>
                          </div>
                        </Button>

                        <Button
                          variant="outline"
                          className="w-full justify-start text-left h-12 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 group transition-all"
                          onClick={() => setActiveTab('history')}
                        >
                          <History className="w-4 h-4 mr-3 text-gray-400 group-hover:text-brand-600" />
                          <div>
                            <p className="font-bold text-xs">View Blast History</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Track statistics and review logs</p>
                          </div>
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="border-gray-200 shadow-sm bg-gray-50">
                      <CardContent className="p-6">
                        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">System Insight</h4>
                        {history.length === 0 ? (
                          <p className="text-xs text-gray-500 leading-relaxed">
                            No campaigns sent yet. Import recipients from a CSV in the <strong>Recipients</strong> tab, select your message parameters on the <strong>Compose & Blast</strong> tab, then send your first campaign!
                          </p>
                        ) : dashboardStats.successRate === 100 ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-green-700 font-semibold text-xs">
                              <CheckCircle2 className="w-4 h-4" /> Perfect Delivery Streak
                            </div>
                            <p className="text-[11px] text-gray-600 leading-relaxed">
                              Fantastic! Your delivery rate is at a flawless <strong>100%</strong>. All recipients across campaigns have received their reminders successfully.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-amber-700 font-semibold text-xs">
                              <AlertCircle className="w-4 h-4" /> Delivery Status Notice
                            </div>
                            <p className="text-[11px] text-gray-600 leading-relaxed">
                              You've had some failed reminders in previous campaigns (overall delivery rate is <strong>{dashboardStats.successRate}%</strong>). Review affected contacts in the <strong>History</strong> log to retry.
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Blast Queue Visual Indicator */}
                {blastQueue && blastQueue.status !== 'idle' && blastQueue.totalBatches > 0 && (
                  <Card className="border-brand-200 shadow-sm bg-brand-50 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <CardHeader className="pb-3 border-b border-brand-100/50">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-brand-800 text-sm flex items-center">
                          {blastQueue.status === 'paused' ? (
                            <Pause className="w-4 h-4 mr-2 text-brand-600" />
                          ) : blastQueue.status === 'sending' ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin text-brand-600" />
                          ) : blastQueue.status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 mr-2 text-red-600" />
                          )}
                          Live Blast Queue {blastQueue.status === 'paused' ? '(Paused)' : blastQueue.status === 'completed' ? '(Completed)' : blastQueue.status === 'error' ? '(Error)' : '(Sending)'}
                        </CardTitle>
                        <Badge variant="outline" className="bg-white border-brand-200 text-brand-700">
                           {blastQueue.batches.filter(b => b.status === 'completed' || b.status === 'error').length} / {blastQueue.totalBatches} Batches
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="flex flex-wrap gap-2">
                        {blastQueue.batches.map((batch) => {
                          let bgColor = "bg-white";
                          let borderColor = "border-gray-200";
                          let textColor = "text-gray-500";
                          
                          if (batch.status === 'processing') {
                            bgColor = "bg-brand-100";
                            borderColor = "border-brand-400";
                            textColor = "text-brand-700 font-bold";
                          } else if (batch.status === 'completed') {
                            bgColor = "bg-green-100";
                            borderColor = "border-green-400 border-2";
                            textColor = "text-green-700 font-bold";
                          } else if (batch.status === 'error') {
                            bgColor = "bg-red-100";
                            borderColor = "border-red-400 border-2";
                            textColor = "text-red-700 font-bold";
                          }

                          return (
                            <div 
                              key={batch.batchNum}
                              className={`flex flex-col items-center justify-center min-w-[3.5rem] h-12 rounded-md border text-xs transition-all ${bgColor} ${borderColor}`}
                              title={`Batch ${batch.batchNum}: ${batch.size} emails (${batch.status})`}
                            >
                              <span className={textColor}>B{batch.batchNum}</span>
                              {batch.status === 'processing' && <Loader2 className="w-3 h-3 mt-1 animate-spin text-brand-600" />}
                              {batch.status === 'completed' && <CheckCircle2 className="w-3 h-3 mt-1 text-green-600" />}
                              {batch.status === 'error' && <AlertCircle className="w-3 h-3 mt-1 text-red-600" />}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Blast Analytics View */}
                <div>
                  <div className="flex items-center justify-between mb-4 mt-8">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Blast Analytics</h3>
                      <p className="text-sm text-gray-500">Track and view performance metrics</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={refreshAnalytics} 
                      disabled={isRefreshingAnalytics || !dbConnected}
                      className="text-brand-600 border-brand-200 hover:bg-brand-50 bg-white"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshingAnalytics ? 'animate-spin' : ''}`} />
                      {isRefreshingAnalytics ? 'Refreshing...' : 'Refresh Data'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <Card className="border-gray-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle>Monthly Email Volume</CardTitle>
                      <CardDescription>Total sent emails broken down by month</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {blastAnalytics.monthlyVolume.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                          <p className="text-sm">No monthly data available.</p>
                        </div>
                      ) : (
                        <div className="h-64 mt-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={blastAnalytics.monthlyVolume} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                              <Tooltip
                                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                contentStyle={{ borderRadius: '8px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px', padding: '8px' }}
                              />
                              <Bar dataKey="sent" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-gray-200 shadow-sm flex flex-col">
                    <CardHeader className="pb-2">
                      <CardTitle>Top Templates Used</CardTitle>
                      <CardDescription>Most frequently used subject lines across blasts</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      {blastAnalytics.topTemplates.length === 0 ? (
                         <div className="flex flex-col items-center justify-center py-10 text-gray-400 h-full">
                           <p className="text-sm">No templates used yet.</p>
                         </div>
                      ) : (
                        <div className="space-y-3 mt-2">
                          {blastAnalytics.topTemplates.map((template, idx) => (
                            <div key={idx} className="flex flex-col bg-white hover:bg-gray-50 border border-gray-100 rounded-lg p-3.5 transition-colors shadow-sm">
                               <div className="flex items-start justify-between gap-4">
                                  <h4 className="font-medium text-sm text-gray-700 line-clamp-2 leading-relaxed">{template.subject}</h4>
                                  <span className="bg-brand-50 text-brand-700 border border-brand-100 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
                                    {template.count} {template.count === 1 ? 'use' : 'uses'}
                                  </span>
                               </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                </div>
              </motion.div>
            </TabsContent>

            {/* Compose Tab */}
            <TabsContent value="compose" key="compose-content">
              <motion.div 
                key="compose-motion"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-8"
              >
                <div className="lg:col-span-2 space-y-6">
                  <Card className="border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-brand-600 px-6 py-4 flex items-center justify-between text-white">
                      <div className="flex items-center gap-3">
                        <FileUp className="w-5 h-5" />
                        <div>
                          <p className="font-bold leading-none">Step 1: Import Data</p>
                          <p className="text-xs text-brand-100 mt-1">
                            {importedFileName ? `Loaded: ${importedFileName}` : 'Upload your CSV file to start'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Dialog 
                          open={isImporting} 
                          onOpenChange={(open) => {
                            if (!open) {
                              setCsvFile(null);
                              setCsvHeaders([]);
                              setCsvData([]);
                              setCsvMapping({});
                            }
                            setIsImporting(open);
                          }}
                        >
                          <DialogTrigger render={
                            <Button variant="secondary" size="sm" className="bg-white text-brand-600 hover:bg-brand-50 border-none">
                              <FileUp className="w-4 h-4 mr-2" />
                              {contacts.length > 0 ? 'Change File' : 'Upload CSV'}
                            </Button>
                          } />
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Import Contacts from CSV</DialogTitle>
                              <DialogDescription>
                                Upload a CSV file to bulk add contacts. We support placeholders like #firstname, #yearmodel, etc.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="p-4 border-2 border-dashed border-gray-200 rounded-lg text-center">
                                <input 
                                  type="file" 
                                  accept=".csv" 
                                  className="hidden" 
                                  id="csv-upload-compose"
                                  onChange={handleFileSelect}
                                />
                                <label htmlFor="csv-upload-compose" className="cursor-pointer">
                                  {csvFile ? (
                                    <div className="flex items-center justify-center gap-2 text-blue-600 font-medium">
                                      <CheckCircle2 className="w-5 h-5" />
                                      {csvFile.name}
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <FileUp className="w-8 h-8 mx-auto text-gray-400" />
                                      <p className="text-sm text-gray-500">Click to upload or drag and drop</p>
                                    </div>
                                  )}
                                </label>
                              </div>
                              <div className="bg-brand-50 p-3 rounded-lg flex gap-3">
                                <Info className="w-5 h-5 text-brand-600 shrink-0" />
                                <p className="text-xs text-brand-800 leading-relaxed">
                                  <strong>Tip:</strong> Ensure your CSV has an <strong>email</strong> column and a <strong>firstname</strong> column. Other columns like <strong>plate</strong> or <strong>amount</strong> will be used for placeholders.
                                </p>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="ghost" onClick={() => setIsImporting(false)}>Cancel</Button>
                              <Button onClick={handleCsvImport} disabled={!csvFile}>Import Now</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        {contacts.length > 0 && (
                          <Dialog open={isConfirmClearOpen} onOpenChange={setIsConfirmClearOpen}>
                            <DialogTrigger render={
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-white hover:bg-white/10"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Clear
                              </Button>
                            } />
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Clear all contacts?</DialogTitle>
                                <DialogDescription>
                                  This action cannot be undone. This will permanently delete all your contacts.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <Button variant="ghost" onClick={() => setIsConfirmClearOpen(false)}>Cancel</Button>
                                <Button variant="destructive" onClick={clearContacts}>Clear Contacts</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    </div>
                    {contacts.length > 0 && (
                      <div className="px-6 py-2 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
                        <span className="text-xs font-medium text-brand-700 flex items-center">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {contacts.length} recipients loaded
                        </span>
                        <Button variant="link" className="text-[10px] h-auto p-0 text-brand-600" onClick={() => setActiveTab('contacts')}>
                          View List →
                        </Button>
                      </div>
                    )}
                  </Card>

                  <Card className="border-gray-200 shadow-sm">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Step 2: Select Template</CardTitle>
                          <CardDescription>Choose a template that matches your uploaded data.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setIsPreviewOpen(true)}
                            disabled={!body}
                            className="border-brand-200 text-brand-600 hover:bg-brand-50"
                          >
                            <Info className="w-4 h-4 mr-2" />
                            Preview
                          </Button>
                          <Select onValueChange={handleTemplateSelect}>
                            <SelectTrigger className="w-[200px] bg-white">
                              <BookOpen className="w-4 h-4 mr-2 text-brand-600" />
                              <SelectValue placeholder="Select Template" />
                            </SelectTrigger>
                            <SelectContent>
                              {TEMPLATES.map(t => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="subject">Subject Line</Label>
                        <Input 
                          id="subject" 
                          placeholder="e.g. Special Offer: 20% Off Everything!" 
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="h-12 border-gray-200 focus:ring-brand-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="body">Message Body</Label>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={generateContent}
                            disabled={isGenerating}
                            className="text-brand-600 hover:text-brand-700 hover:bg-brand-50"
                          >
                            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                            Optimize with AI
                          </Button>
                        </div>
                        <Textarea 
                          id="body" 
                          placeholder="Write your email here..." 
                          className="min-h-[300px] border-gray-200 focus:ring-brand-500 leading-relaxed"
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                        />
                        {missingPlaceholders.length > 0 && contacts.length > 0 && (
                          <div className="flex items-start gap-2 mt-3 p-3 bg-red-50 rounded-lg text-red-800 border border-red-200 shadow-sm">
                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
                            <div className="text-sm">
                              <p className="font-semibold text-red-900">Missing Mapping</p>
                              <p className="mt-1">
                                The following placeholders in your template do not match any mapped data in your current recipients list. This could lead to blank values in the sent emails.
                              </p>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {missingPlaceholders.map(p => (
                                  <span key={p} className="px-2 py-0.5 bg-red-100 border border-red-200 rounded-md text-xs font-mono text-red-900">#{p}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {contacts.length > 0 && missingPlaceholders.length === 0 && (subject || body) && (
                          <AnimatePresence>
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="flex items-center gap-2 mt-3 p-3 bg-green-50 rounded-lg text-green-800 border border-green-200 shadow-sm"
                            >
                              <CheckCircle2 className="w-5 h-5 shrink-0 text-green-600" />
                              <span className="text-sm font-medium">All placeholders in your template match valid recipient columns!</span>
                            </motion.div>
                          </AnimatePresence>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  {configStatus && (!configStatus.hasSmtpConfig || !configStatus.smtpWorking) && (
                    <Card className="border-red-200 bg-red-50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-red-800 text-sm flex items-center">
                          <AlertCircle className="w-4 h-4 mr-2" />
                          {!configStatus.hasSmtpConfig ? 'Configuration Required' : 'API Connection Failed'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-red-700 leading-relaxed">
                          {!configStatus.hasSmtpConfig 
                            ? <>Your <strong>Brevo API key</strong> is missing. Emails cannot be sent until you supply the <strong>BREVO_API_KEY</strong> key to the <strong>Secrets</strong> panel in AI Studio settings.</>
                            : <>Your <strong>Brevo API key</strong> is configured but the connection failed. Error: {configStatus.smtpError || 'Unknown Error'}. Please verify your Brevo API credentials.</>
                          }
                        </p>
                        <Button 
                          variant="link" 
                          className="text-xs p-0 h-auto text-red-800 font-bold mt-2"
                          onClick={() => window.open('https://app.brevo.com/settings/keys/smtp', '_blank')}
                        >
                          Configure your Brevo API Key →
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="border-gray-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Recipients</span>
                        <span className="font-medium">{contacts.length}</span>
                      </div>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Preview</p>
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-sm">
                          <p className="font-bold mb-1">From: <span className="font-normal text-gray-500">Encore Leasing and Finance Corp. &lt;no-reply@encorefinancials.com&gt;</span></p>
                          <p className="font-bold mb-1">To: <span className="font-normal text-gray-500">Selected Contacts</span></p>
                          <p className="font-bold">Subject: <span className="font-normal text-gray-500">{subject || '(No subject)'}</span></p>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                        <p className="text-[10px] text-amber-800 leading-tight">
                          <strong>Note:</strong> Campaign is configured to send via Brevo API. Ensure you follow Brevo's sending limits and have your domain verified.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {isSending && (
                    <Card className="border-brand-200 shadow-sm bg-brand-50 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-brand-800 text-sm flex items-center">
                          {isPaused ? (
                            <Pause className="w-4 h-4 mr-2 text-brand-600" />
                          ) : (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin text-brand-600" />
                          )}
                          {isPaused ? 'Email Blast Paused' : 'Sending Email Blast...'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-medium text-brand-800">
                            <span>Progress</span>
                            <span>{blastProgress.total > 0 ? Math.round((blastProgress.current / blastProgress.total) * 100) : 0}%</span>
                          </div>
                          <div className="w-full bg-brand-200 rounded-full h-2">
                            <div 
                              className="bg-brand-600 h-2 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${blastProgress.total > 0 ? Math.round((blastProgress.current / blastProgress.total) * 100) : 0}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-brand-600 pt-1">
                            <span>{blastProgress.current} / {blastProgress.total} Processed</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white p-2.5 border border-brand-100 rounded-md shadow-sm">
                            <div className="text-green-600 font-bold flex items-center mb-1">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                              Successful
                            </div>
                            <div className="text-brand-900 font-bold text-xl">{blastProgress.success}</div>
                          </div>
                          <div className="bg-white p-2.5 border border-brand-100 rounded-md shadow-sm">
                            <div className="text-red-600 font-bold flex items-center mb-1">
                              <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                              Failed
                            </div>
                            <div className="text-brand-900 font-bold text-xl">{blastProgress.failed}</div>
                          </div>
                        </div>
                        
                        <div className="pt-2 flex gap-2">
                          {!isPaused ? (
                            <Button size="sm" variant="outline" className="w-full text-brand-700 bg-white border-brand-200" onClick={() => setIsPaused(true)}>
                              <Pause className="w-4 h-4 mr-2" />
                              Pause Blast
                            </Button>
                          ) : (
                            <Button size="sm" variant="default" className="w-full bg-brand-600 hover:bg-brand-700 text-white" onClick={() => setIsPaused(false)}>
                              <Play className="w-4 h-4 mr-2" />
                              Resume Blast
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </motion.div>
            </TabsContent>

            {/* Contacts Tab */}
            <TabsContent value="contacts" key="contacts-content">
              <motion.div 
                key="contacts-motion"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-8"
              >
                <Card className="md:col-span-1 border-gray-200 shadow-sm h-fit">
                  <CardHeader>
                    <CardTitle>Add Contact</CardTitle>
                    <CardDescription>Add recipients one by one.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name (Optional)</Label>
                      <Input 
                        id="name" 
                        placeholder="John Doe" 
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="john@example.com" 
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                      />
                    </div>
                    <Button onClick={addContact} className="w-full bg-gray-900 hover:bg-black text-white">
                      <Plus className="w-4 h-4 mr-2" />
                      Add to List
                    </Button>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2 border-gray-200 shadow-sm">
                  <CardHeader className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 pb-4">
                    <div>
                      <CardTitle>Recipient List</CardTitle>
                      <CardDescription>Review the data imported from your CSV.</CardDescription>
                    </div>
                    <div className="flex flex-col space-y-2 md:flex-row md:items-center md:space-y-0 md:space-x-4">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                        <Input
                          type="text"
                          placeholder="Search recipients..."
                          className="pl-8 w-full md:w-[250px]"
                          value={contactSearchQuery}
                          onChange={(e) => setContactSearchQuery(e.target.value)}
                        />
                      </div>
                      <Badge variant="secondary" className="h-6 w-fit">
                        {contacts.length} Total
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      {contacts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                          <Users className="w-12 h-12 mb-4 opacity-20" />
                          <p>No contacts added yet</p>
                        </div>
                      ) : contacts.filter(contact => 
                            (contact.name?.toLowerCase().includes(contactSearchQuery.toLowerCase())) || 
                            (contact.email.toLowerCase().includes(contactSearchQuery.toLowerCase()))
                          ).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                          <Search className="w-12 h-12 mb-4 opacity-20" />
                          <p>No contacts found matching "{contactSearchQuery}"</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {contacts.filter(contact => 
                            (contact.name?.toLowerCase().includes(contactSearchQuery.toLowerCase())) || 
                            (contact.email.toLowerCase().includes(contactSearchQuery.toLowerCase()))
                          ).map((contact) => (
                            <div 
                              key={contact.id} 
                              className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl hover:border-brand-200 hover:shadow-md transition-all group"
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600">
                                  {contact.name ? contact.name[0].toUpperCase() : contact.email[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium">{contact.name || 'Unnamed Contact'}</p>
                                  <p className="text-sm text-gray-500">{contact.email}</p>
                                </div>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => removeContact(contact.id)}
                                className="text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" key="history-content">
              <motion.div 
                key="history-motion"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {history.length > 0 && (
                  <Card className="border-gray-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Delivery Overview</CardTitle>
                      <CardDescription>Success vs. Failure rates across recent campaigns</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64 mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={
                            [...history].reverse().slice(0, 10).reverse().map((item, i) => {
                              let st = 'N/A';
                              try { st = new Date(item.timestamp).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) } catch(e){}
                              return {
                                name: `Camp ${i + 1}`,
                                date: st,
                                tooltipName: item.subject,
                                Sent: item.successCount ?? (item.status === 'success' || !item.status ? item.recipientCount : 0),
                                Failed: item.failedCount ?? (item.status === 'failed' ? item.recipientCount : 0)
                              }
                            })
                          } margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <Tooltip 
                              cursor={{ fill: 'rgba(0,0,0,0.04)' }} 
                              contentStyle={{ borderRadius: '8px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px', padding: '8px 12px' }} 
                              labelFormatter={(label, payload) => payload && payload.length > 0 ? payload[0].payload.tooltipName : label}
                            />
                            <Bar dataKey="Sent" stackId="a" fill="#16a34a" radius={[0, 0, 4, 4]} barSize={40} />
                            <Bar dataKey="Failed" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} barSize={40} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-gray-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Blast History</CardTitle>
                    <CardDescription>Track your previous campaigns and their performance.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {history.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <History className="w-12 h-12 mb-4 opacity-20" />
                        <p>No history available</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-xs text-gray-400 uppercase font-bold tracking-wider border-b border-gray-100">
                              <th className="pb-4 font-bold">Campaign</th>
                              <th className="pb-4 font-bold">Date</th>
                              <th className="pb-4 font-bold">Recipients</th>
                              <th className="pb-4 font-bold">Status</th>
                              <th className="pb-4 font-bold"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {history.map((item) => (
                              <tr key={item.id} className="group hover:bg-gray-50 transition-colors">
                                <td className="py-4">
                                  <p className="font-medium text-gray-900">{item.subject}</p>
                                </td>
                                <td className="py-4 text-sm text-gray-500">{item.timestamp}</td>
                                <td className="py-4 text-sm text-gray-500">{item.recipientCount}</td>
                                <td className="py-4">
                                  {item.status === 'success' || !item.status ? (
                                    <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Delivered
                                    </Badge>
                                  ) : item.status === 'partial' ? (
                                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100">
                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                      Partial Success
                                    </Badge>
                                  ) : item.status === 'in_progress' ? (
                                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 items-center whitespace-nowrap">
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                      {item.recipientCount > 0 ? `${(item.successCount || 0) + (item.failedCount || 0)} / ${item.recipientCount} - ${Math.round(((item.successCount || 0) + (item.failedCount || 0)) / item.recipientCount * 100)}%` : 'In Progress'}
                                    </Badge>
                                  ) : item.status === 'scheduled' ? (
                                    <Badge className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 items-center">
                                      <Calendar className="w-3 h-3 mr-1" />
                                      Scheduled
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100">
                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                      Failed
                                    </Badge>
                                  )}
                                </td>
                                <td className="py-4 text-right">
                                  <div className="flex justify-end items-center gap-2">
                                    {(item.failedCount || 0) > 0 && (
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="text-red-600 border-red-200 hover:bg-red-50 bg-white"
                                        onClick={() => handleRetryFailedEmails(item)}
                                        title={`Retry ${item.failedCount} Failed Emails`}
                                      >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="text-brand-600 hover:bg-brand-50"
                                      onClick={() => setSelectedHistory(item)}
                                    >
                                      Details
                                      <ChevronRight className="w-4 h-4 ml-1" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {isSuperAdmin && (
              <TabsContent value="admin" key="admin-content">
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-8"
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-200">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-brand-600" />
                        Admin Control Panel
                      </h2>
                      <p className="text-gray-500 text-xs mt-1">
                        Configure who possesses authorization to log in and use the Encore Portal.
                      </p>
                    </div>
                    <div className="bg-brand-50 border border-brand-100 rounded-lg px-4 py-2.5 text-right">
                      <span className="text-[10px] text-brand-700 font-bold uppercase tracking-wider block">Super Administrator</span>
                      <span className="text-xs text-brand-900 font-semibold">{user?.email}</span>
                    </div>
                  </div>

                  {/* Admin stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-6 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Employees</p>
                          <h3 className="text-2xl font-black mt-2 text-gray-900">
                            {allUsers.filter(u => u.status === 'active').length}
                          </h3>
                        </div>
                        <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className={`border shadow-sm transition-all duration-300 ${allUsers.some(u => u.status === 'pending') ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200'}`}>
                      <CardContent className="p-6 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending Approvals</p>
                          <h3 className={`text-2xl font-black mt-2 ${allUsers.some(u => u.status === 'pending') ? 'text-amber-700 animate-pulse' : 'text-gray-900'}`}>
                            {allUsers.filter(u => u.status === 'pending').length}
                          </h3>
                        </div>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${allUsers.some(u => u.status === 'pending') ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
                          <Clock className="w-6 h-6" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-6 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Suspended / Disabled</p>
                          <h3 className="text-2xl font-black mt-2 text-gray-900">
                            {allUsers.filter(u => u.status === 'inactive').length}
                          </h3>
                        </div>
                        <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
                          <AlertTriangle className="w-6 h-6" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Split columns */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Add team member by whitelist */}
                    <div className="lg:col-span-1">
                      <Card className="border border-gray-200 shadow-sm sticky top-24">
                        <CardHeader>
                          <CardTitle className="text-sm font-bold flex items-center gap-2 text-gray-900">
                            <UserPlus className="w-4 h-4 text-brand-600" />
                            Whitelist Member
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Grant login clearance in advance. Once added, they will skip approval upon their initial login.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <form onSubmit={handleAddTeamMemberByEmail} className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="teamEmail">Employee Work Email</Label>
                              <Input
                                id="teamEmail"
                                type="email"
                                placeholder="name@encorefinancials.com"
                                value={newTeamEmail}
                                onChange={(e) => setNewTeamEmail(e.target.value)}
                                className="h-10"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="teamName">Employee Display Name (Optional)</Label>
                              <Input
                                id="teamName"
                                type="text"
                                placeholder="Juan Dela Cruz"
                                value={newTeamName}
                                onChange={(e) => setNewTeamName(e.target.value)}
                                className="h-10"
                              />
                            </div>
                            <Button 
                              type="submit" 
                              className="w-full h-10 bg-brand-600 hover:bg-brand-700 text-white font-medium"
                            >
                              Add Whitelisted Member
                            </Button>
                          </form>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Manage Registered / Whitelisted Users Grid */}
                    <div className="lg:col-span-2 space-y-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200">
                        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                          <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <Input
                              type="search"
                              placeholder="Filter members..."
                              value={userSearchQuery}
                              onChange={(e) => setUserSearchQuery(e.target.value)}
                              className="pl-9 h-10 w-full"
                            />
                          </div>
                          <Button 
                            onClick={() => setIsCreateUserOpen(true)}
                            className="bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
                          >
                            <UserPlus className="w-4 h-4 mr-2" />
                            Create User
                          </Button>
                        </div>
                        <span className="text-xs font-semibold text-gray-500 hidden sm:inline-block">
                          Showing {filteredUsers.length} of {allUsers.length} total profiles
                        </span>
                      </div>

                      <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create New User</DialogTitle>
                            <DialogDescription>
                              Directly create a user account and send an invite email.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="createUserName">Full Name</Label>
                              <Input
                                id="createUserName"
                                placeholder="Juan Dela Cruz"
                                value={createUserName}
                                onChange={(e) => setCreateUserName(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="createUserEmail">Email Address</Label>
                              <Input
                                id="createUserEmail"
                                type="email"
                                placeholder="juan@encorefinancials.com"
                                value={createUserEmail}
                                onChange={(e) => setCreateUserEmail(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="createUserPassword">Temporary Password</Label>
                              <Input
                                id="createUserPassword"
                                type="text"
                                placeholder="Min 6 characters"
                                value={createUserPassword}
                                onChange={(e) => setCreateUserPassword(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="createUserRole">Role</Label>
                              <select 
                                id="createUserRole"
                                value={createUserRole}
                                onChange={(e) => setCreateUserRole(e.target.value as 'super_admin' | 'user')}
                                className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                              >
                                <option value="user">User</option>
                                <option value="super_admin">Super Admin</option>
                              </select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="ghost" onClick={() => setIsCreateUserOpen(false)}>Cancel</Button>
                            <Button 
                              onClick={handleCreateUser} 
                              disabled={isCreatingUser}
                              className="bg-brand-600 hover:bg-brand-700 text-white"
                            >
                              {isCreatingUser ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                              Create Account
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
                        <DialogContent>
                          <DialogHeader>
                            <div className="flex items-center justify-between">
                              <div>
                                <DialogTitle>Edit User Profile</DialogTitle>
                                <DialogDescription>
                                  Modify the name or role of this user. Changes are applied immediately.
                                </DialogDescription>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                onClick={async () => {
                                  const u = allUsers.find(user => user.uid === editingUserId);
                                  if (u) {
                                    await handleResendActivation(u.email);
                                    setIsEditUserOpen(false);
                                  }
                                }}
                                className="h-8 text-xs font-medium bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 hover:text-blue-800"
                              >
                                <Mail className="w-3.5 h-3.5 mr-2" />
                                Send Password Reset
                              </Button>
                            </div>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                              <Label htmlFor="editUserName">Name</Label>
                              <Input 
                                id="editUserName" 
                                placeholder="E.g. John Doe"
                                value={editUserName}
                                onChange={(e) => setEditUserName(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="editUserRole">Role</Label>
                              <select 
                                id="editUserRole"
                                value={editUserRole}
                                onChange={(e) => setEditUserRole(e.target.value as 'super_admin' | 'user')}
                                className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                              >
                                <option value="user">User</option>
                                <option value="super_admin">Super Admin</option>
                              </select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="ghost" onClick={() => setIsEditUserOpen(false)}>Cancel</Button>
                            <Button 
                              onClick={handleUpdateUser} 
                              disabled={isUpdatingUser}
                              className="bg-brand-600 hover:bg-brand-700 text-white"
                            >
                              {isUpdatingUser ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                              Save Changes
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Card className="border border-gray-200 overflow-hidden shadow-sm">
                        <CardContent className="p-0">
                          {loadingAllUsers && allUsers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-gray-500 gap-2">
                              <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                              <p className="text-xs">Fetching users from database...</p>
                            </div>
                          ) : filteredUsers.length === 0 ? (
                            <div className="text-center p-12 text-gray-500">
                              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-400" />
                              <p className="text-sm font-semibold">No results match filters</p>
                              <p className="text-xs mt-1">Try another search filter or verify invitations.</p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    <th className="py-3 px-4">Member Info</th>
                                    <th className="py-3 px-4">Role</th>
                                    <th className="py-3 px-4 text-center">Status</th>
                                    <th className="py-3 px-4 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-xs">
                                  {filteredUsers.map((u) => {
                                    const isSelf = u.uid === user?.uid;
                                    const isInvitationOnly = u.uid.startsWith('invite_');
                                    
                                    return (
                                      <tr key={u.uid} className="hover:bg-gray-50/45 transition-colors">
                                        <td className="py-4 px-4 flex items-center gap-3">
                                          {u.photoURL ? (
                                            <img src={u.photoURL} alt="Profile" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                                          ) : (
                                            <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-xs border border-brand-100/50">
                                              {(u.displayName || u.email || 'E').charAt(0).toUpperCase()}
                                            </div>
                                          )}
                                          <div>
                                            <div className="font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
                                              <span>{u.displayName || 'Whitelisted Invitation'}</span>
                                              {isSelf && (
                                                <Badge variant="outline" className="bg-brand-50 text-brand-700 border-brand-200 text-[9px] h-4 py-0">
                                                  YOU
                                                </Badge>
                                              )}
                                              {isInvitationOnly && (
                                                <Badge variant="outline" className="bg-yellow-50 text-yellow-850 border-yellow-200 text-[9px] h-4 py-0 font-medium">
                                                  UNREGISTERED
                                                </Badge>
                                              )}
                                            </div>
                                            <div className="text-gray-500 font-mono text-[10px] mt-0.5">{u.email}</div>
                                          </div>
                                        </td>
                                        <td className="py-4 px-4 font-medium text-gray-700">
                                          {u.role === 'super_admin' ? (
                                            <span className="flex items-center gap-1 text-brand-700 font-semibold">
                                              <Shield className="w-3 h-3" />
                                              Super Admin
                                            </span>
                                          ) : (
                                            <span className="text-gray-600">Employee</span>
                                          )}
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                          {u.status === 'active' && (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                              <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-pulse" />
                                              Active / Approved
                                            </span>
                                          )}
                                          {u.status === 'pending' && (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                              <span className="w-1.5 h-1.5 bg-amber-600 rounded-full" />
                                              Pending Approval
                                            </span>
                                          )}
                                          {u.status === 'inactive' && (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-100">
                                              <span className="w-1.5 h-1.5 bg-red-600 rounded-full" />
                                              Suspended / Blocked
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                            {!isSelf && (
                                              <>
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  type="button"
                                                  onClick={() => handleToggleUserStatus(u)}
                                                  className={`h-8 text-[11px] font-medium flex items-center gap-1 transition-all ${
                                                    u.status === 'active'
                                                      ? 'border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800'
                                                      : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800'
                                                  }`}
                                                >
                                                  {u.status === 'active' ? (
                                                    <>
                                                      <Lock className="w-3 h-3" />
                                                      <span>Suspend</span>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <UserCheck className="w-3 h-3" />
                                                      <span>Approve / Grant</span>
                                                    </>
                                                  )}
                                                </Button>

                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  type="button"
                                                  onClick={() => {
                                                    setEditingUserId(u.uid);
                                                    setEditUserName(u.displayName);
                                                    setEditUserRole(u.role || 'user');
                                                    setIsEditUserOpen(true);
                                                  }}
                                                  className="h-8 w-8 p-0 border-brand-100 text-brand-600 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                                                  title="Edit User Info"
                                                >
                                                  <Edit2 className="w-3.5 h-3.5" />
                                                </Button>

                                                {(u.status === 'active' || isInvitationOnly) && (
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    type="button"
                                                    onClick={() => handleResendActivation(u.email)}
                                                    className="h-8 w-8 p-0 border-blue-100 text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                                                    title={isInvitationOnly ? "Resend Invitation Email" : "Send Password Reset"}
                                                  >
                                                    <Mail className="w-3.5 h-3.5" />
                                                  </Button>
                                                )}
                                                
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  type="button"
                                                  onClick={() => handleDeleteUserRecord(u)}
                                                  className="h-8 w-8 p-0 border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                                                  title="Revoke and Delete Access"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                              </>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </motion.div>
              </TabsContent>
            )}
          </AnimatePresence>
        </Tabs>
      </main>

      {/* History Details Dialog */}
      <Dialog open={!!selectedHistory} onOpenChange={(open) => {
        if (!open) {
          setSelectedHistory(null);
          setSelectedHistoryRecipientIndex(0);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex justify-between items-start pr-8">
              <div>
                <DialogTitle>Campaign Details</DialogTitle>
                <DialogDescription>
                  Sent on {selectedHistory?.timestamp}
                </DialogDescription>
              </div>
              {(selectedHistory?.failedCount || 0) > 0 && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="text-red-700 bg-red-50 border-red-200 hover:bg-red-100 whitespace-nowrap shrink-0" 
                  onClick={() => handleRetryFailedEmails()}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry {selectedHistory?.failedCount} Failed
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Status</p>
                  {selectedHistory?.status === 'success' || !selectedHistory?.status ? (
                    <Badge className="bg-green-50 text-green-700 border-green-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Delivered
                    </Badge>
                  ) : selectedHistory?.status === 'partial' ? (
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Partial Success
                    </Badge>
                  ) : selectedHistory?.status === 'in_progress' ? (
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 items-center whitespace-nowrap">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      {selectedHistory?.recipientCount && selectedHistory.recipientCount > 0 ? `${(selectedHistory.successCount || 0) + (selectedHistory.failedCount || 0)} / ${selectedHistory.recipientCount} - ${Math.round(((selectedHistory.successCount || 0) + (selectedHistory.failedCount || 0)) / selectedHistory.recipientCount * 100)}%` : 'In Progress'}
                    </Badge>
                  ) : selectedHistory?.status === 'scheduled' ? (
                    <Badge className="bg-purple-50 text-purple-700 border-purple-200 items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      Scheduled
                    </Badge>
                  ) : (
                    <Badge className="bg-red-50 text-red-700 border-red-200">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Failed
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Recipients</p>
                  <p className="text-sm font-medium">{selectedHistory?.recipientCount} total contacts</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Delivery Summary</p>
                <div className="h-24 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'Sent', value: selectedHistory?.successCount ?? (selectedHistory?.status === 'success' ? selectedHistory.recipientCount : 0), color: '#16a34a' }, // green-600
                        { name: 'Failed', value: selectedHistory?.failedCount ?? 0, color: '#dc2626' }, // red-600
                        ...(selectedHistory?.status === 'in_progress' || selectedHistory?.status === 'scheduled' ? [{ name: 'Pending', value: (selectedHistory.recipientCount || 0) - (selectedHistory?.successCount || 0) - (selectedHistory?.failedCount || 0), color: '#9ca3af' }] : [])
                      ]}
                      layout="vertical"
                      margin={{ top: 0, right: 20, left: -20, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                      <Tooltip 
                        cursor={{fill: 'transparent'}}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', fontSize: '12px', padding: '4px 8px' }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                        {
                          [
                            { name: 'Sent', value: selectedHistory?.successCount ?? (selectedHistory?.status === 'success' ? selectedHistory?.recipientCount : 0), color: '#16a34a' },
                            { name: 'Failed', value: selectedHistory?.failedCount ?? 0, color: '#dc2626' },
                            ...(selectedHistory?.status === 'in_progress' || selectedHistory?.status === 'scheduled' ? [{ name: 'Pending', value: (selectedHistory.recipientCount || 0) - (selectedHistory?.successCount || 0) - (selectedHistory?.failedCount || 0), color: '#9ca3af' }] : [])
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))
                        }
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <Separator />
            
            {/* If we have full rawContacts data, we show exact personalized preview */}
            {selectedHistory?.rawContacts && selectedHistory.rawContacts.length > 0 ? (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                    <div className="text-xs text-gray-500 font-medium ml-2">
                      Viewing exact email sent to recipient {selectedHistoryRecipientIndex + 1} of {selectedHistory.rawContacts.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-xs"
                        onClick={() => setSelectedHistoryRecipientIndex(prev => Math.max(0, prev - 1))}
                        disabled={selectedHistoryRecipientIndex === 0}
                      >
                        Previous
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-xs"
                        onClick={() => setSelectedHistoryRecipientIndex(prev => Math.min((selectedHistory?.rawContacts?.length || 1) - 1, prev + 1))}
                        disabled={selectedHistoryRecipientIndex === (selectedHistory?.rawContacts?.length || 1) - 1}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Recipient Details</p>
                    {(() => {
                      const rc = selectedHistory.rawContacts[selectedHistoryRecipientIndex];
                      if (rc.status === 'success') {
                        return (
                          <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] py-0 px-2 h-5">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1 shrink-0" />
                            Success
                          </Badge>
                        );
                      } else if (rc.status === 'failed') {
                        return (
                          <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] py-0 px-2 h-5">
                            <AlertTriangle className="w-3.5 h-3.5 mr-1 shrink-0" />
                            Failed
                          </Badge>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                       <span className="font-semibold">{selectedHistory.rawContacts[selectedHistoryRecipientIndex].email}</span>
                       <span className="text-gray-500">{selectedHistory.rawContacts[selectedHistoryRecipientIndex].name ? `(${selectedHistory.rawContacts[selectedHistoryRecipientIndex].name})` : ''}</span>
                    </p>
                    {selectedHistory.rawContacts[selectedHistoryRecipientIndex].error && (
                      <div className="text-xs bg-red-50/50 text-red-800 p-2.5 rounded border border-red-100 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-650 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium">Error details:</span>{' '}
                          <code className="font-mono text-[11px] block mt-1 break-all select-all">
                            {selectedHistory.rawContacts[selectedHistoryRecipientIndex].error}
                          </code>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Subject</p>
                  <p className="text-sm font-medium p-3 bg-gray-50 rounded-lg border border-gray-100">
                    {replacePlaceholders(selectedHistory.subject, selectedHistory.rawContacts[selectedHistoryRecipientIndex])}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Message Content</p>
                  </div>
                  <div className="text-sm text-gray-600 p-4 bg-gray-50 rounded-lg border border-gray-100 whitespace-pre-wrap max-h-[300px] overflow-y-auto leading-relaxed">
                    {replacePlaceholders(selectedHistory.body, selectedHistory.rawContacts[selectedHistoryRecipientIndex])}
                  </div>
                </div>
              </>
            ) : (
              /* Fallback for older blast records without rawContacts */
              <>
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3 text-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <strong className="text-amber-800">Legacy Campaign Record</strong>
                    <p className="text-amber-700 leading-relaxed text-xs mt-1">Detailed recipient-specific email previews are not available for campaigns sent before this feature was introduced.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Template Subject</p>
                  <p className="text-sm font-medium p-3 bg-gray-50 rounded-lg border border-gray-100 text-gray-500">
                    {selectedHistory?.subject}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Template Content</p>
                  <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg border border-gray-100 whitespace-pre-wrap max-h-[300px] overflow-y-auto leading-relaxed">
                    {selectedHistory?.body}
                  </div>
                </div>
                {selectedHistory?.recipients && selectedHistory.recipients.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Sent To</p>
                    <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded-lg border border-gray-100 max-h-[150px] overflow-y-auto">
                      <ul className="list-disc pl-5 space-y-1">
                        {selectedHistory.recipients.map((r, i) => (
                          <li key={i}>{r.email} {r.name ? `(${r.name})` : ''}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => {
              setSelectedHistory(null);
              setSelectedHistoryRecipientIndex(0);
            }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              This is how your email will look to recipients. We've used sample data for placeholders.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 border rounded-lg overflow-hidden bg-gray-100 p-4 flex justify-center">
            {(() => {
              const previewSubject = subject || '';
              const previewBody = body || '';
              const isBdayPreview = previewSubject.toLowerCase().includes('birthday') || previewBody.toLowerCase().includes('birthday');
              const currentYear = new Date().getFullYear();
              
              const replacedBody = previewBody
                ? previewBody.replace(/#firstname/gi, 'JEFFREY')
                             .replace(/#yearmodel/gi, '2024')
                             .replace(/#unit/gi, 'Toyota Fortuner')
                             .replace(/#plate/gi, 'ABC 1234')
                             .replace(/#expiry/gi, 'Dec 31, 2026')
                             .replace(/#amount/gi, '15,000.00')
                             .replace(/#ddate/gi, 'April 15, 2026')
                             .replace(/#periodicins/gi, '12,500.00')
                : 'No content to preview.';

              if (isBdayPreview) {
                return (
                  <div className="bg-white w-full max-w-[600px] shadow-sm rounded-xl overflow-hidden border border-gray-200 font-sans">
                    {/* Corporate Branding Header */}
                    <div className="bg-white p-6 border-b border-gray-100 flex flex-col items-center justify-center">
                      <img 
                        src="/assets/img/logo.png" 
                        alt="Encore Logo" 
                        className="h-12 w-auto object-contain"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const sibling = e.currentTarget.nextElementSibling;
                          if (sibling) {
                            sibling.classList.remove('hidden');
                            sibling.classList.add('flex');
                          }
                        }}
                      />
                      <div className="hidden flex-col items-center">
                        <h1 className="text-xl font-black tracking-[4px] text-[#102CA4] m-0">ENCORE</h1>
                        <p className="text-gray-500 text-[9px] font-bold tracking-[1.5px] uppercase m-0 mt-1">Leasing & Finance Corp.</p>
                      </div>
                    </div>

                    {/* Celebration Banner */}
                    <div className="bg-gradient-to-r from-[#102CA4] to-[#1d3dbd] p-8 text-center">
                      <div className="inline-block bg-white/15 border border-white/30 px-4 py-1.5 rounded-full">
                        <span className="text-[#FFDF00] text-[11px] font-bold tracking-[2px] uppercase">🎂 BIRTHDAY GREETING</span>
                      </div>
                    </div>
                    
                    {/* Festive Gold Stripe */}
                    <div className="h-[5px] bg-gradient-to-r from-[#D4AF37] via-[#F3E5AB] to-[#D4AF37]"></div>
                    
                    {/* Content Card */}
                    <div className="p-10 bg-white">
                      <div className="text-5xl text-center mb-6">🎉</div>
                      <div className="whitespace-pre-wrap text-[15px] text-gray-700 leading-relaxed text-left">
                        {replacedBody}
                      </div>
                      
                      {/* Encouragement Block */}
                      <div className="border-l-4 border-[#102CA4] bg-brand-50 p-4 rounded-r-lg text-left mt-8 mb-6">
                        <p className="m-0 text-xs text-brand-700 font-semibold italic leading-relaxed">
                          "May this special day bring you endless joy, success, and prosperity in all your endeavors. We are truly honored to have you as a valued part of our Encore family!"
                        </p>
                      </div>

                      <div className="mt-10 pt-6 border-t border-gray-100 text-left">
                        <p className="m-0 text-sm text-gray-600 font-semibold">Warmest regards,</p>
                        <p className="m-1 text-sm text-brand-600 font-extrabold">Encore Leasing & Finance Corp. Family</p>
                      </div>
                    </div>
                    
                    {/* Footer */}
                    <div className="bg-gray-50 p-6 text-center border-t border-gray-100">
                      <div className="mb-4">
                        <a href="https://encorefinancials.com/" className="text-brand-600 hover:text-brand-700 no-underline text-xs font-bold leading-none border-b border-brand-600 pb-0.5">Visit our Website</a>
                      </div>
                      <p className="text-[10px] text-gray-500 m-0">&copy; {currentYear} Encore Leasing & Finance Corp. All rights reserved.</p>
                      <p className="text-[9px] text-gray-400 mt-2 leading-relaxed">
                        (044) 940-5625 | 0919-067-7719 | 0919-077-2664<br/>
                        Encore Building, Maharlika Highway, Cabanatuan City
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-white w-full max-w-[600px] shadow-sm rounded-lg overflow-hidden border border-gray-200">
                  {/* Corporate Branding Header */}
                  <div className="bg-white p-6 border-b-2 border-[#102CA4] flex flex-col items-center justify-center">
                    <img 
                      src="/assets/img/logo.png" 
                      alt="Encore Logo" 
                      className="h-12 w-auto object-contain"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const sibling = e.currentTarget.nextElementSibling;
                        if (sibling) {
                          sibling.classList.remove('hidden');
                          sibling.classList.add('flex');
                        }
                      }}
                    />
                    <div className="hidden flex-col items-center">
                      <h1 className="text-xl font-black tracking-[4px] text-[#102CA4] m-0">ENCORE</h1>
                      <p className="text-gray-500 text-[9px] font-bold tracking-[1.5px] uppercase m-0 mt-1">Leasing & Finance Corp.</p>
                    </div>
                  </div>
                  <div className="p-10 bg-white min-h-[200px]">
                    <div className="whitespace-pre-wrap text-gray-800 leading-relaxed text-base text-left">
                      {replacedBody}
                    </div>
                    <div className="mt-10 pt-6 border-t border-gray-100 text-left">
                      <p className="m-0 text-sm text-gray-600 font-semibold">Best regards,</p>
                      <p className="m-1 text-sm text-brand-600 font-bold">Encore Leasing & Finance Corp. Team</p>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-6 text-center border-t border-gray-100">
                    <div className="mb-4">
                      <a href="https://encorefinancials.com/" className="text-brand-600 no-underline text-xs font-semibold">Visit our Website</a>
                    </div>
                    <p className="text-[10px] text-gray-500 m-0">&copy; {currentYear} Encore Leasing & Finance Corp. All rights reserved.</p>
                    <p className="text-[9px] text-gray-400 mt-2 leading-relaxed">
                      (044) 940-5625 | 0919-067-7719 | 0919-077-2664<br/>
                      Encore Building, Maharlika Highway, Cabanatuan City
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsPreviewOpen(false)}>Close Preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-gray-200 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <Mail className="w-4 h-4" />
            <span className="text-sm font-medium">Encore v1.0.0</span>
          </div>
          <div className="flex gap-8 text-sm text-gray-500">
            <a href="#" className="hover:text-gray-900 transition-colors">Documentation</a>
            <a href="#" className="hover:text-gray-900 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-gray-900 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
