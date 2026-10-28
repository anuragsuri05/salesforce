// AI API: settings (admin), agent, generative features, prompt templates, scoring, insights, audit log.
import { listMeta, getMeta, getObject } from '../metadata.js';
import { requirePerm, hasPerm } from '../security.js';
import { getRecord, nameOf } from '../records.js';
import { HttpError } from '../util.js';
import { aiStatus, publicConfig, saveConfig, testConnection, availableModels, aiLog, aiUsageSummary, requireAI } from '../ai/service.js';
import {
  summarizeRecord, draftEmail, suggestFields, runPromptTemplate, generateFormula, generateSoql, agentTurn, agentConfig, saveAgentConfig, AGENT_TOOLS,
} from '../ai/features.js';
import { scoreRecord, modelStats, topScored } from '../ai/scoring.js';
import { insightsFor, myInsights } from '../ai/insights.js';
import { all } from '../db.js';

export function registerAI(r) {
  // ---------- status (every user) ----------
  r.get('/api/ai/status', ({ ctx }) => ({ ...aiStatus(ctx), agent: { name: agentConfig().name, welcome: agentConfig().welcome, suggestions: agentConfig().suggestions } }));

  // ---------- admin settings ----------
  r.get('/api/setup/ai', ({ ctx }) => { requirePerm(ctx, 'ViewSetup', 'CustomizeApplication'); return { ...publicConfig(), usage: aiUsageSummary() }; });
  r.put('/api/setup/ai', ({ ctx, body }) => { requirePerm(ctx, 'CustomizeApplication'); return saveConfig(body, ctx.user.Id); });
  r.post('/api/setup/ai/test', async ({ ctx }) => { requirePerm(ctx, 'CustomizeApplication'); return testConnection(ctx); });
  r.post('/api/setup/ai/models', async ({ ctx, body }) => { requirePerm(ctx, 'CustomizeApplication'); return availableModels(body.provider, body.apiKey); });
  r.get('/api/setup/ai/agent', ({ ctx }) => { requirePerm(ctx, 'ViewSetup', 'CustomizeApplication'); return { ...agentConfig(), availableTools: AGENT_TOOLS.map(({ name, label, description, mutating }) => ({ name, label, description, mutating })) }; });
  r.put('/api/setup/ai/agent', ({ ctx, body }) => { requirePerm(ctx, 'CustomizeApplication'); return saveAgentConfig(body); });
  r.get('/api/setup/ai/log', ({ ctx }) => {
    requirePerm(ctx, 'ViewSetup', 'CustomizeApplication');
    const c = { cache: new Map() };
    return aiLog().map((l) => ({ ...l, user: nameOf(c, l.user_id), recordName: l.record_id ? nameOf(c, l.record_id) : null }));
  });
  r.get('/api/setup/ai/jobs', ({ ctx }) => {
    requirePerm(ctx, 'ViewSetup', 'CustomizeApplication');
    return all('SELECT * FROM ai_jobs ORDER BY id DESC LIMIT 200').map((j) => ({ ...j, payload: JSON.parse(j.payload || '{}') }));
  });

  // ---------- agent ----------
  r.post('/api/ai/agent', async ({ ctx, body }) => agentTurn(ctx, { messages: body.messages, recordId: body.recordId || null, decision: body.decision || null }));

  // ---------- generative record features ----------
  r.post('/api/ai/summarize/:id', async ({ ctx, params }) => summarizeRecord(ctx, params.id));
  r.post('/api/ai/draft-email/:id', async ({ ctx, params, body }) => draftEmail(ctx, params.id, body));
  r.post('/api/ai/suggest/:id', async ({ ctx, params, body }) => suggestFields(ctx, params.id, body));
  r.post('/api/ai/formula', async ({ ctx, body }) => generateFormula(ctx, body));
  r.post('/api/ai/soql', async ({ ctx, body }) => generateSoql(ctx, body));

  // ---------- prompt templates ----------
  r.get('/api/ai/prompts', ({ ctx, query }) => {
    const list = listMeta('promptTemplate').filter((t) => t.active !== false && (!query.object || t.object === query.object));
    return list.map(({ id, label, description, object, templateType, outputField }) => ({ id, label, description, object, templateType, outputField, canSave: !!outputField }));
  });
  r.post('/api/ai/prompts/:id/run', async ({ ctx, params, body }) => runPromptTemplate(ctx, params.id, body.recordId, { save: !!body.save }));
  r.post('/api/ai/prompts/preview', async ({ ctx, body }) => {
    requirePerm(ctx, 'CustomizeApplication');
    if (!getObject(body.object)) throw new HttpError(400, 'Choose an object');
    return runPromptTemplate(ctx, null, body.recordId, { template: { object: body.object, instructions: body.instructions, templateType: body.templateType } });
  });

  // ---------- scoring & insights (no LLM) ----------
  r.get('/api/ai/score/:id', ({ ctx, params }) => scoreRecord(ctx, params.id));
  r.get('/api/ai/scoring', ({ ctx }) => modelStats());
  r.post('/api/ai/scoring/retrain', ({ ctx }) => { requirePerm(ctx, 'CustomizeApplication'); return modelStats({ retrain: true }); });
  r.get('/api/ai/insights/:id', ({ ctx, params }) => insightsFor(ctx, params.id));
  r.get('/api/ai/home', ({ ctx }) => ({
    insights: myInsights(ctx),
    topLeads: topScored(ctx, 'Lead'),
    topOpportunities: topScored(ctx, 'Opportunity'),
    status: aiStatus(ctx),
  }));
}

export { requireAI, hasPerm, getRecord, getMeta };
