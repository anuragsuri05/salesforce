// Setup shell: left navigation tree with Quick Find, and lazy-loaded setup pages.
// Each page module exports default async (container, { segments, query, app }) => optional cleanup.
import { h, icon, mount, clear, spinner, emptyState } from '../lib.js';
import { can } from '../api.js';

export const SETUP_NAV = [
  { group: 'Setup', items: [
    { key: 'home', label: 'Setup Home', icon: 'home', load: () => import('./home.js') },
  ] },
  { group: 'AI', items: [
    { key: 'ai', label: 'AI Settings', icon: 'sparkles', load: () => import('./ai-settings.js') },
    { key: 'agent', label: 'Agent Builder', icon: 'message', load: () => import('./ai-agent.js') },
    { key: 'prompts', label: 'Prompt Builder', icon: 'edit', load: () => import('./ai-prompts.js') },
    { key: 'scoring', label: 'Predictive Scoring', icon: 'chart', load: () => import('./ai-scoring.js') },
    { key: 'ailog', label: 'AI Audit Trail', icon: 'activity', load: () => import('./ai-log.js') },
  ] },
  { group: 'Administration', items: [
    { key: 'users', label: 'Users', icon: 'user', perm: 'ManageUsers', load: () => import('./users.js') },
    { key: 'profiles', label: 'Profiles', icon: 'shield', perm: 'ManageUsers', load: () => import('./profiles.js') },
    { key: 'permsets', label: 'Permission Sets', icon: 'key', perm: 'ManageUsers', load: () => import('./permsets.js') },
    { key: 'roles', label: 'Roles', icon: 'users', perm: 'ManageUsers', load: () => import('./roles.js') },
    { key: 'groups', label: 'Public Groups & Queues', icon: 'users', perm: 'ManageUsers', load: () => import('./groups.js') },
    { key: 'company', label: 'Company Information', icon: 'building', load: () => import('./company.js') },
  ] },
  { group: 'Security', items: [
    { key: 'sharing', label: 'Sharing Settings', icon: 'lock', load: () => import('./sharing.js') },
    { key: 'logins', label: 'Login History', icon: 'clock', perm: 'ManageUsers', load: () => import('./logins.js') },
  ] },
  { group: 'Objects and Fields', items: [
    { key: 'objects', label: 'Object Manager', icon: 'layers', load: () => import('./objects.js') },
  ] },
  { group: 'User Interface', items: [
    { key: 'apps', label: 'App Manager', icon: 'dashboard', load: () => import('./apps.js') },
  ] },
  { group: 'Process Automation', items: [
    { key: 'flows', label: 'Flows', icon: 'flow', load: () => import('./flows.js') },
    { key: 'approvals', label: 'Approval Processes', icon: 'approval', load: () => import('./approvals.js') },
    { key: 'scheduled', label: 'Scheduled Jobs', icon: 'clock', load: () => import('./scheduled.js') },
    { key: 'emails', label: 'Email Log', icon: 'mail', load: () => import('./emails.js') },
  ] },
  { group: 'Data', items: [
    { key: 'import', label: 'Data Import Wizard', icon: 'upload', load: () => import('./import.js') },
    { key: 'export', label: 'Data Export', icon: 'download', load: () => import('./export.js') },
    { key: 'webto', label: 'Web-to-Lead & Web-to-Case', icon: 'globe', load: () => import('./webto.js') },
  ] },
  { group: 'Monitoring', items: [
    { key: 'audit', label: 'Setup Audit Trail', icon: 'activity', load: () => import('./audit.js') },
  ] },
  { group: 'Developer', items: [
    { key: 'api', label: 'API & SOQL', icon: 'code', load: () => import('./api.js') },
  ] },
];

const ALL = SETUP_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));

export function setupHeader(title, { crumb = 'Setup', iconName = 'gear', actions = [], description } = {}) {
  return h('div', { class: 'setup-page-header' },
    h('div', { class: 'setup-icon' }, icon(iconName)),
    h('div', { class: 'grow' }, h('div', { class: 'crumb' }, crumb), h('h1', title), description ? h('div', { class: 'muted small mt-8' }, description) : null),
    h('div', { class: 'row' }, actions));
}

export default async function render(root, { params, query, app }) {
  const allowed = can('ViewSetup') || can('CustomizeApplication') || can('ManageUsers') || can('ModifyAllData') || can('ManageFlows');
  if (!allowed) {
    mount(root, h('div', { class: 'card p-24' }, emptyState('Insufficient privileges', 'You need the "View Setup and Configuration" permission to access Setup.', { iconName: 'lock' })));
    return;
  }
  app.setTitle('Setup');
  const segments = (params.path || 'home').split('/').filter(Boolean).map(decodeURIComponent);
  const key = segments[0] || 'home';
  const page = ALL.find((p) => p.key === key);

  const find = h('input', { class: 'input input-sm', placeholder: 'Quick Find', 'aria-label': 'Quick Find' });
  const navList = h('div');
  const drawNav = () => {
    const term = find.value.trim().toLowerCase();
    clear(navList);
    for (const g of SETUP_NAV) {
      const items = g.items.filter((i) => !term || i.label.toLowerCase().includes(term) || g.group.toLowerCase().includes(term));
      if (!items.length) continue;
      navList.appendChild(h('div', { class: 'group' }, h('div', { class: 'group-title' }, g.group),
        items.map((i) => h('a', { href: `#/setup/${i.key}`, class: i.key === key ? 'active' : '' }, i.label))));
    }
  };
  find.addEventListener('input', drawNav);
  drawNav();

  const content = h('div', { class: 'setup-content' }, spinner());
  mount(root, h('div', { class: 'setup-layout' }, h('aside', { class: 'card setup-nav' }, h('div', { class: 'input-group mb-8' }, icon('search'), find), navList), content));

  if (!page) { mount(content, h('div', { class: 'card p-24' }, emptyState('Setup page not found', `No setup page called "${key}".`, { iconName: 'alert' }))); return; }
  try {
    const mod = await page.load();
    clear(content);
    return await mod.default(content, { segments: segments.slice(1), query, app, page });
  } catch (e) {
    console.error(e);
    mount(content, h('div', { class: 'card p-24' }, emptyState(e.status === 403 ? 'Insufficient privileges' : 'Could not load this page', e.message, { iconName: 'alert' })));
  }
}
