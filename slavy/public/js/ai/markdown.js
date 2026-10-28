// Minimal, safe Markdown → DOM renderer for AI responses (never uses innerHTML on model output).
import { h } from '../lib.js';

function safeHref(url) {
  const u = String(url || '').trim();
  if (u.startsWith('#/')) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (/^mailto:/i.test(u)) return u;
  return null;
}

// Inline: **bold**, *italic* / _italic_, `code`, [text](url), bare #/r/ID links
export function inline(text) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_)/g;
  let last = 0, m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[2] != null) out.push(h('strong', inline(m[2])));
    else if (m[3] != null) out.push(h('code', m[3]));
    else if (m[4] != null) {
      const href = safeHref(m[5]);
      out.push(href ? h('a', { href, ...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, inline(m[4])) : m[4]);
    } else if (m[6] != null) out.push(h('em', inline(m[6])));
    else if (m[7] != null) out.push(h('em', inline(m[7])));
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function renderMarkdown(md) {
  const root = h('div', { class: 'md' });
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      root.appendChild(h('pre', { class: 'code-block' }, buf.join('\n')));
      continue;
    }
    const hm = /^(#{1,4})\s+(.*)$/.exec(line);
    if (hm) { root.appendChild(h(hm[1].length <= 2 ? 'h3' : 'h4', inline(hm[2]))); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      root.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
        h('thead', h('tr', head.map((c) => h('th', inline(c))))),
        h('tbody', rows.map((r) => h('tr', r.map((c) => h('td', inline(c)))))))));
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const list = h(ordered ? 'ol' : 'ul');
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        list.appendChild(h('li', inline(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))));
        i++;
      }
      root.appendChild(list);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*•]|\d+[.)])\s+|\s*\|.*\|\s*$)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) { para.push(lines[i++]); }
    root.appendChild(h('p', para.flatMap((p, k) => (k ? [h('br'), ...inline(p)] : inline(p)))));
  }
  return root;
}
