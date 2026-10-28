// Users: list, new/edit user, user detail with password reset, activation, permission set assignments, login history.
import { h, icon, fmt, mount, clear, spinner, modal, confirmDialog, toast, badge, emptyState, avatar } from '../lib.js';
import { GET, POST, PATCH, me } from '../api.js';
import { lookupInput } from '../fields.js';
import { setupHeader } from './index.js';
import {
  canManageUsers, TIMEZONES, formRow, detailField, select, searchBox, segmented, activeBadge, dataTable, copyBox, loadDirectory,
  roleOptions, userLink, parseAgent, readOnlyNote, downloadCsv,
} from './admin-common.js';

export default async function render(container, { segments, app, query }) {
  const id = segments[0];
  if (id && id !== 'new') return renderDetail(container, id, app);
  return renderList(container, app, { openNew: id === 'new', query });
}

// ---------- list ----------
async function renderList(container, app, { openNew }) {
  app.setTitle('Users');
  const canEdit = canManageUsers();
  const newBtn = canEdit ? h('button', { class: 'btn btn-brand', onClick: () => openForm() }, icon('plus'), 'New User') : null;
  mount(container, setupHeader('Users', { crumb: 'Setup › Administration', iconName: 'user', actions: [newBtn], description: 'Everyone who can log in to your organization. Each user has one profile, an optional role, and any number of permission sets.' }), spinner());

  let dir;
  try { dir = await loadDirectory(['users', 'roles', 'profiles', 'permsets']); } catch (e) { mount(container, setupHeader('Users', { iconName: 'user' }), h('div', { class: 'card p-24' }, emptyState('Could not load users', e.message, { iconName: 'alert' }))); return; }

  let filter = 'active';
  let term = '';
  const columns = [
    { key: 'Name', label: 'Full Name', render: (u) => h('div', { class: 'row gap-4' }, avatar(u.Name, 'sm'), h('a', { href: `#/setup/users/${u.Id}`, class: 'strong' }, u.Name)), sort: (u) => `${u.LastName} ${u.FirstName}` },
    { key: 'Username', label: 'Username' },
    { key: 'Alias', label: 'Alias' },
    { key: 'ProfileName', label: 'Profile', render: (u) => (u.ProfileId ? h('a', { href: `#/setup/profiles/${u.ProfileId}` }, u.ProfileName || '') : '') },
    { key: 'RoleName', label: 'Role', render: (u) => u.RoleName || h('span', { class: 'muted' }, '—') },
    { key: 'ManagerName', label: 'Manager', render: (u) => (u.ManagerId ? h('a', { href: `#/setup/users/${u.ManagerId}` }, u.ManagerName || '') : h('span', { class: 'muted' }, '—')) },
    { key: 'IsActive', label: 'Active', render: (u) => activeBadge(u.IsActive), sort: (u) => (u.IsActive ? 0 : 1) },
    { key: 'LastLoginDate', label: 'Last Login', render: (u) => (u.LastLoginDate ? h('span', { title: fmt.datetime(u.LastLoginDate) }, fmt.relative(u.LastLoginDate)) : h('span', { class: 'muted' }, 'Never')), sort: (u) => u.LastLoginDate || null },
  ];
  const table = dataTable({ columns, rows: [], initialSort: { key: 'Name', dir: 'asc' }, empty: 'No users match your filters.' });
  const count = h('span', { class: 'muted small' });
  const apply = () => {
    const rows = dir.users.filter((u) => (filter === 'all' || (filter === 'active' ? u.IsActive : !u.IsActive))
      && (!term || [u.Name, u.Username, u.Alias, u.Email, u.ProfileName, u.RoleName, u.Title].some((v) => String(v || '').toLowerCase().includes(term))));
    count.textContent = `${rows.length} ${rows.length === 1 ? 'user' : 'users'}`;
    table.setRows(rows);
  };
  apply();

  const card = h('div', { class: 'card' },
    h('div', { class: 'sa-toolbar' },
      segmented([['all', 'All Users'], ['active', 'Active'], ['inactive', 'Inactive']], filter, (v) => { filter = v; apply(); }),
      count, h('div', { class: 'spacer' }),
      searchBox('Search users...', (t) => { term = t; apply(); }),
      h('button', { class: 'btn btn-sm', onClick: () => downloadCsv('users', [['Name', 'Name'], ['Username', 'Username'], ['Email', 'Email'], ['Alias', 'Alias'], ['Title', 'Title'], ['ProfileName', 'Profile'], ['RoleName', 'Role'], ['ManagerName', 'Manager'], [(u) => (u.IsActive ? 'true' : 'false'), 'Active'], ['LastLoginDate', 'Last Login']], dir.users) }, icon('download'), 'Export')),
    table.el);
  mount(container, setupHeader('Users', { crumb: 'Setup › Administration', iconName: 'user', actions: [newBtn], description: 'Everyone who can log in to your organization. Each user has one profile, an optional role, and any number of permission sets.' }),
    canEdit ? null : readOnlyNote('You can view users, but you need the "Manage Users" permission to make changes.'), card);

  async function openForm() {
    const created = await userForm(null, dir);
    if (created) app.navigate(`/setup/users/${created.Id}`);
    else if (location.hash.endsWith('/new')) history.replaceState(null, '', '#/setup/users');
  }
  if (openNew && canEdit) openForm();
}

// ---------- new / edit ----------
export function userForm(user, dir) {
  return new Promise((resolve) => {
    let result = null;
    const isNew = !user;
    const v = { FirstName: '', LastName: '', Email: '', Username: '', Alias: '', Title: '', Phone: '', ProfileId: dir.profiles.find((p) => p.name === 'Standard User')?.id || dir.profiles[0]?.id, RoleId: '', ManagerId: null, TimeZone: 'UTC', Password: '', ...(user || {}) };
    let usernameTouched = !isNew, aliasTouched = !isNew;
    const input = (key, attrs = {}) => {
      const el = h('input', { class: 'input', id: `uf-${key}`, value: v[key] || '', ...attrs });
      el.addEventListener('input', () => { v[key] = el.value; onChange(key); });
      return el;
    };
    const first = input('FirstName', { autocomplete: 'off' });
    const last = input('LastName', { autocomplete: 'off' });
    const email = input('Email', { type: 'email', autocomplete: 'off' });
    const username = input('Username', { autocomplete: 'off' });
    const alias = input('Alias', { maxlength: 8 });
    const onChange = (key) => {
      if (key === 'Username') usernameTouched = true;
      if (key === 'Alias') aliasTouched = true;
      if (key === 'Email' && !usernameTouched) { v.Username = v.Email.toLowerCase(); username.value = v.Username; }
      if ((key === 'FirstName' || key === 'LastName') && !aliasTouched) { v.Alias = ((v.FirstName[0] || '') + v.LastName.slice(0, 4)).toLowerCase(); alias.value = v.Alias; }
    };
    const profileSel = select(dir.profiles.map((p) => [p.id, p.name]), v.ProfileId, { id: 'uf-ProfileId', onChange: (x) => { v.ProfileId = x; } });
    const roleSel = select([['', '--None--'], ...roleOptions(dir.roles)], v.RoleId || '', { id: 'uf-RoleId', onChange: (x) => { v.RoleId = x; } });
    const mgr = lookupInput({ objects: ['User'], value: v.ManagerId, label: v.ManagerName || dir.users.find((u) => u.Id === v.ManagerId)?.Name, onChange: (x) => { v.ManagerId = x; } });
    const tzSel = select(TIMEZONES.includes(v.TimeZone) ? TIMEZONES : [v.TimeZone, ...TIMEZONES], v.TimeZone, { id: 'uf-TimeZone', onChange: (x) => { v.TimeZone = x; } });
    const pw = isNew ? input('Password', { type: 'password', autocomplete: 'new-password', placeholder: 'Leave blank to generate a temporary password' }) : null;

    const body = h('div',
      h('div', { class: 'section-title' }, 'General Information'),
      h('div', { class: 'form-grid' },
        formRow('First Name', first, { id: 'uf-FirstName' }),
        formRow('Last Name', last, { required: true, id: 'uf-LastName' }),
        formRow('Email', email, { required: true, id: 'uf-Email' }),
        formRow('Username', username, { required: true, id: 'uf-Username', help: 'Must look like an email address and be unique.' }),
        formRow('Alias', alias, { id: 'uf-Alias' }),
        formRow('Title', input('Title'), { id: 'uf-Title' }),
        formRow('Phone', input('Phone', { type: 'tel' }), { id: 'uf-Phone' }),
        formRow('Time Zone', tzSel, { id: 'uf-TimeZone' })),
      h('div', { class: 'section-title' }, 'Access'),
      h('div', { class: 'form-grid' },
        formRow('Profile', profileSel, { required: true, id: 'uf-ProfileId', help: 'Determines baseline object and system permissions.' }),
        formRow('Role', roleSel, { id: 'uf-RoleId', help: 'Position in the role hierarchy (record visibility).' }),
        formRow('Manager', mgr.el, { span2: false })),
      isNew ? h('div', h('div', { class: 'section-title' }, 'Password'), formRow('Password (optional)', pw, { id: 'uf-Password', help: 'If left blank, a temporary password is generated and shown once.' })) : null);

    const saveBtn = h('button', { class: 'btn btn-brand', onClick: save }, isNew ? 'Save' : 'Save Changes');
    const m = modal({ title: isNew ? 'New User' : `Edit User: ${user.Name}`, size: 'lg', body,
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), saveBtn], onClose: () => resolve(result) });

    async function save() {
      m.setError('');
      if (!v.LastName.trim()) return m.setError('Last Name is required.');
      if (!v.Email.trim()) return m.setError('Email is required.');
      if (!/^[^\s@]+@[^\s@]+$/.test(v.Username.trim())) return m.setError('Username must be in the form of an email address (e.g. jane@example.com).');
      if (pw && v.Password && v.Password.length < 8) return m.setError('Password must be at least 8 characters.');
      const payload = { FirstName: v.FirstName.trim(), LastName: v.LastName.trim(), Email: v.Email.trim(), Username: v.Username.trim(), Alias: v.Alias.trim(), Title: v.Title, Phone: v.Phone,
        ProfileId: v.ProfileId, RoleId: v.RoleId || null, ManagerId: v.ManagerId || null, TimeZone: v.TimeZone };
      saveBtn.disabled = true;
      try {
        if (isNew) {
          if (v.Password) payload.Password = v.Password;
          result = await POST('/api/setup/users', payload);
          m.close();
          toast(`User ${result.Name} created`, 'success');
          if (result.temporaryPassword) await showTempPassword(result, 'User created');
        } else {
          result = await PATCH(`/api/setup/users/${user.Id}`, payload);
          m.close();
          toast('User saved', 'success');
        }
      } catch (e) { m.setError(e.message); saveBtn.disabled = false; }
    }
  });
}

function showTempPassword(user, title) {
  return new Promise((resolve) => {
    const m = modal({ title, size: 'sm',
      body: h('div', { class: 'col gap-12' },
        h('div', { class: 'alert success' }, icon('check'), h('div', `A temporary password was generated for `, h('strong', user.Username || user.Name), '.')),
        h('div', h('div', { class: 'form-label' }, 'Temporary Password'), copyBox(user.temporaryPassword)),
        h('div', { class: 'small muted' }, 'Share it securely with the user. It will not be shown again. Existing sessions for this user were ended.')),
      footer: [h('button', { class: 'btn btn-brand', onClick: () => m.close() }, 'Done')], onClose: resolve });
  });
}

// ---------- detail ----------
async function renderDetail(container, id, app) {
  mount(container, spinner());
  const canEdit = canManageUsers();
  const [dir, logins] = await Promise.all([loadDirectory(['users', 'roles', 'profiles', 'permsets']), GET('/api/setup/logins').catch(() => [])]);
  const u = dir.users.find((x) => x.Id === id);
  if (!u) { mount(container, setupHeader('User', { crumb: 'Setup › Users', iconName: 'user' }), h('div', { class: 'card p-24' }, emptyState('User not found', 'This user does not exist.', { iconName: 'alert', action: h('a', { class: 'btn', href: '#/setup/users' }, 'Back to Users') }))); return; }
  app.setTitle(`User: ${u.Name}`);
  const isMe = me()?.Id === u.Id;
  const reload = () => renderDetail(container, id, app);

  const actions = canEdit ? [
    h('button', { class: 'btn', onClick: async () => { if (await userForm(u, dir)) reload(); } }, icon('edit'), 'Edit'),
    h('button', { class: 'btn', onClick: async () => {
      if (!(await confirmDialog(`Reset the password for ${u.Name}? Their current password stops working and they are logged out of all sessions.`, { title: 'Reset Password', confirmLabel: 'Reset Password' }))) return;
      try { const r = await POST(`/api/setup/users/${u.Id}/reset-password`); await showTempPassword({ ...u, temporaryPassword: r.temporaryPassword }, 'Password Reset'); } catch (e) { toast(e.message, 'error'); }
    } }, icon('key'), 'Reset Password'),
    u.IsActive
      ? h('button', { class: 'btn', disabled: isMe, title: isMe ? 'You cannot deactivate yourself' : null, onClick: async () => {
        if (!(await confirmDialog(h('div', `Deactivate ${u.Name}? They will no longer be able to log in. Records they own are kept.`), { title: 'Deactivate User', confirmLabel: 'Deactivate', danger: true }))) return;
        try { await PATCH(`/api/setup/users/${u.Id}`, { IsActive: false }); toast(`${u.Name} deactivated`, 'success'); reload(); } catch (e) { toast(e.message, 'error'); }
      } }, 'Deactivate')
      : h('button', { class: 'btn', onClick: async () => {
        if (!(await confirmDialog(`Activate ${u.Name}? They will be able to log in again.`, { title: 'Activate User', confirmLabel: 'Activate' }))) return;
        try { await PATCH(`/api/setup/users/${u.Id}`, { IsActive: true }); toast(`${u.Name} activated`, 'success'); reload(); } catch (e) { toast(e.message, 'error'); }
      } }, 'Activate'),
  ] : [];

  const manager = dir.users.find((x) => x.Id === u.ManagerId);
  const reports = dir.users.filter((x) => x.ManagerId === u.Id);
  const hero = h('div', { class: 'card sa-user-hero' },
    h('span', { class: 'avatar sa-avatar-lg' }, fmt.initials(u.Name)),
    h('div', { class: 'grow' },
      h('div', { class: 'tiny muted' }, 'User'),
      h('h1', { class: 'sa-hero-title' }, u.Name, ' ', activeBadge(u.IsActive), isMe ? badge('You', 'brand') : null),
      h('div', { class: 'muted small' }, [u.Title, u.Email].filter(Boolean).join(' · '))),
    h('div', { class: 'row wrap' }, actions));

  const info = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, h('h3', 'User Detail')),
    h('div', { class: 'card-body' }, h('div', { class: 'detail-grid' },
      detailField('Name', u.Name), detailField('Alias', u.Alias),
      detailField('Username', u.Username), detailField('Email', u.Email ? h('a', { href: `mailto:${u.Email}` }, u.Email) : null),
      detailField('Title', u.Title), detailField('Phone', u.Phone),
      detailField('Profile', u.ProfileId ? h('a', { href: `#/setup/profiles/${u.ProfileId}` }, u.ProfileName) : null),
      detailField('Role', u.RoleName ? h('a', { href: '#/setup/roles' }, u.RoleName) : null),
      detailField('Manager', manager ? userLink(manager) : null), detailField('Time Zone', u.TimeZone),
      detailField('Active', activeBadge(u.IsActive)), detailField('Created', fmt.datetime(u.CreatedDate)),
      detailField('Last Login', u.LastLoginDate ? `${fmt.datetime(u.LastLoginDate)} (${fmt.relative(u.LastLoginDate)})` : 'Never'),
      detailField('User ID', h('code', u.Id)))));

  // Permission set assignments
  const assigned = dir.permsets.filter((p) => (u.PermissionSets || []).includes(p.id));
  const psCard = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('key'), h('h3', `Permission Set Assignments (${assigned.length})`),
      canEdit ? h('button', { class: 'btn btn-sm', onClick: editAssignments }, 'Edit Assignments') : null),
    assigned.length
      ? h('div', { class: 'card-body flush' }, dataTable({ compact: true, rows: assigned, columns: [
        { key: 'label', label: 'Permission Set', render: (p) => h('a', { href: `#/setup/permsets/${p.id}` }, p.label || p.name) },
        { key: 'description', label: 'Description', render: (p) => h('span', { class: 'muted' }, p.description || '') },
      ] }).el)
      : h('div', { class: 'card-body muted small' }, 'No permission sets assigned. This user has only the permissions granted by the profile.'));

  async function editAssignments() {
    const selected = new Set(u.PermissionSets || []);
    const list = h('div', { class: 'sa-checklist-box' }, dir.permsets.map((p) => h('label', { class: 'sa-check-row' },
      h('input', { type: 'checkbox', checked: selected.has(p.id), onChange: (e) => { if (e.target.checked) selected.add(p.id); else selected.delete(p.id); } }),
      h('div', { class: 'grow' }, h('div', { class: 'strong' }, p.label || p.name), p.description ? h('div', { class: 'small muted' }, p.description) : null))));
    const btn = h('button', { class: 'btn btn-brand', onClick: async () => {
      btn.disabled = true;
      try { await PATCH(`/api/setup/users/${u.Id}`, { PermissionSets: [...selected] }); m.close(); toast('Permission set assignments saved', 'success'); reload(); } catch (e) { m.setError(e.message); btn.disabled = false; }
    } }, 'Save');
    const m = modal({ title: 'Permission Set Assignments', body: h('div', h('p', { class: 'muted small mt-0' }, `Select the permission sets to assign to ${u.Name}.`), dir.permsets.length ? list : emptyState('No permission sets', 'Create a permission set first.', { iconName: 'key' })),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), btn] });
  }

  const reportsCard = reports.length ? h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('users'), h('h3', `Direct Reports (${reports.length})`)),
    h('div', { class: 'card-body sa-chips' }, reports.map((r) => userLink(r)))) : null;

  const mine = logins.filter((l) => l.user_id === u.Id || (l.username || '').toLowerCase() === (u.Username || '').toLowerCase());
  const loginCard = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('clock'), h('h3', 'Login History'), h('a', { href: '#/setup/logins', class: 'small' }, 'View all')),
    mine.length
      ? h('div', { class: 'card-body flush' }, dataTable({ compact: true, rows: mine, maxRows: 20, initialSort: { key: 'at', dir: 'desc' }, columns: [
        { key: 'at', label: 'Login Time', render: (l) => fmt.datetime(l.at), sort: (l) => l.at },
        { key: 'status', label: 'Status', render: (l) => badge(l.status, l.status === 'Success' ? 'success' : 'danger') },
        { key: 'ip', label: 'Source IP', render: (l) => h('code', l.ip || '—') },
        { key: 'user_agent', label: 'Client', render: (l) => h('span', { title: l.user_agent }, parseAgent(l.user_agent)) },
      ] }).el)
      : h('div', { class: 'card-body muted small' }, 'This user has not logged in yet.'));

  mount(container,
    h('div', { class: 'crumb sa-crumb' }, h('a', { href: '#/setup/users' }, 'Users'), icon('chevronRight'), u.Name),
    hero, h('div', { class: 'sa-two-col' }, h('div', { class: 'col gap-16' }, info, loginCard), h('div', { class: 'col gap-16' }, psCard, reportsCard)));
}
