// Setup → App Manager. Routes: #/setup/apps (list), #/setup/apps/new, #/setup/apps/:id (editor).
import { h, icon, mount, clear, spinner, emptyState, toast, confirmDialog } from '../lib.js';
import { GET, POST, PUT, DEL, getObj } from '../api.js';
import { SPECIAL_ITEMS } from '../app.js';
import { setupHeader } from './index.js';
import { canCustomize, apiFromLabel, formRow, input, textarea, iconColorPicker, dualList, checkList, toggleSwitch, busy, COLORS } from './objects/common.js';

export default async function appsPage(container, { segments, app }) {
  if (segments[0]) return appEditor(container, app, segments[0] === 'new' ? null : segments[0]);
  return appList(container, app);
}

async function appList(container, app) {
  app.setTitle('App Manager');
  const editable = canCustomize();
  const body = h('div', spinner());
  mount(container, setupHeader('App Manager', { iconName: 'dashboard', description: 'Apps group navigation items for a business process. Users switch apps from the App Launcher.',
    actions: editable ? [h('a', { class: 'btn btn-brand', href: '#/setup/apps/new' }, icon('plus'), 'New App')] : [] }), body);
  let apps, profiles;
  try { [apps, profiles] = await Promise.all([GET('/api/setup/meta/app'), GET('/api/setup/meta/profile').catch(() => [])]); }
  catch (e) { mount(body, h('div', { class: 'card p-24' }, emptyState('Could not load apps', e.message, { iconName: 'alert' }))); return; }
  const profName = new Map(profiles.map((p) => [p.id, p.name]));
  apps.sort((a, b) => a.label.localeCompare(b.label));

  const tbody = h('tbody');
  const draw = () => {
    clear(tbody);
    if (!apps.length) { tbody.appendChild(h('tr', h('td', { colspan: 7 }, emptyState('No apps', 'Create an app to give users a focused navigation bar.', { iconName: 'dashboard' })))); return; }
    for (const a of apps) {
      const sw = toggleSwitch(a.active !== false, async (v) => {
        try { Object.assign(a, await PUT(`/api/setup/meta/app/${a.id}`, { ...a, active: v })); await app.refreshMeta(); toast(`${a.label} ${v ? 'activated' : 'deactivated'}.`, 'success'); }
        catch (e) { toast(e.message, 'error'); sw.querySelector('input').checked = !v; }
      }, { label: `Active: ${a.label}`, disabled: !editable });
      tbody.appendChild(h('tr',
        h('td', h('a', { class: 'row gap-8', href: `#/setup/apps/${a.id}` }, h('span', { class: 'obj-icon sm', style: { background: a.color || '#0176d3' } }, a.icon || a.label[0]), h('span', { class: 'strong' }, a.label)),
          a.console ? h('span', { class: 'badge brand om-ml8' }, 'Console') : null),
        h('td', { class: 'mono' }, a.name),
        h('td', { class: 'muted', title: a.description || '' }, a.description || ''),
        h('td', { class: 'num' }, (a.items || []).length),
        h('td', a.profiles?.length ? h('span', { title: a.profiles.map((p) => profName.get(p) || p).join(', ') }, a.profiles.length === 1 ? profName.get(a.profiles[0]) || '1 profile' : `${a.profiles.length} profiles`) : h('span', { class: 'muted' }, 'Everyone')),
        h('td', sw),
        h('td', { class: 'right nowrap' },
          h('a', { class: 'btn btn-ghost btn-icon btn-sm', href: `#/setup/apps/${a.id}`, title: editable ? 'Edit' : 'View', 'aria-label': `${editable ? 'Edit' : 'View'} ${a.label}` }, icon(editable ? 'edit' : 'eye')),
          editable ? h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Delete', 'aria-label': `Delete ${a.label}`, onClick: () => deleteApp(a, app, async () => { apps = apps.filter((x) => x !== a); draw(); }) }, icon('trash')) : null)));
    }
  };
  draw();
  mount(body, h('div', { class: 'card' },
    h('div', { class: 'card-header' }, h('h2', 'Lightning Apps'), h('span', { class: 'muted small' }, `${apps.length} app${apps.length === 1 ? '' : 's'}`)),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', h('tr', h('th', 'App Name'), h('th', 'Developer Name'), h('th', 'Description'), h('th', { class: 'num' }, 'Items'), h('th', 'Assigned To'), h('th', 'Active'), h('th', ''))), tbody))));
}

async function deleteApp(a, app, after) {
  if (!(await confirmDialog(`Delete the app "${a.label}"? Users will no longer see it in the App Launcher. Objects and data are not affected.`, { title: 'Delete App', confirmLabel: 'Delete', danger: true }))) return;
  try {
    await DEL(`/api/setup/meta/app/${a.id}`);
    await app.refreshMeta();
    toast(`App "${a.label}" deleted.`, 'success');
    await after?.();
  } catch (e) { toast(e.message, 'error'); }
}

async function appEditor(container, app, id) {
  const editable = canCustomize();
  mount(container, spinner());
  let existing = null, profiles = [], objects = [];
  try {
    [existing, profiles, objects] = await Promise.all([
      id ? GET(`/api/setup/meta/app/${id}`) : null,
      GET('/api/setup/meta/profile').catch(() => []),
      GET('/api/setup/objects').catch(() => []),
    ]);
  } catch (e) {
    mount(container, h('div', { class: 'card p-24' }, emptyState(e.status === 404 ? 'App not found' : 'Could not load app', e.message, { iconName: 'alert', action: h('a', { class: 'btn', href: '#/setup/apps' }, 'Back to App Manager') })));
    return;
  }
  app.setTitle(existing ? `${existing.label} | App Manager` : 'New App | App Manager');
  const st = {
    label: existing?.label || '', name: existing?.name || '', description: existing?.description || '', color: existing?.color || COLORS[1], icon: existing?.icon || '',
    console: !!existing?.console, active: existing ? existing.active !== false : true, items: [...(existing?.items || ['home'])], profiles: [...(existing?.profiles || [])],
  };
  let nameTouched = !!existing;

  const options = [
    ...Object.entries(SPECIAL_ITEMS).map(([k, v]) => ({ value: k, label: v.label, meta: 'Page', group: 'Pages' })),
    ...objects.map((o) => ({ value: o.apiName, label: o.pluralLabel || o.label, meta: o.apiName, group: 'Objects', color: o.color, icon: o.icon })).sort((a, b) => a.label.localeCompare(b.label)),
  ];
  // Keep unknown items (e.g. deleted objects) visible so they can be removed.
  for (const it of st.items) if (!options.some((o) => o.value === it)) options.push({ value: it, label: `${it} (missing)`, meta: 'Unknown', group: 'Other' });

  const preview = h('div', { class: 'om-app-preview' });
  const drawPreview = () => {
    clear(preview);
    preview.append(
      h('div', { class: 'om-app-preview-bar', style: { borderBottomColor: st.color } },
        h('span', { class: 'obj-icon sm', style: { background: st.color } }, st.icon || (st.label || '?')[0]),
        h('span', { class: 'strong' }, st.label || 'App Name'),
        st.console ? h('span', { class: 'badge brand' }, 'Console') : null,
        h('span', { class: 'om-app-preview-items' }, st.items.map((it) => {
          const sp = SPECIAL_ITEMS[it];
          const o = sp ? null : objects.find((x) => x.apiName === it) || getObj(it);
          return h('span', { class: 'om-app-preview-item' }, sp ? icon(sp.icon, { size: 13 }) : null, sp ? sp.label : (o?.pluralLabel || it));
        }))));
  };

  const nameIn = input(st.name, { placeholder: 'e.g. Field_Service', readOnly: !editable, onInput: (v) => { st.name = v; nameTouched = true; } });
  const labelIn = input(st.label, { maxlength: 40, placeholder: 'e.g. Field Service', readOnly: !editable, onInput: (v) => {
    st.label = v; if (!nameTouched) { st.name = apiFromLabel(v); nameIn.value = st.name; } picker.refresh(); drawPreview();
  } });
  const picker = iconColorPicker({ iconText: st.icon, color: st.color, label: () => st.label, onChange: (v) => { st.icon = v.icon; st.color = v.color; drawPreview(); } });
  const items = dualList({ options, selected: st.items, height: 300, availableLabel: 'Available Items', selectedLabel: 'Selected Items', disabled: !editable, onChange: (v) => { st.items = v; drawPreview(); } });
  const profs = checkList(profiles.map((p) => ({ value: p.id, label: p.name })), st.profiles, (v) => { st.profiles = v; }, { height: 220, emptyText: 'No profiles' });
  drawPreview();

  const err = h('div', { class: 'modal-error hidden' });
  const saveBtn = h('button', { class: 'btn btn-brand', onClick: () => busy(saveBtn, save) }, icon('check'), 'Save');
  const actions = [h('a', { class: 'btn', href: '#/setup/apps' }, editable ? 'Cancel' : 'Back')];
  if (editable && existing) actions.unshift(h('button', { class: 'btn btn-danger', onClick: () => deleteApp(existing, app, () => app.navigate('/setup/apps')) }, icon('trash'), 'Delete'));
  if (editable) actions.push(saveBtn);

  mount(container,
    setupHeader(existing ? existing.label : 'New Lightning App', { iconName: 'dashboard', crumb: h('span', h('a', { href: '#/setup/apps' }, 'App Manager'), ' › ', existing ? 'Edit App' : 'New App'), actions }),
    err,
    h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Preview')), h('div', { class: 'card-body' }, preview)),
    h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'App Details & Branding')),
      h('div', { class: 'card-body' }, h('fieldset', { class: 'om-fieldset', disabled: !editable },
        h('div', { class: 'form-grid' },
          formRow('App Name', labelIn, { required: true }),
          formRow('Developer Name', nameIn, { required: true, help: 'Unique API name for the app.' }),
          formRow('Description', textarea(st.description, { rows: 3, onInput: (v) => { st.description = v; } })),
          formRow('Icon & Primary Color', picker.el),
          h('div', { class: 'form-row' }, h('div', { class: 'form-label' }, 'Navigation Style'),
            h('label', { class: 'row gap-8' }, toggleSwitch(st.console, (v) => { st.console = v; drawPreview(); }, { label: 'Console navigation', disabled: !editable }), h('span', 'Console navigation'),
              h('span', { class: 'muted small' }, '— records open in workspace tabs'))),
          h('div', { class: 'form-row' }, h('div', { class: 'form-label' }, 'Status'),
            h('label', { class: 'row gap-8' }, toggleSwitch(st.active, (v) => { st.active = v; }, { label: 'Active', disabled: !editable }), h('span', 'Active'), h('span', { class: 'muted small' }, '— inactive apps are hidden from the App Launcher'))))))),
    h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'Navigation Items'), h('span', { class: 'muted small' }, 'Double-click to add or remove; reorder with the arrows')),
      h('div', { class: 'card-body' }, items.el)),
    h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('h3', 'User Profiles'), h('span', { class: 'muted small' }, 'Leave empty to make the app available to everyone')),
      h('div', { class: 'card-body' }, h('fieldset', { class: 'om-fieldset', disabled: !editable }, profs.el))),
    editable ? h('div', { class: 'row om-footer-actions' }, h('span', { class: 'spacer' }), h('a', { class: 'btn', href: '#/setup/apps' }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: (e) => busy(e.currentTarget, save) }, icon('check'), 'Save')) : null);
  if (editable && !existing) setTimeout(() => labelIn.focus(), 30);

  function setError(msg) { err.textContent = msg || ''; err.classList.toggle('hidden', !msg); if (msg) window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function save() {
    setError('');
    if (!st.label.trim()) return setError('App Name is required.');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(st.name || apiFromLabel(st.label))) return setError('Developer Name must begin with a letter and contain only letters, numbers and underscores.');
    if (!st.items.length) return setError('Add at least one navigation item.');
    const payload = { label: st.label.trim(), name: st.name || apiFromLabel(st.label), description: st.description, color: st.color, icon: st.icon || st.label.trim()[0].toUpperCase(),
      items: st.items, profiles: st.profiles, active: st.active, console: st.console };
    try {
      const saved = existing ? await PUT(`/api/setup/meta/app/${existing.id}`, payload) : await POST('/api/setup/meta/app', payload);
      await app.refreshMeta();
      toast(`App "${saved.label}" saved.`, 'success');
      app.navigate('/setup/apps');
    } catch (e) { setError(e.message); }
  }
}

