// Setup Audit Trail: who changed what in Setup, with search, section filter and CSV download.
import { h, icon, fmt, mount, spinner, badge, emptyState } from '../lib.js';
import { GET } from '../api.js';
import { setupHeader } from './index.js';
import { searchBox, select, dataTable, downloadCsv } from './admin-common.js';

export default async function render(container, { app }) {
  app.setTitle('Setup Audit Trail');
  const header = (actions) => setupHeader('View Setup Audit Trail', { crumb: 'Setup › Monitoring', iconName: 'activity', actions,
    description: 'The last 500 configuration changes made in your organization, newest first.' });
  mount(container, header(), spinner());
  let rows;
  try { rows = await GET('/api/setup/audit'); } catch (e) { mount(container, header(), h('div', { class: 'card p-24' }, emptyState('Could not load the audit trail', e.message, { iconName: 'lock' }))); return; }

  let term = '';
  let section = '';
  const sections = [...new Set(rows.map((r) => r.section).filter(Boolean))].sort();
  const filtered = () => rows.filter((r) => (!section || r.section === section) && (!term || [r.user, r.section, r.action, r.detail].some((v) => String(v || '').toLowerCase().includes(term))));
  const table = dataTable({ rows: [], initialSort: { key: 'at', dir: 'desc' }, empty: 'No setup changes match your filters.', columns: [
    { key: 'at', label: 'Date', render: (r) => h('span', { class: 'nowrap', title: fmt.relative(r.at) }, fmt.datetime(r.at)), sort: (r) => r.at },
    { key: 'user', label: 'User', render: (r) => (r.user_id ? h('a', { href: `#/setup/users/${r.user_id}` }, r.user || r.user_id) : h('span', { class: 'muted' }, r.user || 'System')) },
    { key: 'section', label: 'Section', render: (r) => badge(r.section || 'Setup') },
    { key: 'action', label: 'Action', render: (r) => h('span', { class: 'strong' }, r.action) },
    { key: 'detail', label: 'Detail', render: (r) => h('span', { class: 'sa-wrap', title: r.detail || '' }, r.detail || '') },
  ] });
  const count = h('span', { class: 'muted small' });
  const apply = () => { const f = filtered(); count.textContent = `${f.length} of ${rows.length} changes`; table.setRows(f); };
  apply();
  const sectionSel = select([['', 'All sections'], ...sections.map((s) => [s, s])], '', { cls: 'input input-sm', ariaLabel: 'Filter by section', onChange: (v) => { section = v; apply(); } });
  sectionSel.style.width = '200px';
  const download = h('button', { class: 'btn', onClick: () => downloadCsv('setup-audit-trail', [['at', 'Date'], ['user', 'User'], ['section', 'Section'], ['action', 'Action'], ['detail', 'Detail']], filtered()) }, icon('download'), 'Download CSV');
  mount(container, header([download]),
    h('div', { class: 'card' },
      h('div', { class: 'sa-toolbar' }, sectionSel, count, h('div', { class: 'spacer' }), searchBox('Search changes...', (t) => { term = t; apply(); })),
      table.el));
}
