// AI widgets for record pages and Home: score, insights, summaries, prompt templates, field suggestions, email drafts.
import { h, icon, mount, clear, toast, modal, spinner, fmt } from '../lib.js';
import { GET, POST, PATCH, getObj } from '../api.js';
import { renderMarkdown } from './markdown.js';
import { aiStatus, canGenerate } from './status.js';
import { toggleAssistant } from './assistant.js';

const SCORED = new Set(['Lead', 'Opportunity']);
const INSIGHTS = new Set(['Opportunity', 'Case', 'Lead', 'Account']);
const SEVERITY = { high: ['danger', 'High'], medium: ['warning', 'Medium'], low: ['', 'Low'] };

function scoreRing(score, rating) {
  const r = 26, c = 2 * Math.PI * r;
  const color = rating === 'High' ? '#2e844a' : rating === 'Medium' ? '#dd7a01' : '#ba0517';
  const svg = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="6"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(score / 100) * c} ${c}" transform="rotate(-90 32 32)"/>
    <text x="32" y="37" text-anchor="middle" font-size="16" font-weight="700" fill="var(--text)">${Number(score)}</text></svg>`;
  return h('span', { class: 'score-ring', html: svg });
}

function factorRow(f, positive) {
  return h('div', { class: 'factor' }, h('span', { class: ['factor-arrow', positive ? 'up' : 'down'] }, icon(positive ? 'arrowUp' : 'arrowDown', { size: 12 })),
    h('span', { class: 'grow' }, h('span', { class: 'muted' }, `${f.feature}: `), f.value));
}

// Card shown at the top of a record page's right column.
export function aiRecordCard(rec, obj, { onChanged } = {}) {
  const card = h('div', { class: 'card ai-card' });
  const body = h('div', { class: 'card-body' }, spinner());
  card.append(h('div', { class: 'card-header' }, h('span', { class: 'ai-mark' }, icon('sparkles')), h('h3', 'Slavy AI'),
    h('button', { class: 'btn btn-sm', onClick: () => toggleAssistant(`Tell me about ${rec.Name}`) }, 'Ask Agent')), body);

  (async () => {
    const status = await aiStatus();
    const sections = [];
    const gen = canGenerate(status);

    if (SCORED.has(obj.apiName)) {
      const sec = h('div', { class: 'ai-section' }, h('div', { class: 'ai-section-title' }, `${obj.label} Score`), spinner());
      sections.push(sec);
      GET(`/api/ai/score/${rec.Id}`).then((s) => {
        const content = h('div');
        if (!s.ready) content.appendChild(h('div', { class: 'small muted' }, s.message));
        else {
          content.appendChild(h('div', { class: 'row gap-12' }, scoreRing(s.score, s.rating),
            h('div', { class: 'grow' }, h('div', { class: 'strong' }, s.outcome === 'positive' ? (obj.apiName === 'Lead' ? 'Converted' : 'Won') : s.outcome === 'negative' ? (obj.apiName === 'Lead' ? 'Not converted' : 'Lost') : `${s.rating} likelihood`),
              h('div', { class: 'tiny muted' }, `Org average ${s.baseRate}% · learned from ${s.model.examples} ${obj.pluralLabel.toLowerCase()}`))));
          if (s.positives.length) content.append(h('div', { class: 'tiny muted mt-8' }, 'Helping'), ...s.positives.map((f) => factorRow(f, true)));
          if (s.negatives.length) content.append(h('div', { class: 'tiny muted mt-8' }, 'Hurting'), ...s.negatives.map((f) => factorRow(f, false)));
        }
        mount(sec, h('div', { class: 'ai-section-title' }, `${obj.label} Score`), content);
      }).catch((e) => mount(sec, h('div', { class: 'small muted' }, e.message)));
    }

    if (INSIGHTS.has(obj.apiName)) {
      const sec = h('div', { class: 'ai-section' }, h('div', { class: 'ai-section-title' }, 'Insights'), spinner());
      sections.push(sec);
      GET(`/api/ai/insights/${rec.Id}`).then((list) => {
        mount(sec, h('div', { class: 'ai-section-title' }, 'Insights'),
          list.length ? list.map((i) => h('div', { class: 'insight' }, h('span', { class: `badge ${SEVERITY[i.severity][0]}` }, SEVERITY[i.severity][1]),
            h('div', { class: 'grow' }, h('div', { class: 'strong small' }, i.title), h('div', { class: 'small muted' }, i.detail))))
            : h('div', { class: 'small muted' }, icon('check', { size: 13 }), ' Nothing needs attention right now.'));
      }).catch(() => sec.remove());
    }

    if (gen && status.features.summary !== false) sections.push(summarySection(rec, obj));
    if (gen && status.features.suggest !== false && ['Case', 'Lead'].includes(obj.apiName) && rec._access !== 'read') sections.push(suggestSection(rec, obj, onChanged));
    if (gen && status.features.prompts !== false) {
      const sec = h('div', { class: 'ai-section' });
      GET(`/api/ai/prompts?object=${obj.apiName}`).then((list) => {
        if (!list.length) { sec.remove(); return; }
        mount(sec, h('div', { class: 'ai-section-title' }, 'Prompt Templates'),
          h('div', { class: 'row wrap gap-4' }, list.map((t) => h('button', { class: 'btn btn-sm', title: t.description, onClick: () => runTemplate(t, rec, obj, onChanged) }, icon('sparkles', { size: 12 }), t.label))));
      }).catch(() => sec.remove());
      sections.push(sec);
    }
    if (!gen && status.canManage && !status.enabled) {
      sections.push(h('div', { class: 'ai-section small muted' }, 'Generative AI is off. ', h('a', { href: '#/setup/ai' }, 'Connect Claude, ChatGPT or Gemini'), ' to enable summaries, drafts and the agent.'));
    }
    if (!sections.length) { card.remove(); return; }
    mount(body, ...sections);
  })();
  return card;
}

function summarySection(rec, obj) {
  const out = h('div');
  const btn = h('button', { class: 'btn btn-sm', onClick: () => run() }, icon('sparkles', { size: 12 }), 'Summarize');
  const sec = h('div', { class: 'ai-section' }, h('div', { class: 'row' }, h('div', { class: 'ai-section-title grow' }, 'Summary'), btn), out);
  async function run() {
    btn.disabled = true;
    mount(out, h('div', { class: 'row small muted' }, h('div', { class: 'spinner', style: { width: '16px', height: '16px', borderWidth: '2px' } }), `Summarizing this ${obj.label.toLowerCase()}…`));
    try {
      const r = await POST(`/api/ai/summarize/${rec.Id}`);
      mount(out, h('div', { class: 'ai-output' }, renderMarkdown(r.summary)),
        h('div', { class: 'row mt-8' }, h('span', { class: 'tiny muted grow' }, `Generated ${fmt.relative(r.generatedAt)} · verify before sharing`),
          h('button', { class: 'btn btn-ghost btn-sm', onClick: () => { navigator.clipboard?.writeText(r.summary); toast('Copied', 'success'); } }, icon('copy', { size: 12 }), 'Copy')));
      btn.lastChild.textContent = 'Regenerate';
    } catch (e) {
      mount(out, h('div', { class: 'small', style: { color: 'var(--danger)' } }, e.message));
    } finally { btn.disabled = false; }
  }
  return sec;
}

function suggestSection(rec, obj, onChanged) {
  const out = h('div');
  const btn = h('button', { class: 'btn btn-sm', onClick: () => run() }, icon('sparkles', { size: 12 }), 'Suggest values');
  const sec = h('div', { class: 'ai-section' }, h('div', { class: 'row' }, h('div', { class: 'ai-section-title grow' }, obj.apiName === 'Case' ? 'Case Classification' : 'Field Suggestions'), btn), out);
  async function run() {
    btn.disabled = true;
    mount(out, h('div', { class: 'small muted' }, 'Analyzing…'));
    try {
      const { suggestions } = await POST(`/api/ai/suggest/${rec.Id}`, {});
      if (!suggestions.length) { mount(out, h('div', { class: 'small muted' }, 'No suggestions.')); return; }
      const changes = suggestions.filter((s) => s.value !== s.current);
      mount(out, ...suggestions.map((s) => h('div', { class: 'suggest-row' },
        h('div', { class: 'grow' }, h('div', { class: 'small' }, h('strong', s.label), ': ', s.current ? h('span', { class: 'muted' }, `${s.current} → `) : null, h('strong', s.value), h('span', { class: 'tiny muted' }, ` · ${s.confidence}%`)),
          s.reason ? h('div', { class: 'tiny muted' }, s.reason) : null),
        s.value !== s.current ? h('button', { class: 'btn btn-sm', onClick: () => apply({ [s.field]: s.value }) }, 'Apply') : h('span', { class: 'badge success' }, 'Matches'))),
      changes.length > 1 ? h('button', { class: 'btn btn-sm btn-brand mt-8', onClick: () => apply(Object.fromEntries(changes.map((s) => [s.field, s.value]))) }, `Apply all (${changes.length})`) : null);
    } catch (e) {
      mount(out, h('div', { class: 'small', style: { color: 'var(--danger)' } }, e.message));
    } finally { btn.disabled = false; }
  }
  async function apply(values) {
    try { await PATCH(`/api/record/${rec.Id}`, values); toast('Fields updated', 'success'); onChanged?.(); } catch (e) { toast(e.message, 'error'); }
  }
  return sec;
}

async function runTemplate(t, rec, obj, onChanged) {
  const body = h('div', spinner());
  let response = '';
  const saveBtn = t.canSave && rec._access !== 'read' ? h('button', { class: 'btn btn-brand', disabled: true }, 'Save to Field') : null;
  const m = modal({ title: t.label, size: 'lg', body, footer: [
    h('button', { class: 'btn', onClick: () => { navigator.clipboard?.writeText(response); toast('Copied', 'success'); } }, icon('copy'), 'Copy'),
    h('button', { class: 'btn', onClick: () => m.close() }, 'Close'), saveBtn].filter(Boolean) });
  try {
    const r = await POST(`/api/ai/prompts/${t.id}/run`, { recordId: rec.Id });
    response = r.response;
    mount(body, h('div', { class: 'ai-output' }, renderMarkdown(r.response)),
      h('details', { class: 'mt-16 small' }, h('summary', { class: 'muted' }, 'Show the resolved prompt'), h('pre', { class: 'code-block', style: { whiteSpace: 'pre-wrap' } }, r.resolvedPrompt)));
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.onclick = async () => {
        try { await PATCH(`/api/record/${rec.Id}`, { [t.outputField]: response.trim() }); m.close(); toast('Saved', 'success'); onChanged?.(); } catch (e) { m.setError(e.message); }
      };
    }
  } catch (e) {
    clear(body);
    m.setError(e.message);
  }
}

// "Draft with AI" for the email composer. Fills subject/body inputs.
export function draftEmailButton(recordId, { subject, body, to }) {
  const btn = h('button', { class: 'btn btn-sm ai-btn', type: 'button', onClick: async () => {
    const intent = await askIntent();
    if (intent === null) return;
    btn.disabled = true;
    btn.lastChild.textContent = 'Drafting…';
    try {
      const d = await POST(`/api/ai/draft-email/${recordId}`, { intent, tone: 'professional' });
      subject.value = d.subject;
      body.value = d.body;
      if (to && !to.value && d.to) to.value = d.to;
      toast('Draft ready — review before sending', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; btn.lastChild.textContent = 'Draft with AI'; }
  } }, icon('sparkles', { size: 13 }), h('span', 'Draft with AI'));
  aiStatus().then((s) => { if (!canGenerate(s, 'email')) btn.remove(); });
  return btn;
}

function askIntent() {
  return new Promise((resolve) => {
    let result = null;
    const input = h('textarea', { class: 'input', rows: 3, placeholder: 'e.g. Follow up on the proposal and propose a call next week' });
    const chips = ['Follow up after a meeting', 'Send pricing proposal', 'Check in on open case', 'Ask for a renewal call', 'Thank them for their business']
      .map((c) => h('button', { class: 'suggestion', type: 'button', onClick: () => { input.value = c; } }, c));
    const m = modal({ title: 'Draft with AI', size: 'sm', body: h('div', h('label', { class: 'form-label' }, 'What should the email do?'), input, h('div', { class: 'row wrap gap-4 mt-8' }, chips)),
      footer: [h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn btn-brand', onClick: () => { result = input.value; m.close(); } }, icon('sparkles'), 'Draft')],
      onClose: () => resolve(result) });
    setTimeout(() => input.focus(), 50);
  });
}

// Home page AI cards: insights across my records + top scored leads/opportunities.
export function homeAICards() {
  const wrap = h('div', { class: 'col gap-16' });
  GET('/api/ai/home').then((d) => {
    const cards = [];
    cards.push(h('div', { class: 'card ai-card' },
      h('div', { class: 'card-header' }, h('span', { class: 'ai-mark' }, icon('sparkles')), h('h3', 'AI Insights'),
        canGenerate(d.status, 'agent') ? h('button', { class: 'btn btn-sm', onClick: () => toggleAssistant('What should I focus on today?') }, 'Ask Agent') : null),
      h('div', { class: 'card-body flush' }, d.insights.length ? d.insights.map((i) => h('a', { class: 'insight link', href: `#/r/${i.recordId}` },
        h('span', { class: `badge ${SEVERITY[i.severity][0]}` }, SEVERITY[i.severity][1]),
        h('div', { class: 'grow' }, h('div', { class: 'strong small' }, i.recordName), h('div', { class: 'small' }, i.title), h('div', { class: 'tiny muted' }, i.detail))))
        : h('div', { class: 'p-16 small muted' }, 'No risks found in your open deals and cases.'))));
    const scoredList = (title, list, objApi) => h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('span', { class: 'ai-mark' }, icon('target')), h('h3', title)),
      h('div', { class: 'card-body flush' }, list.map((x) => h('a', { class: 'insight link', href: `#/r/${x.Id}` },
        h('span', { class: ['score-pill', x.rating.toLowerCase()] }, x.score), h('span', { class: 'grow small truncate' }, x.Name), h('span', { class: 'tiny muted' }, x.rating)))));
    if (d.topOpportunities.length) cards.push(scoredList('Top Opportunities by AI Score', d.topOpportunities, 'Opportunity'));
    if (d.topLeads.length) cards.push(scoredList('Top Leads by AI Score', d.topLeads, 'Lead'));
    mount(wrap, ...cards);
  }).catch(() => wrap.remove());
  return wrap;
}
