// Shared helpers for the AI setup pages (AI Settings, Agent Builder, Prompt Builder, Scoring, AI Audit Trail).
import { h, icon, clear } from '../lib.js';
import { setupHeader } from './index.js';

// Setup page header with the Einstein-style gradient AI icon.
export function aiHeader(title, opts = {}) {
  const el = setupHeader(title, { crumb: 'Setup › AI', iconName: 'sparkles', ...opts });
  el.classList.add('aia-header');
  return el;
}

// Small gradient "AI" mark used on cards and badges.
export function aiMark(size = 'md') {
  return h('span', { class: `aia-mark ${size}` }, icon('sparkles'));
}

export function switchControl(checked, onChange, { label, disabled, id } = {}) {
  const cb = h('input', { type: 'checkbox', checked, disabled, id, 'aria-label': label, onChange: () => onChange(cb.checked) });
  return h('label', { class: 'switch' }, cb, h('span'));
}

// A labelled toggle row: switch + title + help text.
export function toggleRow(title, checked, onChange, { help, disabled, badge: extra } = {}) {
  const cb = h('input', { type: 'checkbox', checked, disabled, onChange: () => onChange(cb.checked) });
  return h('label', { class: ['aia-toggle', disabled && 'disabled'] },
    h('span', { class: 'switch' }, cb, h('span')),
    h('span', { class: 'grow' }, h('span', { class: 'aia-toggle-title' }, title, extra || null), help ? h('span', { class: 'aia-toggle-help' }, help) : null));
}

export function sectionCard(title, { iconName, subtitle, actions = [], body = [], cls } = {}) {
  return h('section', { class: ['card aia-card', cls] },
    h('div', { class: 'card-header' },
      iconName ? h('span', { class: 'aia-card-icon' }, icon(iconName)) : null,
      h('div', { class: 'grow' }, h('h2', title), subtitle ? h('div', { class: 'small muted' }, subtitle) : null),
      actions),
    h('div', { class: 'aia-card-body' }, body));
}

export const FEATURE_LABELS = {
  agent: 'Slavy Agent', summary: 'Record Summaries', email: 'Email Drafts', suggest: 'Field Suggestions', prompts: 'Prompt Templates',
  builder: 'Admin & Developer Assist', flows: 'Flow AI Prompt', test: 'Connection Test', other: 'Other',
};

export const STATUS_KIND = { Success: 'success', Error: 'danger', Refused: 'warning', Done: 'success', Failed: 'danger', Queued: '', Running: 'brand' };

// Highlight trust-layer tokens such as [EMAIL_1] / [PHONE_2] inside text (returns a <pre>).
export function maskedPre(text, cls = '') {
  const pre = h('pre', { class: `aia-pre ${cls}` });
  const s = String(text ?? '');
  if (!s) { pre.appendChild(h('span', { class: 'muted' }, '(not logged)')); return pre; }
  let last = 0;
  for (const m of s.matchAll(/\[(EMAIL|PHONE)_\d+\]/g)) {
    if (m.index > last) pre.appendChild(document.createTextNode(s.slice(last, m.index)));
    pre.appendChild(h('mark', { class: 'aia-token', title: 'Masked by the Trust Layer before leaving Slavy' }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < s.length) pre.appendChild(document.createTextNode(s.slice(last)));
  return pre;
}

// ---------- minimal, safe Markdown → DOM (bold, italics, code, links, lists, tables, headings) ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = url.replace(/&amp;/g, '&');
    if (!/^(https?:\/\/|#\/|mailto:)/i.test(u)) return label;
    const ext = /^https?:/i.test(u);
    return `<a href="${esc(u)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

export function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre class="aia-md-code">${esc(buf.join('\n'))}</pre>`);
      continue;
    }
    const hd = /^(#{1,4})\s+(.*)$/.exec(l);
    if (hd) { out.push(`<h4>${inline(hd[2])}</h4>`); i++; continue; }
    if (isRow(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="aia-md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*•]|\d+[.)])\s+)/.test(lines[i]) && !isRow(lines[i])) para.push(lines[i++]);
    if (!para.length) { out.push(`<p>${inline(lines[i++])}</p>`); continue; }
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}

export function markdown(md, cls = '') {
  return h('div', { class: `aia-md ${cls}`, html: markdownToHtml(md) });
}

export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    btn.disabled = true;
    btn.classList.add('aia-busy');
    if (label) { btn._orig = [...btn.childNodes]; clear(btn); btn.append(h('span', { class: 'aia-spin' }), label); }
  } else {
    btn.disabled = false;
    btn.classList.remove('aia-busy');
    if (btn._orig) { clear(btn); btn.append(...btn._orig); btn._orig = null; }
  }
}
