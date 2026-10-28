// Home page: greeting, key metrics, pipeline, approvals, tasks, events, recent records.
import { h, icon, fmt, mount, objIcon, avatar, toast, emptyState, spinner } from '../lib.js';
import { GET, PATCH, POST, getObj, me, objForId, state } from '../api.js';
import { recordForm } from '../fields.js';
import { homeAICards } from '../ai/widgets.js';

function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

function statValue(s) {
  if (s.type === 'Currency') return fmt.currency(s.value, { compact: true });
  if (s.type === 'Percent') return fmt.percent(s.value);
  return fmt.number(s.value);
}

export default async function render(root, { app }) {
  app.setTitle('Home');
  const data = await GET('/api/home');
  const user = me();

  const header = h('div', { class: 'page-header home-hero' },
    h('div', { class: 'title-row' },
      avatar(user.Name, ''),
      h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
        h('h1', `${greeting()}, ${user.FirstName || user.Name}`)),
      h('div', { class: 'actions' },
        getObj('Task')?.perms.create ? h('button', { class: 'btn', onClick: async () => { if (await recordForm('Task', { mode: 'new', defaults: { ActivityDate: new Date().toISOString().slice(0, 10) } })) app.reload(); } }, icon('task'), 'New Task') : null,
        getObj('Opportunity')?.perms.create ? h('button', { class: 'btn btn-brand', onClick: async () => { const r = await recordForm('Opportunity', { mode: 'new' }); if (r) app.navigate(`/r/${r.Id}`); } }, icon('plus'), 'New Opportunity') : null)));

  const stats = data.stats.length ? h('div', { class: 'grid-4 mb-16 home-stats' }, data.stats.map((s) =>
    h('div', { class: 'card p-16' }, h('div', { class: 'small muted' }, s.label), h('div', { class: 'stat-value' }, statValue(s))))) : null;

  // Pipeline bars
  let pipeline = null;
  if (data.pipeline) {
    const max = Math.max(1, ...data.pipeline.map((p) => p.amount));
    pipeline = h('div', { class: 'card' },
      h('div', { class: 'card-header' }, icon('chart'), h('h3', 'My Open Pipeline by Stage'), h('a', { class: 'btn btn-sm', href: '#/o/Opportunity' }, 'View Opportunities')),
      h('div', { class: 'card-body' }, data.pipeline.some((p) => p.count)
        ? data.pipeline.map((p) => h('div', { class: 'bar-row' },
          h('div', { class: 'bar-label truncate', title: p.stage }, p.stage),
          h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${Math.max(2, (p.amount / max) * 100)}%` } })),
          h('div', { class: 'bar-value' }, fmt.currency(p.amount, { compact: true }), h('span', { class: 'muted small' }, ` · ${p.count}`))))
        : emptyState('No open opportunities', 'Opportunities you own will show up here.', { iconName: 'target' })));
  }

  // Approvals
  const approvals = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('approval'), h('h3', `Items to Approve (${data.approvals.length})`), h('a', { class: 'btn btn-sm', href: '#/approvals' }, 'View All')),
    h('div', { class: 'card-body flush' }, data.approvals.length
      ? h('table', { class: 'table' }, h('tbody', data.approvals.slice(0, 5).map((a) => h('tr',
        h('td', h('a', { href: `#/r/${a.recordId}` }, a.recordName), h('div', { class: 'small muted' }, `${a.objectLabel} · ${a.submittedBy} · ${fmt.relative(a.createdAt)}`)),
        h('td', { class: 'right nowrap' },
          h('button', { class: 'btn btn-sm', onClick: () => act(a, 'approve') }, 'Approve'), ' ',
          h('button', { class: 'btn btn-sm', onClick: () => act(a, 'reject') }, 'Reject'))))))
      : h('div', { class: 'p-16 muted center' }, 'No approval requests waiting for you.')));

  async function act(a, action) {
    try {
      await POST(`/api/approvals/${a.id}/${action}`, { comments: '' });
      toast(`Request ${action === 'approve' ? 'approved' : 'rejected'}`, 'success');
      app.reload();
    } catch (e) { toast(e.message, 'error'); }
  }

  // Tasks
  const today = new Date().toISOString().slice(0, 10);
  const tasks = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('task'), h('h3', 'My Open Tasks'), h('a', { class: 'btn btn-sm', href: '#/o/Task' }, 'View All')),
    h('div', { class: 'card-body flush' }, data.tasks.length ? h('div', data.tasks.map((t) => {
      const overdue = t.ActivityDate && t.ActivityDate < today;
      const cb = h('input', { type: 'checkbox', 'aria-label': 'Complete task', onChange: async () => {
        try { await PATCH(`/api/record/${t.Id}`, { Status: 'Completed' }); row.classList.add('done'); toast('Task completed', 'success'); } catch (e) { cb.checked = false; toast(e.message, 'error'); }
      } });
      const row = h('div', { class: 'task-row' }, h('label', { class: 'checkbox' }, cb),
        h('div', { class: 'grow' }, h('a', { href: `#/r/${t.Id}` }, t.Name),
          h('div', { class: 'small muted' }, [t._labels?.WhoId, t._labels?.WhatId].filter(Boolean).join(' · '))),
        t.ActivityDate ? h('span', { class: ['badge', overdue && 'danger'] }, overdue ? `Overdue · ${fmt.date(t.ActivityDate)}` : fmt.date(t.ActivityDate)) : null,
        t.Priority === 'High' ? h('span', { class: 'badge warning' }, 'High') : null);
      return row;
    })) : h('div', { class: 'p-16 muted center' }, 'Nothing due. Nice work!')));

  const events = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('calendar'), h('h3', 'Upcoming Events'), h('a', { class: 'btn btn-sm', href: '#/calendar' }, 'Calendar')),
    h('div', { class: 'card-body flush' }, data.events.length ? h('div', data.events.map((e) => h('div', { class: 'task-row' },
      h('div', { class: 'event-date' }, h('div', { class: 'tiny muted' }, new Date(e.StartDateTime).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()), h('div', { class: 'strong' }, new Date(e.StartDateTime).getDate())),
      h('div', { class: 'grow' }, h('a', { href: `#/r/${e.Id}` }, e.Name), h('div', { class: 'small muted' }, `${fmt.time(e.StartDateTime)} – ${fmt.time(e.EndDateTime)}${e.Location ? ' · ' + e.Location : ''}`)))))
      : h('div', { class: 'p-16 muted center' }, 'No upcoming events.')));

  const recent = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('clock'), h('h3', 'Recent Records')),
    h('div', { class: 'card-body flush' }, data.recent.length ? h('div', data.recent.map((r) => h('a', { class: 'menu-item', href: `#/r/${r.Id}`, style: { padding: '9px 16px', borderRadius: 0 } },
      objIcon(getObj(r.object), 'sm'), h('span', { class: 'grow truncate' }, r.Name), h('span', { class: 'muted small' }, r.objectLabel))))
      : h('div', { class: 'p-16 muted center' }, 'Records you view will appear here.')));

  mount(root, header, stats,
    h('div', { class: 'home-grid' },
      h('div', { class: 'col gap-16' }, pipeline, tasks, events),
      h('div', { class: 'col gap-16' }, homeAICards(), approvals, recent, quickLinks())));
}

function quickLinks() {
  const items = [
    ['Reports', '#/reports', 'chart'], ['Dashboards', '#/dashboards', 'dashboard'], ['Chatter', '#/chatter', 'message'], ['Calendar', '#/calendar', 'calendar'],
  ];
  return h('div', { class: 'card' }, h('div', { class: 'card-header' }, icon('zap'), h('h3', 'Quick Links')),
    h('div', { class: 'card-body grid-2' }, items.map(([l, href, ic]) => h('a', { class: 'quick-link', href }, icon(ic), l))));
}
