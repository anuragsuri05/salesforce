// Setup Home: org stats, quick links, getting-started checklist, recent setup changes.
import { h, icon, fmt, mount, spinner, emptyState } from '../lib.js';
import { GET, can, me } from '../api.js';
import { setupHeader } from './index.js';
import { stat } from './admin-common.js';

const QUICK_LINKS = [
  { href: '#/setup/users', icon: 'user', title: 'Users', text: 'Add users, reset passwords and assign permission sets.', perm: 'ManageUsers' },
  { href: '#/setup/objects', icon: 'layers', title: 'Object Manager', text: 'Create custom objects, fields, layouts and validation rules.' },
  { href: '#/setup/flows', icon: 'flow', title: 'Flows', text: 'Automate business processes with record-triggered and scheduled flows.' },
  { href: '#/setup/sharing', icon: 'lock', title: 'Sharing Settings', text: 'Set org-wide defaults and open up access with sharing rules.' },
  { href: '#/setup/import', icon: 'upload', title: 'Data Import Wizard', text: 'Load leads, accounts, contacts and custom records from CSV.' },
  { href: '#/setup/profiles', icon: 'shield', title: 'Profiles', text: 'Control object, field and system permissions.', perm: 'ManageUsers' },
];

export default async function render(container, { app }) {
  app.setTitle('Setup Home');
  mount(container, setupHeader('Setup Home', { iconName: 'home', description: `Welcome, ${me()?.FirstName || me()?.Name || ''}. Manage your organization, users, security and data from here.` }), spinner());

  const safe = (p, fallback) => GET(p).catch(() => fallback);
  const [org, audit, users, flows, rules] = await Promise.all([
    GET('/api/setup/org'), safe('/api/setup/audit', []), safe('/api/setup/users', null), safe('/api/setup/meta/flow', []), safe('/api/setup/meta/sharingRule', []),
  ]);
  const s = org.stats || {};

  const tiles = h('div', { class: 'grid-4 mb-16' },
    stat('Active Users', fmt.number(s.users ?? 0), 'users', users ? `${users.length} total licenses used` : null),
    stat('Objects', fmt.number(s.objects ?? 0), 'layers', `${s.customObjects ?? 0} custom`),
    stat('Records', fmt.number(s.records ?? 0), 'database', `${fmt.number(Math.round(((s.records || 0) * 2) / 1024 * 10) / 10)} MB data storage`),
    stat('Active Flows', fmt.number(flows.filter((f) => f.active).length), 'flow', `${flows.length} total`));

  const quick = h('div', { class: 'sa-quick-grid' }, QUICK_LINKS.filter((q) => !q.perm || can(q.perm)).map((q) =>
    h('a', { class: 'card sa-quick', href: q.href },
      h('div', { class: 'sa-quick-icon' }, icon(q.icon)),
      h('div', { class: 'grow' }, h('div', { class: 'strong' }, q.title), h('div', { class: 'small muted' }, q.text)),
      icon('chevronRight', { cls: 'muted' }))));

  const company = org.company || {};
  const checklist = [
    { done: !!(company.name && company.phone && company.address), label: 'Complete your company information', href: '#/setup/company' },
    { done: (users?.length || 0) > 1, label: 'Add users to your organization', href: '#/setup/users/new' },
    { done: rules.length > 0, label: 'Review org-wide defaults and sharing rules', href: '#/setup/sharing' },
    { done: (s.customObjects || 0) > 0, label: 'Create a custom object', href: '#/setup/objects' },
    { done: flows.length > 0, label: 'Automate a process with a flow', href: '#/setup/flows' },
    { done: !!org.webToLead?.enabled, label: 'Capture leads from your website (Web-to-Lead)', href: '#/setup/webto' },
    { done: audit.some((a) => a.section === 'Data Management' && a.action === 'Import'), label: 'Import your existing data', href: '#/setup/import' },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);
  const gettingStarted = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('target'), h('h3', 'Getting Started'), h('span', { class: 'badge brand' }, `${doneCount}/${checklist.length}`)),
    h('div', { class: 'card-body' },
      h('div', { class: 'sa-progress mb-16', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Setup progress' }, h('span', { style: { width: pct + '%' } })),
      h('ul', { class: 'sa-checklist' }, checklist.map((c) => h('li', { class: c.done ? 'done' : '' },
        h('span', { class: 'sa-check-dot' }, c.done ? icon('check') : null),
        h('a', { href: c.href, class: 'grow' }, c.label))))));

  const recent = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('activity'), h('h3', 'Recent Setup Changes'), h('a', { href: '#/setup/audit', class: 'small' }, 'View all')),
    audit.length
      ? h('div', { class: 'card-body flush' }, h('ul', { class: 'sa-feed' }, audit.slice(0, 8).map((a) => h('li',
        h('span', { class: 'avatar sm' }, fmt.initials(a.user || 'S')),
        h('div', { class: 'grow' },
          h('div', h('strong', a.action), a.detail ? h('span', { class: 'muted' }, ` · ${a.detail}`) : null),
          h('div', { class: 'tiny muted' }, `${a.user || 'System'} · ${a.section} · ${fmt.relative(a.at)}`))))))
      : h('div', { class: 'card-body' }, emptyState('No setup changes yet', 'Changes made in Setup will show up here.', { iconName: 'activity' })));

  mount(container,
    setupHeader('Setup Home', { iconName: 'home', description: `${company.name || 'Your organization'} · Manage your organization, users, security and data.` }),
    tiles,
    h('h3', { class: 'sa-section-heading' }, 'Quick Links'),
    quick,
    h('div', { class: 'sa-home-cols mt-16' }, gettingStarted, recent));
}
