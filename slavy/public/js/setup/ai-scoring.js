// Setup › AI › Predictive Scoring: the built-in lead & opportunity scoring models (no LLM, no API key).
import { h, icon, mount, fmt, toast, spinner, emptyState, objIcon } from '../lib.js';
import { GET, POST, getObj, can } from '../api.js';
import { aiHeader, setBusy } from './ai-common.js';

const OUTCOMES = {
  Lead: { pos: 'Converted', neg: 'Not converted', rate: 'Convert rate' },
  Opportunity: { pos: 'Won', neg: 'Lost', rate: 'Win rate' },
};

export default async function render(container, { app }) {
  app.setTitle('Predictive Scoring');
  const editable = can('CustomizeApplication');
  const retrainBtn = h('button', { class: 'btn btn-brand', disabled: !editable, onClick: () => load(true) }, icon('refresh'), 'Retrain now');
  const header = aiHeader('Predictive Scoring', {
    description: 'Scores leads and opportunities from your own history and explains the signals behind every score.',
    actions: editable ? [retrainBtn] : [],
  });
  const body = h('div', spinner());
  mount(container, header,
    h('div', { class: 'alert mb-16 aia-note' }, icon('info'), h('div',
      h('strong', 'No API key needed. '),
      'Scoring models are trained inside Slavy on your closed records and never send data to an AI provider. Scores appear on record pages and on the home page and update automatically; retrain after a large data import.')),
    body);

  async function load(retrain = false) {
    if (retrain) setBusy(retrainBtn, true, 'Retraining…');
    try {
      const models = retrain ? await POST('/api/ai/scoring/retrain') : await GET('/api/ai/scoring');
      if (retrain) toast('Scoring models retrained.', 'success');
      mount(body, models.length ? h('div', { class: 'aia-models' }, models.map(modelCard)) : h('div', { class: 'card p-24' }, emptyState('No scoring models', 'Scoring needs the Lead and Opportunity objects.', { iconName: 'chart' })));
    } catch (e) {
      if (retrain) toast(e.message, 'error');
      else mount(body, h('div', { class: 'card p-24' }, emptyState('Could not load scoring models', e.message, { iconName: 'alert' })));
    }
    if (retrain) setBusy(retrainBtn, false);
  }
  await load();
}

function modelCard(m) {
  const o = getObj(m.object);
  const out = OUTCOMES[m.object] || { pos: 'Positive', neg: 'Negative', rate: 'Rate' };
  const total = (m.positives || 0) + (m.negatives || 0);
  const posPct = total ? Math.round((m.positives / total) * 100) : 0;
  const all = [...(m.bestSignals || []), ...(m.worstSignals || [])];
  const maxImpact = Math.max(0.01, ...all.map((s) => Math.abs(s.impact)));
  return h('section', { class: 'card aia-model' },
    h('div', { class: 'aia-model-head' },
      o ? objIcon(o) : null,
      h('div', { class: 'grow' }, h('h2', m.label), h('div', { class: 'small muted' }, m.description)),
      m.ready ? h('span', { class: 'aia-ready ok' }, icon('check', { size: 13 }), 'Ready') : h('span', { class: 'aia-ready' }, icon('clock', { size: 13 }), 'Learning')),
    h('div', { class: 'aia-model-stats' },
      stat('Training examples', fmt.number(m.examples || 0, 0)),
      stat(out.pos, fmt.number(m.positives || 0, 0), 'pos'),
      stat(out.neg, fmt.number(m.negatives || 0, 0), 'neg'),
      stat(`Base ${out.rate.toLowerCase()}`, m.baseRate == null ? '—' : `${m.baseRate}%`),
      stat('Trained', m.trainedAt ? fmt.relative(m.trainedAt) : '—', null, m.trainedAt ? fmt.datetime(m.trainedAt) : null)),
    total ? h('div', { class: 'aia-split', title: `${m.positives} ${out.pos.toLowerCase()} · ${m.negatives} ${out.neg.toLowerCase()}` },
      h('span', { class: 'pos', style: { width: `${posPct}%` } }), h('span', { class: 'neg', style: { width: `${100 - posPct}%` } })) : null,
    !m.ready ? h('div', { class: 'alert warning aia-model-msg' }, icon('alert'), h('div', `Not enough history yet — the model needs at least 3 ${out.pos.toLowerCase()} and 3 ${out.neg.toLowerCase()} ${(o?.pluralLabel || m.object).toLowerCase()} (has ${m.positives || 0} / ${m.negatives || 0}). Until then, records aren’t scored.`)) : null,
    h('div', { class: 'aia-signals' },
      signalTable('Best signals', 'arrowUp', m.bestSignals || [], maxImpact, out, 'pos'),
      signalTable('Worst signals', 'arrowDown', m.worstSignals || [], maxImpact, out, 'neg')));
}

function stat(label, value, kind, title) {
  return h('div', { class: ['aia-stat', kind], title }, h('div', { class: 'aia-stat-v' }, value), h('div', { class: 'aia-stat-l' }, label));
}

function signalTable(title, ic, rows, maxImpact, out, kind) {
  return h('div', { class: 'aia-signal-box' },
    h('div', { class: `aia-signal-title ${kind}` }, icon(ic, { size: 14 }), title),
    rows.length ? h('table', { class: 'table compact aia-signal-table' },
      h('thead', h('tr', h('th', 'Signal'), h('th', { class: 'right' }, 'Records'), h('th', { class: 'right' }, out.rate), h('th', { style: { width: '34%' } }, 'Impact'))),
      h('tbody', rows.map((s) => {
        const pct = Math.round((Math.abs(s.impact) / maxImpact) * 100);
        const positive = s.impact >= 0;
        return h('tr',
          h('td', h('span', { class: 'muted' }, `${s.feature} = `), h('span', { class: 'strong' }, s.value)),
          h('td', { class: 'right' }, String(s.examples)),
          h('td', { class: 'right' }, `${s.rate}%`),
          h('td', h('div', { class: 'aia-impact', title: `Impact ${positive ? '+' : ''}${s.impact}` },
            h('div', { class: 'aia-impact-track' }, h('span', { class: ['aia-impact-bar', positive ? 'pos' : 'neg'], style: { width: `${Math.max(4, pct)}%` } })),
            h('span', { class: ['aia-impact-n', positive ? 'pos' : 'neg'] }, `${positive ? '+' : ''}${s.impact.toFixed(2)}`))));
      }))) : h('div', { class: 'small muted p-16' }, 'No signals with enough examples yet.'));
}
