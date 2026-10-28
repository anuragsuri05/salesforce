// Setup › Flows: list of flows, new-flow type picker, and the Flow Builder (#/setup/flows/:id).
import { h, icon, mount, clear, fmt, modal, confirmDialog, toast, showMenu, badge, spinner, emptyState } from '../lib.js';
import { GET, PUT, DEL, getObj, can } from '../api.js';
import { setupHeader } from './index.js';
import { FLOW_TYPES, triggerText } from './flow/elements.js';
import { renderBuilder } from './flow/builder.js';

export default async function flowsPage(container, { segments, query, app }) {
  const sub = segments[0];
  if (sub === 'new') return renderBuilder(container, { type: query.type || 'record', app });
  if (sub) return renderBuilder(container, { id: sub, app });
  return renderList(container, { app, query });
}

export function newFlowDialog(app, preset) {
  let chosen = preset || 'record';
  const cards = h('div', { class: 'flow-type-grid' });
  const draw = () => {
    clear(cards);
    for (const [key, t] of Object.entries(FLOW_TYPES)) {
      cards.appendChild(h('button', {
        type: 'button', class: ['flow-type-card', chosen === key && 'active'], 'aria-pressed': String(chosen === key),
        onClick: () => { chosen = key; draw(); }, onDblclick: () => { chosen = key; go(); },
      },
      h('span', { class: 'flow-type-icon', style: { background: t.color } }, icon(t.icon)),
      h('div', { class: 'grow' }, h('div', { class: 'strong' }, t.label), h('div', { class: 'small muted mt-4' }, t.desc)),
      h('span', { class: 'flow-type-check' }, icon('check', { size: 14 }))));
    }
  };
  draw();
  const go = () => { m.close(); app.navigate(`/setup/flows/new?type=${chosen}`); };
  const m = modal({
    title: 'New Flow', size: 'lg',
    body: h('div', h('div', { class: 'muted mb-16' }, 'Choose how the flow is launched. You can’t change the type later.'), cards),
    footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: go }, 'Create')],
  });
}

async function renderList(container, { app, query }) {
  app.setTitle('Flows');
  const editable = can('ManageFlows');
  let flows = [];
  let filterType = query.type && FLOW_TYPES[query.type] ? query.type : 'all';
  let term = '';
  const body = h('div', spinner());
  const search = h('input', { class: 'input input-sm', placeholder: 'Search flows...', 'aria-label': 'Search flows', onInput: () => { term = search.value.trim().toLowerCase(); draw(); } });
  const typeBar = h('div', { class: 'btn-group' });
  const count = h('span', { class: 'muted small' });

  mount(container,
    setupHeader('Flows', {
      crumb: 'Setup › Process Automation', iconName: 'flow',
      description: 'Automate business processes: update records, create tasks, send notifications and emails when records change or on a schedule.',
      actions: editable ? [h('button', { class: 'btn btn-brand', onClick: () => newFlowDialog(app) }, icon('plus'), 'New Flow')] : [],
    }),
    !editable ? h('div', { class: 'alert warning mb-16' }, icon('lock'), h('div', 'You can view flows, but you need the “Manage Flows” permission to create or change them.')) : null,
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, typeBar, h('span', { class: 'spacer' }), count, h('div', { class: 'input-group', style: { width: '240px' } }, icon('search'), search)),
      body));

  const drawTypes = () => {
    clear(typeBar);
    for (const [k, l] of [['all', 'All'], ...Object.entries(FLOW_TYPES).map(([k2, t]) => [k2, t.short])]) {
      const n = k === 'all' ? flows.length : flows.filter((f) => f.flowType === k).length;
      typeBar.appendChild(h('button', { class: ['btn btn-sm', filterType === k && 'active'], onClick: () => { filterType = k; drawTypes(); draw(); } }, l, h('span', { class: 'muted tiny' }, ` ${n}`)));
    }
  };

  const load = async () => {
    try {
      flows = await GET('/api/setup/meta/flow');
      drawTypes();
      draw();
    } catch (e) {
      mount(body, emptyState('Couldn’t load flows', e.message, { iconName: 'alert' }));
    }
  };

  async function setActive(f, active) {
    try {
      const saved = await PUT(`/api/setup/meta/flow/${f.id}`, { ...f, active });
      Object.assign(f, saved);
      toast(`Flow “${f.label}” ${active ? 'activated' : 'deactivated'}.`, 'success');
    } catch (e) { toast(e.message, 'error'); }
    draw();
  }

  async function remove(f) {
    if (!(await confirmDialog(h('div', 'Delete the flow ', h('strong', f.label), '? This can’t be undone.'), { title: 'Delete Flow', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await DEL(`/api/setup/meta/flow/${f.id}`);
      flows = flows.filter((x) => x.id !== f.id);
      toast(`Flow “${f.label}” deleted.`, 'success');
      drawTypes(); draw();
    } catch (e) { toast(e.message, 'error'); }
  }

  function draw() {
    const shown = flows
      .filter((f) => filterType === 'all' || f.flowType === filterType)
      .filter((f) => !term || [f.label, f.name, f.object, getObj(f.object)?.label, f.description].some((x) => String(x || '').toLowerCase().includes(term)))
      .sort((a, b) => a.label.localeCompare(b.label));
    count.textContent = `${shown.length} item${shown.length === 1 ? '' : 's'}`;
    if (!flows.length) {
      mount(body, emptyState('No flows yet', 'Flows automate work when records change or on a schedule.', { iconName: 'flow', action: editable ? h('button', { class: 'btn btn-brand', onClick: () => newFlowDialog(app) }, icon('plus'), 'New Flow') : null }));
      return;
    }
    if (!shown.length) { mount(body, emptyState('No matching flows', 'Try a different search or type.')); return; }
    mount(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', h('tr', h('th', 'Flow Label'), h('th', 'Type'), h('th', 'Object'), h('th', 'Trigger'), h('th', 'Active'), h('th', { class: 'num' }, 'Version'), h('th', 'Last Modified'), h('th', { style: { width: '44px' } }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', shown.map((f) => {
        const t = FLOW_TYPES[f.flowType] || { short: f.flowType, color: '#64748b', icon: 'flow' };
        const o = getObj(f.object);
        const toggle = h('input', { type: 'checkbox', checked: !!f.active, disabled: !editable, 'aria-label': `${f.active ? 'Deactivate' : 'Activate'} ${f.label}`, onChange: () => setActive(f, toggle.checked) });
        return h('tr',
          h('td', h('a', { href: `#/setup/flows/${f.id}`, class: 'strong' }, f.label), f.description ? h('div', { class: 'tiny muted truncate', style: { maxWidth: '320px' } }, f.description) : null),
          h('td', h('span', { class: 'flow-type-badge', style: `--c:${t.color}` }, icon(t.icon, { size: 12 }), t.short)),
          h('td', o ? h('span', { class: 'row gap-4' }, h('span', { class: 'obj-icon sm', style: { background: o.color } }, o.icon || o.label[0]), o.label) : f.object),
          h('td', { class: 'small' }, triggerText(f)),
          h('td', h('label', { class: 'switch', title: f.active ? 'Active' : 'Inactive' }, toggle, h('span'))),
          h('td', { class: 'num' }, String(f.version || 1)),
          h('td', { class: 'small', title: fmt.datetime(f.updatedAt) }, fmt.date(f.updatedAt)),
          h('td', h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': `Actions for ${f.label}`, onClick: (e) => showMenu(e.currentTarget, [
            { label: editable ? 'Open in Flow Builder' : 'View', icon: 'flow', href: `#/setup/flows/${f.id}` },
            editable ? { label: f.active ? 'Deactivate' : 'Activate', icon: f.active ? 'x' : 'zap', onClick: () => setActive(f, !f.active) } : null,
            f.flowType === 'scheduled' ? { label: 'Scheduled Jobs', icon: 'clock', href: '#/setup/scheduled' } : null,
            editable ? 'sep' : null,
            editable ? { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove(f) } : null,
          ], { align: 'right' }) }, icon('more'))));
      })))));
  }

  await load();
}
