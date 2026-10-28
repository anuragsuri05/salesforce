// Setup › AI › Prompt Builder: reusable prompt templates grounded in record data via merge fields,
// with a live preview against a real record.
import { h, icon, mount, clear, fmt, toast, spinner, emptyState, confirmDialog, showMenu, closeMenu, badge } from '../lib.js';
import { GET, POST, PUT, DEL, getObj, state, can, pathOptions } from '../api.js';
import { lookupInput } from '../fields.js';
import { aiHeader, aiMark, toggleRow, sectionCard, markdown, setBusy } from './ai-common.js';
import { formRow, searchBox, select, dataTable, apiNameFrom } from './admin-common.js';

export const TEMPLATE_TYPES = {
  summary: { label: 'Record Summary', icon: 'list', desc: 'Summarize a record for users. Run from the record page’s AI actions.' },
  email: { label: 'Sales Email', icon: 'mail', desc: 'Draft a personalised email to a contact or lead using record data.' },
  field: { label: 'Field Generation', icon: 'edit', desc: 'Generate a value and store it in a text field — from the record page or a Flow “AI Prompt” step.' },
  flex: { label: 'Flex', icon: 'sparkles', desc: 'A free-form prompt for any purpose, grounded in the record’s data.' },
};
const TEXT_TYPES = ['Text', 'TextArea', 'LongTextArea'];
const TEXT_WRAP = new Set(['Picklist', 'MultiPicklist', 'Number', 'Currency', 'Percent', 'Date', 'DateTime', 'Checkbox', 'Formula', 'Rollup']);

export function outputFields(objApi) {
  return (getObj(objApi)?.fields || []).filter((f) => TEXT_TYPES.includes(f.type) && !f.readOnly && !f.isNameField && f.apiName !== 'Name');
}

export default async function render(container, { segments, query, app }) {
  if (segments[0]) return editor(container, { id: segments[0] === 'new' ? null : segments[0], query, app });
  return list(container, { app });
}

function typeBadge(t) {
  const d = TEMPLATE_TYPES[t] || TEMPLATE_TYPES.flex;
  return h('span', { class: `aia-type t-${t || 'flex'}` }, icon(d.icon, { size: 11 }), d.label);
}

// ---------- list ----------
async function list(container, { app }) {
  app.setTitle('Prompt Builder');
  const editable = can('CustomizeApplication');
  const header = () => aiHeader('Prompt Builder', {
    description: 'Create reusable prompt templates grounded in your CRM data. Use them on record pages, in Flows and in the agent.',
    actions: editable ? [h('a', { class: 'btn btn-brand', href: '#/setup/prompts/new' }, icon('plus'), 'New Prompt Template')] : [],
  });
  mount(container, header(), spinner());
  let rows;
  try { rows = await GET('/api/setup/meta/promptTemplate'); } catch (e) { mount(container, header(), h('div', { class: 'card p-24' }, emptyState('Could not load prompt templates', e.message, { iconName: 'alert' }))); return; }

  let term = '', type = '';
  const filtered = () => rows.filter((r) => (!type || r.templateType === type) && (!term || [r.label, r.name, r.object, r.description].some((v) => String(v || '').toLowerCase().includes(term))));
  const remove = async (t) => {
    if (!(await confirmDialog(h('div', 'Delete the prompt template ', h('strong', t.label), '? Flows that use it will stop generating responses.'), { title: 'Delete Prompt Template', confirmLabel: 'Delete', danger: true }))) return;
    try { await DEL(`/api/setup/meta/promptTemplate/${t.id}`); rows = rows.filter((r) => r.id !== t.id); toast(`“${t.label}” deleted.`, 'success'); apply(); } catch (e) { toast(e.message, 'error'); }
  };
  const table = dataTable({ rows: [], initialSort: { key: 'label', dir: 'asc' }, empty: 'No prompt templates match your filters.', columns: [
    { key: 'label', label: 'Template Name', render: (r) => h('div', h('a', { href: `#/setup/prompts/${r.id}`, class: 'strong' }, r.label), r.description ? h('div', { class: 'tiny muted truncate', style: { maxWidth: '340px' } }, r.description) : null) },
    { key: 'object', label: 'Object', render: (r) => { const o = getObj(r.object); return o ? h('span', { class: 'row gap-4' }, h('span', { class: 'obj-icon sm', style: { background: o.color } }, o.icon || o.label[0]), o.label) : r.object; } },
    { key: 'templateType', label: 'Type', render: (r) => typeBadge(r.templateType), sort: (r) => TEMPLATE_TYPES[r.templateType]?.label },
    { key: 'outputField', label: 'Output Field', render: (r) => (r.outputField ? getObj(r.object)?.fieldMap.get(r.outputField)?.label || r.outputField : h('span', { class: 'muted' }, '—')) },
    { key: 'active', label: 'Active', render: (r) => (r.active !== false ? h('span', { class: 'sa-check', title: 'Active' }, icon('check')) : h('span', { class: 'muted' }, '—')), sort: (r) => (r.active !== false ? 1 : 0) },
    { key: 'updatedAt', label: 'Last Modified', render: (r) => h('span', { class: 'small nowrap', title: fmt.datetime(r.updatedAt) }, fmt.date(r.updatedAt)) },
    { key: '_a', label: '', sortable: false, width: '44px', render: (r) => h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': `Actions for ${r.label}`, onClick: (e) => showMenu(e.currentTarget, [
      { label: editable ? 'Edit' : 'View', icon: 'edit', href: `#/setup/prompts/${r.id}` },
      editable ? { label: 'Clone', icon: 'copy', href: `#/setup/prompts/new?clone=${r.id}` } : null,
      editable ? 'sep' : null,
      editable ? { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove(r) } : null,
    ], { align: 'right' }) }, icon('more')) },
  ] });
  const count = h('span', { class: 'muted small' });
  const apply = () => { const f = filtered(); count.textContent = `${f.length} template${f.length === 1 ? '' : 's'}`; table.setRows(f); };
  const typeSel = select([['', 'All types'], ...Object.entries(TEMPLATE_TYPES).map(([k, d]) => [k, d.label])], '', { cls: 'input input-sm', ariaLabel: 'Filter by type', onChange: (v) => { type = v; apply(); } });
  typeSel.style.width = '180px';
  apply();
  mount(container, header(),
    h('div', { class: 'aia-type-strip' }, Object.entries(TEMPLATE_TYPES).map(([k, d]) => h('div', { class: 'aia-type-tile' }, h('span', { class: `aia-type-ico t-${k}` }, icon(d.icon)), h('div', h('div', { class: 'strong' }, d.label, h('span', { class: 'muted small' }, ` · ${rows.filter((r) => r.templateType === k).length}`)), h('div', { class: 'tiny muted' }, d.desc))))),
    rows.length ? h('div', { class: 'card' }, h('div', { class: 'sa-toolbar' }, typeSel, count, h('div', { class: 'spacer' }), searchBox('Search templates...', (t) => { term = t; apply(); })), table.el)
      : h('div', { class: 'card p-24' }, emptyState('No prompt templates yet', 'Templates combine instructions with merge fields like {!Name} so the AI is grounded in real record data.', { iconName: 'sparkles', action: editable ? h('a', { class: 'btn btn-brand', href: '#/setup/prompts/new' }, icon('plus'), 'New Prompt Template') : null })));
}

// ---------- editor ----------
async function editor(container, { id, query, app }) {
  const editable = can('CustomizeApplication');
  mount(container, aiHeader('Prompt Template', { crumb: 'Setup › AI › Prompt Builder' }), spinner());
  let tpl;
  try {
    if (id) tpl = await GET(`/api/setup/meta/promptTemplate/${encodeURIComponent(id)}`);
    else if (query.clone) {
      const src = await GET(`/api/setup/meta/promptTemplate/${encodeURIComponent(query.clone)}`);
      tpl = { ...src, id: undefined, label: `${src.label} (Copy)`, name: `${src.name}_Copy` };
    } else {
      const obj = getObj(query.object) ? getObj(query.object).apiName : 'Account';
      tpl = { label: '', name: '', description: '', object: obj, templateType: 'flex', outputField: null, active: true,
        instructions: `You are helping {!$User.FirstName}. Using the ${getObj(obj)?.label || 'record'} data below, …\n\n{!RecordDetails}` };
    }
  } catch (e) {
    mount(container, aiHeader('Prompt Template', { crumb: 'Setup › AI › Prompt Builder' }), h('div', { class: 'card p-24' }, emptyState('Prompt template not found', e.message, { iconName: 'alert', action: h('a', { class: 'btn', href: '#/setup/prompts' }, 'Back to Prompt Builder') })));
    return;
  }
  app.setTitle(id ? tpl.label : 'New Prompt Template');
  let apiTouched = !!id || !!query.clone;
  let dirty = !id;
  let previewRecord = null;
  let preview = null; // { resolvedPrompt, response, error }
  let previewTab = 'response';

  const saveBtn = h('button', { class: 'btn btn-brand', disabled: !editable, onClick: () => save() }, 'Save');
  const headerActions = [
    h('a', { class: 'btn', href: '#/setup/prompts' }, id ? 'Back' : 'Cancel'),
    id && editable ? h('button', { class: 'btn', onClick: () => app.navigate(`/setup/prompts/new?clone=${id}`) }, icon('copy'), 'Clone') : null,
    id && editable ? h('button', { class: 'btn', onClick: () => remove() }, icon('trash'), 'Delete') : null,
    editable ? saveBtn : null,
  ];
  const leftCol = h('div', { class: 'aia-pb-main' });
  const rightCol = h('aside', { class: 'aia-pb-side' });
  mount(container,
    aiHeader(id ? tpl.label : 'New Prompt Template', { crumb: 'Setup › AI › Prompt Builder', description: id ? `${getObj(tpl.object)?.label || tpl.object} · ${TEMPLATE_TYPES[tpl.templateType]?.label || 'Flex'}` : 'Write instructions, add merge fields, then preview the result on a real record.', actions: headerActions }),
    h('div', { class: 'aia-pb-layout' }, leftCol, rightCol));

  const touch = () => { dirty = true; };
  const onBeforeUnload = (e) => { if (dirty && editable) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onBeforeUnload);

  const objects = [...state.objects.values()].filter((o) => !['User'].includes(o.apiName)).sort((a, b) => a.label.localeCompare(b.label));

  function settingsCard() {
    const label = h('input', { class: 'input', value: tpl.label, disabled: !editable, placeholder: 'e.g. Account Briefing' });
    const api = h('input', { class: 'input mono', value: tpl.name || '', disabled: !editable, placeholder: 'Generated from the name' });
    label.addEventListener('input', () => { tpl.label = label.value; if (!apiTouched) { tpl.name = apiNameFrom(label.value); api.value = tpl.name; } touch(); });
    api.addEventListener('input', () => { apiTouched = true; tpl.name = api.value; touch(); });
    const desc = h('textarea', { class: 'input', rows: 2, disabled: !editable, placeholder: 'What this template is for' });
    desc.value = tpl.description || '';
    desc.addEventListener('input', () => { tpl.description = desc.value; touch(); });
    const objSel = select(objects.map((o) => [o.apiName, o.label]), tpl.object, { disabled: !editable, ariaLabel: 'Object', onChange: (v) => {
      tpl.object = v;
      if (tpl.outputField && !outputFields(v).some((f) => f.apiName === tpl.outputField)) tpl.outputField = null;
      previewRecord = null; preview = null;
      touch(); drawAll();
    } });
    const active = toggleRow('Active', tpl.active !== false, (v) => { tpl.active = v; touch(); }, { disabled: !editable, help: 'Inactive templates can’t be run by users or flows.' });
    return sectionCard('Template Details', { iconName: 'file', body: [
      h('div', { class: 'grid-2' },
        formRow('Prompt Template Name', label, { required: true }),
        formRow('API Name', api, { required: true }),
        formRow('Object', objSel, { required: true, help: 'The record type this template is grounded in.' }),
        h('div', { class: 'form-row aia-active-row' }, active)),
      formRow('Description', desc),
    ] });
  }

  function typeCard() {
    const cards = h('div', { class: 'aia-type-cards', role: 'radiogroup', 'aria-label': 'Template type' }, Object.entries(TEMPLATE_TYPES).map(([k, d]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(tpl.templateType === k), class: ['aia-type-card', tpl.templateType === k && 'active'], disabled: !editable,
      onClick: () => { if (tpl.templateType === k) return; tpl.templateType = k; touch(); drawAll(); },
    }, h('span', { class: `aia-type-ico t-${k}` }, icon(d.icon)), h('div', { class: 'grow' }, h('div', { class: 'strong' }, d.label), h('div', { class: 'small muted' }, d.desc)), h('span', { class: 'aia-radio' }))));
    const fields = outputFields(tpl.object);
    const required = tpl.templateType === 'field';
    const outSel = select([['', required ? '— Choose a text field —' : '— None —'], ...fields.map((f) => [f.apiName, `${f.label} (${f.type === 'LongTextArea' ? 'Long Text Area' : f.type === 'TextArea' ? 'Text Area' : 'Text'})`])], tpl.outputField || '', {
      disabled: !editable, ariaLabel: 'Output field', onChange: (v) => { tpl.outputField = v || null; touch(); drawAll(); },
    });
    if (required && !tpl.outputField) outSel.classList.add('invalid');
    return sectionCard('Template Type', { iconName: 'layers', body: [cards,
      formRow('Output Field', outSel, { required, help: fields.length
        ? (required ? 'The generated value is stored in this field. Required for Field Generation.' : 'Optional. Lets users save the response to this field, and lets Flows store it.')
        : `${getObj(tpl.object)?.label || tpl.object} has no editable text fields. Create one in Object Manager.` }),
    ] });
  }

  function instructionsCard() {
    const ta = h('textarea', { class: 'input mono aia-instructions', rows: 16, disabled: !editable, spellcheck: 'false', 'aria-label': 'Prompt instructions' });
    ta.value = tpl.instructions || '';
    const counter = h('span', { class: 'tiny muted' });
    const mergeCount = () => (ta.value.match(/\{![^}]+\}/g) || []).length;
    const upd = () => { counter.textContent = `${ta.value.length.toLocaleString()} characters · ${mergeCount()} merge field${mergeCount() === 1 ? '' : 's'}`; };
    ta.addEventListener('input', () => { tpl.instructions = ta.value; touch(); upd(); });
    upd();
    const insert = (text) => {
      const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + text.length;
      ta.dispatchEvent(new Event('input'));
    };
    const quick = [['{!RecordDetails}', 'Record details'], ['{!Activities}', 'Activities'], ['{!Feed}', 'Chatter feed'], ['{!$User.Name}', 'User name']];
    return sectionCard('Prompt Instructions', { iconName: 'edit', subtitle: 'Tell the AI what to do. Merge fields are replaced with the record’s values when the prompt runs.',
      actions: editable ? [mergeMenuButton(tpl.object, insert)] : [],
      body: [
        h('div', { class: 'aia-quick-merge' }, h('span', { class: 'tiny muted' }, 'Quick insert:'), quick.map(([t, l]) => h('button', { type: 'button', class: 'aia-chip', disabled: !editable, title: t, onClick: () => insert(t) }, l))),
        ta,
        h('div', { class: 'row mt-8' }, h('span', { class: 'tiny muted grow' }, 'Tip: picklists, numbers and dates read best as ', h('code', '{!TEXT(Field)}'), '. Parent fields work too, e.g. ', h('code', '{!Account.Name}'), '.'), counter),
      ] });
  }

  function previewCard() {
    const obj = getObj(tpl.object);
    const li = lookupInput({ objects: [tpl.object], value: previewRecord?.id || null, label: previewRecord?.name || null, placeholder: `Search ${obj?.pluralLabel || 'records'}...`, onChange: (rid) => {
      previewRecord = rid ? { id: rid, name: li.el.querySelector('.lookup-selected .name')?.textContent || rid } : null;
    } });
    const runBtn = h('button', { class: 'btn btn-brand aia-preview-btn', onClick: async () => {
      if (!String(tpl.instructions || '').trim()) { toast('Write some instructions first.', 'error'); return; }
      setBusy(runBtn, true, 'Generating…');
      preview = null; drawResult(true);
      try {
        preview = await POST('/api/ai/prompts/preview', { object: tpl.object, instructions: tpl.instructions, templateType: tpl.templateType, recordId: previewRecord?.id || null });
        previewTab = 'response';
      } catch (e) { preview = { error: e.message }; }
      setBusy(runBtn, false);
      drawResult();
    } }, icon('sparkles'), 'Preview');
    const result = h('div', { class: 'aia-preview-result' });
    const drawResult = (loading) => {
      clear(result);
      if (loading) { result.appendChild(h('div', { class: 'aia-preview-loading' }, h('div', { class: 'aia-shimmer' }), h('div', { class: 'aia-shimmer short' }), h('div', { class: 'aia-shimmer' }))); return; }
      if (!preview) { result.appendChild(h('div', { class: 'aia-preview-empty' }, aiMark('md'), h('div', { class: 'small muted' }, `Choose a ${obj?.label || 'record'} and click Preview to see the resolved prompt and the AI response.`))); return; }
      if (preview.error) {
        result.appendChild(h('div', { class: 'aia-test err' }, icon('alert'), h('div', { class: 'grow' }, h('div', { class: 'strong' }, 'Preview failed'), h('div', { class: 'small' }, preview.error),
          /AI is turned off|API key/i.test(preview.error) ? h('a', { class: 'small', href: '#/setup/ai' }, 'Open AI Settings') : null)));
        return;
      }
      const tabsBar = h('div', { class: 'aia-seg' }, [['response', 'AI Response'], ['prompt', 'Resolved Prompt']].map(([k, l]) => h('button', { type: 'button', class: ['aia-seg-btn', previewTab === k && 'active'], onClick: () => { previewTab = k; drawResult(); } }, l)));
      const content = previewTab === 'prompt'
        ? h('pre', { class: 'aia-pre aia-preview-pre' }, preview.resolvedPrompt)
        : (tpl.templateType === 'field' ? h('div', { class: 'aia-preview-field' }, h('div', { class: 'tiny muted mb-8' }, `Value for ${getObj(tpl.object)?.fieldMap.get(tpl.outputField)?.label || 'the output field'}:`), h('div', { class: 'pre-wrap' }, preview.response)) : markdown(preview.response, 'aia-preview-md'));
      result.append(tabsBar, content);
    };
    drawResult();
    return h('section', { class: 'card aia-card aia-preview' },
      h('div', { class: 'card-header' }, aiMark('sm'), h('div', { class: 'grow' }, h('h2', 'Preview'), h('div', { class: 'small muted' }, 'Runs the current (unsaved) instructions.'))),
      h('div', { class: 'aia-card-body' },
        formRow(`${obj?.label || 'Record'}`, li.el, { help: 'Optional — without a record, merge fields are left as written.' }),
        h('div', { class: 'row mb-16' }, runBtn),
        result));
  }

  function drawAll() {
    mount(leftCol, settingsCard(), typeCard(), instructionsCard());
    mount(rightCol, previewCard());
  }
  drawAll();

  async function save() {
    if (!String(tpl.label || '').trim()) { toast('Prompt template name is required.', 'error'); return; }
    if (tpl.templateType === 'field' && !tpl.outputField) { toast('Field Generation templates need an output field.', 'error'); return; }
    setBusy(saveBtn, true, 'Saving…');
    const body = { label: tpl.label.trim(), name: tpl.name || apiNameFrom(tpl.label), description: tpl.description || '', object: tpl.object, templateType: tpl.templateType,
      instructions: tpl.instructions || '', outputField: tpl.outputField || null, active: tpl.active !== false };
    try {
      const res = id ? await PUT(`/api/setup/meta/promptTemplate/${id}`, body) : await POST('/api/setup/meta/promptTemplate', body);
      dirty = false;
      toast(`Prompt template “${res.label}” saved.`, 'success');
      if (!id) app.navigate(`/setup/prompts/${res.id}`);
      else { tpl = { ...tpl, ...res }; setBusy(saveBtn, false); }
    } catch (e) { toast(e.message, 'error'); setBusy(saveBtn, false); }
  }

  async function remove() {
    if (!(await confirmDialog(h('div', 'Delete the prompt template ', h('strong', tpl.label), '?'), { title: 'Delete Prompt Template', confirmLabel: 'Delete', danger: true }))) return;
    try { await DEL(`/api/setup/meta/promptTemplate/${id}`); dirty = false; toast('Prompt template deleted.', 'success'); app.navigate('/setup/prompts'); } catch (e) { toast(e.message, 'error'); }
  }

  return () => window.removeEventListener('beforeunload', onBeforeUnload);
}

// "Insert Merge Field" menu: record fields (incl. parent paths), record context resources and globals.
function mergeMenuButton(objApi, insert) {
  const RESOURCES = [
    { token: '{!RecordDetails}', label: 'Record Details', desc: 'All readable fields plus related records', group: 'Record Context' },
    { token: '{!Activities}', label: 'Activities', desc: 'Recent tasks, calls and events', group: 'Record Context' },
    { token: '{!Feed}', label: 'Chatter Feed', desc: 'Recent feed posts', group: 'Record Context' },
    { token: '{!$User.Name}', label: 'Running User: Full Name', group: 'Global' },
    { token: '{!$User.FirstName}', label: 'Running User: First Name', group: 'Global' },
    { token: '{!$User.Email}', label: 'Running User: Email', group: 'Global' },
    { token: '{!TODAY()}', label: 'Today’s Date', group: 'Global' },
  ];
  return h('button', { type: 'button', class: 'btn btn-sm', onClick: (e) => {
    const fields = pathOptions(objApi).map((o) => {
      const wrap = TEXT_WRAP.has(o.field?.type);
      return { token: wrap ? `{!TEXT(${o.path})}` : `{!${o.path}}`, label: o.label, group: o.group, desc: null };
    });
    const opts = [...RESOURCES, ...fields];
    const filter = h('input', { class: 'input input-sm', placeholder: 'Search fields and resources...', 'aria-label': 'Search merge fields' });
    const listEl = h('div', { class: 'merge-list aia-merge-list' });
    const draw = () => {
      clear(listEl);
      const t = filter.value.trim().toLowerCase();
      const shown = opts.filter((o) => !t || o.label.toLowerCase().includes(t) || o.token.toLowerCase().includes(t)).slice(0, 150);
      if (!shown.length) listEl.appendChild(h('div', { class: 'muted small p-16 center' }, 'No matching fields'));
      let group = null;
      for (const o of shown) {
        if (o.group !== group) { group = o.group; listEl.appendChild(h('div', { class: 'menu-header' }, group)); }
        listEl.appendChild(h('button', { type: 'button', class: 'menu-item aia-merge-item', onClick: () => { closeMenu(); insert(o.token); } },
          h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'truncate' }, o.label), o.desc ? h('div', { class: 'tiny muted truncate' }, o.desc) : null),
          h('span', { class: 'muted tiny mono' }, o.token)));
      }
    };
    filter.addEventListener('input', draw);
    draw();
    showMenu(e.currentTarget, [{ node: h('div', { style: { padding: '4px' } }, filter) }, { node: listEl }], { width: 400, align: 'right' });
    setTimeout(() => filter.focus(), 0);
  } }, icon('plus', { size: 14 }), 'Insert Merge Field', icon('chevronDown', { size: 12 }));
}

export { typeBadge, badge };
