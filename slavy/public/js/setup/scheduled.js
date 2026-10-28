// Setup › Scheduled Jobs: schedule-triggered flows, their last run and Run Now.
import { h, icon, mount, fmt, toast, confirmDialog, modal, badge, spinner, emptyState } from '../lib.js';
import { GET, POST, getObj, can } from '../api.js';
import { setupHeader } from './index.js';
import { scheduleText } from './flow/elements.js';
import { describeFilter } from '../components/filters.js';
import { showRunResult } from './flow/builder.js';

// Approximate next run time (UTC), mirroring the server scheduler's rules.
function nextRun(flow, last) {
  if (!flow.active) return null;
  const s = flow.schedule || {};
  const now = new Date();
  const [hh, mm] = String(s.time || '00:00').split(':').map(Number);
  const start = s.startDate ? new Date(`${s.startDate}T00:00:00Z`) : null;
  if (s.frequency === 'hourly') {
    const base = last ? new Date(new Date(last.at).getTime() + 3600000) : now;
    return start && base < start ? start : base < now ? now : base;
  }
  if (s.frequency === 'once') {
    if (last) return null;
    const d = start ? new Date(start) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCHours(hh || 0, mm || 0, 0, 0);
    return d < now ? now : d;
  }
  for (let i = 0; i < 9; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, hh || 0, mm || 0));
    if (d < now && !(i === 0 && (!last || new Date(last.at) < d))) continue;
    if (start && d < start) continue;
    if (s.frequency === 'weekly' && d.getUTCDay() !== Number(s.dayOfWeek ?? 1)) continue;
    return d < now ? now : d;
  }
  return null;
}

export default async function scheduledPage(container, { app }) {
  app.setTitle('Scheduled Jobs');
  const editable = can('ManageFlows');
  const body = h('div', spinner());
  mount(container,
    setupHeader('Scheduled Jobs', {
      crumb: 'Setup › Process Automation', iconName: 'clock',
      description: 'Schedule-triggered flows run automatically for every matching record. The scheduler checks for due jobs every minute; times are in UTC.',
      actions: [
        h('button', { class: 'btn', onClick: () => load(), 'aria-label': 'Refresh' }, icon('refresh'), 'Refresh'),
        editable ? h('a', { class: 'btn btn-brand', href: '#/setup/flows/new?type=scheduled' }, icon('plus'), 'New Scheduled Flow') : null,
      ],
    }),
    h('div', { class: 'card' }, body));

  async function runNow(f) {
    if (!(await confirmDialog(h('div', 'Run ', h('strong', f.label), ' now for every matching record?'), { title: 'Run Now', confirmLabel: 'Run' }))) return;
    try {
      const r = await POST(`/api/setup/flows/${f.id}/run`, {});
      showRunResult(f, r);
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  function showErrors(f, run) {
    showRunResult(f, run);
  }

  async function load() {
    mount(body, spinner());
    let flows, runs;
    try {
      [flows, runs] = await Promise.all([GET('/api/setup/meta/flow'), GET('/api/setup/flow-runs')]);
    } catch (e) { mount(body, emptyState('Couldn’t load scheduled jobs', e.message, { iconName: 'alert' })); return; }
    const list = flows.filter((f) => f.flowType === 'scheduled').sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label));
    if (!list.length) {
      mount(body, emptyState('No scheduled jobs', 'Create a schedule-triggered flow to run automation every hour, day or week.', { iconName: 'clock',
        action: editable ? h('a', { class: 'btn btn-brand', href: '#/setup/flows/new?type=scheduled' }, icon('plus'), 'New Scheduled Flow') : null }));
      return;
    }
    mount(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', h('tr', h('th', 'Job (Flow)'), h('th', 'Object'), h('th', 'Schedule'), h('th', 'Records'), h('th', 'Status'), h('th', 'Next Run'), h('th', 'Last Run'), h('th', h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', list.map((f) => {
        const last = runs[f.id];
        const o = getObj(f.object);
        const next = nextRun(f, last);
        const filters = (f.filters || []).map((x) => { const d = describeFilter(f.object, x); return `${d.field} ${d.op} ${d.value}`; });
        return h('tr',
          h('td', h('a', { class: 'strong', href: `#/setup/flows/${f.id}` }, f.label), f.description ? h('div', { class: 'tiny muted truncate', style: { maxWidth: '280px' } }, f.description) : null),
          h('td', o?.label || f.object),
          h('td', { class: 'small' }, scheduleText(f.schedule), f.schedule?.startDate ? h('div', { class: 'tiny muted' }, `Starting ${fmt.date(f.schedule.startDate)}`) : null),
          h('td', { class: 'small', title: filters.join('\n') }, filters.length ? `${filters.length} filter${filters.length > 1 ? 's' : ''}` : 'All records'),
          h('td', f.active ? badge('Scheduled', 'success') : badge('Inactive')),
          h('td', { class: 'small' }, next ? h('span', { title: next.toISOString() }, fmt.datetime(next)) : h('span', { class: 'muted' }, '—')),
          h('td', { class: 'small' }, last ? h('div', { class: 'row gap-4 wrap' },
            h('span', { title: fmt.datetime(last.at) }, fmt.relative(last.at)),
            badge(`${last.processed} processed`, 'brand'),
            last.errors?.length ? h('button', { class: 'badge danger sched-err', onClick: () => showErrors(f, last), title: 'View errors' }, `${last.errors.length} error${last.errors.length > 1 ? 's' : ''}`) : null)
            : h('span', { class: 'muted' }, 'Never run')),
          h('td', { class: 'nowrap right' },
            editable ? h('button', { class: 'btn btn-sm', onClick: () => runNow(f) }, icon('play', { size: 13 }), 'Run Now') : null, ' ',
            h('a', { class: 'btn btn-sm btn-ghost', href: `#/setup/flows/${f.id}`, title: 'Open in Flow Builder', 'aria-label': `Open ${f.label} in Flow Builder` }, icon('flow', { size: 14 }))));
      })))),
    h('div', { class: 'card-footer small muted', style: { justifyContent: 'flex-start' } }, icon('info', { size: 14 }), 'Inactive flows never run automatically, but you can still run them manually with Run Now. Each run is recorded with the number of records processed and any errors.'));
  }

  await load();
}
