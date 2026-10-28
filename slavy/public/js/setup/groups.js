// Public Groups & Queues: list (tabs), editor with member picker, supported objects for queues.
import { h, icon, mount, clear, spinner, confirmDialog, toast, badge, emptyState, objIcon } from '../lib.js';
import { GET, POST, PUT, DEL, getObj } from '../api.js';
import { setupHeader } from './index.js';
import { canManageUsers, formRow, searchBox, dataTable, loadDirectory, groupUsers, apiNameFrom, readOnlyNote, userLink, segmented } from './admin-common.js';

export default async function render(container, { segments, app, query }) {
  if (segments[0]) return renderEditor(container, { id: segments[0], app, query });
  return renderList(container, { app, query });
}

const memberKind = (m) => (m.startsWith('sub:') ? 'roleSub' : m.startsWith('005') ? 'user' : 'role');

function memberLabel(m, dir) {
  const k = memberKind(m);
  if (k === 'user') return dir.users.find((u) => u.Id === m)?.Name || m;
  const r = dir.roles.find((x) => x.id === (k === 'roleSub' ? m.slice(4) : m));
  return r ? (k === 'roleSub' ? `${r.name} + subordinates` : r.name) : '(deleted role)';
}

// ---------- list ----------
async function renderList(container, { app, query }) {
  let kind = query?.tab === 'queues' ? 'queue' : 'public';
  app.setTitle('Public Groups & Queues');
  const canEdit = canManageUsers();
  const header = () => setupHeader('Public Groups & Queues', { crumb: 'Setup › Administration', iconName: 'users',
    description: 'Public groups bundle users and roles for sharing rules. Queues hold records (like leads and cases) until a member takes ownership.',
    actions: canEdit ? [h('button', { class: 'btn btn-brand', onClick: () => app.navigate(`/setup/groups/new?kind=${kind}`) }, icon('plus'), kind === 'queue' ? 'New Queue' : 'New Group')] : [] });
  mount(container, header(), spinner());
  const dir = await loadDirectory(['users', 'roles', 'groups']);
  let term = '';
  const body = h('div');
  const draw = () => {
    const rows = dir.groups.filter((g) => (g.kind === 'queue') === (kind === 'queue'))
      .filter((g) => !term || [g.label, g.name, g.email].some((v) => String(v || '').toLowerCase().includes(term)));
    const cols = [
      { key: 'label', label: 'Label', render: (g) => h('a', { class: 'strong', href: `#/setup/groups/${g.id}` }, g.label || g.name), sort: (g) => g.label || g.name },
      { key: 'name', label: 'Group Name', render: (g) => h('code', g.name) },
      { key: 'members', label: 'Members', render: (g) => h('div', { class: 'row wrap gap-4' }, (g.members || []).slice(0, 4).map((m) => h('span', { class: 'chip' }, memberLabel(m, dir))), (g.members || []).length > 4 ? h('span', { class: 'muted small' }, `+${g.members.length - 4}`) : null), sort: (g) => (g.members || []).length },
      { key: 'users', label: 'Users', cls: 'num', render: (g) => String(groupUsers(g, dir.users, dir.roles).length), sort: (g) => groupUsers(g, dir.users, dir.roles).length },
    ];
    if (kind === 'queue') {
      cols.splice(2, 0, { key: 'queueObjects', label: 'Supported Objects', render: (g) => h('div', { class: 'row wrap gap-4' }, (g.queueObjects || []).map((o) => h('span', { class: 'chip' }, getObj(o)?.label || o))) });
      cols.push({ key: 'email', label: 'Queue Email', render: (g) => (g.email ? h('a', { href: `mailto:${g.email}` }, g.email) : h('span', { class: 'muted' }, '—')) });
    }
    mount(body, dataTable({ columns: cols, rows, initialSort: { key: 'label', dir: 'asc' }, empty: kind === 'queue' ? 'No queues yet.' : 'No public groups yet.' }).el);
  };
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const drawTabs = () => mount(tabsEl, [['public', 'Public Groups'], ['queue', 'Queues']].map(([k, l]) =>
    h('button', { class: ['tab', k === kind && 'active'], role: 'tab', 'aria-selected': String(k === kind), onClick: () => {
      kind = k; history.replaceState(null, '', `#/setup/groups${k === 'queue' ? '?tab=queues' : ''}`); drawTabs(); draw(); const nh = header(); headerEl.replaceWith(nh); headerEl = nh;
    } }, l, ' ', badge(String(dir.groups.filter((g) => (g.kind === 'queue') === (k === 'queue')).length)))));
  drawTabs();
  draw();
  let headerEl = header();
  mount(container, headerEl, canEdit ? null : readOnlyNote('You need the "Manage Users" permission to change groups and queues.'),
    h('div', { class: 'card' }, tabsEl, h('div', { class: 'sa-toolbar' }, h('div', { class: 'spacer' }), searchBox('Search...', (t) => { term = t; draw(); })), body));
}

// ---------- editor ----------
async function renderEditor(container, { id, app, query }) {
  mount(container, spinner());
  const isNew = id === 'new';
  const canEdit = canManageUsers();
  const [dir, objects] = await Promise.all([loadDirectory(['users', 'roles', 'groups']), GET('/api/setup/objects').catch(() => [])]);
  const existing = isNew ? null : dir.groups.find((g) => g.id === id);
  if (!isNew && !existing) {
    mount(container, setupHeader('Group', { crumb: 'Setup › Public Groups & Queues', iconName: 'users' }), h('div', { class: 'card p-24' }, emptyState('Group not found', 'It may have been deleted.', { iconName: 'alert', action: h('a', { class: 'btn', href: '#/setup/groups' }, 'Back') })));
    return;
  }
  const v = existing ? structuredClone(existing) : { label: '', name: '', kind: query?.kind === 'queue' ? 'queue' : 'public', members: [], queueObjects: [], email: '' };
  v.members ||= []; v.queueObjects ||= [];
  const isQueue = () => v.kind === 'queue';
  const noun = () => (isQueue() ? 'Queue' : 'Public Group');
  app.setTitle(isNew ? `New ${noun()}` : `${noun()}: ${v.label}`);
  let apiTouched = !isNew;
  let pickKind = 'user';
  let pickTerm = '';

  const label = h('input', { class: 'input', id: 'grp-label', value: v.label, disabled: !canEdit, onInput: () => { v.label = label.value; if (!apiTouched) { v.name = apiNameFrom(v.label); api.value = v.name; } } });
  const api = h('input', { class: 'input', id: 'grp-api', value: v.name, disabled: !canEdit, onInput: () => { apiTouched = true; v.name = api.value; } });
  const email = h('input', { class: 'input', id: 'grp-email', type: 'email', value: v.email || '', disabled: !canEdit, onInput: () => { v.email = email.value; } });

  // Supported objects: anything with an owner that is not controlled by a parent.
  const ownable = objects.filter((o) => o.sharingModel !== 'ControlledByParent' || ['Task', 'Event'].includes(o.apiName)).sort((a, b) => a.label.localeCompare(b.label));
  const objBox = h('div', { class: 'sa-obj-checks' }, ownable.map((o) => h('label', { class: ['sa-perm-item', v.queueObjects.includes(o.apiName) && 'on'] },
    h('input', { type: 'checkbox', disabled: !canEdit, checked: v.queueObjects.includes(o.apiName), onChange: (e) => {
      v.queueObjects = e.target.checked ? [...v.queueObjects, o.apiName] : v.queueObjects.filter((x) => x !== o.apiName);
      e.target.closest('label').classList.toggle('on', e.target.checked);
    } }), objIcon(getObj(o.apiName) || o, 'sm'), h('span', o.label))));

  // Member picker
  const available = h('div', { class: 'sa-picker-list', role: 'listbox', 'aria-label': 'Available members' });
  const selected = h('div', { class: 'sa-chips sa-selected' });
  const effective = h('div');
  const countEl = h('div', { class: 'form-label' });
  const candidates = () => {
    if (pickKind === 'user') return dir.users.filter((u) => u.IsActive).map((u) => ({ value: u.Id, label: u.Name, sub: u.Title || u.Username }));
    return dir.roles.map((r) => ({ value: pickKind === 'roleSub' ? `sub:${r.id}` : r.id, label: r.name, sub: pickKind === 'roleSub' ? 'Role and Subordinates' : 'Role' }));
  };
  const drawPicker = () => {
    const list = candidates().filter((c) => !v.members.includes(c.value) && (!pickTerm || c.label.toLowerCase().includes(pickTerm)));
    mount(available, list.length ? list.map((c) => h('div', { class: 'sa-picker-item' },
      h('span', { class: 'sa-member-icon' }, icon(pickKind === 'user' ? 'user' : 'users')),
      h('div', { class: 'grow' }, h('div', c.label), h('div', { class: 'tiny muted' }, c.sub)),
      canEdit ? h('button', { class: 'btn btn-sm', type: 'button', 'aria-label': `Add ${c.label}`, onClick: () => { v.members.push(c.value); drawPicker(); } }, icon('plus'), 'Add') : null))
      : h('div', { class: 'muted small p-16 center' }, 'No more matches.'));
    mount(selected, v.members.length ? v.members.map((m) => {
      const k = memberKind(m);
      return h('span', { class: ['pill', `sa-pill-${k}`] }, h('span', { class: 'tiny muted' }, { user: 'User', role: 'Role', roleSub: 'Role' }[k]), memberLabel(m, dir),
        canEdit ? h('button', { type: 'button', 'aria-label': `Remove ${memberLabel(m, dir)}`, onClick: () => { v.members = v.members.filter((x) => x !== m); drawPicker(); } }, icon('x', { size: 12 })) : null);
    }) : h('span', { class: 'muted small' }, 'No members yet. Add users or roles from the list.'));
    countEl.textContent = `Selected Members (${v.members.length})`;
    const eff = groupUsers(v, dir.users, dir.roles);
    mount(effective, h('div', { class: 'form-label mt-16' }, `Effective users (${eff.length})`),
      eff.length ? h('div', { class: 'sa-chips' }, eff.map((u) => userLink(u))) : h('div', { class: 'muted small' }, 'Nobody yet.'));
  };
  drawPicker();

  const saveBtn = h('button', { class: 'btn btn-brand', onClick: save }, 'Save');
  async function save() {
    if (!v.label.trim()) return toast('Label is required', 'error');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(v.name || '')) return toast('Group Name must start with a letter and contain only letters, numbers and underscores', 'error');
    if (isQueue() && !v.queueObjects.length) return toast('Select at least one supported object for the queue', 'error');
    if (dir.groups.some((g) => g.id !== existing?.id && g.name.toLowerCase() === v.name.toLowerCase())) return toast('A group or queue with this name already exists', 'error');
    saveBtn.disabled = true;
    try {
      const payload = { label: v.label.trim(), name: v.name, kind: v.kind, members: v.members, queueObjects: isQueue() ? v.queueObjects : [], email: isQueue() ? v.email : '' };
      const saved = existing ? await PUT(`/api/setup/meta/group/${existing.id}`, payload) : await POST('/api/setup/meta/group', payload);
      toast(`${noun()} saved`, 'success');
      app.navigate(`/setup/groups${saved.kind === 'queue' ? '?tab=queues' : ''}`);
    } catch (e) { toast(e.message, 'error'); saveBtn.disabled = false; }
  }
  async function remove() {
    if (!(await confirmDialog(`Delete ${noun().toLowerCase()} "${v.label}"? Sharing rules that reference it stop applying.`, { title: `Delete ${noun()}`, confirmLabel: 'Delete', danger: true }))) return;
    try { await DEL(`/api/setup/meta/group/${existing.id}`); toast(`${noun()} deleted`, 'success'); app.navigate(`/setup/groups${isQueue() ? '?tab=queues' : ''}`); } catch (e) { toast(e.message, 'error'); }
  }

  const listHref = `#/setup/groups${isQueue() ? '?tab=queues' : ''}`;
  mount(container,
    setupHeader(isNew ? `New ${noun()}` : v.label, { crumb: h('span', h('a', { href: listHref }, isQueue() ? 'Queues' : 'Public Groups'), ' › ', isNew ? 'New' : noun()), iconName: 'users',
      actions: [canEdit && existing ? h('button', { class: 'btn', onClick: remove }, icon('trash'), 'Delete') : null] }),
    canEdit ? null : readOnlyNote('Read only: you need the "Manage Users" permission to edit.'),
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('h3', `${noun()} Details`)),
      h('div', { class: 'card-body' }, h('div', { class: 'form-grid' },
        formRow('Label', label, { required: true, id: 'grp-label' }),
        formRow(isQueue() ? 'Queue Name' : 'Group Name', api, { required: true, id: 'grp-api', help: 'Unique API name used by integrations.' }),
        isQueue() ? formRow('Queue Email', email, { id: 'grp-email', help: 'Optional. Notifications for new records go here.' }) : null))),
    isQueue() ? h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('h3', 'Supported Objects'), h('span', { class: 'muted small' }, 'Records of these objects can be owned by the queue.')),
      h('div', { class: 'card-body' }, objBox)) : null,
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('h3', isQueue() ? 'Queue Members' : 'Group Members')),
      h('div', { class: 'card-body sa-member-grid' },
        h('div',
          h('div', { class: 'row mb-8 wrap' },
            h('label', { class: 'form-label', style: { margin: 0 } }, 'Search'),
            segmented([['user', 'Users'], ['role', 'Roles'], ['roleSub', 'Roles and Subordinates']], pickKind, (k) => { pickKind = k; drawPicker(); })),
          h('div', { class: 'mb-8' }, searchBox('Find members...', (t) => { pickTerm = t; drawPicker(); })),
          available),
        h('div', countEl, selected, effective))),
    canEdit ? h('div', { class: 'sa-savebar' }, h('div', { class: 'grow' }), h('a', { class: 'btn', href: listHref }, 'Cancel'), saveBtn) : null);

}
