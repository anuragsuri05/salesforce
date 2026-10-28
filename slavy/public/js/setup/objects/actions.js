// Object Manager → Buttons, Links & Actions: quick actions (update / create / flow / url) list + editor.
import { h, icon, mount, clear, emptyState, modal, toast, confirmDialog, badge, showMenu, spinner } from '../../lib.js';
import { GET, POST, PUT, DEL, getObj } from '../../api.js';
import { assignmentsEditor } from '../../components/assignments.js';
import { canEditField } from '../../fields.js';
import { formRow, input, textarea, select, checkbox, toggleSwitch, dualList, apiFromLabel, busy } from './common.js';

const TYPES = [
  { value: 'update', label: 'Update a Record', icon: 'edit', desc: 'Set field values on this record, optionally asking the user for some fields.' },
  { value: 'create', label: 'Create a Record', icon: 'plus', desc: 'Create a related child record pre-linked to this record.' },
  { value: 'flow', label: 'Launch a Flow', icon: 'flow', desc: 'Run an autolaunched flow with this record as input.' },
  { value: 'url', label: 'URL', icon: 'external', desc: 'Open a web address built from this record’s field values.' },
];
const typeOf = (v) => TYPES.find((t) => t.value === v) || TYPES[0];

const STANDARD_BUTTONS = [
  ['New', 'Create a new record'], ['Edit', 'Edit the record'], ['Delete', 'Move the record to the Recycle Bin'], ['Clone', 'Copy the record'],
  ['Change Owner', 'Transfer ownership'], ['Sharing', 'Share the record manually'], ['Submit for Approval', 'Start an approval process (when defined)'], ['Printable View', 'Print-friendly page'],
];

export default function actionsTab(panel, ctx) {
  const { data, editable } = ctx;
  const actions = [...data.actions].sort((a, b) => a.label.localeCompare(b.label));
  const tbody = h('tbody');
  const summary = (a) => {
    if (a.actionType === 'update') return `Sets ${(a.assignments || []).length} field${(a.assignments || []).length === 1 ? '' : 's'}${a.fields?.length ? `, asks for ${a.fields.length}` : ''}`;
    if (a.actionType === 'create') return `Creates ${getObj(a.childObject)?.label || a.childObject}${a.fields?.length ? ` (${a.fields.length} fields)` : ''}`;
    if (a.actionType === 'flow') return h('span', 'Runs ', a.flowId ? h('a', { href: `#/setup/flows/${a.flowId}` }, 'flow') : h('span', { class: 'muted' }, 'no flow selected'));
    return h('span', { class: 'mono small' }, a.url || '');
  };
  const draw = () => {
    clear(tbody);
    if (!actions.length) {
      tbody.appendChild(h('tr', h('td', { colspan: 6 }, emptyState('No custom actions', `Quick actions appear as buttons on ${data.label} record pages.`, { iconName: 'zap',
        action: editable ? h('button', { class: 'btn btn-brand', onClick: () => actionModal(ctx) }, icon('plus'), 'New Action') : null }))));
      return;
    }
    for (const a of actions) {
      const sw = toggleSwitch(a.active !== false, async (v) => {
        try { Object.assign(a, await PUT(`/api/setup/meta/action/${a.id}`, { ...a, active: v })); await ctx.app.refreshMeta(); toast(`"${a.label}" ${v ? 'activated' : 'deactivated'}.`, 'success'); }
        catch (e) { toast(e.message, 'error'); sw.querySelector('input').checked = !v; }
      }, { label: `Active: ${a.label}`, disabled: !editable });
      const t = typeOf(a.actionType);
      tbody.appendChild(h('tr',
        h('td', editable ? h('button', { class: 'link-btn strong', onClick: () => actionModal(ctx, a) }, a.label) : h('span', { class: 'strong' }, a.label)),
        h('td', { class: 'mono' }, a.name),
        h('td', h('span', { class: 'row gap-4' }, icon(t.icon), t.label)),
        h('td', summary(a)),
        h('td', sw),
        h('td', { class: 'right nowrap' }, editable ? [
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Edit', 'aria-label': `Edit ${a.label}`, onClick: () => actionModal(ctx, a) }, icon('edit')),
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Delete', 'aria-label': `Delete ${a.label}`, onClick: async () => {
            if (!(await confirmDialog(`Delete the action "${a.label}"? It will be removed from ${data.label} record pages.`, { title: 'Delete Action', confirmLabel: 'Delete', danger: true }))) return;
            try { await DEL(`/api/setup/meta/action/${a.id}`); await ctx.app.refreshMeta(); toast('Action deleted.', 'success'); await ctx.reload(); } catch (e) { toast(e.message, 'error'); }
          } }, icon('trash')),
        ] : null)));
    }
  };
  draw();
  mount(panel,
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('h2', 'Buttons, Links & Actions'), h('span', { class: 'muted small' }, `${actions.length} custom`),
        editable ? h('button', { class: 'btn btn-brand', onClick: () => actionModal(ctx) }, icon('plus'), 'New Action') : null),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', h('tr', h('th', 'Label'), h('th', 'Name'), h('th', 'Type'), h('th', 'Details'), h('th', 'Active'), h('th', ''))), tbody))),
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('h3', 'Standard Buttons'), h('span', { class: 'muted small' }, 'Built in — controlled by object and record permissions')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' }, h('thead', h('tr', h('th', 'Label'), h('th', 'Description'), h('th', 'Type'))),
        h('tbody', STANDARD_BUTTONS.map(([l, d]) => h('tr', h('td', l), h('td', { class: 'muted' }, d), h('td', badge('Standard')))))))));
}

function actionModal(ctx, action) {
  const { data } = ctx;
  const st = {
    label: action?.label || '', name: action?.name || '', actionType: action?.actionType || 'update', assignments: action?.assignments || [], fields: [...(action?.fields || [])],
    childObject: action?.childObject || '', lookupField: action?.lookupField || '', flowId: action?.flowId || '', url: action?.url || '',
    confirm: action?.confirm || '', successMessage: action?.successMessage || '', active: action ? action.active !== false : true,
  };
  let nameTouched = !!action;
  let assignEd = null;
  const nameIn = input(st.name, { placeholder: 'e.g. Close_Case', onInput: (v) => { st.name = v; nameTouched = true; } });
  const labelIn = input(st.label, { maxlength: 40, placeholder: 'e.g. Close Case', onInput: (v) => { st.label = v; if (!nameTouched) { st.name = apiFromLabel(v); nameIn.value = st.name; } } });
  const typeGrid = h('div', { class: 'om-action-types', role: 'radiogroup', 'aria-label': 'Action type' });
  const typeBody = h('div');

  const drawTypes = () => {
    clear(typeGrid);
    for (const t of TYPES) {
      typeGrid.appendChild(h('button', { type: 'button', class: ['om-type-card', st.actionType === t.value && 'active'], role: 'radio', 'aria-checked': String(st.actionType === t.value),
        onClick: () => { if (st.actionType === t.value) return; st.actionType = t.value; st.assignments = []; st.fields = []; drawTypes(); drawBody(); } },
      h('span', { class: 'om-type-icon' }, icon(t.icon)), h('span', { class: 'grow' }, h('span', { class: 'strong' }, t.label), h('span', { class: 'muted small om-type-desc' }, t.desc))));
    }
  };

  // Fields a user may be prompted for on the target object.
  const promptOptions = (objApi, mode, exclude) => (getObj(objApi)?.fields || [])
    .filter((f) => canEditField(f, mode) && f.apiName !== exclude)
    .map((f) => ({ value: f.apiName, label: f.label, meta: f.required ? 'Required' : '' }));

  function drawBody() {
    clear(typeBody);
    assignEd = null;
    if (st.actionType === 'update') {
      assignEd = assignmentsEditor({ targetObj: data.apiName, sourceObj: data.apiName, assignments: st.assignments, onChange: (v) => { st.assignments = v; }, title: 'Predefined Field Values' });
      typeBody.append(
        h('div', { class: 'section-title' }, 'Predefined Field Values'),
        h('div', { class: 'form-help mb-8' }, `Applied to the ${data.label} when the action runs. Formulas are evaluated against the current record.`),
        assignEd.el,
        h('div', { class: 'section-title' }, 'Fields to Ask the User'),
        h('div', { class: 'form-help mb-8' }, 'Shown in a dialog before the action runs, in this order.'),
        dualList({ options: promptOptions(data.apiName, 'edit'), selected: st.fields, height: 200, availableLabel: 'Available Fields', selectedLabel: 'Prompt Fields', onChange: (v) => { st.fields = v; } }).el);
    } else if (st.actionType === 'create') {
      const children = data.children.filter((c) => getObj(c.object));
      const opts = children.map((c) => ({ value: `${c.object}|${c.field}`, label: `${getObj(c.object).label} (via ${getObj(c.object).fields.find((f) => f.apiName === c.field)?.label || c.field})` }));
      if (!st.childObject && children[0]) { st.childObject = children[0].object; st.lookupField = children[0].field; }
      const sel = select(opts, st.childObject ? `${st.childObject}|${st.lookupField}` : '', (v) => {
        const [o, f] = v.split('|'); st.childObject = o; st.lookupField = f; st.assignments = []; st.fields = []; drawBody();
      }, { placeholder: children.length ? null : 'No related objects' });
      typeBody.append(h('div', { class: 'section-title' }, 'Target Object'),
        children.length ? h('div', { class: 'form-grid' },
          formRow('Object to Create', sel, { required: true, help: `Objects with a lookup or master-detail relationship to ${data.label}.` }),
          formRow('Relationship Field', input(getObj(st.childObject)?.fields.find((f) => f.apiName === st.lookupField)?.label || st.lookupField, { readOnly: true }),
            { help: `Automatically set to the current ${data.label}.` }))
          : h('div', { class: 'alert warning' }, icon('alert'), `No objects are related to ${data.label}. Create a lookup field on another object first.`));
      if (st.childObject) {
        assignEd = assignmentsEditor({ targetObj: st.childObject, sourceObj: data.apiName, assignments: st.assignments, onChange: (v) => { st.assignments = v; }, title: 'Predefined Field Values' });
        typeBody.append(
          h('div', { class: 'section-title' }, 'Predefined Field Values'),
          h('div', { class: 'form-help mb-8' }, `Values for the new ${getObj(st.childObject).label}. Formulas are evaluated against the current ${data.label}, e.g. Name & ' follow-up'.`),
          assignEd.el,
          h('div', { class: 'section-title' }, 'Fields to Ask the User'),
          dualList({ options: promptOptions(st.childObject, 'new', st.lookupField), selected: st.fields, height: 200, availableLabel: 'Available Fields', selectedLabel: 'Prompt Fields', onChange: (v) => { st.fields = v; } }).el);
      }
    } else if (st.actionType === 'flow') {
      const holder = h('div', spinner());
      typeBody.append(h('div', { class: 'section-title' }, 'Flow'), holder);
      GET(`/api/setup/meta/flow?object=${encodeURIComponent(data.apiName)}`).then((flows) => {
        const auto = flows.filter((f) => f.flowType === 'autolaunched');
        mount(holder, auto.length
          ? formRow('Flow', select(auto.map((f) => ({ value: f.id, label: `${f.label}${f.active ? '' : ' (inactive)'}` })), st.flowId, (v) => { st.flowId = v; }, { placeholder: '-- Select a flow --' }),
            { required: true, help: `Autolaunched flows on ${data.label}. The current record is passed as the triggering record.` })
          : h('div', { class: 'alert warning' }, icon('alert'), h('div', `No autolaunched flows exist for ${data.label}. `, h('a', { href: '#/setup/flows' }, 'Create one in Flows'), '.')));
      }).catch((e) => mount(holder, h('div', { class: 'alert danger' }, e.message)));
    } else {
      const urlIn = textarea(st.url, { rows: 2, placeholder: 'https://www.example.com/search?q={!Name}', onInput: (v) => { st.url = v; preview(); } });
      urlIn.classList.add('mono');
      const prev = h('div', { class: 'code-block om-url-preview' });
      const preview = () => { prev.textContent = (st.url || '').replace(/\{!([\w.]+)\}/g, (_, p) => `[${p}]`) || '—'; };
      preview();
      const mergeBtn = h('button', { type: 'button', class: 'btn btn-sm', onClick: (e) => showMenu(e.currentTarget, data.fields.filter((f) => f.type !== 'LongTextArea').map((f) => ({ label: f.label, meta: f.apiName, onClick: () => {
        const s = urlIn.selectionStart ?? urlIn.value.length;
        urlIn.value = urlIn.value.slice(0, s) + `{!${f.apiName}}` + urlIn.value.slice(urlIn.selectionEnd ?? s);
        st.url = urlIn.value; preview(); urlIn.focus();
      } })), { width: 320 }) }, icon('plus'), 'Insert Merge Field');
      typeBody.append(h('div', { class: 'section-title' }, 'URL'),
        h('div', { class: 'row mb-8' }, h('span', { class: 'grow form-label' }, 'URL Template *'), mergeBtn), urlIn,
        h('div', { class: 'form-help' }, 'Use merge fields like {!Name} or {!BillingCity}; values are URL-encoded when the action runs. The URL opens in a new tab.'),
        h('div', { class: 'form-label mt-8' }, 'Preview'), prev);
    }
  }

  drawTypes();
  drawBody();
  const body = h('div',
    h('div', { class: 'section-title' }, 'Action Information'),
    h('div', { class: 'form-grid' },
      formRow('Label', labelIn, { required: true, help: 'Button text on record pages.' }),
      formRow('Name', nameIn, { required: true, help: 'Unique API name.' })),
    h('div', { class: 'form-label' }, 'Action Type'), typeGrid, typeBody,
    h('div', { class: 'section-title' }, 'Messages & Status'),
    h('div', { class: 'form-grid' },
      formRow('Confirmation Message', input(st.confirm, { placeholder: 'e.g. Close this case?', onInput: (v) => { st.confirm = v; } }), { help: 'Optional. Asked before running the action.' }),
      formRow('Success Message', input(st.successMessage, { placeholder: 'e.g. Case closed', onInput: (v) => { st.successMessage = v; } }), { help: 'Shown in a toast when the action completes.' }),
      h('div', { class: 'span-2' }, checkbox('Active', st.active, (v) => { st.active = v; }, { help: 'Inactive actions are hidden from record pages.' }))));

  const saveBtn = h('button', { class: 'btn btn-brand', onClick: () => busy(saveBtn, save) }, 'Save');
  const m = modal({ title: action ? `Edit Action: ${action.label}` : 'New Action', size: 'lg', body, footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), saveBtn] });

  async function save() {
    m.setError('');
    if (!st.label.trim()) return m.setError('Label is required.');
    if (st.actionType === 'create' && !st.childObject) return m.setError('Choose the object to create.');
    if (st.actionType === 'flow' && !st.flowId) return m.setError('Choose a flow.');
    if (st.actionType === 'url' && !st.url.trim()) return m.setError('Enter a URL.');
    if (st.actionType === 'update' && !(assignEd?.get().length) && !st.fields.length) return m.setError('Set at least one field value or choose fields to ask the user for.');
    const payload = {
      object: data.apiName, label: st.label.trim(), name: (st.name || apiFromLabel(st.label)).trim(), actionType: st.actionType,
      assignments: ['update', 'create'].includes(st.actionType) ? (assignEd?.get() || []) : [], fields: ['update', 'create'].includes(st.actionType) ? st.fields : [],
      childObject: st.actionType === 'create' ? st.childObject : null, lookupField: st.actionType === 'create' ? st.lookupField : null,
      flowId: st.actionType === 'flow' ? st.flowId : null, url: st.actionType === 'url' ? st.url.trim() : '',
      confirm: st.confirm.trim(), successMessage: st.successMessage.trim(), active: st.active,
    };
    if (data.actions.some((a) => a.name === payload.name && a.id !== action?.id)) return m.setError(`An action named ${payload.name} already exists on ${data.label}.`);
    try {
      if (action) await PUT(`/api/setup/meta/action/${action.id}`, payload);
      else await POST('/api/setup/meta/action', payload);
      m.close();
      await ctx.app.refreshMeta();
      toast(`Action "${payload.label}" saved.`, 'success');
      await ctx.reload();
    } catch (e) { m.setError(e.message); }
  }
}
