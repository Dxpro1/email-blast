import React, { useState, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
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
  Info
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
import { Toaster } from '@/components/ui/sonner';
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

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    body: `Happy Birthday #firstname! we wanted to take a moment to send you our warmest wishes. We hope your birthday is filled with joy, laughter, and everything you love. from your Encore Leasing & Finance Corp. Family`
  },
  {
    id: 'due_date',
    name: 'Due Date',
    subject: 'Payment Reminder - Encore Leasing & Finance Corp.',
    body: `Good Day Ms./Mr. #firstname, Just a gentle reminder that your monthly amortization amounting to #periodicins PHP is due on #ddate. Kindly settle your amortization on time to avoid penalties. For inquiries, call us at  0919-077-2664. If payment has been made, please disregard this message`
  }
];

export default function App() {
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

  React.useEffect(() => {
    fetch('/api/config-status')
      .then(res => res.json())
      .then(setConfigStatus)
      .catch(console.error);
  }, []);

  const handleTemplateSelect = (templateId: string) => {
    const template = TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
      toast.success(`Template "${template.name}" applied`);
    }
  };

  const handleCsvImport = () => {
    if (!csvFile) return;
    
    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newContacts: Contact[] = results.data.map((row: any) => {
          // Find email column (case-insensitive)
          const emailKey = Object.keys(row).find(k => k.toLowerCase() === 'email');
          const email = emailKey ? row[emailKey] : '';
          
          // Find name column (case-insensitive)
          const nameKey = Object.keys(row).find(k => ['firstname', 'name', 'first name'].includes(k.toLowerCase()));
          const name = nameKey ? row[nameKey] : 'Unnamed';
          
          return {
            id: crypto.randomUUID(),
            email: email.trim(),
            name: name.trim(),
            ...row
          };
        }).filter(c => c.email && c.email.includes('@'));

        if (newContacts.length === 0) {
          toast.error('No valid contacts with email addresses found in CSV');
          return;
        }

        setContacts([...contacts, ...newContacts]);
        setCsvFile(null);
        setIsImporting(false);
        toast.success(`Imported ${newContacts.length} contacts`);
      },
      error: (error) => {
        toast.error(`CSV Error: ${error.message}`);
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

  const addContact = () => {
    if (!newEmail || !newEmail.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }
    if (contacts.some(c => c.email === newEmail)) {
      toast.error('Contact already exists');
      return;
    }
    const contact: Contact = {
      id: crypto.randomUUID(),
      email: newEmail,
      name: newName || undefined
    };
    setContacts([...contacts, contact]);
    setNewEmail('');
    setNewName('');
    toast.success('Contact added');
  };

  const removeContact = (id: string) => {
    setContacts(contacts.filter(c => c.id !== id));
  };

  const generateContent = async () => {
    if (!subject) {
      toast.error('Please provide a subject line first to help the AI');
      return;
    }
    setIsGenerating(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Write a professional marketing email body for the subject: "${subject}". Keep it concise, engaging, and include a call to action. Return only the email body text.`,
      });
      setBody(response.text || '');
      toast.success('Content generated!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate content');
    } finally {
      setIsGenerating(false);
    }
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
        
        // Wrap in HTML template matching company design
        const htmlBody = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #2563eb; padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; letter-spacing: 2px; font-weight: 800;">ENCORE</h1>
              <p style="color: #bfdbfe; margin: 5px 0 0 0; font-size: 12px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Leasing & Finance Corp.</p>
            </div>
            <div style="padding: 40px 30px; line-height: 1.8; background-color: white;">
              <div style="white-space: pre-wrap; font-size: 16px; color: #1f2937;">${personalizedBody}</div>
              <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; font-size: 14px; color: #4b5563; font-weight: 600;">Best regards,</p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #2563eb; font-weight: 700;">Encore Leasing & Finance Corp. Team</p>
              </div>
            </div>
            <div style="background-color: #f8fafc; padding: 25px; text-align: center; border-top: 1px solid #e2e8f0;">
              <div style="margin-bottom: 15px;">
                <a href="https://encorefinancials.com/" style="color: #2563eb; text-decoration: none; font-size: 12px; font-weight: 600;">Visit our Website</a>
              </div>
              <p style="margin: 0; font-size: 11px; color: #64748b;">&copy; ${new Date().getFullYear()} Encore Leasing & Finance Corp. All rights reserved.</p>
              <p style="margin: 8px 0 0 0; font-size: 10px; color: #94a3b8;">
                (044) 940-5625 | 0919-067-7719 | 0919-077-2664<br/>
                Encore Building, Maharlika Highway, Cabanatuan City
              </p>
            </div>
          </div>
        `;

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

      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || 'Failed to send');

      const newHistory: BlastHistory = {
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleString(),
        subject,
        body,
        recipientCount: contacts.length,
        status: 'success'
      };

      setHistory([newHistory, ...history]);
      toast.success(`Blast sent to ${contacts.length} recipients!`);
      
      // Clear form and contacts after successful blast
      setSubject('');
      setBody('');
      setContacts([]);
    } catch (error: any) {
      toast.error(error.message || 'Failed to send blast');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-blue-100">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mail className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Encore</h1>
          </div>
          <div className="flex items-center gap-4">
            {configStatus && !configStatus.hasResendKey && (
              <Badge variant="destructive" className="animate-pulse">
                <AlertCircle className="w-3 h-3 mr-1" />
                Missing Resend Key
              </Badge>
            )}
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1">
              Pro Account
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="flex items-center justify-between">
            <TabsList className="bg-white border border-gray-200 p-1 h-12">
              <TabsTrigger value="compose" className="px-6 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                <Send className="w-4 h-4 mr-2" />
                Compose & Blast
              </TabsTrigger>
              <TabsTrigger value="contacts" className="px-6 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                <Users className="w-4 h-4 mr-2" />
                Recipients ({contacts.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="px-6 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                <History className="w-4 h-4 mr-2" />
                History
              </TabsTrigger>
            </TabsList>
            
            {contacts.length > 0 && (
              <Button 
                onClick={sendBlast} 
                disabled={isSending || !subject || !body}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 shadow-lg shadow-blue-200 transition-all active:scale-95"
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
                    <div className="bg-blue-600 px-6 py-4 flex items-center justify-between text-white">
                      <div className="flex items-center gap-3">
                        <FileUp className="w-5 h-5" />
                        <div>
                          <p className="font-bold leading-none">Step 1: Import Data</p>
                          <p className="text-xs text-blue-100 mt-1">Upload your CSV file to start</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Dialog open={isImporting} onOpenChange={setIsImporting}>
                          <DialogTrigger render={
                            <Button variant="secondary" size="sm" className="bg-white text-blue-600 hover:bg-blue-50 border-none">
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
                              <div className="bg-blue-50 p-3 rounded-lg flex gap-3">
                                <Info className="w-5 h-5 text-blue-600 shrink-0" />
                                <p className="text-xs text-blue-800 leading-relaxed">
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
                            onClick={() => setContacts([])}
                            className="text-white hover:bg-white/10"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                    {contacts.length > 0 && (
                      <div className="px-6 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                        <span className="text-xs font-medium text-blue-700 flex items-center">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {contacts.length} recipients loaded
                        </span>
                        <Button variant="link" className="text-[10px] h-auto p-0 text-blue-600" onClick={() => setActiveTab('contacts')}>
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
                            className="border-blue-200 text-blue-600 hover:bg-blue-50"
                          >
                            <Info className="w-4 h-4 mr-2" />
                            Preview
                          </Button>
                          <Select onValueChange={handleTemplateSelect}>
                            <SelectTrigger className="w-[200px] bg-white">
                              <BookOpen className="w-4 h-4 mr-2 text-blue-600" />
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
                          className="h-12 border-gray-200 focus:ring-blue-500"
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
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                            Optimize with AI
                          </Button>
                        </div>
                        <Textarea 
                          id="body" 
                          placeholder="Write your email here..." 
                          className="min-h-[300px] border-gray-200 focus:ring-blue-500 leading-relaxed"
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

                  <Card className="bg-blue-600 text-white border-none shadow-xl shadow-blue-200">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-white/20 rounded-lg">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold mb-1">AI Tip</p>
                          <p className="text-sm text-blue-100 leading-relaxed">
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
                              className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-md transition-all group"
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
                                    className="text-blue-600 hover:bg-blue-50"
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
            <div className="bg-white w-full max-w-[600px] shadow-sm rounded-lg overflow-hidden border border-gray-200">
              <div className="bg-blue-600 p-8 text-center">
                <h1 className="text-white text-3xl font-extrabold tracking-widest m-0">ENCORE</h1>
                <p className="text-blue-100 text-[10px] uppercase font-bold mt-1 tracking-wider">Leasing & Finance Corp.</p>
              </div>
              <div className="p-10 bg-white min-h-[200px]">
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed text-base">
                  {body ? body.replace(/#firstname/gi, 'Valued Client')
                             .replace(/#yearmodel/gi, '2024')
                             .replace(/#unit/gi, 'Toyota Fortuner')
                             .replace(/#plate/gi, 'ABC 1234')
                             .replace(/#expiry/gi, 'Dec 31, 2026')
                             .replace(/#amount/gi, '15,000.00')
                             .replace(/#ddate/gi, 'April 15, 2026')
                             .replace(/#periodicins/gi, '12,500.00')
                         : 'No content to preview.'}
                </div>
                <div className="mt-10 pt-6 border-t border-gray-100">
                  <p className="m-0 text-sm text-gray-600 font-semibold">Best regards,</p>
                  <p className="m-1 text-sm text-blue-600 font-bold">Encore Leasing & Finance Corp. Team</p>
                </div>
              </div>
              <div className="bg-gray-50 p-6 text-center border-t border-gray-100">
                <div className="mb-4">
                  <a href="https://encorefinancials.com/" className="text-blue-600 no-underline text-xs font-semibold">Visit our Website</a>
                </div>
                <p className="text-[10px] text-gray-500 m-0">&copy; {new Date().getFullYear()} Encore Leasing & Finance Corp. All rights reserved.</p>
                <p className="text-[9px] text-gray-400 mt-2 leading-relaxed">
                  (044) 940-5625 | 0919-067-7719 | 0919-077-2664<br/>
                  Encore Building, Maharlika Highway, Cabanatuan City
                </p>
              </div>
            </div>
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
