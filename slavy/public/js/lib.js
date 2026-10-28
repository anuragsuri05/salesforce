// Slavy client library: DOM helper, icons, formatting, modals, menus, toasts.

// h('div', { class: 'x', onClick: fn, style: {...}, dataset: {...} }, child, [children], 'text')
export function h(tag, props, ...children) {
  const el = tag === 'fragment' ? document.createDocumentFragment() : document.createElement(tag);
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value' && 'value' in el) el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'multiple' || k === 'readOnly') el[k] = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...children) { clear(el); append(el, children); return el; }

// ---------- icons (inline SVG, 24x24 stroke) ----------
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  kanban: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="8" rx="1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  flow: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M6 9v3a3 3 0 0 0 3 3h6"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  thumbsUp: '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  approval: '<path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"/>',
  recycle: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  play: '<path d="m5 3 14 9-14 9z"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  sparkles: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/><path d="M5 16l.5 1.3 1.3.5-1.3.5L5 19.6l-.5-1.3-1.3-.5 1.3-.5z"/>',
  send: '<path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/>',
  crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>',
  leadStar: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4"/><path d="m17.5 13 1.3 2.6 2.7.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.7-.4z"/>',
};

export function icon(name, { size, cls, filled } = {}) {
  const span = document.createElement('span');
  span.innerHTML = `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" ${size ? `style="width:${size}px;height:${size}px"` : ''} ${filled ? 'fill="currentColor"' : ''} aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;
  return span.firstChild;
}

// ---------- formatting ----------
let currency = 'USD';
let locale = navigator.language || 'en-US';
export function setLocale(opts = {}) {
  if (opts.currency) currency = opts.currency;
  if (opts.locale) locale = opts.locale;
}

export const fmt = {
  currency(v, { compact = false } = {}) {
    if (v == null || v === '') return '';
    const n = Number(v);
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency, notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 2, minimumFractionDigits: compact ? 0 : Number.isInteger(n) ? 0 : 2 }).format(n);
    } catch { return String(v); }
  },
  number(v, scale) {
    if (v == null || v === '') return '';
    return new Intl.NumberFormat(locale, { maximumFractionDigits: scale ?? 2 }).format(Number(v));
  },
  compact(v) {
    if (v == null || v === '') return '';
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v));
  },
  percent(v) {
    if (v == null || v === '') return '';
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(v))}%`;
  },
  date(v) {
    if (!v) return '';
    const d = new Date(String(v).length === 10 ? v + 'T00:00:00Z' : v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  },
  datetime(v) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  },
  time(v) {
    if (!v) return '';
    return new Date(v).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  },
  relative(v) {
    if (!v) return '';
    const diff = (Date.now() - new Date(v).getTime()) / 1000;
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const units = [[60, 'second', 1], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400], [2629800, 'week', 604800], [31557600, 'month', 2629800], [Infinity, 'year', 31557600]];
    for (const [limit, unit, div] of units) if (abs < limit) return rtf.format(-Math.round(diff / div), unit);
    return '';
  },
  initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  },
};

export function todayISO() { return new Date().toISOString().slice(0, 10); }

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- UI primitives ----------
export function spinner() { return h('div', { class: 'loading' }, h('div', { class: 'spinner' })); }

export function emptyState(title, text, { iconName = 'search', action } = {}) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, icon(iconName)), h('h3', title), text ? h('div', text) : null, action ? h('div', { class: 'mt-16' }, action) : null);
}

// SLDS-style standard object icons: white glyph on a colored square.
const OBJECT_GLYPHS = {
  Account: 'building', Contact: 'user', Lead: 'leadStar', Opportunity: 'crown', Case: 'briefcase', Campaign: 'megaphone',
  CampaignMember: 'users', Product2: 'box', OpportunityLineItem: 'box', Contract: 'file', Task: 'task', Event: 'calendar', User: 'user',
};
export function objIcon(obj, size = '') {
  const glyph = obj && (obj.glyph || OBJECT_GLYPHS[obj.apiName]);
  return h('span', { class: `obj-icon ${size}`, style: { background: obj?.color || '#747474' }, title: obj?.label },
    glyph ? icon(glyph) : obj?.icon || (obj?.label || '?')[0]);
}

export function avatar(name, size = '') {
  return h('span', { class: `avatar ${size}`, title: name }, fmt.initials(name));
}

export function badge(text, kind = '') { return h('span', { class: `badge ${kind}` }, text); }

// ---------- toast ----------
let toastHost;
export function toast(message, type = 'info', { timeout = 4000, link } = {}) {
  if (!toastHost) { toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastHost); }
  const el = h('div', { class: `toast ${type}` },
    icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info'),
    h('div', { class: 'grow' }, message, link ? [' ', h('a', { href: link.href }, link.label)] : null),
    h('button', { class: 'btn btn-ghost btn-sm btn-icon', style: { color: '#fff' }, onClick: () => el.remove(), 'aria-label': 'Close' }, icon('x')));
  toastHost.appendChild(el);
  if (timeout) setTimeout(() => el.remove(), type === 'error' ? Math.max(timeout, 7000) : timeout);
  return el;
}

// ---------- modal ----------
// modal({ title, body, footer, size, onClose }) -> { el, body, footer, close, setError }
export function modal({ title, body, footer, size = '', onClose, dismissable = true } = {}) {
  const errorBox = h('div', { class: 'modal-error hidden' });
  const bodyEl = h('div', { class: 'modal-body' }, errorBox, body);
  const footerEl = footer ? h('div', { class: 'modal-footer' }, footer) : null;
  const dialog = h('div', { class: `modal ${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : 'Dialog' },
    h('div', { class: 'modal-header' }, h('h2', title), dismissable ? h('button', { class: 'btn btn-ghost btn-icon', onClick: () => close(), 'aria-label': 'Close' }, icon('x')) : null),
    bodyEl, footerEl);
  const backdrop = h('div', { class: 'modal-backdrop', onMousedown: (e) => { if (e.target === backdrop && dismissable) close(); } }, dialog);
  const prevFocus = document.activeElement;
  const onKey = (e) => { if (e.key === 'Escape' && dismissable && backdrop.parentNode && document.querySelectorAll('.modal-backdrop').length && backdrop === [...document.querySelectorAll('.modal-backdrop')].pop()) close(); };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  setTimeout(() => (dialog.querySelector('input:not([type=checkbox]), select, textarea, .btn-brand') || dialog).focus?.(), 30);
  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    prevFocus?.focus?.();
    onClose?.(result);
  }
  return {
    el: dialog, body: bodyEl, footer: footerEl, close,
    setError(msg) { errorBox.textContent = msg || ''; errorBox.classList.toggle('hidden', !msg); if (msg) bodyEl.scrollTop = 0; },
  };
}

export function confirmDialog(message, { title = 'Are you sure?', confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const m = modal({
      title, size: 'sm', body: h('div', { class: 'center' }, message),
      footer: [
        h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-brand'}`, onClick: () => { result = true; m.close(); } }, confirmLabel),
      ],
      onClose: () => resolve(result),
    });
  });
}

export function promptDialog(label, { title = 'Enter a value', value = '', confirmLabel = 'Save', multiline = false } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const input = multiline ? h('textarea', { class: 'input', value }) : h('input', { class: 'input', value });
    const m = modal({
      title, size: 'sm', body: h('div', h('label', { class: 'form-label' }, label), input),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: () => { result = input.value; m.close(); } }, confirmLabel)],
      onClose: () => resolve(result),
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) { result = input.value; m.close(); } });
  });
}

// ---------- dropdown menu ----------
// items: [{ label, icon, onClick, href, danger, checked, disabled } | 'sep' | { header }]
let openMenu = null;
export function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
export function showMenu(anchor, items, { align = 'left', width } = {}) {
  closeMenu();
  const menu = h('div', { class: 'menu', role: 'menu', style: width ? { minWidth: width + 'px' } : null });
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') { menu.appendChild(h('div', { class: 'menu-sep' })); continue; }
    if (it.header) { menu.appendChild(h('div', { class: 'menu-header' }, it.header)); continue; }
    if (it.node) { menu.appendChild(it.node); continue; }
    const tag = it.href ? 'a' : 'button';
    const el = h(tag, {
      class: ['menu-item', it.danger && 'danger', it.active && 'active'], role: 'menuitem', href: it.href, disabled: it.disabled,
      onClick: (e) => { if (it.disabled) return; closeMenu(); it.onClick?.(e); },
    }, it.checked !== undefined ? h('span', { class: 'check' }, it.checked ? icon('check') : null) : null, it.icon ? icon(it.icon) : null, h('span', { class: 'grow truncate' }, it.label), it.meta ? h('span', { class: 'muted small' }, it.meta) : null);
    menu.appendChild(el);
  }
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = align === 'right' ? r.right - mw : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  openMenu = menu;
  setTimeout(() => {
    const off = (e) => { if (!menu.contains(e.target)) { closeMenu(); document.removeEventListener('mousedown', off); } };
    document.addEventListener('mousedown', off);
  });
  return menu;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('hashchange', closeMenu);

// ---------- tooltips ----------
let tip;
export function tooltip(el, text) {
  el.addEventListener('mouseenter', () => {
    tip = h('div', { class: 'tooltip' }, text);
    document.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, r.left) + 'px';
    tip.style.top = r.bottom + 6 + 'px';
  });
  el.addEventListener('mouseleave', () => { tip?.remove(); tip = null; });
  return el;
}

// ---------- tabs ----------
// tabs([{ id, label, render: () => Node }], activeId, onChange) -> Node
export function tabs(items, active, onChange) {
  const body = h('div');
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  let current = active || items[0]?.id;
  const draw = () => {
    clear(bar);
    for (const it of items) {
      bar.appendChild(h('button', { class: ['tab', it.id === current && 'active'], role: 'tab', onClick: () => { current = it.id; draw(); onChange?.(it.id); } }, it.label));
    }
    const it = items.find((x) => x.id === current) || items[0];
    mount(body, it ? it.render() : null);
  };
  draw();
  return h('div', bar, body);
}

// ---------- download ----------
export function downloadText(filename, text, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}

// ---------- storage (best effort) ----------
export const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem('slavy:' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('slavy:' + key, JSON.stringify(value)); } catch { /* ignore */ } },
};
