// Calendar: month and week views of Events plus open Tasks by due date.
import { h, icon, mount, clear, fmt, toast, showMenu, spinner, store } from '../lib.js';
import { GET, getObj, qs } from '../api.js';
import { recordForm } from '../fields.js';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d) => addDays(dayStart(d), -d.getDay());
const parseYmd = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'short' }));
const HOUR_PX = 48;

export default async function calendarView(root, { query, app }) {
  app.setTitle('Calendar');
  const eventObj = getObj('Event');
  const taskObj = getObj('Task');
  let mode = query.view === 'week' || query.view === 'month' ? query.view : store.get('calendar:view', 'month');
  let cursor = query.date ? parseYmd(query.date) : dayStart(new Date());
  let mine = store.get('calendar:mine', false);
  let showTasks = store.get('calendar:tasks', true);
  let items = [];
  let loadSeq = 0;

  const titleEl = h('h1', { class: 'cal-title' });
  const rangeEl = h('div', { class: 'small muted' });
  const viewGroup = h('div', { class: 'btn-group', role: 'group', 'aria-label': 'Calendar view' });
  const grid = h('div', { class: 'cal-body' });
  const mineCb = h('input', { type: 'checkbox', checked: mine, onChange: () => { mine = mineCb.checked; store.set('calendar:mine', mine); load(); } });
  const taskCb = h('input', { type: 'checkbox', checked: showTasks, onChange: () => { showTasks = taskCb.checked; store.set('calendar:tasks', showTasks); load(); } });

  if (!eventObj?.perms?.read) {
    mount(root, h('div', { class: 'card p-24' }, h('div', { class: 'empty' }, h('h3', 'Calendar unavailable'), h('div', 'You don’t have access to Events.'))));
    return;
  }

  mount(root, h('div', { class: 'card cal' },
    h('div', { class: 'cal-head' },
      h('div', { class: 'row' }, h('span', { class: 'obj-icon lg', style: { background: eventObj.color } }, icon('calendar', { size: 20 })),
        h('div', h('div', { class: 'small muted' }, 'Calendar'), titleEl)),
      h('div', { class: 'row cal-nav' },
        h('button', { class: 'btn btn-icon', 'aria-label': 'Previous', title: 'Previous', onClick: () => step(-1) }, icon('chevronLeft')),
        h('button', { class: 'btn', onClick: () => { cursor = dayStart(new Date()); draw(); load(); } }, 'Today'),
        h('button', { class: 'btn btn-icon', 'aria-label': 'Next', title: 'Next', onClick: () => step(1) }, icon('chevronRight'))),
      h('span', { class: 'spacer' }),
      h('label', { class: 'row small cal-toggle' }, h('span', { class: 'switch' }, mineCb, h('span')), 'My events only'),
      taskObj?.perms?.read ? h('label', { class: 'row small cal-toggle' }, h('span', { class: 'switch' }, taskCb, h('span')), 'Show tasks') : null,
      viewGroup,
      h('button', { class: 'btn', onClick: () => load(), 'aria-label': 'Refresh', title: 'Refresh' }, icon('refresh')),
      eventObj.perms.create ? h('button', { class: 'btn btn-brand', onClick: () => newEvent(null) }, icon('plus'), 'New Event') : null),
    h('div', { class: 'cal-legend small' },
      h('span', { class: 'row gap-4' }, h('span', { class: 'cal-swatch event' }), 'Events'),
      showTasks ? h('span', { class: 'row gap-4' }, h('span', { class: 'cal-swatch task' }), 'Open tasks (due date)') : null,
      rangeEl),
    grid));

  function range() {
    if (mode === 'week') { const s = startOfWeek(cursor); return [s, addDays(s, 6)]; }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const s = startOfWeek(first);
    return [s, addDays(s, 41)];
  }

  function step(n) {
    cursor = mode === 'week' ? addDays(cursor, 7 * n) : new Date(cursor.getFullYear(), cursor.getMonth() + n, 1);
    draw(); load();
  }

  function drawViewGroup() {
    clear(viewGroup);
    for (const [k, l] of [['month', 'Month'], ['week', 'Week']]) {
      viewGroup.appendChild(h('button', { class: ['btn', mode === k && 'active'], 'aria-pressed': String(mode === k), onClick: () => { mode = k; store.set('calendar:view', k); draw(); load(); } }, l));
    }
  }

  async function load() {
    const seq = ++loadSeq;
    const [s, e] = range();
    const view = mine ? 'mine' : 'all';
    try {
      const evFilters = [
        { field: 'StartDateTime', op: 'greaterOrEqual', value: ymd(addDays(s, -1)) },
        { field: 'StartDateTime', op: 'lessOrEqual', value: ymd(addDays(e, 1)) },
      ];
      const reqs = [GET(`/api/records/Event${qs({ view, limit: 500, sort: 'StartDateTime', dir: 'asc', filters: evFilters })}`)];
      if (showTasks && taskObj?.perms?.read) {
        const tFilters = [
          { field: 'ActivityDate', op: 'greaterOrEqual', value: ymd(s) },
          { field: 'ActivityDate', op: 'lessOrEqual', value: ymd(e) },
          { field: 'Status', op: 'notEqual', value: 'Completed' },
        ];
        reqs.push(GET(`/api/records/Task${qs({ view, limit: 500, filters: tFilters })}`));
      }
      const [ev, tk] = await Promise.all(reqs);
      if (seq !== loadSeq) return;
      items = [
        ...ev.records.filter((r) => r.StartDateTime).map((r) => {
          const start = new Date(r.StartDateTime);
          const end = r.EndDateTime ? new Date(r.EndDateTime) : new Date(start.getTime() + 3600000);
          return { kind: 'event', id: r.Id, name: r.Name || '(No subject)', start, end: end < start ? start : end, allDay: !!r.IsAllDayEvent, location: r.Location, owner: r._labels?.OwnerId };
        }),
        ...(tk?.records || []).filter((r) => r.ActivityDate).map((r) => ({ kind: 'task', id: r.Id, name: r.Name || '(No subject)', date: String(r.ActivityDate).slice(0, 10), priority: r.Priority, status: r.Status, owner: r._labels?.OwnerId })),
      ];
      draw();
    } catch (err) {
      if (seq !== loadSeq) return;
      toast(err.message, 'error');
      items = [];
      draw();
    }
  }

  async function newEvent(date, hour = 9) {
    if (!eventObj.perms.create) return;
    const d = date ? new Date(date) : dayStart(new Date());
    if (!date) { const now = new Date(); hour = Math.min(22, now.getHours() + 1); }
    d.setHours(hour, 0, 0, 0);
    const rec = await recordForm('Event', { mode: 'new', defaults: { StartDateTime: d.toISOString(), EndDateTime: new Date(d.getTime() + 3600000).toISOString() } });
    if (rec) load();
  }

  const go = (it) => app.navigate(`/r/${it.id}`);

  function itemsOn(day) {
    const key = ymd(day);
    const next = addDays(day, 1);
    const ev = items.filter((i) => i.kind === 'event' && i.start < next && (i.end > day || ymd(i.start) === key)).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
    const tk = items.filter((i) => i.kind === 'task' && i.date === key);
    return [...ev, ...tk];
  }

  function chip(it, day) {
    const continued = it.kind === 'event' && day && ymd(it.start) !== ymd(day);
    const title = it.kind === 'event'
      ? `${it.name}\n${it.allDay ? 'All day' : `${fmt.datetime(it.start)} – ${fmt.time(it.end)}`}${it.location ? `\n${it.location}` : ''}${it.owner ? `\nAssigned to ${it.owner}` : ''}`
      : `Task: ${it.name}\nDue ${fmt.date(it.date)} · ${it.priority || ''} · ${it.status || ''}${it.owner ? `\nAssigned to ${it.owner}` : ''}`;
    return h('a', {
      href: `#/r/${it.id}`, class: ['cal-item', it.kind, it.kind === 'task' && it.priority === 'High' && 'high'], title,
      onClick: (e) => e.stopPropagation(),
    },
    it.kind === 'task' ? icon('task', { size: 12 }) : h('span', { class: 'cal-dot' }),
    it.kind === 'event' && !it.allDay && !continued ? h('span', { class: 'cal-time' }, fmt.time(it.start)) : null,
    h('span', { class: 'truncate' }, it.name));
  }

  function drawMonth() {
    const [s] = range();
    const today = ymd(new Date());
    const month = cursor.getMonth();
    const head = h('div', { class: 'cal-month-head' }, WEEKDAYS.map((d) => h('div', d)));
    const cells = h('div', { class: 'cal-month' });
    for (let i = 0; i < 42; i++) {
      const day = addDays(s, i);
      const list = itemsOn(day);
      const max = 3;
      const cell = h('div', {
        class: ['cal-cell', day.getMonth() !== month && 'other', ymd(day) === today && 'today', [0, 6].includes(day.getDay()) && 'weekend'],
        onClick: () => newEvent(day), role: 'gridcell', 'aria-label': `${day.toDateString()}${list.length ? `, ${list.length} items` : ''}`,
      },
      h('div', { class: 'cal-cell-head' },
        h('button', { class: 'cal-daynum', title: 'Open in week view', onClick: (e) => { e.stopPropagation(); cursor = day; mode = 'week'; store.set('calendar:view', 'week'); draw(); load(); } }, String(day.getDate())),
        eventObj.perms.create ? h('button', { class: 'cal-add', 'aria-label': `New event on ${day.toDateString()}`, title: 'New event', onClick: (e) => { e.stopPropagation(); newEvent(day); } }, icon('plus', { size: 12 })) : null),
      h('div', { class: 'cal-items' }, list.slice(0, max).map((it) => chip(it, day)),
        list.length > max ? h('button', { class: 'cal-more', onClick: (e) => {
          e.stopPropagation();
          showMenu(e.currentTarget, [{ header: day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) },
            ...list.map((it) => ({ label: it.name, icon: it.kind === 'task' ? 'task' : 'calendar', meta: it.kind === 'event' ? (it.allDay ? 'All day' : fmt.time(it.start)) : 'Task', onClick: () => go(it) }))], { width: 300 });
        } }, `+${list.length - max} more`) : null));
      cells.appendChild(cell);
    }
    mount(grid, head, cells);
  }

  function drawWeek() {
    const [s] = range();
    const days = Array.from({ length: 7 }, (_, i) => addDays(s, i));
    const today = ymd(new Date());
    const head = h('div', { class: 'cal-week-head' }, h('div', { class: 'cal-gutter' }),
      days.map((d) => h('div', { class: ['cal-week-day', ymd(d) === today && 'today'] }, h('div', { class: 'tiny muted' }, WEEKDAYS[d.getDay()]), h('div', { class: 'cal-week-num' }, String(d.getDate())))));
    const allDay = h('div', { class: 'cal-allday' }, h('div', { class: 'cal-gutter tiny muted' }, 'All day'),
      days.map((d) => h('div', { class: 'cal-allday-cell', onClick: () => newEvent(d) }, itemsOn(d).filter((i) => i.kind === 'task' || i.allDay || (i.end - i.start) >= 86400000).map((it) => chip(it, d)))));
    const hours = h('div', { class: 'cal-hours' }, Array.from({ length: 24 }, (_, hr) => h('div', { class: 'cal-hour-label', style: { height: HOUR_PX + 'px' } }, hr ? new Date(2024, 0, 1, hr).toLocaleTimeString(undefined, { hour: 'numeric' }) : '')));
    const cols = days.map((d) => {
      const col = h('div', { class: ['cal-col', ymd(d) === today && 'today'] });
      for (let hr = 0; hr < 24; hr++) {
        col.appendChild(h('div', { class: 'cal-slot', style: { height: HOUR_PX + 'px' }, title: 'New event', onClick: () => newEvent(d, hr) }));
      }
      const next = addDays(d, 1);
      const evs = itemsOn(d).filter((i) => i.kind === 'event' && !i.allDay && (i.end - i.start) < 86400000).map((it) => {
        const st = it.start < d ? d : it.start;
        const en = it.end > next ? next : it.end;
        return { it, top: ((st - d) / 3600000) * HOUR_PX, height: Math.max(22, ((en - st) / 3600000) * HOUR_PX - 2), st, en };
      }).sort((a, b) => a.top - b.top);
      const lanes = [];
      for (const e of evs) {
        let lane = lanes.findIndex((end) => end <= e.top);
        if (lane < 0) { lane = lanes.length; lanes.push(0); }
        lanes[lane] = e.top + e.height;
        e.lane = lane;
      }
      const n = Math.max(1, lanes.length);
      for (const e of evs) {
        col.appendChild(h('a', {
          href: `#/r/${e.it.id}`, class: 'cal-block', title: `${e.it.name}\n${fmt.time(e.it.start)} – ${fmt.time(e.it.end)}${e.it.location ? `\n${e.it.location}` : ''}`,
          style: { top: e.top + 'px', height: e.height + 'px', left: `calc(${(100 / n) * e.lane}% + 2px)`, width: `calc(${100 / n}% - 4px)` },
          onClick: (ev) => ev.stopPropagation(),
        }, h('div', { class: 'strong truncate' }, e.it.name), e.height > 34 ? h('div', { class: 'tiny truncate' }, `${fmt.time(e.st)} – ${fmt.time(e.en)}${e.it.location ? ` · ${e.it.location}` : ''}`) : null));
      }
      if (ymd(d) === today) {
        const now = new Date();
        col.appendChild(h('div', { class: 'cal-now', style: { top: ((now - d) / 3600000) * HOUR_PX + 'px' } }));
      }
      return col;
    });
    const scroller = h('div', { class: 'cal-scroll' }, h('div', { class: 'cal-week-grid' }, hours, cols));
    mount(grid, h('div', { class: 'cal-week' }, head, allDay, scroller));
    const timed = items.filter((i) => i.kind === 'event' && !i.allDay && i.start >= s && i.start < addDays(s, 7)).map((i) => i.start.getHours() + i.start.getMinutes() / 60);
    scroller.scrollTop = Math.max(0, Math.min(7.5, timed.length ? Math.min(...timed) - 0.5 : 7.5)) * HOUR_PX;
    const gutter = scroller.offsetWidth - scroller.clientWidth;
    head.style.paddingRight = allDay.style.paddingRight = gutter + 'px';
  }

  function draw() {
    const [s, e] = range();
    drawViewGroup();
    if (mode === 'week') {
      titleEl.textContent = s.getMonth() === e.getMonth()
        ? `${s.toLocaleDateString(undefined, { month: 'long' })} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`
        : `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else titleEl.textContent = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const evN = items.filter((i) => i.kind === 'event').length;
    const tkN = items.filter((i) => i.kind === 'task').length;
    rangeEl.textContent = `${evN} event${evN === 1 ? '' : 's'}${showTasks ? ` · ${tkN} open task${tkN === 1 ? '' : 's'}` : ''}${mine ? ' · mine only' : ''}`;
    if (mode === 'week') drawWeek(); else drawMonth();
  }

  const onKey = (e) => {
    const k = e.detail;
    if (k === 't') { cursor = dayStart(new Date()); draw(); load(); }
    else if (k === 'ArrowLeft' || k === 'j') step(-1);
    else if (k === 'ArrowRight' || k === 'k') step(1);
    else if (k === 'n') newEvent(null);
  };
  document.addEventListener('slavy:key', onKey);

  mount(grid, spinner());
  draw();
  await load();
  return () => document.removeEventListener('slavy:key', onKey);
}
