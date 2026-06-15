import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import cron from 'node-cron';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Nodemailer transporter initialization
  const getTransporter = () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return null;
    }
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  };

  // Cache for the company logo to avoid fetching on every single email
  let cachedLogoBase64: string | null = null;
  let cachedLogoType: string = 'image/png';

  // High-fidelity standard SVG branding brand asset to use as a fallback
  const fallbackSvgLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 120" width="500" height="120">
    <g transform="translate(10, 10)">
      <path d="M 15 15 L 75 15 L 90 55 L 30 55 Z" fill="#102CA4" />
      <path d="M 40 62 L 100 62 L 115 102 L 55 102 Z" fill="#D4AF37" />
      <rect x="15" y="56" width="85" height="4" fill="#102CA4" opacity="0.35" />
      <text x="135" y="58" font-family="'Inter', 'Segoe UI', Arial, sans-serif" font-weight="900" font-size="44" letter-spacing="5" fill="#102CA4">ENCORE</text>
      <text x="137" y="90" font-family="'Inter', 'Segoe UI', Arial, sans-serif" font-weight="700" font-size="16" letter-spacing="2" fill="#5c6f84">LEASING &amp; FINANCE CORP.</text>
    </g>
  </svg>`;

  const fallbackBase64 = Buffer.from(fallbackSvgLogo).toString('base64');
  const fallbackType = 'image/svg+xml';

  async function getLogoAsBase64() {
    if (cachedLogoBase64) {
      return { base64: cachedLogoBase64, type: cachedLogoType };
    }

    // Prefer a local PNG for CID/email clients, then fall back to SVG if PNG is unavailable.
    try {
      const localPngPath = path.join(process.cwd(), 'public', 'assets', 'img', 'logo.png');
      if (fs.existsSync(localPngPath)) {
        const fileContent = fs.readFileSync(localPngPath);
        cachedLogoBase64 = fileContent.toString('base64');
        cachedLogoType = 'image/png';
        console.log(`Loaded company logo from local file: ${localPngPath} (${fileContent.length} bytes)`);
        return { base64: cachedLogoBase64, type: cachedLogoType };
      }

      const localSvgPath = path.join(process.cwd(), 'public', 'assets', 'img', 'logo.svg');
      if (fs.existsSync(localSvgPath)) {
        const fileContent = fs.readFileSync(localSvgPath);
        cachedLogoBase64 = fileContent.toString('base64');
        cachedLogoType = 'image/svg+xml';
        console.log(`Loaded company logo from local file: ${localSvgPath} (${fileContent.length} bytes)`);
        return { base64: cachedLogoBase64, type: cachedLogoType };
      }
    } catch (err) {
      console.warn('Error reading local logo file:', err);
    }

    // Fallback gracefully to our built-in vector representation
    cachedLogoBase64 = fallbackBase64;
    cachedLogoType = fallbackType;
    return { base64: cachedLogoBase64, type: cachedLogoType };
  }

  // Pre-fetch on startup to warm cache
  getLogoAsBase64();

  // API Routes
  app.get('/api/config-status', async (req, res) => {
    let smtpVerify = false;
    let smtpError = null;

    try {
      const transporter = getTransporter();
      if (transporter) {
        await transporter.verify();
        smtpVerify = true;
      }
    } catch (error: any) {
      smtpError = error.message || 'Verification failed';
      console.error('SMTP test connection failed:', error);
    }

    res.json({
      hasSmtpConfig: !!process.env.SMTP_HOST && !!process.env.SMTP_USER,
      smtpWorking: smtpVerify,
      smtpError: smtpError,
      hasGeminiKey: !!process.env.GEMINI_API_KEY
    });
  });

  app.post('/api/generate-content', async (req, res) => {
    const { subject } = req.body;
    if (!subject) {
      return res.status(400).json({ error: 'Subject is required.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Write a professional marketing email body for the subject: "${subject}". Keep it concise, engaging, and include a call to action. Return only the email body text.`,
      });

      res.json({ text: response.text || '' });
    } catch (error: any) {
      console.error('Gemini content generation error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate content' });
    }
  });

const SCHEDULED_JOBS_FILE = path.join(process.cwd(), 'scheduled_jobs.json');

function loadScheduledJobs(): any[] {
  try {
    if (fs.existsSync(SCHEDULED_JOBS_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULED_JOBS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading scheduled jobs:', err);
  }
  return [];
}

function saveScheduledJobs(jobs: any[]) {
  try {
    fs.writeFileSync(SCHEDULED_JOBS_FILE, JSON.stringify(jobs, null, 2));
  } catch (err) {
    console.error('Error saving scheduled jobs:', err);
  }
}

async function processEmailMessages(transporter: any, messages: any[]): Promise<any[]> {
  const results: any[] = [];
  const validMessages: any[] = [];

  for (const msg of messages) {
    let recipient = '';
    if (Array.isArray(msg.to)) {
      recipient = typeof msg.to[0] === 'string' ? msg.to[0].trim() : '';
    } else if (typeof msg.to === 'string') {
      recipient = msg.to.trim();
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!recipient || !emailRegex.test(recipient)) {
      console.warn(`[send-blast/schedule] Skipping invalid email address: ${recipient || 'empty'}`);
      results.push({
        to: msg.to || recipient,
        success: false,
        id: null,
        error: 'Invalid or empty email address format'
      });
      continue;
    }

    let emailHtml = msg.body;
    const possibleUrls = [
      'https://encorefinancials.com/assets/images/application-settings/logo-dark.png',
      'https://encorefinancials.com/wp-content/uploads/2021/06/Encore-Logo-1.png',
      '/assets/img/logo.png',
      '/assets/img/logo.svg',
      'logo.png',
      'logo.svg'
    ];
    
    for (const url of possibleUrls) {
      if (emailHtml.includes(url)) {
        emailHtml = emailHtml.split(url).join('https://encorefinancials.com/assets/images/application-settings/logo-dark.png');
      }
    }

    validMessages.push({
      to: recipient,
      subject: msg.subject,
      htmlBody: emailHtml,
      originalTo: msg.to
    });
  }

  if (validMessages.length === 0) {
    return results;
  }

  console.log(`Attempting to send ${validMessages.length} valid message(s) sequentially with Nodemailer...`);
  const smtpUser = process.env.SMTP_USER || 'no-reply@encorefinancials.com';
  const fallbackSenderAddress = 'no-reply@encorefinancials.com';
  const fromName = 'Encore Leasing and Finance Corp.';
  const fromAddress = process.env.SMTP_FROM && process.env.SMTP_FROM.includes('<') 
    ? process.env.SMTP_FROM 
    : { name: fromName, address: fallbackSenderAddress };

  for (const msg of validMessages) {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const info = await transporter.sendMail({
        from: fromAddress,
        replyTo: fallbackSenderAddress,
        to: msg.to,
        subject: msg.subject,
        text: msg.htmlBody ? msg.htmlBody.replace(/<[^>]+>/g, '') : '',
        html: msg.htmlBody
      });

      console.log(`Nodemailer sending info for ${msg.to}:`, info);

      if (info.rejected && info.rejected.length > 0) {
        results.push({
          to: msg.originalTo,
          success: false,
          id: info.messageId || null,
          error: `Rejected by SMTP: ${info.response}`
        });
      } else {
        results.push({
          to: msg.originalTo,
          success: true,
          id: info.messageId || null,
          error: null
        });
      }
    } catch (individualErr: any) {
      console.error(`Exception during sending for ${msg.to}:`, individualErr);
      results.push({
        to: msg.originalTo,
        success: false,
        id: null,
        error: individualErr.message || String(individualErr)
      });
    }
  }

  return results;
}

  // Cron job to process scheduled blasts
  cron.schedule('* * * * *', async () => {
    const jobs = loadScheduledJobs();
    const now = new Date();
    let madeChanges = false;
    
    for (const job of jobs) {
      if (job.status === 'pending' && new Date(job.scheduledFor) <= now) {
        console.log(`Processing scheduled job ${job.id}...`);
        job.status = 'processing';
        saveScheduledJobs(jobs); // Persist immediately so another tick doesn't pick it up
        
        try {
          const transporter = getTransporter();
          if (transporter) {
            const results = await processEmailMessages(transporter, job.messages);
            job.status = 'completed';
            job.results = results;
          } else {
            job.status = 'failed';
            job.error = 'SMTP credentials not configured';
          }
        } catch (err: any) {
          console.error(`Error processing scheduled job ${job.id}:`, err);
          job.status = 'failed';
          job.error = err.message;
        }
        
        job.processedAt = new Date().toISOString();
        madeChanges = true;
      }
    }
    
    if (madeChanges) {
      saveScheduledJobs(jobs);
    }
  });

  app.post('/api/schedule-blast', async (req, res) => {
    const { messages, scheduledFor } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided.' });
    }
    if (!scheduledFor) {
      return res.status(400).json({ error: 'No scheduledFor time provided.' });
    }
    
    const jobs = loadScheduledJobs();
    const newJob = {
      id: Math.random().toString(36).substring(2, 15) + Date.now().toString(36),
      createdAt: new Date().toISOString(),
      scheduledFor,
      messages,
      status: 'pending'
    };
    
    jobs.push(newJob);
    saveScheduledJobs(jobs);
    
    res.json({ success: true, jobId: newJob.id, scheduledFor: newJob.scheduledFor });
  });

  app.post('/api/send-blast', async (req, res) => {
    const transporter = getTransporter();
    if (!transporter) {
      return res.status(500).json({ error: 'SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) are not fully configured on the server.' });
    }

    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided.' });
    }

    try {
      const results = await processEmailMessages(transporter, messages);
      res.json({ results });
    } catch (error) {
      console.error('Blast Error:', error);
      res.status(500).json({ error: 'Failed to send blast' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
