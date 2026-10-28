// AI layer tests using the deterministic mock provider (no network, no API key).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.SLAVY_DB = ':memory:';
process.env.SLAVY_AI_MOCK = '1';
process.env.SLAVY_SECRET = 'test-secret';
const { createApp } = await import('../server/index.js');
const { seed } = await import('../server/seed.js');
const { processJobs } = await import('../server/ai/features.js');
const { get } = await import('../server/db.js');

let server, base;
before(async () => {
  seed();
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function session(username) {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'slavy123' }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'slavy' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), put: (p, b) => call('PUT', p, b) };
}

test('AI is off until configured; keys are encrypted and never returned', async () => {
  const a = await session('admin@slavy.dev');
  assert.equal((await a.get('/api/ai/status')).data.enabled, false);
  const acc = (await a.get('/api/records/Account?view=all&limit=1')).data.records[0];
  assert.equal((await a.post(`/api/ai/summarize/${acc.Id}`)).status, 400);
  const saved = await a.put('/api/setup/ai', { provider: 'anthropic', apiKey: 'sk-ant-supersecret-1234' });
  assert.equal(saved.data.keyHints.anthropic, '••••1234');
  assert.ok(!JSON.stringify(saved.data).includes('supersecret'));
  assert.ok(!get("SELECT value FROM org WHERE key = 'ai'").value.includes('supersecret'));
  const on = await a.put('/api/setup/ai', { enabled: true, provider: 'mock', model: 'mock-1' });
  assert.equal(on.status, 200);
  assert.equal((await a.get('/api/ai/status')).data.enabled, true);
  const t = await a.post('/api/setup/ai/test');
  assert.equal(t.data.ok, true);
});

test('record summary goes through the trust layer (PII masked in prompt and log)', async () => {
  const a = await session('admin@slavy.dev');
  const c = (await a.post('/api/records/Contact', { FirstName: 'Pia', LastName: 'Masked', Email: 'pia.masked@example.com', Phone: '+1 415 555 0199' })).data;
  const res = await a.post(`/api/ai/summarize/${c.Id}`);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  // The mock echoes its prompt: the model never saw the raw email, but the user sees it restored.
  assert.ok(res.data.summary.includes('pia.masked@example.com'));
  const log = (await a.get('/api/setup/ai/log')).data.find((l) => l.record_id === c.Id);
  assert.ok(log.prompt.includes('[EMAIL_'));
  assert.ok(!log.prompt.includes('pia.masked@example.com'));
  assert.ok(log.masked >= 2);
});

test('users without "Use AI Features" are blocked', async () => {
  const v = await session('viewer@slavy.dev');
  const acc = (await v.get('/api/records/Account?view=all&limit=1')).data.records[0];
  const res = await v.post(`/api/ai/summarize/${acc.Id}`);
  assert.equal(res.status, 403);
});

test('agent runs read tools directly and asks before changing data', async () => {
  const a = await session('admin@slavy.dev');
  const r1 = await a.post('/api/ai/agent', { messages: [{ role: 'user', content: 'TOOL search_records {"query":"Acme"}' }] });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.ok(r1.data.steps.some((s) => s.tool === 'search_records' && s.ok));
  assert.match(r1.data.reply, /Acme/);
  const r2 = await a.post('/api/ai/agent', { messages: [{ role: 'user', content: 'TOOL create_task {"subject":"Agent follow-up","priority":"High"}' }] });
  assert.ok(r2.data.pending?.length, 'mutating tool needs confirmation');
  assert.equal(r2.data.pending[0].title, 'Create task "Agent follow-up"');
  const before = (await a.post('/api/soql', { q: "SELECT COUNT() FROM Task WHERE Name = 'Agent follow-up'" })).data.totalSize;
  assert.equal(before, 0);
  const r3 = await a.post('/api/ai/agent', { messages: r2.data.messages, decision: 'approve' });
  assert.ok(r3.data.steps.some((s) => s.tool === 'create_task' && s.ok));
  const afterCount = (await a.post('/api/soql', { q: "SELECT COUNT() FROM Task WHERE Name = 'Agent follow-up'" })).data.totalSize;
  assert.equal(afterCount, 1);
  const r4 = await a.post('/api/ai/agent', { messages: [{ role: 'user', content: 'TOOL create_task {"subject":"Declined task"}' }] });
  const r5 = await a.post('/api/ai/agent', { messages: r4.data.messages, decision: 'reject' });
  assert.ok(r5.data.steps.some((s) => s.declined));
  assert.equal((await a.post('/api/soql', { q: "SELECT COUNT() FROM Task WHERE Name = 'Declined task'" })).data.totalSize, 0);
});

test('agent respects record security of the user', async () => {
  const agent = await session('support@slavy.dev');
  const r = await agent.post('/api/ai/agent', { messages: [{ role: 'user', content: 'TOOL query_records {"soql":"SELECT Name FROM Opportunity LIMIT 5"}' }] });
  assert.equal(r.status, 200);
  assert.ok(r.data.steps.some((s) => s.tool === 'query_records' && !s.ok), 'support agents cannot query opportunities');
});

test('prompt templates resolve merge fields; flow AI step fills a field asynchronously', async () => {
  const a = await session('admin@slavy.dev');
  const prompts = (await a.get('/api/ai/prompts?object=Account')).data;
  const briefing = prompts.find((p) => p.label === 'Account Briefing');
  const acc = (await a.get('/api/records/Account?view=all&limit=1')).data.records[0];
  const run = await a.post(`/api/ai/prompts/${briefing.id}/run`, { recordId: acc.Id, save: true });
  assert.equal(run.status, 200, JSON.stringify(run.data));
  assert.ok(run.data.resolvedPrompt.includes(acc.Name));
  assert.ok(!run.data.resolvedPrompt.includes('{!'));
  assert.equal(run.data.saved, true);
  assert.match((await a.get(`/api/record/${acc.Id}`)).data.AI_Briefing__c, /^MOCK RESPONSE/);

  const flow = await a.post('/api/setup/meta/flow', { label: 'AI brief new accounts', flowType: 'record', object: 'Account', trigger: 'create', timing: 'after', active: true,
    elements: [{ type: 'aiPrompt', templateId: briefing.id, outputField: 'AI_Briefing__c' }] });
  assert.equal(flow.status, 200, JSON.stringify(flow.data));
  const created = (await a.post('/api/records/Account', { Name: 'Flow AI Co' })).data;
  assert.equal(created.AI_Briefing__c, null);
  await processJobs();
  assert.match((await a.get(`/api/record/${created.Id}`)).data.AI_Briefing__c, /Flow AI Co/);
});

test('predictive scoring and insights work without an LLM', async () => {
  const a = await session('admin@slavy.dev');
  const lead = (await a.post('/api/soql', { q: "SELECT Id FROM Lead WHERE IsConverted = false AND Status != 'Closed - Not Converted' LIMIT 1" })).data.records[0];
  const s = await a.get(`/api/ai/score/${lead.Id}`);
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.ready, true);
  assert.ok(s.data.score >= 0 && s.data.score <= 100);
  const opp = (await a.post('/api/soql', { q: 'SELECT Id FROM Opportunity WHERE IsClosed = false LIMIT 1' })).data.records[0];
  assert.equal((await a.get(`/api/ai/score/${opp.Id}`)).data.ready, true);
  const stats = (await a.get('/api/ai/scoring')).data;
  assert.equal(stats.length, 2);
  const overdue = (await a.post('/api/records/Opportunity', { Name: 'Overdue deal', StageName: 'Qualification', CloseDate: '2020-01-01', Amount: 1000 })).data;
  const ins = (await a.get(`/api/ai/insights/${overdue.Id}`)).data;
  assert.ok(ins.some((i) => i.title === 'Close date has passed'));
  assert.equal((await a.get('/api/ai/home')).status, 200);
});
