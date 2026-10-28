// App shell: login, global header, app launcher, navigation bar, router.
import { h, icon, mount, clear, fmt, modal, showMenu, toast, debounce, objIcon, avatar, store, spinner, setLocale, emptyState } from './lib.js';
import { GET, POST, state, loadSession, loadMeta, setUnauthorizedHandler, getObj, objForId, can, me } from './api.js';
import { recordForm } from './fields.js';

// ---------- routes ----------
// Each view module exports default async (root, ctx) => optional cleanup function.
const ROUTES = [
  { re: /^\/?$/, redirect: '/home' },
  { re: /^\/home$/, load: () => import('./views/home.js'), nav: 'home' },
  { re: /^\/o\/([^/]+)$/, keys: ['object'], load: () => import('./views/list.js'), nav: (p) => p.object },
  { re: /^\/r\/([^/]+)$/, keys: ['id'], load: () => import('./views/record.js'), nav: (p) => objForId(p.id)?.apiName },
  { re: /^\/search$/, load: () => import('./views/search.js') },
  { re: /^\/reports$/, load: () => import('./views/reports.js'), nav: 'reports' },
  { re: /^\/reports\/new$/, load: () => import('./views/report-builder.js'), nav: 'reports', params: { id: 'new' } },
  { re: /^\/reports\/([^/]+)\/edit$/, keys: ['id'], load: () => import('./views/report-builder.js'), nav: 'reports' },
  { re: /^\/reports\/([^/]+)$/, keys: ['id'], load: () => import('./views/report-view.js'), nav: 'reports' },
  { re: /^\/dashboards$/, load: () => import('./views/dashboards.js'), nav: 'dashboards' },
  { re: /^\/dashboards\/new$/, load: () => import('./views/dashboard-builder.js'), nav: 'dashboards', params: { id: 'new' } },
  { re: /^\/dashboards\/([^/]+)\/edit$/, keys: ['id'], load: () => import('./views/dashboard-builder.js'), nav: 'dashboards' },
  { re: /^\/dashboards\/([^/]+)$/, keys: ['id'], load: () => import('./views/dashboard-view.js'), nav: 'dashboards' },
  { re: /^\/chatter$/, load: () => import('./views/chatter.js'), nav: 'chatter' },
  { re: /^\/calendar$/, load: () => import('./views/calendar.js'), nav: 'calendar' },
  { re: /^\/approvals$/, load: () => import('./views/approvals.js') },
  { re: /^\/recyclebin$/, load: () => import('./views/recyclebin.js') },
  { re: /^\/settings$/, load: () => import('./views/settings.js') },
  { re: /^\/devconsole$/, load: () => import('./views/devconsole.js'), full: true },
  { re: /^\/setup(?:\/(.*))?$/, keys: ['path'], load: () => import('./setup/index.js'), nav: 'setup', full: true },
];

export const SPECIAL_ITEMS = {
  home: { label: 'Home', icon: 'home', href: '#/home' },
  reports: { label: 'Reports', icon: 'chart', href: '#/reports' },
  dashboards: { label: 'Dashboards', icon: 'dashboard', href: '#/dashboards' },
  chatter: { label: 'Chatter', icon: 'message', href: '#/chatter' },
  calendar: { label: 'Calendar', icon: 'calendar', href: '#/calendar' },
  approvals: { label: 'Approvals', icon: 'approval', href: '#/approvals' },
};

// ---------- shared app API for views ----------
export const app = {
  navigate(path) { location.hash = '#' + path.replace(/^#/, ''); },
  reload() { route(); },
  setTitle(t) { document.title = t ? `${t} | Slavy` : 'Slavy'; },
  async refreshMeta() { await loadMeta(); drawNav(); },
  currentApp() { return currentApp; },
  setNavActive(key) { navActive = key; drawNav(); },
};
window.slavy = app;

let root, mainEl, navEl, currentApp, navActive, cleanup, notifTimer;

// ---------- boot ----------
async function boot() {
  root = document.getElementById('app');
  applyTheme(store.get('theme', 'auto'));
  setUnauthorizedHandler(() => { if (state.session) { state.session = null; showLogin('Your session has expired. Please log in again.'); } });
  try {
    await loadSession();
  } catch {
    return showLogin();
  }
  await startApp();
}

async function startApp() {
  mount(root, spinner());
  await loadMeta();
  setLocale({ currency: state.session.org?.currency, locale: state.session.org?.locale });
  const apps = state.apps;
  currentApp = apps.find((a) => a.id === store.get('app')) || apps[0] || { label: 'Slavy', items: ['home'] };
  drawShell();
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', globalKeys);
  document.addEventListener('slavy:data-changed', () => { if (/^#\/(r|o)\//.test(location.hash) && !document.querySelector('.modal-backdrop')) route(); });
  route();
  pollNotifications();
}

export function applyTheme(mode) {
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  store.set('theme', mode);
}

// ---------- login ----------
const DEMO_USERS = [
  ['admin@slavy.dev', 'System Administrator'], ['vp.sales@slavy.dev', 'VP Sales'], ['sales.mgr@slavy.dev', 'Sales Manager'],
  ['rep1@slavy.dev', 'Sales Rep'], ['support@slavy.dev', 'Support Agent'], ['marketing@slavy.dev', 'Marketing'],
];

function showLogin(message) {
  window.removeEventListener('hashchange', route);
  document.removeEventListener('keydown', globalKeys);
  clearInterval(notifTimer);
  app.setTitle('Login');
  const username = h('input', { class: 'input input-lg', id: 'username', autocomplete: 'username', value: store.get('lastUser', ''), style: { height: '40px' } });
  const password = h('input', { class: 'input', id: 'password', type: 'password', autocomplete: 'current-password', style: { height: '40px' } });
  const err = h('div', { class: ['alert danger', !message && 'hidden'] }, message || '');
  const submit = h('button', { class: 'btn btn-brand btn-lg', type: 'submit', style: { width: '100%' } }, 'Log In');
  const form = h('form', {
    class: 'col gap-12',
    onSubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      err.classList.add('hidden');
      try {
        await POST('/api/login', { username: username.value, password: password.value });
        store.set('lastUser', username.value);
        await loadSession();
        await startApp();
      } catch (ex) {
        err.textContent = ex.message;
        err.classList.remove('hidden');
      } finally {
        submit.disabled = false;
      }
    },
  },
  err,
  h('div', h('label', { class: 'form-label', for: 'username' }, 'Username'), username),
  h('div', h('label', { class: 'form-label', for: 'password' }, 'Password'), password),
  submit);

  const remember = h('input', { type: 'checkbox', checked: !!store.get('lastUser') });
  form.appendChild(h('label', { class: 'checkbox small' }, remember, 'Remember me'));
  form.addEventListener('submit', () => { if (!remember.checked) store.set('lastUser', ''); }, true);
  mount(root, h('div', { class: 'login-wrap' },
    h('div', { class: 'login-panel' },
      h('div', { class: 'login-card' },
        h('div', { class: 'logo center mb-16', style: { justifyContent: 'center', fontSize: '30px' } }, h('span', { class: 'logo-mark', style: { width: '48px', height: '48px', fontSize: '24px' } }, 'S'), 'slavy'),
        h('div', { class: 'login-box' }, form,
          h('div', { class: 'row mt-16 small' }, h('button', { class: 'link-btn', type: 'button', onClick: () => { err.textContent = 'Ask your Slavy administrator to reset your password (Setup → Users → Reset Password).'; err.className = 'alert'; } }, 'Forgot Your Password?'))),
        h('div', { class: 'small muted mt-16' }, 'Demo users (password ', h('span', { class: 'kbd' }, 'slavy123'), '):'),
        h('div', { class: 'demo-users' }, DEMO_USERS.map(([u, label]) => h('button', {
          class: 'demo-user', type: 'button', onClick: () => { username.value = u; password.value = 'slavy123'; form.requestSubmit(); },
        }, h('div', { class: 'strong' }, label), h('div', { class: 'muted truncate' }, u)))),
        h('div', { class: 'tiny muted center mt-24' }, '© Slavy. All rights reserved.'))),
    h('div', { class: 'login-hero' },
      h('div'),
      h('div', h('div', { class: 'small', style: { textTransform: 'uppercase', letterSpacing: '.1em', opacity: 0.8 } }, 'Slavy Platform'),
        h('h1', { class: 'mt-8' }, 'Customer success, powered by metadata.'),
        h('p', { class: 'mt-16' }, 'Sales, service, marketing and your own custom apps — with automation, security, analytics and APIs built in. Configure it in Setup; every list, record page, report and API endpoint just works.')),
      h('div', { class: 'small', style: { opacity: 0.7 } }, 'Built on the Slavy platform'))));
  (username.value ? password : username).focus();
}

// ---------- shell ----------
function drawShell() {
  navEl = h('nav', { class: 'app-nav', 'aria-label': 'App navigation' });
  mainEl = h('main', { class: 'main', id: 'main' });
  mount(root, h('div', { class: 'app' }, header(), navEl, mainEl));
  drawNav();
}

function header() {
  const searchInput = h('input', { class: 'input', id: 'global-search', placeholder: 'Search...', autocomplete: 'off', 'aria-label': 'Search Slavy' });
  let panel = null;
  const closePanel = () => { panel?.remove(); panel = null; };
  const runSearch = debounce(async () => {
    const q = searchInput.value.trim();
    if (q.length < 2) { closePanel(); return; }
    let groups = [];
    try { groups = await GET(`/api/search?q=${encodeURIComponent(q)}${scope.value ? `&object=${scope.value}` : ''}`); } catch { /* ignore */ }
    if (!panel) { panel = h('div', { class: 'search-panel' }); searchBox.appendChild(panel); }
    clear(panel);
    panel.appendChild(h('a', { class: 'menu-item', href: `#/search?q=${encodeURIComponent(q)}`, onClick: closePanel }, icon('search'), h('span', 'Show more results for ', h('strong', `"${q}"`))));
    if (!groups.length) panel.appendChild(h('div', { class: 'menu-item muted' }, 'No results'));
    for (const g of groups.slice(0, 6)) {
      panel.appendChild(h('div', { class: 'search-group-label' }, `${g.label} (${g.total})`));
      for (const r of g.records.slice(0, 4)) {
        const obj = getObj(g.object);
        const sub = g.columns.slice(1, 3).map((c) => r._labels?.[c] || r[c]).filter(Boolean).join(' • ');
        panel.appendChild(h('a', { class: 'menu-item', href: `#/r/${r.Id}`, onClick: () => { closePanel(); searchInput.value = ''; } },
          objIcon(obj, 'sm'), h('div', { class: 'grow' }, h('div', { class: 'truncate' }, r.Name), sub ? h('div', { class: 'small muted truncate' }, sub) : null)));
      }
    }
  }, 220);
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && searchInput.value.trim()) { closePanel(); app.navigate(`/search?q=${encodeURIComponent(searchInput.value.trim())}${scope.value ? `&object=${scope.value}` : ''}`); }
    if (e.key === 'Escape') { closePanel(); searchInput.blur(); }
  });
  searchInput.addEventListener('blur', () => setTimeout(closePanel, 200));
  const scope = h('select', { class: 'search-scope', 'aria-label': 'Search scope', onChange: () => { searchInput.placeholder = scope.value ? `Search ${getObj(scope.value)?.pluralLabel}...` : 'Search...'; searchInput.focus(); } },
    h('option', { value: '' }, 'All'),
    [...state.objects.values()].filter((o) => o.searchable !== false && o.perms.read).sort((a, b) => a.pluralLabel.localeCompare(b.pluralLabel)).map((o) => h('option', { value: o.apiName }, o.pluralLabel)));
  const searchBox = h('div', { class: 'header-search with-scope' }, scope, icon('search'), searchInput);

  const notifCount = h('span', { class: 'count hidden' });
  const user = me();
  return h('header', { class: 'global-header' },
    h('a', { class: 'logo', href: '#/home', 'aria-label': 'Slavy home' }, h('span', { class: 'logo-mark' }, 'S'), h('span', 'slavy')),
    searchBox,
    h('div', { class: 'header-actions' },
      hbtn('star', 'Favorites', (e) => favoritesMenu(e.currentTarget)),
      (() => { const b = hbtn('plus', 'Global Actions', (e) => globalActionsMenu(e.currentTarget)); b.classList.add('boxed'); return b; })(),
      (() => { const b = hbtn('sparkles', 'Slavy Agent', () => import('./ai/assistant.js').then((m) => m.toggleAssistant())); b.classList.add('ai-header-btn'); return b; })(),
      hbtn('help', 'Help', () => helpModal()),
      can('ViewSetup') || can('CustomizeApplication') || can('ManageUsers') || can('ModifyAllData') || can('RunSoql')
        ? hbtn('gear', 'Setup', (e) => setupMenu(e.currentTarget)) : null,
      (() => { const b = hbtn('bell', 'Notifications', (e) => notificationsMenu(e.currentTarget)); b.appendChild(notifCount); b.id = 'notif-btn'; return b; })(),
      h('button', { class: 'header-btn', 'aria-label': 'View profile', onClick: (e) => profileMenu(e.currentTarget) }, avatar(user.Name, 'sm'))));
}

function hbtn(name, label, onClick) {
  return h('button', { class: 'header-btn', title: label, 'aria-label': label, onClick }, icon(name));
}

function navItems() {
  return (currentApp?.items || ['home']).map((key) => {
    if (SPECIAL_ITEMS[key]) return { key, ...SPECIAL_ITEMS[key] };
    const o = getObj(key);
    return o ? { key: o.apiName, label: o.pluralLabel, href: `#/o/${o.apiName}`, obj: o } : null;
  }).filter(Boolean);
}

function drawNav() {
  if (!navEl) return;
  clear(navEl);
  navEl.appendChild(h('button', { class: 'app-launcher', onClick: appLauncher, title: 'App Launcher', 'aria-label': 'App Launcher' },
    h('span', { class: 'waffle' }, Array.from({ length: 9 }, () => h('i'))), h('span', { class: 'app-name' }, currentApp?.label || 'Slavy')));
  const items = h('div', { class: 'nav-items' });
  const list = navItems();
  for (const it of list) {
    const a = h('a', { class: ['nav-item', navActive === it.key && 'active'], href: it.href }, it.label);
    if (it.obj) {
      a.appendChild(h('button', { class: 'caret', 'aria-label': `${it.label} menu`, onClick: (e) => { e.preventDefault(); e.stopPropagation(); objectNavMenu(e.currentTarget, it.obj); } }, icon('chevronDown', { size: 14 })));
    }
    items.appendChild(a);
  }
  // Show the current object as a temporary tab when it isn't part of the app.
  if (navActive && !list.some((i) => i.key === navActive) && getObj(navActive)) {
    const o = getObj(navActive);
    items.appendChild(h('a', { class: 'nav-item active', href: `#/o/${o.apiName}` }, h('span', { class: 'muted', style: { marginRight: '4px' } }, '•'), o.pluralLabel));
  }
  navEl.appendChild(items);
}

async function objectNavMenu(anchor, obj) {
  let recent = [];
  try { recent = (await GET('/api/recent')).filter((r) => r.object === obj.apiName).slice(0, 5); } catch { /* ignore */ }
  showMenu(anchor, [
    obj.perms.create ? { label: `New ${obj.label}`, icon: 'plus', onClick: () => newRecord(obj.apiName) } : null,
    { header: 'Recent records' },
    ...(recent.length ? recent.map((r) => ({ label: r.Name, href: `#/r/${r.Id}` })) : [{ label: 'No recent records', disabled: true }]),
    'sep',
    { label: `All ${obj.pluralLabel}`, icon: 'list', href: `#/o/${obj.apiName}` },
  ]);
}

export async function newRecord(objApi, defaults = {}) {
  const rec = await recordForm(objApi, { mode: 'new', defaults });
  if (rec) app.navigate(`/r/${rec.Id}`);
  return rec;
}

// ---------- app launcher ----------
function appLauncher() {
  const q = h('input', { class: 'input', placeholder: 'Search apps and items...', autocomplete: 'off' });
  const content = h('div');
  const extras = [
    { label: 'Reports', href: '#/reports', icon: 'chart' }, { label: 'Dashboards', href: '#/dashboards', icon: 'dashboard' },
    { label: 'Chatter', href: '#/chatter', icon: 'message' }, { label: 'Calendar', href: '#/calendar', icon: 'calendar' },
    { label: 'Approval Requests', href: '#/approvals', icon: 'approval' }, { label: 'Recycle Bin', href: '#/recyclebin', icon: 'recycle' },
    can('RunSoql') || can('ModifyAllData') ? { label: 'Developer Console', href: '#/devconsole', icon: 'code' } : null,
  ].filter(Boolean);
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    const apps = state.apps.filter((a) => !term || a.label.toLowerCase().includes(term));
    const objs = [...state.objects.values()].filter((o) => o.perms.read && !['CampaignMember', 'OpportunityLineItem'].includes(o.apiName)).filter((o) => !term || o.pluralLabel.toLowerCase().includes(term)).sort((a, b) => a.pluralLabel.localeCompare(b.pluralLabel));
    const ex = extras.filter((e) => !term || e.label.toLowerCase().includes(term));
    mount(content,
      apps.length ? [h('h3', { class: 'mb-8' }, 'Apps'), h('div', { class: 'grid-3 mb-16' }, apps.map((a) => h('button', {
        class: 'card', style: { textAlign: 'left', padding: '12px', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', border: a.id === currentApp?.id ? '2px solid var(--brand)' : undefined },
        onClick: () => { switchApp(a); m.close(); },
      }, h('span', { class: 'obj-icon lg', style: { background: a.color } }, a.icon || a.label[0]), h('div', { class: 'grow' }, h('div', { class: 'strong' }, a.label), h('div', { class: 'small muted' }, a.description)))))] : null,
      h('h3', { class: 'mb-8' }, 'All Items'),
      h('div', { class: 'grid-3' },
        objs.map((o) => h('a', { class: 'menu-item', href: `#/o/${o.apiName}`, onClick: () => m.close() }, objIcon(o, 'sm'), o.pluralLabel)),
        ex.map((e) => h('a', { class: 'menu-item', href: e.href, onClick: () => m.close() }, h('span', { class: 'obj-icon sm', style: { background: '#475569' } }, icon(e.icon, { size: 13 })), e.label))));
  };
  q.addEventListener('input', draw);
  draw();
  const m = modal({ title: 'App Launcher', size: 'lg', body: h('div', h('div', { class: 'input-group mb-16' }, icon('search'), q), content) });
  q.focus();
}

function switchApp(a) {
  currentApp = a;
  store.set('app', a.id);
  drawNav();
  const first = navItems()[0];
  app.navigate(first ? first.href.slice(1) : '/home');
}

// ---------- header menus ----------
async function favoritesMenu(anchor) {
  let favs = [];
  try { favs = await GET('/api/favorites'); } catch { /* ignore */ }
  const here = location.hash || '#/home';
  const isFav = favs.some((f) => f.target === here);
  showMenu(anchor, [
    { label: isFav ? 'Remove from Favorites' : 'Add current page to Favorites', icon: 'star', onClick: async () => {
      const r = await POST('/api/favorites', { target: here, label: document.title.replace(/ \| Slavy$/, '') });
      toast(r.favorite ? 'Added to favorites' : 'Removed from favorites', 'success');
    } },
    { header: 'Favorites' },
    ...(favs.length ? favs.map((f) => ({ label: f.label, icon: 'star', href: f.target })) : [{ label: 'No favorites yet', disabled: true }]),
  ], { align: 'right', width: 260 });
}

function globalActionsMenu(anchor) {
  const acts = [
    ['Task', 'New Task', 'task'], ['Event', 'New Event', 'calendar'], ['Contact', 'New Contact', 'user'], ['Account', 'New Account', 'building'],
    ['Opportunity', 'New Opportunity', 'target'], ['Case', 'New Case', 'message'], ['Lead', 'New Lead', 'zap'],
  ].filter(([o]) => getObj(o)?.perms.create);
  showMenu(anchor, [
    { header: 'Global Actions' },
    ...acts.map(([o, label, ic]) => ({ label, icon: ic, onClick: () => newRecord(o) })),
    getObj('Task')?.perms.create ? { label: 'Log a Call', icon: 'phone', onClick: () => recordForm('Task', { mode: 'new', title: 'Log a Call', defaults: { TaskSubtype: 'Call', Status: 'Completed', Name: 'Call', ActivityDate: new Date().toISOString().slice(0, 10) } }) } : null,
  ], { align: 'right', width: 220 });
}

function setupMenu(anchor) {
  const objApi = navActive && getObj(navActive) ? navActive : null;
  showMenu(anchor, [
    can('ViewSetup') || can('CustomizeApplication') || can('ManageUsers') || can('ModifyAllData') ? { label: 'Setup', icon: 'gear', href: '#/setup' } : null,
    can('CustomizeApplication') && objApi ? { label: `Edit Object (${getObj(objApi).label})`, icon: 'database', href: `#/setup/objects/${objApi}` } : null,
    can('CustomizeApplication') ? { label: 'Object Manager', icon: 'layers', href: '#/setup/objects' } : null,
    can('RunSoql') || can('ModifyAllData') ? { label: 'Developer Console', icon: 'code', href: '#/devconsole' } : null,
    can('ManageFlows') ? { label: 'Flows', icon: 'flow', href: '#/setup/flows' } : null,
  ], { align: 'right', width: 240 });
}

async function notificationsMenu(anchor) {
  let data = { items: [], unread: 0 };
  try { data = await GET('/api/notifications'); } catch { /* ignore */ }
  showMenu(anchor, [
    { node: h('div', { class: 'row', style: { padding: '6px 10px' } }, h('strong', { class: 'grow' }, 'Notifications'),
      data.unread ? h('button', { class: 'link-btn small', onClick: async () => { await POST('/api/notifications/read', {}); pollNotifications(); } }, 'Mark all as read') : null) },
    'sep',
    ...(data.items.length ? data.items.slice(0, 15).map((n) => ({
      node: h('a', {
        class: 'menu-item', href: n.link || '#/home', style: { alignItems: 'flex-start', background: n.read ? '' : 'var(--brand-50)' },
        onClick: () => { POST('/api/notifications/read', { ids: [n.id] }).then(pollNotifications); },
      }, h('span', { class: 'dot', style: { background: n.read ? 'transparent' : 'var(--brand)', marginTop: '6px' } }),
      h('div', { class: 'grow', style: { whiteSpace: 'normal' } }, h('div', { class: 'strong' }, n.title), n.body ? h('div', { class: 'small muted' }, n.body) : null, h('div', { class: 'tiny muted' }, fmt.relative(n.createdAt)))),
    })) : [{ node: h('div', { class: 'muted center p-16' }, "You're all caught up.") }]),
  ], { align: 'right', width: 360 });
}

async function pollNotifications() {
  clearInterval(notifTimer);
  const tick = async () => {
    try {
      const { unread } = await GET('/api/notifications');
      const el = document.querySelector('#notif-btn .count');
      if (el) { el.textContent = unread > 9 ? '9+' : unread; el.classList.toggle('hidden', !unread); }
    } catch { /* ignore */ }
  };
  tick();
  notifTimer = setInterval(tick, 30000);
}

function profileMenu(anchor) {
  const u = me();
  const theme = store.get('theme', 'auto');
  showMenu(anchor, [
    { node: h('div', { class: 'row', style: { padding: '10px' } }, avatar(u.Name), h('div', h('div', { class: 'strong' }, u.Name), h('div', { class: 'small muted' }, u.Username), h('div', { class: 'tiny muted' }, `${u.ProfileName || ''}${u.RoleName ? ' · ' + u.RoleName : ''}`))) },
    'sep',
    { label: 'Settings', icon: 'user', href: '#/settings' },
    { label: 'Approval Requests', icon: 'approval', href: '#/approvals' },
    { label: 'Recycle Bin', icon: 'recycle', href: '#/recyclebin' },
    { header: 'Theme' },
    ...['auto', 'light', 'dark'].map((t) => ({ label: t === 'auto' ? 'System default' : t[0].toUpperCase() + t.slice(1), checked: theme === t, onClick: () => applyTheme(t) })),
    'sep',
    { label: 'Log Out', icon: 'logout', onClick: async () => { await POST('/api/logout').catch(() => {}); state.session = null; location.hash = ''; showLogin(); } },
  ], { align: 'right', width: 260 });
}

function helpModal() {
  const rows = [['/', 'Focus global search'], ['?', 'Show keyboard shortcuts'], ['g h', 'Go to Home'], ['g r', 'Go to Reports'], ['g d', 'Go to Dashboards'], ['g s', 'Go to Setup'],
    ['n', 'New record (on a list view)'], ['e', 'Edit record (on a record page)'], ['Ctrl/⌘ + Enter', 'Save the open form'], ['Esc', 'Close dialogs and menus']];
  modal({ title: 'Help & Keyboard Shortcuts', body: h('div',
    h('table', { class: 'table compact' }, h('tbody', rows.map(([k, d]) => h('tr', h('td', { style: { width: '160px' } }, k.split(' ').map((x) => h('span', { class: 'kbd', style: { marginRight: '4px' } }, x))), h('td', d))))),
    h('div', { class: 'alert mt-16' }, icon('info'), h('div', 'Slavy is a metadata-driven CRM. Admins can add objects, fields, rules, flows and layouts in ', h('a', { href: '#/setup', onClick: () => document.querySelector('.modal-backdrop')?.remove() }, 'Setup'), '. Developers can use SOQL in the Developer Console or the REST API at ', h('code', '/services/data/v1.0'), '.'))) });
}

let gPending = false;
function globalKeys(e) {
  const t = e.target;
  if (t.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.modal-backdrop')) return;
  if (e.key === '/') { e.preventDefault(); document.getElementById('global-search')?.focus(); return; }
  if (e.key === '?') { helpModal(); return; }
  if (gPending) {
    gPending = false;
    const map = { h: '/home', r: '/reports', d: '/dashboards', s: '/setup', c: '/chatter' };
    if (map[e.key]) app.navigate(map[e.key]);
    return;
  }
  if (e.key === 'g') { gPending = true; setTimeout(() => { gPending = false; }, 1000); return; }
  document.dispatchEvent(new CustomEvent('slavy:key', { detail: e.key }));
}

// ---------- router ----------
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, q = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(q)) };
}

let routeSeq = 0;
async function route() {
  if (!state.session || !mainEl) return;
  const { path, query } = parseHash();
  const seq = ++routeSeq;
  const r = ROUTES.find((x) => x.re.test(path));
  if (!r) { mount(mainEl, emptyState('Page not found', `There is nothing at ${path}.`, { iconName: 'alert', action: h('a', { class: 'btn btn-brand', href: '#/home' }, 'Go Home') })); return; }
  if (r.redirect) { app.navigate(r.redirect); return; }
  const m = r.re.exec(path);
  const params = { ...(r.params || {}) };
  (r.keys || []).forEach((k, i) => { params[k] = m[i + 1] ? decodeURIComponent(m[i + 1]) : ''; });
  navActive = typeof r.nav === 'function' ? r.nav(params) : r.nav || null;
  drawNav();
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  mainEl.classList.toggle('full', !!r.full);
  mount(mainEl, spinner());
  try {
    const mod = await r.load();
    if (seq !== routeSeq) return;
    const view = h('div', { class: 'view' });
    mount(mainEl, view);
    cleanup = await mod.default(view, { params, query, app });
    window.scrollTo(0, 0);
  } catch (e) {
    if (seq !== routeSeq) return;
    console.error(e);
    mount(mainEl, h('div', { class: 'card p-24' }, emptyState(e.status === 404 ? 'Not found' : e.status === 403 ? 'Insufficient privileges' : 'Something went wrong', e.message, { iconName: 'alert', action: h('a', { class: 'btn', href: '#/home' }, 'Go Home') })));
  }
}

boot();
