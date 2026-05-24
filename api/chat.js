/* ═══════════════════════════════════════════════════════════
   ClarifAI — api/chat.js
   Vercel Serverless Function
   Proxies requests to the Anthropic API with SSE streaming.
   The ANTHROPIC_API_KEY never leaves the server.
   ═══════════════════════════════════════════════════════════ */

const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {

  /* ── CORS preflight ─────────────────────────────────────── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* ── Validate request ───────────────────────────────────── */
  const { messages, systemPrompt } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in environment variables' });
  }

  /* ── Set up SSE streaming headers ───────────────────────── */
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');    // disable Nginx buffering on Vercel

  /* ── Stream from Anthropic ──────────────────────────────── */
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt ||
        'You are ClarifAI, a sharp and direct AI assistant. You give clear, accurate answers without unnecessary padding. When writing code, always use code blocks. Be concise but never at the expense of completeness.',
      messages,
    });

    /* Stream text deltas to the client as SSE events */
    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    /* Wait for the stream to finish */
    await stream.finalMessage();

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('[ClarifAI API]', err.message);

    /* If headers already sent, send error as SSE event */
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message || 'Anthropic API error' });
    }
  }
};