// Object Manager → Validation Rules: list with active toggle, New/Edit modal (formula editor), delete.
import { h, icon, mount, clear, emptyState, modal, toast, confirmDialog, fmt } from '../../lib.js';
import { POST, PUT, DEL } from '../../api.js';
import { formulaEditor } from '../../components/formula.js';
import { formRow, input, textarea, select, checkbox, toggleSwitch, busy } from './common.js';

export default function rulesTab(panel, ctx) {
  const { data, editable } = ctx;
  const rules = [...data.validationRules].sort((a, b) => a.name.localeCompare(b.name));
  const fieldLabel = (api) => data.fields.find((f) => f.apiName === api)?.label || api;
  const tbody = h('tbody');
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Quick Find', 'aria-label': 'Search validation rules' });

  const draw = () => {
    clear(tbody);
    const t = q.value.trim().toLowerCase();
    const rows = rules.filter((r) => !t || r.name.toLowerCase().includes(t) || (r.errorMessage || '').toLowerCase().includes(t) || (r.description || '').toLowerCase().includes(t));
    if (!rows.length) {
      tbody.appendChild(h('tr', h('td', { colspan: 6 }, emptyState(rules.length ? 'No matching rules' : 'No validation rules',
        rules.length ? 'Try a different search.' : 'Validation rules verify that data meets your standards before a record is saved.', { iconName: 'shield',
          action: editable && !rules.length ? h('button', { class: 'btn btn-brand', onClick: () => ruleModal(ctx) }, icon('plus'), 'New Rule') : null }))));
      return;
    }
    for (const r of rows) {
      const sw = toggleSwitch(r.active !== false, async (v) => {
        try {
          const saved = await PUT(`/api/setup/meta/validationRule/${r.id}`, { ...r, active: v });
          Object.assign(r, saved);
          toast(`Rule "${r.name}" ${v ? 'activated' : 'deactivated'}.`, 'success');
        } catch (e) { toast(e.message, 'error'); sw.querySelector('input').checked = !v; }
      }, { label: `Active: ${r.name}`, disabled: !editable });
      tbody.appendChild(h('tr',
        h('td', editable ? h('button', { class: 'link-btn strong', onClick: () => ruleModal(ctx, r) }, r.name) : h('span', { class: 'strong' }, r.name),
          r.description ? h('div', { class: 'muted tiny truncate', style: { maxWidth: '260px' } }, r.description) : null),
        h('td', { class: 'om-wrap', title: r.errorMessage }, r.errorMessage),
        h('td', r.errorField ? fieldLabel(r.errorField) : h('span', { class: 'muted' }, 'Top of Page')),
        h('td', { class: 'mono small', title: r.formula }, r.formula),
        h('td', sw),
        h('td', { class: 'right nowrap' }, editable ? [
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Edit', 'aria-label': `Edit ${r.name}`, onClick: () => ruleModal(ctx, r) }, icon('edit')),
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Delete', 'aria-label': `Delete ${r.name}`, onClick: async () => {
            if (!(await confirmDialog(`Delete the validation rule "${r.name}"?`, { title: 'Delete Validation Rule', confirmLabel: 'Delete', danger: true }))) return;
            try { await DEL(`/api/setup/meta/validationRule/${r.id}`); toast('Validation rule deleted.', 'success'); await ctx.reload(); } catch (e) { toast(e.message, 'error'); }
          } }, icon('trash')),
        ] : h('span', { class: 'muted tiny' }, r.updatedAt ? fmt.relative(r.updatedAt) : ''))));
    }
  };
  q.addEventListener('input', draw);
  draw();
  mount(panel, h('div', { class: 'card' },
    h('div', { class: 'card-header' }, h('h2', 'Validation Rules'), h('span', { class: 'muted small' }, `${rules.length} rule${rules.length === 1 ? '' : 's'}`),
      editable ? h('button', { class: 'btn btn-brand', onClick: () => ruleModal(ctx) }, icon('plus'), 'New') : null),
    rules.length > 5 ? h('div', { class: 'om-toolbar' }, h('div', { class: 'input-group om-search' }, icon('search'), q)) : null,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', h('tr', h('th', 'Rule Name'), h('th', 'Error Message'), h('th', 'Error Location'), h('th', 'Error Condition Formula'), h('th', 'Active'), h('th', ''))), tbody))));
}

function ruleModal(ctx, rule) {
  const { data } = ctx;
  const st = { name: rule?.name || '', description: rule?.description || '', active: rule ? rule.active !== false : true, formula: rule?.formula || '', errorMessage: rule?.errorMessage || '', errorField: rule?.errorField || '' };
  const fe = formulaEditor({ objApi: data.apiName, value: st.formula, rows: 6, aiPurpose: 'validation', placeholder: "e.g. AND(ISPICKVAL(StageName, 'Closed Won'), ISBLANK(Amount))", onChange: (v) => { st.formula = v; } });
  const fieldOpts = data.fields.filter((f) => !f.system || ['Name', 'OwnerId'].includes(f.apiName)).filter((f) => !['Formula', 'Rollup', 'AutoNumber'].includes(f.type))
    .map((f) => ({ value: f.apiName, label: f.label }));
  const locField = select(fieldOpts, st.errorField, (v) => { st.errorField = v; }, { placeholder: '-- Select field --', ariaLabel: 'Error field' });
  const locWrap = h('div', { class: st.errorField ? 'mt-8' : 'mt-8 hidden' }, locField);
  const radio = (val, label) => {
    const rb = h('input', { type: 'radio', name: 'om-errloc', checked: val === 'top' ? !st.errorField : !!st.errorField });
    rb.addEventListener('change', () => { if (!rb.checked) return; locWrap.classList.toggle('hidden', val === 'top'); if (val === 'top') st.errorField = ''; else st.errorField = locField.value; });
    return h('label', { class: 'checkbox' }, rb, label);
  };
  const body = h('div',
    h('div', { class: 'section-title' }, 'Rule Information'),
    h('div', { class: 'form-grid' },
      formRow('Rule Name', input(st.name, { maxlength: 40, placeholder: 'e.g. Amount_Required_When_Won', onInput: (v) => { st.name = v; } }), { required: true }),
      h('div', { class: 'form-row' }, h('div', { class: 'form-label' }, 'Status'), checkbox('Active', st.active, (v) => { st.active = v; })),
      formRow('Description', textarea(st.description, { rows: 2, onInput: (v) => { st.description = v; } }), { span: true })),
    h('div', { class: 'section-title' }, 'Error Condition Formula'),
    h('div', { class: 'alert mb-8' }, icon('info'), h('div', 'If this formula evaluates to ', h('strong', 'TRUE'), ', the record is not saved and the error message below is displayed.')),
    fe.el,
    h('div', { class: 'section-title' }, 'Error Message'),
    formRow('Error Message', textarea(st.errorMessage, { rows: 2, placeholder: 'e.g. Amount is required when the opportunity is Closed Won.', onInput: (v) => { st.errorMessage = v; } }), { required: true }),
    h('div', { class: 'form-row' }, h('div', { class: 'form-label' }, 'Error Location'),
      h('div', { class: 'row gap-16', role: 'radiogroup', 'aria-label': 'Error location' }, radio('top', 'Top of Page'), radio('field', 'Field')), locWrap));

  const saveBtn = h('button', { class: 'btn btn-brand', onClick: () => busy(saveBtn, save) }, 'Save');
  const m = modal({ title: rule ? `Edit Validation Rule: ${rule.name}` : 'New Validation Rule', size: 'lg', body,
    footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), saveBtn] });

  async function save() {
    m.setError('');
    if (!st.name.trim()) return m.setError('Rule Name is required.');
    if (!st.formula.trim()) return m.setError('Enter an error condition formula.');
    if (!st.errorMessage.trim()) return m.setError('Error Message is required.');
    const payload = { object: data.apiName, name: st.name.trim().replace(/\s+/g, '_'), description: st.description, active: st.active, formula: st.formula, errorMessage: st.errorMessage.trim(), errorField: st.errorField };
    try {
      if (rule) await PUT(`/api/setup/meta/validationRule/${rule.id}`, payload);
      else await POST('/api/setup/meta/validationRule', payload);
      m.close();
      toast(`Validation rule "${payload.name}" saved.`, 'success');
      await ctx.reload();
    } catch (e) { m.setError(e.message); }
  }
}

