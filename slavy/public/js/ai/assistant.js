// Slavy Agent panel: a docked conversational assistant that can read and (with confirmation) change CRM data.
import { h, icon, mount, clear, toast, store } from '../lib.js';
import { POST, me, objForId, state } from '../api.js';
import { renderMarkdown } from './markdown.js';
import { aiStatus, canGenerate } from './status.js';

let panel = null;
let convo = [];       // canonical messages exchanged with the server
let view = [];        // display items: { kind: 'user'|'assistant'|'steps'|'pending'|'error', ... }
let busy = false;
let status = null;

const storeKey = () => `agent:${me()?.Id}`;
function persist() { store.set(storeKey(), { convo: convo.slice(-40), view: view.slice(-60) }); }
function restore() { const s = store.get(storeKey()); convo = s?.convo || []; view = s?.view || []; }

function currentRecordId() {
  const m = /^#\/r\/([A-Za-z0-9]{15})/.exec(location.hash);
  return m ? m[1] : null;
}

export function isAssistantOpen() { return !!panel; }

export async function toggleAssistant(prefill) {
  if (panel && !prefill) { closeAssistant(); return; }
  if (!panel) await openAssistant();
  if (prefill) send(prefill);
}

export function closeAssistant() {
  panel?.remove();
  panel = null;
  document.body.classList.remove('assistant-open');
  window.removeEventListener('hashchange', drawContext);
}

async function openAssistant() {
  status = await aiStatus({ refresh: true });
  restore();
  panel = h('aside', { class: 'agent-panel', role: 'complementary', 'aria-label': 'Slavy Agent' });
  document.body.appendChild(panel);
  document.body.classList.add('assistant-open');
  window.addEventListener('hashchange', drawContext);
  drawPanel();
}

let bodyEl, inputEl, contextEl, sendBtn;

function drawPanel() {
  const name = status?.agent?.name || 'Slavy Agent';
  bodyEl = h('div', { class: 'assistant-body', 'aria-live': 'polite' });
  contextEl = h('div', { class: 'assistant-context' });
  inputEl = h('textarea', { class: 'input', rows: 2, placeholder: `Ask ${name} anything about your records...`, 'aria-label': 'Message',
    onKeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } });
  sendBtn = h('button', { class: 'btn btn-brand btn-icon', 'aria-label': 'Send', onClick: () => send() }, icon('send'));
  mount(panel,
    h('div', { class: 'assistant-header' },
      h('span', { class: 'ai-mark' }, icon('sparkles')),
      h('div', { class: 'grow' }, h('div', { class: 'strong' }, name), h('div', { class: 'tiny muted' }, status?.enabled ? `${status.providerLabel} · ${status.model}` : 'AI not configured')),
      h('button', { class: 'btn btn-ghost btn-icon', title: 'New conversation', 'aria-label': 'New conversation', onClick: resetConversation }, icon('refresh')),
      h('button', { class: 'btn btn-ghost btn-icon', title: 'Close', 'aria-label': 'Close assistant', onClick: closeAssistant }, icon('x'))),
    bodyEl,
    h('div', { class: 'assistant-footer' }, contextEl, h('div', { class: 'row top gap-8' }, inputEl, sendBtn),
      h('div', { class: 'tiny muted mt-8' }, 'AI can make mistakes. Changes always ask for your confirmation first.')));
  drawContext();
  drawBody();
  setTimeout(() => inputEl.focus(), 50);
}

function drawContext() {
  if (!contextEl) return;
  const id = currentRecordId();
  clear(contextEl);
  if (!id) return;
  const obj = objForId(id);
  const title = document.title.split(' | ')[0];
  contextEl.appendChild(h('span', { class: 'pill' }, icon('eye', { size: 12 }), ` ${obj?.label || 'Record'}: ${title}`));
}

function resetConversation() {
  convo = []; view = [];
  persist();
  drawBody();
}

function drawBody() {
  clear(bodyEl);
  if (!canGenerate(status, 'agent')) {
    bodyEl.appendChild(h('div', { class: 'assistant-empty' }, h('span', { class: 'ai-mark lg' }, icon('sparkles')),
      h('h3', status?.canUse === false ? 'AI is not available to you' : 'Connect an AI provider'),
      h('p', { class: 'muted' }, status?.canUse === false ? 'Ask your administrator for the "Use AI Features" permission.'
        : 'An administrator can connect Claude, ChatGPT or Gemini with an API key in Setup → AI Settings.'),
      status?.canManage ? h('a', { class: 'btn btn-brand', href: '#/setup/ai', onClick: closeAssistant }, 'Open AI Settings') : null));
    inputEl.disabled = true; sendBtn.disabled = true;
    return;
  }
  inputEl.disabled = busy; sendBtn.disabled = busy;
  if (!view.length) {
    bodyEl.appendChild(h('div', { class: 'assistant-welcome' },
      h('span', { class: 'ai-mark lg' }, icon('sparkles')),
      h('p', status?.agent?.welcome || 'Hi! How can I help?'),
      h('div', { class: 'col gap-8' }, (status?.agent?.suggestions || []).map((s) => h('button', { class: 'suggestion', onClick: () => send(s) }, s)))));
  }
  for (const item of view) bodyEl.appendChild(renderItem(item));
  if (busy) bodyEl.appendChild(h('div', { class: 'msg assistant' }, h('div', { class: 'bubble typing' }, h('span'), h('span'), h('span'))));
  bodyEl.scrollTop = bodyEl.scrollHeight;
}

function renderItem(item) {
  switch (item.kind) {
    case 'user': return h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, item.text));
    case 'assistant': return h('div', { class: 'msg assistant' }, h('div', { class: 'bubble' }, renderMarkdown(item.text)));
    case 'steps': return h('div', { class: 'steps' }, item.steps.map((s) => h('div', { class: ['step', s.ok ? 'ok' : 'fail'] },
      icon(s.ok ? 'check' : s.declined ? 'x' : 'alert', { size: 13 }),
      h('span', s.declined ? `${s.label} — cancelled` : s.ok ? s.label : `${s.label} failed${s.error ? `: ${s.error}` : ''}`),
      s.link ? h('a', { href: s.link, class: 'small' }, 'View') : null)));
    case 'pending': return renderPending(item);
    case 'error': return h('div', { class: 'msg assistant' }, h('div', { class: 'bubble error' }, icon('alert', { size: 14 }), ' ', item.text));
  }
  return h('div');
}

function renderPending(item) {
  const box = h('div', { class: ['confirm-card', item.resolved && 'resolved'] },
    h('div', { class: 'row' }, icon('shield', { size: 16 }), h('strong', { class: 'grow' }, item.resolved ? (item.resolved === 'approve' ? 'Approved' : 'Cancelled') : 'Confirm these changes')),
    item.calls.map((c) => h('div', { class: 'confirm-call' },
      h('div', { class: 'strong small' }, c.title),
      Object.keys(c.details || {}).length ? h('table', { class: 'table compact' }, h('tbody', Object.entries(c.details).map(([k, v]) => h('tr', h('td', { class: 'muted' }, k), h('td', typeof v === 'object' ? JSON.stringify(v) : String(v)))))) : null)),
    item.resolved ? null : h('div', { class: 'row mt-8' }, h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', onClick: () => decide(item, 'reject') }, 'Cancel'),
      h('button', { class: 'btn btn-sm btn-brand', onClick: () => decide(item, 'approve') }, 'Confirm')));
  return box;
}

async function decide(item, decision) {
  if (busy) return;
  item.resolved = decision;
  await call({ decision });
}

async function send(text) {
  const msg = (text ?? inputEl.value).trim();
  if (!msg || busy) return;
  // An unanswered confirmation is cancelled when the user moves on.
  const open = view.find((v) => v.kind === 'pending' && !v.resolved);
  if (open) { open.resolved = 'reject'; await call({ decision: 'reject', silent: true }); }
  inputEl.value = '';
  view.push({ kind: 'user', text: msg });
  convo.push({ role: 'user', content: msg });
  await call({});
}

async function call({ decision = null }) {
  busy = true;
  drawBody();
  try {
    const res = await POST('/api/ai/agent', { messages: convo, recordId: currentRecordId(), decision });
    convo = res.messages;
    if (res.steps?.length) view.push({ kind: 'steps', steps: res.steps });
    if (res.reply) view.push({ kind: 'assistant', text: res.reply });
    if (res.pending?.length) view.push({ kind: 'pending', calls: res.pending });
    if (res.steps?.some((s) => s.ok && s.mutating)) document.dispatchEvent(new CustomEvent('slavy:data-changed'));
  } catch (e) {
    view.push({ kind: 'error', text: e.message });
    // Drop a trailing user message the server never answered so the conversation stays valid.
    if (convo[convo.length - 1]?.role === 'user' && !decision) convo.pop();
  } finally {
    busy = false;
    persist();
    if (panel) drawBody();
  }
}

export { state };
