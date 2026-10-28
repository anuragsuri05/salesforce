// Shared permission editor for Profiles and Permission Sets: list page, detail with
// system permissions, object settings (CRUD + View/Modify All) and field-level security.
import { h, icon, fmt, mount, clear, spinner, modal, confirmDialog, toast, badge, emptyState, objIcon } from '../lib.js';
import { GET, POST, PUT, PATCH, DEL, getObj } from '../api.js';
import { setupHeader } from './index.js';
import { canManageUsers, formRow, select, searchBox, dataTable, userLink, apiNameFrom, readOnlyNote, activeBadge } from './admin-common.js';

const OPS = [['read', 'Read'], ['create', 'Create'], ['edit', 'Edit'], ['delete', 'Delete'], ['viewAll', 'View All'], ['modifyAll', 'Modify All']];
const COMPUTED = new Set(['Formula', 'Rollup', 'AutoNumber', 'Id']);

const TYPES = {
  profile: { api: 'profile', route: 'profiles', title: 'Profiles', singular: 'Profile', icon: 'shield',
    description: 'A profile defines a user’s baseline access: object permissions, field-level security and system permissions. Every user has exactly one profile.' },
  permissionSet: { api: 'permissionSet', route: 'permsets', title: 'Permission Sets', singular: 'Permission Set', icon: 'key',
    description: 'Permission sets grant additional access on top of a user’s profile, without changing the profile. Assign as many as you need.' },
};

const labelOf = (m) => m.label || m.name;

// Salesforce-style implied permissions when toggling one checkbox.
export function applyObjectPerm(p, op, on) {
  const o = { ...p };
  o[op] = on;
  if (on) {
    if (op !== 'read') o.read = true;
    if (op === 'delete') o.edit = true;
    if (op === 'modifyAll') Object.assign(o, { read: true, create: true, edit: true, delete: true, viewAll: true });
  } else {
    if (op === 'read') Object.assign(o, { create: false, edit: false, delete: false, viewAll: false, modifyAll: false });
    if (op === 'edit') Object.assign(o, { delete: false, modifyAll: false });
    if (op === 'create' || op === 'delete' || op === 'viewAll') o.modifyAll = false;
  }
  for (const k of Object.keys(o)) if (!o[k]) delete o[k];
  return o;
}

// ---------- list ----------
export async function renderPermList(container, { type, app }) {
  const T = TYPES[type];
  app.setTitle(T.title);
  const canEdit = canManageUsers();
  const header = () => setupHeader(T.title, { crumb: 'Setup › Administration', iconName: T.icon, description: T.description,
    actions: canEdit ? [h('button', { class: 'btn btn-brand', onClick: () => newItem(type, items, app) }, icon('plus'), `New ${T.singular}`)] : [] });
  let items = [];
  mount(container, header(), spinner());
  const [list, users] = await Promise.all([GET(`/api/setup/meta/${type}`), GET('/api/setup/users')]);
  items = list;
  const assignedCount = (m) => users.filter((u) => (type === 'profile' ? u.ProfileId === m.id : (u.PermissionSets || []).includes(m.id))).length;
  const permCount = (m) => Object.keys(m.permissions?.system || {}).length;
  const objCount = (m) => Object.values(m.permissions?.objects || {}).filter((o) => o.read).length;
  let term = '';
  const table = dataTable({ initialSort: { key: 'name', dir: 'asc' }, empty: `No ${T.title.toLowerCase()} match your search.`, columns: [
    { key: 'name', label: type === 'profile' ? 'Profile Name' : 'Label', render: (m) => h('a', { href: `#/setup/${T.route}/${m.id}`, class: 'strong' }, labelOf(m)), sort: labelOf },
    type === 'permissionSet' ? { key: 'apiName', label: 'API Name', render: (m) => h('code', m.name), sort: (m) => m.name } : { key: 'license', label: 'User License', render: (m) => m.license || 'Slavy' },
    { key: 'description', label: 'Description', render: (m) => h('span', { class: 'muted', title: m.description || '' }, m.description || '') },
    { key: 'system', label: 'System Perms', cls: 'num', render: (m) => String(permCount(m)), sort: permCount },
    { key: 'objects', label: 'Objects', cls: 'num', render: (m) => String(objCount(m)), sort: objCount },
    { key: 'users', label: 'Assigned Users', cls: 'num', render: (m) => String(assignedCount(m)), sort: assignedCount },
    { key: 'updatedAt', label: 'Last Modified', render: (m) => fmt.date(m.updatedAt), sort: (m) => m.updatedAt },
  ], rows: items });
  const apply = () => table.setRows(items.filter((m) => !term || [labelOf(m), m.name, m.description].some((v) => String(v || '').toLowerCase().includes(term))));
  mount(container, header(), canEdit ? null : readOnlyNote(`You need the "Manage Users" permission to change ${T.title.toLowerCase()}.`),
    h('div', { class: 'card' },
      h('div', { class: 'sa-toolbar' }, h('span', { class: 'muted small' }, `${items.length} ${T.title.toLowerCase()}`), h('div', { class: 'spacer' }), searchBox(`Search ${T.title.toLowerCase()}...`, (t) => { term = t; apply(); })),
      table.el));
}

async function newItem(type, items, app, source = null) {
  const T = TYPES[type];
  const v = { name: source ? `Copy of ${labelOf(source)}` : '', label: '', description: source?.description || '', cloneFrom: source?.id || items.find((p) => p.name === 'Standard User')?.id || items[0]?.id || '' };
  if (type === 'permissionSet') { v.label = v.name; v.name = apiNameFrom(v.label); }
  let apiTouched = false;
  const nameInp = h('input', { class: 'input', id: 'pe-name', value: type === 'profile' ? v.name : v.label });
  const apiInp = type === 'permissionSet' ? h('input', { class: 'input', id: 'pe-api', value: v.name, onInput: () => { apiTouched = true; } }) : null;
  nameInp.addEventListener('input', () => { if (apiInp && !apiTouched) apiInp.value = apiNameFrom(nameInp.value); });
  const desc = h('textarea', { class: 'input', id: 'pe-desc', rows: 3 }, '');
  desc.value = v.description;
  const cloneSel = type === 'profile' && !source ? select(items.map((p) => [p.id, p.name]), v.cloneFrom, { id: 'pe-clone' }) : null;
  const body = h('div',
    source ? h('div', { class: 'alert mb-16' }, icon('copy'), h('div', `All permissions from `, h('strong', labelOf(source)), ' will be copied.')) : null,
    cloneSel ? formRow('Existing Profile', cloneSel, { required: true, id: 'pe-clone', help: 'The new profile starts with a copy of this profile’s permissions.' }) : null,
    formRow(type === 'profile' ? 'Profile Name' : 'Label', nameInp, { required: true, id: 'pe-name' }),
    apiInp ? formRow('API Name', apiInp, { required: true, id: 'pe-api' }) : null,
    formRow('Description', desc, { id: 'pe-desc' }));
  const save = h('button', { class: 'btn btn-brand', onClick: async () => {
    m.setError('');
    const name = nameInp.value.trim();
    if (!name) return m.setError(`${type === 'profile' ? 'Profile name' : 'Label'} is required.`);
    if (apiInp && !/^[A-Za-z][A-Za-z0-9_]*$/.test(apiInp.value.trim())) return m.setError('API Name must start with a letter and contain only letters, numbers and underscores.');
    const all = type === 'profile' ? items : items;
    if (all.some((x) => labelOf(x).toLowerCase() === name.toLowerCase())) return m.setError(`A ${T.singular.toLowerCase()} with this name already exists.`);
    save.disabled = true;
    try {
      const base = source || (cloneSel ? items.find((p) => p.id === cloneSel.value) : null);
      const payload = type === 'profile'
        ? { name, description: desc.value, license: base?.license || 'Slavy', permissions: structuredClone(base?.permissions || { system: {}, objects: {}, fields: {} }) }
        : { name: apiInp.value.trim(), label: name, description: desc.value, permissions: structuredClone(base?.permissions || { system: {}, objects: {}, fields: {} }) };
      const created = await POST(`/api/setup/meta/${type}`, payload);
      m.close();
      toast(`${T.singular} "${labelOf(created)}" created`, 'success');
      app.navigate(`/setup/${T.route}/${created.id}`);
    } catch (e) { m.setError(e.message); save.disabled = false; }
  } }, 'Save');
  const m = modal({ title: source ? `Clone ${T.singular}` : `New ${T.singular}`, body, footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), save] });
}

// ---------- detail ----------
export async function renderPermDetail(container, { type, id, app, query }) {
  const T = TYPES[type];
  mount(container, spinner());
  const canEdit = canManageUsers();
  let meta, catalog, objects, users, siblings;
  try {
    [meta, catalog, objects, users, siblings] = await Promise.all([
      GET(`/api/setup/meta/${type}/${id}`), GET('/api/setup/meta-catalog'), GET('/api/setup/objects'), GET('/api/setup/users'), GET(`/api/setup/meta/${type}`)]);
  } catch (e) {
    mount(container, setupHeader(T.singular, { crumb: `Setup › ${T.title}`, iconName: T.icon }), h('div', { class: 'card p-24' }, emptyState(e.status === 404 ? `${T.singular} not found` : 'Could not load', e.message, { iconName: 'alert', action: h('a', { class: 'btn', href: `#/setup/${T.route}` }, `Back to ${T.title}`) })));
    return;
  }
  app.setTitle(`${T.singular}: ${labelOf(meta)}`);
  objects.sort((a, b) => a.label.localeCompare(b.label));
  const fieldCache = new Map();
  let editing = false;
  let draft = null;
  let activeTab = query?.tab || 'overview';
  let flsObject = query?.object || objects.find((o) => o.apiName === 'Account')?.apiName || objects[0]?.apiName;
  let objTerm = '';

  const perms = () => (editing ? draft.permissions : meta.permissions) || { system: {}, objects: {}, fields: {} };
  const assigned = users.filter((u) => (type === 'profile' ? u.ProfileId === id : (u.PermissionSets || []).includes(id)));

  const startEdit = (tab) => {
    draft = structuredClone({ name: meta.name, label: meta.label, description: meta.description || '', permissions: meta.permissions || {} });
    draft.permissions.system ||= {}; draft.permissions.objects ||= {}; draft.permissions.fields ||= {};
    editing = true;
    if (tab) activeTab = tab;
    draw();
  };
  const cancel = () => { editing = false; draft = null; draw(); };
  const save = async (btn) => {
    if (type === 'profile' ? !draft.name.trim() : !draft.label.trim()) { toast('Name is required', 'error'); return; }
    btn.disabled = true;
    try {
      const payload = type === 'profile'
        ? { name: draft.name.trim(), description: draft.description, license: meta.license, permissions: draft.permissions }
        : { name: meta.name, label: draft.label.trim(), description: draft.description, permissions: draft.permissions };
      meta = await PUT(`/api/setup/meta/${type}/${id}`, payload);
      editing = false; draft = null;
      toast(`${T.singular} saved`, 'success');
      draw();
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
  };

  const tabsEl = h('div');
  const body = h('div');

  function header() {
    const actions = canEdit && !editing ? [
      h('button', { class: 'btn btn-brand', onClick: () => startEdit() }, icon('edit'), 'Edit'),
      h('button', { class: 'btn', onClick: () => newItem(type, siblings, app, meta) }, icon('copy'), 'Clone'),
      h('button', { class: 'btn', 'aria-label': 'Delete', title: 'Delete', onClick: remove }, icon('trash'), 'Delete'),
    ] : [];
    return h('div', { class: 'card sa-user-hero' },
      h('div', { class: 'setup-icon' }, icon(T.icon)),
      h('div', { class: 'grow' },
        h('div', { class: 'tiny muted' }, h('a', { href: `#/setup/${T.route}` }, T.title), ' › ', T.singular),
        h('h1', { class: 'sa-hero-title' }, labelOf(meta), editing ? badge('Editing', 'warning') : null),
        h('div', { class: 'muted small' }, meta.description || 'No description')),
      h('div', { class: 'row wrap' }, actions));
  }

  async function remove() {
    if (assigned.length) { toast(`This ${T.singular.toLowerCase()} is assigned to ${assigned.length} user(s). ${type === 'profile' ? 'Move them to another profile first.' : 'Remove the assignments first, or delete anyway to unassign.'}`, type === 'profile' ? 'error' : 'warning'); if (type === 'profile') return; }
    if (!(await confirmDialog(`Delete ${T.singular.toLowerCase()} "${labelOf(meta)}"? This cannot be undone.${type === 'permissionSet' && assigned.length ? ` It will be removed from ${assigned.length} user(s).` : ''}`, { title: `Delete ${T.singular}`, confirmLabel: 'Delete', danger: true }))) return;
    try { await DEL(`/api/setup/meta/${type}/${id}`); toast(`${T.singular} deleted`, 'success'); app.navigate(`/setup/${T.route}`); } catch (e) { toast(e.message, 'error'); }
  }

  const TABS = [['overview', 'Overview'], ['system', 'System Permissions'], ['objects', 'Object Settings'], ['fls', 'Field-Level Security'], ['users', `Assigned Users (${assigned.length})`]];
  function drawTabs() {
    mount(tabsEl, h('div', { class: 'tabs sa-tabs', role: 'tablist' }, TABS.map(([k, l]) => h('button', { class: ['tab', k === activeTab && 'active'], role: 'tab', 'aria-selected': String(k === activeTab), onClick: () => { activeTab = k; drawTabs(); drawBody(); } }, l))));
  }

  function saveBar() {
    if (!editing) return null;
    const btn = h('button', { class: 'btn btn-brand', onClick: () => save(btn) }, 'Save');
    return h('div', { class: 'sa-savebar' }, h('span', { class: 'muted small grow' }, icon('info'), ' You have unsaved changes across all tabs. Save to apply them.'), h('button', { class: 'btn', onClick: cancel }, 'Cancel'), btn);
  }

  function drawBody() {
    const render = { overview: overviewTab, system: systemTab, objects: objectsTab, fls: flsTab, users: usersTab }[activeTab] || overviewTab;
    mount(body, render());
  }

  function draw() {
    drawTabs();
    drawBody();
    mount(container, header(), canEdit ? null : readOnlyNote('Read only: you need the "Manage Users" permission to edit.'), h('div', { class: 'card' }, tabsEl, h('div', { class: 'card-body' }, body)), saveBar());
  }

  // ----- tabs -----
  function overviewTab() {
    const p = meta.permissions || {};
    const sys = Object.keys(p.system || {});
    const objs = Object.entries(p.objects || {}).filter(([, o]) => Object.values(o).some(Boolean));
    const fls = Object.keys(p.fields || {});
    const nameField = editing
      ? h('input', { class: 'input', id: 'pe-edit-name', value: type === 'profile' ? draft.name : draft.label, onInput: (e) => { if (type === 'profile') draft.name = e.target.value; else draft.label = e.target.value; } })
      : labelOf(meta);
    const descField = editing ? (() => { const t = h('textarea', { class: 'input', id: 'pe-edit-desc', rows: 3, onInput: (e) => { draft.description = e.target.value; } }); t.value = draft.description; return t; })() : (meta.description || h('span', { class: 'muted' }, '—'));
    return h('div',
      h('div', { class: 'form-grid' },
        h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'pe-edit-name' }, type === 'profile' ? 'Profile Name' : 'Label'), h('div', nameField)),
        type === 'permissionSet' ? h('div', { class: 'form-row' }, h('div', { class: 'form-label' }, 'API Name'), h('code', meta.name)) : h('div', { class: 'form-row' }, h('div', { class: 'form-label' }, 'User License'), h('div', meta.license || 'Slavy')),
        h('div', { class: 'form-row span-2' }, h('label', { class: 'form-label', for: 'pe-edit-desc' }, 'Description'), h('div', descField)),
        h('div', { class: 'form-row' }, h('div', { class: 'form-label' }, 'Created'), h('div', fmt.datetime(meta.createdAt))),
        h('div', { class: 'form-row' }, h('div', { class: 'form-label' }, 'Last Modified'), h('div', fmt.datetime(meta.updatedAt)))),
      h('div', { class: 'grid-3 mt-16' },
        summaryTile('System Permissions', sys.length, 'gear', 'system'),
        summaryTile('Objects with Access', objs.length, 'layers', 'objects'),
        summaryTile(type === 'profile' ? 'Field Restrictions' : 'Field Grants', fls.length, 'eye', 'fls')),
      type === 'profile'
        ? h('div', { class: 'alert mt-16' }, icon('info'), h('div', 'Field-level security on a profile is a restriction: fields are fully accessible unless you remove access here. Permission sets can grant access back.'))
        : h('div', { class: 'alert mt-16' }, icon('info'), h('div', 'Permission sets only add access. Anything unchecked here falls back to what the user’s profile allows.')));
  }

  function summaryTile(label, n, ic, tab) {
    return h('button', { class: 'card sa-stat sa-stat-btn', type: 'button', onClick: () => { activeTab = tab; drawTabs(); drawBody(); } },
      h('div', { class: 'sa-stat-icon' }, icon(ic)), h('div', { class: 'left' }, h('div', { class: 'sa-stat-value' }, String(n)), h('div', { class: 'sa-stat-label' }, label)));
  }

  function systemTab() {
    const p = perms();
    const groups = [
      ['Administrative', ['ModifyAllData', 'ViewAllData', 'ViewSetup', 'CustomizeApplication', 'ManageUsers', 'ManageFlows']],
      ['Reports & Data', ['RunReports', 'ManageReports', 'ManageDashboards', 'ExportReports', 'ImportData', 'ManagePublicListViews']],
      ['General User', ['ApiEnabled', 'RunSoql', 'TransferRecords', 'ConvertLeads']],
    ];
    const known = new Set(groups.flatMap((g) => g[1]));
    const others = catalog.systemPermissions.map(([k]) => k).filter((k) => !known.has(k));
    if (others.length) groups.push(['Other', others]);
    const labels = Object.fromEntries(catalog.systemPermissions);
    return h('div',
      editing || !canEdit ? null : h('div', { class: 'row mb-16' }, h('span', { class: 'muted small grow' }, `${Object.keys(p.system || {}).length} of ${catalog.systemPermissions.length} enabled`), h('button', { class: 'btn btn-sm', onClick: () => startEdit('system') }, icon('edit'), 'Edit')),
      groups.map(([g, keys]) => h('div', { class: 'mb-16' },
        h('div', { class: 'section-title' }, g),
        h('div', { class: 'sa-perm-list' }, keys.filter((k) => labels[k]).map((k) => {
          const on = !!p.system?.[k];
          const cb = h('input', { type: 'checkbox', checked: on, disabled: !editing, onChange: () => {
            if (cb.checked) draft.permissions.system[k] = true; else delete draft.permissions.system[k];
            if (k === 'ModifyAllData' && cb.checked) draft.permissions.system.ViewAllData = true;
            if (k === 'ViewAllData' && !cb.checked) delete draft.permissions.system.ModifyAllData;
            drawBody();
          } });
          return h('label', { class: ['sa-perm-item', on && 'on'] }, cb, h('span', { class: 'grow' }, labels[k]), h('code', { class: 'tiny muted' }, k));
        })))));
  }

  function objectsTab() {
    const p = perms();
    const tbody = h('tbody');
    const drawRows = () => {
      clear(tbody);
      const list = objects.filter((o) => !objTerm || o.label.toLowerCase().includes(objTerm) || o.apiName.toLowerCase().includes(objTerm));
      for (const o of list) {
        const cur = p.objects?.[o.apiName] || {};
        tbody.appendChild(h('tr',
          h('td', h('div', { class: 'row' }, objIcon(getObj(o.apiName) || o, 'sm'), h('div', h('div', { class: 'strong' }, o.label), h('div', { class: 'tiny muted' }, o.apiName)))),
          OPS.map(([k, l]) => {
            const cb = h('input', { type: 'checkbox', checked: !!cur[k], disabled: !editing, 'aria-label': `${l} ${o.label}`, onChange: () => {
              draft.permissions.objects[o.apiName] = applyObjectPerm(draft.permissions.objects[o.apiName] || {}, k, cb.checked);
              if (!Object.keys(draft.permissions.objects[o.apiName]).length) delete draft.permissions.objects[o.apiName];
              drawRows();
            } });
            return h('td', { class: 'center' }, cb);
          }),
          h('td', { class: 'center' }, h('button', { class: 'btn btn-ghost btn-sm', onClick: () => { flsObject = o.apiName; activeTab = 'fls'; drawTabs(); drawBody(); } }, 'Fields'))));
      }
      if (!list.length) tbody.appendChild(h('tr', h('td', { colspan: 8, class: 'center muted' }, 'No objects match.')));
    };
    drawRows();
    return h('div',
      h('div', { class: 'row mb-8 wrap' },
        searchBox('Filter objects...', (t) => { objTerm = t; drawRows(); }, { value: objTerm }),
        h('span', { class: 'muted small grow' }, 'Checking Edit or Delete grants Read; Modify All grants everything. Unchecking Read clears the rest.'),
        editing || !canEdit ? null : h('button', { class: 'btn btn-sm', onClick: () => startEdit('objects') }, icon('edit'), 'Edit')),
      h('div', { class: 'table-wrap sa-scroll' }, h('table', { class: 'table perm-grid compact' },
        h('thead', h('tr', h('th', 'Object'), OPS.map(([, l]) => h('th', { class: 'center' }, l)), h('th', { class: 'center' }, 'Field Access'))),
        tbody)));
  }

  function flsTab() {
    const wrap = h('div');
    const objSel = select(objects.map((o) => [o.apiName, o.label]), flsObject, { id: 'fls-object', ariaLabel: 'Object', onChange: (v) => { flsObject = v; drawBody(); } });
    objSel.style.maxWidth = '280px';
    const content = h('div', spinner());
    const p = perms();
    const isProfile = type === 'profile';
    (async () => {
      let def = fieldCache.get(flsObject);
      if (!def) {
        try { def = await GET(`/api/setup/objects/${encodeURIComponent(flsObject)}`); fieldCache.set(flsObject, def); } catch (e) { mount(content, emptyState('Could not load fields', e.message, { iconName: 'alert' })); return; }
      }
      const objPerm = p.objects?.[flsObject] || {};
      const tbody = h('tbody');
      const fields = [...def.fields].sort((a, b) => (a.apiName === 'Name' ? -1 : b.apiName === 'Name' ? 1 : a.label.localeCompare(b.label)));
      const valueFor = (f) => {
        const key = `${flsObject}.${f.apiName}`;
        const e = p.fields?.[key];
        if (isProfile) return e ? { read: !!(e.read || e.edit), edit: !!e.edit } : { read: true, edit: true };
        return { read: !!(e?.read || e?.edit), edit: !!e?.edit };
      };
      const setValue = (f, read, edit) => {
        const key = `${flsObject}.${f.apiName}`;
        if (edit) read = true;
        if (!read) edit = false;
        if (isProfile) {
          if (read && (edit || COMPUTED.has(f.type) || f.readOnly)) delete draft.permissions.fields[key];
          else draft.permissions.fields[key] = { read, edit };
        } else if (!read && !edit) delete draft.permissions.fields[key];
        else draft.permissions.fields[key] = { read, edit };
      };
      const drawRows = () => {
        clear(tbody);
        for (const f of fields) {
          const sys = !!f.system;
          const computed = COMPUTED.has(f.type) || f.readOnly;
          const v = sys ? { read: true, edit: !f.readOnly } : valueFor(f);
          const readCb = h('input', { type: 'checkbox', checked: v.read, disabled: !editing || sys, 'aria-label': `Read access to ${f.label}`, onChange: () => { setValue(f, readCb.checked, readCb.checked && valueFor(f).edit); drawRows(); } });
          const editCb = h('input', { type: 'checkbox', checked: v.edit && !computed, disabled: !editing || sys || computed, 'aria-label': `Edit access to ${f.label}`, onChange: () => { setValue(f, editCb.checked || valueFor(f).read, editCb.checked); drawRows(); } });
          const explicit = !sys && p.fields?.[`${flsObject}.${f.apiName}`];
          tbody.appendChild(h('tr', { class: !sys && isProfile && !v.read ? 'sa-row-off' : null },
            h('td', h('div', { class: 'strong' }, f.label, f.required ? h('span', { class: 'req', title: 'Required' }, ' *') : null), h('div', { class: 'tiny muted' }, f.apiName)),
            h('td', { class: 'sa-left' }, h('span', { class: 'small' }, f.type === 'Formula' || f.type === 'Rollup' ? `${f.type} (${f.returnType || 'Number'})` : f.type)),
            h('td', { class: 'center' }, readCb),
            h('td', { class: 'center' }, editCb),
            h('td', { class: 'sa-left' }, sys ? badge('System field') : computed ? badge('Read only') : explicit ? badge(isProfile ? 'Restricted' : 'Granted', isProfile ? 'warning' : 'success') : h('span', { class: 'muted small' }, isProfile ? 'Default (full)' : 'Not granted'))));
        }
      };
      drawRows();
      mount(content,
        !objPerm.read ? h('div', { class: 'alert warning mb-8' }, icon('alert'), h('div', `This ${T.singular.toLowerCase()} has no Read access to ${def.pluralLabel || def.label}. Field settings only take effect once the object is readable.`)) : null,
        h('div', { class: 'table-wrap sa-scroll' }, h('table', { class: 'table perm-grid compact' },
          h('thead', h('tr', h('th', 'Field'), h('th', { class: 'sa-left' }, 'Type'), h('th', { class: 'center' }, 'Read Access'), h('th', { class: 'center' }, 'Edit Access'), h('th', { class: 'sa-left' }, 'Setting'))),
          tbody)));
    })();
    mount(wrap,
      h('div', { class: 'row mb-8 wrap' }, h('label', { class: 'form-label', for: 'fls-object', style: { margin: 0 } }, 'Object'), objSel,
        h('span', { class: 'muted small grow' }, isProfile ? 'Uncheck Read Access to hide a field from users with this profile.' : 'Check boxes to grant access in addition to the profile.'),
        editing || !canEdit ? null : h('button', { class: 'btn btn-sm', onClick: () => startEdit('fls') }, icon('edit'), 'Edit')),
      content);
    return wrap;
  }

  function usersTab() {
    const toolbar = type === 'permissionSet' && canEdit && !editing
      ? h('div', { class: 'row mb-8' }, h('span', { class: 'grow muted small' }, 'Users with this permission set assigned.'), h('button', { class: 'btn btn-sm', onClick: manageAssignments }, icon('users'), 'Manage Assignments'))
      : h('div', { class: 'muted small mb-8' }, type === 'profile' ? 'Users with this profile. Change a user’s profile from their user record.' : 'Users with this permission set assigned.');
    return h('div', toolbar, assigned.length
      ? dataTable({ compact: true, rows: assigned, initialSort: { key: 'Name', dir: 'asc' }, columns: [
        { key: 'Name', label: 'Full Name', render: userLink },
        { key: 'Username', label: 'Username' },
        { key: 'RoleName', label: 'Role', render: (u) => u.RoleName || h('span', { class: 'muted' }, '—') },
        type === 'permissionSet' ? { key: 'ProfileName', label: 'Profile' } : { key: 'Title', label: 'Title' },
        { key: 'IsActive', label: 'Active', render: (u) => activeBadge(u.IsActive) },
      ] }).el
      : emptyState('No users assigned', type === 'profile' ? 'No users have this profile yet.' : 'Assign this permission set to users to grant its permissions.', { iconName: 'users' }));
  }

  async function manageAssignments() {
    const selected = new Set(assigned.map((u) => u.Id));
    const before = new Set(selected);
    let term = '';
    const list = h('div', { class: 'sa-checklist-box' });
    const drawList = () => mount(list, users.filter((u) => u.IsActive || selected.has(u.Id)).filter((u) => !term || u.Name.toLowerCase().includes(term) || u.Username.toLowerCase().includes(term)).map((u) =>
      h('label', { class: 'sa-check-row' }, h('input', { type: 'checkbox', checked: selected.has(u.Id), onChange: (e) => { if (e.target.checked) selected.add(u.Id); else selected.delete(u.Id); } }),
        h('span', { class: 'avatar sm' }, fmt.initials(u.Name)), h('div', { class: 'grow' }, h('div', { class: 'strong' }, u.Name), h('div', { class: 'small muted' }, `${u.Username} · ${u.ProfileName || ''}`)))));
    drawList();
    const btn = h('button', { class: 'btn btn-brand', onClick: async () => {
      btn.disabled = true;
      try {
        for (const u of users) {
          const had = before.has(u.Id), has = selected.has(u.Id);
          if (had === has) continue;
          const sets = new Set(u.PermissionSets || []);
          if (has) sets.add(id); else sets.delete(id);
          await PATCH(`/api/setup/users/${u.Id}`, { PermissionSets: [...sets] });
        }
        m.close();
        toast('Assignments saved', 'success');
        renderPermDetail(container, { type, id, app, query: { tab: 'users' } });
      } catch (e) { m.setError(e.message); btn.disabled = false; }
    } }, 'Save');
    const m = modal({ title: `Assign "${labelOf(meta)}"`, body: h('div', h('div', { class: 'mb-8' }, searchBox('Search users...', (t) => { term = t; drawList(); })), list),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), btn] });
  }

  draw();
}
