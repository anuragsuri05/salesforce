// Setup › AI › Agent Builder: configure Slavy Agent (identity, instructions, topics, actions, guardrails)
// and try it out in a live test conversation.
import { h, icon, mount, clear, toast, spinner, emptyState, modal, confirmDialog, badge } from '../lib.js';
import { GET, PUT, POST, can } from '../api.js';
import { aiHeader, aiMark, toggleRow, sectionCard, markdown, setBusy } from './ai-common.js';
import { formRow } from './admin-common.js';

const FIELDS = ['name', 'role', 'instructions', 'topics', 'tools', 'requireConfirmation', 'maxSteps', 'welcome', 'suggestions'];

export default async function render(container, { app }) {
  app.setTitle('Agent Builder');
  const editable = can('CustomizeApplication');
  mount(container, aiHeader('Agent Builder'), spinner());
  let cfg, status;
  try {
    [cfg, status] = await Promise.all([GET('/api/setup/ai/agent'), GET('/api/ai/status').catch(() => null)]);
  } catch (e) {
    mount(container, aiHeader('Agent Builder'), h('div', { class: 'card p-24' }, emptyState('Could not load the agent', e.message, { iconName: 'lock' })));
    return;
  }
  const tools = cfg.availableTools || [];
  const pick = (c) => structuredClone(Object.fromEntries(FIELDS.map((k) => [k, c[k]])));
  let saved = pick(cfg);
  let draft = pick(cfg);
  const isDirty = () => JSON.stringify(draft) !== JSON.stringify(saved);

  const saveBtn = h('button', { class: 'btn btn-brand', disabled: !editable, onClick: () => save() }, 'Save');
  const resetBtn = h('button', { class: 'btn', onClick: () => { draft = pick(saved); drawConfig(); touch(); } }, 'Cancel');
  const dirtyNote = h('span', { class: 'aia-dirty hidden' }, icon('info', { size: 13 }), 'Unsaved changes');
  const left = h('div', { class: 'aia-agent-config' });
  const right = h('aside', { class: 'aia-agent-test' });
  mount(container,
    aiHeader('Agent Builder', {
      description: 'Shape how Slavy Agent behaves: its role, instructions, topics and the actions it may take on users’ behalf.',
      actions: editable ? [dirtyNote, resetBtn, saveBtn] : [],
    }),
    !editable ? h('div', { class: 'alert warning mb-16' }, icon('lock'), h('div', 'You can view the agent, but you need the “Customize Application” permission to change it.')) : null,
    statusCallout(status),
    h('div', { class: 'aia-agent-layout' }, left, right));

  function touch() {
    const d = isDirty();
    dirtyNote.classList.toggle('hidden', !d);
    resetBtn.disabled = !d;
    chat.setDirty(d);
  }

  const text = (key, { multiline, rows = 4, placeholder, mono } = {}) => {
    const el = multiline ? h('textarea', { class: ['input', mono && 'mono'], rows, placeholder, disabled: !editable }) : h('input', { class: 'input', placeholder, disabled: !editable });
    el.value = draft[key] ?? '';
    el.addEventListener('input', () => { draft[key] = el.value; touch(); });
    return el;
  };

  function identityCard() {
    return sectionCard('Agent Identity', { iconName: 'user', subtitle: 'Who the agent is and how it should work. Sent to the model as its system instructions.', body: [
      formRow('Agent Name', text('name', { placeholder: 'Slavy Agent' }), { required: true }),
      formRow('Role', text('role', { multiline: true, rows: 2 }), { help: 'One or two sentences describing the agent’s job and audience.' }),
      formRow('Instructions', text('instructions', { multiline: true, rows: 6 }), { help: 'General rules the agent always follows — tone, formatting, what to do when a request is ambiguous.' }),
    ] });
  }

  function topicsCard() {
    const list = h('div', { class: 'aia-topics' });
    const topics = draft.topics || [];
    if (!topics.length) list.appendChild(h('div', { class: 'aia-empty-line' }, 'No topics yet. Topics tell the agent which kinds of jobs it handles and how.'));
    topics.forEach((t, i) => {
      const sw = h('input', { type: 'checkbox', checked: t.enabled !== false, disabled: !editable, 'aria-label': `Enable topic ${t.name}`, onChange: () => { t.enabled = sw.checked; touch(); drawConfig(); } });
      list.appendChild(h('div', { class: ['aia-topic', t.enabled === false && 'off'] },
        h('span', { class: 'aia-topic-icon' }, icon('target')),
        h('div', { class: 'grow' },
          h('div', { class: 'row' }, h('span', { class: 'strong' }, t.name || 'Untitled topic'), t.enabled === false ? badge('Off') : null),
          t.description ? h('div', { class: 'small muted' }, t.description) : null,
          t.instructions ? h('div', { class: 'aia-topic-instr small' }, t.instructions) : null),
        h('div', { class: 'row gap-4' },
          h('label', { class: 'switch', title: t.enabled === false ? 'Disabled' : 'Enabled' }, sw, h('span')),
          editable ? h('button', { class: 'btn btn-ghost btn-sm btn-icon', title: 'Edit topic', 'aria-label': `Edit topic ${t.name}`, onClick: () => topicDialog(t, (v) => { topics[i] = v; touch(); drawConfig(); }) }, icon('edit', { size: 14 })) : null,
          editable ? h('button', { class: 'btn btn-ghost btn-sm btn-icon', title: 'Delete topic', 'aria-label': `Delete topic ${t.name}`, onClick: async () => {
            if (!(await confirmDialog(h('div', 'Delete the topic ', h('strong', t.name), '?'), { title: 'Delete Topic', confirmLabel: 'Delete', danger: true }))) return;
            topics.splice(i, 1); touch(); drawConfig();
          } }, icon('trash', { size: 14 })) : null)));
    });
    return sectionCard('Topics', { iconName: 'layers', subtitle: 'Categories of jobs the agent handles, each with its own instructions.',
      actions: editable ? [h('button', { class: 'btn btn-sm', onClick: () => topicDialog(null, (v) => { draft.topics = [...(draft.topics || []), v]; touch(); drawConfig(); }) }, icon('plus'), 'New Topic')] : [],
      body: [list] });
  }

  function topicDialog(topic, onSave) {
    const t = { name: '', description: '', instructions: '', enabled: true, ...(topic || {}) };
    const name = h('input', { class: 'input', value: t.name, placeholder: 'e.g. Customer Service' });
    const desc = h('input', { class: 'input', value: t.description, placeholder: 'What kinds of requests belong to this topic?' });
    const instr = h('textarea', { class: 'input', rows: 5, placeholder: 'How should the agent handle these requests?' });
    instr.value = t.instructions || '';
    const m = modal({
      title: topic ? 'Edit Topic' : 'New Topic',
      body: h('div',
        formRow('Topic Name', name, { required: true }),
        formRow('Description', desc, { help: 'Helps the agent decide when this topic applies.' }),
        formRow('Instructions', instr, { help: 'Specific guidance for this topic, e.g. “Always include the case number in replies.”' })),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: () => {
        if (!name.value.trim()) { m.setError('Topic name is required.'); return; }
        onSave({ ...t, name: name.value.trim(), description: desc.value.trim(), instructions: instr.value.trim() });
        m.close();
      } }, topic ? 'Done' : 'Add Topic')],
    });
  }

  function actionsCard() {
    const rows = tools.map((t) => {
      const on = draft.tools?.[t.name] !== false;
      const sw = h('input', { type: 'checkbox', checked: on, disabled: !editable, 'aria-label': `Allow ${t.label}`, onChange: () => { draft.tools = { ...draft.tools, [t.name]: sw.checked }; touch(); drawConfig(); } });
      return h('div', { class: ['aia-action', !on && 'off'] },
        h('span', { class: ['aia-action-icon', t.mutating && 'mut'] }, icon(t.mutating ? 'edit' : 'search', { size: 14 })),
        h('div', { class: 'grow' },
          h('div', { class: 'row wrap gap-4' }, h('span', { class: 'strong' }, t.label), h('code', { class: 'aia-tool-name' }, t.name), t.mutating ? h('span', { class: 'aia-badge-mut' }, 'Changes data') : h('span', { class: 'aia-badge-ro' }, 'Read only')),
          h('div', { class: 'small muted aia-action-desc' }, t.description)),
        h('label', { class: 'switch' }, sw, h('span')));
    });
    const enabled = tools.filter((t) => draft.tools?.[t.name] !== false).length;
    return sectionCard('Actions', { iconName: 'zap', subtitle: `${enabled} of ${tools.length} actions enabled. Actions always run with the user’s own permissions.`, body: [h('div', { class: 'aia-actions' }, rows)] });
  }

  function guardrailsCard() {
    const steps = h('input', { class: 'input', type: 'number', min: 1, max: 15, value: draft.maxSteps, disabled: !editable, style: { width: '120px' }, 'aria-label': 'Max steps' });
    steps.addEventListener('input', () => { draft.maxSteps = Math.max(1, Math.min(15, Number(steps.value) || 8)); touch(); });
    return sectionCard('Guardrails', { iconName: 'shield', body: [
      toggleRow('Require confirmation for changes', draft.requireConfirmation !== false, (v) => { draft.requireConfirmation = v; touch(); }, {
        disabled: !editable, help: 'Before the agent creates, updates, logs, posts or submits anything, the user sees exactly what will change and must approve it.',
      }),
      formRow('Max Steps per Request', steps, { help: 'The most tool calls the agent may chain to answer one message (1–15).' }),
    ] });
  }

  function experienceCard() {
    const list = h('div', { class: 'aia-suggestions' });
    const drawList = () => {
      clear(list);
      (draft.suggestions || []).forEach((s, i) => {
        const inp = h('input', { class: 'input', value: s, disabled: !editable, 'aria-label': `Suggested prompt ${i + 1}` });
        inp.addEventListener('input', () => { draft.suggestions[i] = inp.value; touch(); });
        list.appendChild(h('div', { class: 'row' }, h('span', { class: 'aia-sugg-icon' }, icon('message', { size: 13 })), inp,
          editable ? h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Remove suggested prompt', title: 'Remove', onClick: () => { draft.suggestions.splice(i, 1); touch(); drawList(); } }, icon('x', { size: 14 })) : null));
      });
      if (editable && (draft.suggestions || []).length < 8) {
        list.appendChild(h('button', { class: 'btn btn-sm aia-add-line', onClick: () => { draft.suggestions = [...(draft.suggestions || []), '']; touch(); drawList(); list.querySelectorAll('input')[draft.suggestions.length - 1]?.focus(); } }, icon('plus'), 'Add suggested prompt'));
      }
    };
    drawList();
    return sectionCard('Conversation Experience', { iconName: 'message', body: [
      formRow('Welcome Message', text('welcome', { multiline: true, rows: 2 }), { help: 'Shown when a user opens the agent.' }),
      formRow('Suggested Prompts', list, { help: 'Quick-start prompts shown as chips under the welcome message.' }),
    ] });
  }

  function drawConfig() {
    mount(left, identityCard(), topicsCard(), actionsCard(), guardrailsCard(), experienceCard());
  }

  async function save() {
    const patch = {};
    for (const k of FIELDS) if (JSON.stringify(draft[k]) !== JSON.stringify(saved[k])) patch[k] = draft[k];
    if (patch.suggestions) patch.suggestions = patch.suggestions.map((s) => s.trim()).filter(Boolean);
    if (!Object.keys(patch).length) { toast('No changes to save.'); return; }
    if ('name' in patch && !String(patch.name).trim()) { toast('Agent name is required.', 'error'); return; }
    setBusy(saveBtn, true, 'Saving…');
    try {
      const res = await PUT('/api/setup/ai/agent', patch);
      saved = pick(res);
      draft = pick(res);
      toast('Agent saved.', 'success');
      window.dispatchEvent(new CustomEvent('slavy:ai-changed'));
      drawConfig(); touch();
      chat.reset();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(saveBtn, false);
  }

  const chat = testPanel(right, () => saved, status);
  drawConfig();
  touch();
}

function statusCallout(status) {
  if (!status || status.enabled) return null;
  const why = !status.configured ? 'No AI provider API key is configured' : 'Generative AI is turned off';
  return h('div', { class: 'alert warning mb-16 aia-callout' }, icon('alert'),
    h('div', { class: 'grow' }, h('strong', `${why}. `), 'You can configure the agent, but the test conversation needs AI to be on.'),
    h('a', { class: 'btn btn-sm', href: '#/setup/ai' }, icon('sparkles'), 'Open AI Settings'));
}

// ---------- live test conversation ----------
function testPanel(root, getCfg, status) {
  let convo = [];      // canonical messages exchanged with the server
  let items = [];      // display items: { kind: 'user'|'agent'|'error'|'pending', ... }
  let busy = false;
  let dirty = false;
  const log = h('div', { class: 'aia-chat-log', 'aria-live': 'polite' });
  const input = h('textarea', { class: 'input aia-chat-input', rows: 1, placeholder: 'Ask the agent something…', 'aria-label': 'Message' });
  const sendBtn = h('button', { class: 'btn btn-brand btn-icon', title: 'Send', 'aria-label': 'Send', onClick: () => send() }, icon('arrowUp'));
  const dirtyNote = h('div', { class: 'aia-chat-note hidden' }, icon('info', { size: 13 }), 'Save your changes to test them — the conversation uses the saved agent.');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(120, input.scrollHeight)}px`; });

  mount(root, h('div', { class: 'card aia-chat' },
    h('div', { class: 'aia-chat-head' }, aiMark('sm'), h('div', { class: 'grow' }, h('div', { class: 'strong' }, 'Test Conversation'), h('div', { class: 'tiny muted' }, 'Runs as you, with your permissions. Changes are real.')),
      h('button', { class: 'btn btn-ghost btn-sm', title: 'Start over', onClick: () => reset() }, icon('refresh', { size: 14 }), 'Reset')),
    dirtyNote, log,
    h('div', { class: 'aia-chat-compose' }, input, sendBtn)));

  function welcome() {
    const cfg = getCfg();
    return h('div', { class: 'aia-chat-welcome' },
      aiMark('md'),
      h('div', { class: 'strong mt-8' }, cfg.name || 'Slavy Agent'),
      h('div', { class: 'small muted' }, cfg.welcome || ''),
      h('div', { class: 'aia-chat-chips' }, (cfg.suggestions || []).filter(Boolean).map((s) => h('button', { class: 'aia-chip', onClick: () => { input.value = s; send(); } }, s))),
      status && !status.enabled ? h('div', { class: 'aia-chat-off' }, icon('alert', { size: 13 }), 'AI is not enabled — ', h('a', { href: '#/setup/ai' }, 'turn it on'), ' to chat.') : null);
  }

  function stepsView(steps) {
    if (!steps?.length) return null;
    return h('div', { class: 'aia-steps' }, steps.map((s) => h('div', { class: ['aia-step', s.ok ? 'ok' : s.declined ? 'declined' : 'err'] },
      icon(s.ok ? 'check' : s.declined ? 'x' : 'alert', { size: 12 }),
      h('span', { class: 'grow' }, s.label || s.tool, s.declined ? ' — declined' : '', s.error ? ` — ${s.error}` : '',
        s.input && Object.keys(s.input).length ? h('code', { class: 'aia-step-input' }, Object.values(s.input).map((v) => String(v)).join(' · ').slice(0, 80)) : null),
      s.link ? h('a', { href: s.link, class: 'tiny' }, 'Open') : null)));
  }

  function pendingView(it) {
    return h('div', { class: 'aia-pending' },
      h('div', { class: 'aia-pending-head' }, icon('shield', { size: 14 }), h('span', { class: 'strong' }, 'Confirm before the agent continues')),
      it.calls.map((c) => h('div', { class: 'aia-pending-call' },
        h('div', { class: 'row' }, h('span', { class: 'strong grow' }, c.title || c.name), c.mutating ? h('span', { class: 'aia-badge-mut' }, 'Changes data') : null),
        c.details && Object.keys(c.details).length ? h('dl', { class: 'aia-kv' }, Object.entries(c.details).map(([k, v]) => [h('dt', k), h('dd', typeof v === 'object' ? JSON.stringify(v) : String(v))])) : null)),
      it.resolved ? h('div', { class: 'small muted mt-8' }, it.resolved === 'approve' ? 'Approved.' : 'Rejected.')
        : h('div', { class: 'row mt-8' },
          h('button', { class: 'btn btn-brand btn-sm', disabled: busy, onClick: () => decide(it, 'approve') }, icon('check', { size: 13 }), 'Approve'),
          h('button', { class: 'btn btn-sm', disabled: busy, onClick: () => decide(it, 'reject') }, 'Reject')));
  }

  function draw() {
    clear(log);
    log.appendChild(welcome());
    for (const it of items) {
      if (it.kind === 'user') log.appendChild(h('div', { class: 'aia-msg user' }, h('div', { class: 'aia-bubble' }, it.text)));
      else if (it.kind === 'agent') {
        log.appendChild(h('div', { class: 'aia-msg agent' }, h('span', { class: 'aia-msg-avatar' }, icon('sparkles', { size: 13 })),
          h('div', { class: 'aia-bubble' }, stepsView(it.steps), it.text ? markdown(it.text) : (it.steps?.length ? null : h('span', { class: 'muted' }, '(no reply)')))));
      } else if (it.kind === 'pending') log.appendChild(h('div', { class: 'aia-msg agent' }, h('span', { class: 'aia-msg-avatar' }, icon('sparkles', { size: 13 })), pendingView(it)));
      else if (it.kind === 'error') log.appendChild(h('div', { class: 'aia-msg error' }, icon('alert', { size: 14 }), h('span', it.text)));
    }
    if (busy) log.appendChild(h('div', { class: 'aia-msg agent' }, h('span', { class: 'aia-msg-avatar' }, icon('sparkles', { size: 13 })), h('div', { class: 'aia-bubble aia-typing' }, h('span'), h('span'), h('span'))));
    sendBtn.disabled = busy;
    log.scrollTop = log.scrollHeight;
  }

  function handle(res) {
    convo = res.messages || convo;
    if (res.reply || res.steps?.length) items.push({ kind: 'agent', text: res.reply, steps: res.steps });
    if (res.pending?.length) items.push({ kind: 'pending', calls: res.pending });
  }

  async function call(body) {
    busy = true; draw();
    try { handle(await POST('/api/ai/agent', body)); } catch (e) { items.push({ kind: 'error', text: e.message }); }
    busy = false; draw();
  }

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    if (items.some((i) => i.kind === 'pending' && !i.resolved)) { toast('Approve or reject the pending action first.', 'error'); return; }
    input.value = ''; input.style.height = '';
    items.push({ kind: 'user', text });
    await call({ messages: [...convo, { role: 'user', content: text }] });
    input.focus();
  }

  async function decide(it, decision) {
    if (busy) return;
    it.resolved = decision;
    await call({ messages: convo, decision });
  }

  function reset() { convo = []; items = []; draw(); }
  draw();
  return { reset, setDirty(d) { dirty = d; dirtyNote.classList.toggle('hidden', !dirty); } };
}
