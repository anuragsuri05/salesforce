// Reusable filter editor for list views, reports, sharing rules and scheduled flows.
// filterEditor({ objApi, filters, logic, onChange, allowPaths }) -> { el, get() => { filters, filterLogic } }
import { h, icon, clear, modal } from '../lib.js';
import { getObj, pathOptions, fieldAtPath } from '../api.js';
import { fieldInput, effectiveType, formatPlain } from '../fields.js';

export const OPERATORS = [
  { op: 'equals', label: 'equals' }, { op: 'notEqual', label: 'not equal to' }, { op: 'lessThan', label: 'less than' },
  { op: 'greaterThan', label: 'greater than' }, { op: 'lessOrEqual', label: 'less or equal' }, { op: 'greaterOrEqual', label: 'greater or equal' },
  { op: 'contains', label: 'contains' }, { op: 'notContain', label: 'does not contain' }, { op: 'startsWith', label: 'starts with' },
  { op: 'includes', label: 'includes' }, { op: 'excludes', label: 'excludes' },
];

export const DATE_LITERALS = ['TODAY', 'YESTERDAY', 'TOMORROW', 'THIS_WEEK', 'LAST_WEEK', 'NEXT_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'NEXT_MONTH',
  'THIS_QUARTER', 'LAST_QUARTER', 'NEXT_QUARTER', 'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR', 'LAST_90_DAYS', 'NEXT_90_DAYS', 'LAST_N_DAYS:30', 'NEXT_N_DAYS:30', 'LAST_N_MONTHS:12'];

export function operatorsFor(f) {
  const t = effectiveType(f);
  if (t === 'Checkbox') return OPERATORS.filter((o) => ['equals', 'notEqual'].includes(o.op));
  if (t === 'MultiPicklist') return OPERATORS.filter((o) => ['equals', 'notEqual', 'includes', 'excludes'].includes(o.op));
  if (['Number', 'Currency', 'Percent', 'Date', 'DateTime'].includes(t)) return OPERATORS.filter((o) => !['contains', 'notContain', 'startsWith', 'includes', 'excludes'].includes(o.op));
  if (t === 'Lookup' || t === 'MasterDetail' || t === 'Id') return OPERATORS.filter((o) => ['equals', 'notEqual'].includes(o.op));
  return OPERATORS.filter((o) => !['includes', 'excludes'].includes(o.op));
}

export function describeFilter(objApi, f) {
  const fd = fieldAtPath(objApi, f.field);
  const op = OPERATORS.find((o) => o.op === f.op)?.label || f.op;
  let val = f.value;
  if (fd && effectiveType(fd) === 'Checkbox') val = String(val) === 'true' ? 'True' : 'False';
  else if (val === '' || val == null) val = '""';
  return { field: fd?.fullLabel || f.field, op, value: String(val) };
}

// Value control appropriate for the field type (picklists get a multi-select of values, dates get literals).
function valueControl(fd, value, onChange) {
  const t = effectiveType(fd);
  if (t === 'Checkbox') {
    const sel = h('select', { class: 'input input-sm', onChange: () => onChange(sel.value) }, h('option', { value: 'true', selected: String(value) === 'true' }, 'True'), h('option', { value: 'false', selected: String(value) !== 'true' }, 'False'));
    if (value === '' || value == null) onChange('false');
    return sel;
  }
  if ((t === 'Picklist' || t === 'MultiPicklist') && fd.values?.length) {
    const selected = new Set(String(value || '').split(',').map((s) => s.trim()).filter(Boolean));
    const box = h('div', { class: 'input', style: { height: 'auto', maxHeight: '150px', overflowY: 'auto', padding: '4px 8px' } },
      fd.values.map((v) => {
        const cb = h('input', { type: 'checkbox', checked: selected.has(v.value), onChange: () => {
          if (cb.checked) selected.add(v.value); else selected.delete(v.value);
          onChange([...selected].join(','));
        } });
        return h('label', { class: 'checkbox', style: { display: 'flex', padding: '2px 0' } }, cb, v.label || v.value);
      }));
    return box;
  }
  const inp = h('input', { class: 'input input-sm', value: value ?? '', placeholder: t === 'Date' || t === 'DateTime' ? 'YYYY-MM-DD or THIS_MONTH' : 'Value (comma-separate for OR)', list: t === 'Date' || t === 'DateTime' ? 'slavy-date-literals' : null, onInput: () => onChange(inp.value) });
  return inp;
}

let datalistAdded = false;
function ensureDatalist() {
  if (datalistAdded) return;
  datalistAdded = true;
  document.body.appendChild(h('datalist', { id: 'slavy-date-literals' }, DATE_LITERALS.map((d) => h('option', { value: d }))));
}

// Modal to add/edit one filter. Resolves with { field, op, value } or null.
export function editFilterDialog(objApi, filter = {}, { allowPaths = true } = {}) {
  ensureDatalist();
  return new Promise((resolve) => {
    let result = null;
    const opts = allowPaths ? pathOptions(objApi) : pathOptions(objApi, { depth: 0 });
    const cur = { field: filter.field || opts[0]?.path, op: filter.op || 'equals', value: filter.value ?? '' };
    const fieldSel = h('select', { class: 'input' });
    const groups = new Map();
    for (const o of opts) { if (!groups.has(o.group)) groups.set(o.group, []); groups.get(o.group).push(o); }
    for (const [g, list] of groups) fieldSel.appendChild(h('optgroup', { label: g }, list.map((o) => h('option', { value: o.path, selected: o.path === cur.field }, o.label))));
    const opWrap = h('div');
    const valWrap = h('div');
    const draw = () => {
      const fd = fieldAtPath(objApi, cur.field) || { type: 'Text' };
      const ops = operatorsFor(fd);
      if (!ops.some((o) => o.op === cur.op)) cur.op = ops[0].op;
      const opSel = h('select', { class: 'input', onChange: () => { cur.op = opSel.value; } }, ops.map((o) => h('option', { value: o.op, selected: o.op === cur.op }, o.label)));
      clear(opWrap).appendChild(opSel);
      clear(valWrap).appendChild(valueControl(fd, cur.value, (v) => { cur.value = v; }));
    };
    fieldSel.addEventListener('change', () => { cur.field = fieldSel.value; cur.value = ''; draw(); });
    draw();
    const m = modal({
      title: filter.field ? 'Edit Filter' : 'Add Filter', size: 'sm',
      body: h('div', { class: 'col gap-12' }, h('div', h('label', { class: 'form-label' }, 'Field'), fieldSel), h('div', h('label', { class: 'form-label' }, 'Operator'), opWrap), h('div', h('label', { class: 'form-label' }, 'Value'), valWrap)),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: () => { result = { ...cur }; m.close(); } }, 'Done')],
      onClose: () => resolve(result),
    });
  });
}

export function filterEditor({ objApi, filters = [], logic = '', onChange, allowPaths = true, title = 'Filters' }) {
  let list = filters.map((f) => ({ ...f }));
  let filterLogic = logic || '';
  const el = h('div', { class: 'filter-editor' });
  const emit = () => onChange?.({ filters: list, filterLogic });
  const draw = () => {
    clear(el);
    el.appendChild(h('div', { class: 'row mb-8' }, h('strong', { class: 'grow' }, title),
      h('button', { class: 'btn btn-sm', type: 'button', onClick: async () => { const f = await editFilterDialog(objApi, {}, { allowPaths }); if (f) { list.push(f); draw(); emit(); } } }, icon('plus'), 'Add Filter')));
    if (!list.length) el.appendChild(h('div', { class: 'muted small mb-8' }, 'No filters. All records are included.'));
    list.forEach((f, i) => {
      const d = describeFilter(objApi, f);
      el.appendChild(h('div', { class: 'filter-card row' },
        h('span', { class: 'badge' }, String(i + 1)),
        h('div', { class: 'grow', onClick: async () => { const nf = await editFilterDialog(objApi, f, { allowPaths }); if (nf) { list[i] = nf; draw(); emit(); } } },
          h('div', { class: 'small muted' }, d.field), h('div', h('span', { class: 'muted' }, d.op + ' '), h('strong', d.value))),
        h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', 'aria-label': 'Remove filter', onClick: () => { list.splice(i, 1); draw(); emit(); } }, icon('x'))));
    });
    if (list.length > 1) {
      const inp = h('input', { class: 'input input-sm', value: filterLogic, placeholder: `e.g. 1 AND (2 OR 3)`, onChange: () => { filterLogic = inp.value; emit(); } });
      el.appendChild(h('div', { class: 'mt-8' }, h('label', { class: 'form-label' }, 'Filter Logic (optional)'), inp));
    }
  };
  draw();
  return { el, get: () => ({ filters: list, filterLogic }) };
}

export { formatPlain, getObj };
