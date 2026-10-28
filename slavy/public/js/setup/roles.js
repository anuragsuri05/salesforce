// Roles: role hierarchy tree with add/edit/delete and user assignment.
import { h, icon, fmt, mount, clear, spinner, modal, confirmDialog, toast, emptyState, store } from '../lib.js';
import { POST, PUT, PATCH, DEL } from '../api.js';
import { setupHeader } from './index.js';
import { canManageUsers, formRow, select, loadDirectory, roleOptions, roleDescendants, readOnlyNote, userLink } from './admin-common.js';

export default async function render(container, { app }) {
  app.setTitle('Roles');
  const canEdit = canManageUsers();
  const header = (actions = []) => setupHeader('Roles', { crumb: 'Setup › Administration', iconName: 'users', actions,
    description: 'The role hierarchy controls record visibility: users can see and edit records owned by users in roles below them.' });
  mount(container, header(), spinner());
  let dir = await loadDirectory(['users', 'roles']);
  const collapsed = new Set(store.get('roles:collapsed', []));
  const showUsers = new Set();
  let term = '';
  const tree = h('div', { class: 'sa-tree', role: 'tree' });

  const persist = () => store.set('roles:collapsed', [...collapsed]);
  const reload = async () => { dir = await loadDirectory(['users', 'roles']); draw(); };
  const usersIn = (roleId) => dir.users.filter((u) => u.RoleId === roleId);
  const children = (parentId) => dir.roles.filter((r) => (r.parentId || null) === parentId).sort((a, b) => a.name.localeCompare(b.name));

  function matches(r) {
    if (!term) return true;
    if (r.name.toLowerCase().includes(term)) return true;
    return [...roleDescendants(dir.roles, r.id)].some((id) => dir.roles.find((x) => x.id === id)?.name.toLowerCase().includes(term));
  }

  function node(r, depth) {
    if (!matches(r)) return null;
    const kids = children(r.id);
    const open = term ? true : !collapsed.has(r.id);
    const members = usersIn(r.id);
    const subCount = roleDescendants(dir.roles, r.id).size;
    const toggle = kids.length
      ? h('button', { class: 'btn btn-ghost btn-sm btn-icon sa-tree-toggle', 'aria-label': open ? `Collapse ${r.name}` : `Expand ${r.name}`, 'aria-expanded': String(open),
        onClick: () => { if (open) collapsed.add(r.id); else collapsed.delete(r.id); persist(); draw(); } }, icon(open ? 'chevronDown' : 'chevronRight'))
      : h('span', { class: 'sa-tree-spacer' });
    const hl = term && r.name.toLowerCase().includes(term);
    const row = h('div', { class: ['sa-tree-row', hl && 'match'] },
      toggle,
      h('span', { class: 'sa-role-icon' }, icon('user')),
      h('div', { class: 'grow' },
        h('span', { class: 'strong' }, r.name),
        r.description ? h('span', { class: 'muted small' }, ` — ${r.description}`) : null),
      h('button', { class: ['badge', members.length ? 'brand' : '', 'sa-badge-btn'], type: 'button', 'aria-expanded': String(showUsers.has(r.id)),
        title: 'Show users in this role', onClick: () => { if (showUsers.has(r.id)) showUsers.delete(r.id); else showUsers.add(r.id); draw(); } },
      icon('users', { size: 12 }), `${members.length} ${members.length === 1 ? 'user' : 'users'}`),
      subCount ? h('span', { class: 'tiny muted nowrap' }, `${subCount} below`) : null,
      canEdit ? h('div', { class: 'sa-tree-actions' },
        h('button', { class: 'btn btn-ghost btn-sm', onClick: () => roleForm(null, r.id) }, icon('plus'), 'Add Role'),
        h('button', { class: 'btn btn-ghost btn-sm', onClick: () => assignUsers(r) }, 'Assign Users'),
        h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': `Edit ${r.name}`, title: 'Edit', onClick: () => roleForm(r) }, icon('edit')),
        h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': `Delete ${r.name}`, title: 'Delete', onClick: () => removeRole(r) }, icon('trash'))) : null);
    const userList = showUsers.has(r.id)
      ? h('div', { class: 'sa-tree-users' }, members.length
        ? members.map((u) => h('div', { class: 'row' }, userLink(u), h('span', { class: 'muted small' }, u.Title || ''), u.IsActive ? null : h('span', { class: 'badge' }, 'Inactive')))
        : h('span', { class: 'muted small' }, 'No users in this role.'))
      : null;
    return h('div', { class: 'sa-tree-node', role: 'treeitem', 'aria-expanded': kids.length ? String(open) : null, style: { '--depth': depth } },
      row, userList,
      kids.length && open ? h('div', { class: 'sa-tree-children', role: 'group' }, kids.map((k) => node(k, depth + 1))) : null);
  }

  function draw() {
    clear(tree);
    const roots = dir.roles.filter((r) => !r.parentId || !dir.roles.some((x) => x.id === r.parentId)).sort((a, b) => a.name.localeCompare(b.name));
    if (!roots.length) { tree.appendChild(emptyState('No roles yet', 'Create your first role to start building the hierarchy.', { iconName: 'users' })); return; }
    tree.appendChild(h('div', { class: 'sa-tree-org' }, icon('building'), h('strong', 'Organization')));
    for (const r of roots) tree.appendChild(node(r, 0) || '');
    const noRole = dir.users.filter((u) => !u.RoleId && u.IsActive);
    if (noRole.length && !term) tree.appendChild(h('div', { class: 'sa-tree-norole muted small' }, icon('info'), ` ${noRole.length} active user(s) have no role: `, noRole.map((u, i) => [i ? ', ' : '', h('a', { href: `#/setup/users/${u.Id}` }, u.Name)])));
  }

  async function roleForm(role, parentId = null) {
    const v = { name: role?.name || '', parentId: role ? role.parentId || '' : parentId || '', description: role?.description || '' };
    const exclude = role ? new Set([role.id, ...roleDescendants(dir.roles, role.id)]) : new Set();
    const name = h('input', { class: 'input', id: 'role-name', value: v.name });
    const parent = select([['', '-- None (top of hierarchy) --'], ...roleOptions(dir.roles, { exclude })], v.parentId, { id: 'role-parent' });
    const desc = h('textarea', { class: 'input', id: 'role-desc', rows: 2 }, '');
    desc.value = v.description;
    const btn = h('button', { class: 'btn btn-brand', onClick: async () => {
      m.setError('');
      if (!name.value.trim()) return m.setError('Role name is required.');
      btn.disabled = true;
      try {
        const payload = { name: name.value.trim(), parentId: parent.value || null, description: desc.value };
        if (role) await PUT(`/api/setup/meta/role/${role.id}`, payload); else await POST('/api/setup/meta/role', payload);
        if (payload.parentId) collapsed.delete(payload.parentId);
        m.close();
        toast(role ? 'Role saved' : 'Role created', 'success');
        reload();
      } catch (e) { m.setError(e.message); btn.disabled = false; }
    } }, 'Save');
    const m = modal({ title: role ? `Edit Role: ${role.name}` : 'New Role', size: 'sm',
      body: h('div', formRow('Label', name, { required: true, id: 'role-name' }), formRow('This role reports to', parent, { id: 'role-parent', help: 'Users in the parent role can see records owned by users in this role.' }), formRow('Description', desc, { id: 'role-desc' })),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), btn] });
  }

  async function removeRole(r) {
    const kids = children(r.id);
    const members = usersIn(r.id);
    if (kids.length || members.length) {
      toast(`"${r.name}" can't be deleted: ${[kids.length && `it has ${kids.length} child role(s)`, members.length && `${members.length} user(s) are assigned`].filter(Boolean).join(' and ')}.`, 'error');
      return;
    }
    if (!(await confirmDialog(`Delete the role "${r.name}"?`, { title: 'Delete Role', confirmLabel: 'Delete', danger: true }))) return;
    try { await DEL(`/api/setup/meta/role/${r.id}`); toast('Role deleted', 'success'); reload(); } catch (e) { toast(e.message, 'error'); }
  }

  async function assignUsers(r) {
    const selected = new Set(usersIn(r.id).map((u) => u.Id));
    const before = new Set(selected);
    const list = h('div', { class: 'sa-checklist-box' }, dir.users.filter((u) => u.IsActive || selected.has(u.Id)).map((u) => h('label', { class: 'sa-check-row' },
      h('input', { type: 'checkbox', checked: selected.has(u.Id), onChange: (e) => { if (e.target.checked) selected.add(u.Id); else selected.delete(u.Id); } }),
      h('span', { class: 'avatar sm' }, fmt.initials(u.Name)),
      h('div', { class: 'grow' }, h('div', { class: 'strong' }, u.Name), h('div', { class: 'small muted' }, u.RoleName && u.RoleId !== r.id ? `Currently: ${u.RoleName}` : u.RoleId === r.id ? 'In this role' : 'No role')))));
    const btn = h('button', { class: 'btn btn-brand', onClick: async () => {
      btn.disabled = true;
      try {
        for (const u of dir.users) {
          if (selected.has(u.Id) && !before.has(u.Id)) await PATCH(`/api/setup/users/${u.Id}`, { RoleId: r.id });
          if (!selected.has(u.Id) && before.has(u.Id)) await PATCH(`/api/setup/users/${u.Id}`, { RoleId: null });
        }
        m.close();
        showUsers.add(r.id);
        toast('Role assignments saved', 'success');
        reload();
      } catch (e) { m.setError(e.message); btn.disabled = false; }
    } }, 'Save');
    const m = modal({ title: `Assign Users to ${r.name}`, body: h('div', h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Checked users are moved into this role. Unchecking removes the user from the role. You can also change a role from the user’s record.'), list),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), btn] });
  }

  const search = h('input', { class: 'input input-sm', type: 'search', placeholder: 'Find a role...', 'aria-label': 'Find a role', onInput: () => { term = search.value.trim().toLowerCase(); draw(); } });
  draw();
  mount(container,
    header(canEdit ? [h('button', { class: 'btn btn-brand', onClick: () => roleForm(null) }, icon('plus'), 'New Role')] : []),
    canEdit ? null : readOnlyNote('You need the "Manage Users" permission to change the role hierarchy.'),
    h('div', { class: 'card' },
      h('div', { class: 'sa-toolbar' },
        h('div', { class: 'input-group sa-search' }, icon('search'), search),
        h('div', { class: 'spacer' }),
        h('span', { class: 'muted small' }, `${dir.roles.length} roles`),
        h('button', { class: 'btn btn-sm', onClick: () => { collapsed.clear(); persist(); draw(); } }, icon('chevronDown'), 'Expand All'),
        h('button', { class: 'btn btn-sm', onClick: () => { dir.roles.forEach((r) => { if (children(r.id).length) collapsed.add(r.id); }); persist(); draw(); } }, icon('chevronRight'), 'Collapse All')),
      h('div', { class: 'card-body' }, tree)));
}
