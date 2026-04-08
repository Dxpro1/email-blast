import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Resend initialization
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

  // API Routes
  app.get('/api/config-status', (req, res) => {
    res.json({
      hasResendKey: !!process.env.RESEND_API_KEY,
      hasGeminiKey: !!process.env.GEMINI_API_KEY
    });
  });

  app.post('/api/send-blast', async (req, res) => {
    if (!resend) {
      return res.status(500).json({ error: 'RESEND_API_KEY is not configured on the server.' });
    }

    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided.' });
    }

    try {
      // Resend batch API supports up to 100 emails per call
      // For more, we would need to chunk it
      const CHUNK_SIZE = 100;
      const results = [];
      
      for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        const chunk = messages.slice(i, i + CHUNK_SIZE).map((msg: any) => ({
          from: 'Encore <no-reply@encorefinancials.com>',
          to: msg.to,
          subject: msg.subject,
          html: msg.body,
        }));
        
        const { data, error } = await resend.batch.send(chunk);
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
