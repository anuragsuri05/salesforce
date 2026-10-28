// Flow Builder: toolbar, auto-layout canvas (Start → elements → End) and a right-hand property panel.
import { h, icon, mount, clear, fmt, modal, confirmDialog, promptDialog, toast, showMenu, badge, debounce } from '../../lib.js';
import { GET, POST, PUT, DEL, getObj, state, can } from '../../api.js';
import { lookupInput } from '../../fields.js';
import { formulaEditor } from '../../components/formula.js';
import { assignmentsEditor } from '../../components/assignments.js';
import { filterEditor, describeFilter } from '../../components/filters.js';
import {
  ELEMENT_TYPES, FLOW_TYPES, TRIGGERS, RECIPIENTS, DAYS, allowedTypes, defaultElement, relatedLookups, lookupTarget,
  summarize, scheduleText, triggerText, blankFlow, ELEMENT_GROUPS, promptTemplates,
} from './elements.js';
import { templateField } from './merge.js';

const STRIP = ['id', 'type', 'createdAt', 'updatedAt', 'createdBy'];

function objectOptions() {
  return [...state.objects.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function cleanFlow(flow) {
  const out = {};
  for (const [k, v] of Object.entries(flow)) if (!STRIP.includes(k)) out[k] = v;
  out.elements = (flow.elements || []).map((el) => {
    const e = { ...el };
    if (e.assignments) e.assignments = e.assignments.filter((a) => a.field).map((a) => ({ field: a.field, value: a.value ?? '', isFormula: !!a.isFormula }));
    if (!e.condition || !String(e.condition).trim()) delete e.condition;
    delete e._conditional;
    return e;
  });
  return out;
}

export async function renderBuilder(container, { id, type, app }) {
  const editable = can('ManageFlows');
  const [loaded, users] = await Promise.all([
    id ? GET(`/api/setup/meta/flow/${encodeURIComponent(id)}`) : Promise.resolve(null),
    GET('/api/users').catch(() => []),
  ]);
  const userNames = Object.fromEntries(users.map((u) => [u.Id, u.Name]));
  let flow = loaded ? structuredClone(loaded) : blankFlow(FLOW_TYPES[type] ? type : 'record');
  let dirty = !loaded;
  let busy = false;
  let selected = loaded ? null : 'start'; // 'props' | 'start' | element id
  let errorMsg = '';

  app.setTitle(loaded ? `${flow.label} | Flow Builder` : 'New Flow | Flow Builder');

  // Collapse the setup navigation so the builder gets the full width (like Salesforce's full-screen Flow Builder).
  const layout = container.closest('.setup-layout');
  layout?.classList.add('fb-mode');

  const toolbar = h('div', { class: 'fb-toolbar' });
  const errorBar = h('div', { class: 'fb-error hidden' });
  const diagram = h('div', { class: 'fb-diagram' });
  const canvas = h('div', { class: 'fb-canvas', onClick: (e) => { if (e.target === canvas || e.target === diagram) select(null); } }, diagram);
  const panel = h('aside', { class: 'fb-panel hidden', 'aria-label': 'Element properties' });
  const root = h('div', { class: 'flow-builder' }, toolbar, errorBar, h('div', { class: 'fb-body' }, canvas, panel));
  mount(container, root);

  const onBeforeUnload = (e) => { if (dirty && editable) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onBeforeUnload);
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && editable && !document.querySelector('.modal-backdrop')) { e.preventDefault(); save(); }
  };
  document.addEventListener('keydown', onKey);

  const markDirty = () => { if (!dirty) { dirty = true; drawToolbar(); } };
  const changed = debounce(() => drawCanvas(), 120);
  const touch = () => { markDirty(); changed(); };

  // Prompt templates for the flow's object (used by "AI Prompt" elements).
  let prompts = null; // null = not loaded yet
  let promptsFor = null;
  async function loadPrompts({ force = false } = {}) {
    if (!force && promptsFor === flow.object && prompts) return prompts;
    const objApi = flow.object;
    try { prompts = await GET(`/api/ai/prompts?object=${encodeURIComponent(objApi)}`); } catch { prompts = []; }
    promptsFor = objApi;
    for (const t of prompts) promptTemplates.set(t.id, t);
    return prompts;
  }
  if (flow.elements.some((e) => e.type === 'aiPrompt')) loadPrompts().then(() => drawCanvas());

  function select(sel) {
    selected = sel;
    drawCanvas();
    drawPanel();
  }

  function setError(msg) {
    errorMsg = msg || '';
    clear(errorBar);
    errorBar.classList.toggle('hidden', !errorMsg);
    if (errorMsg) {
      errorBar.append(icon('alert'), h('div', { class: 'grow' }, h('strong', 'The flow couldn’t be saved. '), errorMsg),
        h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Dismiss error', onClick: () => setError('') }, icon('x')));
    }
  }

  // ---------- toolbar ----------
  function drawToolbar() {
    clear(toolbar);
    const ft = FLOW_TYPES[flow.flowType];
    const btn = (label, ic, onClick, cls = 'btn', extra = {}) => h('button', { class: cls, onClick, disabled: busy, ...extra }, ic ? icon(ic) : null, label);
    toolbar.append(
      h('button', { class: 'btn btn-ghost fb-back', onClick: back, 'aria-label': 'Back to Flows' }, icon('chevronLeft'), h('span', 'Flows')),
      h('div', { class: 'fb-title' },
        h('span', { class: 'fb-type-icon', style: { background: ft.color } }, icon(ft.icon)),
        h('div', { class: 'grow', style: { minWidth: 0 } },
          h('div', { class: 'row gap-4' }, h('h1', { class: 'truncate' }, flow.label || 'New Flow'),
            editable ? h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Edit flow properties', title: 'Flow properties', onClick: () => select('props') }, icon('edit', { size: 14 })) : null),
          h('div', { class: 'fb-meta' },
            h('span', ft.short),
            h('span', { class: 'sep' }, '•'),
            h('span', flow.version ? `Version ${flow.version}` : 'Not saved yet'),
            badge(flow.active ? 'Active' : 'Inactive', flow.active ? 'success' : ''),
            dirty && editable ? badge('Unsaved changes', 'warning') : (loaded && flow.updatedAt ? h('span', { class: 'muted' }, `Saved ${fmt.relative(flow.updatedAt)}`) : null),
            !editable ? badge('Read only', 'danger') : null))),
      h('div', { class: 'fb-actions' },
        h('button', { class: 'btn btn-icon', title: 'Flow properties', 'aria-label': 'Flow properties', onClick: () => select('props') }, icon('sliders')),
        flow.flowType === 'scheduled' && flow.id && editable ? btn('Run Now', 'play', runNow) : null,
        flow.id && editable ? btn('', 'trash', remove, 'btn btn-icon', { title: 'Delete flow', 'aria-label': 'Delete flow' }) : null,
        flow.id && editable ? btn('Save As New Flow', 'copy', saveAsNew) : null,
        editable ? btn(flow.active ? 'Deactivate' : 'Activate', flow.active ? 'x' : 'zap', toggleActive) : null,
        editable ? btn('Save', 'check', () => save(), 'btn btn-brand', { title: 'Save (Ctrl/⌘ + S)' }) : null));
  }

  async function back() {
    const pending = dirty && editable && (flow.id || flow.elements.length || flow.label);
    if (pending && !(await confirmDialog(flow.id ? 'You have unsaved changes. Leave the Flow Builder and discard them?' : 'This flow hasn’t been saved. Leave and discard it?', { title: 'Discard changes?', confirmLabel: 'Discard', danger: true }))) return;
    dirty = false;
    app.navigate('/setup/flows');
  }

  async function ensureLabel(title = 'Save Flow') {
    if (flow.label?.trim()) return true;
    const label = await promptDialog('Flow Label', { title, confirmLabel: 'Save' });
    if (!label?.trim()) return false;
    flow.label = label.trim();
    return true;
  }

  async function save({ active } = {}) {
    if (busy || !editable) return null;
    if (!(await ensureLabel())) return null;
    const body = cleanFlow(flow);
    if (active !== undefined) body.active = active;
    busy = true; drawToolbar();
    try {
      const res = flow.id ? await PUT(`/api/setup/meta/flow/${flow.id}`, body) : await POST('/api/setup/meta/flow', body);
      const wasNew = !flow.id;
      const keepSel = selected;
      flow = structuredClone(res);
      dirty = false;
      setError('');
      toast(active === undefined ? `Flow “${flow.label}” saved (version ${flow.version}).` : `Flow “${flow.label}” ${flow.active ? 'activated' : 'deactivated'}.`, 'success');
      if (wasNew) { app.navigate(`/setup/flows/${flow.id}`); return res; }
      app.setTitle(`${flow.label} | Flow Builder`);
      selected = keepSel && keepSel !== 'props' && keepSel !== 'start' && !flow.elements.some((e) => e.id === keepSel) ? null : keepSel;
      busy = false;
      drawAll();
      return res;
    } catch (e) {
      setError(e.message);
      toast(e.message, 'error');
      return null;
    } finally {
      busy = false;
      drawToolbar();
    }
  }

  async function toggleActive() {
    if (!flow.active && !flow.elements.length) { toast('Add at least one element before activating the flow.', 'warning'); return; }
    await save({ active: !flow.active });
  }

  async function saveAsNew() {
    const label = await promptDialog('Flow Label', { title: 'Save As New Flow', value: `Copy of ${flow.label}`, confirmLabel: 'Save' });
    if (!label?.trim()) return;
    const body = { ...cleanFlow(flow), label: label.trim(), name: undefined, active: false, version: 0 };
    delete body.name;
    try {
      const res = await POST('/api/setup/meta/flow', body);
      dirty = false;
      toast(`Created “${res.label}”. It is inactive until you activate it.`, 'success');
      app.navigate(`/setup/flows/${res.id}`);
    } catch (e) { setError(e.message); toast(e.message, 'error'); }
  }

  async function remove() {
    if (!(await confirmDialog(h('div', 'Delete the flow ', h('strong', flow.label), '? This can’t be undone.'), { title: 'Delete Flow', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await DEL(`/api/setup/meta/flow/${flow.id}`);
      dirty = false;
      toast(`Flow “${flow.label}” deleted.`, 'success');
      app.navigate('/setup/flows');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function runNow() {
    if (dirty) {
      if (!(await confirmDialog('Save your changes and run the flow now?', { title: 'Run Now', confirmLabel: 'Save & Run' }))) return;
      if (!(await save())) return;
    } else if (!(await confirmDialog(h('div', 'Run ', h('strong', flow.label), ' now for every matching record? Actions such as tasks, emails and updates will really happen.'), { title: 'Run Now', confirmLabel: 'Run' }))) return;
    busy = true; drawToolbar();
    try {
      const r = await POST(`/api/setup/flows/${flow.id}/run`, {});
      showRunResult(flow, r);
    } catch (e) { toast(e.message, 'error'); } finally { busy = false; drawToolbar(); }
  }

  // ---------- canvas ----------
  function startNode() {
    const ft = FLOW_TYPES[flow.flowType];
    const o = getObj(flow.object);
    const rows = [['Object', o?.label || flow.object || '—']];
    if (flow.flowType === 'record') {
      rows.push(['Trigger', TRIGGERS[flow.trigger] || flow.trigger]);
      if (flow.trigger !== 'delete') rows.push(['Optimize for', flow.timing === 'before' ? 'Fast Field Updates' : 'Actions and Related Records']);
      rows.push(['Entry conditions', flow.condition ? h('code', { class: 'truncate', title: flow.condition }, flow.condition) : 'None — runs for every record']);
    } else if (flow.flowType === 'scheduled') {
      rows.push(['Schedule', scheduleText(flow.schedule)]);
      if (flow.schedule?.startDate) rows.push(['Start date', fmt.date(flow.schedule.startDate)]);
      rows.push(['Records', flow.filters?.length ? `${flow.filters.length} filter${flow.filters.length > 1 ? 's' : ''}${flow.filterLogic ? ` · ${flow.filterLogic}` : ''}` : 'All records']);
    } else rows.push(['Runs on', 'The record that invokes it']);
    return h('button', { type: 'button', class: ['fb-start', selected === 'start' && 'selected'], onClick: (e) => { e.stopPropagation(); select('start'); }, 'aria-label': 'Configure start' },
      h('div', { class: 'fb-start-head' }, h('span', { class: 'fb-start-icon', style: { background: ft.color } }, icon(ft.icon)),
        h('div', { class: 'grow' }, h('div', { class: 'fb-kicker' }, 'Start'), h('div', { class: 'strong' }, ft.label))),
      h('div', { class: 'fb-start-rows' }, rows.map(([k, v]) => h('div', { class: 'fb-start-row' }, h('span', { class: 'muted' }, k), h('span', { class: 'truncate' }, v)))),
      h('div', { class: 'fb-start-edit' }, icon('edit', { size: 13 }), 'Edit'));
  }

  function connector(index) {
    const add = editable ? h('button', {
      type: 'button', class: 'fb-add', 'aria-label': 'Add element', title: 'Add element',
      onClick: (e) => { e.stopPropagation(); insertMenu(e.currentTarget, index); },
    }, icon('plus', { size: 14 })) : null;
    return h('div', { class: 'fb-connector' }, h('span', { class: 'fb-line' }), add, h('span', { class: 'fb-line' }));
  }

  function insertMenu(anchor, index) {
    const allowed = allowedTypes(flow);
    const groups = ELEMENT_GROUPS;
    const items = [];
    for (const g of groups) {
      const types = Object.entries(ELEMENT_TYPES).filter(([t, d]) => d.group === g && allowed.includes(t));
      if (!types.length) continue;
      items.push({ header: g });
      for (const [t, d] of types) {
        items.push({ node: h('button', { class: 'menu-item fb-menu-item', role: 'menuitem', onClick: () => { document.querySelector('.menu')?.remove(); insert(t, index); } },
          h('span', { class: 'fb-mini-icon', style: { background: d.color } }, icon(d.icon, { size: 13 })),
          h('div', { class: 'grow', style: { whiteSpace: 'normal' } }, h('div', { class: 'strong' }, d.label), h('div', { class: 'tiny muted' }, d.desc))) });
      }
    }
    if (flow.flowType === 'record' && flow.timing === 'before') items.push('sep', { node: h('div', { class: 'tiny muted', style: { padding: '6px 10px', whiteSpace: 'normal' } }, 'Fast Field Update (before-save) flows can only update the triggering record. Switch the Start element to “Actions and Related Records” for more actions.') });
    const menu = showMenu(anchor, items, { width: 320 });
    // Show the palette as a flyout beside the "+" button rather than over the diagram.
    const r = anchor.getBoundingClientRect();
    const mh = menu.offsetHeight;
    const left = r.right + 12 + menu.offsetWidth < window.innerWidth - 8 ? r.right + 12 : Math.max(8, r.left - menu.offsetWidth - 12);
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(8, Math.min(r.top - 40, window.innerHeight - mh - 8))}px`;
  }

  function insert(t, index) {
    const el = defaultElement(t, flow);
    flow.elements.splice(index, 0, el);
    markDirty();
    select(el.id);
  }

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= flow.elements.length) return;
    [flow.elements[i], flow.elements[j]] = [flow.elements[j], flow.elements[i]];
    markDirty();
    drawCanvas();
  }

  async function removeElement(i) {
    const el = flow.elements[i];
    if (!(await confirmDialog(h('div', 'Delete the element ', h('strong', el.label || ELEMENT_TYPES[el.type]?.label), '?'), { title: 'Delete Element', confirmLabel: 'Delete', danger: true }))) return;
    flow.elements.splice(i, 1);
    if (selected === el.id) selected = null;
    markDirty();
    drawCanvas(); drawPanel();
  }

  function elementNode(el, i) {
    const d = ELEMENT_TYPES[el.type] || { label: el.type, icon: 'info', color: '#64748b' };
    const notAllowed = !allowedTypes(flow).includes(el.type);
    const act = (ic, label, fn, disabled) => h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': label, title: label, disabled, onClick: (e) => { e.stopPropagation(); fn(); } }, icon(ic, { size: 14 }));
    return h('div', {
      class: ['fb-node', selected === el.id && 'selected', notAllowed && 'invalid'], role: 'button', tabindex: '0', 'aria-label': `${d.label}: ${el.label || ''}`,
      onClick: (e) => { e.stopPropagation(); select(el.id); },
      onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(el.id); } },
    },
    h('span', { class: 'fb-node-icon', style: { background: d.color } }, icon(d.icon)),
    h('div', { class: 'fb-node-body' },
      h('div', { class: 'fb-kicker' }, d.label),
      h('div', { class: 'fb-node-label truncate' }, el.label || d.short),
      h('div', { class: 'fb-node-summary' }, summarize(el, flow, userNames)),
      h('div', { class: 'row gap-4 mt-4' },
        el.condition ? h('span', { class: 'badge warning', title: el.condition }, icon('filter', { size: 11 }), 'Conditional') : null,
        notAllowed ? h('span', { class: 'badge danger' }, icon('alert', { size: 11 }), 'Not allowed in this flow') : null)),
    editable ? h('div', { class: 'fb-node-actions' },
      act('arrowUp', 'Move up', () => move(i, -1), i === 0),
      act('arrowDown', 'Move down', () => move(i, 1), i === flow.elements.length - 1),
      act('trash', 'Delete element', () => removeElement(i))) : null);
  }

  function drawCanvas() {
    clear(diagram);
    diagram.appendChild(startNode());
    flow.elements.forEach((el, i) => { diagram.appendChild(connector(i)); diagram.appendChild(elementNode(el, i)); });
    diagram.appendChild(connector(flow.elements.length));
    diagram.appendChild(h('div', { class: 'fb-end' }, h('span', { class: 'fb-end-dot' }, icon('x', { size: 12 })), 'End'));
    if (!flow.elements.length && editable) {
      diagram.appendChild(h('div', { class: 'fb-hint' }, icon('info', { size: 14 }), 'Click ', h('span', { class: 'fb-add-hint' }, icon('plus', { size: 12 })), ' to add your first element.'));
    }
  }

  // ---------- panel ----------
  const row = (label, control, { help, required } = {}) => h('div', { class: 'form-row' },
    h('label', { class: 'form-label' }, required ? h('span', { class: 'req' }, '*') : null, label), control, help ? h('div', { class: 'form-help' }, help) : null);

  function textInput(value, onInput, attrs = {}) {
    const inp = h('input', { class: 'input', ...attrs });
    inp.value = value ?? '';
    inp.addEventListener('input', () => onInput(inp.value));
    return inp;
  }

  function selectInput(options, value, onChange, attrs = {}) {
    const sel = h('select', { class: 'input', ...attrs, onChange: () => onChange(sel.value) },
      options.map((o) => (o.group ? h('optgroup', { label: o.group }, o.options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)))
        : h('option', { value: o[0], selected: o[0] === value }, o[1]))));
    return sel;
  }

  function switchRow(label, checked, onChange, { disabled, help } = {}) {
    const cb = h('input', { type: 'checkbox', checked, disabled, onChange: () => onChange(cb.checked) });
    return h('div', { class: 'form-row' }, h('label', { class: 'row fb-switch-row' }, h('span', { class: 'switch' }, cb, h('span')), h('span', { class: 'grow' }, label)),
      help ? h('div', { class: 'form-help' }, help) : null);
  }

  function optionCards(options, value, onPick) {
    return h('div', { class: 'fb-options', role: 'radiogroup' }, options.map((o) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(o.value === value), class: ['fb-option', o.value === value && 'active', o.disabled && 'disabled'], disabled: o.disabled,
      onClick: () => { if (o.value !== value) onPick(o.value); },
    }, h('span', { class: 'fb-radio' }), h('div', { class: 'grow' }, h('div', { class: 'strong' }, o.title), o.desc ? h('div', { class: 'small muted' }, o.desc) : null))));
  }

  function section(title, ...children) {
    return h('div', { class: 'fb-section' }, h('div', { class: 'fb-section-title' }, title), ...children);
  }

  function drawPanel() {
    clear(panel);
    if (!selected) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    let title, ic, color, body;
    if (selected === 'props') { title = 'Flow Properties'; ic = 'sliders'; color = '#475569'; body = propsPanel(); }
    else if (selected === 'start') { title = 'Start'; ic = FLOW_TYPES[flow.flowType].icon; color = FLOW_TYPES[flow.flowType].color; body = startPanel(); }
    else {
      const el = flow.elements.find((e) => e.id === selected);
      if (!el) { selected = null; panel.classList.add('hidden'); return; }
      const d = ELEMENT_TYPES[el.type];
      title = d.label; ic = d.icon; color = d.color; body = elementPanel(el);
    }
    panel.append(
      h('div', { class: 'fb-panel-head' }, h('span', { class: 'fb-node-icon sm', style: { background: color } }, icon(ic, { size: 15 })), h('h2', { class: 'grow' }, title),
        h('button', { class: 'btn btn-ghost btn-icon', 'aria-label': 'Close panel', onClick: () => select(null) }, icon('x'))),
      h('div', { class: 'fb-panel-body' }, body),
      h('div', { class: 'fb-panel-foot' },
        typeof selected === 'string' && !['props', 'start'].includes(selected) && editable
          ? h('button', { class: 'btn btn-ghost fb-danger-link', onClick: () => removeElement(flow.elements.findIndex((e) => e.id === selected)) }, icon('trash'), 'Delete Element') : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onClick: () => select(null) }, 'Done')));
  }

  function propsPanel() {
    let apiTouched = !!flow.id;
    const api = textInput(flow.name, (v) => { apiTouched = true; flow.name = v; touch(); }, { placeholder: 'Generated from the label' });
    const label = textInput(flow.label, (v) => {
      flow.label = v;
      if (!apiTouched) { flow.name = v.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); api.value = flow.name; }
      markDirty(); drawToolbar();
    }, { placeholder: 'e.g. Opportunity: Notify on Close' });
    const desc = h('textarea', { class: 'input', rows: 3 });
    desc.value = flow.description || '';
    desc.addEventListener('input', () => { flow.description = desc.value; markDirty(); });
    const order = textInput(flow.order ?? 0, (v) => { flow.order = Number(v) || 0; markDirty(); }, { type: 'number', min: 0, step: 1 });
    const ft = FLOW_TYPES[flow.flowType];
    return h('div',
      row('Flow Label', label, { required: true }),
      row('Flow API Name', api, { help: 'Unique name used by quick actions and the API.' }),
      row('Description', desc),
      row('Type', h('div', { class: 'fb-readonly' }, h('span', { class: 'fb-mini-icon', style: { background: ft.color } }, icon(ft.icon, { size: 12 })), ft.label)),
      flow.flowType === 'record' ? row('Trigger Order', order, { help: 'When several flows run on the same object and trigger, lower numbers run first.' }) : null,
      flow.id ? h('div', { class: 'fb-facts' },
        h('div', h('span', { class: 'muted' }, 'Version'), h('span', String(flow.version || 1))),
        h('div', h('span', { class: 'muted' }, 'Created'), h('span', fmt.datetime(flow.createdAt))),
        h('div', h('span', { class: 'muted' }, 'Last Modified'), h('span', fmt.datetime(flow.updatedAt))),
        h('div', h('span', { class: 'muted' }, 'Flow ID'), h('span', { class: 'mono' }, flow.id))) : null);
  }

  async function changeObject(v) {
    if (v === flow.object) return;
    const uses = flow.elements.some((e) => e.assignments?.length || e.lookupField || e.templateId) || flow.condition || flow.filters?.length;
    if (uses && !(await confirmDialog('Changing the object clears the entry conditions, filters and field assignments that refer to the current object\'s fields. Continue?', { title: 'Change Object', confirmLabel: 'Change Object' }))) { drawPanel(); return; }
    flow.object = v;
    flow.condition = '';
    flow.filters = [];
    flow.filterLogic = '';
    for (const e of flow.elements) {
      if (e.type === 'update') e.assignments = [];
      if (e.type === 'updateRelated') { e.lookupField = relatedLookups(v)[0]?.apiName || ''; e.assignments = []; }
      if (e.type === 'create') e.assignments = (e.assignments || []).filter((a) => !a.isFormula);
      if (e.type === 'aiPrompt') { e.templateId = ''; e.outputField = ''; }
      delete e.condition;
    }
    markDirty();
    drawAll();
  }

  async function changeShape(patch) {
    const next = { ...flow, ...patch };
    if (next.trigger === 'delete') next.timing = 'after';
    const allowed = allowedTypes(next);
    const bad = flow.elements.filter((e) => !allowed.includes(e.type));
    if (bad.length) {
      const why = next.timing === 'before' && next.trigger !== 'delete' ? 'Fast Field Update flows can only update the triggering record.' : 'Flows that run when a record is deleted can’t update or post to that record.';
      if (!(await confirmDialog(h('div', h('p', why), h('p', `Remove ${bad.length} element${bad.length > 1 ? 's' : ''}: `, h('strong', bad.map((b) => b.label || ELEMENT_TYPES[b.type].label).join(', ')), '?')), { title: 'Remove Elements', confirmLabel: 'Remove', danger: true }))) { drawPanel(); return; }
      next.elements = flow.elements.filter((e) => allowed.includes(e.type));
    }
    if (next.trigger === 'create' || next.trigger === 'delete') next.onlyWhenChanged = false;
    Object.assign(flow, next);
    markDirty();
    drawAll();
  }

  function objectSelect() {
    return selectInput(objectOptions().map((o) => [o.apiName, `${o.label} (${o.apiName})`]), flow.object, changeObject, { 'aria-label': 'Object' });
  }

  function startPanel() {
    const ft = FLOW_TYPES[flow.flowType];
    const intro = h('div', { class: 'fb-intro' }, ft.desc);
    if (flow.flowType === 'record') {
      const fe = formulaEditor({ objApi: flow.object, value: flow.condition, rows: 3, onChange: (v) => { flow.condition = v; touch(); updateOnlyChanged(); }, placeholder: "e.g. AND(ISCHANGED(StageName), ISPICKVAL(StageName, 'Closed Won'))" });
      const onlyWrap = h('div');
      const updateOnlyChanged = () => {
        const canUse = ['update', 'createOrUpdate'].includes(flow.trigger) && !!String(flow.condition || '').trim();
        clear(onlyWrap).appendChild(switchRow('Only when a record is updated to meet the condition requirements', !!flow.onlyWhenChanged && canUse, (v) => { flow.onlyWhenChanged = v; touch(); }, {
          disabled: !canUse,
          help: canUse ? 'When on, the flow runs on update only if the record didn’t meet the conditions before the change — so it runs once, not on every edit.' : 'Available when the trigger includes updates and an entry condition is set.',
        }));
      };
      updateOnlyChanged();
      return h('div', intro,
        section('Object', row('Object', objectSelect(), { required: true })),
        section('Configure Trigger', h('div', { class: 'form-label' }, 'Trigger the Flow When:'),
          optionCards(Object.entries(TRIGGERS).map(([value, title]) => ({ value, title })), flow.trigger, (v) => changeShape({ trigger: v }))),
        flow.trigger !== 'delete' ? section('Optimize the Flow for',
          optionCards([
            { value: 'before', title: 'Fast Field Updates', desc: 'Update fields on the record that triggers the flow. Runs before the record is saved — up to 10x faster than an extra save. Only “Update Triggering Record” elements are allowed.' },
            { value: 'after', title: 'Actions and Related Records', desc: 'Update any record and perform actions, like creating tasks, sending emails or posting to the feed. Runs after the record is saved.' },
          ], flow.timing, (v) => changeShape({ timing: v }))) : h('div', { class: 'alert mb-16' }, icon('info'), h('div', 'Flows triggered on delete run after the record is moved to the Recycle Bin. They can notify people, send emails, create tasks or records, and update related (parent) records.')),
        section('Set Entry Conditions',
          h('div', { class: 'form-help mb-8' }, 'The flow runs only when this formula is true. Leave blank to run for every record. Use ISNEW(), ISCHANGED(Field) and PRIORVALUE(Field) to react to changes.'),
          fe.el, onlyWrap));
    }
    if (flow.flowType === 'scheduled') {
      const s = flow.schedule ||= { frequency: 'daily', time: '08:00', dayOfWeek: 1, startDate: '' };
      const dayWrap = h('div');
      const drawDay = () => {
        clear(dayWrap);
        if (s.frequency === 'weekly') dayWrap.appendChild(row('Day of Week', selectInput(DAYS.map((d, i) => [String(i), d]), String(s.dayOfWeek ?? 1), (v) => { s.dayOfWeek = Number(v); touch(); })));
      };
      drawDay();
      const fe = filterEditor({ objApi: flow.object, filters: flow.filters || [], logic: flow.filterLogic, title: 'Filter Records', onChange: ({ filters, filterLogic }) => { flow.filters = filters; flow.filterLogic = filterLogic; touch(); } });
      const ce = formulaEditor({ objApi: flow.object, value: flow.condition, rows: 2, onChange: (v) => { flow.condition = v; touch(); }, placeholder: 'Optional, e.g. Amount > 50000' });
      return h('div', intro,
        section('Set a Schedule',
          h('div', { class: 'grid-2 fb-grid' },
            row('Start Date', textInput(s.startDate || '', (v) => { s.startDate = v; touch(); }, { type: 'date' })),
            row('Start Time (UTC)', textInput(s.time || '08:00', (v) => { s.time = v; touch(); }, { type: 'time' }))),
          row('Frequency', selectInput([['once', 'Once'], ['hourly', 'Hourly'], ['daily', 'Daily'], ['weekly', 'Weekly']], s.frequency || 'daily', (v) => { s.frequency = v; touch(); drawDay(); })),
          dayWrap,
          h('div', { class: 'form-help' }, 'The scheduler checks every minute. Times are in UTC.')),
        section('Object', row('Object', objectSelect(), { required: true })),
        section('Filter Records', h('div', { class: 'form-help mb-8' }, 'The flow runs once for every record that matches these filters.'), fe.el),
        section('Additional Condition (optional)', ce.el));
    }
    return h('div', intro,
      section('Object', row('Object', objectSelect(), { required: true, help: 'The object of the record the flow runs on.' })),
      h('div', { class: 'alert' }, icon('info'), h('div', 'Autolaunched flows run against one record when invoked — for example by a quick action of type “Flow” (Object Manager › Buttons & Actions). They must be active to run.')));
  }

  function conditionBlock(el) {
    const wrap = h('div');
    const draw = () => {
      clear(wrap);
      const on = el._conditional ?? !!el.condition;
      wrap.appendChild(switchRow('Run this element only when a condition is met', on, (v) => { el._conditional = v; if (!v) el.condition = ''; touch(); draw(); }));
      if (on) {
        const fe = formulaEditor({ objApi: flow.object, value: el.condition || '', rows: 3, onChange: (v) => { el.condition = v; touch(); }, placeholder: "e.g. ISPICKVAL(Priority, 'High')" });
        wrap.appendChild(h('div', { class: 'form-help mb-8' }, `Evaluated against the ${getObj(flow.object)?.label || 'triggering'} record when the flow reaches this element.`));
        wrap.appendChild(fe.el);
      }
    };
    draw();
    return section('Run Condition', wrap);
  }

  function recipientControl(value, onChange, label) {
    const wrap = h('div');
    const isUser = value && !RECIPIENTS[value];
    const draw = (mode, val) => {
      clear(wrap);
      const sel = selectInput([...Object.entries(RECIPIENTS), ['user', 'A specific user']], mode, (v) => {
        if (v === 'user') draw('user', null);
        else { onChange(v); draw(v, v); }
      }, { 'aria-label': label });
      wrap.appendChild(row(label, sel, { required: true }));
      if (mode === 'user') {
        const li = lookupInput({ objects: ['User'], value: val, label: userNames[val], placeholder: 'Search users...', onChange: (id) => onChange(id || 'owner') });
        wrap.appendChild(row('User', li.el, { required: true }));
      }
    };
    draw(isUser ? 'user' : value || 'owner', value);
    return wrap;
  }

  function elementPanel(el) {
    const d = ELEMENT_TYPES[el.type];
    const parts = [h('div', { class: 'fb-intro' }, d.desc), row('Label', textInput(el.label, (v) => { el.label = v; touch(); }, { placeholder: d.short }), { required: true })];
    const objLabel = getObj(flow.object)?.label || flow.object;
    switch (el.type) {
      case 'update': {
        parts.push(section('Set Field Values for the ' + objLabel,
          h('div', { class: 'form-help mb-8' }, 'Formulas are evaluated against the triggering record, e.g. ', h('code', 'TODAY() + 30'), ' or ', h('code', 'Account.Industry'), '.'),
          assignmentsEditor({ targetObj: flow.object, sourceObj: flow.object, assignments: el.assignments || [], onChange: (l) => { el.assignments = l; touch(); } }).el));
        break;
      }
      case 'updateRelated': {
        const lookups = relatedLookups(flow.object);
        if (!lookups.length) { parts.push(h('div', { class: 'alert warning' }, icon('alert'), h('div', `${objLabel} has no lookup fields to other records.`))); break; }
        if (!lookups.some((f) => f.apiName === el.lookupField)) el.lookupField = lookups[0].apiName;
        const target = lookupTarget(flow.object, el.lookupField);
        parts.push(section('Related Record',
          row('Lookup Field', selectInput(lookups.map((f) => [f.apiName, `${f.label} → ${getObj(f.referenceTo)?.label || f.referenceTo}`]), el.lookupField, (v) => { el.lookupField = v; el.assignments = []; touch(); drawPanel(); }), { required: true, help: 'The record this lookup points to is updated. Nothing happens when the lookup is blank.' })));
        parts.push(section(`Set Field Values for the ${getObj(target)?.label || target}`,
          h('div', { class: 'form-help mb-8' }, `Formulas are evaluated against the ${objLabel} record.`),
          assignmentsEditor({ targetObj: target, sourceObj: flow.object, assignments: el.assignments || [], onChange: (l) => { el.assignments = l; touch(); } }).el));
        break;
      }
      case 'create': {
        const target = getObj(el.object);
        const required = target ? [target.nameField?.type !== 'AutoNumber' ? target.nameField?.label || 'Name' : null].filter(Boolean).concat(target.fields.filter((f) => f.required && !f.system && !['Formula', 'Rollup', 'AutoNumber', 'Checkbox'].includes(f.type) && !(f.values || []).some((v) => v.isDefault)).map((f) => f.label)) : [];
        parts.push(section('Record',
          row('Object', selectInput(objectOptions().map((o) => [o.apiName, o.label]), el.object, (v) => { el.object = v; el.assignments = (el.assignments || []).filter((a) => a.field === 'Name'); touch(); drawPanel(); }), { required: true }),
          required.length ? h('div', { class: 'form-help' }, 'Required fields: ', h('strong', required.join(', '))) : null));
        parts.push(section(`Set Field Values for the New ${target?.label || 'Record'}`,
          h('div', { class: 'form-help mb-8' }, `Use formulas to copy values from the ${objLabel}, e.g. `, h('code', 'Id'), ' or ', h('code', 'Name & \' follow-up\''), '.'),
          assignmentsEditor({ targetObj: el.object, sourceObj: flow.object, assignments: el.assignments || [], onChange: (l) => { el.assignments = l; touch(); } }).el));
        break;
      }
      case 'task': {
        const due = textInput(el.dueInDays ?? 0, (v) => { el.dueInDays = Number(v) || 0; touch(); }, { type: 'number', min: 0, step: 1 });
        parts.push(section('Task',
          templateField({ label: 'Subject', value: el.subject, objApi: flow.object, required: true, onChange: (v) => { el.subject = v; touch(); } }),
          h('div', { class: 'grid-2 fb-grid' },
            row('Due Date (days from run)', due),
            row('Priority', selectInput([['High', 'High'], ['Normal', 'Normal'], ['Low', 'Low']], el.priority || 'Normal', (v) => { el.priority = v; touch(); }))),
          recipientControl(el.assignTo || 'owner', (v) => { el.assignTo = v; touch(); }, 'Assigned To'),
          templateField({ label: 'Comments', value: el.description, objApi: flow.object, multiline: true, onChange: (v) => { el.description = v; touch(); } })));
        break;
      }
      case 'notify': {
        parts.push(section('Notification',
          recipientControl(el.recipient || 'owner', (v) => { el.recipient = v; touch(); }, 'Recipient'),
          templateField({ label: 'Title', value: el.title, objApi: flow.object, required: true, onChange: (v) => { el.title = v; touch(); } }),
          templateField({ label: 'Body', value: el.body, objApi: flow.object, multiline: true, onChange: (v) => { el.body = v; touch(); }, help: 'The notification links to the record.' })));
        break;
      }
      case 'email': {
        const emailFields = (getObj(flow.object)?.fields || []).filter((f) => f.type === 'Email');
        const toWrap = h('div');
        const known = (v) => ['owner', 'creator', 'ownerManager'].includes(v) || String(v).startsWith('field:');
        let custom = !!el.to && !known(el.to);
        const drawTo = () => {
          clear(toWrap);
          const to = el.to || (custom ? '' : 'owner');
          const mode = custom ? 'custom' : to;
          const opts = [{ group: 'Users', options: [['owner', 'Record Owner'], ['creator', 'Record Creator'], ['ownerManager', 'Owner’s Manager']] }];
          if (emailFields.length) opts.push({ group: `Email Fields on ${objLabel}`, options: emailFields.map((f) => [`field:${f.apiName}`, f.label]) });
          opts.push({ group: 'Other', options: [['custom', 'Enter an email address']] });
          toWrap.appendChild(row('To', selectInput(opts, mode, (v) => { custom = v === 'custom'; el.to = custom ? '' : v; touch(); drawTo(); }), { required: true }));
          if (custom) toWrap.appendChild(row('Email Address', textInput(to, (v) => { el.to = v.trim(); touch(); }, { type: 'email', placeholder: 'name@example.com' }), { required: true }));
        };
        drawTo();
        parts.push(section('Email', toWrap,
          templateField({ label: 'Subject', value: el.subject, objApi: flow.object, required: true, onChange: (v) => { el.subject = v; touch(); } }),
          templateField({ label: 'Body', value: el.body, objApi: flow.object, multiline: true, rows: 5, onChange: (v) => { el.body = v; touch(); }, help: 'Emails are recorded in Setup › Email Log.' })));
        break;
      }
      case 'post': {
        parts.push(section('Feed Post',
          templateField({ label: 'Message', value: el.body, objApi: flow.object, multiline: true, rows: 4, required: true, onChange: (v) => { el.body = v; touch(); }, help: 'Posted to the record’s feed. Use {!TEXT(Amount)} style formulas for numbers.' })));
        break;
      }
      case 'submitApproval': {
        parts.push(section('Approval',
          h('div', { class: 'alert mb-16' }, icon('info'), h('div', `The record is submitted to the first active approval process for ${objLabel} whose entry criteria it meets. The record owner is the submitter. Records already pending approval are skipped.`)),
          templateField({ label: 'Submission Comments', value: el.comments, objApi: flow.object, multiline: true, onChange: (v) => { el.comments = v; touch(); } })));
        break;
      }
      case 'aiPrompt': {
        parts.push(aiPromptSection(el, objLabel));
        break;
      }
      default: break;
    }
    parts.push(conditionBlock(el));
    return h('div', parts);
  }

  // "AI Prompt" element: prompt template + text field that receives the response.
  function aiPromptSection(el, objLabel) {
    const wrap = h('div', h('div', { class: 'fb-ai-loading small muted' }, 'Loading prompt templates…'));
    const textFields = (getObj(flow.object)?.fields || []).filter((f) => ['Text', 'TextArea', 'LongTextArea'].includes(f.type) && !f.readOnly && !f.isNameField && f.apiName !== 'Name');
    const newLink = `#/setup/prompts/new?object=${encodeURIComponent(flow.object)}`;
    const draw = (list) => {
      clear(wrap);
      wrap.appendChild(h('div', { class: 'fb-ai-note' }, icon('sparkles', { size: 14 }),
        h('div', 'Generative AI runs in the background a few seconds after the record is saved, so users never wait for it. Results and errors appear in ', h('a', { href: '#/setup/ailog?tab=jobs', target: '_blank' }, 'AI Audit Trail › Background Jobs'), '.')));
      if (!list.length) {
        wrap.appendChild(h('div', { class: 'alert warning' }, icon('alert'), h('div', `There are no active prompt templates for ${objLabel}. `, h('a', { href: newLink, target: '_blank' }, 'Create one in Prompt Builder'), ', then ', h('button', { type: 'button', class: 'link-btn', onClick: async () => { await loadPrompts({ force: true }); drawPanel(); } }, 'refresh'), '.')));
        return;
      }
      const missing = el.templateId && !list.some((t) => t.id === el.templateId);
      const tplSel = selectInput([['', '— Choose a prompt template —'], ...list.map((t) => [t.id, t.label]), ...(missing ? [[el.templateId, 'Inactive or deleted template']] : [])], el.templateId || '', (v) => {
        el.templateId = v;
        const t = list.find((x) => x.id === v);
        el.outputField = t?.outputField && textFields.some((f) => f.apiName === t.outputField) ? t.outputField : (el.outputField || '');
        touch(); drawPanel();
      }, { 'aria-label': 'Prompt template' });
      const t = list.find((x) => x.id === el.templateId);
      wrap.appendChild(row('Prompt Template', tplSel, { required: true, help: h('span', t?.description ? `${t.description} ` : '', h('a', { href: el.templateId ? `#/setup/prompts/${el.templateId}` : newLink, target: '_blank' }, el.templateId ? 'Open in Prompt Builder' : 'New prompt template'), icon('external', { size: 11 })) }));
      if (!textFields.length) {
        wrap.appendChild(h('div', { class: 'alert warning' }, icon('alert'), h('div', `${objLabel} has no editable text fields to store the response. Add a Text Area (Long) field in Object Manager.`)));
        return;
      }
      const outSel = selectInput([['', t?.outputField ? `Template default (${getObj(flow.object)?.fieldMap.get(t.outputField)?.label || t.outputField})` : '— Choose a text field —'],
        ...textFields.map((f) => [f.apiName, `${f.label} (${f.type === 'LongTextArea' ? 'Long Text Area' : f.type === 'TextArea' ? 'Text Area' : 'Text'})`])], el.outputField || '', (v) => { el.outputField = v; touch(); }, { 'aria-label': 'Output field' });
      wrap.appendChild(row('Store Response In', outSel, { required: true, help: 'The AI response is written to this field on the triggering record. Long responses are truncated to the field length.' }));
    };
    loadPrompts().then(draw);
    return section('AI Prompt', wrap);
  }

  function drawAll() { drawToolbar(); drawCanvas(); drawPanel(); }
  drawAll();

  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('keydown', onKey);
    layout?.classList.remove('fb-mode');
  };
}

export function showRunResult(flow, r) {
  const errors = r.errors || [];
  const m = modal({
    title: `Run Results: ${flow.label}`,
    body: h('div',
      h('div', { class: 'fb-run-stats' },
        h('div', h('div', { class: 'fb-run-num' }, String(r.processed ?? 0)), h('div', { class: 'muted small' }, 'Records processed')),
        h('div', h('div', { class: ['fb-run-num', errors.length && 'danger'] }, String(errors.length)), h('div', { class: 'muted small' }, 'Errors'))),
      errors.length ? h('div', { class: 'table-wrap mt-16' }, h('table', { class: 'table compact' },
        h('thead', h('tr', h('th', 'Record'), h('th', 'Error'))),
        h('tbody', errors.map((e) => h('tr', h('td', h('a', { href: `#/r/${e.id}` }, e.id)), h('td', { class: 'pre-wrap', style: { whiteSpace: 'normal' } }, e.message))))))
        : h('div', { class: 'alert success mt-16' }, icon('check'), h('div', r.processed ? 'The flow ran successfully for every matching record.' : 'No records matched the flow’s filters.'))),
    footer: [h('button', { class: 'btn btn-brand', onClick: () => m.close() }, 'Close')],
  });
}

export { describeFilter };
