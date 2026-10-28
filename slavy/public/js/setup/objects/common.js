// Shared helpers for Object Manager / App Manager setup pages.
import { h, icon, clear } from '../../lib.js';
import { getObj, state, can } from '../../api.js';

export const canCustomize = () => can('CustomizeApplication');

export const COLORS = ['#7c3aed', '#4f46e5', '#2563eb', '#0284c7', '#0ea5e9', '#0d9488', '#16a34a', '#65a30d', '#ca8a04', '#ea580c',
  '#dc2626', '#e11d48', '#db2777', '#c026d3', '#9333ea', '#475569', '#334155', '#78716c'];

export const SHARING_MODELS = [
  { value: 'Private', label: 'Private' },
  { value: 'Read', label: 'Public Read Only' },
  { value: 'ReadWrite', label: 'Public Read/Write' },
  { value: 'ControlledByParent', label: 'Controlled by Parent' },
];
export const sharingLabel = (v) => SHARING_MODELS.find((s) => s.value === v)?.label || v || 'Public Read/Write';

export function apiFromLabel(label) {
  return String(label || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'X$1');
}

export const TYPE_INFO = {
  Text: { label: 'Text', desc: 'Any combination of letters, numbers or symbols, up to 255 characters.' },
  TextArea: { label: 'Text Area', desc: 'Up to 255 characters on separate lines.' },
  LongTextArea: { label: 'Text Area (Long)', desc: 'Up to 131,072 characters on separate lines.' },
  Email: { label: 'Email', desc: 'Validates the email address format and makes it clickable.' },
  Phone: { label: 'Phone', desc: 'A phone number, shown as a click-to-call link.' },
  Url: { label: 'URL', desc: 'A website address that opens in a new browser tab.' },
  Number: { label: 'Number', desc: 'A number, with optional decimal places.' },
  Currency: { label: 'Currency', desc: 'A money amount in the org currency.' },
  Percent: { label: 'Percent', desc: 'A percentage, e.g. 10 shown as 10%.' },
  Checkbox: { label: 'Checkbox', desc: 'True (checked) or false (unchecked).' },
  Date: { label: 'Date', desc: 'A calendar date, picked from a date picker.' },
  DateTime: { label: 'Date/Time', desc: 'A date and time of day.' },
  Picklist: { label: 'Picklist', desc: 'Select a single value from a list you define.' },
  MultiPicklist: { label: 'Picklist (Multi-Select)', desc: 'Select multiple values from a list you define.' },
  Lookup: { label: 'Lookup Relationship', desc: 'Links this object to another object. Shows a related list on the parent.' },
  MasterDetail: { label: 'Master-Detail Relationship', desc: 'Tight parent-child link: the child inherits sharing and is deleted with the master. Enables roll-up summaries.' },
  Formula: { label: 'Formula', desc: 'A read-only field whose value is calculated from a formula expression.' },
  Rollup: { label: 'Roll-Up Summary', desc: 'Read-only COUNT, SUM, MIN, MAX or AVG of related records in a master-detail relationship.' },
  AutoNumber: { label: 'Auto Number', desc: 'A system-generated sequence number using a display format you define.' },
};
const TYPE_ICON = { Text: 'edit', TextArea: 'list', LongTextArea: 'list', Email: 'mail', Phone: 'phone', Url: 'globe', Number: 'chart', Currency: 'chart',
  Percent: 'chart', Checkbox: 'check', Date: 'calendar', DateTime: 'clock', Picklist: 'chevronDown', MultiPicklist: 'list', Lookup: 'share',
  MasterDetail: 'layers', Formula: 'code', Rollup: 'sliders', AutoNumber: 'refresh', Id: 'key' };
export const typeIcon = (t) => TYPE_ICON[t] || 'info';

const objLabel = (api) => {
  if (api === 'User') return 'User';
  if (api === '*') return 'Any';
  return getObj(api)?.label || api;
};

// Human-readable data type, e.g. "Lookup(Account)", "Formula (Currency)".
export function typeLabel(f) {
  if (!f) return '';
  const refs = Array.isArray(f.referenceTo) ? f.referenceTo : [f.referenceTo];
  switch (f.type) {
    case 'Id': return 'ID';
    case 'Text': return `Text(${f.length || 255})`;
    case 'TextArea': return `Text Area(${f.length || 255})`;
    case 'LongTextArea': return `Long Text Area(${f.length || 32768})`;
    case 'Number': return `Number(${(f.precision || 18) - (f.scale || 0)}, ${f.scale || 0})`;
    case 'Currency': return `Currency(${(f.precision || 18) - (f.scale ?? 2)}, ${f.scale ?? 2})`;
    case 'Percent': return `Percent(${(f.precision || 18) - (f.scale || 0)}, ${f.scale || 0})`;
    case 'Lookup': return f.ownerField ? 'Lookup(User,Group)' : `Lookup(${refs.map(objLabel).join(', ')})`;
    case 'MasterDetail': return `Master-Detail(${refs.map(objLabel).join(', ')})`;
    case 'Formula': return `Formula (${TYPE_INFO[f.returnType]?.label || f.returnType || 'Text'})`;
    case 'Rollup': return `Roll-Up Summary (${f.rollup?.op || ''} ${objLabel(f.rollup?.childObject)})`;
    case 'AutoNumber': return 'Auto Number';
    default: return TYPE_INFO[f.type]?.label || f.type;
  }
}

// ---------- small form builders ----------
let uid = 0;
export const nextId = (p = 'om') => `${p}-${++uid}`;

// formRow(label, control, { required, help, span, id })
export function formRow(label, control, { required, help, span, hint } = {}) {
  const id = control?.id || control?.querySelector?.('input,select,textarea')?.id || nextId();
  const target = control?.matches?.('input,select,textarea') ? control : control?.querySelector?.('input:not([type=checkbox]),select,textarea');
  if (target && !target.id) target.id = id;
  return h('div', { class: ['form-row', span && 'span-2'] },
    h('label', { class: 'form-label', for: target?.id || id }, required ? h('span', { class: 'req' }, '*') : null, label,
      hint ? h('span', { class: 'help-tip', title: hint }, '?') : null),
    control, help ? h('div', { class: 'form-help' }, help) : null);
}

export function input(value, opts = {}) {
  const el = h('input', { class: 'input', type: opts.type || 'text', placeholder: opts.placeholder, maxlength: opts.maxlength, min: opts.min, max: opts.max, step: opts.step, readOnly: opts.readOnly, disabled: opts.disabled, 'aria-label': opts.ariaLabel });
  el.value = value ?? '';
  if (opts.onInput) el.addEventListener('input', () => opts.onInput(el.value));
  return el;
}

export function textarea(value, opts = {}) {
  const el = h('textarea', { class: 'input', rows: opts.rows || 3, placeholder: opts.placeholder, 'aria-label': opts.ariaLabel });
  el.value = value ?? '';
  if (opts.onInput) el.addEventListener('input', () => opts.onInput(el.value));
  return el;
}

// select([{value,label}|string], selected, onChange)
export function select(options, selected, onChange, { cls = 'input', placeholder, ariaLabel, disabled } = {}) {
  const el = h('select', { class: cls, 'aria-label': ariaLabel, disabled },
    placeholder != null ? h('option', { value: '' }, placeholder) : null,
    options.map((o) => {
      if (o.group) return h('optgroup', { label: o.group }, o.options.map((x) => h('option', { value: x.value, selected: String(x.value) === String(selected ?? '') }, x.label)));
      const v = typeof o === 'string' ? o : o.value;
      const l = typeof o === 'string' ? o : o.label;
      return h('option', { value: v, selected: String(v) === String(selected ?? ''), disabled: o.disabled }, l);
    }));
  if (onChange) el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function checkbox(label, checked, onChange, { disabled, help } = {}) {
  const cb = h('input', { type: 'checkbox', checked, disabled });
  cb.addEventListener('change', () => onChange?.(cb.checked));
  const el = h('div', { class: 'om-check' }, h('label', { class: 'checkbox' }, cb, h('span', label)), help ? h('div', { class: 'form-help om-check-help' }, help) : null);
  el.input = cb;
  return el;
}

export function toggleSwitch(checked, onChange, { label, disabled } = {}) {
  const cb = h('input', { type: 'checkbox', checked, disabled, 'aria-label': label || 'Toggle' });
  cb.addEventListener('change', () => onChange?.(cb.checked));
  return h('label', { class: 'switch' }, cb, h('span'));
}

// Icon letter + color swatches. onChange({ icon, color })
export function iconColorPicker({ iconText = '', color = COLORS[0], label = '', onChange }) {
  const st = { icon: iconText, color };
  const preview = h('span', { class: 'obj-icon lg' });
  const iconInput = input(st.icon, { maxlength: 2, ariaLabel: 'Icon letter', onInput: (v) => { st.icon = v; draw(); onChange?.({ ...st }); } });
  iconInput.classList.add('om-icon-input');
  const sw = h('div', { class: 'om-swatches', role: 'radiogroup', 'aria-label': 'Color' });
  const custom = h('input', { type: 'color', class: 'om-color-input', value: st.color, 'aria-label': 'Custom color', title: 'Custom color' });
  custom.addEventListener('input', () => { st.color = custom.value; draw(); onChange?.({ ...st }); });
  const draw = () => {
    preview.style.background = st.color;
    preview.textContent = st.icon || (label?.() || '?')[0] || '?';
    clear(sw);
    for (const c of COLORS) {
      sw.appendChild(h('button', { type: 'button', class: ['om-swatch', c.toLowerCase() === String(st.color).toLowerCase() && 'active'], style: { background: c }, role: 'radio',
        'aria-checked': String(c === st.color), 'aria-label': c, title: c, onClick: () => { st.color = c; custom.value = c; draw(); onChange?.({ ...st }); } }));
    }
    sw.appendChild(custom);
  };
  draw();
  return { el: h('div', { class: 'om-iconpicker' }, preview, h('div', { class: 'grow' }, h('div', { class: 'row mb-8' }, h('span', { class: 'small muted' }, 'Letter'), iconInput), sw)), get: () => ({ ...st }), refresh: draw };
}

// Checkbox list with optional search. options [{value,label,meta}]
export function checkList(options, selected = [], onChange, { height = 180, search = true, emptyText = 'Nothing to select.' } = {}) {
  const sel = new Set(selected);
  const q = h('input', { class: 'input input-sm', placeholder: 'Search...', 'aria-label': 'Search options' });
  const list = h('div', { class: 'om-checklist', style: { maxHeight: height + 'px' } });
  const draw = () => {
    clear(list);
    const t = q.value.toLowerCase();
    const items = options.filter((o) => !t || o.label.toLowerCase().includes(t));
    if (!items.length) list.appendChild(h('div', { class: 'muted small p-16 center' }, emptyText));
    for (const o of items) {
      const cb = h('input', { type: 'checkbox', checked: sel.has(o.value) });
      cb.addEventListener('change', () => { cb.checked ? sel.add(o.value) : sel.delete(o.value); onChange?.([...sel]); });
      list.appendChild(h('label', { class: 'checkbox om-checklist-item' }, cb, h('span', { class: 'grow truncate' }, o.label), o.meta ? h('span', { class: 'muted tiny' }, o.meta) : null));
    }
  };
  q.addEventListener('input', draw);
  draw();
  return { el: h('div', { class: 'om-checklist-wrap' }, search && options.length > 6 ? h('div', { class: 'mb-8' }, q) : null, list), get: () => [...sel] };
}

// Dual list box: available (left) and ordered selected (right) with add/remove/up/down.
// options [{value,label,meta}], selected [values]. Returns { el, get() }
export function dualList({ options, selected = [], onChange, availableLabel = 'Available', selectedLabel = 'Selected', max, height = 260, renderMeta, disabled }) {
  let sel = selected.filter((v) => options.some((o) => o.value === v));
  let leftPick = new Set(), rightPick = null;
  const byVal = new Map(options.map((o) => [o.value, o]));
  const q = h('input', { class: 'input input-sm', placeholder: 'Search...', 'aria-label': `Search ${availableLabel}` });
  const left = h('div', { class: 'om-dual-list', role: 'listbox', 'aria-label': availableLabel, 'aria-multiselectable': 'true', style: { height: height + 'px' } });
  const right = h('div', { class: 'om-dual-list', role: 'listbox', 'aria-label': selectedLabel, style: { height: height + 'px' } });
  const counter = h('span', { class: 'muted tiny' });
  const emit = () => onChange?.([...sel]);
  const add = (vals) => {
    for (const v of vals) {
      if (max && sel.length >= max) break;
      if (!sel.includes(v)) sel.push(v);
    }
    leftPick.clear(); draw(); emit();
  };
  const remove = (v) => { sel = sel.filter((x) => x !== v); if (rightPick === v) rightPick = null; draw(); emit(); };
  const move = (d) => {
    if (rightPick == null) return;
    const i = sel.indexOf(rightPick), j = i + d;
    if (i < 0 || j < 0 || j >= sel.length) return;
    [sel[i], sel[j]] = [sel[j], sel[i]];
    draw(); emit();
  };
  const item = (o, picked, onClick, onDbl) => h('div', { class: ['om-dual-item', picked && 'picked'], role: 'option', 'aria-selected': String(!!picked), tabindex: '0',
    onClick, onDblclick: onDbl, onKeydown: (e) => { if (e.key === 'Enter') onDbl(); if (e.key === ' ') { e.preventDefault(); onClick(e); } } },
  h('span', { class: 'grow truncate' }, o.label), o.meta || renderMeta ? h('span', { class: 'muted tiny truncate', style: { maxWidth: '45%' } }, renderMeta ? renderMeta(o) : o.meta) : null);
  const draw = () => {
    clear(left); clear(right);
    const t = q.value.toLowerCase();
    const avail = options.filter((o) => !sel.includes(o.value) && (!t || o.label.toLowerCase().includes(t) || String(o.value).toLowerCase().includes(t)));
    if (!avail.length) left.appendChild(h('div', { class: 'muted small center p-16' }, 'None available'));
    let lastGroup = null;
    for (const o of avail) {
      if (o.group && o.group !== lastGroup) { left.appendChild(h('div', { class: 'om-dual-group' }, o.group)); lastGroup = o.group; }
      left.appendChild(item(o, leftPick.has(o.value), (e) => {
        if (disabled) return;
        if (e.metaKey || e.ctrlKey) leftPick.has(o.value) ? leftPick.delete(o.value) : leftPick.add(o.value);
        else leftPick = new Set([o.value]);
        draw();
      }, () => !disabled && add([o.value])));
    }
    if (!sel.length) right.appendChild(h('div', { class: 'muted small center p-16' }, 'Nothing selected'));
    for (const v of sel) {
      const o = byVal.get(v) || { value: v, label: v };
      right.appendChild(item(o, rightPick === v, () => { if (disabled) return; rightPick = v; draw(); }, () => !disabled && remove(v)));
    }
    counter.textContent = max ? `${sel.length} of ${max}` : `${sel.length} selected`;
  };
  q.addEventListener('input', draw);
  const btn = (ic, label, fn) => h('button', { type: 'button', class: 'btn btn-sm btn-icon', title: label, 'aria-label': label, disabled, onClick: fn }, icon(ic));
  draw();
  const el = h('div', { class: 'om-dual' },
    h('div', { class: 'om-dual-col' }, h('div', { class: 'om-dual-head' }, h('span', { class: 'form-label' }, availableLabel)), h('div', { class: 'mb-8' }, q), left),
    h('div', { class: 'om-dual-btns' }, btn('chevronRight', 'Add', () => add([...leftPick])), btn('chevronLeft', 'Remove', () => rightPick != null && remove(rightPick))),
    h('div', { class: 'om-dual-col' }, h('div', { class: 'om-dual-head' }, h('span', { class: 'form-label' }, selectedLabel)), h('div', { class: 'mb-8 om-dual-counter' }, counter), right),
    h('div', { class: 'om-dual-btns' }, btn('chevronUp', 'Move up', () => move(-1)), btn('chevronDown', 'Move down', () => move(1))));
  return { el, get: () => [...sel] };
}

export function kv(label, value) {
  return h('div', { class: 'om-kv' }, h('div', { class: 'om-kv-label' }, label), h('div', { class: 'om-kv-value' }, value == null || value === '' ? h('span', { class: 'muted' }, '—') : value));
}

export const yesNo = (v) => (v ? h('span', { class: 'row gap-4' }, icon('check', { cls: 'om-yes' }), 'Yes') : h('span', { class: 'muted' }, 'No'));

// Objects visible to the client sorted by label.
export const allObjects = () => [...state.objects.values()].sort((a, b) => a.label.localeCompare(b.label));

// Busy-state helper for async button handlers.
export async function busy(btn, fn) {
  const old = btn.disabled;
  btn.disabled = true;
  btn.classList.add('om-busy');
  try { return await fn(); } finally { btn.disabled = old; btn.classList.remove('om-busy'); }
}

export function autoNumberPreview(format, n = 1) {
  return String(format || '{0000}').replace(/\{(0+)\}/, (_, z) => String(n).padStart(z.length, '0')).replace(/\{YYYY\}/g, String(new Date().getUTCFullYear()));
}
