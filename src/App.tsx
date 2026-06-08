import React, { useState, useMemo, useEffect } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
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
import { auth, db, signInWithGoogle, signInWithEmailAndPassword, createUserWithEmailAndPassword, checkConnection } from './lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, setDoc, getDocs } from 'firebase/firestore';

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
  status: 'success' | 'failed' | 'partial';
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
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState<BlastHistory[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<BlastHistory | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('compose');
  const [configStatus, setConfigStatus] = useState<{ hasResendKey: boolean; hasGeminiKey: boolean } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);

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

  // Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      
      if (u && dbConnected === true) {
        // Save user profile if new (only if connected to prevent offline error during init check)
        setDoc(doc(db, 'users', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(err => {
          console.warn("Skipping Firestore user-profile save (running in offline/local fallback mode):", err);
        });
      }
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
    if (!user) {
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
    const qHistory = query(collection(db, historyPath), orderBy('timestamp', 'desc'));
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
  }, [user, dbConnected]);

  const handleTemplateSelect = (templateId: string) => {
    const template = TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
      toast.success(`Template "${template.name}" applied`);
    }
  };

  const handleCsvImport = async () => {
    if (!csvFile || !user) return;
    
    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const batch: Contact[] = results.data.map((row: any) => {
          let email = '';
          let name = '';
          let firstname = '';
          let yearmodel = '';
          let unit = '';
          let plate = '';
          let expiry = '';
          let amount = '';
          let ddate = '';
          let periodicins = '';

          // Tolerance-based parsing: scan all headers (keys) in the CSV row
          Object.keys(row).forEach(k => {
            const val = typeof row[k] === 'string' ? row[k].trim() : String(row[k] || '').trim();
            const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');

            // 1. Email check
            if (cleanK.includes('email') || cleanK.includes('emailaddress')) {
              if (val) email = val;
            } else if ((cleanK === 'to' || cleanK === 'recipient' || cleanK === 'contact') && !email) {
              if (val) email = val;
            }

            // 2. Name check
            if (cleanK.includes('firstname') || cleanK.includes('first') || cleanK.includes('givenname') || cleanK.includes('given')) {
              if (val) firstname = val;
            } else if (cleanK.includes('name')) {
              if (val) name = val;
            }

            // 3. Year Model check
            if (cleanK.includes('yearmodel')) {
              if (val) yearmodel = val;
            } else if ((cleanK.includes('model') || cleanK.includes('year')) && !yearmodel) {
              if (val) yearmodel = val;
            }

            // 4. Unit check
            if (cleanK.includes('unit') || cleanK.includes('vehicle') || cleanK.includes('car')) {
              if (val) unit = val;
            }

            // 5. Plate check
            if (cleanK.includes('plate')) {
              if (val) plate = val;
            }

            // 6. Expiry check
            if (cleanK.includes('expiry') || cleanK.includes('expire') || cleanK.includes('expiration')) {
              if (val) expiry = val;
            }

            // 7. Amount check
            if (cleanK.includes('amount') || cleanK.includes('premium')) {
              if (val) amount = val;
            }

            // 8. Due Date check
            if (cleanK.includes('duedate') || cleanK.includes('ddate') || cleanK.includes('due') || cleanK.includes('date')) {
              if (!cleanK.includes('expiry') && !cleanK.includes('expire') && !cleanK.includes('expiration')) {
                if (val) ddate = val;
              }
            }

            // 9. Periodic Insurance check
            if (cleanK.includes('periodicins') || cleanK.includes('amortization') || cleanK.includes('periodic')) {
              if (val) periodicins = val;
            }
          });

          // Consolidate name and firstname values
          if (!firstname && name) {
            firstname = name;
          }
          if (!name && firstname) {
            name = firstname;
          }
          if (!name) name = 'Unnamed';
          if (!firstname) firstname = 'Unnamed';

          // Build a normalized contact record
          const normalizedContact: any = {
            email: email.trim(),
            name: name.trim(),
            firstname: firstname.trim(),
            createdAt: new Date().toISOString()
          };

          if (yearmodel) normalizedContact.yearmodel = yearmodel.trim();
          if (unit) normalizedContact.unit = unit.trim();
          if (plate) normalizedContact.plate = plate.trim();
          if (expiry) normalizedContact.expiry = expiry.trim();
          if (amount) normalizedContact.amount = amount.trim();
          if (ddate) normalizedContact.ddate = ddate.trim();
          if (periodicins) normalizedContact.periodicins = periodicins.trim();

          // Merge all original attributes and their lowercase cleaned variants to survive placeholder substitution
          Object.keys(row).forEach(k => {
            const val = typeof row[k] === 'string' ? row[k].trim() : String(row[k] || '').trim();
            const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
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

        // Add to Firestore or state fallback
        toast.loading(`Importing ${batch.length} contacts...`);
        try {
          if (dbConnected === true) {
            const contactsRef = collection(db, `users/${user.uid}/contacts`);
            for (const contact of batch) {
              await addDoc(contactsRef, contact);
            }
          } else {
            const localBatch = batch.map(c => ({
              id: Math.random().toString(36).substring(2, 11),
              ...c
            }));
            const updated = [...contacts];
            localBatch.forEach(c => {
              if (!updated.some(uc => uc.email === c.email)) {
                updated.push(c);
              }
            });
            saveLocalContacts(updated);
          }
          toast.dismiss();
          toast.success(`Imported ${batch.length} contacts`);
          setCsvFile(null);
          setIsImporting(false);
        } catch (err) {
          console.warn("CSV import to Firestore failed, falling back to local import", err);
          const localBatch = batch.map(c => ({
            id: Math.random().toString(36).substring(2, 11),
            ...c
          }));
          const updated = [...contacts];
          localBatch.forEach(c => {
            if (!updated.some(uc => uc.email === c.email)) {
              updated.push(c);
            }
          });
          saveLocalContacts(updated);
          toast.dismiss();
          toast.success(`Imported ${batch.length} contacts (Local Mode)`);
          setCsvFile(null);
          setIsImporting(false);
        }
      }
    });
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
    if (!confirm('Are you sure you want to clear all contacts?')) return;
    
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
      toast.success('All contacts cleared');
    } catch (err) {
      console.warn("Clear in Firestore failed, falling back to local clear", err);
      saveLocalContacts([]);
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
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        toast.success("Account created!");
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
        toast.success("Welcome back!");
      }
    } catch (error: any) {
      console.error("Auth Error:", error);
      toast.error(error.message || "Authentication failed");
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
            <img src="https://encorefinancials.com/assets/images/application-settings/logo-dark.png" alt="Encore Leasing & Finance Corp." style="height: 55px; width: auto; max-width: 100%; display: inline-block;" referrerPolicy="no-referrer" />
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
          <img src="https://encorefinancials.com/assets/images/application-settings/logo-dark.png" alt="Encore Leasing & Finance Corp." style="height: 55px; width: auto; max-width: 100%; display: inline-block;" referrerPolicy="no-referrer" />
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

  const sendBlast = async () => {
    if (contacts.length === 0) {
      toast.error('No recipients. Please import a CSV file or add contacts manually.');
      return;
    }
    if (!subject || !body) {
      toast.error('Subject and body are required');
      return;
    }

    setIsSending(true);
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

      const response = await fetch('/api/send-blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });

      const text = await response.text();
      let data = {} as any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text || 'Failed to send' };
      }

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to send');
      }

      // Save to Firestore History
      const historyItem = {
        timestamp: new Date().toLocaleString(),
        subject,
        body,
        recipientCount: contacts.length,
        status: 'success' as const,
        createdAt: new Date().toISOString()
      };

      if (user) {
        try {
          if (dbConnected === true) {
            const historyPath = `users/${user.uid}/history`;
            await addDoc(collection(db, historyPath), historyItem);
          } else {
            const localHistItem = {
              id: Math.random().toString(36).substring(2, 11),
              ...historyItem
            };
            saveLocalHistory([localHistItem, ...history]);
          }
        } catch (histErr) {
          console.warn("Failed to write to online history, saving locally:", histErr);
          const localHistItem = {
            id: Math.random().toString(36).substring(2, 11),
            ...historyItem
          };
          saveLocalHistory([localHistItem, ...history]);
        }
      }

      toast.success(`Blast sent to ${contacts.length} recipients!`);
      
      // Clear form after successful blast
      setSubject('');
      setBody('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send blast');
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
                <Label htmlFor="password">Password</Label>
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

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">Or continue with</span>
              </div>
            </div>

            <Button 
              onClick={signInWithGoogle}
              variant="outline"
              className="w-full h-11 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm transition-all"
            >
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4 mr-3" alt="Google" />
              Google Authentication
            </Button>

            <div className="text-center">
              <button 
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-sm text-brand-600 hover:underline font-medium"
              >
                {isRegistering ? 'Already have an account? Sign in' : 'First time here? Create an account'}
              </button>
            </div>
            
            <p className="text-[10px] text-gray-400 text-center">
              Restricted access. Authorized Encore employees only.
            </p>
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
            {configStatus && !configStatus.hasResendKey && (
              <Badge variant="destructive" className="animate-pulse">
                <AlertCircle className="w-3 h-3 mr-1" />
                Missing Resend Key
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
            </TabsList>
            
            {contacts.length > 0 && (
              <Button 
                onClick={sendBlast} 
                disabled={isSending || !subject || !body}
                className="bg-brand-600 hover:bg-brand-700 text-white px-8 shadow-lg shadow-brand-200 transition-all active:scale-95"
              >
                {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send Blast Now
              </Button>
            )}
          </div>

          <AnimatePresence mode="wait">
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
                          <p className="text-xs text-brand-100 mt-1">Upload your CSV file to start</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Dialog open={isImporting} onOpenChange={setIsImporting}>
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
                                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
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
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={clearContacts}
                            className="text-white hover:bg-white/10"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Clear
                          </Button>
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
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  {configStatus && !configStatus.hasResendKey && (
                    <Card className="border-red-200 bg-red-50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-red-800 text-sm flex items-center">
                          <AlertCircle className="w-4 h-4 mr-2" />
                          Configuration Required
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-red-700 leading-relaxed">
                          Your <strong>RESEND_API_KEY</strong> is missing. Emails cannot be sent until you add this key to the <strong>Secrets</strong> panel in AI Studio settings.
                        </p>
                        <Button 
                          variant="link" 
                          className="text-xs p-0 h-auto text-red-800 font-bold mt-2"
                          onClick={() => window.open('https://resend.com', '_blank')}
                        >
                          Get a free key at Resend.com →
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
                          <p className="font-bold mb-1">From: <span className="font-normal text-gray-500">Encore &lt;no-reply@encorefinancials.com&gt;</span></p>
                          <p className="font-bold mb-1">To: <span className="font-normal text-gray-500">Selected Contacts</span></p>
                          <p className="font-bold">Subject: <span className="font-normal text-gray-500">{subject || '(No subject)'}</span></p>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                        <p className="text-[10px] text-amber-800 leading-tight">
                          <strong>Note:</strong> If using the default Resend testing domain, you can only send emails to the address you used to sign up for Resend.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-brand-600 text-white border-none shadow-xl shadow-brand-200">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-white/20 rounded-lg">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold mb-1">AI Tip</p>
                          <p className="text-sm text-brand-100 leading-relaxed">
                            Personalized subject lines increase open rates by 26%. Try including a name placeholder!
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
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
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Recipient List</CardTitle>
                      <CardDescription>Review the data imported from your CSV.</CardDescription>
                    </div>
                    <Badge variant="secondary" className="h-6">
                      {contacts.length} Total
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      {contacts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                          <Users className="w-12 h-12 mb-4 opacity-20" />
                          <p>No contacts added yet</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {contacts.map((contact) => (
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
              >
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
                                  <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Delivered
                                  </Badge>
                                </td>
                                <td className="py-4 text-right">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-brand-600 hover:bg-brand-50"
                                    onClick={() => setSelectedHistory(item)}
                                  >
                                    Details
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                  </Button>
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
          </AnimatePresence>
        </Tabs>
      </main>

      {/* History Details Dialog */}
      <Dialog open={!!selectedHistory} onOpenChange={(open) => !open && setSelectedHistory(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Campaign Details</DialogTitle>
            <DialogDescription>
              Sent on {selectedHistory?.timestamp}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Status</p>
                <Badge className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Delivered
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Recipients</p>
                <p className="text-sm font-medium">{selectedHistory?.recipientCount} contacts</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Subject</p>
              <p className="text-sm font-medium p-3 bg-gray-50 rounded-lg border border-gray-100">
                {selectedHistory?.subject}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Message Content</p>
              <div className="text-sm text-gray-600 p-4 bg-gray-50 rounded-lg border border-gray-100 whitespace-pre-wrap max-h-[300px] overflow-y-auto leading-relaxed">
                {selectedHistory?.body}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSelectedHistory(null)}>Close</Button>
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
