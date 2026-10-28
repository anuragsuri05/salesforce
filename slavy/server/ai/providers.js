// Multi-provider LLM adapter (raw HTTPS, no SDKs — Slavy has zero dependencies).
//
// Canonical conversation format used everywhere in Slavy:
//   { role: 'user', content: string }
//   { role: 'assistant', content: string, toolCalls?: [{ id, name, input }], raw?: { provider, ... } }
//   { role: 'tool', results: [{ id, name, output: string, isError?: boolean }] }
// Assistant turns keep the provider's raw content (`raw`) and replay it unchanged on the same provider:
// Claude thinking blocks and Gemini thought signatures must be passed back as-is during tool loops.
//
// Tools: [{ name, description, parameters: <JSON Schema object> }]

import { HttpError } from '../util.js';

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude', keyEnv: 'ANTHROPIC_API_KEY', defaultModel: 'claude-opus-5-5',
    suggestedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
    keyHelp: 'Create a key at console.anthropic.com → API Keys.',
  },
  openai: {
    label: 'OpenAI (ChatGPT)', keyEnv: 'OPENAI_API_KEY', defaultModel: 'gpt-5',
    suggestedModels: ['gpt-5', 'gpt-5-mini'],
    keyHelp: 'Create a key at platform.openai.com → API keys. Use "Load models" to see the models your key can use.',
  },
  gemini: {
    label: 'Google Gemini', keyEnv: 'GEMINI_API_KEY', defaultModel: 'gemini-2.5-flash',
    suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    keyHelp: 'Create a key at aistudio.google.com → Get API key. Use "Load models" to see the models your key can use.',
  },
};
if (process.env.SLAVY_AI_MOCK) PROVIDERS.mock = { label: 'Mock (tests)', keyEnv: 'NONE', defaultModel: 'mock-1', suggestedModels: ['mock-1'], keyHelp: '' };

// Claude models that accept the server-side refusal fallback ("default" routing).
const CLAUDE_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const TIMEOUT_MS = 180000;

async function postJson(url, headers, body, provider) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new HttpError(502, `Could not reach ${PROVIDERS[provider].label}: ${e.name === 'TimeoutError' ? 'request timed out' : e.message}`);
  }
  return readResponse(res, provider);
}

async function getJson(url, headers, provider) {
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  } catch (e) {
    throw new HttpError(502, `Could not reach ${PROVIDERS[provider].label}: ${e.message}`);
  }
  return readResponse(res, provider);
}

async function readResponse(res, provider) {
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error?.status || data?.message || data?.raw || res.statusText;
    const hint = res.status === 401 || res.status === 403 ? ' (check the API key in Setup → AI Settings)'
      : res.status === 404 ? ' (check the model name in Setup → AI Settings)'
        : res.status === 429 ? ' (rate limit or quota exceeded — try again shortly)' : '';
    throw new HttpError(res.status === 429 ? 429 : 502, `${PROVIDERS[provider].label} error ${res.status}: ${String(msg).slice(0, 400)}${hint}`);
  }
  return data;
}

// ---------- Anthropic (Messages API) ----------
async function anthropicChat(cfg, { system, messages, tools, maxTokens }) {
  const msgs = [];
  for (const m of messages) {
    if (m.role === 'user') msgs.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      if (m.raw?.provider === 'anthropic') msgs.push({ role: 'assistant', content: m.raw.content });
      else {
        const content = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const tc of m.toolCalls || []) content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input || {} });
        msgs.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: '(no content)' }] });
      }
    } else if (m.role === 'tool') {
      msgs.push({ role: 'user', content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.output, ...(r.isError ? { is_error: true } : {}) })) });
    }
  }
  const body = { model: cfg.model, max_tokens: maxTokens || 16000, messages: msgs };
  if (system) body.system = system;
  if (tools?.length) body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  if (cfg.effort) body.output_config = { effort: cfg.effort };
  const headers = { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' };
  if (CLAUDE_FALLBACK_MODELS.has(cfg.model) && cfg.refusalFallback !== false) {
    // Server-side refusal fallback: if the model declines, the API re-runs the request on a fallback model.
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }
  const data = await postJson('https://api.anthropic.com/v1/messages', headers, body, 'anthropic');
  const content = data.content || [];
  const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const toolCalls = content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input || {} }));
  return {
    text: data.stop_reason === 'refusal' && !text ? 'The model declined to answer this request.' : text,
    toolCalls, stopReason: data.stop_reason, refused: data.stop_reason === 'refusal',
    raw: { provider: 'anthropic', content },
    usage: { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 },
    servedBy: data.model,
  };
}

// ---------- OpenAI (Chat Completions API) ----------
async function openaiChat(cfg, { system, messages, tools, maxTokens, json }) {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'user') msgs.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      const out = { role: 'assistant', content: m.content || null };
      if (m.toolCalls?.length) out.tool_calls = m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input || {}) } }));
      msgs.push(out);
    } else if (m.role === 'tool') {
      for (const r of m.results) msgs.push({ role: 'tool', tool_call_id: r.id, content: r.output });
    }
  }
  const body = { model: cfg.model, messages: msgs, max_completion_tokens: maxTokens || 16000 };
  if (tools?.length) body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  if (json && !tools?.length) body.response_format = { type: 'json_object' };
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const data = await postJson(`${base}/chat/completions`, { authorization: `Bearer ${cfg.apiKey}` }, body, 'openai');
  const choice = data.choices?.[0] || {};
  const msg = choice.message || {};
  const toolCalls = (msg.tool_calls || []).map((tc) => {
    let input = {};
    try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { input = { _invalid: tc.function?.arguments }; }
    return { id: tc.id, name: tc.function?.name, input };
  });
  return {
    text: msg.content || (msg.refusal ? `The model declined: ${msg.refusal}` : ''), toolCalls,
    stopReason: choice.finish_reason, refused: !!msg.refusal,
    raw: { provider: 'openai' },
    usage: { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0 },
    servedBy: data.model,
  };
}

// ---------- Google Gemini (generateContent API) ----------
function geminiSchema(s) {
  if (!s || typeof s !== 'object') return s;
  const out = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, geminiSchema(v)]));
  if (s.required?.length) out.required = s.required;
  if (s.items) out.items = geminiSchema(s.items);
  return out;
}

async function geminiChat(cfg, { system, messages, tools, maxTokens, json }) {
  const contents = [];
  for (const m of messages) {
    if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: m.content }] });
    else if (m.role === 'assistant') {
      if (m.raw?.provider === 'gemini' && m.raw.parts?.length) contents.push({ role: 'model', parts: m.raw.parts });
      else {
        const parts = [];
        if (m.content) parts.push({ text: m.content });
        for (const tc of m.toolCalls || []) parts.push({ functionCall: { name: tc.name, args: tc.input || {} } });
        contents.push({ role: 'model', parts: parts.length ? parts : [{ text: '(no content)' }] });
      }
    } else if (m.role === 'tool') {
      contents.push({ role: 'user', parts: m.results.map((r) => ({ functionResponse: { name: r.name, response: { result: r.output } } })) });
    }
  }
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens || 16000 } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools?.length) body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) })) }];
  if (json && !tools?.length) body.generationConfig.responseMimeType = 'application/json';
  const model = String(cfg.model).replace(/^models\//, '');
  const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': cfg.apiKey }, body, 'gemini');
  if (data.promptFeedback?.blockReason) {
    return { text: `The model blocked this request (${data.promptFeedback.blockReason}).`, toolCalls: [], refused: true, raw: { provider: 'gemini', parts: [] }, usage: { input: 0, output: 0 } };
  }
  const cand = data.candidates?.[0] || {};
  const parts = cand.content?.parts || [];
  const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  const toolCalls = parts.filter((p) => p.functionCall).map((p, i) => ({ id: p.functionCall.id || `call_${Date.now()}_${i}`, name: p.functionCall.name, input: p.functionCall.args || {} }));
  return {
    text, toolCalls, stopReason: cand.finishReason, refused: cand.finishReason === 'SAFETY',
    raw: { provider: 'gemini', parts },
    usage: { input: data.usageMetadata?.promptTokenCount || 0, output: data.usageMetadata?.candidatesTokenCount || 0 },
    servedBy: model,
  };
}

// ---------- Mock (deterministic, for automated tests only) ----------
async function mockChat(cfg, { messages, tools, json }) {
  const last = messages[messages.length - 1];
  if (last.role === 'tool') {
    return { text: `Done. Tool results: ${last.results.map((r) => `${r.name} → ${r.output.slice(0, 200)}`).join(' | ')}`, toolCalls: [], raw: { provider: 'mock' }, usage: { input: 10, output: 10 } };
  }
  const prompt = String(last.content || '');
  const m = /^TOOL (\w+) (\{.*\})$/s.exec(prompt.trim());
  if (m && tools?.some((t) => t.name === m[1])) {
    return { text: '', toolCalls: [{ id: `mock_${Date.now()}`, name: m[1], input: JSON.parse(m[2]) }], raw: { provider: 'mock' }, usage: { input: 10, output: 5 } };
  }
  if (json) return { text: JSON.stringify({ mock: true, echo: prompt.slice(0, 200) }), toolCalls: [], raw: { provider: 'mock' }, usage: { input: 10, output: 10 } };
  return { text: `MOCK RESPONSE: ${prompt.slice(0, 4000)}`, toolCalls: [], raw: { provider: 'mock' }, usage: { input: prompt.length, output: 20 } };
}

const CHAT = { anthropic: anthropicChat, openai: openaiChat, gemini: geminiChat, mock: mockChat };

export async function chat(cfg, request) {
  const fn = CHAT[cfg.provider];
  if (!fn) throw new HttpError(400, `Unknown AI provider "${cfg.provider}"`);
  if (!cfg.apiKey && cfg.provider !== 'mock') throw new HttpError(400, 'No API key configured. An administrator can add one in Setup → AI Settings.');
  return fn(cfg, request);
}

export async function listModels(cfg) {
  switch (cfg.provider) {
    case 'anthropic': {
      const d = await getJson('https://api.anthropic.com/v1/models?limit=100', { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }, 'anthropic');
      return (d.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id }));
    }
    case 'openai': {
      const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      const d = await getJson(`${base}/models`, { authorization: `Bearer ${cfg.apiKey}` }, 'openai');
      return (d.data || []).map((m) => m.id).filter((id) => /^(gpt|o\d|chatgpt)/i.test(id) && !/audio|realtime|transcribe|tts|image|search|embedding/i.test(id)).sort().reverse().map((id) => ({ id, label: id }));
    }
    case 'gemini': {
      const d = await getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': cfg.apiKey }, 'gemini');
      return (d.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
    }
    case 'mock': return [{ id: 'mock-1', label: 'Mock model' }];
  }
  throw new HttpError(400, 'Unknown provider');
}
