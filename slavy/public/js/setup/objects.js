// Setup → Object Manager. Routes:
//   #/setup/objects                      object list
//   #/setup/objects/:api[/:tab[/:sub]]   object detail (details, fields, layout, rules, actions, automation, sharing)
import { h, icon, mount, clear, spinner, emptyState, modal, toast, showMenu, objIcon, badge, fmt } from '../lib.js';
import { GET, POST } from '../api.js';
import { setupHeader } from './index.js';
import {
  canCustomize, apiFromLabel, autoNumberPreview, formRow, input, textarea, select, checkbox, iconColorPicker, checkList, SHARING_MODELS, COLORS, busy,
} from './objects/common.js';

export default async function objectsPage(container, { segments, app }) {
  if (segments.length) {
    const mod = await import('./objects/detail.js');
    return mod.default(container, { segments, app });
  }
  return renderList(container, app);
}

async function renderList(container, app) {
  app.setTitle('Object Manager');
  const editable = canCustomize();
  const createBtn = editable ? h('button', { class: 'btn btn-brand', onClick: (e) => showMenu(e.currentTarget, [
    { label: 'Custom Object', icon: 'box', onClick: () => newObjectWizard(app) },
  ], { align: 'right' }) }, icon('plus'), 'Create', icon('chevronDown')) : null;
  const body = h('div', spinner());
  mount(container, setupHeader('Object Manager', { iconName: 'layers', crumb: 'Setup', actions: [createBtn], description: 'Customize objects: fields, page layouts, validation rules, actions and more.' }), body);

  let objects;
  try { objects = await GET('/api/setup/objects'); } catch (e) { mount(body, h('div', { class: 'card p-24' }, emptyState('Could not load objects', e.message, { iconName: 'alert' }))); return; }

  const q = h('input', { class: 'input', placeholder: 'Quick Find', 'aria-label': 'Search objects', type: 'search' });
  const typeFilter = h('div', { class: 'btn-group' });
  let kind = 'all';
  let sort = { key: 'label', dir: 1 };
  const tbody = h('tbody');
  const countEl = h('span', { class: 'muted small' });
  const cols = [
    { key: 'label', label: 'Label' }, { key: 'apiName', label: 'API Name' }, { key: 'isCustom', label: 'Type' },
    { key: 'fieldCount', label: 'Fields', num: true }, { key: 'recordCount', label: 'Records', num: true }, { key: 'description', label: 'Description' },
  ];
  const thead = h('thead');
  const drawHead = () => mount(thead, h('tr', cols.map((c) => h('th', { class: ['sortable', c.num && 'num'], 'aria-sort': sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none',
    onClick: () => { sort = { key: c.key, dir: sort.key === c.key ? -sort.dir : 1 }; draw(); } }, c.label, sort.key === c.key ? icon(sort.dir > 0 ? 'arrowUp' : 'arrowDown', { size: 12 }) : null))));
  const draw = () => {
    drawHead();
    const t = q.value.trim().toLowerCase();
    const rows = objects.filter((o) => (kind === 'all' || (kind === 'custom') === !!o.isCustom)
      && (!t || o.label.toLowerCase().includes(t) || o.apiName.toLowerCase().includes(t) || (o.description || '').toLowerCase().includes(t)))
      .sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        return (typeof x === 'number' || typeof x === 'boolean' ? (Number(x) - Number(y)) : String(x || '').localeCompare(String(y || ''))) * sort.dir;
      });
    clear(tbody);
    countEl.textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) { tbody.appendChild(h('tr', h('td', { colspan: cols.length }, emptyState('No objects found', 'Try a different search term.')))); return; }
    for (const o of rows) {
      tbody.appendChild(h('tr',
        h('td', h('a', { class: 'row gap-8 om-objlink', href: `#/setup/objects/${encodeURIComponent(o.apiName)}/details` }, objIcon(o, 'sm'), h('span', { class: 'strong' }, o.label))),
        h('td', { class: 'mono' }, o.apiName),
        h('td', o.isCustom ? badge('Custom', 'brand') : badge('Standard')),
        h('td', { class: 'num' }, fmt.number(o.fieldCount, 0)),
        h('td', { class: 'num' }, fmt.number(o.recordCount, 0)),
        h('td', { class: 'muted', title: o.description || '' }, o.description || '')));
    }
  };
  for (const [k, l] of [['all', 'All'], ['standard', 'Standard'], ['custom', 'Custom']]) {
    typeFilter.appendChild(h('button', { class: ['btn btn-sm', k === kind && 'active'], 'aria-pressed': String(k === kind), onClick: (e) => {
      kind = k; typeFilter.querySelectorAll('.btn').forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      e.currentTarget.classList.add('active'); e.currentTarget.setAttribute('aria-pressed', 'true'); draw();
    } }, l));
  }
  q.addEventListener('input', draw);
  draw();
  mount(body, h('div', { class: 'card' },
    h('div', { class: 'card-header' }, h('div', { class: 'input-group om-search' }, icon('search'), q), typeFilter, h('span', { class: 'spacer' }), countEl),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, thead, tbody))));
  setTimeout(() => q.focus(), 0);
}

// ---------- New Custom Object wizard ----------
export async function newObjectWizard(app) {
  const st = {
    label: '', pluralLabel: '', apiName: '', description: '', nameLabel: '', nameType: 'Text', format: 'A-{0000}',
    sharingModel: 'ReadWrite', trackHistory: false, enableActivities: true, enableFeed: true, icon: '', color: COLORS[Math.floor(Math.random() * COLORS.length)],
    addToApps: [], grantProfiles: [],
  };
  let apiTouched = false, pluralTouched = false, nameTouched = false;
  const [apps, profiles] = await Promise.all([GET('/api/setup/meta/app').catch(() => []), GET('/api/setup/meta/profile').catch(() => [])]);

  const labelIn = input('', { placeholder: 'e.g. Invoice', maxlength: 40, onInput: (v) => {
    st.label = v;
    if (!pluralTouched) { st.pluralLabel = v ? (/(s|x|ch|sh)$/i.test(v) ? v + 'es' : /[^aeiou]y$/i.test(v) ? v.slice(0, -1) + 'ies' : v + 's') : ''; pluralIn.value = st.pluralLabel; }
    if (!apiTouched) { st.apiName = apiFromLabel(v); apiIn.value = st.apiName; }
    if (!nameTouched) { st.nameLabel = v ? `${v} ${st.nameType === 'AutoNumber' ? 'Number' : 'Name'}` : ''; nameIn.value = st.nameLabel; }
    picker.refresh();
  } });
  const pluralIn = input('', { placeholder: 'e.g. Invoices', maxlength: 40, onInput: (v) => { st.pluralLabel = v; pluralTouched = true; } });
  const apiIn = input('', { placeholder: 'Invoice', onInput: (v) => { st.apiName = v; apiTouched = true; } });
  const nameIn = input('', { placeholder: 'e.g. Invoice Name', onInput: (v) => { st.nameLabel = v; nameTouched = true; } });
  const preview = h('span', { class: 'mono' });
  const fmtIn = input(st.format, { onInput: (v) => { st.format = v; drawPreview(); } });
  const drawPreview = () => { preview.textContent = autoNumberPreview(st.format, 1); };
  const fmtRow = h('div', { class: 'hidden' }, formRow('Display Format', fmtIn, { required: true, help: h('span', 'Use {0000} for the sequence number (zeros = minimum digits) and {YYYY} for the year. Example: ', preview) }));
  drawPreview();
  const nameTypeSel = select([{ value: 'Text', label: 'Text' }, { value: 'AutoNumber', label: 'Auto Number' }], st.nameType, (v) => {
    st.nameType = v; fmtRow.classList.toggle('hidden', v !== 'AutoNumber');
    if (!nameTouched && st.label) { st.nameLabel = `${st.label} ${v === 'AutoNumber' ? 'Number' : 'Name'}`; nameIn.value = st.nameLabel; }
  });
  const picker = iconColorPicker({ iconText: '', color: st.color, label: () => st.label, onChange: (v) => { st.icon = v.icon; st.color = v.color; } });

  const body = h('div', { class: 'om-wizard' },
    h('div', { class: 'section-title' }, 'Custom Object Information'),
    h('div', { class: 'form-grid' },
      formRow('Label', labelIn, { required: true, help: 'Singular name shown in tabs, headers and buttons.' }),
      formRow('Plural Label', pluralIn, { required: true }),
      formRow('Object Name', h('div', { class: 'om-suffix-input' }, apiIn, h('span', { class: 'om-suffix' }, '__c')), { required: true, help: 'Unique API name used by the API, formulas and SOQL.' }),
      formRow('Description', textarea('', { rows: 2, onInput: (v) => { st.description = v; } }))),
    h('div', { class: 'section-title' }, 'Enter Record Name Label and Format'),
    h('div', { class: 'form-help mb-8' }, 'The Record Name appears in page layouts, related lists, lookups and search results.'),
    h('div', { class: 'form-grid' }, formRow('Record Name', nameIn, { required: true }), formRow('Data Type', nameTypeSel), fmtRow),
    h('div', { class: 'section-title' }, 'Optional Features'),
    h('div', { class: 'om-options' },
      checkbox('Track Field History', false, (v) => { st.trackHistory = v; }, { help: 'Record changes to selected fields in a history related list.' }),
      checkbox('Allow Activities', true, (v) => { st.enableActivities = v; }, { help: 'Tasks and events can be related to these records.' }),
      checkbox('Enable Chatter Feed', true, (v) => { st.enableFeed = v; }, { help: 'Show a feed on the record page.' })),
    h('div', { class: 'section-title' }, 'Sharing & Appearance'),
    h('div', { class: 'form-grid' },
      formRow('Default Internal Access (OWD)', select(SHARING_MODELS.filter((s) => s.value !== 'ControlledByParent'), st.sharingModel, (v) => { st.sharingModel = v; })),
      formRow('Icon & Color', picker.el)),
    h('div', { class: 'section-title' }, 'Deployment'),
    h('div', { class: 'form-grid' },
      formRow('Add to Apps', checkList(apps.map((a) => ({ value: a.id, label: a.label })), [], (v) => { st.addToApps = v; }, { height: 150, emptyText: 'No apps' }).el,
        { help: 'A navigation tab is added to each selected app.' }),
      formRow('Grant Full Access to Profiles', checkList(profiles.map((p) => ({ value: p.id, label: p.name })), [], (v) => { st.grantProfiles = v; }, { height: 150, emptyText: 'No profiles' }).el,
        { help: 'Read, Create, Edit and Delete permission on the new object.' })));

  const saveBtn = h('button', { class: 'btn btn-brand', onClick: () => busy(saveBtn, save) }, 'Save');
  const m = modal({ title: 'New Custom Object', size: 'lg', body, footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), saveBtn] });

  async function save() {
    m.setError('');
    if (!st.label.trim()) return m.setError('Label is required.');
    if (!st.pluralLabel.trim()) return m.setError('Plural label is required.');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(st.apiName.replace(/__c$/, ''))) return m.setError('Object Name must begin with a letter and contain only letters, numbers and underscores.');
    if (st.apiName.replace(/__c$/, '').includes('__')) return m.setError('Object Name cannot contain two consecutive underscores.');
    if (!st.nameLabel.trim()) return m.setError('Record Name is required.');
    try {
      const obj = await POST('/api/setup/objects', {
        label: st.label.trim(), pluralLabel: st.pluralLabel.trim(), apiName: st.apiName.replace(/__c$/, ''), description: st.description,
        nameField: st.nameType === 'AutoNumber' ? { label: st.nameLabel, type: 'AutoNumber', format: st.format || '{0000}' } : { label: st.nameLabel, type: 'Text' },
        sharingModel: st.sharingModel, trackHistory: st.trackHistory, enableActivities: st.enableActivities, enableFeed: st.enableFeed,
        icon: st.icon || st.label[0].toUpperCase(), color: st.color, addToApps: st.addToApps, grantProfiles: st.grantProfiles,
      });
      m.close();
      await app.refreshMeta();
      toast(`Custom object "${obj.label}" created.`, 'success');
      app.navigate(`/setup/objects/${encodeURIComponent(obj.apiName)}/fields`);
    } catch (e) { m.setError(e.message); }
  }
}
