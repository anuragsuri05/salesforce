// Recycle Bin: restore or permanently delete records (mine or, for admins, the whole org).
import { h, icon, mount, fmt, toast, confirmDialog, spinner, emptyState, objIcon, store } from '../lib.js';
import { GET, POST, DEL, getObj, can } from '../api.js';

export default async function recycleBinView(root, { query, app }) {
  app.setTitle('Recycle Bin');
  const isAdmin = can('ModifyAllData');
  let scope = isAdmin && (query.scope || store.get('recyclebin:scope')) === 'all' ? 'all' : 'mine';
  let rows = [];
  let term = '';
  const selected = new Set();

  const scopeGroup = h('div', { class: 'btn-group', role: 'group', 'aria-label': 'Recycle bin scope' });
  const search = h('input', { class: 'input input-sm', placeholder: 'Search the Recycle Bin...', 'aria-label': 'Search the Recycle Bin', onInput: () => { term = search.value.trim().toLowerCase(); draw(); } });
  const restoreBtn = h('button', { class: 'btn', onClick: () => restore() }, icon('refresh'), 'Restore');
  const purgeBtn = h('button', { class: 'btn', onClick: () => purge() }, icon('trash'), 'Delete');
  const emptyBtn = h('button', { class: 'btn btn-danger', onClick: () => emptyBin() }, 'Empty Recycle Bin');
  const countEl = h('div', { class: 'small muted' });
  const body = h('div', { class: 'card-body flush' }, spinner());

  mount(root,
    h('div', { class: 'page-header' }, h('div', { class: 'title-row' },
      h('span', { class: 'obj-icon lg', style: { background: '#64748b' } }, icon('recycle', { size: 22 })),
      h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, 'Recycle Bin'), h('h1', scope === 'all' ? 'Org Recycle Bin' : 'My Recycle Bin'), countEl),
      h('div', { class: 'actions' }, restoreBtn, purgeBtn, emptyBtn))),
    h('div', { class: 'alert mb-16' }, icon('info'), h('div', 'Deleted records stay in the Recycle Bin until they are permanently deleted. Restoring a record also restores the child records that were deleted with it.')),
    h('div', { class: 'card' },
      h('div', { class: 'card-header' }, isAdmin ? scopeGroup : h('h3', 'My Recycle Bin'), h('span', { class: 'spacer' }), h('div', { class: 'input-group', style: { width: '260px' } }, icon('search'), search)),
      body));

  function drawScope() {
    if (!isAdmin) return;
    mount(scopeGroup, ...[['mine', 'My Recycle Bin'], ['all', 'Org Recycle Bin']].map(([k, l]) => h('button', {
      class: ['btn btn-sm', scope === k && 'active'], 'aria-pressed': String(scope === k),
      onClick: () => { if (scope === k) return; scope = k; store.set('recyclebin:scope', k); root.querySelector('.page-header h1').textContent = l; drawScope(); load(); },
    }, l)));
  }

  const visible = () => rows.filter((r) => !term || [r.Name, r.objectLabel, r.deletedBy].some((x) => String(x || '').toLowerCase().includes(term)));

  function syncButtons() {
    restoreBtn.disabled = !selected.size;
    purgeBtn.disabled = !selected.size;
    emptyBtn.disabled = !rows.length;
    restoreBtn.lastChild.textContent = selected.size ? `Restore (${selected.size})` : 'Restore';
    purgeBtn.lastChild.textContent = selected.size ? `Delete (${selected.size})` : 'Delete';
  }

  function draw() {
    for (const id of [...selected]) if (!rows.some((r) => r.Id === id)) selected.delete(id);
    countEl.textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}`;
    syncButtons();
    if (!rows.length) { mount(body, emptyState('The Recycle Bin is empty', scope === 'all' ? 'No deleted records in the org.' : 'Records you delete appear here.', { iconName: 'recycle' })); return; }
    const shown = visible();
    if (!shown.length) { mount(body, emptyState('No matching items', 'Try a different search.')); return; }
    const all = h('input', { type: 'checkbox', 'aria-label': 'Select all', checked: shown.every((r) => selected.has(r.Id)), onChange: () => { shown.forEach((r) => (all.checked ? selected.add(r.Id) : selected.delete(r.Id))); draw(); } });
    all.indeterminate = !all.checked && shown.some((r) => selected.has(r.Id));
    mount(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', h('tr', h('th', { class: 'check-col' }, all), h('th', 'Name'), h('th', 'Type'), h('th', 'Deleted Date'), h('th', 'Deleted By'))),
      h('tbody', shown.map((r) => {
        const cb = h('input', { type: 'checkbox', checked: selected.has(r.Id), 'aria-label': `Select ${r.Name}`, onChange: () => { if (cb.checked) selected.add(r.Id); else selected.delete(r.Id); draw(); } });
        return h('tr', { class: selected.has(r.Id) ? 'selected' : '', onClick: (e) => { if (e.target !== cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); } } },
          h('td', { class: 'check-col' }, cb),
          h('td', h('span', { class: 'row gap-4' }, objIcon(getObj(r.object), 'sm'), h('span', { class: 'strong' }, r.Name || r.Id))),
          h('td', r.objectLabel || r.object),
          h('td', { title: fmt.datetime(r.deletedAt) }, fmt.datetime(r.deletedAt)),
          h('td', r.deletedBy || '—'));
      })))));
  }

  async function runAll(ids, fn) {
    const ok = [], failed = [];
    for (const id of ids) {
      try { await fn(id); ok.push(id); } catch (e) { failed.push({ id, message: e.message }); }
    }
    return { ok, failed };
  }

  async function restore() {
    const ids = [...selected];
    if (!ids.length) return;
    restoreBtn.disabled = true;
    const { ok, failed } = await runAll(ids, (id) => POST(`/api/recyclebin/${id}/restore`, {}));
    if (ok.length === 1) { const r = rows.find((x) => x.Id === ok[0]); toast(`“${r?.Name}” was restored.`, 'success', { link: { href: `#/r/${ok[0]}`, label: 'View' } }); }
    else if (ok.length) toast(`${ok.length} records were restored.`, 'success');
    if (failed.length) toast(`${failed.length} couldn’t be restored: ${failed[0].message}`, 'error');
    ok.forEach((id) => selected.delete(id));
    await load();
  }

  async function purge(ids = [...selected], { skipConfirm = false } = {}) {
    if (!ids.length) return;
    if (!skipConfirm && !(await confirmDialog(`Permanently delete ${ids.length} record${ids.length === 1 ? '' : 's'}? You can’t undo this.`, { title: 'Delete Permanently', confirmLabel: 'Delete', danger: true }))) return;
    purgeBtn.disabled = true;
    const { ok, failed } = await runAll(ids, (id) => DEL(`/api/recyclebin/${id}`));
    if (ok.length) toast(`${ok.length} record${ok.length === 1 ? ' was' : 's were'} permanently deleted.`, 'success');
    if (failed.length) toast(`${failed.length} couldn’t be deleted: ${failed[0].message}`, 'error');
    ok.forEach((id) => selected.delete(id));
    await load();
  }

  async function emptyBin() {
    if (!rows.length) return;
    if (!(await confirmDialog(h('div', `Permanently delete all ${rows.length} item${rows.length === 1 ? '' : 's'} in ${scope === 'all' ? 'the Org' : 'your'} Recycle Bin? You can’t undo this.`), { title: 'Empty Recycle Bin', confirmLabel: 'Empty Recycle Bin', danger: true }))) return;
    emptyBtn.disabled = true;
    await purge(rows.map((r) => r.Id), { skipConfirm: true });
  }

  async function load() {
    mount(body, spinner());
    try { rows = await GET(`/api/recyclebin${scope === 'all' ? '?scope=all' : ''}`); draw(); } catch (e) { mount(body, emptyState('Couldn’t load the Recycle Bin', e.message, { iconName: 'alert' })); }
  }

  drawScope();
  syncButtons();
  await load();
}
