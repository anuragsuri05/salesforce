// Merge-field helper for flow text templates: an "Insert Field" button that inserts {!Path} tokens at the cursor.
import { h, icon, showMenu, clear, closeMenu } from '../../lib.js';
import { pathOptions } from '../../api.js';

const GLOBALS = [
  { path: '$User.Name', label: 'Running User: Full Name', group: 'Global' },
  { path: '$User.FirstName', label: 'Running User: First Name', group: 'Global' },
  { path: '$User.Email', label: 'Running User: Email', group: 'Global' },
  { path: '$User.Title', label: 'Running User: Title', group: 'Global' },
  { path: 'TODAY()', label: 'Today’s date', group: 'Global' },
];

export function insertAtCursor(input, text) {
  const s = input.selectionStart ?? input.value.length;
  const e = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, s) + text + input.value.slice(e);
  input.focus();
  input.selectionStart = input.selectionEnd = s + text.length;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function mergeFieldButton(objApi, input, { label = 'Insert Field' } = {}) {
  return h('button', {
    type: 'button', class: 'btn btn-ghost btn-sm merge-btn', title: 'Insert a merge field such as {!Name}',
    onClick: (e) => {
      const opts = [...pathOptions(objApi), ...GLOBALS];
      const filter = h('input', { class: 'input input-sm', placeholder: 'Search fields...', 'aria-label': 'Search fields' });
      const listEl = h('div', { class: 'merge-list' });
      const draw = () => {
        clear(listEl);
        const t = filter.value.trim().toLowerCase();
        const shown = opts.filter((o) => !t || o.label.toLowerCase().includes(t) || o.path.toLowerCase().includes(t)).slice(0, 120);
        if (!shown.length) listEl.appendChild(h('div', { class: 'muted small p-16 center' }, 'No matching fields'));
        let group = null;
        for (const o of shown) {
          if (o.group !== group) { group = o.group; listEl.appendChild(h('div', { class: 'menu-header' }, group)); }
          listEl.appendChild(h('button', { type: 'button', class: 'menu-item', onClick: () => { closeMenu(); insertAtCursor(input, `{!${o.path}}`); } },
            h('span', { class: 'grow truncate' }, o.label), h('span', { class: 'muted tiny mono' }, `{!${o.path}}`)));
        }
      };
      filter.addEventListener('input', draw);
      draw();
      showMenu(e.currentTarget, [{ node: h('div', { style: { padding: '4px' } }, filter) }, { node: listEl }], { width: 360, align: 'right' });
      setTimeout(() => filter.focus(), 0);
    },
  }, icon('plus', { size: 14 }), label);
}

// Labelled text input / textarea with an Insert Field button in its label row.
export function templateField({ label, value = '', objApi, multiline = false, rows = 3, placeholder = '', onChange, help, required }) {
  const input = multiline
    ? h('textarea', { class: 'input', rows, placeholder })
    : h('input', { class: 'input', placeholder });
  input.value = value || '';
  input.addEventListener('input', () => onChange?.(input.value));
  return h('div', { class: 'form-row' },
    h('div', { class: 'row field-label-row' }, h('label', { class: 'form-label grow' }, required ? h('span', { class: 'req' }, '*') : null, label), mergeFieldButton(objApi, input)),
    input,
    help ? h('div', { class: 'form-help' }, help) : null);
}
