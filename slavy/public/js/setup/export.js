// Data Export: choose objects and download one CSV per object.
import { h, icon, fmt, mount, spinner, toast, badge, emptyState, objIcon, downloadText } from '../lib.js';
import { GET, can, state } from '../api.js';
import { setupHeader } from './index.js';

export default async function render(container, { app }) {
  app.setTitle('Data Export');
  const header = setupHeader('Data Export', { crumb: 'Setup › Data', iconName: 'download', description: 'Download your data as CSV files, one per object. Only records and fields you can see are included.' });
  if (!(can('ExportReports') || can('ModifyAllData'))) {
    mount(container, header, h('div', { class: 'card p-24' }, emptyState('Insufficient privileges', 'You need the "Export Reports" permission to export data.', { iconName: 'lock' })));
    return;
  }
  mount(container, header, spinner());
  const counts = new Map((await GET('/api/setup/objects').catch(() => [])).map((o) => [o.apiName, o.recordCount]));
  const objects = [...state.objects.values()].sort((a, b) => a.label.localeCompare(b.label));
  const selected = new Set(objects.filter((o) => (counts.get(o.apiName) || 0) > 0 && !o.isCustom && ['Account', 'Contact', 'Lead', 'Opportunity', 'Case'].includes(o.apiName)).map((o) => o.apiName));
  const status = new Map();
  let running = false;

  const list = h('div', { class: 'sa-export-grid' });
  const summary = h('span', { class: 'muted small' });
  const exportBtn = h('button', { class: 'btn btn-brand', onClick: run }, icon('download'), 'Export Now');
  const draw = () => {
    mount(list, objects.map((o) => {
      const s = status.get(o.apiName);
      const cb = h('input', { type: 'checkbox', checked: selected.has(o.apiName), disabled: running, onChange: () => { if (cb.checked) selected.add(o.apiName); else selected.delete(o.apiName); draw(); } });
      return h('label', { class: ['sa-perm-item', selected.has(o.apiName) && 'on'] }, cb, objIcon(o, 'sm'),
        h('span', { class: 'grow' }, h('div', o.pluralLabel || o.label), h('div', { class: 'tiny muted' }, `${fmt.number(counts.get(o.apiName) ?? 0)} records`)),
        s === 'done' ? badge('Exported', 'success') : s === 'error' ? badge('Failed', 'danger') : s === 'running' ? h('span', { class: 'spinner sa-mini-spinner', 'aria-label': 'Exporting' }) : null);
    }));
    const n = selected.size;
    const recs = [...selected].reduce((a, k) => a + (counts.get(k) || 0), 0);
    summary.textContent = `${n} object${n === 1 ? '' : 's'} selected · about ${fmt.number(recs)} records`;
    exportBtn.disabled = running || !n;
  };

  async function run() {
    running = true;
    status.clear();
    draw();
    let ok = 0;
    for (const api of [...selected]) {
      status.set(api, 'running'); draw();
      try {
        const res = await fetch(`/api/records/${encodeURIComponent(api)}/export`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'slavy' } });
        const text = await res.text();
        if (!res.ok) { let msg = res.statusText; try { msg = JSON.parse(text).error || msg; } catch { /* not json */ } throw new Error(msg); }
        downloadText(`${api}-${new Date().toISOString().slice(0, 10)}.csv`, text);
        status.set(api, 'done'); ok++;
        await new Promise((r) => setTimeout(r, 350)); // browsers throttle rapid multiple downloads
      } catch (e) {
        status.set(api, 'error');
        toast(`${api}: ${e.message}`, 'error');
      }
      draw();
    }
    running = false;
    draw();
    if (ok) toast(`Exported ${ok} file${ok === 1 ? '' : 's'}`, 'success');
  }

  draw();
  mount(container, header,
    h('div', { class: 'card' },
      h('div', { class: 'sa-toolbar' },
        h('button', { class: 'btn btn-sm', onClick: () => { objects.forEach((o) => selected.add(o.apiName)); draw(); } }, 'Select All'),
        h('button', { class: 'btn btn-sm', onClick: () => { selected.clear(); draw(); } }, 'Clear'),
        summary, h('div', { class: 'spacer' }), exportBtn),
      h('div', { class: 'card-body' }, list),
      h('div', { class: 'card-footer sa-footer-left' }, icon('info'), h('span', { class: 'small muted' }, 'Each export is recorded in the Setup Audit Trail. Your browser may ask permission to download multiple files.'))));
}
