import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { Resend } from 'resend';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Resend initialization
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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

    try {
      console.log('Attempting to pre-fetch corporate logo from official domain...');
      const response = await fetch('https://encorefinancials.com/wp-content/uploads/2021/06/Encore-Logo-1.png', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': 'https://encorefinancials.com/'
        }
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        cachedLogoType = response.headers.get('content-type') || 'image/png';
        cachedLogoBase64 = Buffer.from(arrayBuffer).toString('base64');
        console.log(`Corporate logo cached successfully (${cachedLogoBase64.length} bytes, type: ${cachedLogoType})`);
        return { base64: cachedLogoBase64, type: cachedLogoType };
      } else {
        console.warn(`Failed to fetch logo from official domain (HTTP Status: ${response.status}). Activating high-fidelity vector corporate logo fallback...`);
      }
    } catch (error) {
      console.warn('Error fetching logo from official domain, activating high-fidelity vector corporate logo fallback...', error);
    }

    // Fallback gracefully to our beautiful built-in vector representation
    cachedLogoBase64 = fallbackBase64;
    cachedLogoType = fallbackType;
    return { base64: cachedLogoBase64, type: cachedLogoType };
  }

  // Pre-fetch on startup to warm cache
  getLogoAsBase64();

  // API Routes
  app.get('/api/config-status', (req, res) => {
    res.json({
      hasResendKey: !!process.env.RESEND_API_KEY,
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

  app.post('/api/send-blast', async (req, res) => {
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'RESEND_API_KEY is not configured on the server.' });
    }
    const activeResend = new Resend(process.env.RESEND_API_KEY);

    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided.' });
    }

    try {
      // Ensure logo cache is populated/active
      const logoData = await getLogoAsBase64();

      // Resend batch API supports up to 100 emails per call
      // For more, we would need to chunk it
      const CHUNK_SIZE = 100;
      const results = [];
      
      for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        const chunk = messages.slice(i, i + CHUNK_SIZE).map((msg: any) => {
          let emailHtml = msg.body;
          const attachments: any[] = [];
          
          if (logoData) {
            const targetUrl = 'https://encorefinancials.com/wp-content/uploads/2021/06/Encore-Logo-1.png';
            if (emailHtml.includes(targetUrl)) {
              // Replace all occurrences of the WordPress URL with our inline Attachment CID reference
              emailHtml = emailHtml.split(targetUrl).join('cid:logo');
              attachments.push({
                filename: 'logo.png',
                content: Buffer.from(logoData.base64, 'base64'),
                cid: 'logo',
                contentType: logoData.type || 'image/png'
              });
            }
          }

          const msgPayload: any = {
            from: 'Encore <no-reply@encorefinancials.com>',
            to: msg.to,
            subject: msg.subject,
            html: emailHtml,
          };

          if (attachments.length > 0) {
            msgPayload.attachments = attachments;
          }

          return msgPayload;
        });
        
        const { data, error } = await activeResend.batch.send(chunk);
        results.push({ data, error });
      }

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
