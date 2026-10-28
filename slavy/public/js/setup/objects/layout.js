// Object Manager → Page Layout editor: sections (add/rename/columns/reorder/delete), fields (drag & drop or buttons),
// related lists (add/columns/label/reorder/remove), save via generic metadata endpoints.
import { h, icon, mount, clear, modal, toast, showMenu, confirmDialog, promptDialog, emptyState, objIcon } from '../../lib.js';
import { POST, PUT, getObj } from '../../api.js';
import { typeLabel, typeIcon, formRow, input, dualList, busy } from './common.js';

const SAMPLE = { Text: 'Sample text', Email: 'name@example.com', Phone: '(555) 010-0100', Url: 'www.example.com', Number: '1,234', Currency: '$1,234.00', Percent: '25%',
  Checkbox: '☐', Date: 'Jan 15, 2026', DateTime: 'Jan 15, 2026 9:30 AM', Picklist: 'Option', MultiPicklist: 'Option A; Option B', Lookup: 'Related record',
  MasterDetail: 'Parent record', TextArea: 'Multi-line text', LongTextArea: 'Long text…', AutoNumber: 'A-0001', Id: '' };

export default function layoutTab(panel, ctx) {
  const { data, editable } = ctx;
  const fieldsBy = new Map(data.fields.map((f) => [f.apiName, f]));
  const clone = (l) => JSON.parse(JSON.stringify({ sections: l.sections || [], relatedLists: l.relatedLists || [] }));
  let layout = clone(data.layout);
  // Drop references to fields that no longer exist.
  layout.sections.forEach((s) => { s.fields = (s.fields || []).filter((f) => fieldsBy.has(f)); s.columns = s.columns === 1 ? 1 : 2; });
  let dirty = false;
  let selSection = 0;
  let drag = null; // { kind: 'field', api, from } | { kind: 'section', index } | { kind: 'rl', index }

  const isRequired = (f) => !!f && (f.required || f.type === 'MasterDetail' || (f.isNameField && !f.readOnly));
  const onLayout = () => new Set(layout.sections.flatMap((s) => s.fields));
  const setDirty = () => { dirty = true; saveBtn.disabled = !editable; status.textContent = 'Unsaved changes'; status.classList.add('om-dirty'); };

  const saveBtn = h('button', { class: 'btn btn-brand', disabled: true, onClick: () => busy(saveBtn, save) }, icon('check'), 'Save');
  const cancelBtn = h('button', { class: 'btn', onClick: async () => {
    if (dirty && !(await confirmDialog('Discard your unsaved layout changes?', { title: 'Discard Changes', confirmLabel: 'Discard', danger: true }))) return;
    layout = clone(data.layout); dirty = false; saveBtn.disabled = true; status.textContent = ''; status.classList.remove('om-dirty'); draw();
  } }, 'Cancel');
  const resetBtn = h('button', { class: 'btn', onClick: async () => {
    if (!(await confirmDialog('Replace the current layout with the default layout (all fields in one section, all related lists)? You can still cancel before saving.', { title: 'Reset to Default', confirmLabel: 'Reset' }))) return;
    layout = clone(data.defaultLayout); setDirty(); draw();
  } }, icon('refresh'), 'Reset to Default');
  const status = h('span', { class: 'small muted' });

  const palette = h('div', { class: 'om-palette card' });
  const canvas = h('div', { class: 'om-canvas' });
  const q = h('input', { class: 'input input-sm', type: 'search', placeholder: 'Quick Find fields', 'aria-label': 'Search fields not on layout' });
  q.addEventListener('input', () => drawPalette());

  window.addEventListener('beforeunload', (e) => { if (dirty && document.body.contains(panel)) { e.preventDefault(); e.returnValue = ''; } });

  mount(panel,
    h('div', { class: 'card om-layout-head' },
      h('div', { class: 'card-header' }, h('h2', h('span', 'Page Layout'), h('span', { class: 'muted small om-layout-name' }, data.layout?.id ? `${data.label} Layout` : `${data.label} Layout (default — not yet saved)`)),
        status, editable ? [resetBtn, cancelBtn, saveBtn] : h('span', { class: 'badge' }, icon('lock'), 'Read only'))),
    h('div', { class: 'om-layout-editor' }, editable ? palette : null, canvas));

  // ---------- palette ----------
  function drawPalette() {
    if (!editable) return;
    clear(palette);
    const used = onLayout();
    const t = q.value.trim().toLowerCase();
    const avail = data.fields.filter((f) => f.type !== 'Id' && !used.has(f.apiName) && (!t || f.label.toLowerCase().includes(t) || f.apiName.toLowerCase().includes(t)));
    palette.append(h('div', { class: 'om-palette-head' }, h('strong', 'Fields'), h('span', { class: 'muted tiny' }, `${avail.length} not on layout`)), h('div', { class: 'mb-8' }, q),
      h('div', { class: 'om-palette-hint muted tiny' }, 'Drag a field onto a section, or click + to add it to the selected section.'));
    const list = h('div', { class: 'om-palette-list' });
    list.addEventListener('dragover', (e) => { if (drag?.kind === 'field' && drag.from != null) { e.preventDefault(); list.classList.add('drop'); } });
    list.addEventListener('dragleave', () => list.classList.remove('drop'));
    list.addEventListener('drop', async (e) => { e.preventDefault(); list.classList.remove('drop'); if (drag?.kind === 'field' && drag.from != null) await removeField(drag.from, drag.api); });
    if (!avail.length) list.appendChild(h('div', { class: 'muted small center p-16' }, t ? 'No matching fields.' : 'All fields are on the layout.'));
    for (const f of avail) {
      const chip = h('div', { class: ['om-pal-item', isRequired(f) && 'required'], draggable: 'true', title: `${f.label} (${f.apiName}) — ${typeLabel(f)}` },
        icon('grip', { cls: 'om-grip' }), h('span', { class: 'om-type-icon sm' }, icon(typeIcon(f.type))),
        h('span', { class: 'grow truncate' }, isRequired(f) ? h('span', { class: 'req' }, '*') : null, f.label),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': `Add ${f.label} to layout`, onClick: () => addField(f.apiName, selSection) }, icon('plus')));
      chip.addEventListener('dragstart', (e) => { drag = { kind: 'field', api: f.apiName, from: null }; e.dataTransfer.setData('text/plain', f.apiName); e.dataTransfer.effectAllowed = 'move'; chip.classList.add('dragging'); });
      chip.addEventListener('dragend', () => { drag = null; chip.classList.remove('dragging'); });
      list.appendChild(chip);
    }
    palette.appendChild(list);
  }

  // ---------- operations ----------
  function addField(api, sIdx, beforeIdx = null) {
    if (!layout.sections.length) layout.sections.push({ label: 'Information', columns: 2, fields: [] });
    const s = layout.sections[Math.min(sIdx, layout.sections.length - 1)];
    if (beforeIdx == null || beforeIdx > s.fields.length) s.fields.push(api); else s.fields.splice(beforeIdx, 0, api);
    setDirty(); draw();
  }
  function moveField(fromS, api, toS, beforeIdx = null) {
    const src = layout.sections[fromS];
    const oldIdx = src.fields.indexOf(api);
    if (oldIdx < 0) return;
    src.fields.splice(oldIdx, 1);
    const dst = layout.sections[toS];
    let idx = beforeIdx == null ? dst.fields.length : beforeIdx;
    if (fromS === toS && beforeIdx != null && oldIdx < beforeIdx) idx -= 1;
    dst.fields.splice(Math.max(0, Math.min(idx, dst.fields.length)), 0, api);
    setDirty(); draw();
  }
  async function removeField(sIdx, api) {
    const f = fieldsBy.get(api);
    if (isRequired(f) && !(await confirmDialog(`"${f.label}" is a required field. If it is not on the page layout, users cannot fill it in and records may fail to save. Remove it anyway?`,
      { title: 'Remove Required Field', confirmLabel: 'Remove', danger: true }))) return;
    const s = layout.sections[sIdx];
    s.fields = s.fields.filter((x) => x !== api);
    setDirty(); draw();
  }
  function moveSection(i, d) {
    const j = i + d;
    if (j < 0 || j >= layout.sections.length) return;
    [layout.sections[i], layout.sections[j]] = [layout.sections[j], layout.sections[i]];
    if (selSection === i) selSection = j;
    setDirty(); draw();
  }
  async function deleteSection(i) {
    const s = layout.sections[i];
    const req = s.fields.map((x) => fieldsBy.get(x)).filter(isRequired);
    const msg = s.fields.length
      ? `Delete section "${s.label}"? Its ${s.fields.length} field${s.fields.length === 1 ? '' : 's'} will move back to the palette.${req.length ? ` This includes required field${req.length === 1 ? '' : 's'}: ${req.map((f) => f.label).join(', ')}.` : ''}`
      : `Delete section "${s.label}"?`;
    if (!(await confirmDialog(msg, { title: 'Delete Section', confirmLabel: 'Delete', danger: true }))) return;
    layout.sections.splice(i, 1);
    selSection = Math.max(0, Math.min(selSection, layout.sections.length - 1));
    setDirty(); draw();
  }
  async function renameSection(i) {
    const s = layout.sections[i];
    const v = await promptDialog('Section Name', { title: 'Edit Section', value: s.label });
    if (v == null || !v.trim()) return;
    s.label = v.trim(); setDirty(); draw();
  }
  async function addSection() {
    const v = await promptDialog('Section Name', { title: 'New Section', value: 'New Section', confirmLabel: 'Add' });
    if (v == null || !v.trim()) return;
    layout.sections.push({ label: v.trim(), columns: 2, fields: [] });
    selSection = layout.sections.length - 1;
    setDirty(); draw();
    canvas.querySelectorAll('.om-section')[selSection]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- canvas ----------
  function draw() {
    drawPalette();
    clear(canvas);
    canvas.appendChild(h('div', { class: 'om-canvas-title' }, objIcon(data, 'sm'), h('strong', `${data.label} Detail`), h('span', { class: 'muted tiny' }, 'Preview of the record Details tab')));
    if (!layout.sections.length) canvas.appendChild(h('div', { class: 'card' }, emptyState('No sections', 'Add a section to start placing fields.', { iconName: 'dashboard' })));
    layout.sections.forEach((s, si) => canvas.appendChild(sectionEl(s, si)));
    if (editable) canvas.appendChild(h('button', { class: 'btn om-add-section', onClick: addSection }, icon('plus'), 'Add Section'));
    canvas.appendChild(relatedListsEl());
  }

  function sectionEl(s, si) {
    const grid = h('div', { class: ['om-section-grid', s.columns === 1 && 'cols-1'] });
    const sec = h('div', { class: ['om-section card', editable && si === selSection && 'selected'], onClick: () => { if (editable && selSection !== si) { selSection = si; canvas.querySelectorAll('.om-section').forEach((x, i) => x.classList.toggle('selected', i === si)); } } });
    const colGroup = h('div', { class: 'btn-group', role: 'group', 'aria-label': 'Columns' }, [1, 2].map((n) => h('button', { type: 'button', class: ['btn btn-sm', s.columns === n && 'active'], 'aria-pressed': String(s.columns === n),
      title: `${n} column${n > 1 ? 's' : ''}`, onClick: (e) => { e.stopPropagation(); if (s.columns !== n) { s.columns = n; setDirty(); draw(); } } }, `${n} col`)));
    const head = h('div', { class: 'om-section-head' },
      editable ? h('span', { class: 'om-sec-grip', draggable: 'true', title: 'Drag to reorder section' }, icon('grip')) : null,
      h('span', { class: 'strong grow truncate' }, s.label, h('span', { class: 'muted tiny om-sec-count' }, ` · ${s.fields.length} field${s.fields.length === 1 ? '' : 's'}`)),
      editable ? [
        colGroup,
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Rename', 'aria-label': `Rename section ${s.label}`, onClick: (e) => { e.stopPropagation(); renameSection(si); } }, icon('edit')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Move up', 'aria-label': 'Move section up', disabled: si === 0, onClick: (e) => { e.stopPropagation(); moveSection(si, -1); } }, icon('arrowUp')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Move down', 'aria-label': 'Move section down', disabled: si === layout.sections.length - 1, onClick: (e) => { e.stopPropagation(); moveSection(si, 1); } }, icon('arrowDown')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Delete section', 'aria-label': `Delete section ${s.label}`, onClick: (e) => { e.stopPropagation(); deleteSection(si); } }, icon('trash')),
      ] : null);
    const grip = head.querySelector('.om-sec-grip');
    if (grip) {
      grip.addEventListener('dragstart', (e) => { drag = { kind: 'section', index: si }; e.dataTransfer.setData('text/plain', 'section'); sec.classList.add('dragging'); });
      grip.addEventListener('dragend', () => { drag = null; sec.classList.remove('dragging'); });
    }
    sec.addEventListener('dragover', (e) => {
      if (drag?.kind === 'section' && drag.index !== si) { e.preventDefault(); sec.classList.add('drop-section'); }
    });
    sec.addEventListener('dragleave', (e) => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('drop-section'); });
    sec.addEventListener('drop', (e) => {
      if (drag?.kind !== 'section') return;
      e.preventDefault(); sec.classList.remove('drop-section');
      const [moved] = layout.sections.splice(drag.index, 1);
      layout.sections.splice(si, 0, moved);
      selSection = si; setDirty(); draw();
    });

    if (!s.fields.length) grid.appendChild(h('div', { class: 'om-empty-drop' }, editable ? 'Drag fields here' : 'No fields'));
    s.fields.forEach((api, fi) => grid.appendChild(fieldChip(api, si, fi)));
    if (editable) {
      grid.addEventListener('dragover', (e) => { if (drag?.kind === 'field') { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; grid.classList.add('drop'); } });
      grid.addEventListener('dragleave', (e) => { if (!grid.contains(e.relatedTarget)) grid.classList.remove('drop'); });
      grid.addEventListener('drop', (e) => {
        if (drag?.kind !== 'field') return;
        e.preventDefault(); grid.classList.remove('drop');
        const chip = e.target.closest?.('.om-field');
        let before = null;
        if (chip) {
          const idx = Number(chip.dataset.index);
          const r = chip.getBoundingClientRect();
          before = e.clientX > r.left + r.width / 2 && s.columns === 2 ? idx + 1 : (e.clientY > r.top + r.height / 2 && s.columns === 1 ? idx + 1 : idx);
        }
        if (drag.from == null) addField(drag.api, si, before);
        else moveField(drag.from, drag.api, si, before);
      });
    }
    sec.append(head, grid);
    return sec;
  }

  function fieldChip(api, si, fi) {
    const f = fieldsBy.get(api);
    const s = layout.sections[si];
    const req = isRequired(f);
    const ro = f.readOnly || ['Formula', 'Rollup', 'AutoNumber'].includes(f.type) || (f.system && !['Name', 'OwnerId'].includes(f.apiName));
    const chip = h('div', { class: ['om-field', req && 'required', !editable && 'static'], draggable: editable ? 'true' : null, dataset: { index: fi }, title: `${f.label} (${f.apiName}) — ${typeLabel(f)}` },
      h('div', { class: 'om-field-label' }, editable ? icon('grip', { cls: 'om-grip' }) : null, req ? h('span', { class: 'req', title: 'Required' }, '*') : null,
        h('span', { class: 'truncate grow' }, f.label), ro ? icon('lock', { cls: 'om-ro', size: 12 }) : null),
      h('div', { class: 'om-field-sample' }, f.type === 'Checkbox' ? '☐' : SAMPLE[f.type === 'Formula' || f.type === 'Rollup' ? f.returnType || 'Number' : f.type] || ''),
      editable ? h('div', { class: 'om-field-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Move earlier', 'aria-label': `Move ${f.label} earlier`, disabled: fi === 0, onClick: () => moveField(si, api, si, fi - 1) }, icon('chevronLeft')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Move later', 'aria-label': `Move ${f.label} later`, disabled: fi === s.fields.length - 1, onClick: () => moveField(si, api, si, fi + 2) }, icon('chevronRight')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Move to section', 'aria-label': `Move ${f.label} to another section`, disabled: layout.sections.length < 2,
          onClick: (e) => showMenu(e.currentTarget, [{ header: 'Move to section' }, ...layout.sections.map((x, i) => ({ label: x.label, disabled: i === si, onClick: () => moveField(si, api, i) }))]) }, icon('layers')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Remove from layout', 'aria-label': `Remove ${f.label} from layout`, onClick: () => removeField(si, api) }, icon('x'))) : null);
    if (editable) {
      chip.addEventListener('dragstart', (e) => { e.stopPropagation(); drag = { kind: 'field', api, from: si }; e.dataTransfer.setData('text/plain', api); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => chip.classList.add('dragging')); });
      chip.addEventListener('dragend', () => { drag = null; chip.classList.remove('dragging'); });
      chip.addEventListener('dragover', (e) => { if (drag?.kind === 'field' && drag.api !== api) chip.classList.add('drop-before'); });
      chip.addEventListener('dragleave', () => chip.classList.remove('drop-before'));
      chip.addEventListener('drop', () => chip.classList.remove('drop-before'));
    }
    return chip;
  }

  // ---------- related lists ----------
  function relatedListsEl() {
    const rls = layout.relatedLists;
    const key = (r) => `${r.object}.${r.field}`;
    const have = new Set(rls.map(key));
    const avail = data.children.filter((c) => !have.has(key(c)));
    const addBtn = editable ? h('button', { class: 'btn btn-sm', disabled: !avail.length, title: avail.length ? '' : 'All related lists are on the layout', onClick: (e) => showMenu(e.currentTarget,
      [{ header: 'Add related list' }, ...avail.map((c) => ({ label: `${c.label || getObj(c.object)?.pluralLabel || c.object}`, meta: `${c.object}.${c.field}`, onClick: () => {
        const child = getObj(c.object);
        const cols = ['Name', ...(child?.listColumns || []).filter((x) => x !== 'Name' && x !== 'OwnerId' && x !== c.field)].slice(0, 4);
        rls.push({ object: c.object, field: c.field, label: c.label || child?.pluralLabel || c.object, columns: cols });
        setDirty(); draw();
      } }))], { align: 'right', width: 300 }) }, icon('plus'), 'Add Related List') : null;
    const wrap = h('div', { class: 'card om-rl-card' },
      h('div', { class: 'card-header' }, h('h3', 'Related Lists'), h('span', { class: 'muted small' }, `${rls.length}`), addBtn));
    const list = h('div', { class: 'om-rl-list' });
    if (!rls.length) list.appendChild(h('div', { class: 'muted small p-16 center' }, data.children.length ? 'No related lists on this layout.' : `No other objects are related to ${data.label}.`));
    rls.forEach((r, i) => {
      const child = getObj(r.object);
      const colLabel = (c) => child?.fields.find((x) => x.apiName === c)?.label || c;
      const row = h('div', { class: 'om-rl', draggable: editable ? 'true' : null },
        editable ? icon('grip', { cls: 'om-grip' }) : null,
        child ? objIcon(child, 'sm') : null,
        h('div', { class: 'grow' },
          h('div', { class: 'strong' }, r.label || child?.pluralLabel || r.object, h('span', { class: 'muted tiny' }, `  ${r.object}.${r.field}`)),
          h('div', { class: 'om-rl-cols' }, (r.columns || []).map((c) => h('span', { class: 'chip' }, colLabel(c))))),
        editable ? [
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Edit columns & label', 'aria-label': `Edit related list ${r.label}`, onClick: () => editRelatedList(r) }, icon('edit')),
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Move up', 'aria-label': 'Move related list up', disabled: i === 0, onClick: () => { [rls[i - 1], rls[i]] = [rls[i], rls[i - 1]]; setDirty(); draw(); } }, icon('arrowUp')),
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Move down', 'aria-label': 'Move related list down', disabled: i === rls.length - 1, onClick: () => { [rls[i + 1], rls[i]] = [rls[i], rls[i + 1]]; setDirty(); draw(); } }, icon('arrowDown')),
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Remove', 'aria-label': `Remove related list ${r.label}`, onClick: () => { rls.splice(i, 1); setDirty(); draw(); } }, icon('x')),
        ] : null);
      if (editable) {
        row.addEventListener('dragstart', (e) => { drag = { kind: 'rl', index: i }; e.dataTransfer.setData('text/plain', 'rl'); row.classList.add('dragging'); });
        row.addEventListener('dragend', () => { drag = null; row.classList.remove('dragging'); });
        row.addEventListener('dragover', (e) => { if (drag?.kind === 'rl' && drag.index !== i) { e.preventDefault(); row.classList.add('drop-before'); } });
        row.addEventListener('dragleave', () => row.classList.remove('drop-before'));
        row.addEventListener('drop', (e) => {
          if (drag?.kind !== 'rl') return;
          e.preventDefault();
          const [m] = rls.splice(drag.index, 1);
          rls.splice(i, 0, m);
          setDirty(); draw();
        });
      }
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function editRelatedList(r) {
    const child = getObj(r.object);
    const st = { label: r.label || '', columns: [...(r.columns || [])] };
    const opts = (child?.fields || []).filter((f) => f.type !== 'Id' && f.type !== 'LongTextArea' && f.apiName !== r.field).map((f) => ({ value: f.apiName, label: f.label, meta: typeLabel(f) }));
    const saveBtn2 = h('button', { class: 'btn btn-brand', onClick: () => {
      if (!st.label.trim()) return m.setError('Label is required.');
      if (!st.columns.length) return m.setError('Choose at least one column.');
      r.label = st.label.trim(); r.columns = st.columns; m.close(); setDirty(); draw();
    } }, 'OK');
    const m = modal({
      title: `Related List Properties — ${child?.pluralLabel || r.object}`, size: 'lg',
      body: h('div', formRow('Related List Label', input(st.label, { onInput: (v) => { st.label = v; } }), { required: true }),
        h('div', { class: 'form-label' }, 'Columns (up to 10)'),
        dualList({ options: opts, selected: st.columns, max: 10, availableLabel: 'Available Fields', selectedLabel: 'Selected Columns', onChange: (v) => { st.columns = v; } }).el),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), saveBtn2],
    });
  }

  async function save() {
    const used = onLayout();
    const missing = data.fields.filter((f) => isRequired(f) && !used.has(f.apiName));
    if (missing.length && !(await confirmDialog(h('div', h('p', 'These required fields are not on the layout:'), h('ul', missing.map((f) => h('li', f.label))), h('p', { class: 'muted small' }, 'Users will not be able to enter values for them. Save anyway?')),
      { title: 'Required Fields Missing', confirmLabel: 'Save Anyway' }))) return;
    const body = { object: data.apiName, name: `${data.label} Layout`, sections: layout.sections.map((s) => ({ label: s.label, columns: s.columns, fields: s.fields })), relatedLists: layout.relatedLists };
    try {
      const saved = data.layout?.id ? await PUT(`/api/setup/meta/layout/${data.layout.id}`, body) : await POST('/api/setup/meta/layout', body);
      data.layout = { id: saved.id, sections: saved.sections, relatedLists: saved.relatedLists };
      dirty = false; saveBtn.disabled = true; status.textContent = 'Saved'; status.classList.remove('om-dirty');
      await ctx.app.refreshMeta();
      toast('Page layout saved.', 'success');
      await ctx.reload();
    } catch (e) { toast(e.message, 'error'); }
  }

  draw();
}
