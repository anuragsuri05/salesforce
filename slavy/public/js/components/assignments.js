// Field assignment editor ("Set Field Values"), used by flows, approval processes and quick actions.
// Each assignment: { field, value, isFormula }. Formulas are evaluated against the *source* record (sourceObj).
// assignmentsEditor({ targetObj, sourceObj, assignments, onChange }) -> { el, get() }
import { h, icon, clear } from '../lib.js';
import { getObj } from '../api.js';
import { fieldInput, canEditField } from '../fields.js';

export function assignmentsEditor({ targetObj, sourceObj, assignments = [], onChange, allowSystem = true, title = 'Set Field Values' }) {
  let list = assignments.map((a) => ({ ...a }));
  const el = h('div', { class: 'assignments-editor' });
  const emit = () => onChange?.(list);
  const fieldsFor = () => {
    const o = getObj(targetObj);
    if (!o) return [];
    return o.fields.filter((f) => (allowSystem && f.apiName === 'OwnerId') || (!f.system && !['Formula', 'Rollup', 'AutoNumber'].includes(f.type)) || (f.apiName === 'Name' && canEditField(f, 'new')) || f.readOnly && !f.system && !['Formula', 'Rollup', 'AutoNumber'].includes(f.type));
  };
  const draw = () => {
    clear(el);
    el.appendChild(h('div', { class: 'row mb-8' }, h('strong', { class: 'grow' }, title),
      h('button', { class: 'btn btn-sm', type: 'button', onClick: () => { list.push({ field: '', value: '', isFormula: false }); draw(); emit(); } }, icon('plus'), 'Add Field')));
    if (!list.length) el.appendChild(h('div', { class: 'muted small' }, 'No field values set.'));
    const fields = fieldsFor();
    list.forEach((a, i) => {
      const fd = fields.find((f) => f.apiName === a.field);
      const fieldSel = h('select', { class: 'input input-sm', onChange: () => { a.field = fieldSel.value; a.value = ''; draw(); emit(); } },
        h('option', { value: '' }, '-- Select field --'), fields.map((f) => h('option', { value: f.apiName, selected: f.apiName === a.field }, f.label)));
      const modeSel = h('select', { class: 'input input-sm', style: { width: '120px' }, onChange: () => { a.isFormula = modeSel.value === 'formula'; a.value = ''; draw(); emit(); } },
        h('option', { value: 'literal', selected: !a.isFormula }, 'Value'), h('option', { value: 'formula', selected: !!a.isFormula }, 'Formula'));
      let valueEl;
      if (a.isFormula) {
        const inp = h('input', { class: 'input input-sm mono', value: a.value ?? '', placeholder: `Formula on ${getObj(sourceObj)?.label || sourceObj}, e.g. TODAY() + 7`, onInput: () => { a.value = inp.value; emit(); } });
        valueEl = inp;
      } else if (fd) {
        const ctl = fieldInput(fd, a.value, { compact: true, onChange: (v) => { a.value = v; emit(); } });
        valueEl = ctl.el;
      } else valueEl = h('input', { class: 'input input-sm', disabled: true, placeholder: 'Choose a field first' });
      el.appendChild(h('div', { class: 'row mb-8 top' },
        h('div', { style: { width: '32%' } }, fieldSel), h('div', modeSel), h('div', { class: 'grow' }, valueEl),
        h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', 'aria-label': 'Remove', onClick: () => { list.splice(i, 1); draw(); emit(); } }, icon('trash'))));
    });
  };
  draw();
  return { el, get: () => list.filter((a) => a.field) };
}
