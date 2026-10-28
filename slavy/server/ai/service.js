// AI service: org configuration, the trust layer (PII masking, permission & feature checks, audit log)
// and a single `generate()` entry point every AI feature goes through.
import { all, run, orgSetting, setOrgSetting, audit } from '../db.js';
import { hasPerm } from '../security.js';
import { HttpError, nowIso } from '../util.js';
import { chat, listModels, PROVIDERS } from './providers.js';
import { encrypt, decrypt } from './secret.js';

export const AI_FEATURES = [
  ['agent', 'Slavy Agent (conversational assistant)'],
  ['summary', 'Record Summaries'],
  ['email', 'Email Drafts'],
  ['suggest', 'Field Suggestions (e.g. case classification)'],
  ['prompts', 'Prompt Templates'],
  ['builder', 'Admin & Developer Assist (formulas, SOQL)'],
  ['flows', 'AI Prompt step in Flows'],
];

const DEFAULTS = {
  enabled: false, provider: 'anthropic', model: '', effort: 'medium', maxTokens: 4096, refusalFallback: true,
  maskPii: true, logPrompts: true, features: Object.fromEntries(AI_FEATURES.map(([k]) => [k, true])), baseUrl: '',
};

function stored() { return { ...DEFAULTS, ...orgSetting('ai', {}) }; }

// Effective runtime config (with decrypted key, falling back to environment variables).
export function aiConfig() {
  const c = stored();
  const provider = PROVIDERS[c.provider] ? c.provider : 'anthropic';
  const meta = PROVIDERS[provider];
  const apiKey = decrypt(c.apiKeys?.[provider]) || process.env[meta.keyEnv] || null;
  return { ...c, provider, model: c.model || meta.defaultModel, apiKey, keySource: c.apiKeys?.[provider] ? 'setup' : process.env[meta.keyEnv] ? 'environment' : null };
}

// Safe view for clients (never includes keys).
export function publicConfig() {
  const c = aiConfig();
  const keys = stored().apiKeys || {};
  return {
    enabled: c.enabled, provider: c.provider, model: c.model, effort: c.effort, maxTokens: c.maxTokens, refusalFallback: c.refusalFallback,
    maskPii: c.maskPii, logPrompts: c.logPrompts, features: c.features, baseUrl: c.baseUrl,
    configured: !!c.apiKey || c.provider === 'mock', keySource: c.keySource,
    keyHints: Object.fromEntries(Object.keys(PROVIDERS).map((p) => {
      const k = decrypt(keys[p]);
      return [p, k ? `••••${k.slice(-4)}` : process.env[PROVIDERS[p].keyEnv] ? 'from environment' : null];
    })),
    providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { label: v.label, defaultModel: v.defaultModel, suggestedModels: v.suggestedModels, keyHelp: v.keyHelp }])),
    featureList: AI_FEATURES,
  };
}

export function saveConfig(patch, userId) {
  const cur = stored();
  const next = { ...cur };
  for (const k of ['enabled', 'provider', 'model', 'effort', 'maxTokens', 'refusalFallback', 'maskPii', 'logPrompts', 'features', 'baseUrl']) {
    if (k in patch) next[k] = patch[k];
  }
  if (next.provider && !PROVIDERS[next.provider]) throw new HttpError(400, 'Unknown provider');
  if (next.maxTokens) next.maxTokens = Math.max(256, Math.min(64000, Number(next.maxTokens) || 4096));
  if (next.effort && !['low', 'medium', 'high', 'xhigh', 'max'].includes(next.effort)) throw new HttpError(400, 'Invalid effort');
  next.apiKeys = { ...(cur.apiKeys || {}) };
  if (patch.apiKey !== undefined) {
    const p = patch.keyProvider || next.provider;
    if (patch.apiKey) next.apiKeys[p] = encrypt(String(patch.apiKey).trim());
    else delete next.apiKeys[p];
  }
  setOrgSetting('ai', next);
  audit(userId, 'AI Settings', 'Changed AI settings', [patch.provider && `provider=${patch.provider}`, patch.model && `model=${patch.model}`,
    patch.apiKey !== undefined && (patch.apiKey ? 'API key updated' : 'API key removed'), 'enabled' in patch && `enabled=${patch.enabled}`].filter(Boolean).join(', '));
  return publicConfig();
}

export function aiStatus(ctx) {
  const c = aiConfig();
  return {
    enabled: c.enabled && (!!c.apiKey || c.provider === 'mock'), configured: !!c.apiKey || c.provider === 'mock',
    provider: c.provider, providerLabel: PROVIDERS[c.provider]?.label, model: c.model,
    features: c.features, canUse: hasPerm(ctx, 'UseAI'), canManage: hasPerm(ctx, 'CustomizeApplication'),
  };
}

export function requireAI(ctx, feature) {
  const c = aiConfig();
  if (!c.enabled) throw new HttpError(400, 'AI is turned off. An administrator can turn it on in Setup → AI Settings.');
  if (!c.apiKey && c.provider !== 'mock') throw new HttpError(400, 'No AI provider API key configured. An administrator can add one in Setup → AI Settings.');
  if (feature && c.features?.[feature] === false) throw new HttpError(400, `This AI feature (${feature}) is turned off in Setup → AI Settings.`);
  if (!ctx.isSystem && !hasPerm(ctx, 'UseAI')) throw new HttpError(403, 'You do not have the "Use AI Features" permission.');
  return c;
}

// ---------- trust layer: PII masking ----------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<![\w-])\+?\d[\d\s().-]{7,}\d(?![\w-])/g;

export function createMasker(enabled) {
  const forward = new Map();
  const back = new Map();
  let n = 0;
  const token = (kind, v) => {
    if (!forward.has(v)) { n++; const t = `[${kind}_${n}]`; forward.set(v, t); back.set(t, v); }
    return forward.get(v);
  };
  return {
    mask(text) {
      if (!enabled || text == null) return text;
      return String(text).replace(EMAIL_RE, (m) => token('EMAIL', m)).replace(PHONE_RE, (m) => (m.replace(/\D/g, '').length >= 7 ? token('PHONE', m) : m));
    },
    unmask(text) {
      if (!enabled || text == null || !back.size) return text;
      return String(text).replace(/\[(EMAIL|PHONE)_\d+\]/g, (t) => back.get(t) ?? t);
    },
    unmaskDeep(v) {
      if (!enabled || !back.size) return v;
      if (typeof v === 'string') return this.unmask(v);
      if (Array.isArray(v)) return v.map((x) => this.unmaskDeep(x));
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.unmaskDeep(x)]));
      return v;
    },
    get count() { return forward.size; },
  };
}

function maskMessages(masker, messages) {
  return messages.map((m) => {
    if (m.role === 'user') return { ...m, content: masker.mask(m.content) };
    if (m.role === 'tool') return { ...m, results: m.results.map((r) => ({ ...r, output: masker.mask(r.output) })) };
    return m;
  });
}

// ---------- generate ----------
// opts: { feature, recordId, system, prompt | messages, tools, json, maxTokens, masker }
export async function generate(ctx, opts) {
  const cfg = requireAI(ctx, opts.feature);
  const masker = opts.masker || createMasker(cfg.maskPii);
  const messages = opts.messages || [{ role: 'user', content: opts.prompt }];
  const started = Date.now();
  const system = opts.system ? masker.mask(opts.system) : undefined;
  const sent = maskMessages(masker, messages);
  let res, error;
  try {
    res = await chat(cfg, { system, messages: sent, tools: opts.tools, json: opts.json, maxTokens: opts.maxTokens || cfg.maxTokens });
  } catch (e) {
    error = e;
  }
  const lastUser = [...sent].reverse().find((m) => m.role === 'user' || m.role === 'tool');
  run(`INSERT INTO ai_log(at, user_id, feature, provider, model, record_id, status, error, latency_ms, input_tokens, output_tokens, masked, prompt, response)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, nowIso(), ctx.user?.Id || null, opts.feature || 'other', cfg.provider, cfg.model, opts.recordId || null,
    error ? 'Error' : res.refused ? 'Refused' : 'Success', error ? error.message : null, Date.now() - started, res?.usage?.input || 0, res?.usage?.output || 0, masker.count,
    cfg.logPrompts ? String((system ? `SYSTEM:\n${system}\n\n` : '') + (lastUser?.role === 'tool' ? `TOOL RESULTS:\n${lastUser.results.map((r) => r.output).join('\n')}` : lastUser?.content || '')).slice(0, 20000) : null,
    cfg.logPrompts && res ? String(res.text || (res.toolCalls?.length ? `TOOL CALLS: ${JSON.stringify(res.toolCalls)}` : '')).slice(0, 20000) : null);
  if (error) throw error;
  return { ...res, text: masker.unmask(res.text), toolCalls: (res.toolCalls || []).map((tc) => ({ ...tc, input: masker.unmaskDeep(tc.input) })), masker };
}

// Parse a JSON object from model output (tolerates code fences / surrounding prose).
export function parseJson(text) {
  const s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch { /* fall through */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* ignore */ } }
  throw new HttpError(502, 'The AI response was not valid JSON. Try again.');
}

export async function testConnection(ctx) {
  const cfg = aiConfig();
  if (!cfg.apiKey && cfg.provider !== 'mock') throw new HttpError(400, 'Save an API key first.');
  const started = Date.now();
  const res = await chat(cfg, { messages: [{ role: 'user', content: 'Reply with exactly: Slavy AI connection OK' }], maxTokens: 512 });
  run(`INSERT INTO ai_log(at, user_id, feature, provider, model, status, latency_ms, input_tokens, output_tokens, masked, prompt, response) VALUES (?, ?, 'test', ?, ?, 'Success', ?, ?, ?, 0, ?, ?)`,
    nowIso(), ctx.user.Id, cfg.provider, cfg.model, Date.now() - started, res.usage.input, res.usage.output, 'Connection test', res.text);
  return { ok: true, reply: res.text, model: res.servedBy || cfg.model, latencyMs: Date.now() - started };
}

export async function availableModels(provider, apiKey) {
  const cfg = aiConfig();
  const p = provider || cfg.provider;
  const key = apiKey || decrypt(stored().apiKeys?.[p]) || process.env[PROVIDERS[p]?.keyEnv];
  if (!key && p !== 'mock') throw new HttpError(400, 'Enter an API key to load models.');
  return listModels({ ...cfg, provider: p, apiKey: key });
}

export function aiLog({ limit = 300 } = {}) {
  return all('SELECT * FROM ai_log ORDER BY id DESC LIMIT ?', limit);
}

export function aiUsageSummary() {
  return all(`SELECT feature, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
    SUM(CASE WHEN status = 'Error' THEN 1 ELSE 0 END) AS errors, CAST(AVG(latency_ms) AS INTEGER) AS avg_ms
    FROM ai_log WHERE at >= ? GROUP BY feature ORDER BY calls DESC`, new Date(Date.now() - 30 * 86400000).toISOString());
}
