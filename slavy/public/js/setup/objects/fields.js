// Object Manager → Fields & Relationships: list, New Field wizard, field detail, edit, delete.
import { h, icon, mount, clear, emptyState, modal, toast, badge, confirmDialog, fmt } from '../../lib.js';
import { POST, PATCH, DEL, getObj } from '../../api.js';
import { formulaEditor } from '../../components/formula.js';
import {
  TYPE_INFO, typeLabel, typeIcon, apiFromLabel, autoNumberPreview, formRow, input, textarea, select, checkbox, kv, yesNo, allObjects, busy,
} from './common.js';

const COMPUTED = new Set(['Formula', 'Rollup', 'AutoNumber']);
const RETURN_TYPES = ['Text', 'Number', 'Currency', 'Percent', 'Checkbox', 'Date', 'DateTime'];
const NUMERIC = new Set(['Number', 'Currency', 'Percent']);
const effType = (f) => (f.type === 'Formula' || f.type === 'Rollup' ? f.returnType || 'Number' : f.type);

export default async function fieldsTab(panel, ctx) {
  if (ctx.segments[0]) return fieldDetail(panel, ctx, ctx.segments[0]);
  return fieldList(panel, ctx);
}

function flags(f, data) {
  const out = [];
  if (f.required || f.type === 'MasterDetail') out.push(badge('Required', 'danger'));
  if (f.unique) out.push(badge('Unique', 'brand'));
  if (f.externalId) out.push(badge('External ID', 'warning'));
  if (f.trackHistory && data.trackHistory) out.push(badge('Tracked', 'success'));
  if (f.polymorphic) out.push(badge('Polymorphic'));
  return out;
}

// ---------- list ----------
function fieldList(panel, ctx) {
  const { data, editable, base } = ctx;
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Quick Find', 'aria-label': 'Search fields' });
  const tbody = h('tbody');
  const count = h('span', { class: 'muted small' });
  let kind = 'all';
  const filterSel = select([{ value: 'all', label: 'All Fields' }, { value: 'custom', label: 'Custom Fields' }, { value: 'standard', label: 'Standard Fields' }, { value: 'rel', label: 'Relationships' }],
    'all', (v) => { kind = v; draw(); }, { cls: 'input om-filter-sel', ariaLabel: 'Filter fields' });
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    const rows = data.fields.filter((f) => (kind === 'all' || (kind === 'custom' ? f.isCustom : kind === 'standard' ? !f.isCustom : ['Lookup', 'MasterDetail'].includes(f.type)))
      && (!t || f.label.toLowerCase().includes(t) || f.apiName.toLowerCase().includes(t) || typeLabel(f).toLowerCase().includes(t)));
    count.textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}`;
    clear(tbody);
    if (!rows.length) { tbody.appendChild(h('tr', h('td', { colspan: 5 }, emptyState('No fields found', 'Try a different search.')))); return; }
    for (const f of rows) {
      tbody.appendChild(h('tr',
        h('td', h('a', { class: 'row gap-8', href: `${base}/fields/${encodeURIComponent(f.apiName)}` }, h('span', { class: 'om-type-icon' }, icon(typeIcon(f.type))), h('span', { class: 'strong' }, f.label))),
        h('td', { class: 'mono' }, f.apiName),
        h('td', typeLabel(f)),
        h('td', h('div', { class: 'row wrap gap-4' }, flags(f, data))),
        h('td', { class: 'right' }, f.system ? h('span', { class: 'muted tiny' }, 'System') : f.isCustom ? badge('Custom', 'brand') : h('span', { class: 'muted tiny' }, 'Standard'))));
    }
  };
  q.addEventListener('input', draw);
  draw();
  const hasRollupTarget = data.children.some((c) => c.type === 'MasterDetail');
  mount(panel, h('div', { class: 'card' },
    h('div', { class: 'card-header' }, h('h2', 'Fields & Relationships'), count,
      editable ? h('button', { class: 'btn btn-brand', onClick: () => fieldWizard(ctx, { hasRollupTarget }) }, icon('plus'), 'New') : null),
    h('div', { class: 'om-toolbar' }, h('div', { class: 'input-group om-search' }, icon('search'), q), filterSel),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', h('tr', h('th', 'Field Label'), h('th', 'Field Name'), h('th', 'Data Type'), h('th', 'Attributes'), h('th', { class: 'right' }, 'Type'))), tbody))));
  setTimeout(() => q.focus(), 0);
}

// ---------- field detail ----------
function fieldDetail(panel, ctx, fieldApi) {
  const { data, editable, base } = ctx;
  const f = data.fields.find((x) => x.apiName.toLowerCase() === fieldApi.toLowerCase());
  if (!f) {
    mount(panel, h('div', { class: 'card p-24' }, emptyState('Field not found', `No field "${fieldApi}" on ${data.label}.`, { iconName: 'alert', action: h('a', { class: 'btn', href: `${base}/fields` }, 'Back to Fields') })));
    return;
  }
  const t = effType(f);
  const canEdit = editable && (!f.system || f.apiName === 'Name');
  const props = [
    kv('Field Label', f.label), kv('Field Name', h('span', { class: 'mono' }, f.apiName)), kv('Data Type', typeLabel(f)),
    kv('Origin', f.system ? 'System' : f.isCustom ? 'Custom' : 'Standard'), kv('Description', f.description), kv('Help Text', f.helpText),
    kv('Required', yesNo(f.required || f.type === 'MasterDetail')), kv('Unique', yesNo(f.unique)), kv('External ID', yesNo(f.externalId)),
    data.trackHistory ? kv('Track History', yesNo(f.trackHistory)) : null,
    f.defaultValue != null && f.defaultValue !== '' ? kv('Default Value', h('code', String(f.defaultValue))) : null,
    f.relationshipName ? kv('Relationship Name', h('span', { class: 'mono' }, f.relationshipName)) : null,
    ['Lookup', 'MasterDetail'].includes(f.type) && !f.system ? kv('Related List Label', f.relatedListLabel) : null,
    f.type === 'Lookup' && !f.system ? kv('If Lookup Record Is Deleted', { setNull: 'Clear the value of this field', restrict: "Don't allow deletion of the lookup record", cascade: 'Delete this record also' }[f.deleteConstraint || 'setNull']) : null,
    f.type === 'MasterDetail' ? kv('Allow Reparenting', yesNo(f.reparentable)) : null,
    ['TextArea', 'LongTextArea'].includes(f.type) ? kv('Visible Lines', f.visibleLines || 3) : null,
    NUMERIC.has(t) ? kv('Decimal Places', f.scale ?? (t === 'Currency' ? 2 : 0)) : null,
    ['Picklist', 'MultiPicklist'].includes(f.type) ? kv('Restricted Picklist', yesNo(f.restricted !== false)) : null,
    f.type === 'AutoNumber' || (f.isNameField && data.nameField?.type === 'AutoNumber') ? kv('Display Format', h('span', { class: 'mono' }, f.format || data.nameField?.format)) : null,
  ].filter(Boolean);

  const extra = [];
  if (f.type === 'Formula') extra.push(h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Formula')), h('div', { class: 'card-body' }, h('div', { class: 'code-block pre-wrap' }, f.formula))));
  if (f.type === 'Rollup' && f.rollup) {
    const co = getObj(f.rollup.childObject);
    const cf = co?.fields.find((x) => x.apiName === f.rollup.field);
    extra.push(h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Roll-Up Summary')), h('div', { class: 'card-body om-kv-grid' },
      kv('Summarized Object', co?.label || f.rollup.childObject), kv('Relationship Field', f.rollup.relField), kv('Roll-Up Type', f.rollup.op),
      kv('Field to Aggregate', f.rollup.op === 'COUNT' ? null : cf?.label || f.rollup.field), kv('Filter Criteria', f.rollup.filter ? h('code', f.rollup.filter) : 'All records are included'))));
  }
  if (['Picklist', 'MultiPicklist'].includes(f.type)) {
    extra.push(h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Values'), h('span', { class: 'muted small' }, `${(f.values || []).length} values`)),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' }, h('thead', h('tr', h('th', 'Value'), h('th', 'Label'), h('th', 'Default'), h('th', 'Active'))),
        h('tbody', (f.values || []).map((v) => h('tr', h('td', v.value), h('td', v.label || v.value), h('td', v.isDefault ? icon('check', { cls: 'om-yes' }) : ''), h('td', v.isActive === false ? badge('Inactive') : badge('Active', 'success')))))))));
  }
  extra.push(whereUsed(ctx, f));

  const editBtn = canEdit ? h('button', { class: 'btn', onClick: () => (f.system ? renameNameField(ctx, f) : fieldForm(ctx, { field: f })) }, icon('edit'), 'Edit') : null;
  const delBtn = editable && f.isCustom && !f.system ? h('button', { class: 'btn btn-danger', onClick: () => deleteField(ctx, f) }, icon('trash'), 'Delete') : null;
  mount(panel,
    h('div', { class: 'card' },
      h('div', { class: 'card-header' },
        h('a', { class: 'btn btn-ghost btn-icon btn-sm', href: `${base}/fields`, 'aria-label': 'Back to fields', title: 'Back to fields' }, icon('chevronLeft')),
        h('span', { class: 'om-type-icon' }, icon(typeIcon(f.type))), h('h2', f.label), editBtn, delBtn),
      h('div', { class: 'card-body' }, f.system && f.apiName !== 'Name' ? h('div', { class: 'alert mb-16' }, icon('info'), 'System fields are managed by Slavy and cannot be changed.') : null,
        h('div', { class: 'om-kv-grid' }, props))),
    extra);
}

function whereUsed(ctx, f) {
  const { data } = ctx;
  const re = new RegExp(`(^|[^A-Za-z0-9_.])${f.apiName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'i');
  const uses = [];
  (data.layout?.sections || []).forEach((s) => { if ((s.fields || []).includes(f.apiName)) uses.push(['Page Layout', `Section "${s.label}"`, `${ctx.base}/layout`]); });
  if ((data.highlightFields || []).includes(f.apiName)) uses.push(['Compact Layout', 'Highlights panel', `${ctx.base}/details`]);
  if ((data.listColumns || []).includes(f.apiName)) uses.push(['List View', 'Default columns', `${ctx.base}/details`]);
  if (data.pathField === f.apiName) uses.push(['Path', 'Path field', `${ctx.base}/details`]);
  data.fields.filter((x) => x !== f && x.type === 'Formula' && re.test(x.formula || '')).forEach((x) => uses.push(['Formula Field', x.label, `${ctx.base}/fields/${x.apiName}`]));
  data.validationRules.filter((r) => re.test(r.formula || '')).forEach((r) => uses.push(['Validation Rule', r.name, `${ctx.base}/rules`]));
  data.actions.filter((a) => (a.fields || []).includes(f.apiName) || (a.assignments || []).some((x) => x.field === f.apiName)).forEach((a) => uses.push(['Quick Action', a.label, `${ctx.base}/actions`]));
  data.flows.filter((fl) => re.test(JSON.stringify([fl.condition, fl.filters, fl.elements]))).forEach((fl) => uses.push(['Flow', fl.label, `#/setup/flows/${fl.id}`]));
  return h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Where Is This Used?'), h('span', { class: 'muted small' }, `${uses.length} reference${uses.length === 1 ? '' : 's'}`)),
    uses.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' }, h('thead', h('tr', h('th', 'Type'), h('th', 'Name'))),
      h('tbody', uses.map(([type, name, href]) => h('tr', h('td', type), h('td', h('a', { href }, name)))))))
      : h('div', { class: 'card-body muted small' }, 'This field is not referenced by layouts, formulas, validation rules, actions or flows on this object.'));
}

function renameNameField(ctx, f) {
  const inp = input(f.label);
  const saveBtn = h('button', { class: 'btn btn-brand', onClick: () => busy(saveBtn, async () => {
    try {
      await PATCH(`/api/setup/objects/${ctx.data.apiName}/fields/Name`, { label: inp.value.trim() });
      m.close(); await ctx.app.refreshMeta(); toast('Field updated.', 'success'); await ctx.reload();
    } catch (e) { m.setError(e.message); }
  }) }, 'Save');
  const m = modal({ title: 'Edit Record Name', size: 'sm', body: formRow('Field Label', inp, { required: true, help: 'Change the data type from the object Details tab.' }),
    footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), saveBtn] });
}

async function deleteField(ctx, f) {
  const ok = await confirmDialog(h('div', h('p', `Delete the field "${f.label}" (${f.apiName})?`), h('p', { class: 'muted small' }, 'Data stored in this field will no longer be accessible, and any formulas, layouts or rules referencing it may stop working.')),
    { title: 'Delete Field', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  try {
    await DEL(`/api/setup/objects/${ctx.data.apiName}/fields/${f.apiName}`);
    await ctx.app.refreshMeta();
    toast(`Field "${f.label}" deleted.`, 'success');
    ctx.app.navigate(`${ctx.base.slice(1)}/fields`);
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- New Field wizard: step 1 (type) ----------
function fieldWizard(ctx, { hasRollupTarget }) {
  let chosen = null;
  const grid = h('div', { class: 'om-type-grid', role: 'radiogroup', 'aria-label': 'Data type' });
  const nextBtn = h('button', { class: 'btn btn-brand', disabled: true, onClick: () => { m.close(); fieldForm(ctx, { type: chosen }); } }, 'Next', icon('chevronRight'));
  const types = Object.keys(TYPE_INFO).filter((t) => t !== 'Rollup' || hasRollupTarget);
  const groups = [
    ['Relationships', ['Lookup', 'MasterDetail']],
    ['Calculated', ['Formula', 'Rollup', 'AutoNumber']],
    ['Text', ['Text', 'TextArea', 'LongTextArea', 'Email', 'Phone', 'Url']],
    ['Numbers & Dates', ['Number', 'Currency', 'Percent', 'Date', 'DateTime', 'Checkbox']],
    ['Choices', ['Picklist', 'MultiPicklist']],
  ];
  for (const [g, list] of groups) {
    const items = list.filter((t) => types.includes(t));
    if (!items.length) continue;
    grid.appendChild(h('div', { class: 'om-type-group' }, g));
    for (const t of items) {
      const card = h('button', { type: 'button', class: 'om-type-card', role: 'radio', 'aria-checked': 'false', onClick: () => {
        chosen = t; nextBtn.disabled = false;
        grid.querySelectorAll('.om-type-card').forEach((c) => { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
        card.classList.add('active'); card.setAttribute('aria-checked', 'true');
      }, onDblclick: () => { chosen = t; m.close(); fieldForm(ctx, { type: t }); } },
      h('span', { class: 'om-type-icon' }, icon(typeIcon(t))), h('span', { class: 'grow' }, h('span', { class: 'strong' }, TYPE_INFO[t].label), h('span', { class: 'muted small om-type-desc' }, TYPE_INFO[t].desc)));
      grid.appendChild(card);
    }
  }
  const m = modal({
    title: 'New Custom Field', size: 'lg',
    body: h('div', h('div', { class: 'om-steps' }, h('span', { class: 'om-step active' }, '1. Choose the field type'), h('span', { class: 'om-step' }, '2. Enter the details')),
      !hasRollupTarget ? h('div', { class: 'form-help mb-8' }, 'Roll-Up Summary is available once another object has a master-detail relationship to this object.') : null, grid),
    footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), nextBtn],
  });
}

// ---------- step 2 / edit: field details ----------
function fieldForm(ctx, { type, field }) {
  const { data } = ctx;
  const isNew = !field;
  const t = isNew ? type : field.type;
  const d = isNew
    ? { type: t, label: '', apiName: '', description: '', helpText: '', required: false, unique: false, externalId: false, trackHistory: false, defaultValue: '',
      length: t === 'LongTextArea' ? 32768 : 255, visibleLines: t === 'LongTextArea' ? 5 : 3, intDigits: t === 'Percent' ? 3 : t === 'Currency' ? 16 : 18, scale: t === 'Currency' ? 2 : 0,
      values: [], restricted: true, referenceTo: '', relatedListLabel: '', deleteConstraint: 'setNull', reparentable: false,
      formula: '', returnType: 'Number', rollup: { childObject: '', relField: '', op: 'COUNT', field: '', filter: '' }, format: 'A-{0000}', addToLayout: true, addRelatedList: true }
    : JSON.parse(JSON.stringify({ ...field, defaultValue: field.defaultValue ?? '', rollup: field.rollup || { op: 'COUNT' }, values: field.values || [],
      intDigits: (field.precision || 18) - (field.scale ?? 0), scale: field.scale ?? (effType(field) === 'Currency' ? 2 : 0) }));
  let apiTouched = !isNew;
  const isStandard = !isNew && !field.isCustom;

  const apiIn = input(isNew ? '' : d.apiName, { readOnly: !isNew, onInput: (v) => { d.apiName = v; apiTouched = true; } });
  const labelIn = input(d.label, { maxlength: 80, onInput: (v) => {
    d.label = v;
    if (!apiTouched) { d.apiName = apiFromLabel(v); apiIn.value = d.apiName; }
    if (isNew && ['Lookup', 'MasterDetail'].includes(t) && !rlTouched) { d.relatedListLabel = data.pluralLabel; rlIn.value = d.relatedListLabel; }
  } });

  const sections = [];
  const general = [
    formRow('Field Label', labelIn, { required: true }),
    formRow('Field Name', isNew ? h('div', { class: 'om-suffix-input' }, apiIn, h('span', { class: 'om-suffix' }, '__c')) : apiIn,
      { required: true, help: isNew ? 'Auto-filled from the label. Letters, numbers and underscores only.' : 'The API name cannot be changed.' }),
    formRow('Description', textarea(d.description, { rows: 2, onInput: (v) => { d.description = v; } })),
    formRow('Help Text', textarea(d.helpText, { rows: 2, onInput: (v) => { d.helpText = v; } }), { help: 'Shown as a hover tip next to the field label.' }),
  ];
  sections.push(h('div', { class: 'section-title' }, 'Field Details'), h('div', { class: 'form-grid' }, general));

  // ----- type specific -----
  const typeRows = [];
  let rlTouched = !isNew;
  const rlIn = input(d.relatedListLabel, { onInput: (v) => { d.relatedListLabel = v; rlTouched = true; } });
  let formulaEd = null;
  if (['Text'].includes(t) || ['TextArea', 'LongTextArea'].includes(t)) {
    typeRows.push(formRow('Length', input(d.length, { type: 'number', min: 1, max: t === 'LongTextArea' ? 131072 : 255, onInput: (v) => { d.length = Number(v); } }),
      { required: true, help: t === 'LongTextArea' ? 'Up to 131,072 characters.' : 'Up to 255 characters.' }));
  }
  if (['TextArea', 'LongTextArea'].includes(t)) typeRows.push(formRow('# Visible Lines', input(d.visibleLines, { type: 'number', min: 1, max: 50, onInput: (v) => { d.visibleLines = Number(v); } })));
  if (NUMERIC.has(t)) {
    typeRows.push(formRow('Length', input(d.intDigits, { type: 'number', min: 1, max: 18, onInput: (v) => { d.intDigits = Number(v); } }), { help: 'Number of digits to the left of the decimal point.' }));
    typeRows.push(formRow('Decimal Places', input(d.scale, { type: 'number', min: 0, max: 8, onInput: (v) => { d.scale = Number(v); } })));
  }
  if (t === 'AutoNumber') {
    const prev = h('span', { class: 'mono' }, autoNumberPreview(d.format, 1));
    typeRows.push(formRow('Display Format', input(d.format, { onInput: (v) => { d.format = v; prev.textContent = autoNumberPreview(v, 1); } }),
      { required: true, help: h('span', 'Use {0000} for the sequence and {YYYY} for the year. Preview: ', prev) }));
  }
  if (['Lookup', 'MasterDetail'].includes(t)) {
    const targets = allObjects().filter((o) => t === 'Lookup' || o.apiName !== data.apiName).map((o) => ({ value: o.apiName, label: o.label }));
    if (t === 'Lookup') targets.push({ value: 'User', label: 'User' });
    const refs = Array.isArray(d.referenceTo) ? d.referenceTo : [d.referenceTo];
    typeRows.push(formRow('Related To', isNew
      ? select(targets.sort((a, b) => a.label.localeCompare(b.label)), d.referenceTo, (v) => { d.referenceTo = v; }, { placeholder: '-- Select an object --' })
      : input(refs.map((r) => getObj(r)?.label || r).join(', '), { readOnly: true }), { required: true }));
    if (!field?.system) typeRows.push(formRow('Related List Label', rlIn, { help: 'Title of the related list on the parent record page.' }));
    if (t === 'Lookup') {
      typeRows.push(formRow('What to do if the lookup record is deleted?', h('div', { class: 'col gap-4', role: 'radiogroup' },
        [['setNull', 'Clear the value of this field.'], ['restrict', "Don't allow deletion of the lookup record that's part of a lookup relationship."]].map(([v, l]) => {
          const r = h('input', { type: 'radio', name: 'om-delc', value: v, checked: d.deleteConstraint === v || (v === 'setNull' && !d.deleteConstraint) });
          r.addEventListener('change', () => { if (r.checked) d.deleteConstraint = v; });
          return h('label', { class: 'checkbox' }, r, h('span', l));
        })), { span: true }));
    } else {
      typeRows.push(h('div', { class: 'span-2' },
        h('div', { class: 'alert mb-8' }, icon('info'), h('div', 'Master-detail fields are always required. Detail records are deleted along with their master record and inherit its sharing.')),
        checkbox('Allow reparenting', !!d.reparentable, (v) => { d.reparentable = v; }, { help: 'Child records can be moved to a different parent record after they are created.' })));
    }
  }
  if (['Picklist', 'MultiPicklist'].includes(t)) {
    typeRows.push(h('div', { class: 'span-2' }, picklistEditor(d, t)));
  }
  if (t === 'Formula') {
    const scaleRow = formRow('Decimal Places', input(d.scale ?? 2, { type: 'number', min: 0, max: 8, onInput: (v) => { d.scale = Number(v); } }));
    const showScale = () => scaleRow.classList.toggle('hidden', !NUMERIC.has(d.returnType));
    typeRows.push(formRow('Formula Return Type', select(RETURN_TYPES.map((x) => ({ value: x, label: TYPE_INFO[x].label })), d.returnType || 'Text', (v) => { d.returnType = v; showScale(); }), { required: true }));
    typeRows.push(scaleRow);
    showScale();
    formulaEd = formulaEditor({ objApi: data.apiName, value: d.formula, rows: 6, aiPurpose: 'formula', returnType: d.returnType, placeholder: "e.g. Amount * Probability / 100  or  IF(ISPICKVAL(Status__c, 'Done'), 'Complete', 'Open')", onChange: (v) => { d.formula = v; } });
    typeRows.push(formRow('Formula', formulaEd.el, { span: true, required: true, help: 'Reference fields with their API names, and parent fields with relationship paths like Account.Name.' }));
  }
  if (t === 'Rollup') typeRows.push(h('div', { class: 'span-2' }, rollupEditor(ctx, d)));
  if (typeRows.length) sections.push(h('div', { class: 'section-title' }, `${TYPE_INFO[t].label} Options`), h('div', { class: 'form-grid' }, typeRows));

  // ----- general options -----
  const opts = [];
  if (!COMPUTED.has(t) && t !== 'Checkbox' && t !== 'MasterDetail') opts.push(checkbox('Required', !!d.required, (v) => { d.required = v; }, { help: 'Always require a value in this field to save a record.' }));
  if (['Text', 'Email', 'Number', 'Phone'].includes(t)) opts.push(checkbox('Unique', !!d.unique, (v) => { d.unique = v; }, { help: 'Do not allow duplicate values.' }));
  if (['Text', 'Email', 'Number', 'AutoNumber'].includes(t)) opts.push(checkbox('External ID', !!d.externalId, (v) => { d.externalId = v; }, { help: 'Identifies records from an external system; used for upserts and import matching.' }));
  if (data.trackHistory && !COMPUTED.has(t) && t !== 'LongTextArea') opts.push(checkbox('Track Field History', !!d.trackHistory, (v) => { d.trackHistory = v; }, { help: 'Record changes to this field in the History related list.' }));
  if (isNew) {
    opts.push(checkbox('Add to page layout', true, (v) => { d.addToLayout = v; }, { help: 'Adds the field to the first section of the page layout.' }));
    if (['Lookup', 'MasterDetail'].includes(t)) opts.push(checkbox('Add related list to the parent page layout', true, (v) => { d.addRelatedList = v; }));
  }
  if (opts.length) sections.push(h('div', { class: 'section-title' }, 'Options'), h('div', { class: 'om-options' }, opts));

  // ----- default value -----
  if (!COMPUTED.has(t) && !['Picklist', 'MultiPicklist', 'Lookup', 'MasterDetail'].includes(t)) {
    let defCtl;
    if (t === 'Checkbox') {
      defCtl = select([{ value: '', label: 'Unchecked' }, { value: 'TRUE', label: 'Checked' }], String(d.defaultValue).toUpperCase() === 'TRUE' ? 'TRUE' : '', (v) => { d.defaultValue = v; });
    } else {
      defCtl = input(d.defaultValue, { placeholder: t === 'Date' ? 'e.g. TODAY() + 30' : NUMERIC.has(t) ? 'e.g. 10' : "e.g. 'Draft'", onInput: (v) => { d.defaultValue = v; } });
      defCtl.classList.add('mono');
    }
    sections.push(h('div', { class: 'section-title' }, 'Default Value'),
      formRow('Default Value', defCtl, { help: t === 'Checkbox' ? null : "A formula evaluated when a record is created. Wrap text in quotes, e.g. 'Open'. Use functions like TODAY()." }));
  }

  const saveBtn = h('button', { class: 'btn btn-brand', onClick: () => busy(saveBtn, save) }, 'Save');
  const backBtn = isNew ? h('button', { class: 'btn', onClick: () => { m.close(); fieldWizard(ctx, { hasRollupTarget: data.children.some((c) => c.type === 'MasterDetail') }); } }, icon('chevronLeft'), 'Previous') : null;
  const m = modal({
    title: isNew ? `New ${TYPE_INFO[t].label} Field` : `Edit ${field.label}`, size: 'lg',
    body: h('div', isNew ? h('div', { class: 'om-steps' }, h('span', { class: 'om-step done' }, '1. Choose the field type'), h('span', { class: 'om-step active' }, '2. Enter the details')) : null,
      isStandard ? h('div', { class: 'alert mb-16' }, icon('info'), 'This is a standard field. Changes apply to all users.') : null,
      h('div', { class: 'row mb-16' }, h('span', { class: 'om-type-icon' }, icon(typeIcon(t))), h('span', { class: 'strong' }, TYPE_INFO[t].label), h('span', { class: 'muted small' }, TYPE_INFO[t].desc)),
      sections),
    footer: [backBtn, h('span', { class: 'spacer' }), h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), saveBtn],
  });
  setTimeout(() => labelIn.focus(), 40);

  async function save() {
    m.setError('');
    if (!d.label.trim()) return m.setError('Field Label is required.');
    const api = (d.apiName || '').replace(/__c$/, '');
    if (isNew && !/^[A-Za-z][A-Za-z0-9_]*$/.test(api)) return m.setError('Field Name must begin with a letter and use only letters, numbers and underscores.');
    if (isNew && api.includes('__')) return m.setError('Field Name cannot contain two consecutive underscores.');
    if (['Lookup', 'MasterDetail'].includes(t) && !d.referenceTo) return m.setError('Choose the related object.');
    if (['Picklist', 'MultiPicklist'].includes(t)) {
      d.values = d.values.filter((v) => String(v.value || '').trim());
      if (!d.values.length) return m.setError('Enter at least one picklist value.');
      const seen = new Set();
      for (const v of d.values) { const k = v.value.trim().toLowerCase(); if (seen.has(k)) return m.setError(`Duplicate picklist value: ${v.value}`); seen.add(k); }
    }
    if (t === 'Formula') {
      if (!d.formula?.trim()) return m.setError('Enter a formula.');
      const r = await formulaEd.check();
      if (!r.ok) return m.setError(`Formula error: ${r.error}`);
    }
    if (t === 'Rollup') {
      if (!d.rollup.childObject || !d.rollup.relField) return m.setError('Choose the object to summarize.');
      if (d.rollup.op !== 'COUNT' && !d.rollup.field) return m.setError('Choose the field to aggregate.');
    }
    const body = {
      type: t, label: d.label.trim(), description: d.description, helpText: d.helpText, required: t === 'MasterDetail' ? true : !!d.required, unique: !!d.unique,
      externalId: !!d.externalId, trackHistory: !!d.trackHistory, defaultValue: d.defaultValue === '' ? null : d.defaultValue,
    };
    if (isNew) { body.apiName = api; body.addToLayout = d.addToLayout; body.addRelatedList = d.addRelatedList; }
    if (['Text', 'TextArea', 'LongTextArea'].includes(t)) body.length = d.length;
    if (['TextArea', 'LongTextArea'].includes(t)) body.visibleLines = d.visibleLines;
    if (NUMERIC.has(t)) { body.scale = Number(d.scale) || 0; body.precision = (Number(d.intDigits) || 16) + body.scale; }
    if (['Picklist', 'MultiPicklist'].includes(t)) {
      body.values = d.values.map((v) => ({ ...v, value: v.value.trim(), label: (v.label || v.value).trim() }));
      if (t === 'Picklist') { let seen = false; body.values.forEach((v) => { if (v.isDefault && !seen) seen = true; else v.isDefault = false; }); }
      body.restricted = d.restricted !== false;
    }
    if (['Lookup', 'MasterDetail'].includes(t)) { body.referenceTo = d.referenceTo; body.relatedListLabel = d.relatedListLabel; body.deleteConstraint = d.deleteConstraint; body.reparentable = !!d.reparentable; }
    if (t === 'Formula') { body.formula = d.formula; body.returnType = d.returnType; if (NUMERIC.has(d.returnType)) body.scale = Number(d.scale ?? 2); }
    if (t === 'Rollup') {
      const r = d.rollup;
      body.rollup = { childObject: r.childObject, relField: r.relField, op: r.op, ...(r.op !== 'COUNT' ? { field: r.field } : {}), ...(r.filter?.trim() ? { filter: r.filter.trim() } : {}) };
      const cf = getObj(r.childObject)?.fields.find((x) => x.apiName === r.field);
      body.returnType = r.op === 'COUNT' ? 'Number' : r.op === 'AVG' ? (effType(cf || {}) === 'Currency' ? 'Currency' : 'Number') : effType(cf || {}) || 'Number';
      body.scale = r.op === 'COUNT' ? 0 : ['Date', 'DateTime'].includes(body.returnType) ? 0 : (cf?.scale ?? 2);
    }
    if (t === 'AutoNumber') body.format = d.format || '{0000}';
    try {
      const saved = isNew
        ? await POST(`/api/setup/objects/${data.apiName}/fields`, body)
        : await PATCH(`/api/setup/objects/${data.apiName}/fields/${field.apiName}`, body);
      m.close();
      await ctx.app.refreshMeta();
      toast(isNew ? `Field "${saved.label}" created.` : `Field "${saved.label}" saved.`, 'success');
      const target = `${ctx.base.slice(1)}/fields/${encodeURIComponent(saved.apiName)}`;
      if (location.hash === '#' + target) await ctx.reload(); else ctx.app.navigate(target);
    } catch (e) { m.setError(e.message); }
  }
}

// Picklist value editor: rows with value, label, default, active, reorder, remove; bulk add.
function picklistEditor(d, t) {
  const wrap = h('div');
  const rows = h('div', { class: 'om-pick-rows' });
  const draw = () => {
    clear(rows);
    rows.appendChild(h('div', { class: 'om-pick-row om-pick-head' }, h('span'), h('span', 'Value (API)'), h('span', 'Label'), h('span', { class: 'center' }, 'Default'), h('span', { class: 'center' }, 'Active'), h('span')));
    if (!d.values.length) rows.appendChild(h('div', { class: 'muted small p-16 center' }, 'No values yet. Add values one at a time or paste a list below.'));
    d.values.forEach((v, i) => {
      const val = input(v.value, { ariaLabel: `Value ${i + 1}`, onInput: (x) => { const sync = !v.label || v.label === v.value; v.value = x; if (sync) { v.label = x; lab.value = x; } } });
      val.classList.add('input-sm');
      const lab = input(v.label || v.value, { ariaLabel: `Label ${i + 1}`, onInput: (x) => { v.label = x; } });
      lab.classList.add('input-sm');
      const def = h('input', { type: t === 'Picklist' ? 'radio' : 'checkbox', name: 'om-pick-def', checked: !!v.isDefault, 'aria-label': 'Default' });
      def.addEventListener('click', () => {
        if (t === 'Picklist') { const was = v.isDefault; d.values.forEach((x) => { x.isDefault = false; }); v.isDefault = !was; draw(); } else v.isDefault = def.checked;
      });
      const act = h('input', { type: 'checkbox', checked: v.isActive !== false, 'aria-label': 'Active' });
      act.addEventListener('change', () => { v.isActive = act.checked; });
      const mv = (dir) => { const j = i + dir; if (j < 0 || j >= d.values.length) return; [d.values[i], d.values[j]] = [d.values[j], d.values[i]]; draw(); };
      rows.appendChild(h('div', { class: 'om-pick-row' },
        h('span', { class: 'om-pick-move' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Move up', disabled: i === 0, onClick: () => mv(-1) }, icon('chevronUp')),
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Move down', disabled: i === d.values.length - 1, onClick: () => mv(1) }, icon('chevronDown'))),
        val, lab, h('span', { class: 'center' }, def), h('span', { class: 'center' }, act),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Remove value', onClick: () => { d.values.splice(i, 1); draw(); } }, icon('trash'))));
    });
  };
  const bulk = textarea('', { rows: 3, placeholder: 'Paste values, one per line', ariaLabel: 'Bulk add values' });
  const addBulk = () => {
    const lines = bulk.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const have = new Set(d.values.map((v) => v.value.toLowerCase()));
    for (const l of lines) if (!have.has(l.toLowerCase())) { d.values.push({ value: l, label: l }); have.add(l.toLowerCase()); }
    bulk.value = '';
    draw();
  };
  draw();
  wrap.append(
    h('div', { class: 'row mb-8' }, h('strong', { class: 'grow' }, 'Values'),
      h('button', { type: 'button', class: 'btn btn-sm', onClick: () => { d.values.push({ value: '', label: '' }); draw(); rows.querySelectorAll('input.input')[rows.querySelectorAll('input.input').length - 2]?.focus(); } }, icon('plus'), 'Add Value'),
      h('button', { type: 'button', class: 'btn btn-sm', onClick: () => { d.values.sort((a, b) => (a.label || a.value).localeCompare(b.label || b.value)); draw(); } }, 'Sort A–Z')),
    rows,
    h('div', { class: 'row top mt-8' }, h('div', { class: 'grow' }, bulk), h('button', { type: 'button', class: 'btn btn-sm', onClick: addBulk }, icon('plus'), 'Add Lines')),
    h('div', { class: 'mt-8' }, checkbox('Restrict picklist to the values defined in the value set', d.restricted !== false, (v) => { d.restricted = v; },
      { help: 'Records can only be saved with one of these values (API and import included).' })));
  return wrap;
}

// Roll-up summary editor.
function rollupEditor(ctx, d) {
  const { data } = ctx;
  const r = d.rollup;
  const mdChildren = data.children.filter((c) => c.type === 'MasterDetail');
  const el = h('div');
  let filterEd = null;
  const draw = () => {
    clear(el);
    const childOpts = mdChildren.map((c) => ({ value: `${c.object}.${c.field}`, label: `${getObj(c.object)?.pluralLabel || c.object} (${c.field})` }));
    const child = getObj(r.childObject);
    const aggFields = (child?.fields || []).filter((f) => {
      const et = effType(f);
      if (['SUM', 'AVG'].includes(r.op)) return NUMERIC.has(et);
      return NUMERIC.has(et) || ['Date', 'DateTime'].includes(et);
    }).map((f) => ({ value: f.apiName, label: `${f.label} (${typeLabel(f)})` }));
    filterEd = r.childObject ? formulaEditor({ objApi: r.childObject, value: r.filter || '', rows: 3, placeholder: "Leave blank to include all records, e.g. ISPICKVAL(Status__c, 'Complete')", onChange: (v) => { r.filter = v; } }) : null;
    el.append(h('div', { class: 'form-grid' },
      formRow('Summarized Object', select(childOpts, r.childObject ? `${r.childObject}.${r.relField}` : '', (v) => {
        const [o, f] = v.split('.'); r.childObject = o || ''; r.relField = f || ''; r.field = ''; r.filter = ''; draw();
      }, { placeholder: '-- Select object --' }), { required: true, help: 'Only objects with a master-detail relationship to this object are listed.' }),
      formRow('Roll-Up Type', h('div', { class: 'row wrap gap-12', role: 'radiogroup', 'aria-label': 'Roll-up type' }, ['COUNT', 'SUM', 'MIN', 'MAX', 'AVG'].map((op) => {
        const rb = h('input', { type: 'radio', name: 'om-rollup-op', checked: r.op === op });
        rb.addEventListener('change', () => { r.op = op; if (op === 'COUNT') r.field = ''; draw(); });
        return h('label', { class: 'checkbox' }, rb, op);
      })), { required: true }),
      r.op !== 'COUNT' ? formRow('Field to Aggregate', select(aggFields, r.field, (v) => { r.field = v; }, { placeholder: r.childObject ? (aggFields.length ? '-- Select field --' : 'No eligible fields') : 'Choose an object first', disabled: !r.childObject }),
        { required: true, help: ['SUM', 'AVG'].includes(r.op) ? 'Number, currency and percent fields.' : 'Number, currency, percent, date and date/time fields.' }) : null,
      r.childObject ? formRow('Filter Criteria', filterEd.el, { span: true, help: 'Only child records for which this formula is TRUE are included.' }) : null));
  };
  draw();
  return el;
}
