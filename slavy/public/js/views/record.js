// Record page: header & actions, highlights, path, details (inline edit), related lists, history,
// approvals, activity timeline + composer, chatter feed, quick actions, lead convert, sharing.
import {
  h, icon, mount, clear, fmt, modal, confirmDialog, promptDialog, toast, showMenu, objIcon, avatar, spinner, emptyState, tabs, store,
} from '../lib.js';
import { GET, POST, PATCH, DEL, getObj, objForId, can, me, state, ApiError } from '../api.js';
import { displayValue, fieldInput, canEditField, recordForm, lookupInput, formatPlain, isNumeric } from '../fields.js';
import { aiRecordCard, draftEmailButton } from '../ai/widgets.js';

export default async function render(root, { params, app }) {
  const id = params.id;
  const obj = objForId(id);
  if (!obj) throw Object.assign(new Error('This record type is not available to you.'), { status: 404 });

  let rec, approvals = [];
  async function fetchRecord() {
    [rec, approvals] = await Promise.all([
      GET(`/api/record/${id}`),
      GET(`/api/record/${id}/approvals`).catch(() => []),
    ]);
    app.setTitle(`${rec.Name || obj.label} | ${obj.label}`);
  }
  await fetchRecord();

  const headerSlot = h('div');
  const pathSlot = h('div');
  const bannerSlot = h('div');
  const leftSlot = h('div', { class: 'col gap-16' });
  const rightSlot = h('div', { class: 'col gap-16' });
  mount(root, headerSlot, bannerSlot, pathSlot, h('div', { class: 'record-layout' }, leftSlot, rightSlot));

  const pending = () => approvals.find((a) => a.status === 'Pending');
  const canEdit = () => rec._access && rec._access !== 'read' && obj.perms.edit && (!pending() || can('ModifyAllData') || pending()?.approverId === me().Id);
  const isOwnerLevel = () => rec._access === 'all';

  async function refresh() {
    await fetchRecord();
    drawAll();
  }

  function drawAll() {
    drawHeader();
    drawBanner();
    drawPath();
    drawLeft();
    drawRight();
  }

  // ---------- header ----------
  function drawHeader() {
    const actions = [];
    const custom = (obj.actions || []);
    if (canEdit()) actions.push(h('button', { class: 'btn', onClick: editRecord }, 'Edit'));
    if (obj.apiName === 'Lead' && !rec.IsConverted && can('ConvertLeads') && canEdit()) actions.push(h('button', { class: 'btn', onClick: convertLead }, 'Convert'));
    if (obj.hasApproval && !pending() && canEdit()) actions.push(h('button', { class: 'btn', onClick: submitApproval }, 'Submit for Approval'));
    custom.slice(0, 2).forEach((a) => actions.push(h('button', { class: 'btn', onClick: () => runAction(a) }, a.label)));
    const more = [
      ...custom.slice(2).map((a) => ({ label: a.label, icon: 'zap', onClick: () => runAction(a) })),
      obj.perms.create ? { label: 'Clone', icon: 'copy', onClick: cloneRecord } : null,
      isOwnerLevel() || can('TransferRecords') ? { label: 'Change Owner', icon: 'user', onClick: changeOwner } : null,
      { label: 'Sharing', icon: 'share', onClick: sharing },
      isOwnerLevel() && obj.perms.delete ? { label: 'Delete', icon: 'trash', danger: true, onClick: deleteRecord } : null,
      'sep',
      { label: 'Printable View', icon: 'print', onClick: () => window.print() },
      { label: 'Copy Record Link', icon: 'copy', onClick: () => { navigator.clipboard?.writeText(location.href); toast('Link copied', 'success'); } },
      can('CustomizeApplication') ? { label: `Edit ${obj.label} Object`, icon: 'database', href: `#/setup/objects/${obj.apiName}` } : null,
      can('RunSoql') || can('ModifyAllData') ? { label: 'Query in Developer Console', icon: 'code', onClick: () => { store.set('devconsole:query', `SELECT FIELDS(ALL) FROM ${obj.apiName} WHERE Id = '${id}'`); location.hash = '#/devconsole'; } } : null,
    ];
    const moreBtn = h('button', { class: 'btn btn-icon', 'aria-label': 'More actions', onClick: (e) => showMenu(e.currentTarget, more, { align: 'right', width: 230 }) }, icon('chevronDown'));
    const favBtn = h('button', { class: 'btn btn-ghost btn-icon', title: 'Add to Favorites', 'aria-label': 'Add to Favorites', onClick: async () => {
      const r = await POST('/api/favorites', { target: `#/r/${id}`, label: rec.Name });
      toast(r.favorite ? 'Added to favorites' : 'Removed from favorites', 'success');
    } }, icon('star'));

    const hl = (obj.highlightFields || []).map((f) => obj.fieldMap.get(f)).filter(Boolean);
    mount(headerSlot, h('div', { class: 'page-header' },
      h('div', { class: 'title-row' },
        objIcon(obj, 'lg'),
        h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'eyebrow' }, obj.label), h('h1', { class: 'truncate' }, rec.Name || '(no name)', ' ', favBtn)),
        h('div', { class: 'actions' }, h('div', { class: 'btn-group' }, ...actions, moreBtn))),
      hl.length ? h('div', { class: 'highlights' }, hl.map((f) => h('div', h('div', { class: 'hl-label' }, f.label), h('div', { class: 'hl-value' }, displayValue(f, rec[f.apiName], rec))))) : null));
  }

  function drawBanner() {
    clear(bannerSlot);
    const p = pending();
    if (p) {
      bannerSlot.appendChild(h('div', { class: 'alert warning mb-16' }, icon('lock'),
        h('div', { class: 'grow' }, h('strong', 'Pending approval. '), `Submitted by ${p.submittedBy} ${fmt.relative(p.createdAt)} · Approver: ${p.approver}. This record is locked.`),
        p.canAct ? [h('button', { class: 'btn btn-sm', onClick: () => actApproval(p, 'approve') }, 'Approve'), h('button', { class: 'btn btn-sm', onClick: () => actApproval(p, 'reject') }, 'Reject')] : null,
        p.canRecall ? h('button', { class: 'btn btn-sm', onClick: () => actApproval(p, 'recall') }, 'Recall') : null));
    }
    if (obj.apiName === 'Lead' && rec.IsConverted) {
      bannerSlot.appendChild(h('div', { class: 'alert success mb-16' }, icon('check'), h('div', 'This lead was converted on ', fmt.date(rec.ConvertedDate), '. ',
        rec.ConvertedAccountId ? [h('a', { href: `#/r/${rec.ConvertedAccountId}` }, rec._labels?.ConvertedAccountId || 'Account'), ' · '] : null,
        rec.ConvertedContactId ? [h('a', { href: `#/r/${rec.ConvertedContactId}` }, rec._labels?.ConvertedContactId || 'Contact')] : null,
        rec.ConvertedOpportunityId ? [' · ', h('a', { href: `#/r/${rec.ConvertedOpportunityId}` }, rec._labels?.ConvertedOpportunityId || 'Opportunity')] : null)));
    }
  }

  // ---------- path ----------
  let pathSelected = null;
  function drawPath() {
    clear(pathSlot);
    const f = obj.pathField && obj.fieldMap.get(obj.pathField);
    if (!f || f.type !== 'Picklist') return;
    const values = (f.values || []).filter((v) => v.isActive !== false);
    const current = rec[f.apiName];
    const curIdx = values.findIndex((v) => v.value === current);
    const curVal = values[curIdx];
    const open = values.filter((v) => !v.closed && !v.converted);
    const closed = values.filter((v) => v.closed || v.converted);
    // Closed stages collapse into one final step, like Lightning's path.
    const steps = closed.length > 1 ? [...open, { value: '__closed__', label: curVal && (curVal.closed || curVal.converted) ? curVal.label || curVal.value : 'Closed', closedGroup: true }] : values;
    pathSelected ??= current;
    const stepIdx = (v) => (v.closedGroup ? open.length : steps.indexOf(v));
    const currentStepIdx = curVal && (curVal.closed || curVal.converted) && closed.length > 1 ? open.length : steps.findIndex((s) => s.value === current);
    const stepsEl = h('div', { class: 'path-steps', role: 'list' }, steps.map((s, i) => {
      const isCurrent = i === currentStepIdx;
      const cls = ['path-step'];
      if (i < currentStepIdx) cls.push('complete');
      if (isCurrent) {
        if (s.closedGroup || curVal?.closed) cls.push(curVal?.won || curVal?.converted ? 'won' : curVal?.closed ? 'lost' : 'current');
        else cls.push('current');
      }
      if ((s.closedGroup && closed.some((c) => c.value === pathSelected)) || s.value === pathSelected) cls.push('selected');
      return h('button', { class: cls, role: 'listitem', title: s.label || s.value, onClick: () => { pathSelected = s.closedGroup ? '__closed__' : s.value; drawPath(); } },
        i < currentStepIdx ? icon('check', { size: 14 }) : null, ' ', s.label || s.value);
    }));
    let btn = null;
    if (canEdit() && f.access?.edit !== false) {
      if (pathSelected === '__closed__' || closed.some((c) => c.value === pathSelected && c.value !== current)) {
        btn = h('button', { class: 'btn btn-brand', onClick: () => chooseClosed(f, closed) }, `Select Closed ${f.label}`);
      } else if (pathSelected && pathSelected !== current) {
        btn = h('button', { class: 'btn btn-brand', onClick: () => setPath(f, pathSelected) }, `Mark as Current ${f.label}`);
      } else if (curIdx >= 0 && !(curVal?.closed || curVal?.converted)) {
        const next = values[curIdx + 1];
        if (next && !(next.closed || next.converted)) btn = h('button', { class: 'btn btn-brand', onClick: () => setPath(f, next.value) }, icon('check'), `Mark ${f.label} as Complete`);
        else if (next && obj.apiName === 'Lead' && !rec.IsConverted) btn = h('button', { class: 'btn btn-brand', onClick: convertLead }, icon('check'), 'Convert');
        else if (next) btn = h('button', { class: 'btn btn-brand', onClick: () => chooseClosed(f, closed) }, `Select Closed ${f.label}`);
      }
    }
    if (obj.apiName === 'Lead' && !rec.IsConverted && closed.some((c) => c.converted) && (pathSelected === '__closed__')) {
      btn = h('button', { class: 'btn btn-brand', onClick: convertLead }, 'Convert');
    }
    pathSlot.appendChild(h('div', { class: 'path' }, stepsEl, btn));
  }

  async function setPath(f, value) {
    try {
      await PATCH(`/api/record/${id}`, { [f.apiName]: value });
      pathSelected = value;
      toast(`${f.label} changed to ${value}.`, 'success');
      await refresh();
    } catch (e) { toast(e.message, 'error'); }
  }

  function chooseClosed(f, closed) {
    const choices = closed.filter((c) => !c.converted);
    if (obj.apiName === 'Lead') { convertLead(); return; }
    const sel = h('select', { class: 'input' }, choices.map((c) => h('option', { value: c.value }, c.label || c.value)));
    const m = modal({ title: `Close This ${obj.label}`, size: 'sm', body: h('div', h('label', { class: 'form-label' }, f.label), sel),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: async () => {
        try { await PATCH(`/api/record/${id}`, { [f.apiName]: sel.value }); m.close(); pathSelected = sel.value; toast(`${f.label} changed to ${sel.value}.`, 'success'); await refresh(); } catch (e) { m.setError(e.message); }
      } }, 'Save')] });
  }

  // ---------- left: details / related / history / approvals ----------
  let leftTab = store.get(`rectab:${obj.apiName}`, 'details');
  function drawLeft() {
    const items = [
      { id: 'related', label: 'Related', render: relatedTab },
      { id: 'details', label: 'Details', render: detailsTab },
      { id: 'history', label: 'History', render: historyTab },
    ];
    if (approvals.length || obj.hasApproval) items.push({ id: 'approvals', label: `Approval History${approvals.length ? ` (${approvals.length})` : ''}`, render: approvalsTab });
    mount(leftSlot, h('div', { class: 'card' }, tabs(items, leftTab, (t) => { leftTab = t; if (t !== 'approvals') store.set(`rectab:${obj.apiName}`, t); })));
  }

  function detailsTab() {
    const layout = obj.layout || { sections: [] };
    let editing = false;
    const inputs = new Map();
    const body = h('div', { class: 'card-body' });
    const draw = () => {
      clear(body);
      inputs.clear();
      for (const s of layout.sections) {
        const fields = s.fields.map((f) => obj.fieldMap.get(f)).filter(Boolean);
        if (!fields.length) continue;
        const collapsed = store.get(`collapse:${obj.apiName}:${s.label}`, false);
        const grid = h('div', { class: ['detail-grid', s.columns === 1 && 'cols-1', collapsed && 'hidden'] });
        const title = h('div', { class: 'section-title', onClick: () => { store.set(`collapse:${obj.apiName}:${s.label}`, !collapsed); draw(); } }, icon(collapsed ? 'chevronRight' : 'chevronDown', { size: 14 }), s.label);
        for (const f of fields) {
          const editable = canEdit() && canEditField(f, 'edit');
          const cell = h('div', { class: ['detail-field', editing && editable && 'editing'] });
          const label = h('div', { class: 'df-label' }, f.label, f.helpText ? h('span', { class: 'help-tip', title: f.helpText }, 'i') : null);
          if (editing && editable) {
            const inp = fieldInput(f, rec[f.apiName], { record: rec });
            inputs.set(f.apiName, inp);
            cell.append(label, inp.el, h('div', { class: 'form-error hidden', dataset: { err: f.apiName } }));
          } else {
            const multiline = ['TextArea', 'LongTextArea'].includes(f.type);
            cell.append(label, h('div', { class: ['df-value', multiline && 'multiline'] }, displayValue(f, rec[f.apiName], rec, { link: f.apiName !== 'Name' })));
            if (editable) cell.appendChild(h('button', { class: 'btn btn-ghost btn-sm btn-icon df-edit', 'aria-label': `Edit ${f.label}`, onClick: () => { editing = true; draw(); setTimeout(() => inputs.get(f.apiName)?.focus(), 0); } }, icon('edit', { size: 14 })));
            cell.addEventListener('dblclick', () => { if (editable && !editing) { editing = true; draw(); setTimeout(() => inputs.get(f.apiName)?.focus(), 0); } });
          }
          grid.appendChild(cell);
        }
        body.append(title, grid);
      }
      if (editing) {
        const err = h('div', { class: 'modal-error hidden' });
        body.prepend(err);
        const save = async () => {
          const payload = {};
          for (const [api, inp] of inputs) {
            const v = inp.get();
            if ((v ?? null) !== (rec[api] ?? null) && !(v === false && rec[api] == null)) payload[api] = v;
          }
          if (!Object.keys(payload).length) { editing = false; draw(); return; }
          try {
            await PATCH(`/api/record/${id}`, payload);
            toast(`${obj.label} "${rec.Name}" was saved.`, 'success');
            editing = false;
            await refresh();
          } catch (e) {
            body.querySelectorAll('[data-err]').forEach((x) => x.classList.add('hidden'));
            const general = [];
            for (const er of e.errors || []) {
              const el = er.field && body.querySelector(`[data-err="${er.field}"]`);
              if (el) { el.textContent = er.message; el.classList.remove('hidden'); } else general.push(er.message);
            }
            err.textContent = general.length ? general.join(' • ') : e.errors?.length ? 'Review the errors on this page.' : e.message;
            err.classList.remove('hidden');
          }
        };
        body.appendChild(h('div', { class: 'inline-save-bar' }, h('button', { class: 'btn', onClick: () => { editing = false; draw(); } }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: save }, 'Save')));
        body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); });
      }
    };
    draw();
    return body;
  }

  function relatedTab() {
    const lists = (obj.layout?.relatedLists?.length ? obj.layout.relatedLists : obj.children.map((c) => ({ object: c.object, field: c.field, label: c.label, columns: ['Name', 'CreatedDate'] })))
      .filter((rl) => getObj(rl.object));
    const wrap = h('div', { class: 'card-body col gap-16' });
    if (!lists.length) wrap.appendChild(h('div', { class: 'muted center p-16' }, 'No related lists on this page layout.'));
    for (const rl of lists) wrap.appendChild(relatedCard(rl));
    return wrap;
  }

  function relatedCard(rl) {
    const child = getObj(rl.object);
    const body = h('div', spinner());
    const countEl = h('span', { class: 'muted' }, '');
    const card = h('div', { class: 'card related-card' },
      h('div', { class: 'card-header' }, objIcon(child, 'sm'), h('h3', rl.label || child.pluralLabel, ' ', countEl),
        child.perms.create && canEditRelated(child) ? h('button', { class: 'btn btn-sm', onClick: async () => {
          const defaults = { [rl.field]: rec.Id, _labels: { [rl.field]: rec.Name } };
          if (await recordForm(child.apiName, { mode: 'new', defaults })) load();
        } }, 'New') : null),
      body);
    const cols = (rl.columns?.length ? rl.columns : ['Name']).filter((c) => child.fieldMap.get(c) || c.includes('.'));
    async function load(all = false) {
      try {
        const res = await GET(`/api/record/${id}/related/${child.apiName}/${rl.field}?limit=${all ? 500 : 6}`);
        countEl.textContent = `(${res.total > 6 && !all ? '6+' : res.total})`;
        if (!res.records.length) { mount(body, h('div', { class: 'p-16 muted small' }, `No ${(rl.label || child.pluralLabel).toLowerCase()} yet.`)); return; }
        const table = h('table', { class: 'table compact' },
          h('thead', h('tr', cols.map((c) => { const f = child.fieldMap.get(c); return h('th', { class: f && isNumeric(f) ? 'num' : '' }, f?.label || c); }), h('th', { style: { width: '32px' } }))),
          h('tbody', res.records.map((r) => h('tr',
            cols.map((c) => { const f = child.fieldMap.get(c); const nameish = c === 'Name' || (!cols.includes('Name') && c === cols[0]); return h('td', { class: f && isNumeric(f) ? 'num' : '' }, f ? (nameish ? h('a', { href: `#/r/${r.Id}` }, formatPlain(f, r[c], r._labels) || r.Name || r.Id) : displayValue(f, r[c], r)) : r[c]); }),
            h('td', h('button', { class: 'btn btn-sm btn-icon row-action', 'aria-label': 'Row actions', onClick: (e) => showMenu(e.currentTarget, [
              { label: 'View', icon: 'eye', href: `#/r/${r.Id}` },
              r._access !== 'read' && child.perms.edit ? { label: 'Edit', icon: 'edit', onClick: async () => { const full = await GET(`/api/record/${r.Id}`); if (await recordForm(child.apiName, { record: full })) { load(all); refresh(); } } } : null,
              r._access === 'all' && child.perms.delete ? { label: 'Delete', icon: 'trash', danger: true, onClick: async () => {
                if (!(await confirmDialog(`Delete "${r.Name}"?`, { confirmLabel: 'Delete', danger: true }))) return;
                try { await DEL(`/api/record/${r.Id}`); toast('Deleted', 'success'); load(all); refresh(); } catch (e) { toast(e.message, 'error'); }
              } } : null,
            ], { align: 'right' }) }, icon('chevronDown')))))));
        mount(body, h('div', { class: 'table-wrap' }, table), res.total > 6 && !all ? h('div', { class: 'card-footer' }, h('button', { class: 'link-btn', onClick: () => load(true) }, `View All (${res.total})`)) : null);
      } catch (e) {
        mount(body, h('div', { class: 'p-16 small muted' }, e.message));
      }
    }
    load();
    return card;
  }

  function canEditRelated(child) {
    // Detail records in a master-detail need edit access on the master.
    const md = child.fields.find((f) => f.type === 'MasterDetail' && f.referenceTo === obj.apiName);
    return md ? canEdit() : true;
  }

  function historyTab() {
    const body = h('div', { class: 'card-body flush' }, spinner());
    GET(`/api/record/${id}/history`).then((rows) => {
      if (!obj.trackHistory) { mount(body, h('div', { class: 'p-16 muted' }, `Field history tracking is not enabled for ${obj.pluralLabel}.`, can('CustomizeApplication') ? [' ', h('a', { href: `#/setup/objects/${obj.apiName}` }, 'Enable it in Setup.')] : null)); return; }
      if (!rows.length) { mount(body, h('div', { class: 'p-16 muted' }, 'No history yet.')); return; }
      mount(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
        h('thead', h('tr', h('th', 'Date'), h('th', 'Field'), h('th', 'User'), h('th', 'Original Value'), h('th', 'New Value'))),
        h('tbody', rows.map((r) => {
          const f = obj.fieldMap.get(r.field);
          const fmtv = (v) => (f && v != null && !['Lookup', 'MasterDetail'].includes(f.type) && !f.ownerField ? formatPlain(f, f.type === 'Checkbox' ? v === 'true' : v) : v ?? '');
          return h('tr', h('td', { class: 'nowrap' }, fmt.datetime(r.changedAt)), h('td', r.fieldLabel), h('td', r.changedBy || ''), h('td', r.field === 'created' ? '' : fmtv(r.oldValue)), h('td', r.field === 'created' ? '' : fmtv(r.newValue)));
        })))));
    }).catch((e) => mount(body, h('div', { class: 'p-16 muted' }, e.message)));
    return body;
  }

  function approvalsTab() {
    const body = h('div', { class: 'card-body' });
    if (!approvals.length) {
      body.appendChild(emptyState('No approval history', obj.hasApproval ? 'Submit this record for approval to start the process.' : '', { iconName: 'approval',
        action: obj.hasApproval && !pending() && canEdit() ? h('button', { class: 'btn btn-brand', onClick: submitApproval }, 'Submit for Approval') : null }));
      return body;
    }
    body.appendChild(h('div', { class: 'timeline' }, approvals.map((a) => h('div', { class: 'timeline-item' },
      h('div', { class: 'timeline-icon', style: { background: a.status === 'Approved' ? '#16a34a' : a.status === 'Rejected' ? '#dc2626' : a.status === 'Pending' ? '#d97706' : '#64748b' } }, icon(a.status === 'Approved' ? 'check' : a.status === 'Rejected' ? 'x' : 'clock')),
      h('div', { class: 'timeline-body' },
        h('div', { class: 'row' }, h('strong', { class: 'grow' }, `${a.process || 'Approval'} — ${a.status}`), h('span', { class: 'timeline-meta' }, fmt.datetime(a.createdAt))),
        h('div', { class: 'small' }, `Submitted by ${a.submittedBy} · Assigned to ${a.approver}${a.actedBy ? ` · ${a.status} by ${a.actedBy} ${fmt.relative(a.actedAt)}` : ''}`),
        a.comments ? h('div', { class: 'small muted pre-wrap mt-8' }, a.comments) : null,
        a.status === 'Pending' ? h('div', { class: 'row mt-8' },
          a.canAct ? [h('button', { class: 'btn btn-sm btn-brand', onClick: () => actApproval(a, 'approve') }, 'Approve'), h('button', { class: 'btn btn-sm', onClick: () => actApproval(a, 'reject') }, 'Reject')] : null,
          a.canRecall ? h('button', { class: 'btn btn-sm', onClick: () => actApproval(a, 'recall') }, 'Recall') : null) : null)))));
    return body;
  }

  async function actApproval(a, action) {
    const label = { approve: 'Approve', reject: 'Reject', recall: 'Recall' }[action];
    const comments = await promptDialog('Comments (optional)', { title: `${label} Request`, confirmLabel: label, multiline: true });
    if (comments === null) return;
    try {
      await POST(`/api/approvals/${a.id}/${action}`, { comments });
      toast(`Request ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'recalled'}.`, 'success');
      await refresh();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function submitApproval() {
    const comments = await promptDialog('Comments', { title: 'Submit for Approval', confirmLabel: 'Submit', multiline: true });
    if (comments === null) return;
    try {
      const a = await POST(`/api/record/${id}/approvals`, { comments });
      toast(`Submitted for approval to ${a.approver}.`, 'success');
      await refresh();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ---------- right: activity & chatter ----------
  let rightTab = obj.enableActivities !== false && getObj('Task') ? 'activity' : 'chatter';
  function drawRight() {
    const items = [];
    if (obj.enableActivities !== false && getObj('Task') && !obj.isActivity) items.push({ id: 'activity', label: 'Activity', render: activityTab });
    if (obj.enableFeed !== false) items.push({ id: 'chatter', label: 'Chatter', render: chatterTab });
    if (!items.length) { clear(rightSlot); return; }
    if (!items.some((i) => i.id === rightTab)) rightTab = items[0].id;
    mount(rightSlot, aiRecordCard(rec, obj, { onChanged: refresh }), h('div', { class: 'card' }, tabs(items, rightTab, (t) => { rightTab = t; })));
  }

  function activityDefaults() {
    if (obj.apiName === 'Contact') return { WhoId: id, WhatId: rec.AccountId || null, _labels: { WhoId: rec.Name, WhatId: rec._labels?.AccountId } };
    if (obj.apiName === 'Lead') return { WhoId: id, _labels: { WhoId: rec.Name } };
    return { WhatId: id, _labels: { WhatId: rec.Name } };
  }

  function activityTab() {
    const body = h('div', { class: 'card-body' });
    const list = h('div', spinner());
    const today = new Date().toISOString().slice(0, 10);
    const composer = h('div', { class: 'composer-tabs' },
      getObj('Task')?.perms.create ? h('button', { class: 'btn btn-sm', onClick: async () => { if (await recordForm('Task', { mode: 'new', defaults: { ...activityDefaults(), ActivityDate: today } })) loadActs(); } }, icon('task'), 'New Task') : null,
      getObj('Task')?.perms.create ? h('button', { class: 'btn btn-sm', onClick: async () => { if (await recordForm('Task', { mode: 'new', title: 'Log a Call', defaults: { ...activityDefaults(), Name: 'Call', TaskSubtype: 'Call', Status: 'Completed', ActivityDate: today } })) loadActs(); } }, icon('phone'), 'Log a Call') : null,
      getObj('Event')?.perms.create ? h('button', { class: 'btn btn-sm', onClick: async () => {
        const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1);
        if (await recordForm('Event', { mode: 'new', defaults: { ...activityDefaults(), StartDateTime: start.toISOString(), EndDateTime: new Date(start.getTime() + 3600000).toISOString() } })) loadActs();
      } }, icon('calendar'), 'New Event') : null,
      getObj('Task')?.perms.create ? h('button', { class: 'btn btn-sm', onClick: emailComposer }, icon('mail'), 'Email') : null);

    function emailComposer() {
      const to = h('input', { class: 'input', value: rec.Email || rec.SuppliedEmail || '' });
      const subject = h('input', { class: 'input' });
      const bodyIn = h('textarea', { class: 'input', rows: 8 });
      const m = modal({ title: 'New Email', body: h('div', { class: 'col gap-12' },
        h('div', h('label', { class: 'form-label' }, 'From'), h('div', { class: 'muted' }, `${me().Name} <${me().Email}>`)),
        h('div', h('label', { class: 'form-label' }, h('span', { class: 'req' }, '*'), 'To'), to),
        h('div', h('label', { class: 'form-label' }, h('span', { class: 'req' }, '*'), 'Subject'), subject),
        h('div', h('div', { class: 'row' }, h('label', { class: 'form-label grow' }, 'Body'), draftEmailButton(id, { subject, body: bodyIn, to })), bodyIn),
        h('div', { class: 'alert small' }, icon('info'), 'Slavy logs emails to the Email Log and the activity timeline (no external mail server is configured).')),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: async () => {
        try { await POST(`/api/record/${id}/email`, { to: to.value, subject: subject.value, body: bodyIn.value }); m.close(); toast('Email sent and logged', 'success'); loadActs(); } catch (e) { m.setError(e.message); }
      } }, icon('mail'), 'Send')] });
    }

    async function loadActs() {
      try {
        const acts = await GET(`/api/record/${id}/activities`);
        const section = (title, items, emptyText) => h('div', { class: 'mb-16' },
          h('div', { class: 'section-title', style: { cursor: 'default' } }, title),
          items.length ? h('div', { class: 'timeline' }, items.map(activityItem)) : h('div', { class: 'small muted', style: { padding: '0 12px' } }, emptyText));
        mount(list, section('Upcoming & Overdue', acts.upcoming, 'No next steps. To get things moving, add a task or set up a meeting.'), section('Past Activities', acts.past, 'No past activity. Past meetings and tasks marked as done show up here.'));
      } catch (e) { mount(list, h('div', { class: 'muted small' }, e.message)); }
    }

    function activityItem(a) {
      const type = a._type === 'Event' ? 'event' : a.TaskSubtype === 'Call' ? 'call' : a.TaskSubtype === 'Email' ? 'email' : 'task';
      const colors = { task: '#16a34a', call: '#0d9488', email: '#2563eb', event: '#9333ea' };
      const icons = { task: 'task', call: 'phone', email: 'mail', event: 'calendar' };
      const overdue = a._type === 'Task' && a.Status !== 'Completed' && a.ActivityDate && a.ActivityDate < today;
      let cb = null;
      if (a._type === 'Task') {
        cb = h('input', { type: 'checkbox', checked: a.Status === 'Completed', 'aria-label': 'Mark complete', disabled: a._access === 'read', onChange: async () => {
          try { await PATCH(`/api/record/${a.Id}`, { Status: cb.checked ? 'Completed' : 'Not Started' }); loadActs(); } catch (e) { cb.checked = !cb.checked; toast(e.message, 'error'); }
        } });
      }
      return h('div', { class: 'timeline-item' },
        h('div', { class: 'timeline-icon', style: { background: colors[type] } }, icon(icons[type])),
        h('div', { class: 'timeline-body' },
          h('div', { class: 'row' }, cb ? h('label', { class: 'checkbox' }, cb) : null,
            h('a', { href: `#/r/${a.Id}`, class: 'grow truncate', style: a.Status === 'Completed' ? { textDecoration: 'line-through', color: 'var(--text-2)' } : null }, a.Name),
            h('span', { class: ['timeline-meta nowrap', overdue && 'overdue'], style: overdue ? { color: 'var(--danger)' } : null }, a._type === 'Event' ? fmt.datetime(a.StartDateTime) : a.ActivityDate ? fmt.date(a.ActivityDate) : '')),
          h('div', { class: 'timeline-meta' },
            a._type === 'Event' ? `${a.Location ? a.Location + ' · ' : ''}${a._labels?.OwnerId || ''}` : `${a._labels?.OwnerId || ''} ${type === 'call' ? 'logged a call' : type === 'email' ? 'sent an email' : 'has a task'}`,
            a._labels?.WhoId && a.WhoId !== id ? ` · ${a._labels.WhoId}` : '', a._labels?.WhatId && a.WhatId !== id ? ` · ${a._labels.WhatId}` : ''),
          a.Description ? h('div', { class: 'small pre-wrap', style: { marginTop: '4px', maxHeight: '60px', overflow: 'hidden' } }, a.Description) : null));
    }

    body.append(composer, list);
    loadActs();
    return body;
  }

  function chatterTab() {
    const body = h('div', { class: 'card-body' });
    const input = h('textarea', { class: 'input', rows: 2, placeholder: 'Share an update... use @First Last to mention someone' });
    const list = h('div', spinner());
    const post = async () => {
      if (!input.value.trim()) return;
      try { await POST('/api/feed', { parentId: id, body: input.value }); input.value = ''; loadFeed(); } catch (e) { toast(e.message, 'error'); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); });
    async function loadFeed() {
      try {
        const items = await GET(`/api/feed?parent=${id}`);
        mount(list, items.length ? items.map((f) => feedItem(f, loadFeed)) : h('div', { class: 'muted small center p-16' }, 'No posts yet. Start the conversation!'));
      } catch (e) { mount(list, h('div', { class: 'muted small' }, e.message)); }
    }
    body.append(h('div', { class: 'mb-16' }, input, h('div', { class: 'row mt-8' }, h('span', { class: 'spacer' }), h('button', { class: 'btn btn-brand btn-sm', onClick: post }, 'Share'))), list);
    loadFeed();
    return body;
  }

  // ---------- actions ----------
  async function editRecord() {
    if (await recordForm(obj.apiName, { record: rec })) await refresh();
  }

  async function cloneRecord() {
    const copy = { ...rec };
    for (const f of obj.fields) if (!canEditField(f, 'new')) delete copy[f.apiName];
    const r = await recordForm(obj.apiName, { record: copy, mode: 'clone' });
    if (r) app.navigate(`/r/${r.Id}`);
  }

  async function deleteRecord() {
    if (!(await confirmDialog(`Are you sure you want to delete this ${obj.label.toLowerCase()}? Related detail records and activities are deleted too.`, { title: `Delete ${obj.label}`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await DEL(`/api/record/${id}`);
      toast(`${obj.label} "${rec.Name}" was deleted.`, 'success', { link: { href: '#/recyclebin', label: 'Undo in Recycle Bin' } });
      app.navigate(`/o/${obj.apiName}`);
    } catch (e) { toast(e.message, 'error'); }
  }

  function changeOwner() {
    const lk = lookupInput({ objects: ['User'], includeQueues: true });
    const m = modal({ title: `Change ${obj.label} Owner`, size: 'sm',
      body: h('div', h('div', { class: 'small muted mb-8' }, `Current owner: ${rec._labels?.OwnerId || ''}`), h('label', { class: 'form-label' }, 'Search Users or Queues'), lk.el,
        h('div', { class: 'small muted mt-8' }, 'The new owner will need access to related records. Manual shares are kept.')),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: async () => {
        if (!lk.get()) { m.setError('Select a new owner'); return; }
        try { await PATCH(`/api/record/${id}`, { OwnerId: lk.get() }); m.close(); toast('Owner changed', 'success'); await refresh(); } catch (e) { m.setError(e.message); }
      } }, 'Change Owner')] });
  }

  async function sharing() {
    const body = h('div', spinner());
    const m = modal({ title: `Sharing: ${rec.Name}`, size: 'lg', body });
    const draw = async () => {
      try {
        const data = await GET(`/api/record/${id}/shares`);
        const lk = lookupInput({ objects: ['User'] });
        const access = h('select', { class: 'input', style: { width: '150px' } }, h('option', { value: 'read' }, 'Read Only'), h('option', { value: 'edit' }, 'Read/Write'));
        mount(body,
          h('div', { class: 'alert mb-16' }, icon('info'), h('div', `Org-wide default for ${obj.pluralLabel}: `, h('strong', { Private: 'Private', Read: 'Public Read Only', ReadWrite: 'Public Read/Write', ControlledByParent: 'Controlled by Parent' }[obj.sharingModel] || obj.sharingModel),
            '. Users above the owner in the role hierarchy, sharing rules and the shares below also grant access.')),
          data.canShare ? h('div', { class: 'row mb-16' }, h('div', { class: 'grow' }, lk.el), access, h('button', { class: 'btn btn-brand', onClick: async () => {
            if (!lk.get()) return toast('Choose a user', 'warning');
            try { await POST(`/api/record/${id}/shares`, { granteeId: lk.get(), access: access.value }); toast('Record shared', 'success'); draw(); } catch (e) { toast(e.message, 'error'); }
          } }, 'Share')) : h('div', { class: 'small muted mb-16' }, 'Only the owner, users above them in the role hierarchy and administrators can share this record.'),
          h('table', { class: 'table' }, h('thead', h('tr', h('th', 'Name'), h('th', 'Type'), h('th', 'Access Level'), h('th', 'Reason'), h('th'))),
            h('tbody', data.shares.map((s) => h('tr', h('td', s.name), h('td', s.kind), h('td', s.access), h('td', s.reason),
              h('td', s.canDelete ? h('button', { class: 'btn btn-ghost btn-sm', onClick: async () => { try { await DEL(`/api/record/${id}/shares/${s.granteeId}`); draw(); } catch (e) { toast(e.message, 'error'); } } }, 'Remove') : null))))));
      } catch (e) { m.setError(e.message); }
    };
    draw();
  }

  async function runAction(a) {
    if (a.actionType === 'url') {
      try { const r = await POST(`/api/record/${id}/actions/${a.id}`, {}); if (r.url) window.open(r.url, '_blank', 'noopener'); } catch (e) { toast(e.message, 'error'); }
      return;
    }
    const target = a.actionType === 'create' ? getObj(a.childObject) : obj;
    const promptFields = (a.fields || []).map((f) => target?.fieldMap.get(f)).filter((f) => f && canEditField(f, a.actionType === 'create' ? 'new' : 'edit'));
    const execute = async (input, m) => {
      try {
        const r = await POST(`/api/record/${id}/actions/${a.id}`, input);
        m?.close();
        toast(r.message || `${a.label} complete`, 'success');
        if (a.actionType === 'create' && r.recordId) { await refresh(); } else await refresh();
      } catch (e) {
        if (m) m.setError(e.message); else toast(e.message, 'error');
      }
    };
    if (!promptFields.length) {
      if (a.confirm && !(await confirmDialog(a.confirm, { title: a.label, confirmLabel: a.label }))) return;
      return execute({});
    }
    const inputs = new Map();
    const grid = h('div', { class: 'form-grid' }, promptFields.map((f) => {
      const inp = fieldInput(f, a.actionType === 'update' ? rec[f.apiName] : null, { record: a.actionType === 'update' ? rec : {} });
      inputs.set(f.apiName, inp);
      return h('div', { class: ['form-row', ['TextArea', 'LongTextArea'].includes(f.type) && 'span-2'] }, h('label', { class: 'form-label' }, f.required ? h('span', { class: 'req' }, '*') : null, f.label), inp.el);
    }));
    const m = modal({ title: a.label, body: h('div', a.confirm ? h('div', { class: 'alert mb-16' }, a.confirm) : null, grid),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: () => {
        const input = {};
        for (const [k, inp] of inputs) { const v = inp.get(); if (v !== null && v !== '') input[k] = v; }
        execute(input, m);
      } }, 'Save')] });
  }

  function convertLead() {
    const statuses = (obj.fieldMap.get('Status')?.values || []).filter((v) => v.converted);
    let accountMode = 'new', oppEnabled = true;
    const accName = h('input', { class: 'input', value: rec.Company || '' });
    const accLookup = lookupInput({ objects: ['Account'], placeholder: 'Search for matching accounts...' });
    const conInfo = h('div', { class: 'muted' }, `${rec.Salutation ? rec.Salutation + ' ' : ''}${rec.Name}`);
    const oppName = h('input', { class: 'input', value: `${rec.Company || rec.Name}-` });
    const noOpp = h('input', { type: 'checkbox', onChange: () => { oppEnabled = !noOpp.checked; oppName.disabled = noOpp.checked; } });
    const owner = lookupInput({ objects: ['User'], value: me().Id, label: me().Name });
    const status = h('select', { class: 'input' }, statuses.map((s) => h('option', { value: s.value }, s.label || s.value)));
    const accRadioNew = h('input', { type: 'radio', name: 'accmode', checked: true, onChange: () => { accountMode = 'new'; } });
    const accRadioExisting = h('input', { type: 'radio', name: 'accmode', onChange: () => { accountMode = 'existing'; } });
    const section = (title, ...children) => h('div', { class: 'convert-section' }, h('h3', { class: 'mb-8' }, title), ...children);
    const m = modal({ title: `Convert Lead: ${rec.Name}`, size: 'lg', body: h('div', { class: 'col gap-16' },
      section('Account',
        h('div', { class: 'grid-2' },
          h('div', h('label', { class: 'checkbox mb-8' }, accRadioNew, h('strong', 'Create New')), h('label', { class: 'form-label' }, 'Account Name'), accName),
          h('div', h('label', { class: 'checkbox mb-8' }, accRadioExisting, h('strong', 'Choose Existing')), h('label', { class: 'form-label' }, 'Account Search'), accLookup.el))),
      section('Contact', h('div', h('label', { class: 'form-label' }, 'A new contact will be created'), conInfo)),
      section('Opportunity', h('div', h('label', { class: 'form-label' }, 'Opportunity Name'), oppName), h('label', { class: 'checkbox mt-8' }, noOpp, "Don't create an opportunity upon conversion")),
      h('div', { class: 'grid-2' }, h('div', h('label', { class: 'form-label' }, 'Record Owner'), owner.el), h('div', h('label', { class: 'form-label' }, 'Converted Status'), status))),
    footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: async () => {
      const payload = { ownerId: owner.get() || undefined, convertedStatus: status.value, doNotCreateOpportunity: !oppEnabled, opportunityName: oppName.value };
      if (accountMode === 'existing') { if (!accLookup.get()) { m.setError('Choose an existing account'); return; } payload.accountId = accLookup.get(); }
      else payload.accountName = accName.value;
      try {
        const r = await POST(`/api/record/${id}/convert`, payload);
        m.close();
        const done = modal({ title: 'Your lead has been converted', body: h('div', { class: 'grid-3' },
          [['Account', r.accountId], ['Contact', r.contactId], ['Opportunity', r.opportunityId]].filter(([, x]) => x).map(([label, rid]) => h('a', { class: 'card p-16 center', href: `#/r/${rid}`, onClick: () => done.close() }, objIcon(getObj(label), 'lg'), h('div', { class: 'mt-8 strong' }, label), h('div', { class: 'small' }, 'View record')))),
        footer: [h('button', { class: 'btn btn-brand', onClick: () => { done.close(); app.navigate('/o/Lead'); } }, 'Go to Leads')] });
        refresh();
      } catch (e) { m.setError(e.message); }
    } }, 'Convert')] });
  }

  const onKey = (e) => { if (e.detail === 'e' && canEdit()) editRecord(); };
  document.addEventListener('slavy:key', onKey);
  drawAll();
  return () => document.removeEventListener('slavy:key', onKey);
}

// Feed post renderer (shared by record pages).
export function feedItem(f, reload) {
  const commentIn = h('input', { class: 'input input-sm', placeholder: 'Write a comment...' });
  const addComment = async () => {
    if (!commentIn.value.trim()) return;
    try { await POST(`/api/feed/${f.id}/comments`, { body: commentIn.value }); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  commentIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addComment(); });
  const bodyText = (text) => h('div', { class: 'pre-wrap', style: { margin: '4px 0' } },
    String(text).split(/(@[A-Z][\w'-]+ [A-Z][\w'-]+)/g).map((part) => (part.startsWith('@') ? h('span', { class: 'mention' }, part) : part)));
  return h('div', { class: 'feed-item' },
    h('div', { class: 'row top' }, avatar(f.createdBy, 'sm'),
      h('div', { class: 'grow' },
        h('div', { class: 'row' }, h('strong', { class: 'grow' }, f.createdBy, f.type === 'approval' ? h('span', { class: 'badge brand', style: { marginLeft: '6px' } }, 'Approval') : null), h('span', { class: 'timeline-meta' }, fmt.relative(f.createdAt)),
          f.canDelete ? h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Delete post', onClick: async () => { if (await confirmDialog('Delete this post?', { confirmLabel: 'Delete', danger: true })) { await DEL(`/api/feed/${f.id}`); reload(); } } }, icon('trash', { size: 14 })) : null),
        bodyText(f.body),
        h('div', { class: 'row' },
          h('button', { class: ['btn btn-ghost btn-sm', f.liked && 'liked'], style: f.liked ? { color: 'var(--brand)' } : null, onClick: async () => { await POST(`/api/feed/${f.id}/like`); reload(); } }, icon('thumbsUp', { size: 14 }), f.liked ? 'Liked' : 'Like', f.likes ? ` · ${f.likes}` : ''),
          h('span', { class: 'small muted' }, f.comments.length ? `${f.comments.length} comment${f.comments.length > 1 ? 's' : ''}` : '')))),
    h('div', { class: 'feed-comments' },
      f.comments.map((c) => h('div', { class: 'feed-comment' }, h('div', { class: 'row' }, h('strong', { class: 'grow small' }, c.createdBy), h('span', { class: 'tiny muted' }, fmt.relative(c.createdAt)),
        c.canDelete ? h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Delete comment', onClick: async () => { await DEL(`/api/comments/${c.id}`); reload(); } }, icon('x', { size: 12 })) : null), bodyText(c.body))),
      h('div', { class: 'row' }, commentIn, h('button', { class: 'btn btn-sm', onClick: addComment }, 'Comment'))));
}

export { ApiError, state };
