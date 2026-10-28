// Predictive scoring without an LLM: a naive-Bayes style model trained on the org's own history.
// Lead Score = likelihood a lead converts; Opportunity Score = likelihood an open deal is won.
import { all } from '../db.js';
import { getObject, getField } from '../metadata.js';
import { visibleRecords, getRecord, enriched, pathValue } from '../records.js';
import { systemContext } from '../security.js';
import { loadRaw } from '../store.js';
import { HttpError } from '../util.js';

const bucket = (v, edges, labels) => {
  if (v == null || v === '') return 'Unknown';
  const n = Number(v);
  for (let i = 0; i < edges.length; i++) if (n < edges[i]) return labels[i];
  return labels[labels.length - 1];
};
const seniority = (t) => {
  const s = String(t || '').toLowerCase();
  if (!s) return 'Unknown';
  if (/\b(ceo|cfo|cto|coo|cio|chief|president|founder|owner)\b/.test(s)) return 'C-level';
  if (/\b(vp|vice president|head)\b/.test(s)) return 'VP / Head';
  if (/director/.test(s)) return 'Director';
  if (/manager|lead/.test(s)) return 'Manager';
  return 'Individual contributor';
};

const MODELS = {
  Lead: {
    label: 'Lead Score', description: 'Likelihood that a lead converts, learned from converted vs. disqualified leads.',
    label1: (r) => (r.IsConverted ? 1 : r.Status === 'Closed - Not Converted' ? 0 : null),
    features: {
      'Lead Source': (r) => r.LeadSource || 'Unknown',
      Industry: (r) => r.Industry || 'Unknown',
      Rating: (r) => r.Rating || 'Unknown',
      Seniority: (r) => seniority(r.Title),
      'Company Size': (r) => bucket(r.NumberOfEmployees, [50, 500, 5000], ['1-49', '50-499', '500-4,999', '5,000+']),
      'Annual Revenue': (r) => bucket(r.AnnualRevenue, [1e6, 1e7, 1e8], ['< $1M', '$1M-$10M', '$10M-$100M', '$100M+']),
      'Has Phone': (r) => (r.Phone || r.MobilePhone ? 'Yes' : 'No'),
    },
  },
  Opportunity: {
    label: 'Opportunity Score', description: 'Likelihood that an open opportunity is won, learned from closed won vs. closed lost deals and blended with the stage probability.',
    label1: (r) => (r.IsClosed ? (r.IsWon ? 1 : 0) : null),
    features: {
      'Lead Source': (r) => r.LeadSource || 'Unknown',
      Type: (r) => r.Type || 'Unknown',
      'Deal Size': (r) => bucket(r.Amount, [25000, 75000, 150000], ['< $25K', '$25K-$75K', '$75K-$150K', '$150K+']),
      'Account Industry': (r, ctx) => pathValue(ctx, 'Opportunity', r, 'Account.Industry').value || 'Unknown',
      'Has Campaign': (r) => (r.CampaignId ? 'Yes' : 'No'),
      'Has Products': (r) => (Number(r.LineItemTotal__c || 0) > 0 ? 'Yes' : 'No'),
      Owner: (r, ctx) => pathValue(ctx, 'Opportunity', r, 'Owner.Name').value || 'Unknown',
    },
    blend: (r, p) => (r.Probability != null ? 0.6 * p + 0.4 * (Number(r.Probability) / 100) : p),
  },
};

const cache = new Map();
const TTL = 10 * 60000;

export function trainModel(objApi, { force = false } = {}) {
  const def = MODELS[objApi];
  if (!def || !getObject(objApi)) throw new HttpError(400, `No scoring model for ${objApi}`);
  const hit = cache.get(objApi);
  if (hit && !force && Date.now() - hit.at < TTL) return hit.model;
  const sys = systemContext(null);
  const rows = visibleRecords(sys, objApi).map((i) => i.rec);
  const labeled = rows.map((r) => ({ r, y: def.label1(r) })).filter((x) => x.y != null);
  const pos = labeled.filter((x) => x.y === 1).length;
  const neg = labeled.length - pos;
  const counts = {};
  for (const [fname, fn] of Object.entries(def.features)) {
    counts[fname] = {};
    for (const { r, y } of labeled) {
      const v = fn(r, sys);
      counts[fname][v] ||= [0, 0];
      counts[fname][v][y]++;
    }
  }
  const model = { object: objApi, label: def.label, description: def.description, trainedAt: new Date().toISOString(), examples: labeled.length, positives: pos, negatives: neg,
    prior: Math.log((pos + 1) / (neg + 1)), counts, baseRate: labeled.length ? pos / labeled.length : null, ready: pos >= 3 && neg >= 3 };
  cache.set(objApi, { at: Date.now(), model });
  return model;
}

function contribution(model, fname, v) {
  const c = model.counts[fname]?.[v] || [0, 0];
  // Laplace-smoothed log-likelihood ratio, shrunk toward 0 when the value is rare.
  const lr = Math.log((c[1] + 1) / (model.positives + 2)) - Math.log((c[0] + 1) / (model.negatives + 2));
  const n = c[0] + c[1];
  return lr * (n / (n + 3));
}

export function scoreRecord(ctx, id) {
  const rec = getRecord(ctx, id);
  const objApi = rec.attributes.type;
  const def = MODELS[objApi];
  if (!def) throw new HttpError(400, `Scoring is available for ${Object.keys(MODELS).join(' and ')}`);
  const model = trainModel(objApi);
  const sys = systemContext(null);
  const raw = enriched(sys, loadRaw(sys, id));
  const known = def.label1(raw);
  if (!model.ready) return { object: objApi, label: def.label, ready: false, message: `Not enough history yet — the model needs at least 3 positive and 3 negative ${getObject(objApi).pluralLabel.toLowerCase()} (has ${model.positives} / ${model.negatives}).` };
  let logit = model.prior;
  const factors = [];
  for (const [fname, fn] of Object.entries(def.features)) {
    const v = fn(raw, sys);
    const c = contribution(model, fname, v);
    logit += c;
    factors.push({ feature: fname, value: String(v), impact: Math.round(c * 100) / 100 });
  }
  let p = 1 / (1 + Math.exp(-logit));
  if (def.blend) p = def.blend(raw, p);
  factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  return {
    object: objApi, label: def.label, ready: true, score: Math.round(p * 100), outcome: known == null ? null : known ? 'positive' : 'negative',
    rating: p >= 0.7 ? 'High' : p >= 0.4 ? 'Medium' : 'Low', baseRate: Math.round((model.baseRate || 0) * 100),
    positives: factors.filter((f) => f.impact > 0.05).slice(0, 4), negatives: factors.filter((f) => f.impact < -0.05).slice(0, 4),
    model: { examples: model.examples, trainedAt: model.trainedAt },
  };
}

export function modelStats({ retrain = false } = {}) {
  return Object.keys(MODELS).filter((o) => getObject(o)).map((o) => {
    const m = trainModel(o, { force: retrain });
    const top = [];
    for (const [fname, values] of Object.entries(m.counts)) {
      for (const v of Object.keys(values)) {
        const [neg, pos] = values[v];
        if (neg + pos < 3) continue;
        top.push({ feature: fname, value: v, examples: neg + pos, rate: Math.round((pos / (neg + pos)) * 100), impact: Math.round(contribution(m, fname, v) * 100) / 100 });
      }
    }
    top.sort((a, b) => b.impact - a.impact);
    return { object: o, label: m.label, description: m.description, trainedAt: m.trainedAt, examples: m.examples, positives: m.positives, negatives: m.negatives,
      baseRate: m.baseRate == null ? null : Math.round(m.baseRate * 100), ready: m.ready, bestSignals: top.slice(0, 6), worstSignals: top.slice(-6).reverse() };
  });
}

// Top scored open records for the current user (home page).
export function topScored(ctx, objApi, { limit = 5 } = {}) {
  if (!getObject(objApi) || !MODELS[objApi]) return [];
  const model = trainModel(objApi);
  if (!model.ready) return [];
  const open = visibleRecords(ctx, objApi, { scope: 'mine' }).map((i) => i.rec).filter((r) => MODELS[objApi].label1(r) == null);
  return open.map((r) => { try { const s = scoreRecord(ctx, r.Id); return { Id: r.Id, Name: r.Name, score: s.score, rating: s.rating }; } catch { return null; } })
    .filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit);
}

export { getField, all };
