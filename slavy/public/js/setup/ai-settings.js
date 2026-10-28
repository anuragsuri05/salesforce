// Setup › AI › AI Settings: turn generative AI on, choose the provider & model, store the API key,
// configure the Einstein-style Trust Layer and per-feature switches, and review usage.
import { h, icon, mount, clear, fmt, toast, spinner, emptyState, badge } from '../lib.js';
import { GET, PUT, POST, can } from '../api.js';
import { aiHeader, aiMark, toggleRow, sectionCard, FEATURE_LABELS, setBusy } from './ai-common.js';
import { formRow, segmented, dataTable } from './admin-common.js';

const BLURBS = {
  anthropic: 'Claude Opus, Sonnet and Haiku. Excellent reasoning, writing and tool use — recommended for the agent.',
  openai: 'GPT-5 family through the Chat Completions API. Also works with Azure OpenAI and compatible gateways.',
  gemini: 'Gemini 2.5 Flash and Pro through Google AI Studio. Fast and cost-effective.',
  mock: 'Deterministic offline responses for automated tests. No key needed.',
};
const MARKS = { anthropic: 'A', openai: 'O', gemini: 'G', mock: 'M' };
const EFFORTS = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'Extra high'], ['max', 'Max']];
const EDITABLE = ['enabled', 'provider', 'model', 'effort', 'maxTokens', 'refusalFallback', 'maskPii', 'logPrompts', 'features', 'baseUrl'];
const KEY_LINKS = { anthropic: 'https://console.anthropic.com/settings/keys', openai: 'https://platform.openai.com/api-keys', gemini: 'https://aistudio.google.com/apikey' };

export default async function render(container, { app }) {
  app.setTitle('AI Settings');
  const editable = can('CustomizeApplication');
  mount(container, aiHeader('AI Settings'), spinner());
  let cfg;
  try { cfg = await GET('/api/setup/ai'); } catch (e) { mount(container, aiHeader('AI Settings'), h('div', { class: 'card p-24' }, emptyState('Could not load AI settings', e.message, { iconName: 'lock' }))); return; }

  const pick = (c) => Object.fromEntries(EDITABLE.map((k) => [k, k === 'features' ? { ...c.features } : c[k]]));
  let saved = pick(cfg);
  let draft = pick(cfg);
  let loadedModels = {}; // provider -> [{id,label}]
  let testResult = null;
  const typedKeys = {};

  const isDirty = () => JSON.stringify(draft) !== JSON.stringify(saved);
  const saveBtn = h('button', { class: 'btn btn-brand', disabled: !editable, onClick: () => save() }, 'Save');
  const cancelBtn = h('button', { class: 'btn', onClick: () => { draft = pick(cfg); draw(); } }, 'Cancel');
  const statusPill = h('span');
  const body = h('div', { class: 'aia-page' });
  const savebar = h('div', { class: 'aia-savebar hidden' }, icon('info'), h('span', { class: 'grow' }, 'You have unsaved changes.'), h('button', { class: 'btn btn-sm', onClick: () => { draft = pick(cfg); draw(); } }, 'Discard'), h('button', { class: 'btn btn-sm btn-brand', onClick: () => save() }, 'Save'));
  mount(container, aiHeader('AI Settings', {
    description: 'Connect Slavy to a generative AI provider and decide where AI can be used.',
    actions: editable ? [statusPill, cancelBtn, saveBtn] : [statusPill],
  }), !editable ? h('div', { class: 'alert warning mb-16' }, icon('lock'), h('div', 'You can view AI settings, but you need the “Customize Application” permission to change them.')) : null, body, savebar);

  function touch() {
    const d = isDirty();
    savebar.classList.toggle('hidden', !d);
    cancelBtn.disabled = !d;
    drawStatus();
  }

  function drawStatus() {
    clear(statusPill);
    const configured = cfg.configured || draft.provider === 'mock';
    if (!saved.enabled) statusPill.appendChild(badge('AI is off'));
    else if (!cfg.configured) statusPill.appendChild(badge('Needs an API key', 'warning'));
    else statusPill.appendChild(h('span', { class: 'aia-live' }, h('span', { class: 'aia-live-dot' }), 'AI is on'));
    void configured;
  }

  const providerInfo = (p) => cfg.providers[p] || { label: p, suggestedModels: [], keyHelp: '' };
  function keyStatus(p) {
    if (p === 'mock') return { text: 'No key needed', kind: 'success' };
    const hint = cfg.keyHints?.[p];
    if (!hint) return { text: 'No key', kind: '' };
    if (hint.startsWith('••')) return { text: `Key ${hint}`, kind: 'success' };
    return { text: 'Key from environment', kind: 'success' };
  }

  // ---------- sections ----------
  function hero() {
    const master = h('input', { type: 'checkbox', checked: !!draft.enabled, disabled: !editable, 'aria-label': 'Enable AI', onChange: () => { draft.enabled = master.checked; touch(); drawHeroState(); } });
    const stateText = h('div', { class: 'aia-hero-state' });
    const drawHeroState = () => {
      clear(stateText);
      stateText.append(h('strong', draft.enabled ? 'Generative AI is enabled' : 'Generative AI is disabled'),
        h('span', { class: 'small' }, draft.enabled ? (draft.provider === 'mock' || cfg.keyHints?.[draft.provider] ? `Using ${providerInfo(draft.provider).label} · ${draft.model || providerInfo(draft.provider).defaultModel}` : 'Add an API key below to start using AI.') : 'Turn it on to use the agent, summaries, drafts and prompt templates.'));
    };
    drawHeroState();
    return h('section', { class: 'card aia-hero' },
      h('div', { class: 'aia-hero-main' },
        aiMark('lg'),
        h('div', { class: 'grow' },
          h('h2', 'Generative AI for Slavy'),
          h('p', 'Bring your own model — Anthropic Claude, OpenAI ChatGPT or Google Gemini — and put it to work across the CRM: a conversational agent that reads and updates records, one-click record summaries and email drafts, reusable prompt templates and AI steps in Flows.'),
          h('ul', { class: 'aia-hero-points' },
            h('li', icon('shield'), 'Every request passes through the Trust Layer — PII masking, permission checks and an audit trail.'),
            h('li', icon('lock'), 'The model only sees records the user can see and only changes what the user could change.'),
            h('li', icon('chart'), 'Predictive lead & opportunity scoring runs locally and needs no API key.'))),
        h('div', { class: 'aia-hero-toggle' },
          h('label', { class: 'aia-master' }, h('span', { class: 'switch lg' }, master, h('span')), h('span', { class: 'strong' }, 'Enable AI')),
          stateText)));
  }

  function providerSection() {
    const grid = h('div', { class: 'aia-providers', role: 'radiogroup', 'aria-label': 'AI provider' });
    for (const p of Object.keys(cfg.providers)) {
      const info = providerInfo(p);
      const ks = keyStatus(p);
      const active = draft.provider === p;
      grid.appendChild(h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(active), class: ['aia-provider', active && 'active', `p-${p}`], disabled: !editable,
        onClick: () => {
          if (draft.provider === p) return;
          draft.provider = p;
          draft.model = p === saved.provider ? saved.model : info.defaultModel;
          testResult = null;
          touch(); draw();
        },
      },
      h('span', { class: `aia-provider-logo p-${p}` }, MARKS[p] || p[0].toUpperCase()),
      h('div', { class: 'grow' },
        h('div', { class: 'aia-provider-name' }, info.label),
        h('div', { class: 'small muted aia-provider-blurb' }, BLURBS[p] || ''),
        h('div', { class: 'mt-8' }, h('span', { class: `aia-keychip ${ks.kind}` }, icon(ks.kind === 'success' ? 'key' : 'alert', { size: 12 }), ks.text))),
      h('span', { class: 'aia-provider-check' }, icon('check', { size: 14 }))));
    }
    return sectionCard('Model Provider', { iconName: 'globe', subtitle: 'Choose which generative AI service Slavy calls. Keys are encrypted at rest and never sent to browsers.', body: [grid, providerConfig()] });
  }

  function providerConfig() {
    const p = draft.provider;
    const info = providerInfo(p);
    const wrap = h('div', { class: 'aia-provider-config' });

    // API key
    if (p !== 'mock') {
      const hint = cfg.keyHints?.[p];
      const keyInput = h('input', { class: 'input mono', type: 'password', autocomplete: 'off', spellcheck: 'false', disabled: !editable,
        placeholder: hint ? (hint.startsWith('••') ? `Saved key ${hint} — enter a new key to replace it` : 'Using the key from the server environment') : `Paste your ${info.label} API key`,
        'aria-label': 'API key' });
      keyInput.value = typedKeys[p] || '';
      keyInput.addEventListener('input', () => { typedKeys[p] = keyInput.value.trim(); });
      const saveKey = h('button', { class: 'btn btn-brand', disabled: !editable, onClick: async () => {
        const k = keyInput.value.trim();
        if (!k) { toast('Enter an API key first.', 'error'); keyInput.focus(); return; }
        setBusy(saveKey, true, 'Saving…');
        try {
          const res = await PUT('/api/setup/ai', { apiKey: k, keyProvider: p });
          Object.assign(cfg, { keyHints: res.keyHints, configured: res.configured, keySource: res.keySource });
          typedKeys[p] = '';
          toast(`${info.label} API key saved.`, 'success');
          window.dispatchEvent(new CustomEvent('slavy:ai-changed'));
          draw();
        } catch (e) { toast(e.message, 'error'); setBusy(saveKey, false); }
      } }, 'Save key');
      const removeKey = hint && hint.startsWith('••') ? h('button', { class: 'btn', disabled: !editable, onClick: async () => {
        try {
          const res = await PUT('/api/setup/ai', { apiKey: '', keyProvider: p });
          Object.assign(cfg, { keyHints: res.keyHints, configured: res.configured, keySource: res.keySource });
          toast(`${info.label} API key removed.`, 'success');
          window.dispatchEvent(new CustomEvent('slavy:ai-changed'));
          draw();
        } catch (e) { toast(e.message, 'error'); }
      } }, icon('trash'), 'Remove key') : null;
      const toggleVis = h('button', { type: 'button', class: 'btn btn-ghost btn-icon aia-eye', title: 'Show / hide key', 'aria-label': 'Show or hide key', onClick: () => { keyInput.type = keyInput.type === 'password' ? 'text' : 'password'; } }, icon('eye'));
      wrap.appendChild(formRow(`${info.label} API Key`, h('div', { class: 'row aia-keyrow' }, h('div', { class: 'aia-keyfield grow' }, keyInput, toggleVis), saveKey, removeKey), {
        help: h('span', info.keyHelp || '', KEY_LINKS[p] ? [' ', h('a', { href: KEY_LINKS[p], target: '_blank', rel: 'noopener noreferrer' }, 'Open the key page', icon('external', { size: 12 }))] : null),
      }));
    } else {
      wrap.appendChild(h('div', { class: 'alert mb-16' }, icon('info'), h('div', 'The mock provider returns canned responses. It is only available when the server runs with SLAVY_AI_MOCK=1.')));
    }

    // Model
    const listId = `aia-models-${p}`;
    const models = loadedModels[p] || info.suggestedModels.map((id) => ({ id, label: id }));
    const datalist = h('datalist', { id: listId }, models.map((m) => h('option', { value: m.id }, m.label !== m.id ? m.label : null)));
    const modelInput = h('input', { class: 'input mono', list: listId, value: draft.model || info.defaultModel, disabled: !editable, 'aria-label': 'Model', placeholder: info.defaultModel });
    modelInput.addEventListener('input', () => { draft.model = modelInput.value.trim(); touch(); });
    const loadBtn = h('button', { class: 'btn', disabled: !editable, onClick: async () => {
      setBusy(loadBtn, true, 'Loading…');
      try {
        const list = await POST('/api/setup/ai/models', { provider: p, apiKey: typedKeys[p] || undefined });
        loadedModels[p] = list;
        toast(`${list.length} model${list.length === 1 ? '' : 's'} available.`, 'success');
        draw();
      } catch (e) { toast(e.message, 'error'); setBusy(loadBtn, false); }
    } }, icon('refresh'), 'Load models');
    const chips = h('div', { class: 'aia-model-chips' }, models.slice(0, 8).map((m) => h('button', { type: 'button', class: ['aia-chip', (draft.model || info.defaultModel) === m.id && 'active'], disabled: !editable, onClick: () => { draft.model = m.id; modelInput.value = m.id; touch(); draw(); } }, m.id)));
    wrap.appendChild(formRow('Model', h('div', h('div', { class: 'row' }, modelInput, datalist, loadBtn), chips), {
      help: loadedModels[p] ? `${loadedModels[p].length} models loaded from ${info.label}. Type any model ID or pick one.` : `Suggested models are shown. Use “Load models” to list every model your key can use. Default: ${info.defaultModel}.`,
    }));

    const grid = h('div', { class: 'grid-2' });
    if (p === 'anthropic') {
      grid.appendChild(formRow('Effort', segmented(EFFORTS, draft.effort || 'medium', (v) => { draft.effort = v; touch(); }), {
        help: 'How much thinking Claude puts into each answer. Higher effort is smarter but slower and uses more tokens. Medium is a good default.',
      }));
    }
    const maxTok = h('input', { class: 'input', type: 'number', min: 256, max: 64000, step: 256, value: draft.maxTokens, disabled: !editable, 'aria-label': 'Max output tokens' });
    maxTok.addEventListener('input', () => { draft.maxTokens = Number(maxTok.value) || 4096; touch(); });
    grid.appendChild(formRow('Max Output Tokens', maxTok, { help: 'Upper limit for each response (256 – 64,000).' }));
    if (p === 'openai') {
      const base = h('input', { class: 'input mono', value: draft.baseUrl || '', placeholder: 'https://api.openai.com/v1', disabled: !editable, 'aria-label': 'Base URL' });
      base.addEventListener('input', () => { draft.baseUrl = base.value.trim(); touch(); });
      grid.appendChild(formRow('OpenAI-Compatible Base URL', base, { help: 'Optional. For Azure OpenAI or another OpenAI-compatible gateway. Leave blank for api.openai.com.' }));
    }
    wrap.appendChild(grid);
    if (p === 'anthropic') {
      wrap.appendChild(toggleRow('Refusal fallback', draft.refusalFallback !== false, (v) => { draft.refusalFallback = v; touch(); }, {
        disabled: !editable, help: 'If Claude declines a request, Anthropic automatically retries it on a fallback model so users still get an answer. Applies to Claude Opus, Sonnet and Fable models.',
      }));
    }

    // Test connection
    const result = h('div', { class: 'aia-test-result' });
    const drawResult = () => {
      clear(result);
      if (!testResult) return;
      if (testResult.ok) {
        result.append(h('div', { class: 'aia-test ok' }, icon('check'), h('div', { class: 'grow' },
          h('div', { class: 'strong' }, 'Connection successful'),
          h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Reply: '), `“${String(testResult.reply || '').trim().slice(0, 300)}”`),
          h('div', { class: 'small muted' }, `Model ${testResult.model} · ${fmt.number(testResult.latencyMs, 0)} ms`))));
      } else {
        result.append(h('div', { class: 'aia-test err' }, icon('alert'), h('div', { class: 'grow' }, h('div', { class: 'strong' }, 'Connection failed'), h('div', { class: 'small' }, testResult.error))));
      }
    };
    drawResult();
    const testBtn = h('button', { class: 'btn', disabled: !editable, onClick: async () => {
      setBusy(testBtn, true, 'Testing…');
      try {
        if (isDirty()) await save({ quiet: true });
        testResult = await POST('/api/setup/ai/test');
      } catch (e) { testResult = { ok: false, error: e.message }; }
      setBusy(testBtn, false);
      drawResult();
    } }, icon('zap'), 'Test connection');
    wrap.appendChild(h('div', { class: 'aia-test-row' }, testBtn, h('span', { class: 'small muted' }, isDirty() ? 'Saves your changes, then sends a short test prompt.' : 'Sends a short test prompt with the saved settings.')));
    wrap.appendChild(result);
    return wrap;
  }

  function trustSection() {
    const points = [
      ['lock', 'Permission-aware data access', 'Every AI feature runs as the requesting user: the model only sees records and fields that user can see, and the agent can only change what the user could change.'],
      ['eye', 'Data masking', 'Email addresses and phone numbers are replaced with tokens like [EMAIL_1] before data leaves Slavy, and restored in the response.'],
      ['database', 'Zero data retention by Slavy', 'Slavy stores nothing about AI requests outside the audit log below. Your provider’s own data-retention policy applies to API traffic.'],
      ['sliders', 'Per-feature switches', 'Turn individual AI features on or off for the whole org.'],
      ['shield', 'Who can use AI', h('span', 'Only users with the “Use AI Features” permission can use AI. Grant it in ', h('a', { href: '#/setup/profiles' }, 'Profiles'), ' or ', h('a', { href: '#/setup/permsets' }, 'Permission Sets'), '.')],
      ['activity', 'Audit trail', h('span', 'Every request — user, feature, model, latency, tokens and masked values — is recorded in the ', h('a', { href: '#/setup/ailog' }, 'AI Audit Trail'), '.')],
    ];
    return sectionCard('Einstein Trust Layer', { iconName: 'shield', subtitle: 'Safeguards applied to every generative AI request.', cls: 'aia-trust', body: [
      h('div', { class: 'grid-2 aia-trust-toggles' },
        toggleRow('Mask PII', !!draft.maskPii, (v) => { draft.maskPii = v; touch(); }, { disabled: !editable, help: 'Replace emails and phone numbers with tokens before data leaves Slavy; restore them in responses.' }),
        toggleRow('Log prompts & responses', !!draft.logPrompts, (v) => { draft.logPrompts = v; touch(); }, { disabled: !editable, help: 'Store the (masked) prompt and the response in the AI Audit Trail. Request metadata is always logged.' })),
      h('ul', { class: 'aia-trust-list' }, points.map(([ic, t, d]) => h('li', h('span', { class: 'aia-trust-icon' }, icon(ic)), h('div', h('div', { class: 'strong' }, t), h('div', { class: 'small muted' }, d))))),
    ] });
  }

  function featuresSection() {
    const list = h('div', { class: 'aia-features' }, (cfg.featureList || []).map(([k, label]) => toggleRow(label, draft.features?.[k] !== false, (v) => { draft.features = { ...draft.features, [k]: v }; touch(); }, {
      disabled: !editable,
      help: {
        agent: 'Chat with Slavy Agent from the header. Configure it in Agent Builder.',
        summary: 'One-click summaries on record pages.',
        email: 'Draft emails from record pages.',
        suggest: 'Suggest field values, e.g. classify a case’s type and priority.',
        prompts: 'Run Prompt Builder templates on records.',
        builder: 'Generate formulas and SOQL from plain language in Setup and the Developer Console.',
        flows: 'Run prompt templates from Flow “AI Prompt” elements (in the background after save).',
      }[k],
    })));
    return sectionCard('AI Features', { iconName: 'zap', subtitle: 'Turn individual capabilities on or off for everyone.', body: [list] });
  }

  function usageSection() {
    const labels = Object.fromEntries(cfg.featureList || []);
    const rows = (cfg.usage || []).map((u) => ({ ...u, label: FEATURE_LABELS[u.feature] || labels[u.feature] || u.feature }));
    const totals = rows.reduce((t, r) => ({ calls: t.calls + r.calls, tin: t.tin + (r.input_tokens || 0), tout: t.tout + (r.output_tokens || 0), err: t.err + (r.errors || 0) }), { calls: 0, tin: 0, tout: 0, err: 0 });
    const table = dataTable({ rows, compact: true, initialSort: { key: 'calls', dir: 'desc' }, empty: 'No AI requests in the last 30 days.', columns: [
      { key: 'label', label: 'Feature', render: (r) => h('span', { class: 'strong' }, r.label) },
      { key: 'calls', label: 'Calls', cls: 'right', render: (r) => fmt.number(r.calls, 0) },
      { key: 'input_tokens', label: 'Tokens In', cls: 'right', render: (r) => fmt.number(r.input_tokens || 0, 0) },
      { key: 'output_tokens', label: 'Tokens Out', cls: 'right', render: (r) => fmt.number(r.output_tokens || 0, 0) },
      { key: 'errors', label: 'Errors', cls: 'right', render: (r) => (r.errors ? h('span', { class: 'aia-err-count' }, String(r.errors)) : '0') },
      { key: 'avg_ms', label: 'Avg Latency', cls: 'right', render: (r) => (r.avg_ms != null ? `${fmt.number(r.avg_ms, 0)} ms` : '—') },
    ] });
    return sectionCard('Usage — Last 30 Days', { iconName: 'chart', subtitle: rows.length ? `${fmt.number(totals.calls, 0)} requests · ${fmt.compact(totals.tin)} tokens in · ${fmt.compact(totals.tout)} tokens out · ${totals.err} errors` : null,
      actions: [h('a', { class: 'btn btn-sm', href: '#/setup/ailog' }, icon('activity'), 'AI Audit Trail')], body: [table.el] });
  }

  async function save({ quiet = false } = {}) {
    const patch = {};
    for (const k of EDITABLE) if (JSON.stringify(draft[k]) !== JSON.stringify(saved[k])) patch[k] = draft[k];
    if (!Object.keys(patch).length) { if (!quiet) toast('No changes to save.'); return; }
    setBusy(saveBtn, true, 'Saving…');
    try {
      const res = await PUT('/api/setup/ai', patch);
      cfg = { ...cfg, ...res };
      saved = pick(cfg);
      draft = pick(cfg);
      if (!quiet) toast('AI settings saved.', 'success');
      window.dispatchEvent(new CustomEvent('slavy:ai-changed'));
      setBusy(saveBtn, false);
      draw();
    } catch (e) {
      setBusy(saveBtn, false);
      toast(e.message, 'error');
      throw e;
    }
  }

  function draw() {
    const y = window.scrollY;
    mount(body, hero(), providerSection(), h('div', { class: 'aia-two' }, trustSection(), featuresSection()), usageSection());
    touch();
    window.scrollTo(0, y);
  }
  draw();
}
