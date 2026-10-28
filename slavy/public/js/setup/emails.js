// Email Log: outbound emails sent by users, flows and approvals; click a row to read the body.
import { h, icon, fmt, mount, spinner, badge, emptyState, modal } from '../lib.js';
import { GET, objForId } from '../api.js';
import { setupHeader } from './index.js';
import { searchBox, select, dataTable, downloadCsv, detailField } from './admin-common.js';

export default async function render(container, { app }) {
  app.setTitle('Email Log');
  const header = (actions) => setupHeader('Email Log', { crumb: 'Setup › Process Automation', iconName: 'mail', actions,
    description: 'Emails sent from Slavy by users, flows, approvals and workflow. Emails are logged, not delivered, in this environment.' });
  mount(container, header(), spinner());
  let rows;
  try { rows = await GET('/api/setup/emails'); } catch (e) { mount(container, header(), h('div', { class: 'card p-24' }, emptyState('Could not load the email log', e.message, { iconName: 'lock' }))); return; }

  // Resolve related record names in one call.
  const ids = [...new Set(rows.map((r) => r.related_id).filter(Boolean))].slice(0, 200);
  let names = {};
  if (ids.length) names = await GET(`/api/names?ids=${ids.join(',')}`).catch(() => ({}));
  const relatedLink = (r) => {
    if (!r.related_id) return h('span', { class: 'muted' }, '—');
    const o = objForId(r.related_id);
    return h('a', { href: `#/r/${r.related_id}`, onClick: (e) => e.stopPropagation() }, names[r.related_id] || r.related_id, o ? h('span', { class: 'muted small' }, ` (${o.label})`) : null);
  };

  let term = '';
  let source = '';
  const sources = [...new Set(rows.map((r) => r.source).filter(Boolean))].sort();
  const filtered = () => rows.filter((r) => (!source || r.source === source) && (!term || [r.to_addr, r.subject, r.sentBy, r.source, r.body].some((v) => String(v || '').toLowerCase().includes(term))));
  const table = dataTable({ rows: [], initialSort: { key: 'sent_at', dir: 'desc' }, rowClass: () => 'sa-clickable', empty: 'No emails match your filters.', columns: [
    { key: 'sent_at', label: 'Sent', render: (r) => h('span', { class: 'nowrap', title: fmt.relative(r.sent_at) }, fmt.datetime(r.sent_at)), sort: (r) => r.sent_at },
    { key: 'to_addr', label: 'To' },
    { key: 'subject', label: 'Subject', render: (r) => h('button', { class: 'link-btn strong sa-subject', onClick: () => openEmail(r) }, r.subject || '(no subject)') },
    { key: 'source', label: 'Source', render: (r) => badge(r.source || 'flow', r.source === 'User' ? 'brand' : '') },
    { key: 'sentBy', label: 'Sent By', render: (r) => r.sentBy || h('span', { class: 'muted' }, 'Automated Process') },
    { key: 'related', label: 'Related To', render: relatedLink, sort: (r) => names[r.related_id] || '' },
  ] });
  table.el.addEventListener('click', (e) => {
    const tr = e.target.closest('tbody tr');
    if (!tr || e.target.closest('a, button')) return;
    const i = [...tr.parentNode.children].indexOf(tr);
    const btn = tr.querySelector('.sa-subject');
    if (btn && i >= 0) btn.click();
  });
  function openEmail(r) {
    const m = modal({ title: r.subject || '(no subject)', size: 'lg', body: h('div',
      h('div', { class: 'detail-grid mb-16' }, detailField('To', r.to_addr), detailField('Sent', fmt.datetime(r.sent_at)), detailField('Sent By', r.sentBy || 'Automated Process'), detailField('Source', r.source), detailField('Related To', relatedLink(r)), detailField('Email ID', h('code', r.id))),
      h('div', { class: 'form-label' }, 'Body'),
      h('div', { class: 'sa-email-body pre-wrap' }, r.body || h('span', { class: 'muted' }, '(empty)'))),
    footer: [h('button', { class: 'btn btn-brand', onClick: () => m.close() }, 'Close')] });
  }
  const count = h('span', { class: 'muted small' });
  const apply = () => { const f = filtered(); count.textContent = `${f.length} of ${rows.length} emails`; table.setRows(f); };
  apply();
  const sourceSel = select([['', 'All sources'], ...sources.map((s) => [s, s])], '', { cls: 'input input-sm', ariaLabel: 'Filter by source', onChange: (v) => { source = v; apply(); } });
  sourceSel.style.width = '180px';
  const download = h('button', { class: 'btn', onClick: () => downloadCsv('email-log', [['sent_at', 'Sent'], ['to_addr', 'To'], ['subject', 'Subject'], ['source', 'Source'], ['sentBy', 'Sent By'], ['related_id', 'Related To'], ['body', 'Body']], filtered()) }, icon('download'), 'Download CSV');
  mount(container, header([download]),
    h('div', { class: 'card' },
      h('div', { class: 'sa-toolbar' }, sourceSel, count, h('div', { class: 'spacer' }), searchBox('Search emails...', (t) => { term = t; apply(); })),
      rows.length ? table.el : emptyState('No emails sent yet', 'Emails sent from records, flows and approvals will appear here.', { iconName: 'mail' })));
}
