// Formula editor with "Insert Field", "Insert Function" and server-side "Check Syntax".
// formulaEditor({ objApi, value, onChange, rows, placeholder }) -> { el, get(), check() => Promise<{ok, error}> }
import { h, icon, showMenu, clear, promptDialog } from '../lib.js';
import { POST, GET, pathOptions } from '../api.js';

let functionsCache = null;
const FUNCTION_HINTS = {
  IF: 'IF(test, value_if_true, value_if_false)', AND: 'AND(a, b, ...)', OR: 'OR(a, b, ...)', NOT: 'NOT(a)', CASE: "CASE(expr, 'v1', r1, 'v2', r2, else)",
  ISBLANK: 'ISBLANK(field)', BLANKVALUE: 'BLANKVALUE(expr, substitute)', ISPICKVAL: "ISPICKVAL(picklist, 'Value')", ISCHANGED: 'ISCHANGED(field)',
  PRIORVALUE: 'PRIORVALUE(field)', ISNEW: 'ISNEW()', TEXT: 'TEXT(value)', VALUE: 'VALUE(text)', LEN: 'LEN(text)', CONTAINS: "CONTAINS(text, 'x')",
  BEGINS: "BEGINS(text, 'x')", TODAY: 'TODAY()', NOW: 'NOW()', DATE: 'DATE(year, month, day)', ADDMONTHS: 'ADDMONTHS(date, n)', ROUND: 'ROUND(n, digits)',
  REGEX: "REGEX(text, 'pattern')", INCLUDES: "INCLUDES(multipicklist, 'Value')", YEAR: 'YEAR(date)', MONTH: 'MONTH(date)', DAY: 'DAY(date)',
};

export function formulaEditor({ objApi, value = '', onChange, rows = 4, placeholder = "e.g. AND(ISPICKVAL(StageName, 'Closed Won'), Amount > 100000)", aiPurpose = 'condition', returnType } = {}) {
  const ta = h('textarea', { class: 'input mono', rows, placeholder, spellcheck: 'false', onInput: () => { onChange?.(ta.value); status(''); } });
  ta.value = value || '';
  const statusEl = h('span', { class: 'small' });
  const status = (msg, ok) => { statusEl.textContent = msg; statusEl.style.color = ok ? 'var(--success)' : 'var(--danger)'; };

  const insert = (text) => {
    const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + text.length;
    onChange?.(ta.value);
  };

  const fieldBtn = h('button', { type: 'button', class: 'btn btn-sm', onClick: (e) => {
    const opts = pathOptions(objApi);
    const filter = h('input', { class: 'input input-sm', placeholder: 'Filter fields...' });
    const listEl = h('div');
    const draw = () => {
      clear(listEl);
      const t = filter.value.toLowerCase();
      opts.filter((o) => !t || o.label.toLowerCase().includes(t) || o.path.toLowerCase().includes(t)).slice(0, 80).forEach((o) => {
        listEl.appendChild(h('button', { class: 'menu-item', onClick: () => { insert(o.path); document.querySelector('.menu')?.remove(); } },
          h('span', { class: 'grow truncate' }, o.label), h('span', { class: 'muted tiny mono' }, o.path)));
      });
    };
    filter.addEventListener('input', draw);
    draw();
    const menu = showMenu(e.currentTarget, [{ node: h('div', { style: { padding: '4px' } }, filter) }, { node: listEl }], { width: 340 });
    setTimeout(() => filter.focus(), 0);
    return menu;
  } }, icon('plus'), 'Insert Field');

  const fnBtn = h('button', { type: 'button', class: 'btn btn-sm', onClick: async (e) => {
    const anchor = e.currentTarget;
    functionsCache ||= await GET('/api/formula/functions').catch(() => Object.keys(FUNCTION_HINTS));
    showMenu(anchor, functionsCache.map((fn) => ({ label: FUNCTION_HINTS[fn] || `${fn}()`, onClick: () => insert(`${fn}(`) })), { width: 300 });
  } }, icon('code'), 'Insert Function');

  const opBtn = h('button', { type: 'button', class: 'btn btn-sm', onClick: (e) => {
    showMenu(e.currentTarget, ['+', '-', '*', '/', '&', '=', '<>', '<', '>', '<=', '>=', '&&', '||', '( )'].map((o) => ({ label: o, onClick: () => insert(` ${o === '( )' ? '()' : o} `) })), { width: 120 });
  } }, 'Insert Operator');

  async function check() {
    if (!ta.value.trim()) { status(''); return { ok: true }; }
    const r = await POST('/api/formula/check', { object: objApi, formula: ta.value }).catch((e) => ({ ok: false, error: e.message }));
    status(r.ok ? 'No syntax errors.' : r.error, r.ok);
    return r;
  }
  const checkBtn = h('button', { type: 'button', class: 'btn btn-sm', onClick: check }, icon('check'), 'Check Syntax');

  const aiBtn = h('button', { type: 'button', class: 'btn btn-sm ai-btn', onClick: async () => {
    const description = await promptDialog(aiPurpose === 'validation' ? 'Describe when the record should be rejected:' : aiPurpose === 'formula' ? 'Describe what the formula should calculate:' : 'Describe the condition in plain English:',
      { title: 'Generate formula with AI', confirmLabel: 'Generate', multiline: true });
    if (!description) return;
    aiBtn.disabled = true;
    status('Generating…', true);
    try {
      const r = await POST('/api/ai/formula', { object: objApi, description, purpose: aiPurpose, returnType });
      ta.value = r.formula;
      onChange?.(ta.value);
      status(r.explanation ? `AI: ${r.explanation}` : 'Formula generated — review it, then Check Syntax.', true);
    } catch (e) { status(e.message); } finally { aiBtn.disabled = false; }
  } }, icon('sparkles'), 'Generate with AI');
  import('../ai/status.js').then(({ aiStatus, canGenerate }) => aiStatus().then((st) => { if (!canGenerate(st, 'builder')) aiBtn.remove(); }));
  const el = h('div', { class: 'formula-editor' }, h('div', { class: 'row wrap mb-8' }, fieldBtn, opBtn, fnBtn, aiBtn, h('span', { class: 'spacer' }), checkBtn), ta, h('div', { class: 'mt-8' }, statusEl));
  return { el, get: () => ta.value, set: (v) => { ta.value = v || ''; }, check };
}
