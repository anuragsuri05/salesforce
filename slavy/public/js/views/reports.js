// Reports home: left navigation (recent / mine / private / public / all / folders), search, sortable table, row actions.
// analyticsHome() is shared with the Dashboards home.
import { h, icon, mount, clear, fmt, confirmDialog, toast, showMenu, spinner, emptyState, store, badge } from '../lib.js';
import { GET, DEL, can, me, getObj } from '../api.js';
import { FORMAT_LABELS, exportReport, saveAsDialog } from './report-view.js';

export async function analyticsHome(root, { app, kind }) {
  const isReport = kind === 'report';
  const plural = isReport ? 'Reports' : 'Dashboards';
  const base = isReport ? '/reports' : '/dashboards';
  app.setTitle(plural);
  if (!can('RunReports')) {
    mount(root, h('div', { class: 'card' }, emptyState('Insufficient privileges', `You need the Run Reports permission to view ${plural.toLowerCase()}.`, { iconName: 'lock' })));
    return;
  }
  const canCreate = can(isReport ? 'ManageReports' : 'ManageDashboards');
  const navKey = `${kind}s:nav`;
  let nav = store.get(navKey, 'recent');
  let q = '';
  let sort = { key: nav === 'recent' ? null : 'name', dir: 1 };
  let items = [];

  const navEl = h('nav', { class: 'an-home-nav card', 'aria-label': `${plural} navigation` });
  const listTitle = h('h2');
  const countEl = h('div', { class: 'list-meta' });
  const tableHost = h('div', { class: 'list-body an-home-list' });
  const search = h('input', { class: 'input', placeholder: `Search ${plural.toLowerCase()}...`, 'aria-label': `Search ${plural.toLowerCase()}`, onInput: () => { q = search.value.trim().toLowerCase(); drawTable(); } });

  const recentIds = () => store.get(`recent:${kind}s`, []) || [];
  const folders = () => [...new Set(items.map((x) => x.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const NAV = [
    { id: 'recent', label: 'Recent', icon: 'clock' },
    { id: 'mine', label: 'Created by Me', icon: 'user' },
    { id: 'private', label: `Private ${plural}`, icon: 'lock' },
    { id: 'public', label: `Public ${plural}`, icon: 'globe' },
    { id: 'all', label: `All ${plural}`, icon: isReport ? 'chart' : 'dashboard' },
  ];
  const navLabel = (id) => (id.startsWith('folder:') ? id.slice(7) : NAV.find((n) => n.id === id)?.label || 'All');

  function filtered() {
    let list = items;
    if (nav === 'recent') {
      const ids = recentIds();
      const viewed = ids.map((id) => items.find((x) => x.id === id)).filter(Boolean);
      const rest = items.filter((x) => !ids.includes(x.id)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      list = [...viewed, ...rest].slice(0, 25);
    } else if (nav === 'mine') list = items.filter((x) => x.ownerId === me()?.Id);
    else if (nav === 'private') list = items.filter((x) => x.visibility !== 'public');
    else if (nav === 'public') list = items.filter((x) => x.visibility === 'public');
    else if (nav.startsWith('folder:')) list = items.filter((x) => x.folder === nav.slice(7));
    if (q) list = list.filter((x) => [x.name, x.description, x.folder, x.owner, getObj(x.object)?.label].some((v) => String(v || '').toLowerCase().includes(q)));
    if (sort.key) {
      list = [...list].sort((a, b) => {
        const va = a[sort.key] ?? '', vb = b[sort.key] ?? '';
        return String(va).localeCompare(String(vb), undefined, { numeric: true }) * sort.dir;
      });
    }
    return list;
  }

  function drawNav() {
    clear(navEl);
    const item = (id, label, ic, count) => h('button', { class: ['an-nav-item', nav === id && 'active'], 'aria-current': nav === id ? 'page' : null, onClick: () => { nav = id; store.set(navKey, id); if (id === 'recent') sort.key = null; else if (!sort.key) sort.key = 'name'; drawNav(); drawTable(); } },
      icon(ic), h('span', { class: 'grow truncate' }, label), count != null ? h('span', { class: 'an-nav-count' }, count) : null);
    navEl.appendChild(h('div', { class: 'an-nav-title' }, plural));
    NAV.forEach((n) => navEl.appendChild(item(n.id, n.label, n.icon)));
    const fl = folders();
    navEl.appendChild(h('div', { class: 'an-nav-title' }, 'Folders'));
    if (!fl.length) navEl.appendChild(h('div', { class: 'muted small', style: { padding: '4px 10px' } }, 'No folders yet'));
    fl.forEach((f) => navEl.appendChild(item(`folder:${f}`, f, 'folder', items.filter((x) => x.folder === f).length)));
    if (nav.startsWith('folder:') && !fl.includes(nav.slice(7))) { nav = 'all'; }
  }

  const th = (key, label) => h('th', {
    class: 'sortable', tabindex: 0, 'aria-sort': sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none',
    onClick: () => { if (sort.key === key) sort.dir = -sort.dir; else { sort.key = key; sort.dir = key === 'updatedAt' ? -1 : 1; } drawTable(); },
    onKeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); },
  }, label, sort.key === key ? icon(sort.dir > 0 ? 'arrowUp' : 'arrowDown', { size: 12 }) : null);

  function rowActions(x) {
    return [
      { label: isReport ? 'Run' : 'View', icon: isReport ? 'play' : 'eye', onClick: () => app.navigate(`${base}/${x.id}`) },
      x.canEdit && canCreate ? { label: 'Edit', icon: 'edit', onClick: () => app.navigate(`${base}/${x.id}/edit`) } : null,
      isReport && can('ManageReports') ? { label: 'Save As', icon: 'copy', onClick: async () => { const full = await GET(`/api/reports/${x.id}`).catch((e) => { toast(e.message, 'error'); }); if (!full) return; const s = await saveAsDialog(full); if (s) app.navigate(`/reports/${s.id}`); } } : null,
      isReport && can('ExportReports') ? { label: 'Export', icon: 'download', onClick: () => exportReport(x) } : null,
      x.canEdit ? 'sep' : null,
      x.canEdit ? { label: 'Delete', icon: 'trash', danger: true, onClick: async () => {
        if (!(await confirmDialog(`Delete the ${kind} "${x.name}"? This can't be undone.`, { title: `Delete ${isReport ? 'Report' : 'Dashboard'}`, confirmLabel: 'Delete', danger: true }))) return;
        try {
          await DEL(`/api${base}/${x.id}`);
          items = items.filter((i) => i.id !== x.id);
          toast(`${isReport ? 'Report' : 'Dashboard'} "${x.name}" was deleted.`, 'success');
          drawNav(); drawTable();
        } catch (e) { toast(e.message, 'error'); }
      } } : null,
    ].filter(Boolean);
  }

  function drawTable() {
    listTitle.textContent = navLabel(nav);
    const list = filtered();
    countEl.textContent = `${list.length} ${list.length === 1 ? kind : `${kind}s`}${q ? ` matching "${q}"` : ''}${nav === 'recent' ? ' · recently viewed first' : ''}`;
    if (!list.length) {
      mount(tableHost, emptyState(q ? `No ${plural.toLowerCase()} match "${q}"` : `No ${plural.toLowerCase()} here yet`,
        q ? 'Try a different search term.' : canCreate ? `Create a ${kind} to get started.` : '',
        { iconName: isReport ? 'chart' : 'dashboard', action: canCreate && !q ? h('a', { class: 'btn btn-brand', href: `#${base}/new` }, icon('plus'), `New ${isReport ? 'Report' : 'Dashboard'}`) : null }));
      return;
    }
    mount(tableHost, h('table', { class: 'table' },
      h('thead', h('tr', th('name', isReport ? 'Report Name' : 'Dashboard Name'), th('description', 'Description'), th('folder', 'Folder'),
        isReport ? th('object', 'Report Type') : null, th('owner', 'Created By'), th('updatedAt', 'Last Modified'), h('th', { style: { width: '44px' } }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', list.map((x) => h('tr',
        h('td', h('div', { class: 'row gap-8' },
          h('span', { class: 'an-list-icon' }, icon(isReport ? 'chart' : 'dashboard', { size: 14 })),
          h('a', { href: `#${base}/${x.id}`, class: 'strong' }, x.name),
          x.visibility !== 'public' ? h('span', { title: 'Private', class: 'muted' }, icon('lock', { size: 12 })) : null)),
        h('td', { class: 'muted', title: x.description || '' }, x.description || ''),
        h('td', h('button', { class: 'link-btn', onClick: () => { nav = `folder:${x.folder}`; store.set(navKey, nav); sort.key = sort.key || 'name'; drawNav(); drawTable(); } }, x.folder)),
        isReport ? h('td', h('span', getObj(x.object)?.pluralLabel || x.object), h('span', { class: 'muted small' }, ` · ${FORMAT_LABELS[x.format] || ''}`)) : null,
        h('td', x.owner || ''),
        h('td', { title: fmt.datetime(x.updatedAt) }, fmt.date(x.updatedAt), h('span', { class: 'muted small' }, ` · ${fmt.relative(x.updatedAt)}`)),
        h('td', h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': `Actions for ${x.name}`, title: 'Actions', onClick: (e) => showMenu(e.currentTarget, rowActions(x), { align: 'right' }) }, icon('chevronDown'))))))));
  }

  mount(root, spinner());
  try {
    items = await GET(`/api${base}`);
  } catch (e) {
    mount(root, h('div', { class: 'card' }, emptyState(`Couldn't load ${plural.toLowerCase()}`, e.message, { iconName: 'alert' })));
    return;
  }
  mount(root, h('div', { class: 'an-home' },
    h('div', { class: 'page-header an-page-header' },
      h('div', { class: 'title-row' },
        h('div', { class: 'an-hero-icon' }, icon(isReport ? 'chart' : 'dashboard')),
        h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, isReport ? 'Analytics' : 'Analytics'), h('h1', plural)),
        h('div', { class: 'actions' },
          canCreate ? h('a', { class: 'btn btn-brand', href: `#${base}/new` }, icon('plus'), `New ${isReport ? 'Report' : 'Dashboard'}`) : null,
          !isReport ? h('a', { class: 'btn', href: '#/reports' }, icon('chart'), 'Reports') : h('a', { class: 'btn', href: '#/dashboards' }, icon('dashboard'), 'Dashboards')))),
    h('div', { class: 'an-home-layout' },
      navEl,
      h('div', { class: 'card an-home-main' },
        h('div', { class: 'list-header' }, h('div', { class: 'grow' }, listTitle, countEl),
          h('div', { class: 'input-group', style: { width: '280px', maxWidth: '100%' } }, icon('search'), search)),
        tableHost))));
  drawNav();
  drawTable();
}

export default async function (root, ctx) {
  return analyticsHome(root, { ...ctx, kind: 'report' });
}
