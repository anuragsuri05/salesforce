// Object home / list views: table & kanban, sorting, search, inline edit, mass actions,
// list view controls (new/clone/rename/sharing/filters/fields/delete), import/export.
import {
  h, icon, mount, clear, fmt, modal, confirmDialog, promptDialog, toast, showMenu, objIcon, spinner, emptyState, debounce, store, downloadText,
} from '../lib.js';
import { GET, POST, PUT, PATCH, DEL, getObj, can, me, qs, pathOptions, fieldAtPath, ApiError } from '../api.js';
import { displayValue, fieldInput, canEditField, recordForm, lookupInput, effectiveType, isNumeric } from '../fields.js';
import { filterEditor } from '../components/filters.js';

const PAGE = 50;

export default async function render(root, { params, query, app }) {
  const obj = getObj(params.object);
  if (!obj) throw Object.assign(new Error(`Object "${params.object}" not found or you don't have access.`), { status: 404 });
  app.setTitle(obj.pluralLabel);

  let views = await GET(`/api/listviews/${obj.apiName}`);
  const remembered = store.get(`view:${obj.apiName}`);
  let viewId = query.view || (views.some((v) => v.id === remembered) ? remembered : 'recent');
  if (!views.some((v) => v.id === viewId)) viewId = 'all';
  let display = store.get(`display:${obj.apiName}`, 'table');
  let sort = null, dir = 'asc', search = '';
  let data = null, limit = PAGE;
  const selected = new Set();
  let filterPanelOpen = false;
  let draftFilters = null; // unsaved filter edits { filters, filterLogic }
  let lastLoaded = null;

  const view = () => views.find((v) => v.id === viewId) || views[0];
  const canEditView = (v) => !v.builtin && (v.ownerId === me().Id || (v.visibility === 'public' && can('ManagePublicListViews')));

  const headerEl = h('div');
  const toolbarEl = h('div');
  const bodyEl = h('div', { class: 'list-main' });
  const card = h('div', { class: 'card list-card' }, headerEl, toolbarEl, h('div', { class: 'row top gap-0', style: { alignItems: 'stretch' } }, bodyEl, h('div', { id: 'filter-slot' })));
  mount(root, card);

  async function load({ keepSelection = false } = {}) {
    if (!keepSelection) selected.clear();
    const v = view();
    const extra = draftFilters ? null : undefined;
    const q = { view: v.id, q: search, sort, dir, limit: display === 'kanban' ? 2000 : limit };
    let res;
    if (draftFilters) {
      // Preview unsaved filters: run against "all" with the draft filters.
      res = await GET(`/api/records/${obj.apiName}${qs({ ...q, view: 'all', filters: JSON.stringify(draftFilters.filters) })}`);
    } else res = await GET(`/api/records/${obj.apiName}${qs(q)}`);
    void extra;
    data = res;
    lastLoaded = new Date();
    drawHeader();
    drawToolbar();
    drawBody();
  }

  // ---------- header ----------
  function drawHeader() {
    const v = view();
    const picker = h('button', { class: 'view-picker', 'aria-label': 'Select list view', onClick: (e) => viewMenu(e.currentTarget) }, v.name, icon('chevronDown', { size: 18 }));
    const sortLabel = sort ? fieldAtPath(obj.apiName, sort)?.fullLabel : v.sort?.field ? fieldAtPath(obj.apiName, v.sort.field)?.fullLabel : 'Name';
    const meta = h('div', { class: 'list-meta' },
      `${data.total} item${data.total === 1 ? '' : 's'}${data.total > data.records.length && display === 'table' ? ` (showing ${data.records.length})` : ''} • Sorted by ${sortLabel || 'Name'}`,
      (draftFilters?.filters || v.filters)?.length ? ` • Filtered by ${(draftFilters?.filters || v.filters).length} filter${(draftFilters?.filters || v.filters).length > 1 ? 's' : ''}` : '',
      ` • Updated ${fmt.relative(lastLoaded)}`);
    const actions = h('div', { class: 'row wrap' },
      obj.perms.create ? h('button', { class: 'btn', onClick: () => newRec() }, 'New') : null,
      obj.perms.create && (can('ImportData') || can('ModifyAllData')) ? h('a', { class: 'btn', href: `#/setup/import?object=${obj.apiName}` }, 'Import') : null,
      selected.size && obj.perms.edit ? h('button', { class: 'btn', onClick: changeOwnerSelected }, `Change Owner (${selected.size})`) : null,
      selected.size && obj.perms.delete ? h('button', { class: 'btn', onClick: deleteSelected }, `Delete (${selected.size})`) : null);
    mount(headerEl, h('div', { class: 'list-header' },
      objIcon(obj, 'lg'),
      h('div', { class: 'grow' }, h('div', { class: 'eyebrow small muted' }, obj.pluralLabel), picker, meta),
      actions));
  }

  function viewMenu(anchor) {
    const filter = h('input', { class: 'input input-sm', placeholder: 'Search lists...' });
    const listEl = h('div');
    const draw = () => {
      clear(listEl);
      const t = filter.value.toLowerCase();
      const groups = [
        ['Recent & standard', views.filter((v) => v.builtin)],
        ['My list views', views.filter((v) => !v.builtin && v.visibility === 'private')],
        ['Shared list views', views.filter((v) => !v.builtin && v.visibility === 'public')],
      ];
      for (const [label, list] of groups) {
        const items = list.filter((v) => !t || v.name.toLowerCase().includes(t));
        if (!items.length) continue;
        listEl.appendChild(h('div', { class: 'menu-header' }, label));
        for (const v of items) {
          listEl.appendChild(h('button', { class: ['menu-item', v.id === viewId && 'active'], onClick: () => { document.querySelector('.menu')?.remove(); switchView(v.id); } },
            h('span', { class: 'check' }, v.id === viewId ? icon('check') : null), h('span', { class: 'grow' }, v.name)));
        }
      }
    };
    filter.addEventListener('input', draw);
    draw();
    showMenu(anchor, [{ node: h('div', { style: { padding: '4px' } }, filter) }, { node: listEl }], { width: 300 });
    setTimeout(() => filter.focus(), 0);
  }

  function switchView(id) {
    viewId = id;
    store.set(`view:${obj.apiName}`, id);
    sort = null; draftFilters = null; limit = PAGE;
    const v = view();
    if (v.kanbanField === undefined && display === 'kanban' && !kanbanField()) display = 'table';
    history.replaceState(null, '', `#/o/${obj.apiName}?view=${id}`);
    load();
  }

  // ---------- toolbar ----------
  function drawToolbar() {
    const searchInput = h('input', { class: 'input input-sm', placeholder: 'Search this list...', value: search, style: { width: '220px' }, 'aria-label': 'Search this list' });
    searchInput.addEventListener('input', debounce(() => { search = searchInput.value; limit = PAGE; load(); }, 300));
    mount(toolbarEl, h('div', { class: 'list-toolbar' },
      h('div', { class: 'input-group' }, icon('search'), searchInput),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-icon', title: 'List View Controls', 'aria-label': 'List View Controls', onClick: (e) => controlsMenu(e.currentTarget) }, icon('gear')),
      h('div', { class: 'btn-group' },
        h('button', { class: ['btn btn-icon', display === 'table' && 'active'], title: 'Display as Table', 'aria-label': 'Display as Table', onClick: () => setDisplay('table') }, icon('table')),
        h('button', { class: ['btn btn-icon', display === 'kanban' && 'active'], title: 'Display as Kanban', 'aria-label': 'Display as Kanban', onClick: () => setDisplay('kanban'), disabled: !kanbanField() && !picklists().length }, icon('kanban'))),
      h('button', { class: 'btn btn-icon', title: 'Refresh', 'aria-label': 'Refresh', onClick: () => load({ keepSelection: true }) }, icon('refresh')),
      h('button', { class: ['btn btn-icon', filterPanelOpen && 'active'], title: 'Filters', 'aria-label': 'Show filters', onClick: toggleFilters, style: filterPanelOpen ? { background: 'var(--brand-50)', color: 'var(--brand)' } : null }, icon('filter'))));
  }

  function setDisplay(d) {
    display = d;
    store.set(`display:${obj.apiName}`, d);
    if (d === 'kanban' && !kanbanField()) { kanbanSettings(); return; }
    load();
  }

  function controlsMenu(anchor) {
    const v = view();
    showMenu(anchor, [
      { header: 'List View Controls' },
      { label: 'New', icon: 'plus', onClick: () => newView() },
      { label: 'Clone', icon: 'copy', onClick: cloneView },
      { label: 'Rename', icon: 'edit', disabled: !canEditView(v), onClick: renameView },
      { label: 'Sharing Settings', icon: 'share', disabled: !canEditView(v), onClick: sharingView },
      { label: 'Edit List Filters', icon: 'filter', onClick: () => { if (!filterPanelOpen) toggleFilters(); } },
      { label: 'Select Fields to Display', icon: 'list', onClick: selectFields },
      { label: 'Delete', icon: 'trash', danger: true, disabled: !canEditView(v), onClick: deleteView },
      'sep',
      display === 'kanban' ? { label: 'Kanban Settings', icon: 'kanban', onClick: kanbanSettings } : null,
      { label: 'Export List (CSV)', icon: 'download', onClick: exportList },
      can('CustomizeApplication') ? { label: 'Edit Object in Setup', icon: 'database', href: `#/setup/objects/${obj.apiName}` } : null,
    ], { align: 'right', width: 240 });
  }

  async function saveViewPatch(patch) {
    const v = view();
    const saved = await PUT(`/api/listview/${v.id}`, { ...v, ...patch });
    views = views.map((x) => (x.id === saved.id ? saved : x));
    return saved;
  }

  async function newView(base = null) {
    const name = h('input', { class: 'input', value: base ? `${base.name} (Copy)` : '' });
    const vis = h('select', { class: 'input' }, h('option', { value: 'private' }, 'Only I can see this list view'),
      can('ManagePublicListViews') ? h('option', { value: 'public' }, 'All users can see this list view') : null);
    const m = modal({
      title: base ? 'Clone List View' : 'New List View', size: 'sm',
      body: h('div', { class: 'col gap-12' }, h('div', h('label', { class: 'form-label' }, h('span', { class: 'req' }, '*'), 'List Name'), name), h('div', h('label', { class: 'form-label' }, 'Who sees this list view?'), vis)),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: async () => {
        if (!name.value.trim()) { m.setError('List Name is required'); return; }
        try {
          const src = base || { filters: [], columns: [], scope: 'everything' };
          const saved = await POST(`/api/listviews/${obj.apiName}`, { ...src, name: name.value.trim(), visibility: vis.value, filters: src.filters || [], columns: src.columns || data.columns });
          views = await GET(`/api/listviews/${obj.apiName}`);
          m.close();
          switchView(saved.id);
          if (!base) { filterPanelOpen = false; toggleFilters(); }
          toast(`List view "${saved.name}" created`, 'success');
        } catch (e) { m.setError(e.message); }
      } }, 'Save')],
    });
  }

  function cloneView() { const v = view(); newView({ ...v, columns: v.columns?.length ? v.columns : data.columns }); }

  async function renameView() {
    const name = await promptDialog('List Name', { title: 'Rename List View', value: view().name });
    if (!name) return;
    try { await saveViewPatch({ name }); drawHeader(); toast('List view renamed', 'success'); } catch (e) { toast(e.message, 'error'); }
  }

  async function sharingView() {
    const v = view();
    const vis = h('select', { class: 'input' }, h('option', { value: 'private', selected: v.visibility === 'private' }, 'Only I can see this list view'),
      h('option', { value: 'public', selected: v.visibility === 'public', disabled: !can('ManagePublicListViews') }, 'All users can see this list view'));
    const m = modal({ title: 'Sharing Settings', size: 'sm', body: h('div', h('label', { class: 'form-label' }, 'Who sees this list view?'), vis),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: async () => {
        try { await saveViewPatch({ visibility: vis.value }); m.close(); toast('Sharing updated', 'success'); } catch (e) { m.setError(e.message); }
      } }, 'Save')] });
  }

  async function deleteView() {
    const v = view();
    if (!(await confirmDialog(`Delete the list view "${v.name}"?`, { title: 'Delete List View', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await DEL(`/api/listview/${v.id}`);
      views = views.filter((x) => x.id !== v.id);
      toast('List view deleted', 'success');
      switchView('all');
    } catch (e) { toast(e.message, 'error'); }
  }

  function selectFields() {
    const v = view();
    let cols = [...(data.columns || [])];
    const opts = pathOptions(obj.apiName);
    const avail = h('select', { class: 'input', multiple: true, size: 14, style: { height: 'auto' } });
    const chosen = h('select', { class: 'input', multiple: true, size: 14, style: { height: 'auto' } });
    const filter = h('input', { class: 'input input-sm mb-8', placeholder: 'Search fields...' });
    const draw = () => {
      clear(avail); clear(chosen);
      const t = filter.value.toLowerCase();
      opts.filter((o) => !cols.includes(o.path) && (!t || o.label.toLowerCase().includes(t))).forEach((o) => avail.appendChild(h('option', { value: o.path }, o.label)));
      cols.forEach((c) => chosen.appendChild(h('option', { value: c }, fieldAtPath(obj.apiName, c)?.fullLabel || c)));
    };
    filter.addEventListener('input', draw);
    const move = (fn) => { fn(); draw(); };
    const sel = (s) => [...s.selectedOptions].map((o) => o.value);
    draw();
    const m = modal({
      title: 'Select Fields to Display', size: 'lg',
      body: h('div', { class: 'dual-list' },
        h('div', { class: 'grow' }, h('div', { class: 'form-label' }, 'Available Fields'), filter, avail),
        h('div', { class: 'col', style: { justifyContent: 'center' } },
          h('button', { class: 'btn btn-icon', 'aria-label': 'Add', onClick: () => move(() => { cols.push(...sel(avail)); }) }, icon('chevronRight')),
          h('button', { class: 'btn btn-icon', 'aria-label': 'Remove', onClick: () => move(() => { const r = sel(chosen); cols = cols.filter((c) => !r.includes(c)); }) }, icon('chevronLeft'))),
        h('div', { class: 'grow' }, h('div', { class: 'form-label' }, 'Visible Fields'), h('div', { style: { height: '38px' } }), chosen),
        h('div', { class: 'col', style: { justifyContent: 'center' } },
          h('button', { class: 'btn btn-icon', 'aria-label': 'Move up', onClick: () => move(() => { for (const c of sel(chosen)) { const i = cols.indexOf(c); if (i > 0) [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; } }) }, icon('chevronUp')),
          h('button', { class: 'btn btn-icon', 'aria-label': 'Move down', onClick: () => move(() => { for (const c of sel(chosen).reverse()) { const i = cols.indexOf(c); if (i < cols.length - 1) [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; } }) }, icon('chevronDown')))),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: async () => {
        if (!cols.length) { m.setError('Select at least one field'); return; }
        try {
          if (canEditView(v)) await saveViewPatch({ columns: cols });
          else {
            const name = `${v.name} (Custom)`;
            const saved = await POST(`/api/listviews/${obj.apiName}`, { ...v, name, filters: v.filters || [], columns: cols, visibility: 'private' });
            views = await GET(`/api/listviews/${obj.apiName}`);
            viewId = saved.id;
            toast(`Saved as new list view "${name}"`, 'success');
          }
          m.close();
          load();
        } catch (e) { m.setError(e.message); }
      } }, 'Save')],
    });
  }

  function exportList() {
    if (!(can('ExportReports') || can('ModifyAllData'))) {
      // Export what is visible on screen.
      const cols = data.columns;
      const lines = [cols.map((c) => fieldAtPath(obj.apiName, c)?.fullLabel || c).join(',')];
      for (const r of data.records) lines.push(cols.map((c) => JSON.stringify(String(r._labels?.[c] ?? r[c] ?? ''))).join(','));
      downloadText(`${obj.apiName}.csv`, lines.join('\n'));
      return;
    }
    window.location.href = `/api/records/${obj.apiName}/export`;
  }

  // ---------- filters panel ----------
  function toggleFilters() {
    filterPanelOpen = !filterPanelOpen;
    const slot = card.querySelector('#filter-slot');
    clear(slot);
    if (filterPanelOpen) {
      const v = view();
      let current = { filters: [...(draftFilters?.filters || v.filters || [])], filterLogic: draftFilters?.filterLogic ?? v.filterLogic ?? '' };
      const ed = filterEditor({ objApi: obj.apiName, filters: current.filters, logic: current.filterLogic, onChange: (val) => { current = val; draftFilters = val; load({ keepSelection: true }); } });
      slot.appendChild(h('div', { class: 'filter-panel' },
        h('div', { class: 'row mb-16' }, h('h3', { class: 'grow' }, 'Filters'), h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Close filters', onClick: toggleFilters }, icon('x'))),
        h('div', { class: 'filter-card', style: { cursor: 'default' } }, h('div', { class: 'small muted' }, 'Filter by Owner'), h('strong', v.scope === 'mine' ? `My ${obj.pluralLabel}` : `All ${obj.pluralLabel}`)),
        ed.el,
        h('div', { class: 'row mt-16' },
          h('button', { class: 'btn', onClick: () => { draftFilters = null; toggleFilters(); toggleFilters(); load(); } }, 'Cancel'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn btn-brand', disabled: false, onClick: async () => {
            const val = ed.get();
            try {
              if (canEditView(v)) { await saveViewPatch({ filters: val.filters, filterLogic: val.filterLogic }); toast('List view saved', 'success'); }
              else {
                const name = await promptDialog('This is a standard list view. Save your filters as a new list view:', { title: 'Save As New List View', value: `${v.name} (Filtered)` });
                if (!name) return;
                const saved = await POST(`/api/listviews/${obj.apiName}`, { name, filters: val.filters, filterLogic: val.filterLogic, columns: data.columns, scope: v.scope, visibility: 'private' });
                views = await GET(`/api/listviews/${obj.apiName}`);
                viewId = saved.id;
                store.set(`view:${obj.apiName}`, saved.id);
                toast(`List view "${name}" created`, 'success');
              }
              draftFilters = null;
              filterPanelOpen = true; toggleFilters();
              load();
            } catch (e) { toast(e.message, 'error'); }
          } }, 'Save'))));
    }
    drawToolbar();
  }

  // ---------- body ----------
  function drawBody() {
    if (display === 'kanban' && kanbanField()) return drawKanban();
    drawTable();
  }

  function drawTable() {
    const cols = data.columns;
    if (!data.records.length) {
      mount(bodyEl, emptyState(search ? 'No matching records' : `No ${obj.pluralLabel.toLowerCase()} to display`,
        view().id === 'recent' ? 'Records you view will appear here. Try "All" to see everything.' : 'Try changing your filters or search.',
        { iconName: 'list', action: obj.perms.create ? h('button', { class: 'btn btn-brand', onClick: () => newRec() }, `New ${obj.label}`) : null }));
      return;
    }
    const allChecked = data.records.every((r) => selected.has(r.Id));
    const headCb = h('input', { type: 'checkbox', checked: allChecked && data.records.length > 0, 'aria-label': 'Select all', onChange: () => {
      if (headCb.checked) data.records.forEach((r) => selected.add(r.Id)); else selected.clear();
      drawHeader(); drawTable();
    } });
    const thead = h('thead', h('tr',
      h('th', { class: 'row-num' }), h('th', { class: 'check-col' }, headCb),
      cols.map((c) => {
        const f = fieldAtPath(obj.apiName, c);
        const active = sort === c;
        return h('th', { class: ['sortable', f && isNumeric(f) && 'num'], onClick: () => { if (sort === c) dir = dir === 'asc' ? 'desc' : 'asc'; else { sort = c; dir = 'asc'; } load({ keepSelection: true }); } },
          f?.fullLabel || c, active ? icon(dir === 'asc' ? 'arrowUp' : 'arrowDown', { size: 12 }) : null);
      }),
      h('th', { style: { width: '40px' } })));
    const tbody = h('tbody');
    data.records.forEach((r, i) => {
      const cb = h('input', { type: 'checkbox', checked: selected.has(r.Id), 'aria-label': `Select ${r.Name}`, onChange: () => { if (cb.checked) selected.add(r.Id); else selected.delete(r.Id); tr.classList.toggle('selected', cb.checked); drawHeader(); } });
      const tr = h('tr', { class: selected.has(r.Id) ? 'selected' : '' },
        h('td', { class: 'row-num' }, i + 1), h('td', { class: 'check-col' }, cb),
        cols.map((c) => {
          const f = fieldAtPath(obj.apiName, c);
          const isOwn = !c.includes('.');
          const td = h('td', { class: [f && isNumeric(f) && 'num'] }, f ? displayValue(f, r[c], r, { path: isOwn ? undefined : c }) : String(r[c] ?? ''));
          if (isOwn && f && r._access && r._access !== 'read' && canEditField(f, 'edit') && f.apiName !== 'Name' && !f.isNameField) {
            td.classList.add('editable');
            td.title = 'Double-click to edit';
            td.addEventListener('dblclick', () => inlineEdit(td, r, f));
          }
          return td;
        }),
        h('td', h('button', { class: 'btn btn-sm btn-icon row-action', 'aria-label': 'Row actions', onClick: (e) => rowMenu(e.currentTarget, r) }, icon('chevronDown'))));
      tbody.appendChild(tr);
    });
    const more = data.total > data.records.length
      ? h('div', { class: 'center p-16' }, h('button', { class: 'btn', onClick: () => { limit += PAGE; load({ keepSelection: true }); } }, `Load more (${data.total - data.records.length} remaining)`))
      : null;
    mount(bodyEl, h('div', { class: 'list-body table-wrap' }, h('table', { class: 'table' }, thead, tbody), more));
  }

  function inlineEdit(td, r, f) {
    if (td.classList.contains('editing')) return;
    td.classList.add('editing');
    const ctl = fieldInput(f, r[f.apiName], { record: r, compact: true });
    const save = async () => {
      const v = ctl.get();
      if ((v ?? null) === (r[f.apiName] ?? null)) { cancel(); return; }
      try {
        const updated = await PATCH(`/api/record/${r.Id}`, { [f.apiName]: v });
        Object.assign(r, updated);
        toast(`${obj.label} "${updated.Name}" was saved.`, 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
      cancel();
    };
    const cancel = () => { td.classList.remove('editing'); mount(td, displayValue(f, r[f.apiName], r)); };
    const wrap = h('div', { class: 'row gap-4', onKeydown: (e) => { if (e.key === 'Enter' && f.type !== 'LongTextArea' && f.type !== 'TextArea') { e.preventDefault(); save(); } if (e.key === 'Escape') cancel(); } },
      h('div', { class: 'grow' }, ctl.el),
      h('button', { class: 'btn btn-sm btn-icon btn-brand', 'aria-label': 'Save', onClick: save }, icon('check')),
      h('button', { class: 'btn btn-sm btn-icon', 'aria-label': 'Cancel', onClick: cancel }, icon('x')));
    mount(td, wrap);
    ctl.focus();
  }

  function rowMenu(anchor, r) {
    showMenu(anchor, [
      { label: 'View', icon: 'eye', href: `#/r/${r.Id}` },
      r._access !== 'read' && obj.perms.edit ? { label: 'Edit', icon: 'edit', onClick: async () => { const full = await GET(`/api/record/${r.Id}`); if (await recordForm(obj.apiName, { record: full })) load({ keepSelection: true }); } } : null,
      r._access === 'all' && obj.perms.delete ? { label: 'Delete', icon: 'trash', danger: true, onClick: async () => {
        if (!(await confirmDialog(`Are you sure you want to delete "${r.Name}"?`, { title: `Delete ${obj.label}`, confirmLabel: 'Delete', danger: true }))) return;
        try { await DEL(`/api/record/${r.Id}`); toast(`${obj.label} "${r.Name}" was deleted.`, 'success', { link: { href: '#/recyclebin', label: 'Recycle Bin' } }); load(); } catch (e) { toast(e.message, 'error'); }
      } } : null,
      r._access === 'all' && obj.perms.edit ? { label: 'Change Owner', icon: 'user', onClick: () => changeOwner([r.Id]) } : null,
    ], { align: 'right' });
  }

  // ---------- kanban ----------
  function picklists() { return obj.fields.filter((f) => f.type === 'Picklist'); }
  function kanbanField() {
    const v = view();
    const key = store.get(`kanban:${obj.apiName}:${v.id}`)?.field || v.kanbanField || obj.pathField;
    return obj.fieldMap.get(key) ? key : null;
  }
  function kanbanSummary() {
    const v = view();
    const key = store.get(`kanban:${obj.apiName}:${v.id}`)?.summary ?? v.kanbanSummary ?? (obj.fieldMap.get('Amount') ? 'Amount' : null);
    return key && obj.fieldMap.get(key) ? key : null;
  }

  function kanbanSettings() {
    const v = view();
    const groupSel = h('select', { class: 'input' }, picklists().map((f) => h('option', { value: f.apiName, selected: f.apiName === kanbanField() }, f.label)));
    const sumSel = h('select', { class: 'input' }, h('option', { value: '' }, 'None'), obj.fields.filter((f) => isNumeric(f)).map((f) => h('option', { value: f.apiName, selected: f.apiName === kanbanSummary() }, f.label)));
    const m = modal({ title: 'Kanban Settings', size: 'sm', body: h('div', { class: 'col gap-12' },
      h('div', h('label', { class: 'form-label' }, 'Group by'), groupSel), h('div', h('label', { class: 'form-label' }, 'Summarize by'), sumSel)),
    footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: () => {
      store.set(`kanban:${obj.apiName}:${v.id}`, { field: groupSel.value, summary: sumSel.value });
      display = 'kanban'; store.set(`display:${obj.apiName}`, 'kanban');
      m.close(); load();
    } }, 'Save')] });
  }

  function drawKanban() {
    const fieldApi = kanbanField();
    const f = obj.fieldMap.get(fieldApi);
    const sumApi = kanbanSummary();
    const sumF = sumApi && obj.fieldMap.get(sumApi);
    const values = (f.values || []).filter((v) => v.isActive !== false);
    const cardFields = data.columns.filter((c) => c !== 'Name' && c !== fieldApi).slice(0, 3);
    const groups = new Map(values.map((v) => [v.value, []]));
    const none = [];
    for (const r of data.records) (groups.get(r[fieldApi]) || none).push(r);
    const board = h('div', { class: 'kanban' });
    let dragged = null;
    const colFor = (label, value, recs) => {
      const total = sumF ? recs.reduce((s, r) => s + Number(r[sumApi] || 0), 0) : null;
      const cards = h('div', { class: 'kanban-cards' }, recs.map((r) => {
        const c = h('div', { class: 'kanban-card', draggable: r._access !== 'read' ? 'true' : 'false',
          onDragstart: () => { dragged = r; c.classList.add('dragging'); }, onDragend: () => c.classList.remove('dragging') },
        h('div', { class: 'kc-title' }, h('a', { href: `#/r/${r.Id}` }, r.Name)),
        cardFields.map((cf) => { const fd = fieldAtPath(obj.apiName, cf); return h('div', { class: 'kc-row' }, h('span', { class: 'muted truncate' }, fd?.fullLabel || cf), h('span', { class: 'truncate' }, fd ? displayValue(fd, r[cf], r, { path: cf.includes('.') ? cf : undefined }) : r[cf])); }));
        return c;
      }));
      const col = h('div', { class: 'kanban-col',
        onDragover: (e) => { if (dragged && value !== undefined) { e.preventDefault(); col.classList.add('drop'); } },
        onDragleave: () => col.classList.remove('drop'),
        onDrop: async (e) => {
          e.preventDefault(); col.classList.remove('drop');
          if (!dragged || dragged[fieldApi] === value) return;
          const r = dragged; dragged = null;
          try {
            await PATCH(`/api/record/${r.Id}`, { [fieldApi]: value });
            toast(`${r.Name} moved to ${label}`, 'success');
          } catch (ex) { toast(ex.message, 'error'); }
          load({ keepSelection: true });
        } },
      h('div', { class: 'kanban-col-header' }, h('div', { class: 'title' }, label, h('span', { class: 'muted', style: { fontWeight: 400 } }, ` (${recs.length})`)),
        sumF ? h('div', { class: 'small muted' }, sumF.type === 'Currency' ? fmt.currency(total) : fmt.number(total)) : null),
      cards);
      return col;
    };
    for (const v of values) board.appendChild(colFor(v.label || v.value, v.value, groups.get(v.value)));
    if (none.length) board.appendChild(colFor('(None)', undefined, none));
    mount(bodyEl, h('div', { style: { width: '100%' } }, h('div', { class: 'small muted', style: { padding: '8px 16px 0' } }, `Grouped by ${f.label}${sumF ? ` · Summarized by ${sumF.label}` : ''} · Drag cards to update`), board));
  }

  // ---------- actions ----------
  async function newRec() {
    const rec = await recordForm(obj.apiName, { mode: 'new' });
    if (rec) app.navigate(`/r/${rec.Id}`);
  }

  function changeOwner(ids) {
    const lk = lookupInput({ objects: ['User'], includeQueues: true });
    const m = modal({ title: `Change Owner${ids.length > 1 ? ` (${ids.length} records)` : ''}`, size: 'sm',
      body: h('div', h('label', { class: 'form-label' }, 'Select new owner'), lk.el),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: async () => {
        const ownerId = lk.get();
        if (!ownerId) { m.setError('Choose a user or queue'); return; }
        try {
          const res = await POST(`/api/records/${obj.apiName}/mass`, { ids, action: 'changeOwner', ownerId });
          m.close();
          toast(`${res.succeeded} record(s) updated${res.failed ? `, ${res.failed} failed: ${res.results.find((x) => !x.success)?.message}` : ''}`, res.failed ? 'warning' : 'success');
          load();
        } catch (e) { m.setError(e.message); }
      } }, 'Change Owner')] });
  }
  function changeOwnerSelected() { changeOwner([...selected]); }

  async function deleteSelected() {
    const ids = [...selected];
    if (!(await confirmDialog(`Delete ${ids.length} ${ids.length === 1 ? obj.label.toLowerCase() : obj.pluralLabel.toLowerCase()}? Deleted records go to the Recycle Bin.`, { title: 'Delete Records', confirmLabel: 'Delete', danger: true }))) return;
    try {
      const res = await POST(`/api/records/${obj.apiName}/mass`, { ids, action: 'delete' });
      toast(`${res.succeeded} deleted${res.failed ? `, ${res.failed} failed: ${res.results.find((x) => !x.success)?.message}` : ''}`, res.failed ? 'warning' : 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  const onKey = (e) => { if (e.detail === 'n' && obj.perms.create) newRec(); };
  document.addEventListener('slavy:key', onKey);

  mount(bodyEl, spinner());
  await load();
  if (query.new === '1' && obj.perms.create) newRec();
  return () => document.removeEventListener('slavy:key', onKey);
}

export { ApiError, effectiveType };
