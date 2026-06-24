import express from 'express';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
      console.log(`Loaded company logo in Vercel API from local file: ${localPngPath} (${fileContent.length} bytes)`);
      return { base64: cachedLogoBase64, type: cachedLogoType };
    }

    const localSvgPath = path.join(process.cwd(), 'public', 'assets', 'img', 'logo.svg');
    if (fs.existsSync(localSvgPath)) {
      const fileContent = fs.readFileSync(localSvgPath);
      cachedLogoBase64 = fileContent.toString('base64');
      cachedLogoType = 'image/svg+xml';
      console.log(`Loaded company logo in Vercel API from local file: ${localSvgPath} (${fileContent.length} bytes)`);
      return { base64: cachedLogoBase64, type: cachedLogoType };
    }
  } catch (err) {
    console.warn('Vercel API error reading local logo file:', err);
  }

  // Fallback gracefully to our beautiful built-in vector representation
  cachedLogoBase64 = fallbackBase64;
  cachedLogoType = fallbackType;
  return { base64: cachedLogoBase64, type: cachedLogoType };
}

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

// API Router
const router = express.Router();

router.get('/config-status', async (req, res) => {
  res.json({
    hasSmtpConfig: !!process.env.BREVO_API_KEY,
    smtpWorking: !!process.env.BREVO_API_KEY,
    smtpError: null,
    hasGeminiKey: !!process.env.GEMINI_API_KEY
  });
});

router.post('/generate-content', async (req, res) => {
  const { subject, templateStyle } = req.body;
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

    let promptContext = 'a professional email body';
    if (templateStyle === 'marketing') {
      promptContext = 'an engaging, high-converting marketing announcement with a strong call-to-action';
    } else if (templateStyle === 'birthday') {
      promptContext = 'a warm, celebratory birthday greeting';
    } else if (templateStyle === 'announcement') {
      promptContext = 'a clear, professional company announcement or news update';
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Write ${promptContext} for the subject: "${subject}". Keep it concise, engaging, and professional. Return only the email body text.`,
    });

    res.json({ text: response.text || '' });
  } catch (error: any) {
    console.error('Gemini content generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate content' });
  }
});

router.post('/send-blast', async (req, res) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Brevo API key (BREVO_API_KEY) is not fully configured on the server.' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No messages provided.' });
  }

  try {
    const results: any[] = [];
    const validMessages: any[] = [];

    // 1. Process, validate, and sanitize each message
    for (const msg of messages) {
      let recipient = '';
      if (Array.isArray(msg.to)) {
        recipient = typeof msg.to[0] === 'string' ? msg.to[0].trim() : '';
      } else if (typeof msg.to === 'string') {
        recipient = msg.to.trim();
      }

      // Clean email format regex validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!recipient || !emailRegex.test(recipient)) {
        console.warn(`[send-blast] Skipping invalid email address: ${recipient || 'empty'}`);
        results.push({
          to: msg.to || recipient,
          success: false,
          id: null,
          error: 'Invalid or empty email address format'
        });
        continue;
      }

      // Clean output HTML body to replace relative paths with hosted logo URL
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

    // If no valid messages left to send, return immediately
    if (validMessages.length === 0) {
      return res.json({ results });
    }

    console.log(`[send-blast] Attempting to send ${validMessages.length} valid message(s) sequentially with Brevo API...`);
    const fallbackSenderAddress = 'no-reply@encorefinancials.com';
    const fromName = 'Encore Financials';

    for (const msg of validMessages) {
      try {
        // Apply a small sleep to strictly avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

        const payload = {
          sender: { name: fromName, email: fallbackSenderAddress },
          to: [{ email: msg.to }],
          subject: msg.subject,
          htmlContent: msg.htmlBody
        };

        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const responseData = await response.json().catch(() => null);

        if (!response.ok) {
          console.error(`[send-blast] Brevo API rejected sending for ${msg.to}:`, responseData);
          results.push({
            to: msg.originalTo,
            success: false,
            id: null,
            error: `Rejected by Brevo API: ${responseData?.message || response.statusText}`
          });
        } else {
          console.log(`[send-blast] Brevo API sending info for ${msg.to}:`, responseData);
          results.push({
            to: msg.originalTo,
            success: true,
            id: responseData?.messageId || null,
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

    console.log(`[send-blast] Send completed for ${validMessages.length} message(s).`);
    res.json({ results });
  } catch (error) {
    console.error('Blast Error:', error);
    res.status(500).json({ error: 'Failed to send blast' });
  }
});

// Register on both /api and / to handle Vercel's path rewriting seamlessly
app.use('/api', router);
app.use('/', router);

export default app;
