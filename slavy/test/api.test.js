// End-to-end API tests against an in-memory database seeded with the demo org.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.SLAVY_DB = ':memory:';
const { createApp } = await import('../server/index.js');
const { seed } = await import('../server/seed.js');

let server, base;
before(async () => {
  seed();
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function session(username, password = 'slavy123') {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(res.status, 200, `login ${username}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const call = async (method, path, body) => {
    const r = await fetch(base + path, {
      method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'slavy' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
  };
  return {
    get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), patch: (p, b) => call('PATCH', p, b), put: (p, b) => call('PUT', p, b), del: (p) => call('DELETE', p),
  };
}

test('login rejects bad password and requires auth', async () => {
  const bad = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin@slavy.dev', password: 'nope' }) });
  assert.equal(bad.status, 401);
  const anon = await fetch(`${base}/api/session`);
  assert.equal(anon.status, 401);
});

test('session, metadata and list views', async () => {
  const a = await session('admin@slavy.dev');
  const s = await a.get('/api/session');
  assert.equal(s.data.user.Name, 'Alex Morgan');
  assert.equal(s.data.perms.system.ModifyAllData, true);
  const meta = await a.get('/api/meta');
  assert.ok(meta.data.objects.find((o) => o.apiName === 'Opportunity'));
  assert.ok(meta.data.apps.length >= 4);
  const views = await a.get('/api/listviews/Opportunity');
  const open = views.data.find((v) => v.name === 'Open Opportunities');
  const list = await a.get(`/api/records/Opportunity?view=${open.id}&limit=5`);
  assert.equal(list.status, 200);
  assert.ok(list.data.total > 10);
  assert.ok(list.data.records.every((r) => r.IsClosed === false));
});

test('CSRF header is required for cookie writes', async () => {
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin@slavy.dev', password: 'slavy123' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const r = await fetch(`${base}/api/records/Account`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{"Name":"X"}' });
  assert.equal(r.status, 403);
});

test('create, read, update, history, delete, restore', async () => {
  const a = await session('admin@slavy.dev');
  const created = await a.post('/api/records/Account', { Name: 'Test Co', Industry: 'Banking', Website: 'https://test.co' });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const id = created.data.Id;
  assert.match(id, /^001/);
  const upd = await a.patch(`/api/record/${id}`, { Industry: 'Finance' });
  assert.equal(upd.data.Industry, 'Finance');
  const hist = await a.get(`/api/record/${id}/history`);
  assert.ok(hist.data.some((h) => h.field === 'Industry' && h.oldValue === 'Banking' && h.newValue === 'Finance'));
  const bad = await a.patch(`/api/record/${id}`, { Website: 'test.co' });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /Website must start/);
  const badPick = await a.patch(`/api/record/${id}`, { Industry: 'Space Mining' });
  assert.equal(badPick.status, 400);
  assert.equal((await a.del(`/api/record/${id}`)).status, 200);
  assert.equal((await a.get(`/api/record/${id}`)).status, 404);
  const bin = await a.get('/api/recyclebin');
  assert.ok(bin.data.some((r) => r.Id === id));
  assert.equal((await a.post(`/api/recyclebin/${id}/restore`)).status, 200);
  assert.equal((await a.get(`/api/record/${id}`)).status, 200);
});

test('formula, roll-up, before-save flow, computed names', async () => {
  const a = await session('admin@slavy.dev');
  const acc = (await a.post('/api/records/Account', { Name: 'Rollup Co' })).data;
  const opp = (await a.post('/api/records/Opportunity', { Name: 'Rollup Deal', AccountId: acc.Id, StageName: 'Proposal/Price Quote', CloseDate: '2030-01-01', Amount: 1000 })).data;
  assert.equal(opp.Probability, 75);
  assert.equal(opp.ForecastCategoryName, 'Best Case');
  assert.equal(opp.ExpectedRevenue, 750);
  const prod = (await a.get('/api/records/Product2?limit=1')).data.records[0];
  const li = await a.post('/api/records/OpportunityLineItem', { OpportunityId: opp.Id, Product2Id: prod.Id, Quantity: 2, Discount: 10 });
  assert.equal(li.status, 200, JSON.stringify(li.data));
  assert.equal(li.data.UnitPrice, prod.ListPrice); // copied by flow
  assert.equal(li.data.TotalPrice, Math.round(prod.ListPrice * 2 * 0.9 * 100) / 100);
  const opp2 = (await a.get(`/api/record/${opp.Id}`)).data;
  assert.equal(opp2.LineItemTotal__c, li.data.TotalPrice);
  const acc2 = (await a.get(`/api/record/${acc.Id}`)).data;
  assert.equal(acc2.OpenPipeline__c, 1000);
  const c = (await a.post('/api/records/Contact', { FirstName: 'Ada', LastName: 'Lovelace', AccountId: acc.Id })).data;
  assert.equal(c.Name, 'Ada Lovelace');
  assert.equal((await a.get(`/api/record/${acc.Id}`)).data.NumberOfContacts__c, 1);
});

test('record-level security: OWD private, role hierarchy, sharing rules, FLS', async () => {
  const admin = await session('admin@slavy.dev');
  const rep1 = await session('rep1@slavy.dev');
  const agent = await session('support@slavy.dev');
  const mgr = await session('sales.mgr@slavy.dev');
  const users = (await admin.get('/api/setup/users')).data;
  const rep1Id = users.find((u) => u.Username === 'rep1@slavy.dev').Id;
  const vpId = users.find((u) => u.Username === 'vp.sales@slavy.dev').Id;
  // An opportunity owned by the VP is invisible to rep1 (Private OWD, VP is above rep in the hierarchy).
  const vpOpp = (await admin.post('/api/records/Opportunity', { Name: 'VP Secret Deal', StageName: 'Prospecting', CloseDate: '2030-01-01', OwnerId: vpId })).data;
  assert.equal((await rep1.get(`/api/record/${vpOpp.Id}`)).status, 404);
  // Rep1's own opportunity is visible to their manager via the role hierarchy (full access).
  const repOpp = (await rep1.post('/api/records/Opportunity', { Name: 'Rep Deal', StageName: 'Prospecting', CloseDate: '2030-01-01' })).data;
  const seen = await mgr.get(`/api/record/${repOpp.Id}`);
  assert.equal(seen.status, 200);
  assert.equal(seen.data._access, 'all');
  // Support agents have no Opportunity access at all.
  assert.equal((await agent.get(`/api/record/${repOpp.Id}`)).status, 403);
  // FLS: support profile cannot see AnnualRevenue on Account.
  const accs = (await agent.get('/api/records/Account?limit=3')).data.records;
  assert.ok(accs.length > 0);
  assert.ok(!('AnnualRevenue' in accs[0]));
  // OWD for Account is Public Read Only: the agent can read but not edit someone else's account.
  assert.equal((await agent.patch(`/api/record/${accs[0].Id}`, { Phone: '1' })).status, 403);
  // Once the agent owns it, record access allows edits but FLS still blocks the hidden field.
  const agentId = users.find((u) => u.Username === 'support@slavy.dev').Id;
  assert.equal((await admin.patch(`/api/record/${accs[0].Id}`, { OwnerId: agentId })).status, 200);
  assert.equal((await agent.patch(`/api/record/${accs[0].Id}`, { Phone: '1' })).status, 200);
  const editBlocked = await agent.patch(`/api/record/${accs[0].Id}`, { AnnualRevenue: 5 });
  assert.equal(editBlocked.status, 400);
  assert.match(editBlocked.data.error, /permission to edit this field/);
  // Manual sharing grants access.
  const share = await admin.post(`/api/record/${vpOpp.Id}/shares`, { granteeId: rep1Id, access: 'read' });
  assert.equal(share.status, 200);
  const nowSeen = await rep1.get(`/api/record/${vpOpp.Id}`);
  assert.equal(nowSeen.status, 200);
  assert.equal(nowSeen.data._access, 'read');
  assert.equal((await rep1.patch(`/api/record/${vpOpp.Id}`, { NextStep: 'x' })).status, 403);
});

test('approval process locks record and applies field updates', async () => {
  const rep1 = await session('rep1@slavy.dev');
  const mgr = await session('sales.mgr@slavy.dev');
  const opp = (await rep1.post('/api/records/Opportunity', { Name: 'Big Deal', StageName: 'Negotiation/Review', CloseDate: '2030-01-01', Amount: 250000 })).data;
  const blocked = await rep1.patch(`/api/record/${opp.Id}`, { StageName: 'Closed Won' });
  assert.equal(blocked.status, 400);
  assert.match(blocked.data.error, /must be approved/);
  const sub = await rep1.post(`/api/record/${opp.Id}/approvals`, { comments: 'Please approve' });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal((await rep1.get(`/api/record/${opp.Id}`)).data.Approval_Status__c, 'Pending');
  assert.equal((await rep1.patch(`/api/record/${opp.Id}`, { NextStep: 'x' })).status, 403); // locked
  const pending = (await mgr.get('/api/approvals')).data;
  const item = pending.find((p) => p.recordId === opp.Id);
  assert.ok(item?.canAct);
  assert.equal((await mgr.post(`/api/approvals/${item.id}/approve`, { comments: 'OK' })).status, 200);
  assert.equal((await rep1.get(`/api/record/${opp.Id}`)).data.Approval_Status__c, 'Approved');
  const won = await rep1.patch(`/api/record/${opp.Id}`, { StageName: 'Closed Won' });
  assert.equal(won.status, 200, JSON.stringify(won.data));
  const feed = (await rep1.get(`/api/feed?parent=${opp.Id}`)).data;
  assert.ok(feed.some((f) => f.body.includes('Closed Won'))); // after-save flow post
});

test('lead conversion creates account, contact and opportunity', async () => {
  const rep1 = await session('rep1@slavy.dev');
  const lead = (await rep1.post('/api/records/Lead', { FirstName: 'Grace', LastName: 'Hopper', Company: 'Navy Labs', Email: 'grace@navy.io', Status: 'Working - Contacted' })).data;
  assert.equal(lead.Name, 'Grace Hopper');
  const conv = await rep1.post(`/api/record/${lead.Id}/convert`, { opportunityName: 'Navy Labs - Pilot' });
  assert.equal(conv.status, 200, JSON.stringify(conv.data));
  const acc = (await rep1.get(`/api/record/${conv.data.accountId}`)).data;
  assert.equal(acc.Name, 'Navy Labs');
  const con = (await rep1.get(`/api/record/${conv.data.contactId}`)).data;
  assert.equal(con.Email, 'grace@navy.io');
  assert.equal(con.AccountId, acc.Id);
  const l2 = (await rep1.get(`/api/record/${lead.Id}`)).data;
  assert.equal(l2.IsConverted, true);
  assert.equal(l2.Status, 'Closed - Converted');
});

test('SOQL: relationships, subqueries, aggregates, date literals', async () => {
  const a = await session('admin@slavy.dev');
  const q1 = await a.post('/api/soql', { q: "SELECT Name, Amount, Account.Name, Owner.Name FROM Opportunity WHERE StageName = 'Closed Won' AND Amount > 1000 ORDER BY Amount DESC LIMIT 3" });
  assert.equal(q1.status, 200, JSON.stringify(q1.data));
  assert.equal(q1.data.records.length, 3);
  assert.ok(q1.data.records[0].Amount >= q1.data.records[1].Amount);
  assert.ok(q1.data.records[0].Owner.Name);
  const q2 = await a.post('/api/soql', { q: 'SELECT Name, (SELECT Name, Email FROM Contacts) FROM Account LIMIT 2' });
  assert.equal(q2.status, 200, JSON.stringify(q2.data));
  assert.ok('Contacts' in q2.data.records[0]);
  const q3 = await a.post('/api/soql', { q: 'SELECT StageName, COUNT(Id) cnt, SUM(Amount) total FROM Opportunity GROUP BY StageName ORDER BY StageName' });
  assert.ok(q3.data.records.length >= 5);
  assert.ok(q3.data.records.every((r) => typeof r.cnt === 'number'));
  const q4 = await a.post('/api/soql', { q: 'SELECT COUNT() FROM Case WHERE CreatedDate = LAST_N_DAYS:365' });
  assert.ok(q4.data.totalSize > 0);
  const q5 = await a.post('/api/soql', { q: "SELECT Name FROM Lead WHERE Status IN ('Open - Not Contacted') AND Name LIKE '%a%'" });
  assert.equal(q5.status, 200);
  const bad = await a.post('/api/soql', { q: 'SELECT Nope FROM Account' });
  assert.equal(bad.status, 400);
  const rep = await session('rep1@slavy.dev');
  assert.equal((await rep.post('/api/soql', { q: 'SELECT Name FROM Account' })).status, 403); // no RunSoql permission
});

test('reports and dashboards', async () => {
  const a = await session('admin@slavy.dev');
  const reports = (await a.get('/api/reports')).data;
  const pipe = reports.find((r) => r.name === 'Pipeline by Stage');
  const run = (await a.get(`/api/reports/${pipe.id}/run`)).data;
  assert.ok(run.groups.length > 0);
  assert.ok(run.chart.labels.length === run.groups.length);
  assert.ok(run.grandTotals['SUM:Amount'] > 0);
  const matrix = (await a.get(`/api/reports/${reports.find((r) => r.name === 'Pipeline by Owner and Stage').id}/run`)).data;
  assert.ok(matrix.matrix.rows.length > 0 && matrix.matrix.cols.length > 0);
  const adhoc = await a.post('/api/reports/run', { object: 'Account', format: 'summary', columns: ['Name', 'Owner.Name'], groupings: [{ field: 'Type' }], aggregates: [{ op: 'avg', field: 'AnnualRevenue' }] });
  assert.equal(adhoc.status, 200, JSON.stringify(adhoc.data));
  const dashes = (await a.get('/api/dashboards')).data;
  const d = (await a.get(`/api/dashboards/${dashes[0].id}/run`)).data;
  assert.ok(d.components.every((c) => !c.error), JSON.stringify(d.components.filter((c) => c.error)));
});

test('setup: custom object, field, validation rule, flow', async () => {
  const a = await session('admin@slavy.dev');
  const obj = await a.post('/api/setup/objects', { label: 'Invoice', pluralLabel: 'Invoices', nameField: { label: 'Invoice Number', type: 'AutoNumber', format: 'INV-{0000}' } });
  assert.equal(obj.status, 200, JSON.stringify(obj.data));
  assert.equal(obj.data.apiName, 'Invoice__c');
  const f1 = await a.post('/api/setup/objects/Invoice__c/fields', { label: 'Amount', type: 'Currency' });
  assert.equal(f1.data.apiName, 'Amount__c');
  await a.post('/api/setup/objects/Invoice__c/fields', { label: 'Account', type: 'Lookup', referenceTo: 'Account' });
  await a.post('/api/setup/objects/Invoice__c/fields', { label: 'Tax', type: 'Formula', returnType: 'Currency', formula: 'Amount__c * 0.2' });
  await a.post('/api/setup/meta/validationRule', { object: 'Invoice__c', name: 'Positive', formula: 'Amount__c <= 0', errorMessage: 'Amount must be positive', errorField: 'Amount__c' });
  const flow = await a.post('/api/setup/meta/flow', { label: 'Invoice notify', flowType: 'record', object: 'Invoice__c', trigger: 'create', timing: 'after', active: true,
    elements: [{ type: 'task', subject: 'Send invoice {!Name}', dueInDays: 2, assignTo: 'owner' }] });
  assert.equal(flow.status, 200, JSON.stringify(flow.data));
  const bad = await a.post('/api/records/Invoice__c', { Amount__c: -5 });
  assert.equal(bad.status, 400);
  const inv = await a.post('/api/records/Invoice__c', { Amount__c: 100 });
  assert.equal(inv.status, 200, JSON.stringify(inv.data));
  assert.equal(inv.data.Name, 'INV-0001');
  assert.equal(inv.data.Tax__c, 20);
  const acts = (await a.get(`/api/record/${inv.data.Id}/activities`)).data;
  assert.ok(acts.upcoming.some((t) => t.Name === 'Send invoice INV-0001'));
  const badFormula = await a.post('/api/setup/objects/Invoice__c/fields', { label: 'Broken', type: 'Formula', returnType: 'Number', formula: 'Nope__c + 1' });
  assert.equal(badFormula.status, 400);
});

test('REST API with bearer token', async () => {
  const tok = await fetch(`${base}/services/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=password&username=admin@slavy.dev&password=slavy123' });
  const { access_token } = await tok.json();
  const h = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };
  const desc = await (await fetch(`${base}/services/data/v1.0/sobjects/Account/describe`, { headers: h })).json();
  assert.ok(desc.fields.find((f) => f.name === 'Industry').picklistValues.length > 5);
  const created = await fetch(`${base}/services/data/v1.0/sobjects/Account`, { method: 'POST', headers: h, body: JSON.stringify({ Name: 'REST Co' }) });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const patched = await fetch(`${base}/services/data/v1.0/sobjects/Account/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ Phone: '123' }) });
  assert.equal(patched.status, 204);
  const q = await (await fetch(`${base}/services/data/v1.0/query?q=${encodeURIComponent(`SELECT Id, Phone FROM Account WHERE Id = '${id}'`)}`, { headers: h })).json();
  assert.equal(q.records[0].Phone, '123');
  const err = await fetch(`${base}/services/data/v1.0/sobjects/Account`, { method: 'POST', headers: h, body: JSON.stringify({}) });
  assert.equal(err.status, 400);
  assert.ok(Array.isArray(await err.json()));
});

test('web-to-lead is public and runs automation', async () => {
  const r = await fetch(`${base}/web-to-lead`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'FirstName=Web&LastName=Visitor&Company=Inbound%20Inc&Email=w%40v.io&IsConverted=true' });
  assert.equal(r.status, 200);
  const a = await session('admin@slavy.dev');
  const q = await a.post('/api/soql', { q: "SELECT Name, LeadSource, IsConverted, Owner.Name FROM Lead WHERE Company = 'Inbound Inc'" });
  assert.equal(q.data.records[0].LeadSource, 'Web');
  assert.equal(q.data.records[0].IsConverted, false); // field not whitelisted
  assert.equal(q.data.records[0].Owner.Name, 'Unassigned Leads'); // routed to queue by flow
});
