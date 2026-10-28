// Sharing Settings: sharing model explainer, organization-wide defaults, sharing rules.
import { h, icon, mount, clear, spinner, modal, confirmDialog, toast, badge, emptyState, objIcon } from '../lib.js';
import { GET, POST, PUT, PATCH, DEL, getObj } from '../api.js';
import { filterEditor, describeFilter } from '../components/filters.js';
import { setupHeader } from './index.js';
import { canCustomize, formRow, select, loadDirectory, principalLabel, principalPicker, apiNameFrom, readOnlyNote, ACCESS_LABELS } from './admin-common.js';

export default async function render(container, { app, query }) {
  app.setTitle('Sharing Settings');
  const canEdit = canCustomize();
  const header = setupHeader('Sharing Settings', { crumb: 'Setup › Security', iconName: 'lock',
    description: 'Control who can see and edit records. Start with the most restrictive baseline, then open up access.' });
  mount(container, header, spinner());

  let [objects, rules, dir] = await Promise.all([GET('/api/setup/objects'), GET('/api/setup/meta/sharingRule'), loadDirectory(['roles', 'groups', 'users'])]);
  objects.sort((a, b) => a.label.localeCompare(b.label));
  let ruleObject = query?.object && objects.some((o) => o.apiName === query.object) ? query.object : '';
  let editingOwd = false;
  const owdDraft = {};

  // Objects that can use "Controlled by Parent": activities, or objects with a master-detail field.
  const detailCache = new Map();
  const hasMasterDetail = (o) => {
    const meta = getObj(o.apiName);
    if (meta?.fields) return meta.fields.some((f) => f.type === 'MasterDetail');
    return detailCache.get(o.apiName) || false;
  };
  const canBeControlled = (o) => !!o.isActivity || hasMasterDetail(o) || o.sharingModel === 'ControlledByParent';

  // ----- explainer -----
  const steps = [
    ['Organization-Wide Defaults', 'The baseline: the most restrictive access everyone gets to records they don’t own.', 'lock'],
    ['Role Hierarchy', 'Managers automatically get access to records owned by users in roles below them.', 'users'],
    ['Sharing Rules', 'Automatic exceptions that open access to groups of users, by owner or by criteria.', 'share'],
    ['Manual Sharing', 'Record owners share individual records with specific users, roles or groups.', 'user'],
  ];
  const explainer = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('info'), h('h3', 'How record access works')),
    h('div', { class: 'card-body' },
      h('div', { class: 'sa-sharing-steps' }, steps.map(([t, d, ic], i) => [
        i ? h('div', { class: 'sa-step-arrow', 'aria-hidden': 'true' }, icon('chevronRight')) : null,
        h('div', { class: 'sa-step' }, h('div', { class: 'sa-step-num' }, String(i + 1)), h('div', { class: 'row gap-4 strong' }, icon(ic), t), h('div', { class: 'small muted' }, d)),
      ])),
      h('div', { class: 'small muted mt-8' }, 'Each layer can only grant more access, never take it away. Object permissions on profiles and permission sets decide whether a user can work with an object at all; sharing decides which records. "View All" / "Modify All" and the "View All Data" / "Modify All Data" system permissions bypass sharing.')));

  // ----- OWD -----
  const owdCard = h('div', { class: 'card', id: 'owd' });
  function drawOwd() {
    const actions = !canEdit ? null : editingOwd
      ? [h('button', { class: 'btn btn-sm', onClick: () => { editingOwd = false; Object.keys(owdDraft).forEach((k) => delete owdDraft[k]); drawOwd(); } }, 'Cancel'), saveOwdBtn()]
      : [h('button', { class: 'btn btn-sm', onClick: () => { editingOwd = true; drawOwd(); } }, icon('edit'), 'Edit')];
    const changed = Object.keys(owdDraft).length;
    mount(owdCard,
      h('div', { class: 'card-header' }, icon('lock'), h('h3', 'Organization-Wide Defaults'), editingOwd && changed ? badge(`${changed} changed`, 'warning') : null, actions),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
        h('thead', h('tr', h('th', 'Object'), h('th', 'Default Internal Access'), h('th', { class: 'center' }, 'Grant Access Using Hierarchies'), h('th', { class: 'num' }, 'Sharing Rules'))),
        h('tbody', objects.map((o) => {
          const cur = owdDraft[o.apiName] ?? o.sharingModel ?? 'ReadWrite';
          const opts = [['Private', 'Private'], ['Read', 'Public Read Only'], ['ReadWrite', 'Public Read/Write']];
          if (canBeControlled(o)) opts.push(['ControlledByParent', 'Controlled by Parent']);
          const nRules = rules.filter((r) => r.object === o.apiName).length;
          return h('tr', { class: owdDraft[o.apiName] ? 'selected' : null },
            h('td', h('div', { class: 'row' }, objIcon(getObj(o.apiName) || o, 'sm'), h('span', { class: 'strong' }, o.label), o.isCustom ? badge('Custom') : null)),
            h('td', editingOwd
              ? select(opts, cur, { cls: 'input input-sm sa-owd-select', ariaLabel: `Default access for ${o.label}`, onChange: (v) => { if (v === (o.sharingModel || 'ReadWrite')) delete owdDraft[o.apiName]; else owdDraft[o.apiName] = v; drawOwd(); } })
              : h('span', { class: `sa-access sa-access-${cur}` }, ACCESS_LABELS[cur] || cur)),
            h('td', { class: 'center' }, cur === 'ControlledByParent' ? h('span', { class: 'muted small' }, 'Inherited') : h('span', { class: 'sa-check', title: 'Always on' }, icon('check'))),
            h('td', { class: 'num' }, nRules ? h('button', { class: 'link-btn', onClick: () => { ruleObject = o.apiName; drawRules(); rulesCard.scrollIntoView({ behavior: 'smooth' }); } }, String(nRules)) : h('span', { class: 'muted' }, '0')));
        })))));
  }
  function saveOwdBtn() {
    const btn = h('button', { class: 'btn btn-brand btn-sm', onClick: async () => {
      const changes = Object.entries(owdDraft);
      if (!changes.length) { editingOwd = false; drawOwd(); return; }
      const toPrivate = changes.filter(([, v]) => v === 'Private' || v === 'Read');
      if (toPrivate.length && !(await confirmDialog(`You are restricting default access on ${toPrivate.map(([k]) => objects.find((o) => o.apiName === k)?.label).join(', ')}. Users may lose access to records they don’t own. Continue?`, { title: 'Change Organization-Wide Defaults', confirmLabel: 'Save' }))) return;
      btn.disabled = true;
      try {
        for (const [api, model] of changes) {
          await PATCH(`/api/setup/objects/${encodeURIComponent(api)}`, { sharingModel: model });
          const o = objects.find((x) => x.apiName === api);
          if (o) o.sharingModel = model;
          delete owdDraft[api];
        }
        editingOwd = false;
        await app.refreshMeta();
        toast('Organization-wide defaults saved', 'success');
        drawOwd(); drawRules();
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; drawOwd(); }
    } }, 'Save');
    return btn;
  }

  // ----- sharing rules -----
  const rulesCard = h('div', { class: 'card', id: 'rules' });
  function criteriaText(r) {
    if (r.ruleType === 'criteria') {
      if (!r.filters?.length) return 'All records';
      return h('div', { class: 'col gap-0' }, r.filters.map((f, i) => { const d = describeFilter(r.object, f); return h('div', { class: 'small' }, h('span', { class: 'muted' }, `${i + 1}. `), `${d.field} ${d.op} `, h('strong', d.value)); }),
        r.filterLogic ? h('div', { class: 'tiny muted' }, `Logic: ${r.filterLogic}`) : null);
    }
    return h('span', { class: 'small' }, 'Owned by ', h('strong', principalLabel(r.ownedBy, dir)));
  }
  function drawRules() {
    const shown = objects.filter((o) => !ruleObject || o.apiName === ruleObject);
    const groups = shown.map((o) => [o, rules.filter((r) => r.object === o.apiName)]).filter(([o, list]) => list.length || o.apiName === ruleObject);
    const objSel = select([['', 'All objects'], ...objects.map((o) => [o.apiName, o.label])], ruleObject, { cls: 'input input-sm', ariaLabel: 'Filter sharing rules by object', onChange: (v) => {
      ruleObject = v; history.replaceState(null, '', `#/setup/sharing${v ? `?object=${encodeURIComponent(v)}` : ''}`); drawRules();
    } });
    objSel.style.width = '220px';
    mount(rulesCard,
      h('div', { class: 'card-header' }, icon('share'), h('h3', 'Sharing Rules'), objSel,
        canEdit ? h('button', { class: 'btn btn-brand btn-sm', onClick: () => ruleForm(null, ruleObject || 'Account') }, icon('plus'), 'New') : null),
      groups.length ? h('div', groups.map(([o, list]) => {
        const owd = o.sharingModel;
        return h('div', { class: 'sa-rule-group' },
          h('div', { class: 'sa-rule-group-head' }, objIcon(getObj(o.apiName) || o, 'sm'), h('strong', `${o.label} Sharing Rules`), h('span', { class: 'muted small' }, `Default: ${ACCESS_LABELS[owd] || owd}`),
            h('div', { class: 'spacer' }), canEdit ? h('button', { class: 'btn btn-sm', onClick: () => ruleForm(null, o.apiName) }, icon('plus'), 'New') : null),
          owd === 'ReadWrite' && list.length ? h('div', { class: 'alert warning sa-rule-note' }, icon('alert'), h('div', `The default for ${o.pluralLabel || o.label} is Public Read/Write, so these rules currently grant no extra access.`)) : null,
          owd === 'ControlledByParent' && list.length ? h('div', { class: 'alert warning sa-rule-note' }, icon('alert'), h('div', 'Access is controlled by the parent record, so these rules have no effect.')) : null,
          list.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
            h('thead', h('tr', h('th', 'Rule'), h('th', 'Criteria'), h('th', 'Shared With'), h('th', 'Access'), h('th', 'Status'), h('th', { class: 'right' }, ''))),
            h('tbody', list.map((r) => h('tr',
              h('td', h('div', { class: 'strong' }, r.label), h('div', { class: 'tiny muted' }, r.ruleType === 'criteria' ? 'Based on criteria' : 'Based on record owner')),
              h('td', { style: { whiteSpace: 'normal' } }, criteriaText(r)),
              h('td', principalLabel(r.sharedWith, dir)),
              h('td', badge(r.access === 'edit' ? 'Read/Write' : 'Read Only', r.access === 'edit' ? 'brand' : '')),
              h('td', r.active === false ? badge('Inactive') : badge('Active', 'success')),
              h('td', { class: 'right nowrap' }, canEdit ? [
                h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': `Edit ${r.label}`, title: 'Edit', onClick: () => ruleForm(r) }, icon('edit')),
                h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': `Delete ${r.label}`, title: 'Delete', onClick: () => removeRule(r) }, icon('trash')),
              ] : null)))))) : h('div', { class: 'muted small sa-rule-empty' }, `No sharing rules for ${o.pluralLabel || o.label}.`));
      })) : h('div', { class: 'card-body' }, emptyState('No sharing rules', 'Sharing rules extend access beyond the org-wide defaults.', { iconName: 'share' })));
  }

  async function removeRule(r) {
    if (!(await confirmDialog(`Delete the sharing rule "${r.label}"? Users who relied on it may lose access to records.`, { title: 'Delete Sharing Rule', confirmLabel: 'Delete', danger: true }))) return;
    try { await DEL(`/api/setup/meta/sharingRule/${r.id}`); rules = rules.filter((x) => x.id !== r.id); toast('Sharing rule deleted', 'success'); drawRules(); drawOwd(); } catch (e) { toast(e.message, 'error'); }
  }

  function ruleForm(rule, objApi) {
    const v = rule ? structuredClone(rule) : { label: '', name: '', object: objApi, ruleType: 'owner', ownedBy: null, filters: [], filterLogic: '', sharedWith: null, access: 'read', active: true };
    let apiTouched = !!rule;
    const label = h('input', { class: 'input', id: 'sr-label', value: v.label, onInput: () => { v.label = label.value; if (!apiTouched) { v.name = apiNameFrom(v.label); api.value = v.name; } } });
    const api = h('input', { class: 'input', id: 'sr-api', value: v.name, onInput: () => { apiTouched = true; v.name = api.value; } });
    const objSel = select(objects.filter((o) => o.sharingModel !== 'ControlledByParent' || o.apiName === v.object).map((o) => [o.apiName, o.label]), v.object, { id: 'sr-object', onChange: (x) => { v.object = x; v.filters = []; v.filterLogic = ''; drawSource(); drawOwdHint(); } });
    const typeWrap = h('div', { class: 'row gap-16', role: 'radiogroup', 'aria-label': 'Rule type' }, [['owner', 'Based on record owner'], ['criteria', 'Based on criteria']].map(([k, l]) =>
      h('label', { class: 'checkbox' }, h('input', { type: 'radio', name: 'sr-type', value: k, checked: v.ruleType === k, onChange: () => { v.ruleType = k; drawSource(); } }), l)));
    const source = h('div');
    let filterEd = null;
    const drawSource = () => {
      clear(source);
      if (v.ruleType === 'owner') {
        const p = principalPicker({ value: v.ownedBy, kinds: ['role', 'roleSub', 'group'], dir, idPrefix: 'sr-owner', onChange: (x) => { v.ownedBy = x; } });
        source.appendChild(formRow('Records owned by members of', p.el, { required: true }));
        filterEd = null;
      } else if (!getObj(v.object)) {
        source.appendChild(h('div', { class: 'alert warning' }, icon('alert'), h('div', 'You don’t have access to this object’s fields, so criteria can’t be edited.')));
      } else {
        filterEd = filterEditor({ objApi: v.object, filters: v.filters || [], logic: v.filterLogic || '', title: 'Criteria', onChange: ({ filters, filterLogic }) => { v.filters = filters; v.filterLogic = filterLogic; } });
        source.appendChild(h('div', { class: 'sa-criteria-box' }, filterEd.el));
      }
    };
    drawSource();
    const owdHint = h('div');
    const drawOwdHint = () => {
      const o = objects.find((x) => x.apiName === v.object);
      mount(owdHint, o?.sharingModel === 'ReadWrite' ? h('div', { class: 'alert warning mb-16' }, icon('alert'), h('div', `${o.label} records are already Public Read/Write by default. This rule will only matter if you make the default more restrictive.`)) : null);
    };
    drawOwdHint();
    const shareWith = principalPicker({ value: v.sharedWith, kinds: ['role', 'roleSub', 'group', 'allUsers'], dir, idPrefix: 'sr-share', onChange: (x) => { v.sharedWith = x; } });
    const access = select([['read', 'Read Only'], ['edit', 'Read/Write']], v.access, { id: 'sr-access', onChange: (x) => { v.access = x; } });
    const active = h('input', { type: 'checkbox', id: 'sr-active', checked: v.active !== false, onChange: () => { v.active = active.checked; } });

    const body = h('div',
      h('div', { class: 'section-title' }, '1. Rule details'),
      h('div', { class: 'form-grid' },
        formRow('Label', label, { required: true, id: 'sr-label' }),
        formRow('Rule Name', api, { required: true, id: 'sr-api' }),
        formRow('Object', objSel, { required: true, id: 'sr-object' }),
        formRow('Active', h('label', { class: 'checkbox', style: { height: '34px' } }, active, 'Rule is active'), { id: 'sr-active' })),
      owdHint,
      h('div', { class: 'section-title' }, '2. Select your rule type'), typeWrap,
      h('div', { class: 'section-title' }, '3. Select which records to share'), source,
      h('div', { class: 'section-title' }, '4. Select the users to share with'), formRow('Share with', shareWith.el, { required: true }),
      h('div', { class: 'section-title' }, '5. Select the level of access'), formRow('Access Level', access, { id: 'sr-access' }));

    const btn = h('button', { class: 'btn btn-brand', onClick: async () => {
      m.setError('');
      if (!v.label.trim()) return m.setError('Label is required.');
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(v.name || '')) return m.setError('Rule Name must start with a letter and contain only letters, numbers and underscores.');
      if (v.ruleType === 'owner' && !v.ownedBy?.id) return m.setError('Choose whose records to share.');
      if (v.ruleType === 'criteria' && !(v.filters || []).length) return m.setError('Add at least one criteria filter.');
      const sw = shareWith.get();
      if (!sw?.kind || (sw.kind !== 'allUsers' && !sw.id)) return m.setError('Choose who to share with.');
      btn.disabled = true;
      try {
        const payload = { label: v.label.trim(), name: v.name, object: v.object, ruleType: v.ruleType, ownedBy: v.ruleType === 'owner' ? v.ownedBy : null,
          filters: v.ruleType === 'criteria' ? v.filters : [], filterLogic: v.ruleType === 'criteria' ? v.filterLogic : '', sharedWith: sw, access: v.access, active: v.active !== false };
        const saved = rule ? await PUT(`/api/setup/meta/sharingRule/${rule.id}`, payload) : await POST('/api/setup/meta/sharingRule', payload);
        rules = rule ? rules.map((x) => (x.id === saved.id ? saved : x)) : [...rules, saved];
        m.close();
        toast(rule ? 'Sharing rule saved' : 'Sharing rule created', 'success');
        if (ruleObject && ruleObject !== saved.object) ruleObject = saved.object;
        drawRules(); drawOwd();
      } catch (e) { m.setError(e.message); btn.disabled = false; }
    } }, 'Save');
    const m = modal({ title: rule ? `Edit Sharing Rule` : 'New Sharing Rule', size: 'lg', body, footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), btn] });
  }

  // Fetch master-detail info for objects not in the client metadata cache (no read access).
  await Promise.all(objects.filter((o) => !getObj(o.apiName)).map(async (o) => {
    try { const d = await GET(`/api/setup/objects/${encodeURIComponent(o.apiName)}`); detailCache.set(o.apiName, d.fields.some((f) => f.type === 'MasterDetail')); } catch { /* ignore */ }
  }));

  drawOwd();
  drawRules();
  mount(container, header, canEdit ? null : readOnlyNote('You need the "Customize Application" permission to change sharing settings.'), explainer, owdCard, rulesCard);
  if (ruleObject) setTimeout(() => rulesCard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}
