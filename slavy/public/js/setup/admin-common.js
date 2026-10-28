// Shared helpers for the Setup administration pages (users, security, monitoring, data tools).
import { h, icon, fmt, clear, toast, badge, downloadText, debounce } from '../lib.js';
import { GET, can } from '../api.js';

export const canManageUsers = () => can('ManageUsers') || can('ModifyAllData');
export const canCustomize = () => can('CustomizeApplication') || can('ModifyAllData');

export const TIMEZONES = ['UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Europe/London',
  'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Shanghai',
  'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];

export const CURRENCIES = [['USD', 'U.S. Dollar'], ['EUR', 'Euro'], ['GBP', 'British Pound'], ['INR', 'Indian Rupee'], ['JPY', 'Japanese Yen'],
  ['AUD', 'Australian Dollar'], ['CAD', 'Canadian Dollar'], ['CHF', 'Swiss Franc'], ['CNY', 'Chinese Yuan'], ['SGD', 'Singapore Dollar'],
  ['NZD', 'New Zealand Dollar'], ['BRL', 'Brazilian Real'], ['MXN', 'Mexican Peso'], ['ZAR', 'South African Rand'], ['AED', 'UAE Dirham'], ['SEK', 'Swedish Krona']];

export const LOCALES = [['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['en-IN', 'English (India)'], ['en-AU', 'English (Australia)'],
  ['en-CA', 'English (Canada)'], ['fr-FR', 'French (France)'], ['de-DE', 'German (Germany)'], ['es-ES', 'Spanish (Spain)'], ['it-IT', 'Italian (Italy)'],
  ['pt-BR', 'Portuguese (Brazil)'], ['ja-JP', 'Japanese (Japan)'], ['zh-CN', 'Chinese (China)'], ['hi-IN', 'Hindi (India)'], ['nl-NL', 'Dutch (Netherlands)']];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const ACCESS_LABELS = { Private: 'Private', Read: 'Public Read Only', ReadWrite: 'Public Read/Write', ControlledByParent: 'Controlled by Parent' };

// ---------- small building blocks ----------
export function formRow(label, control, { required, help, span2, id } = {}) {
  return h('div', { class: ['form-row', span2 && 'span-2'] },
    h('label', { class: 'form-label', for: id || null }, required ? h('abbr', { class: 'req', title: 'required' }, '*') : null, label),
    control, help ? h('div', { class: 'form-help' }, help) : null);
}

export function detailField(label, value) {
  return h('div', { class: 'detail-field' }, h('div', { class: 'df-label' }, label),
    h('div', { class: 'df-value' }, value == null || value === '' ? h('span', { class: 'muted' }, '—') : value));
}

export function select(options, value, { onChange, cls = 'input', id, ariaLabel, disabled } = {}) {
  const el = h('select', { class: cls, id, 'aria-label': ariaLabel, disabled, onChange: () => onChange?.(el.value) },
    options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: String(v) === String(value ?? '') }, l);
    }));
  return el;
}

export function searchBox(placeholder, onInput, { value = '' } = {}) {
  const inp = h('input', { class: 'input input-sm', type: 'search', placeholder, value, 'aria-label': placeholder });
  inp.addEventListener('input', debounce(() => onInput(inp.value.trim().toLowerCase()), 120));
  return h('div', { class: 'input-group sa-search' }, icon('search'), inp);
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'btn-group', role: 'group' });
  const draw = () => {
    clear(wrap);
    for (const [v, l] of options) {
      wrap.appendChild(h('button', { class: ['btn btn-sm', v === value && 'active'], type: 'button', 'aria-pressed': String(v === value),
        onClick: () => { value = v; draw(); onChange(v); } }, l));
    }
  };
  draw();
  return wrap;
}

export function activeBadge(active) {
  return active ? badge('Active', 'success') : badge('Inactive');
}

export function check(on) {
  return on ? h('span', { class: 'sa-check', title: 'Yes' }, icon('check')) : h('span', { class: 'muted', title: 'No' }, '—');
}

export function stat(label, value, iconName, sub) {
  return h('div', { class: 'card sa-stat' },
    h('div', { class: 'sa-stat-icon' }, icon(iconName)),
    h('div', h('div', { class: 'sa-stat-value' }, value), h('div', { class: 'sa-stat-label' }, label), sub ? h('div', { class: 'tiny muted' }, sub) : null));
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  toast('Copied to clipboard', 'success', { timeout: 2000 });
}

export function copyBox(text, { label = 'Copy', mono = true } = {}) {
  return h('div', { class: 'sa-copybox' },
    h('code', { class: mono ? 'mono grow' : 'grow' }, text),
    h('button', { class: 'btn btn-sm', type: 'button', onClick: () => copyText(text) }, icon('copy'), label));
}

// ---------- data table with sorting ----------
// columns: [{ key, label, render(row) -> Node|string, sort(row) -> value, cls, width }]
export function dataTable({ columns, rows = [], empty = 'No records to display.', initialSort, rowClass, compact, maxRows } = {}) {
  let data = rows;
  let sort = initialSort || null;
  const wrap = h('div', { class: 'table-wrap' });
  const draw = () => {
    clear(wrap);
    let list = data;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = col?.sort || ((r) => r[sort.key]);
      list = [...data].sort((a, b) => {
        const x = val(a), y = val(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
        return sort.dir === 'desc' ? -c : c;
      });
    }
    const shown = maxRows ? list.slice(0, maxRows) : list;
    const table = h('table', { class: ['table', compact && 'compact'] },
      h('thead', h('tr', columns.map((c) => {
        const sortable = c.sortable !== false && c.label;
        const active = sort?.key === c.key;
        return h('th', {
          class: [sortable && 'sortable', c.cls], style: c.width ? { width: c.width } : null, scope: 'col',
          'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : null,
          onClick: sortable ? () => { sort = { key: c.key, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' }; draw(); } : null,
        }, c.label || '', active ? icon(sort.dir === 'asc' ? 'arrowUp' : 'arrowDown', { cls: 'sa-sort-icon' }) : null);
      }))),
      h('tbody', shown.map((r) => h('tr', { class: rowClass?.(r) || null }, columns.map((c) => h('td', { class: c.cls }, c.render ? c.render(r) : fmtCell(r[c.key])))))));
    wrap.appendChild(table);
    if (!list.length) wrap.appendChild(h('div', { class: 'sa-table-empty' }, empty));
    if (maxRows && list.length > maxRows) wrap.appendChild(h('div', { class: 'sa-table-empty' }, `Showing ${maxRows} of ${list.length} rows. Refine your search to see more.`));
  };
  draw();
  return { el: wrap, setRows(r) { data = r; draw(); } };
}

function fmtCell(v) {
  if (v == null || v === '') return h('span', { class: 'muted' }, '');
  if (typeof v === 'boolean') return check(v);
  return String(v);
}

// ---------- CSV ----------
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(columns, rows) {
  return [columns.map((c) => csvCell(c[1])).join(','), ...rows.map((r) => columns.map((c) => csvCell(typeof c[0] === 'function' ? c[0](r) : r[c[0]])).join(','))].join('\n');
}
export function downloadCsv(name, columns, rows) {
  downloadText(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(columns, rows));
}

// ---------- directory (users, roles, groups, profiles, permission sets) ----------
export async function loadDirectory(parts = ['users', 'roles', 'groups', 'profiles', 'permsets']) {
  const urls = { users: '/api/setup/users', roles: '/api/setup/meta/role', groups: '/api/setup/meta/group', profiles: '/api/setup/meta/profile', permsets: '/api/setup/meta/permissionSet' };
  const out = {};
  await Promise.all(parts.map(async (p) => { out[p] = await GET(urls[p]); }));
  return out;
}

export function roleAncestors(roles, roleId) {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const out = [];
  const seen = new Set();
  let cur = byId.get(roleId);
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.push(cur.id); cur = byId.get(cur.parentId); }
  return out;
}

export function roleDescendants(roles, roleId) {
  const out = new Set();
  const stack = roles.filter((r) => r.parentId === roleId).map((r) => r.id);
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...roles.filter((r) => r.parentId === id).map((r) => r.id));
  }
  return out;
}

// Users who are effectively members of a group/queue (direct users, role members, role-and-subordinates members).
export function groupUsers(group, users, roles) {
  const members = group.members || [];
  return users.filter((u) => {
    if (members.includes(u.Id) || (u.RoleId && members.includes(u.RoleId))) return true;
    const anc = roleAncestors(roles, u.RoleId);
    return members.some((m) => m.startsWith('sub:') && anc.includes(m.slice(4)));
  });
}

export const PRINCIPAL_KINDS = {
  role: 'Role',
  roleSub: 'Role and Subordinates',
  group: 'Public Group',
  allUsers: 'All Internal Users',
  user: 'User',
};

export function principalLabel(p, dir) {
  if (!p || !p.kind) return '—';
  if (p.kind === 'allUsers') return 'All Internal Users';
  const name = p.kind === 'group' ? (dir.groups.find((g) => g.id === p.id)?.label || dir.groups.find((g) => g.id === p.id)?.name)
    : p.kind === 'user' ? dir.users?.find((u) => u.Id === p.id)?.Name
      : dir.roles.find((r) => r.id === p.id)?.name;
  return `${PRINCIPAL_KINDS[p.kind] || p.kind}: ${name || '(deleted)'}`;
}

// Kind select + target select for sharing principals.
export function principalPicker({ value, kinds, dir, onChange, idPrefix = 'pp' }) {
  let cur = { kind: value?.kind || kinds[0], id: value?.id || null };
  const targetWrap = h('div', { class: 'grow' });
  const emit = () => onChange?.(cur.kind === 'allUsers' ? { kind: 'allUsers' } : { ...cur });
  const options = () => {
    if (cur.kind === 'group') return dir.groups.filter((g) => g.kind !== 'queue').map((g) => [g.id, g.label || g.name]);
    if (cur.kind === 'user') return (dir.users || []).filter((u) => u.IsActive).map((u) => [u.Id, u.Name]);
    return roleOptions(dir.roles);
  };
  const drawTarget = () => {
    clear(targetWrap);
    if (cur.kind === 'allUsers') { cur.id = null; return; }
    const opts = options();
    if (!opts.some(([v]) => v === cur.id)) cur.id = opts[0]?.[0] || null;
    if (!opts.length) { targetWrap.appendChild(h('div', { class: 'muted small sa-inline-note' }, 'Nothing available')); return; }
    targetWrap.appendChild(select(opts, cur.id, { id: idPrefix + '-target', ariaLabel: 'Target', onChange: (v) => { cur.id = v; emit(); } }));
  };
  const kindSel = select(kinds.map((k) => [k, PRINCIPAL_KINDS[k]]), cur.kind, { id: idPrefix + '-kind', ariaLabel: 'Type', onChange: (v) => { cur.kind = v; drawTarget(); emit(); } });
  kindSel.style.width = '210px';
  drawTarget();
  emit();
  return { el: h('div', { class: 'row sa-principal' }, kindSel, targetWrap), get: () => (cur.kind === 'allUsers' ? { kind: 'allUsers' } : { ...cur }) };
}

// Roles in hierarchy order, indented with non-breaking spaces for <select>s.
export function roleOptions(roles, { exclude = new Set() } = {}) {
  const out = [];
  const walk = (parentId, depth) => {
    for (const r of roles.filter((x) => (x.parentId || null) === parentId).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!exclude.has(r.id)) out.push([r.id, `${'   '.repeat(depth)}${r.name}`]);
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  // Orphans (parent deleted)
  for (const r of roles) if (!out.some(([id]) => id === r.id) && !exclude.has(r.id) && r.parentId && !roles.some((x) => x.id === r.parentId)) out.push([r.id, r.name]);
  return out;
}

export function apiNameFrom(label) {
  return String(label || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'X$1');
}

export function userLink(u) {
  if (!u) return h('span', { class: 'muted' }, '—');
  return h('a', { href: `#/setup/users/${u.Id}`, class: 'row gap-4 sa-userlink' }, h('span', { class: 'avatar sm' }, fmt.initials(u.Name)), u.Name);
}

export function parseAgent(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl|node|undici/i.test(ua) ? 'API client' : ua ? 'Other' : 'Unknown';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export function readOnlyNote(text) {
  return h('div', { class: 'alert mb-16' }, icon('lock'), h('div', text));
}

export { fmt };
