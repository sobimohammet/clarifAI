# ⚡ ClarifAI

> A conversational AI assistant powered by the Claude API — streaming responses, multi-turn context, and a system prompt editor. Built with vanilla HTML/CSS/JS and deployed as a Vercel serverless function.

[![Live Demo](https://img.shields.io/badge/Live-Demo-00f5ff?style=flat-square)](https://clarifai.vercel.app)
[![Built with Claude](https://img.shields.io/badge/Powered%20by-Claude%20API-8b2fff?style=flat-square)](https://anthropic.com)

---

## Features

- **Streaming responses** — text appears word by word as Claude generates it, just like Claude.ai
- **Multi-turn context** — the full conversation history is sent with every request so Claude remembers what was said
- **System prompt editor** — customise how the assistant behaves without touching any code
- **Markdown rendering** — headings, bold, italic, lists, blockquotes, and syntax-highlighted code blocks with copy buttons
- **Stop generation** — cancel a response mid-stream at any time
- **Token counter** — live approximate token usage for the current session
- **Suggestion chips** — one-click starter prompts on the welcome screen
- **Keyboard shortcuts** — Enter to send, Shift+Enter for a new line
- **Secure by design** — the API key lives in a Vercel serverless function, never in client-side code

---

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | HTML, CSS, Vanilla JavaScript     |
| Styling  | Custom CSS (no frameworks)        |
| Backend  | Vercel Serverless Function (Node) |
| AI       | Anthropic Claude API (Sonnet 4.6) |
| Deploy   | Vercel                            |

---

## Project Structure

```
clarifai/
├── index.html       # Chat UI — all markup
├── style.css        # Complete dark-mode styling
├── app.js           # Frontend logic: streaming, markdown, UI
├── api/
│   └── chat.js      # Serverless function — Claude API proxy
├── vercel.json      # Vercel function config
├── package.json     # Dependencies (@anthropic-ai/sdk)
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- An [Anthropic API key](https://console.anthropic.com)
- A [Vercel account](https://vercel.com)

### Run locally

```bash
# 1. Clone the repo
git clone https://github.com/sobimohamed/clarifai.git
cd clarifai

# 2. Install dependencies
npm install

# 3. Create your environment file
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env.local

# 4. Start the Vercel dev server (runs both frontend + API function)
npx vercel dev
```

Open `http://localhost:3000` in your browser.

> **Note:** You must use `npx vercel dev` — opening `index.html` directly won't work because the `/api/chat` endpoint won't be available.

---

## Deploying to Vercel

```bash
# Push to GitHub first, then:
npx vercel --prod
```

Or connect your GitHub repo in the Vercel dashboard for automatic deployments on every push.

**Set your environment variable in Vercel:**

1. Go to your project in the [Vercel Dashboard](https://vercel.com/dashboard)
2. Settings → Environment Variables
3. Add: `ANTHROPIC_API_KEY` = `sk-ant-your-key-here`
4. Redeploy

---

## Customisation

### Change the model

In `api/chat.js`, update the `model` field:

```js
model: 'claude-sonnet-4-6',   // default
// model: 'claude-opus-4-6',  // most capable
// model: 'claude-haiku-4-5-20251001', // fastest & cheapest
```

### Change the default system prompt

Edit the `systemPrompt` fallback in `api/chat.js`, or use the in-app system prompt editor (the ⚙ icon in the header).

### Suggestion chips

Edit the `data-prompt` attributes on `.suggestion-chip` elements in `index.html`.

---

## How It Works

```
User types a message
       ↓
app.js builds the conversation history array
       ↓
POST /api/chat  { messages, systemPrompt }
       ↓
api/chat.js calls Anthropic with stream: true
       ↓
Text deltas streamed back as SSE events  (data: {"text": "..."})
       ↓
app.js reads the stream, re-renders markdown on each chunk
       ↓
[DONE] event closes the stream
       ↓
Final message appended to conversation history
```

---

## License

MIT — use it, fork it, build on it.

---

*Part of [DEVFOLIO OS](https://devfolio-os.vercel.app) — built by Sobi Mohamed*