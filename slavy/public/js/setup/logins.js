// Login History: every login attempt with status, source IP and client; filter, search and CSV download.
import { h, icon, fmt, mount, spinner, badge, emptyState } from '../lib.js';
import { GET } from '../api.js';
import { setupHeader } from './index.js';
import { searchBox, segmented, dataTable, downloadCsv, parseAgent, stat } from './admin-common.js';

export default async function render(container, { app }) {
  app.setTitle('Login History');
  const header = (actions) => setupHeader('Login History', { crumb: 'Setup › Security', iconName: 'clock', actions,
    description: 'The last 500 login attempts to your organization, newest first.' });
  mount(container, header(), spinner());
  let rows;
  try { rows = await GET('/api/setup/logins'); } catch (e) { mount(container, header(), h('div', { class: 'card p-24' }, emptyState('Could not load login history', e.message, { iconName: 'lock' }))); return; }

  let status = 'all';
  let term = '';
  const filtered = () => rows.filter((r) => (status === 'all' || (status === 'success' ? r.status === 'Success' : r.status !== 'Success'))
    && (!term || [r.username, r.ip, r.status, r.user_agent].some((v) => String(v || '').toLowerCase().includes(term))));
  const table = dataTable({ rows: [], initialSort: { key: 'at', dir: 'desc' }, empty: 'No login attempts match your filters.', columns: [
    { key: 'at', label: 'Login Time', render: (r) => h('span', { title: fmt.relative(r.at) }, fmt.datetime(r.at)), sort: (r) => r.at },
    { key: 'username', label: 'Username', render: (r) => (r.user_id ? h('a', { href: `#/setup/users/${r.user_id}` }, r.username) : h('span', r.username)) },
    { key: 'status', label: 'Status', render: (r) => badge(r.status, r.status === 'Success' ? 'success' : 'danger') },
    { key: 'ip', label: 'Source IP', render: (r) => h('code', r.ip || '—') },
    { key: 'client', label: 'Client', render: (r) => h('span', { title: r.user_agent || '' }, parseAgent(r.user_agent)), sort: (r) => parseAgent(r.user_agent) },
    { key: 'type', label: 'Login Type', render: (r) => (/curl|node|undici|python|postman/i.test(r.user_agent || '') ? 'API' : 'Application'), sortable: false },
  ] });
  const count = h('span', { class: 'muted small' });
  const apply = () => { const f = filtered(); count.textContent = `${f.length} of ${rows.length}`; table.setRows(f); };
  apply();

  const failures = rows.filter((r) => r.status !== 'Success');
  const users = new Set(rows.filter((r) => r.status === 'Success').map((r) => r.username));
  const download = h('button', { class: 'btn', onClick: () => downloadCsv('login-history', [['at', 'Login Time'], ['username', 'Username'], ['status', 'Status'], ['ip', 'Source IP'], [(r) => parseAgent(r.user_agent), 'Client'], ['user_agent', 'User Agent']], filtered()) }, icon('download'), 'Download CSV');
  mount(container, header([download]),
    h('div', { class: 'grid-3 mb-16' },
      stat('Login Attempts', fmt.number(rows.length), 'clock'),
      stat('Failed Attempts', fmt.number(failures.length), 'alert', rows.length ? `${fmt.number((failures.length / rows.length) * 100, 1)}% failure rate` : null),
      stat('Distinct Users', fmt.number(users.size), 'users')),
    h('div', { class: 'card' },
      h('div', { class: 'sa-toolbar' },
        segmented([['all', 'All'], ['success', 'Success'], ['failed', 'Failed']], status, (v) => { status = v; apply(); }),
        count, h('div', { class: 'spacer' }), searchBox('Search username, IP, client...', (t) => { term = t; apply(); })),
      table.el));
}
