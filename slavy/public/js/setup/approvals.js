// Setup › Approval Processes: list, editor (#/setup/approvals/new, #/setup/approvals/:id) with a visual summary.
import { h, icon, mount, clear, fmt, confirmDialog, toast, showMenu, badge, spinner, emptyState, debounce } from '../lib.js';
import { GET, POST, PUT, DEL, getObj, state, can } from '../api.js';
import { lookupInput } from '../fields.js';
import { formulaEditor } from '../components/formula.js';
import { assignmentsEditor } from '../components/assignments.js';
import { setupHeader } from './index.js';

const APPROVER_KINDS = {
  manager: { label: 'Submitter’s manager', desc: 'The Manager on the submitting user’s record.' },
  ownerManager: { label: 'Record owner’s manager', desc: 'The Manager of the user who owns the record.' },
  user: { label: 'A specific user', desc: 'Always route to the same person.' },
  queue: { label: 'A queue', desc: 'Any member of the queue can approve or reject.' },
};

const ACTION_SETS = [
  ['onSubmit', 'Initial Submission Actions', 'Field updates applied when the record is submitted (the record is then locked for approval).', 'upload'],
  ['onApprove', 'Final Approval Actions', 'Field updates applied when the request is approved.', 'check'],
  ['onReject', 'Final Rejection Actions', 'Field updates applied when the request is rejected.', 'x'],
  ['onRecall', 'Recall Actions', 'Field updates applied when the submitter recalls the request.', 'refresh'],
];

function approverText(a, names = {}) {
  if (!a || a.kind === 'manager' || !a.kind) return 'Submitter’s manager';
  if (a.kind === 'ownerManager') return 'Record owner’s manager';
  if (a.kind === 'user') return names[a.id] ? `User: ${names[a.id]}` : 'Specific user';
  if (a.kind === 'queue') return names[a.id] ? `Queue: ${names[a.id]}` : 'Queue';
  return a.kind;
}

export default async function approvalsPage(container, { segments, app }) {
  const sub = segments[0];
  if (sub) return renderEditor(container, { id: sub === 'new' ? null : sub, app });
  return renderList(container, { app });
}

async function loadNames() {
  const [users, groups] = await Promise.all([GET('/api/users').catch(() => []), GET('/api/setup/meta/group').catch(() => [])]);
  const names = Object.fromEntries(users.map((u) => [u.Id, u.Name]));
  for (const g of groups) names[g.id] = g.label || g.name;
  return { names, users, queues: groups.filter((g) => g.kind === 'queue') };
}

async function renderList(container, { app }) {
  app.setTitle('Approval Processes');
  const editable = can('CustomizeApplication');
  const body = h('div', spinner());
  let term = '';
  const search = h('input', { class: 'input input-sm', placeholder: 'Search processes...', 'aria-label': 'Search approval processes', onInput: () => { term = search.value.trim().toLowerCase(); draw(); } });
  mount(container,
    setupHeader('Approval Processes', {
      crumb: 'Setup › Process Automation', iconName: 'approval',
      description: 'Route records to managers, users or queues for approval, and update fields when requests are submitted, approved, rejected or recalled.',
      actions: editable ? [h('a', { class: 'btn btn-brand', href: '#/setup/approvals/new' }, icon('plus'), 'New Approval Process')] : [],
    }),
    h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'All Approval Processes'), h('div', { class: 'input-group', style: { width: '240px' } }, icon('search'), search)), body));

  let list = [];
  let names = {};
  try {
    [list, { names }] = await Promise.all([GET('/api/setup/meta/approvalProcess'), loadNames()]);
  } catch (e) { mount(body, emptyState('Couldn’t load approval processes', e.message, { iconName: 'alert' })); return; }

  async function setActive(p, active) {
    try { Object.assign(p, await PUT(`/api/setup/meta/approvalProcess/${p.id}`, { ...p, active })); toast(`“${p.label}” ${active ? 'activated' : 'deactivated'}.`, 'success'); } catch (e) { toast(e.message, 'error'); }
    draw();
  }
  async function remove(p) {
    if (!(await confirmDialog(h('div', 'Delete the approval process ', h('strong', p.label), '? Pending requests keep their current status.'), { title: 'Delete Approval Process', confirmLabel: 'Delete', danger: true }))) return;
    try { await DEL(`/api/setup/meta/approvalProcess/${p.id}`); list = list.filter((x) => x.id !== p.id); toast('Approval process deleted.', 'success'); draw(); } catch (e) { toast(e.message, 'error'); }
  }

  function draw() {
    if (!list.length) {
      mount(body, emptyState('No approval processes', 'Create one to require sign-off on discounts, contracts or large deals.', { iconName: 'approval', action: editable ? h('a', { class: 'btn btn-brand', href: '#/setup/approvals/new' }, icon('plus'), 'New Approval Process') : null }));
      return;
    }
    const shown = list.filter((p) => !term || [p.label, p.name, p.object, getObj(p.object)?.label, p.description].some((x) => String(x || '').toLowerCase().includes(term)))
      .sort((a, b) => (getObj(a.object)?.label || '').localeCompare(getObj(b.object)?.label || '') || (a.order ?? 0) - (b.order ?? 0));
    if (!shown.length) { mount(body, emptyState('No matching processes', 'Try a different search.')); return; }
    mount(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', h('tr', h('th', 'Process Name'), h('th', 'Object'), h('th', 'Entry Criteria'), h('th', 'Approver'), h('th', { class: 'num' }, 'Order'), h('th', 'Active'), h('th', 'Last Modified'), h('th', { style: { width: '44px' } }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', shown.map((p) => {
        const o = getObj(p.object);
        const toggle = h('input', { type: 'checkbox', checked: !!p.active, disabled: !editable, 'aria-label': `Active: ${p.label}`, onChange: () => setActive(p, toggle.checked) });
        return h('tr',
          h('td', h('a', { class: 'strong', href: `#/setup/approvals/${p.id}` }, p.label), p.description ? h('div', { class: 'tiny muted truncate', style: { maxWidth: '300px' } }, p.description) : null),
          h('td', o ? h('span', { class: 'row gap-4' }, h('span', { class: 'obj-icon sm', style: { background: o.color } }, o.icon || o.label[0]), o.label) : p.object),
          h('td', p.entryCriteria ? h('code', { class: 'small', title: p.entryCriteria }, p.entryCriteria) : h('span', { class: 'muted small' }, 'All records')),
          h('td', { class: 'small' }, approverText(p.approver, names)),
          h('td', { class: 'num' }, String(p.order ?? 0)),
          h('td', h('label', { class: 'switch' }, toggle, h('span'))),
          h('td', { class: 'small', title: fmt.datetime(p.updatedAt) }, fmt.date(p.updatedAt)),
          h('td', h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': `Actions for ${p.label}`, onClick: (e) => showMenu(e.currentTarget, [
            { label: editable ? 'Edit' : 'View', icon: 'edit', href: `#/setup/approvals/${p.id}` },
            editable ? { label: p.active ? 'Deactivate' : 'Activate', icon: p.active ? 'x' : 'check', onClick: () => setActive(p, !p.active) } : null,
            editable ? 'sep' : null,
            editable ? { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove(p) } : null,
          ], { align: 'right' }) }, icon('more'))));
      })))));
  }
  draw();
}

async function renderEditor(container, { id, app }) {
  const editable = can('CustomizeApplication');
  mount(container, spinner());
  const [loaded, { names, queues }] = await Promise.all([id ? GET(`/api/setup/meta/approvalProcess/${encodeURIComponent(id)}`) : null, loadNames()]);
  const firstObj = [...state.objects.values()].find((o) => o.fields.some((f) => f.apiName === 'Approval_Status__c'))?.apiName || 'Opportunity';
  const p = loaded ? structuredClone(loaded) : {
    label: '', name: '', object: firstObj, description: '', entryCriteria: '', approver: { kind: 'manager' },
    onSubmit: [], onApprove: [], onReject: [], onRecall: [], active: true, order: 1,
  };
  p.approver ||= { kind: 'manager' };
  let dirty = false;
  let apiTouched = !!loaded;
  app.setTitle(loaded ? `${p.label} | Approval Process` : 'New Approval Process');

  const errBox = h('div', { class: 'alert danger mb-16 hidden' });
  const diagram = h('div', { class: 'ap-diagram' });
  const formWrap = h('div');
  const saveBtn = h('button', { class: 'btn btn-brand', onClick: () => save(), disabled: !editable }, icon('check'), 'Save');
  const touch = () => { dirty = true; drawDiagramSoon(); };
  const drawDiagramSoon = debounce(() => drawDiagram(), 150);

  mount(container,
    setupHeader(loaded ? p.label : 'New Approval Process', {
      crumb: h('span', h('a', { href: '#/setup/approvals' }, 'Approval Processes'), ' › ', loaded ? 'Edit' : 'New'), iconName: 'approval',
      actions: [
        loaded && editable ? h('button', { class: 'btn', onClick: remove }, icon('trash'), 'Delete') : null,
        h('button', { class: 'btn', onClick: cancel }, 'Cancel'),
        editable ? saveBtn : null,
      ],
    }),
    !editable ? h('div', { class: 'alert warning mb-16' }, icon('lock'), h('div', 'You need the “Customize Application” permission to change approval processes.')) : null,
    errBox,
    h('div', { class: 'ap-layout' }, formWrap, h('div', { class: 'ap-side' }, h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Process Overview')), h('div', { class: 'card-body' }, diagram)))));

  async function cancel() {
    if (dirty && editable && !(await confirmDialog('Discard your unsaved changes?', { title: 'Discard changes?', confirmLabel: 'Discard', danger: true }))) return;
    app.navigate('/setup/approvals');
  }

  async function remove() {
    if (!(await confirmDialog(h('div', 'Delete the approval process ', h('strong', p.label), '?'), { title: 'Delete Approval Process', confirmLabel: 'Delete', danger: true }))) return;
    try { await DEL(`/api/setup/meta/approvalProcess/${p.id}`); toast('Approval process deleted.', 'success'); app.navigate('/setup/approvals'); } catch (e) { toast(e.message, 'error'); }
  }

  async function save() {
    errBox.classList.add('hidden');
    if (!p.label.trim()) { showErr('Process Name is required.'); return; }
    if (p.approver.kind === 'user' && !p.approver.id) { showErr('Choose the user who approves requests.'); return; }
    if (p.approver.kind === 'queue' && !p.approver.id) { showErr('Choose the queue that approves requests.'); return; }
    const body = { ...p };
    for (const [k] of ACTION_SETS) body[k] = (p[k] || []).filter((a) => a.field).map((a) => ({ field: a.field, value: a.value ?? '', isFormula: !!a.isFormula }));
    body.approver = ['user', 'queue'].includes(p.approver.kind) ? { kind: p.approver.kind, id: p.approver.id } : { kind: p.approver.kind };
    for (const k of ['id', 'type', 'createdAt', 'updatedAt', 'createdBy']) delete body[k];
    saveBtn.disabled = true;
    try {
      const res = loaded ? await PUT(`/api/setup/meta/approvalProcess/${p.id}`, body) : await POST('/api/setup/meta/approvalProcess', body);
      dirty = false;
      toast(`Approval process “${res.label}” saved.`, 'success');
      app.navigate('/setup/approvals');
    } catch (e) { showErr(e.message); } finally { saveBtn.disabled = !editable; }
  }

  function showErr(msg) {
    mount(errBox, icon('alert'), h('div', msg));
    errBox.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function drawDiagram() {
    const o = getObj(p.object);
    const n = (k) => (p[k] || []).filter((a) => a.field).length;
    const fieldList = (k) => (p[k] || []).filter((a) => a.field).map((a) => o?.fieldMap.get(a.field)?.label || a.field);
    const step = (cls, ic, title, sub, extra) => h('div', { class: `ap-step ${cls}` }, h('span', { class: 'ap-step-icon' }, icon(ic, { size: 15 })), h('div', { class: 'grow' }, h('div', { class: 'strong' }, title), sub ? h('div', { class: 'small muted' }, sub) : null, extra));
    const updates = (k) => n(k) ? h('div', { class: 'tiny ap-updates' }, icon('edit', { size: 11 }), fieldList(k).join(', ')) : h('div', { class: 'tiny muted' }, 'No field updates');
    mount(diagram,
      step('ap-submit', 'upload', 'Record submitted', p.entryCriteria ? h('span', 'when ', h('code', p.entryCriteria)) : `Any ${o?.label || p.object} record`, updates('onSubmit')),
      h('div', { class: 'ap-arrow' }),
      step('ap-approver', APPROVER_ICON[p.approver.kind] || 'user', 'Approval request', approverText(p.approver, names), h('div', { class: 'tiny muted' }, 'Approver is notified in the bell menu and on Approval Requests')),
      h('div', { class: 'ap-split' },
        h('div', { class: 'ap-branch' }, h('div', { class: 'ap-arrow' }), step('ap-approved', 'check', 'Approved', null, updates('onApprove'))),
        h('div', { class: 'ap-branch' }, h('div', { class: 'ap-arrow' }), step('ap-rejected', 'x', 'Rejected', null, updates('onReject')))),
      h('div', { class: 'ap-recall' }, icon('refresh', { size: 13 }), h('div', h('strong', 'Recall: '), n('onRecall') ? fieldList('onRecall').join(', ') : 'no field updates')),
      h('div', { class: ['ap-status', p.active ? 'on' : 'off'] }, h('span', { class: 'dot' }), p.active ? 'Active — users can submit records' : 'Inactive'));
  }

  function drawForm() {
    const objects = [...state.objects.values()].sort((a, b) => a.label.localeCompare(b.label));
    const field = (label, control, { help, required } = {}) => h('div', { class: 'form-row' }, h('label', { class: 'form-label' }, required ? h('span', { class: 'req' }, '*') : null, label), control, help ? h('div', { class: 'form-help' }, help) : null);
    const api = h('input', { class: 'input', value: p.name, placeholder: 'Generated from the name', onInput: () => { apiTouched = true; p.name = api.value; touch(); } });
    const label = h('input', { class: 'input', value: p.label, placeholder: 'e.g. Discount Approval', onInput: () => { p.label = label.value; if (!apiTouched) { p.name = label.value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); api.value = p.name; } touch(); } });
    const objSel = h('select', { class: 'input', disabled: !!loaded, onChange: () => {
      p.object = objSel.value; p.entryCriteria = '';
      for (const [k] of ACTION_SETS) p[k] = [];
      touch(); drawForm(); drawDiagram();
    } }, objects.map((o) => h('option', { value: o.apiName, selected: o.apiName === p.object }, o.label)));
    const desc = h('textarea', { class: 'input', rows: 2, onInput: () => { p.description = desc.value; touch(); } });
    desc.value = p.description || '';
    const order = h('input', { class: 'input', type: 'number', min: 0, value: p.order ?? 0, onInput: () => { p.order = Number(order.value) || 0; touch(); } });
    const active = h('input', { type: 'checkbox', checked: !!p.active, onChange: () => { p.active = active.checked; touch(); } });

    const fe = formulaEditor({ objApi: p.object, value: p.entryCriteria, rows: 3, onChange: (v) => { p.entryCriteria = v; touch(); }, placeholder: 'e.g. Amount >= 100000' });

    const approverWrap = h('div');
    const drawApprover = () => {
      clear(approverWrap);
      approverWrap.appendChild(h('div', { class: 'ap-kinds', role: 'radiogroup' }, Object.entries(APPROVER_KINDS).map(([k, d]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(p.approver.kind === k), class: ['ap-kind', p.approver.kind === k && 'active'],
        onClick: () => { if (p.approver.kind !== k) { p.approver = { kind: k }; touch(); drawApprover(); drawDiagram(); } },
      }, h('span', { class: 'ap-kind-icon' }, icon(APPROVER_ICON[k], { size: 16 })), h('div', { class: 'grow' }, h('div', { class: 'strong' }, d.label), h('div', { class: 'tiny muted' }, d.desc))))));
      if (p.approver.kind === 'user') {
        const li = lookupInput({ objects: ['User'], value: p.approver.id || null, label: names[p.approver.id], placeholder: 'Search users...', onChange: (v) => { p.approver.id = v; touch(); drawDiagram(); } });
        approverWrap.appendChild(field('Approver', li.el, { required: true }));
      } else if (p.approver.kind === 'queue') {
        if (!queues.length) approverWrap.appendChild(h('div', { class: 'alert warning mt-8' }, icon('alert'), h('div', 'There are no queues yet. Create one in ', h('a', { href: '#/setup/groups' }, 'Public Groups & Queues'), '.')));
        else {
          const sel = h('select', { class: 'input', onChange: () => { p.approver.id = sel.value || undefined; touch(); drawDiagram(); } },
            h('option', { value: '' }, '-- Select a queue --'), queues.map((q) => h('option', { value: q.id, selected: q.id === p.approver.id }, q.label || q.name)));
          approverWrap.appendChild(field('Queue', sel, { required: true }));
        }
      } else {
        approverWrap.appendChild(h('div', { class: 'form-help mt-8' }, 'If the user has no manager, submission fails with a clear message. Set managers in Setup › Users.'));
      }
    };
    drawApprover();

    const actionCards = ACTION_SETS.map(([k, title, help, ic]) => {
      const count = badge(String((p[k] || []).filter((a) => a.field).length), 'brand');
      return h('div', { class: 'card' },
        h('div', { class: 'card-header' }, h('span', { class: `ap-action-icon ${k}` }, icon(ic, { size: 14 })), h('h3', title), count),
        h('div', { class: 'card-body' }, h('div', { class: 'form-help mb-8' }, help),
          assignmentsEditor({ targetObj: p.object, sourceObj: p.object, assignments: p[k] || [], title: 'Field Updates', onChange: (l) => { p[k] = l; count.textContent = String(l.filter((a) => a.field).length); touch(); } }).el));
    });

    mount(formWrap,
      h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Process Details')), h('div', { class: 'card-body' },
        h('div', { class: 'form-grid' },
          field('Process Name', label, { required: true }),
          field('API Name', api),
          field('Object', objSel, { required: true, help: loaded ? 'The object can’t be changed after the process is created.' : null }),
          field('Order', order, { help: 'When several processes match, the lowest order wins.' }),
          h('div', { class: 'form-row span-2' }, h('label', { class: 'form-label' }, 'Description'), desc),
          h('div', { class: 'form-row' }, h('label', { class: 'row' }, h('span', { class: 'switch' }, active, h('span')), h('span', 'Active')))))),
      h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Entry Criteria')), h('div', { class: 'card-body' },
        h('div', { class: 'form-help mb-8' }, 'Records must meet this formula to be submitted. Leave blank to allow every record.'), fe.el)),
      h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Assigned Approver')), h('div', { class: 'card-body' }, approverWrap)),
      ...actionCards);
  }

  drawForm();
  drawDiagram();
  const onBeforeUnload = (e) => { if (dirty && editable) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onBeforeUnload);
  return () => window.removeEventListener('beforeunload', onBeforeUnload);
}

const APPROVER_ICON = { manager: 'user', ownerManager: 'users', user: 'user', queue: 'users' };
