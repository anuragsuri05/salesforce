// Object detail: header + sub-navigation, Details / Automation / Sharing tabs. Other tabs live in sibling modules.
import { h, icon, mount, clear, spinner, emptyState, modal, toast, objIcon, badge, fmt } from '../../lib.js';
import { GET, PATCH, DEL } from '../../api.js';
import {
  canCustomize, formRow, input, textarea, select, checkbox, iconColorPicker, dualList, kv, yesNo, SHARING_MODELS, sharingLabel, busy,
} from './common.js';

const TABS = [
  { id: 'details', label: 'Details', icon: 'info' },
  { id: 'fields', label: 'Fields & Relationships', icon: 'list', load: () => import('./fields.js') },
  { id: 'layout', label: 'Page Layout', icon: 'dashboard', load: () => import('./layout.js') },
  { id: 'rules', label: 'Validation Rules', icon: 'shield', load: () => import('./rules.js') },
  { id: 'actions', label: 'Buttons, Links & Actions', icon: 'zap', load: () => import('./actions.js') },
  { id: 'automation', label: 'Flows & Automation', icon: 'flow' },
  { id: 'sharing', label: 'Sharing', icon: 'lock' },
];

export default async function objectDetail(container, { segments, app }) {
  const [apiName, tabId = 'details', ...rest] = segments;
  const tab = TABS.find((t) => t.id === tabId) || TABS[0];
  mount(container, spinner());
  let data;
  try {
    data = await GET(`/api/setup/objects/${encodeURIComponent(apiName)}`);
  } catch (e) {
    mount(container, h('div', { class: 'card p-24' }, emptyState(e.status === 404 ? 'Object not found' : 'Could not load object', e.message, { iconName: 'alert',
      action: h('a', { class: 'btn', href: '#/setup/objects' }, icon('chevronLeft'), 'Back to Object Manager') })));
    return;
  }
  app.setTitle(`${data.label} | Object Manager`);
  const base = `#/setup/objects/${encodeURIComponent(data.apiName)}`;
  const counts = { fields: data.fields.length, rules: data.validationRules.length, actions: data.actions.length, automation: data.flows.length + data.approvalProcesses.length };

  const header = h('div', { class: 'om-obj-header card' },
    h('div', { class: 'row gap-12' },
      objIcon(data, 'lg'),
      h('div', { class: 'grow' },
        h('div', { class: 'crumb small' }, h('a', { href: '#/setup/objects' }, 'Object Manager'), ' › ', data.label),
        h('h1', { class: 'row gap-8' }, data.label, data.isCustom ? badge('Custom', 'brand') : badge('Standard')),
        h('div', { class: 'muted small mono' }, data.apiName)),
      h('a', { class: 'btn', href: `#/o/${encodeURIComponent(data.apiName)}` }, icon('external'), 'View Records')));

  const nav = h('nav', { class: 'om-subnav card', 'aria-label': 'Object settings' },
    TABS.map((t) => h('a', { href: `${base}/${t.id}`, class: t.id === tab.id ? 'active' : '', 'aria-current': t.id === tab.id ? 'page' : null },
      icon(t.icon), h('span', { class: 'grow' }, t.label), counts[t.id] != null ? h('span', { class: 'om-count' }, counts[t.id]) : null)));
  const panel = h('div', { class: 'om-panel' }, spinner());
  mount(container, header, h('div', { class: 'om-detail' }, nav, panel));

  const ctx = {
    data, app, base, editable: canCustomize(), segments: rest,
    // Reload the object definition and re-render the whole detail page (keeps the URL).
    async reload() { await objectDetail(container, { segments, app }); },
  };
  try {
    if (tab.load) {
      const mod = await tab.load();
      clear(panel);
      await mod.default(panel, ctx);
    } else {
      clear(panel);
      ({ details: renderDetails, automation: renderAutomation, sharing: renderSharing })[tab.id](panel, ctx);
    }
  } catch (e) {
    console.error(e);
    mount(panel, h('div', { class: 'card p-24' }, emptyState('Could not load this section', e.message, { iconName: 'alert' })));
  }
}

// ---------- Details ----------
function renderDetails(panel, ctx) {
  const { data, editable } = ctx;
  const nameF = data.fields.find((f) => f.apiName === 'Name');
  const lbl = (api) => data.fields.find((f) => f.apiName === api)?.label || api;
  const chips = (list) => (list?.length ? h('div', { class: 'row wrap gap-4' }, list.map((x) => h('span', { class: 'chip' }, lbl(x)))) : null);
  mount(panel,
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('h2', 'Details'),
        editable ? h('button', { class: 'btn', onClick: () => editObjectModal(ctx) }, icon('edit'), 'Edit') : null,
        editable && data.isCustom ? h('button', { class: 'btn btn-danger', onClick: () => deleteObjectModal(ctx) }, icon('trash'), 'Delete') : null),
      h('div', { class: 'card-body' },
        h('div', { class: 'om-kv-grid' },
          kv('Label', data.label), kv('Plural Label', data.pluralLabel),
          kv('API Name', h('span', { class: 'mono' }, data.apiName)), kv('Key Prefix', h('span', { class: 'mono' }, data.keyPrefix)),
          kv('Type', data.isCustom ? 'Custom Object' : 'Standard Object'), kv('Record Name', `${nameF?.label || 'Name'} (${data.nameField?.type === 'AutoNumber' ? `Auto Number: ${data.nameField.format || ''}` : 'Text'})`),
          kv('Default Sharing (OWD)', sharingLabel(data.sharingModel)), kv('Icon', h('span', { class: 'row gap-8' }, objIcon(data, 'sm'), h('span', { class: 'mono small' }, data.color || ''))),
          kv('Track Field History', yesNo(data.trackHistory)), kv('Allow Activities', yesNo(data.enableActivities !== false)),
          kv('Chatter Feed', yesNo(data.enableFeed !== false)), kv('Allow Search', yesNo(data.searchable !== false)),
          kv('Compact Layout (Highlights)', chips(data.highlightFields)), kv('Path Field', data.pathField ? lbl(data.pathField) : null),
          kv('Default List View Columns', chips(data.listColumns)), kv('Description', data.description ? h('span', { class: 'pre-wrap' }, data.description) : null)))),
    h('div', { class: 'grid-3 mt-16' },
      statCard('Fields', data.fields.length, 'list', `${ctx.base}/fields`),
      statCard('Validation Rules', data.validationRules.length, 'shield', `${ctx.base}/rules`),
      statCard('Actions', data.actions.length, 'zap', `${ctx.base}/actions`)));
}

function statCard(label, n, ic, href) {
  return h('a', { class: 'card om-stat', href }, h('div', { class: 'om-stat-icon' }, icon(ic)), h('div', h('div', { class: 'om-stat-n' }, fmt.number(n, 0)), h('div', { class: 'muted small' }, label)));
}

function editObjectModal(ctx) {
  const { data } = ctx;
  const nameF = data.fields.find((f) => f.apiName === 'Name');
  const st = {
    label: data.label, pluralLabel: data.pluralLabel, description: data.description || '', sharingModel: data.sharingModel || 'ReadWrite',
    trackHistory: !!data.trackHistory, enableActivities: data.enableActivities !== false, enableFeed: data.enableFeed !== false, searchable: data.searchable !== false,
    icon: data.icon || '', color: data.color || '#64748b', highlightFields: [...(data.highlightFields || [])], pathField: data.pathField || '',
    listColumns: [...(data.listColumns || [])], nameLabel: nameF?.label || data.nameField?.label || '', nameType: data.nameField?.type === 'AutoNumber' ? 'AutoNumber' : 'Text',
    format: data.nameField?.format || '{0000}',
  };
  const hasMD = data.fields.some((f) => f.type === 'MasterDetail');
  const fieldOpts = data.fields.filter((f) => f.type !== 'Id' && f.type !== 'LongTextArea').map((f) => ({ value: f.apiName, label: f.label, meta: f.apiName }));
  const picklists = data.fields.filter((f) => f.type === 'Picklist');
  const picker = iconColorPicker({ iconText: st.icon, color: st.color, label: () => st.label, onChange: (v) => { st.icon = v.icon; st.color = v.color; } });
  const fmtRow = h('div', { class: st.nameType === 'AutoNumber' ? '' : 'hidden' }, formRow('Display Format', input(st.format, { onInput: (v) => { st.format = v; } }), { help: 'e.g. INV-{0000} or {YYYY}-{00000}' }));

  const body = h('div',
    h('div', { class: 'section-title' }, 'Object Information'),
    h('div', { class: 'form-grid' },
      formRow('Label', input(st.label, { onInput: (v) => { st.label = v; picker.refresh(); } }), { required: true }),
      formRow('Plural Label', input(st.pluralLabel, { onInput: (v) => { st.pluralLabel = v; } }), { required: true }),
      formRow('Record Name Label', input(st.nameLabel, { onInput: (v) => { st.nameLabel = v; } }), { required: true }),
      formRow('Record Name Data Type', select([{ value: 'Text', label: 'Text' }, { value: 'AutoNumber', label: 'Auto Number' }], st.nameType, (v) => { st.nameType = v; fmtRow.classList.toggle('hidden', v !== 'AutoNumber'); }),
        { help: 'Can only be changed while the object has no records.' }),
      fmtRow,
      formRow('Description', textarea(st.description, { rows: 2, onInput: (v) => { st.description = v; } }), { span: true })),
    h('div', { class: 'section-title' }, 'Features & Sharing'),
    h('div', { class: 'form-grid' },
      formRow('Default Internal Access (OWD)', select(SHARING_MODELS.filter((s) => s.value !== 'ControlledByParent' || hasMD || st.sharingModel === s.value), st.sharingModel, (v) => { st.sharingModel = v; })),
      formRow('Icon & Color', picker.el),
      h('div', { class: 'om-options span-2' },
        checkbox('Track Field History', st.trackHistory, (v) => { st.trackHistory = v; }),
        checkbox('Allow Activities', st.enableActivities, (v) => { st.enableActivities = v; }),
        checkbox('Enable Chatter Feed', st.enableFeed, (v) => { st.enableFeed = v; }),
        checkbox('Allow Search', st.searchable, (v) => { st.searchable = v; }))),
    h('div', { class: 'section-title' }, 'Compact Layout (Highlights Panel)'),
    h('div', { class: 'form-help mb-8' }, 'Up to 6 fields shown in the record header. Double-click to add or remove; use the arrows to reorder.'),
    dualList({ options: fieldOpts, selected: st.highlightFields, max: 6, height: 200, availableLabel: 'Available Fields', selectedLabel: 'Highlight Fields', onChange: (v) => { st.highlightFields = v; } }).el,
    h('div', { class: 'section-title' }, 'Path'),
    formRow('Path Field', select(picklists.map((f) => ({ value: f.apiName, label: f.label })), st.pathField, (v) => { st.pathField = v; }, { placeholder: '--None--' }),
      { help: picklists.length ? 'A guided path of the picklist values is shown at the top of record pages.' : 'This object has no picklist fields.' }),
    h('div', { class: 'section-title' }, 'Default List View Columns'),
    dualList({ options: fieldOpts, selected: st.listColumns, height: 200, availableLabel: 'Available Fields', selectedLabel: 'Columns', onChange: (v) => { st.listColumns = v; } }).el);

  const saveBtn = h('button', { class: 'btn btn-brand', onClick: () => busy(saveBtn, save) }, 'Save');
  const m = modal({ title: `Edit ${data.label}`, size: 'lg', body, footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), saveBtn] });
  async function save() {
    m.setError('');
    if (!st.label.trim() || !st.pluralLabel.trim()) return m.setError('Label and plural label are required.');
    try {
      const patch = {
        label: st.label.trim(), pluralLabel: st.pluralLabel.trim(), description: st.description, sharingModel: st.sharingModel, trackHistory: st.trackHistory,
        enableActivities: st.enableActivities, enableFeed: st.enableFeed, searchable: st.searchable, icon: st.icon || st.label[0], color: st.color,
        highlightFields: st.highlightFields, listColumns: st.listColumns,
        nameField: { ...(data.nameField || {}), label: st.nameLabel || `${st.label} Name`, type: st.nameType, ...(st.nameType === 'AutoNumber' ? { format: st.format || '{0000}' } : {}) },
      };
      if (st.pathField || data.pathField) patch.pathField = st.pathField || '';
      if (patch.nameField.type !== 'AutoNumber') delete patch.nameField.format;
      await PATCH(`/api/setup/objects/${data.apiName}`, patch);
      m.close();
      await ctx.app.refreshMeta();
      toast('Object updated.', 'success');
      await ctx.reload();
    } catch (e) { m.setError(e.message); }
  }
}

function deleteObjectModal(ctx) {
  const { data } = ctx;
  const inp = input('', { placeholder: data.apiName, ariaLabel: 'Type the object API name to confirm' });
  const delBtn = h('button', { class: 'btn btn-danger', disabled: true, onClick: () => busy(delBtn, del) }, icon('trash'), 'Delete Object');
  inp.addEventListener('input', () => { delBtn.disabled = inp.value.trim() !== data.apiName; });
  const m = modal({
    title: `Delete ${data.label}?`, size: 'sm',
    body: h('div',
      h('div', { class: 'alert danger mb-16' }, icon('alert'), h('div', 'This permanently deletes the object, all of its fields, records, page layout, validation rules, actions and automation. This cannot be undone.')),
      formRow(h('span', 'Type ', h('strong', { class: 'mono' }, data.apiName), ' to confirm'), inp)),
    footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), delBtn],
  });
  async function del() {
    try {
      await DEL(`/api/setup/objects/${data.apiName}`);
      m.close();
      await ctx.app.refreshMeta();
      toast(`${data.label} deleted.`, 'success');
      ctx.app.navigate('/setup/objects');
    } catch (e) { m.setError(e.message); }
  }
}

// ---------- Flows & Automation ----------
function renderAutomation(panel, ctx) {
  const { data } = ctx;
  const flowType = (f) => (f.flowType === 'record' ? `Record-Triggered (${f.timing === 'before' ? 'Before Save' : 'After Save'})` : f.flowType === 'scheduled' ? 'Scheduled' : 'Autolaunched');
  const status = (a) => (a ? badge('Active', 'success') : badge('Inactive'));
  mount(panel,
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('h2', 'Flows'), h('a', { class: 'btn btn-sm', href: '#/setup/flows' }, icon('flow'), 'Manage Flows')),
      data.flows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', h('tr', h('th', 'Flow Label'), h('th', 'Type'), h('th', 'Trigger'), h('th', 'Version'), h('th', 'Status'), h('th', 'Last Modified'))),
        h('tbody', data.flows.map((f) => h('tr',
          h('td', h('a', { href: `#/setup/flows/${f.id}` }, f.label || f.name)), h('td', flowType(f)),
          h('td', f.flowType === 'record' ? ({ create: 'Created', update: 'Updated', createOrUpdate: 'Created or Updated', delete: 'Deleted' }[f.trigger] || f.trigger) : '—'),
          h('td', f.version || 1), h('td', status(f.active)), h('td', { class: 'muted' }, fmt.datetime(f.updatedAt)))))))
        : emptyState('No flows', `No flows run on ${data.pluralLabel} yet.`, { iconName: 'flow' })),
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('h2', 'Approval Processes'), h('a', { class: 'btn btn-sm', href: '#/setup/approvals' }, icon('approval'), 'Manage Approvals')),
      data.approvalProcesses.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', h('tr', h('th', 'Process Name'), h('th', 'Entry Criteria'), h('th', 'Order'), h('th', 'Status'))),
        h('tbody', data.approvalProcesses.map((p) => h('tr',
          h('td', h('a', { href: `#/setup/approvals/${p.id}` }, p.label || p.name)), h('td', { class: 'mono small', title: p.entryCriteria || '' }, p.entryCriteria || h('span', { class: 'muted' }, 'All records')),
          h('td', p.order || 0), h('td', status(p.active)))))))
        : emptyState('No approval processes', `No approval processes are defined for ${data.pluralLabel}.`, { iconName: 'approval' })));
}

// ---------- Sharing ----------
function renderSharing(panel, ctx) {
  const { data } = ctx;
  const desc = {
    Private: 'Only the record owner, and users above them in the role hierarchy, can view and edit records.',
    Read: 'All users can view records, but only the owner and users above them in the role hierarchy can edit.',
    ReadWrite: 'All users can view and edit all records.',
    ControlledByParent: 'Access is determined by the master record in the master-detail relationship.',
  }[data.sharingModel || 'ReadWrite'];
  mount(panel,
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('h2', 'Organization-Wide Default'), h('a', { class: 'btn btn-sm', href: '#/setup/sharing' }, icon('lock'), 'Sharing Settings')),
      h('div', { class: 'card-body' },
        h('div', { class: 'row gap-12' }, h('div', { class: 'om-stat-icon' }, icon('lock')),
          h('div', h('div', { class: 'strong' }, sharingLabel(data.sharingModel)), h('div', { class: 'muted small' }, desc))),
        ctx.editable ? h('div', { class: 'form-help mt-16' }, 'Change the default access from the Details tab (Edit) or in Sharing Settings.') : null)),
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('h2', 'Sharing Rules'), h('span', { class: 'muted small' }, `${data.sharingRules.length} rule${data.sharingRules.length === 1 ? '' : 's'}`)),
      data.sharingRules.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', h('tr', h('th', 'Label'), h('th', 'Rule Type'), h('th', 'Access'), h('th', 'Status'))),
        h('tbody', data.sharingRules.map((r) => h('tr', h('td', h('a', { href: '#/setup/sharing' }, r.label)), h('td', r.ruleType === 'criteria' ? 'Based on criteria' : 'Based on record owner'),
          h('td', r.access === 'edit' ? 'Read/Write' : 'Read Only'), h('td', r.active !== false ? badge('Active', 'success') : badge('Inactive')))))))
        : emptyState('No sharing rules', 'Sharing rules open up access beyond the organization-wide default.', { iconName: 'share' })));
}
