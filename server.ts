import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
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

      // Helper function for individual fallback if batch endpoint raises unexpected exceptions
      const sendIndividualFallback = async (messagesList: any[]) => {
        const fallbackResults = [];
        for (const msg of messagesList) {
          try {
            // Apply a small sleep of 150ms to strictly avoid any rate limits of single sending
            await new Promise(resolve => setTimeout(resolve, 150));
            const individualRes = await activeResend.emails.send({
              from: 'Encore <no-reply@encorefinancials.com>',
              to: msg.to,
              subject: msg.subject,
              html: msg.htmlBody
            });

            if (individualRes && individualRes.error) {
              console.error(`Resend returned error in individual fallback for ${msg.to}:`, individualRes.error);
              fallbackResults.push({
                to: msg.originalTo,
                success: false,
                id: null,
                error: individualRes.error.message || 'Unknown Resend error'
              });
            } else {
              fallbackResults.push({
                to: msg.originalTo,
                success: true,
                id: individualRes?.data?.id || (individualRes as any)?.id || null,
                error: null
              });
            }
          } catch (individualErr: any) {
            console.error(`Exception during individual fallback for ${msg.to}:`, individualErr);
            fallbackResults.push({
              to: msg.originalTo,
              success: false,
              id: null,
              error: individualErr.message || String(individualErr)
            });
          }
        }
        return fallbackResults;
      };

      try {
        console.log(`[send-blast] Attempting batch send for ${validMessages.length} valid message(s)...`);

        const batchPayload = validMessages.map(msg => ({
          from: 'Encore <no-reply@encorefinancials.com>',
          to: msg.to,
          subject: msg.subject,
          html: msg.htmlBody
        }));

        const batchResult = await activeResend.batch.send(batchPayload);

        if (batchResult && batchResult.error) {
          console.warn(`Resend Batch API returned error, activating individual fallback:`, batchResult.error);
          const fallbackResults = await sendIndividualFallback(validMessages);
          results.push(...fallbackResults);
        } else {
          // Success! Process each response item mapping 1-to-1
          const batchData = batchResult?.data || [];
          validMessages.forEach((msg, idx) => {
            const dataItem = batchData[idx];
            if (dataItem && dataItem.error) {
              results.push({
                to: msg.originalTo,
                success: false,
                id: null,
                error: dataItem.error.message || 'Unknown batch item sending error'
              });
            } else {
              results.push({
                to: msg.originalTo,
                success: true,
                id: dataItem?.id || null,
                error: null
              });
            }
          });
          console.log(`[send-blast] Batch send completed successfully for ${validMessages.length} message(s).`);
        }
      } catch (batchException: any) {
        console.warn(`Resend Batch API crashed during request, activating individual fallback:`, batchException);
        const fallbackResults = await sendIndividualFallback(validMessages);
        results.push(...fallbackResults);
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
