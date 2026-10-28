// Web-to-Lead & Web-to-Case: settings, generated HTML form, and a live test form.
import { h, icon, mount, clear, spinner, toast, badge, emptyState, escapeHtml } from '../lib.js';
import { GET, PATCH } from '../api.js';
import { lookupInput } from '../fields.js';
import { setupHeader } from './index.js';
import { canCustomize, formRow, copyText, readOnlyNote } from './admin-common.js';

const KINDS = {
  lead: { key: 'webToLead', object: 'Lead', label: 'Web-to-Lead', path: '/web-to-lead', blurb: 'Capture leads from your website. Each submission creates a lead with Lead Source = "Web".' },
  case: { key: 'webToCase', object: 'Case', label: 'Web-to-Case', path: '/web-to-case', blurb: 'Let customers submit support requests from your website. Each submission creates a case with Origin = "Web".' },
};
const SKIP_TYPES = new Set(['Formula', 'Rollup', 'AutoNumber', 'Id', 'Lookup', 'MasterDetail']);

export default async function render(container, { app, query }) {
  app.setTitle('Web-to-Lead & Web-to-Case');
  const canEdit = canCustomize();
  const header = setupHeader('Web-to-Lead & Web-to-Case', { crumb: 'Setup › Data', iconName: 'globe', description: 'Generate HTML forms for your website that create leads and cases directly in Slavy.' });
  mount(container, header, spinner());
  const [org, users, leadDef, caseDef] = await Promise.all([GET('/api/setup/org'), GET('/api/users').catch(() => []),
    GET('/api/setup/objects/Lead').catch(() => null), GET('/api/setup/objects/Case').catch(() => null)]);
  const defs = { lead: leadDef, case: caseDef };
  let kind = query?.tab === 'case' ? 'case' : 'lead';
  const panel = h('div');
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });

  const drawTabs = () => mount(tabsEl, Object.entries(KINDS).map(([k, K]) => h('button', { class: ['tab', k === kind && 'active'], role: 'tab', 'aria-selected': String(k === kind),
    onClick: () => { kind = k; history.replaceState(null, '', `#/setup/webto${k === 'case' ? '?tab=case' : ''}`); drawTabs(); drawPanel(); } },
  K.label, ' ', org[K.key]?.enabled ? badge('On', 'success') : badge('Off'))));

  function drawPanel() {
    const K = KINDS[kind];
    const def = defs[kind];
    if (!def) { mount(panel, h('div', { class: 'card-body' }, emptyState(`${K.object} object not available`, 'This org does not have the object.', { iconName: 'alert' }))); return; }
    const saved = org[K.key] || {};
    const v = { enabled: !!saved.enabled, defaultOwnerId: saved.defaultOwnerId || null, fields: [...(saved.fields || [])], retURL: saved.retURL || '' };
    const fields = def.fields.filter((f) => !SKIP_TYPES.has(f.type) && !f.readOnly && !f.system).sort((a, b) => (b.required - a.required) || a.label.localeCompare(b.label));
    const fieldMap = new Map(def.fields.map((f) => [f.apiName, f]));

    const enabled = h('input', { type: 'checkbox', id: 'wt-enabled', checked: v.enabled, disabled: !canEdit, onChange: () => { v.enabled = enabled.checked; } });
    const owner = lookupInput({ objects: ['User'], value: v.defaultOwnerId, label: users.find((u) => u.Id === v.defaultOwnerId)?.Name, onChange: (x) => { v.defaultOwnerId = x; } });
    const retURL = h('input', { class: 'input', id: 'wt-ret', type: 'url', value: v.retURL, placeholder: 'https://www.example.com/thank-you', disabled: !canEdit, onInput: () => { v.retURL = retURL.value; drawSnippet(); } });
    const fieldBox = h('div', { class: 'sa-obj-checks' });
    const drawFields = () => mount(fieldBox, fields.map((f) => h('label', { class: ['sa-perm-item', v.fields.includes(f.apiName) && 'on'] },
      h('input', { type: 'checkbox', disabled: !canEdit, checked: v.fields.includes(f.apiName), onChange: (e) => {
        v.fields = e.target.checked ? [...v.fields, f.apiName] : v.fields.filter((x) => x !== f.apiName);
        drawFields(); drawSnippet(); drawTest();
      } }), h('span', { class: 'grow' }, f.label, f.required ? h('span', { class: 'req', title: 'Required' }, ' *') : null), h('code', { class: 'tiny muted' }, f.apiName))));
    drawFields();
    const missingReq = () => fields.filter((f) => f.required && f.defaultValue == null && !(f.values || []).some((x) => x.isDefault) && !v.fields.includes(f.apiName));

    const saveBtn = h('button', { class: 'btn btn-brand', disabled: !canEdit, onClick: async () => {
      if (v.enabled && !v.defaultOwnerId) { toast('Choose a default owner before enabling', 'error'); return; }
      if (v.enabled && !v.fields.length) { toast('Select at least one field', 'error'); return; }
      saveBtn.disabled = true;
      try {
        const payload = { enabled: v.enabled, defaultOwnerId: v.defaultOwnerId, fields: v.fields, retURL: v.retURL };
        await PATCH('/api/setup/org', { [K.key]: payload });
        org[K.key] = { ...saved, ...payload };
        toast(`${K.label} settings saved`, 'success');
        drawTabs(); drawPanel();
      } catch (e) { toast(e.message, 'error'); saveBtn.disabled = false; }
    } }, 'Save');

    // ----- generated HTML -----
    const snippetEl = h('pre', { class: 'code-block sa-snippet' });
    const reqWarn = h('div');
    function snippet() {
      const lines = [
        `<!-- ${K.label} form generated by Slavy. Paste into any HTML page. -->`,
        `<form action="${location.origin}${K.path}" method="POST">`,
        `  <input type="hidden" name="retURL" value="${escapeHtml(v.retURL || 'https://www.example.com/thank-you')}">`,
        '',
      ];
      for (const api of v.fields) {
        const f = fieldMap.get(api);
        if (!f) continue;
        const id = api.toLowerCase();
        const req = f.required ? ' required' : '';
        lines.push(`  <label for="${id}">${escapeHtml(f.label)}</label>`);
        if (f.type === 'Picklist') {
          lines.push(`  <select id="${id}" name="${api}"${req}>`, '    <option value="">--None--</option>');
          for (const o of (f.values || []).filter((x) => x.isActive !== false)) lines.push(`    <option value="${escapeHtml(o.value)}">${escapeHtml(o.label || o.value)}</option>`);
          lines.push('  </select><br>');
        } else if (f.type === 'TextArea' || f.type === 'LongTextArea') lines.push(`  <textarea id="${id}" name="${api}" rows="4"${req}></textarea><br>`);
        else if (f.type === 'Checkbox') lines.push(`  <input id="${id}" name="${api}" type="checkbox" value="1"><br>`);
        else {
          const t = { Email: 'email', Phone: 'tel', Url: 'url', Number: 'number', Currency: 'number', Percent: 'number', Date: 'date' }[f.type] || 'text';
          lines.push(`  <input id="${id}" name="${api}" type="${t}"${f.length && t === 'text' ? ` maxlength="${f.length}"` : ''}${req}><br>`);
        }
        lines.push('');
      }
      lines.push('  <input type="submit" name="submit" value="Submit">', '</form>');
      return lines.join('\n');
    }
    function drawSnippet() {
      snippetEl.textContent = snippet();
      const miss = missingReq();
      mount(reqWarn, miss.length ? h('div', { class: 'alert warning mb-8' }, icon('alert'), h('div', `Required ${K.object} fields not on the form: `, h('strong', miss.map((f) => f.label).join(', ')), '. Submissions will fail unless automation fills them in.')) : null);
    }
    drawSnippet();

    // ----- test form -----
    const testWrap = h('div');
    const result = h('div');
    function drawTest() {
      clear(result);
      const inputs = new Map();
      const form = h('form', { class: 'form-grid', onSubmit: async (e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        for (const [api, el] of inputs) { const val = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value; if (val !== '') params.set(api, val); }
        mount(result, h('div', { class: 'row muted small' }, h('span', { class: 'spinner sa-mini-spinner' }), 'Submitting…'));
        try {
          const res = await fetch(K.path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || res.statusText);
          mount(result, h('div', { class: 'alert success' }, icon('check'), h('div', h('strong', 'Success. '), data.message || 'Submission received.', ' ', h('a', { href: `#/o/${K.object}` }, `View ${K.object === 'Lead' ? 'Leads' : 'Cases'}`))));
          form.reset();
        } catch (err) {
          mount(result, h('div', { class: 'alert danger' }, icon('alert'), h('div', h('strong', 'Submission failed: '), err.message)));
        }
      } });
      for (const api of v.fields) {
        const f = fieldMap.get(api);
        if (!f) continue;
        let el;
        if (f.type === 'Picklist') el = h('select', { class: 'input', id: `wt-test-${api}` }, h('option', { value: '' }, '--None--'), (f.values || []).filter((x) => x.isActive !== false).map((o) => h('option', { value: o.value }, o.label || o.value)));
        else if (f.type === 'TextArea' || f.type === 'LongTextArea') el = h('textarea', { class: 'input', id: `wt-test-${api}`, rows: 2 });
        else if (f.type === 'Checkbox') el = h('input', { type: 'checkbox', id: `wt-test-${api}` });
        else el = h('input', { class: 'input', id: `wt-test-${api}`, type: { Email: 'email', Phone: 'tel', Number: 'number', Currency: 'number', Date: 'date' }[f.type] || 'text' });
        inputs.set(api, el);
        form.appendChild(formRow(f.label, el, { id: `wt-test-${api}`, required: f.required, span2: f.type === 'TextArea' || f.type === 'LongTextArea' }));
      }
      form.appendChild(h('div', { class: 'span-2 row' }, h('button', { class: 'btn btn-brand', type: 'submit' }, icon('play'), 'Submit Test'), h('span', { class: 'small muted' }, 'Uses the saved settings, exactly as a website visitor would.')));
      mount(testWrap, !org[K.key]?.enabled ? h('div', { class: 'alert warning mb-8' }, icon('alert'), h('div', `${K.label} is not enabled (saved settings). Test submissions will be rejected.`)) : null,
        v.fields.length ? form : h('div', { class: 'muted small' }, 'Select fields to build the form.'), h('div', { class: 'mt-8' }, result));
    }
    drawTest();

    mount(panel,
      h('div', { class: 'card-body' },
        h('p', { class: 'muted', style: { marginTop: 0 } }, K.blurb),
        h('div', { class: 'sa-webto-grid' },
          h('div',
            h('div', { class: 'section-title' }, 'Settings'),
            h('div', { class: 'form-row' }, h('label', { class: 'row', for: 'wt-enabled' }, h('span', { class: 'switch' }, enabled, h('span')), h('strong', `Enable ${K.label}`))),
            formRow('Default Owner', owner.el, { required: true, help: `New ${K.object === 'Lead' ? 'leads' : 'cases'} are owned by this user (assignment rules or flows can reassign them).` }),
            formRow('Return URL', retURL, { id: 'wt-ret', help: 'Where visitors are sent after submitting. Used in the generated HTML.' }),
            h('div', { class: 'form-label mt-16' }, 'Fields on the form'),
            fieldBox,
            canEdit ? h('div', { class: 'row mt-16' }, saveBtn, h('span', { class: 'small muted' }, 'Only checked fields are accepted from web submissions.')) : null),
          h('div',
            h('div', { class: 'section-title' }, 'Generated HTML', h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm', type: 'button', onClick: (e) => { e.stopPropagation(); copyText(snippet()); } }, icon('copy'), 'Copy')),
            reqWarn, snippetEl,
            h('div', { class: 'section-title' }, 'Test it'),
            testWrap))));
  }

  drawTabs();
  drawPanel();
  mount(container, header, canEdit ? null : readOnlyNote('You need the "Customize Application" permission to change these settings.'), h('div', { class: 'card' }, tabsEl, panel));
}
