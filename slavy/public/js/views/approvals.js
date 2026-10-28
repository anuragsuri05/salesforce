// Approval Requests: items waiting for the current user's approval.
import { h, icon, mount, fmt, modal, toast, avatar, spinner, emptyState, objIcon, badge } from '../lib.js';
import { GET, POST, getObj } from '../api.js';

export function approvalDialog(item, action) {
  const approve = action === 'approve';
  return new Promise((resolve) => {
    let result = null;
    const ta = h('textarea', { class: 'input', rows: 4, placeholder: approve ? 'Optional comments for the submitter' : 'Let the submitter know why (optional)', 'aria-label': 'Comments' });
    const btn = h('button', { class: `btn ${approve ? 'btn-brand' : 'btn-danger'}`, onClick: submit }, icon(approve ? 'check' : 'x'), approve ? 'Approve' : 'Reject');
    async function submit() {
      btn.disabled = true;
      m.setError('');
      try {
        result = await POST(`/api/approvals/${item.id}/${action}`, { comments: ta.value.trim() });
        toast(`${item.recordName} was ${approve ? 'approved' : 'rejected'}.`, 'success');
        m.close();
      } catch (e) { m.setError(e.message); btn.disabled = false; }
    }
    const m = modal({
      title: approve ? 'Approve Request' : 'Reject Request', size: 'sm',
      body: h('div', { class: 'col gap-12' },
        h('div', { class: 'appr-summary' }, objIcon(getObj(item.object), 'sm'), h('div', { class: 'grow' }, h('div', { class: 'strong' }, item.recordName), h('div', { class: 'tiny muted' }, `${item.objectLabel || item.object} · ${item.process || 'Approval'} · submitted by ${item.submittedBy}`))),
        item.comments ? h('div', { class: 'small' }, h('div', { class: 'form-label' }, 'Submitter comments'), h('div', { class: 'appr-quote' }, item.comments)) : null,
        h('div', h('label', { class: 'form-label' }, 'Comments'), ta)),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), btn],
      onClose: () => resolve(result),
    });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); });
  });
}

export default async function approvalsView(root, { app }) {
  app.setTitle('Approval Requests');
  const body = h('div', { class: 'card-body flush' }, spinner());
  const countEl = h('div', { class: 'small muted' });
  mount(root,
    h('div', { class: 'page-header' }, h('div', { class: 'title-row' },
      h('span', { class: 'obj-icon lg', style: { background: '#9333ea' } }, icon('approval', { size: 22 })),
      h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, 'Approval Requests'), h('h1', 'Items to Approve'), countEl),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onClick: () => load() }, icon('refresh'), 'Refresh')))),
    h('div', { class: 'card' }, body));

  let items = [];
  async function act(item, action) {
    const r = await approvalDialog(item, action);
    if (r) { items = items.filter((x) => x.id !== item.id); draw(); }
  }

  function draw() {
    countEl.textContent = items.length ? `${items.length} request${items.length === 1 ? '' : 's'} waiting for you` : 'Nothing waiting for you';
    if (!items.length) {
      mount(body, emptyState('You’re all caught up', 'There are no approval requests waiting for you. When someone submits a record that you approve, it appears here.', { iconName: 'approval' }));
      return;
    }
    mount(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table appr-table' },
      h('thead', h('tr', h('th', 'Related To'), h('th', 'Type'), h('th', 'Process'), h('th', 'Submitted By'), h('th', 'Date Submitted'), h('th', 'Comments'), h('th', { class: 'right' }, 'Actions'))),
      h('tbody', items.map((it) => {
        const o = getObj(it.object);
        return h('tr',
          h('td', h('a', { class: 'row gap-4 strong', href: `#/r/${it.recordId}` }, objIcon(o, 'sm'), it.recordName)),
          h('td', it.objectLabel || it.object),
          h('td', { class: 'small' }, it.process || '—', it.approverId && !String(it.approverId).startsWith('005') ? h('div', badge(`Queue: ${it.approver}`)) : null),
          h('td', h('span', { class: 'row gap-4' }, avatar(it.submittedBy, 'sm'), it.submittedBy)),
          h('td', { class: 'small', title: fmt.datetime(it.createdAt) }, fmt.datetime(it.createdAt), h('div', { class: 'tiny muted' }, fmt.relative(it.createdAt))),
          h('td', { class: 'small appr-comments', title: it.comments || '' }, it.comments || h('span', { class: 'muted' }, '—')),
          h('td', { class: 'right nowrap' },
            h('button', { class: 'btn btn-sm btn-brand', onClick: () => act(it, 'approve') }, icon('check', { size: 13 }), 'Approve'), ' ',
            h('button', { class: 'btn btn-sm', onClick: () => act(it, 'reject') }, icon('x', { size: 13 }), 'Reject')));
      })))));
  }

  async function load() {
    mount(body, spinner());
    try { items = await GET('/api/approvals'); draw(); } catch (e) { mount(body, emptyState('Couldn’t load approval requests', e.message, { iconName: 'alert' })); }
  }
  await load();
}
