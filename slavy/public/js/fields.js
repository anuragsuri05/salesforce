// Field display, field inputs (every type), lookups and the layout-driven record form.
import { h, icon, fmt, modal, debounce, clear, objIcon, avatar, toast } from './lib.js';
import { GET, POST, PATCH, getObj, objForId, state, ApiError } from './api.js';

const COMPUTED = new Set(['Formula', 'Rollup', 'AutoNumber', 'Id']);
export const isReference = (f) => f && (f.type === 'Lookup' || f.type === 'MasterDetail');
export const effectiveType = (f) => (f?.type === 'Formula' || f?.type === 'Rollup' ? f.returnType || 'Number' : f?.type);
export const isNumeric = (f) => ['Number', 'Currency', 'Percent'].includes(effectiveType(f));

export function canEditField(f, mode = 'edit') {
  if (!f || COMPUTED.has(f.type) || f.readOnly) return false;
  if (f.access && !f.access.edit) return false;
  if (f.system && !['Name', 'OwnerId'].includes(f.apiName)) return false;
  if (mode === 'edit' && f.type === 'MasterDetail' && !f.reparentable) return false;
  return true;
}

// ---------- display ----------
export function formatPlain(f, v, labels) {
  if (v == null || v === '') return '';
  const t = effectiveType(f);
  switch (t) {
    case 'Currency': return fmt.currency(v);
    case 'Percent': return fmt.percent(v);
    case 'Number': return fmt.number(v, f.scale ?? 2);
    case 'Date': return fmt.date(v);
    case 'DateTime': return fmt.datetime(v);
    case 'Checkbox': return v ? 'Yes' : 'No';
    case 'MultiPicklist': return String(v).split(';').join(', ');
    case 'Lookup': case 'MasterDetail': return labels?.[f.apiName] || labels?.[f.path] || v;
    default: return String(v);
  }
}

export function displayValue(f, v, record, { link = true, path } = {}) {
  const key = path || f?.apiName;
  const labels = record?._labels || {};
  if (f && effectiveType(f) === 'Checkbox') {
    return h('span', { class: 'row gap-4', title: v ? 'Checked' : 'Not checked' }, h('input', { type: 'checkbox', checked: !!v, disabled: true, style: { accentColor: 'var(--brand)' } }));
  }
  if (v == null || v === '') return h('span', { class: 'muted' }, '');
  const t = effectiveType(f);
  if (f?.isNameField && link && record?.Id && !path) return h('a', { href: `#/r/${record.Id}` }, String(v));
  if (isReference(f) || f?.ownerField || f?.polymorphic) {
    const name = labels[key] || String(v);
    const pre = String(v).slice(0, 3);
    if (pre === '005') return h('span', { class: 'row gap-4' }, avatar(name, 'sm'), name);
    if (pre === '00G') return h('span', { class: 'row gap-4' }, icon('users'), name);
    return link ? h('a', { href: `#/r/${v}`, title: name }, name) : h('span', name);
  }
  switch (t) {
    case 'Email': return h('a', { href: `mailto:${v}` }, v);
    case 'Phone': return h('a', { href: `tel:${String(v).replace(/[^\d+]/g, '')}` }, v);
    case 'Url': {
      const href = /^https?:\/\//i.test(v) ? v : `https://${v}`;
      return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, String(v).replace(/^https?:\/\//, ''));
    }
    case 'MultiPicklist': return h('span', String(v).split(';').map((x) => h('span', { class: 'chip' }, x)));
    case 'TextArea': case 'LongTextArea': return h('span', { class: 'pre-wrap' }, v);
    default: return h('span', formatPlain(f, v, labels));
  }
}

// ---------- inputs ----------
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Returns { el, get(), set(v), focus() }
export function fieldInput(f, value, { record, onChange, objApi, compact } = {}) {
  const cls = compact ? 'input input-sm' : 'input';
  const changed = () => onChange?.(api.get());
  let api;
  switch (f.type) {
    case 'Checkbox': {
      const cb = h('input', { type: 'checkbox', checked: !!value, onChange: changed });
      api = { el: h('label', { class: 'checkbox', style: { height: compact ? '28px' : '34px' } }, cb), get: () => cb.checked, set: (v) => { cb.checked = !!v; }, focus: () => cb.focus() };
      break;
    }
    case 'TextArea': case 'LongTextArea': {
      const ta = h('textarea', { class: cls, rows: f.visibleLines || 3, maxlength: f.length || undefined, onInput: changed }, '');
      ta.value = value ?? '';
      api = { el: ta, get: () => ta.value, set: (v) => { ta.value = v ?? ''; }, focus: () => ta.focus() };
      break;
    }
    case 'Number': case 'Currency': case 'Percent': {
      const step = f.scale ? String(1 / 10 ** f.scale) : 'any';
      const inp = h('input', { class: cls, type: 'number', step, value: value ?? '', onInput: changed });
      const wrap = f.type === 'Currency' || f.type === 'Percent'
        ? h('div', { class: 'input-group' }, h('span', { class: 'icon', style: { width: 'auto', fontSize: '12px', fontWeight: 600 } }, f.type === 'Currency' ? (state.session?.org?.currency === 'USD' || !state.session?.org?.currency ? '$' : state.session.org.currency) : '%'), inp)
        : inp;
      api = { el: wrap, get: () => (inp.value === '' ? null : Number(inp.value)), set: (v) => { inp.value = v ?? ''; }, focus: () => inp.focus() };
      break;
    }
    case 'Date': {
      const inp = h('input', { class: cls, type: 'date', value: value ? String(value).slice(0, 10) : '', onInput: changed });
      api = { el: inp, get: () => inp.value || null, set: (v) => { inp.value = v ? String(v).slice(0, 10) : ''; }, focus: () => inp.focus() };
      break;
    }
    case 'DateTime': {
      const inp = h('input', { class: cls, type: 'datetime-local', value: toLocalInput(value), onInput: changed });
      api = { el: inp, get: () => (inp.value ? new Date(inp.value).toISOString() : null), set: (v) => { inp.value = toLocalInput(v); }, focus: () => inp.focus() };
      break;
    }
    case 'Picklist': {
      const vals = (f.values || []).filter((v) => v.isActive !== false || v.value === value);
      const sel = h('select', { class: cls, onChange: changed },
        h('option', { value: '' }, '--None--'),
        vals.map((v) => h('option', { value: v.value, selected: v.value === value }, v.label || v.value)));
      if (value && !vals.some((v) => v.value === value)) sel.appendChild(h('option', { value, selected: true }, value));
      api = { el: sel, get: () => sel.value || null, set: (v) => { sel.value = v ?? ''; }, focus: () => sel.focus() };
      break;
    }
    case 'MultiPicklist': {
      const selected = new Set(String(value || '').split(';').filter(Boolean));
      const boxes = (f.values || []).filter((v) => v.isActive !== false).map((v) => {
        const cb = h('input', { type: 'checkbox', checked: selected.has(v.value), onChange: changed });
        cb.dataset.value = v.value;
        return h('label', { class: 'checkbox', style: { display: 'flex', padding: '2px 0' } }, cb, v.label || v.value);
      });
      const box = h('div', { class: 'input', style: { height: 'auto', maxHeight: '160px', overflowY: 'auto' } }, boxes);
      api = {
        el: box,
        get: () => [...box.querySelectorAll('input')].filter((c) => c.checked).map((c) => c.dataset.value).join(';') || null,
        set: (v) => { const s = new Set(String(v || '').split(';')); box.querySelectorAll('input').forEach((c) => { c.checked = s.has(c.dataset.value); }); },
        focus: () => box.querySelector('input')?.focus(),
      };
      break;
    }
    case 'Lookup': case 'MasterDetail': {
      const refs = Array.isArray(f.referenceTo) ? f.referenceTo : [f.referenceTo];
      let objects = refs.includes('*') ? [...state.objects.values()].filter((o) => o.enableActivities !== false && !o.isActivity && o.perms.read).map((o) => o.apiName) : refs;
      if (f.ownerField) objects = ['User'];
      api = lookupInput({ objects, value, label: record?._labels?.[f.apiName], includeQueues: !!f.ownerField, onChange: changed, compact });
      break;
    }
    default: {
      const type = f.type === 'Email' ? 'email' : f.type === 'Phone' ? 'tel' : f.type === 'Url' ? 'url' : 'text';
      const inp = h('input', { class: cls, type, maxlength: f.length || 255, value: value ?? '', onInput: changed });
      api = { el: inp, get: () => (inp.value === '' ? null : inp.value), set: (v) => { inp.value = v ?? ''; }, focus: () => inp.focus() };
    }
  }
  return api;
}

// Lookup with typeahead. objects: list of object API names (or ['User']); polymorphic shows an object switcher.
export function lookupInput({ objects, value = null, label = null, includeQueues = false, onChange, compact, placeholder } = {}) {
  let current = value ? { id: value, name: label || value } : null;
  let objApi = (value && objForId(value)?.apiName) || (value && String(value).startsWith('005') ? 'User' : objects[0]);
  const root = h('div', { class: 'typeahead' });
  const objLabel = (api) => (api === 'User' ? 'Users' : getObj(api)?.pluralLabel || api);
  let input, list, active = -1, results = [];

  const select = (item) => {
    current = item ? { id: item.id, name: item.name } : null;
    draw();
    onChange?.(current?.id ?? null);
  };

  const search = debounce(async (q) => {
    try {
      results = await GET(`/api/lookup/${objApi}?q=${encodeURIComponent(q)}${includeQueues ? '&queues=1' : ''}`);
    } catch { results = []; }
    renderList(q);
  }, 180);

  function renderList(q) {
    if (!list) return;
    clear(list);
    active = -1;
    const o = getObj(objApi);
    list.appendChild(h('div', { class: 'menu-header' }, q ? `Results in ${objLabel(objApi)}` : `Recent ${objLabel(objApi)}`));
    if (!results.length) list.appendChild(h('div', { class: 'typeahead-item muted' }, q ? 'No matches' : 'Type to search'));
    results.forEach((r, i) => {
      const ro = objForId(r.id);
      list.appendChild(h('div', { class: 'typeahead-item', onMousedown: (e) => { e.preventDefault(); select(r); } },
        r.kind === 'User' ? avatar(r.name, 'sm') : r.kind === 'Queue' ? h('span', { class: 'obj-icon sm', style: { background: '#64748b' } }, icon('users')) : objIcon(ro || o, 'sm'),
        h('div', { class: 'grow' }, h('div', r.name), r.sub ? h('div', { class: 'sub' }, r.sub) : null)));
      list.lastChild.dataset.index = i;
    });
    if (o && o.perms?.create && objApi !== 'User') {
      list.appendChild(h('div', { class: 'typeahead-item', style: { borderTop: '1px solid var(--border)', marginTop: '4px' }, onMousedown: async (e) => {
        e.preventDefault();
        closeList();
        const created = await recordForm(objApi, { mode: 'new', defaults: q ? { Name: q } : {} });
        if (created) select({ id: created.Id, name: created.Name });
      } }, icon('plus'), `New ${o.label}`));
    }
  }

  function closeList() { list?.remove(); list = null; }

  function draw() {
    clear(root);
    if (current) {
      const o = objForId(current.id);
      root.appendChild(h('div', { class: 'lookup-selected', style: compact ? { height: '28px' } : null },
        String(current.id).startsWith('005') ? avatar(current.name, 'sm') : String(current.id).startsWith('00G') ? icon('users') : objIcon(o, 'sm'),
        h('span', { class: 'name' }, current.name),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Clear selection', onClick: () => { select(null); setTimeout(() => input?.focus(), 0); } }, icon('x'))));
      return;
    }
    const row = h('div', { class: 'row gap-4' });
    if (objects.length > 1) {
      const sel = h('select', { class: compact ? 'input input-sm' : 'input', style: { width: '130px' }, onChange: () => { objApi = sel.value; input.focus(); search(input.value); } },
        objects.map((o) => h('option', { value: o, selected: o === objApi }, getObj(o)?.label || o)));
      row.appendChild(sel);
    }
    input = h('input', {
      class: compact ? 'input input-sm' : 'input', placeholder: placeholder || `Search ${objLabel(objApi)}...`, autocomplete: 'off',
      onFocus: () => { if (!list) { list = h('div', { class: 'typeahead-list' }); root.appendChild(list); } search(input.value); },
      onInput: () => search(input.value),
      onBlur: () => setTimeout(closeList, 150),
      onKeydown: (e) => {
        if (!list) return;
        const items = [...list.querySelectorAll('.typeahead-item[data-index]')];
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          active = Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
          items.forEach((it, i) => it.classList.toggle('active', i === active));
        } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); select(results[active]); }
      },
    });
    const wrap = h('div', { class: 'input-group grow' }, icon('search'), input);
    row.appendChild(wrap);
    root.appendChild(row);
  }

  draw();
  return { el: root, get: () => current?.id ?? null, set: (v, name) => { current = v ? { id: v, name: name || v } : null; draw(); }, focus: () => input?.focus() };
}

// ---------- record form (New / Edit / Clone) ----------
export function formSections(obj, mode) {
  const layout = obj.layout || { sections: [] };
  const used = new Set();
  const sections = layout.sections.map((s) => {
    const fields = s.fields.map((api) => obj.fieldMap.get(api)).filter(Boolean)
      .filter((f) => !(mode !== 'edit' && COMPUTED.has(f.type)))
      .filter((f) => !(f.system && !['Name', 'OwnerId'].includes(f.apiName) && mode !== 'edit'))
      .filter((f) => !(f.apiName === 'Name' && f.readOnly && mode !== 'edit'));
    fields.forEach((f) => used.add(f.apiName));
    return { ...s, fields };
  }).filter((s) => s.fields.length);
  // Required editable fields missing from the layout still need inputs.
  const missing = obj.fields.filter((f) => !used.has(f.apiName) && f.required && canEditField(f, mode) && f.type !== 'Checkbox');
  if (missing.length) {
    if (sections.length) sections[0].fields.push(...missing);
    else sections.push({ label: 'Information', columns: 2, fields: missing });
  }
  if (!sections.length) sections.push({ label: 'Information', columns: 2, fields: obj.fields.filter((f) => canEditField(f, mode)) });
  return sections;
}

// Opens a modal. Resolves with the saved record, or null if cancelled.
export function recordForm(objApi, { record = null, defaults = {}, mode = record ? 'edit' : 'new', title, onSaved } = {}) {
  const obj = getObj(objApi);
  return new Promise((resolve) => {
    let saved = null;
    const inputs = new Map();
    const errorEls = new Map();
    const values = mode === 'edit' ? { ...record } : { ...(record || {}), ...defaults };
    if (mode === 'clone') { delete values.Id; }
    const labels = { ...(record?._labels || {}), ...(defaults._labels || {}) };
    if (mode !== 'edit' && !values.OwnerId && state.session?.user) { values.OwnerId = state.session.user.Id; labels.OwnerId = state.session.user.Name; }

    const body = h('div');
    for (const s of formSections(obj, mode)) {
      body.appendChild(h('div', { class: 'section-title' }, s.label));
      const grid = h('div', { class: ['form-grid', s.columns === 1 && 'cols-1'] });
      for (const f of s.fields) {
        const editable = canEditField(f, mode) && !(mode !== 'edit' && f.apiName === 'OwnerId' && false);
        const label = h('label', { class: 'form-label' }, f.required && editable && f.type !== 'Checkbox' ? h('span', { class: 'req' }, '*') : null, f.label,
          f.helpText ? h('span', { class: 'help-tip', title: f.helpText }, 'i') : null);
        const err = h('div', { class: 'form-error hidden' });
        errorEls.set(f.apiName, err);
        let control;
        if (editable) {
          const inp = fieldInput(f, values[f.apiName], { record: { _labels: labels }, objApi });
          inputs.set(f.apiName, inp);
          control = inp.el;
        } else {
          control = h('div', { style: { minHeight: '34px', display: 'flex', alignItems: 'center' }, class: 'muted' },
            mode === 'new' && f.apiName === 'OwnerId' ? state.session.user.Name : displayValue(f, values[f.apiName], { _labels: labels }, { link: false }));
        }
        const wide = ['TextArea', 'LongTextArea', 'MultiPicklist'].includes(f.type) && s.columns !== 1;
        grid.appendChild(h('div', { class: ['form-row', wide && 'span-2'] }, label, control, err));
      }
      body.appendChild(grid);
    }

    const collect = () => {
      const out = {};
      for (const [api, inp] of inputs) {
        const v = inp.get();
        if (mode === 'edit') {
          const before = record[api] ?? null;
          if ((v ?? null) !== before && !(v === false && before == null)) out[api] = v;
        } else if (v !== null && v !== '' && !(v === false && !defaults[api])) out[api] = v;
        else if (v === false && defaults[api] === false) out[api] = false;
      }
      if (mode !== 'edit') for (const [k, v] of Object.entries(defaults)) if (!k.startsWith('_') && !(k in out) && !inputs.has(k) && v != null) out[k] = v;
      return out;
    };

    const showErrors = (e) => {
      for (const el of errorEls.values()) el.classList.add('hidden');
      const general = [];
      for (const er of e.errors || []) {
        const el = er.field && errorEls.get(er.field);
        if (el) { el.textContent = er.message; el.classList.remove('hidden'); }
        else general.push(er.field ? `${obj.fieldMap.get(er.field)?.label || er.field}: ${er.message}` : er.message);
      }
      if (!e.errors?.length) general.push(e.message);
      m.setError(general.length ? general.join(' • ') : 'Review the errors on this page.');
    };

    const save = async (andNew) => {
      m.setError('');
      const payload = collect();
      try {
        btns.forEach((b) => { b.disabled = true; });
        const rec = mode === 'edit' ? await PATCH(`/api/record/${record.Id}`, payload) : await POST(`/api/records/${objApi}`, payload);
        saved = rec;
        toast(`${obj.label} "${rec.Name || ''}" was ${mode === 'edit' ? 'saved' : 'created'}.`, 'success');
        onSaved?.(rec);
        if (andNew) {
          m.close();
          recordForm(objApi, { defaults, mode: 'new', onSaved }).then((r) => resolve(r || saved));
          return;
        }
        m.close();
      } catch (e) {
        if (e instanceof ApiError) showErrors(e); else m.setError(e.message);
      } finally {
        btns.forEach((b) => { b.disabled = false; });
      }
    };

    const btns = [
      h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'),
      mode !== 'edit' ? h('button', { class: 'btn', onClick: () => save(true) }, 'Save & New') : null,
      h('button', { class: 'btn btn-brand', onClick: () => save(false) }, 'Save'),
    ].filter(Boolean);
    const m = modal({
      title: title || (mode === 'edit' ? `Edit ${record.Name || obj.label}` : mode === 'clone' ? `Clone ${obj.label}` : `New ${obj.label}`),
      body, footer: btns, size: 'lg', onClose: () => resolve(saved),
    });
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(false); });
  });
}
