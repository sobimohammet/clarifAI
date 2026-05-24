/* ═══════════════════════════════════════════════════════════
   ClarifAI — app.js
   Handles: chat state, streaming, markdown rendering, UI
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ── DOM references ─────────────────────────────────────── */
const messagesEl      = document.getElementById('messages');
const welcomeScreen   = document.getElementById('welcomeScreen');
const userInput       = document.getElementById('userInput');
const sendBtn         = document.getElementById('sendBtn');
const clearBtn        = document.getElementById('clearBtn');
const tokenCountEl    = document.getElementById('tokenCount');
const modelDot        = document.getElementById('modelDot');
const sysPromptToggle = document.getElementById('sysPromptToggle');
const sysPromptPanel  = document.getElementById('sysPromptPanel');
const sysPromptInput  = document.getElementById('sysPromptInput');
const sysPromptApply  = document.getElementById('sysPromptApply');
const suggestionChips = document.querySelectorAll('.suggestion-chip');

/* ── App state ──────────────────────────────────────────── */
let conversationHistory = [];
let isStreaming         = false;
let abortController     = null;
let totalTokens         = 0;

/* ── Init ───────────────────────────────────────────────── */
modelDot.classList.add('online');
userInput.focus();

/* ── System prompt panel ────────────────────────────────── */
sysPromptToggle.addEventListener('click', () => {
  const isOpen = sysPromptPanel.classList.toggle('open');
  sysPromptToggle.classList.toggle('active', isOpen);
  sysPromptToggle.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) sysPromptInput.focus();
});

sysPromptApply.addEventListener('click', () => {
  sysPromptPanel.classList.remove('open');
  sysPromptToggle.classList.remove('active');
  sysPromptToggle.setAttribute('aria-expanded', 'false');
});

/* ── Clear conversation ─────────────────────────────────── */
clearBtn.addEventListener('click', () => {
  if (isStreaming) stopStream();
  conversationHistory = [];
  totalTokens = 0;
  tokenCountEl.textContent = '0';
  messagesEl.innerHTML = '';
  welcomeScreen.style.display = '';
  userInput.value = '';
  updateSendBtn();
  userInput.focus();
});

/* ── Suggestion chips ───────────────────────────────────── */
suggestionChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const prompt = chip.dataset.prompt;
    if (prompt && !isStreaming) {
      userInput.value = prompt;
      autoResize();
      updateSendBtn();
      sendMessage();
    }
  });
});

/* ── Textarea: auto-resize ──────────────────────────────── */
userInput.addEventListener('input', () => {
  autoResize();
  updateSendBtn();
});

function autoResize() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 180) + 'px';
}

function updateSendBtn() {
  sendBtn.disabled = !userInput.value.trim().length && !isStreaming;
}

/* ── Keyboard: Enter sends, Shift+Enter = newline ───────── */
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

/* ── Send / Stop button ─────────────────────────────────── */
sendBtn.addEventListener('click', () => {
  if (isStreaming) stopStream();
  else sendMessage();
});

function stopStream() {
  if (abortController) { abortController.abort(); abortController = null; }
  setStreamingState(false);
}

/* ── Core: send message ─────────────────────────────────── */
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  if (conversationHistory.length === 0) welcomeScreen.style.display = 'none';

  conversationHistory.push({ role: 'user', content: text });
  appendMessage('user', text);

  userInput.value = '';
  userInput.style.height = 'auto';
  updateSendBtn();
  scrollToBottom();

  await streamResponse();
}

/* ── Stream response ────────────────────────────────────── */
async function streamResponse() {
  setStreamingState(true);
  abortController = new AbortController();

  const { bubble, contentEl, cursorEl } = appendStreamingMessage();
  let fullText = '';
  let firstChunk = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal,
      body: JSON.stringify({
        messages: conversationHistory,
        systemPrompt: sysPromptInput.value.trim(),
      }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) {
            if (firstChunk) { contentEl.innerHTML = ''; firstChunk = false; }
            fullText += parsed.text;
            contentEl.innerHTML = renderMarkdown(fullText);
            contentEl.appendChild(cursorEl);
            attachCopyHandlers(contentEl);
            estimateTokens(fullText);
            scrollToBottom();
          }
        } catch (_) { /* ignore partial JSON */ }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      fullText = fullText || '_(response stopped)_';
    } else {
      fullText = `**Error:** ${err.message}\n\nCheck that your API key is set in Vercel environment variables.`;
      bubble.style.setProperty('background', 'rgba(255,60,60,0.06)');
      bubble.style.setProperty('border-color', 'rgba(255,60,60,0.2)');
      console.error('[ClarifAI]', err);
    }
  }

  cursorEl.remove();
  contentEl.innerHTML = renderMarkdown(fullText || '_(empty response)_');
  attachCopyHandlers(contentEl);

  if (fullText && fullText !== '_(response stopped)_') {
    conversationHistory.push({ role: 'assistant', content: fullText });
  }

  setStreamingState(false);
  scrollToBottom();
}

/* ── UI helpers ─────────────────────────────────────────── */
function setStreamingState(on) {
  isStreaming = on;
  modelDot.className = 'model-dot ' + (on ? 'loading' : 'online');
  sendBtn.classList.toggle('streaming', on);
  sendBtn.disabled = false;
  userInput.disabled = on;
  if (!on) { userInput.focus(); updateSendBtn(); }
}

function scrollToBottom() {
  const main = document.getElementById('chatMain');
  requestAnimationFrame(() => { main.scrollTop = main.scrollHeight; });
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function estimateTokens(text) {
  totalTokens = Math.ceil(
    conversationHistory.reduce((acc, m) => acc + m.content.length, 0) / 4
  );
  tokenCountEl.textContent = totalTokens.toLocaleString();
}

/* ── Append user message ────────────────────────────────── */
function appendMessage(role, text) {
  const msg     = document.createElement('div');
  msg.className = `msg ${role}`;

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span class="msg-role">${role === 'user' ? 'YOU' : 'CLARIFAI'}</span>
                    <span class="msg-time">${formatTime()}</span>`;

  const bubble     = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;

  msg.appendChild(meta);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  return { msg, bubble };
}

/* ── Append streaming AI message (starts with typing dots) ── */
function appendStreamingMessage() {
  const msg     = document.createElement('div');
  msg.className = 'msg ai';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span class="msg-role">CLARIFAI</span>
                    <span class="msg-time">${formatTime()}</span>`;

  const bubble     = document.createElement('div');
  bubble.className = 'msg-bubble';

  const contentEl     = document.createElement('div');
  contentEl.className = 'msg-content';
  contentEl.innerHTML = `<div class="typing-indicator">
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  </div>`;

  const cursorEl     = document.createElement('span');
  cursorEl.className = 'stream-cursor';

  bubble.appendChild(contentEl);
  msg.appendChild(meta);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);

  return { msg, bubble, contentEl, cursorEl };
}

/* ── Copy handlers for code blocks ─────────────────────── */
function attachCopyHandlers(container) {
  container.querySelectorAll('.copy-btn').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', async () => {
      const code = btn.closest('.code-block-wrapper')?.querySelector('code');
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.textContent);
        btn.textContent = 'COPIED';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'COPY'; btn.classList.remove('copied'); }, 2000);
      } catch {
        btn.textContent = 'FAILED';
        setTimeout(() => { btn.textContent = 'COPY'; }, 2000);
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   Markdown renderer
   ═══════════════════════════════════════════════════════════ */
function renderMarkdown(raw) {
  if (!raw) return '';

  const lines  = raw.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* Fenced code block */
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const lang = fence[1] || 'text';
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++; }
      blocks.push({ type: 'code', lang, content: code.join('\n') });
      i++;
      continue;
    }

    /* Heading */
    const h = line.match(/^(#{1,3})\s+(.+)/);
    if (h) { blocks.push({ type: 'heading', level: h[1].length, content: h[2] }); i++; continue; }

    /* HR */
    if (line.match(/^[-*_]{3,}\s*$/)) { blocks.push({ type: 'hr' }); i++; continue; }

    /* Blockquote */
    if (line.startsWith('> ')) {
      const q = [];
      while (i < lines.length && lines[i].startsWith('> ')) { q.push(lines[i].slice(2)); i++; }
      blocks.push({ type: 'blockquote', content: q.join('\n') });
      continue;
    }

    /* Unordered list */
    if (line.match(/^[-*+]\s/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*+]\s/)) { items.push(lines[i].replace(/^[-*+]\s/, '')); i++; }
      blocks.push({ type: 'ul', items });
      continue;
    }

    /* Ordered list */
    if (line.match(/^\d+\.\s/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      blocks.push({ type: 'ol', items });
      continue;
    }

    /* Empty line */
    if (line.trim() === '') { i++; continue; }

    /* Paragraph */
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^(#{1,3}\s|```|[-*+]\s|\d+\.\s|> |[-*_]{3,})/)
    ) { para.push(lines[i]); i++; }
    if (para.length) blocks.push({ type: 'para', content: para.join('\n') });
  }

  return blocks.map(b => {
    switch (b.type) {
      case 'code':
        return `<div class="code-block-wrapper">
          <div class="code-header">
            <span class="code-lang">${esc(b.lang)}</span>
            <button class="copy-btn" type="button">COPY</button>
          </div>
          <pre><code>${esc(b.content)}</code></pre>
        </div>`;
      case 'heading':   return `<h${b.level}>${inline(b.content)}</h${b.level}>`;
      case 'hr':        return '<hr>';
      case 'blockquote':return `<blockquote>${renderMarkdown(b.content)}</blockquote>`;
      case 'ul':        return `<ul>${b.items.map(it => `<li>${inline(it)}</li>`).join('')}</ul>`;
      case 'ol':        return `<ol>${b.items.map(it => `<li>${inline(it)}</li>`).join('')}</ol>`;
      case 'para':      return `<p>${inline(b.content)}</p>`;
      default:          return '';
    }
  }).join('');
}

function inline(text) {
  /* protect inline code */
  const slots = [];
  text = text.replace(/`([^`]+)`/g, (_, c) => { slots.push(`<code>${esc(c)}</code>`); return `\x00${slots.length-1}\x00`; });
  /* links */
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`);
  /* bold */
  text = text.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a||b}</strong>`);
  /* italic */
  text = text.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)|(?<!\w)_([^_\n]+)_(?!\w)/g, (_, a, b) => `<em>${a||b}</em>`);
  /* line breaks */
  text = text.replace(/  \n|\n/g, ' ');
  /* restore code */
  text = text.replace(/\x00(\d+)\x00/g, (_, i) => slots[+i]);
  return text;
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}