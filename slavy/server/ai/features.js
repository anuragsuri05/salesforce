// Generative AI features. Every data access runs as the requesting user, so the model only ever
// sees (and can only ever change) what that user is allowed to see and change.
import { all, get, run, orgSetting, setOrgSetting } from '../db.js';
import { getObject, getFields, getField, listObjects, listMeta, getMeta, objectForId, REFERENCE_TYPES } from '../metadata.js';
import { getRecord, createRecord, updateRecord, formulaContext, nameOf, fieldAtPath } from '../records.js';
import { objectPerm, fieldAccess, hasPerm, asSystem, getUser, buildContext } from '../security.js';
import { executeSoql, parseSoql } from '../soql.js';
import { runReport } from '../reports.js';
import { globalSearch, activitiesFor, feedFor, createPost, relatedList, describeObject } from '../features.js';
import { submitForApproval } from '../automation.js';
import { compile, references, evaluate, mergeTemplate, toText } from '../formula.js';
import { HttpError, nowIso, todayStr, addDays } from '../util.js';
import { generate, parseJson, aiConfig } from './service.js';

const ISO_TODAY = () => todayStr();

// ---------- record context ----------
function fmtValue(f, v, labels) {
  if (v == null || v === '') return null;
  if (REFERENCE_TYPES.has(f.type) || f.ownerField || f.polymorphic) return labels?.[f.apiName] ? `${labels[f.apiName]} (${v})` : v;
  if (f.type === 'Checkbox' || f.returnType === 'Checkbox') return v ? 'Yes' : 'No';
  return String(v);
}

export function recordText(ctx, id, { activities = true, feed = true, related = true, maxChars = 12000 } = {}) {
  const rec = getRecord(ctx, id);
  const obj = getObject(rec.attributes.type);
  const lines = [`${obj.label}: ${rec.Name} (Id ${rec.Id})`];
  for (const f of getFields(obj.apiName)) {
    if (['Id', 'Name'].includes(f.apiName) || !(f.apiName in rec)) continue;
    const v = fmtValue(f, rec[f.apiName], rec._labels);
    if (v != null) lines.push(`- ${f.label}: ${String(v).slice(0, 1500)}`);
  }
  if (related) {
    const children = (listMeta('layout', obj.apiName)[0]?.relatedLists || []).slice(0, 6);
    for (const rl of children) {
      if (!getObject(rl.object) || !objectPerm(ctx, rl.object, 'read')) continue;
      try {
        const res = relatedList(ctx, id, rl.object, rl.field, { limit: 5 });
        if (!res.total) continue;
        const cols = (rl.columns || ['Name']).filter((c) => getField(rl.object, c)).slice(0, 4);
        lines.push(`\n${rl.label || getObject(rl.object).pluralLabel} (${res.total} total):`);
        for (const r of res.records) lines.push(`- ${cols.map((c) => fmtValue(getField(rl.object, c), r[c], r._labels)).filter(Boolean).join(' | ')}`);
      } catch { /* no access */ }
    }
  }
  if (activities && getObject('Task')) {
    try {
      const acts = activitiesFor(ctx, id);
      const items = [...acts.upcoming.slice(0, 5).map((a) => ({ ...a, when: 'Upcoming' })), ...acts.past.slice(0, 8).map((a) => ({ ...a, when: 'Past' }))];
      if (items.length) {
        lines.push('\nActivities:');
        for (const a of items) lines.push(`- [${a.when}] ${a._type === 'Event' ? 'Event' : a.TaskSubtype || 'Task'} "${a.Name}" ${a._type === 'Event' ? a.StartDateTime?.slice(0, 16) : a.ActivityDate || ''} ${a.Status ? `(${a.Status})` : ''}${a.Description ? ` — ${String(a.Description).slice(0, 300)}` : ''}`);
      }
    } catch { /* ignore */ }
  }
  if (feed) {
    try {
      const posts = feedFor(ctx, id, { limit: 8 });
      if (posts.length) {
        lines.push('\nChatter feed (newest first):');
        for (const p of posts) lines.push(`- ${p.createdBy} (${p.createdAt.slice(0, 10)}): ${p.body.slice(0, 400)}${p.comments.length ? ` [${p.comments.length} comments]` : ''}`);
      }
    } catch { /* ignore */ }
  }
  return { rec, obj, text: lines.join('\n').slice(0, maxChars) };
}

const STYLE = 'Write in clear, professional business English. Be factual; never invent data that is not in the context. Use Markdown with short bullet points.';

// ---------- record summary ----------
export async function summarizeRecord(ctx, id) {
  const { obj, text } = recordText(ctx, id);
  const focus = {
    Opportunity: 'deal status, value, stage & next steps, risks, and recent engagement',
    Account: 'who the customer is, relationship health, open opportunities and cases, and recommended next actions',
    Contact: 'who this person is, their role, recent interactions and suggested follow-ups',
    Lead: 'how qualified the lead looks, engagement so far and the best next step',
    Case: 'the customer issue, what has been tried, current status and the recommended resolution path',
  }[obj.apiName] || 'the key facts, current status, recent activity and recommended next steps';
  const res = await generate(ctx, {
    feature: 'summary', recordId: id,
    system: `You are an assistant inside Slavy, a CRM. Summarize CRM records for busy users. ${STYLE}`,
    prompt: `Summarize this ${obj.label} record. Focus on ${focus}. Start with a one-sentence overview, then up to 6 bullets, then a "Suggested next steps" list with 1-3 items.\n\n${text}`,
  });
  return { summary: res.text, generatedAt: nowIso() };
}

// ---------- email draft ----------
export async function draftEmail(ctx, id, { intent = '', tone = 'professional' } = {}) {
  const { rec, obj, text } = recordText(ctx, id, { related: true });
  const me = ctx.user;
  const res = await generate(ctx, {
    feature: 'email', recordId: id, json: true,
    system: `You write emails for ${me.Name}${me.Title ? `, ${me.Title}` : ''}. Return only a JSON object: {"subject": string, "body": string}. The body is plain text with line breaks, signed with the sender's first name. ${STYLE.replace('Use Markdown with short bullet points.', '')}`,
    prompt: `Write a ${tone} email related to this ${obj.label}. Goal: ${intent || 'a helpful follow-up that moves things forward'}.\nAddress it to the main contact person (if known).\n\nCRM context:\n${text}`,
  });
  const out = parseJson(res.text);
  return { subject: String(out.subject || '').slice(0, 250), body: String(out.body || ''), to: rec.Email || rec.SuppliedEmail || null };
}

// ---------- field suggestions (e.g. case classification) ----------
export async function suggestFields(ctx, id, { fields } = {}) {
  const { rec, obj, text } = recordText(ctx, id, { related: false, feed: true });
  const candidates = getFields(obj.apiName).filter((f) => f.type === 'Picklist' && !f.system && f.values?.length && fieldAccess(ctx, obj.apiName, f).edit && obj.pathField !== f.apiName)
    .filter((f) => !fields || fields.includes(f.apiName)).slice(0, 8);
  if (!candidates.length) throw new HttpError(400, 'This object has no editable picklist fields to suggest values for.');
  const spec = candidates.map((f) => `- ${f.apiName} (${f.label}): one of ${JSON.stringify(f.values.filter((v) => v.isActive !== false).map((v) => v.value))}; current: ${rec[f.apiName] ?? 'blank'}`).join('\n');
  const res = await generate(ctx, {
    feature: 'suggest', recordId: id, json: true,
    system: 'You classify CRM records. Return only JSON: {"suggestions":[{"field": api name, "value": allowed value, "confidence": 0-100, "reason": short}]}. Only use the allowed values. Omit fields you cannot infer.',
    prompt: `Suggest values for these ${obj.label} fields:\n${spec}\n\nRecord:\n${text}`,
  });
  const out = parseJson(res.text);
  const suggestions = (out.suggestions || []).map((s) => {
    const f = candidates.find((c) => c.apiName === s.field);
    const allowed = f?.values?.find((v) => v.value === s.value || v.value.toLowerCase() === String(s.value).toLowerCase());
    return f && allowed ? { field: f.apiName, label: f.label, value: allowed.value, current: rec[f.apiName] ?? null, confidence: Math.max(0, Math.min(100, Number(s.confidence) || 0)), reason: String(s.reason || '') } : null;
  }).filter(Boolean);
  return { suggestions };
}

// ---------- prompt templates ----------
// Template text supports {!Field}, {!Parent.Field}, {!$User.Name} formulas plus {!RecordDetails}, {!Activities}, {!Feed}.
export function resolvePrompt(ctx, template, recordId) {
  let text = String(template.instructions || '');
  if (!recordId) return text;
  const { rec, obj, text: details } = recordText(ctx, recordId);
  if (template.object && obj.apiName !== template.object) throw new HttpError(400, `This template is for ${template.object} records`);
  const acts = /\{!Activities\}/.test(text) ? recordText(ctx, recordId, { related: false, feed: false }).text.split('\nActivities:')[1] || '(none)' : '';
  const feedText = /\{!Feed\}/.test(text) ? recordText(ctx, recordId, { related: false, activities: false }).text.split('\nChatter feed (newest first):')[1] || '(none)' : '';
  text = text.replace(/\{!RecordDetails\}/g, details).replace(/\{!Activities\}/g, acts.trim()).replace(/\{!Feed\}/g, feedText.trim());
  return mergeTemplate(text, formulaContext(ctx, obj.apiName, rec));
}

export async function runPromptTemplate(ctx, templateId, recordId, { save = false, template: inline } = {}) {
  const t = inline || getMeta(templateId, 'promptTemplate');
  if (!t) throw new HttpError(404, 'Prompt template not found');
  if (!inline && t.active === false) throw new HttpError(400, 'This prompt template is inactive');
  const prompt = resolvePrompt(ctx, t, recordId);
  const res = await generate(ctx, {
    feature: 'prompts', recordId,
    system: `You are an assistant inside Slavy, a CRM. ${t.templateType === 'field' ? 'Return only the value to store in the field — no preamble, no quotes, no Markdown.' : STYLE}`,
    prompt,
  });
  let saved = false;
  if (save && t.outputField && recordId) {
    const f = getField(t.object, t.outputField);
    if (!f) throw new HttpError(400, 'Output field not found');
    updateRecord(ctx, recordId, { [f.apiName]: f.type === 'LongTextArea' || f.type === 'TextArea' ? res.text.slice(0, f.length || 32000) : res.text.trim().slice(0, f.length || 255) });
    saved = true;
  }
  return { resolvedPrompt: prompt, response: res.text, saved };
}

// ---------- admin / developer assist ----------
export async function generateFormula(ctx, { object, description, returnType = 'Checkbox', purpose = 'formula' }) {
  const obj = getObject(object);
  if (!obj) throw new HttpError(400, 'Unknown object');
  const fields = getFields(obj.apiName).map((f) => `${f.apiName} (${f.type === 'Formula' ? `Formula ${f.returnType}` : f.type}${f.values ? `: ${f.values.slice(0, 12).map((v) => v.value).join(' | ')}` : ''}${f.relationshipName ? `, relationship ${f.relationshipName}` : ''})`).join('\n');
  const guide = purpose === 'validation' ? 'The formula must evaluate to TRUE when the record is INVALID (validation rule error condition).'
    : purpose === 'condition' ? 'The formula must evaluate to TRUE when the condition is met.' : `The formula returns a ${returnType}.`;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generate(ctx, {
      feature: 'builder', json: true,
      system: 'You write Salesforce-compatible formulas for Slavy. Supported: IF, AND, OR, NOT, CASE, ISBLANK, BLANKVALUE, ISPICKVAL, ISCHANGED, PRIORVALUE, ISNEW, INCLUDES, TEXT, VALUE, LEN, LEFT, RIGHT, MID, UPPER, LOWER, TRIM, CONTAINS, BEGINS, FIND, SUBSTITUTE, REGEX, ROUND, ABS, MAX, MIN, MOD, FLOOR, CEILING, TODAY, NOW, DATE, DATEVALUE, YEAR, MONTH, DAY, WEEKDAY, ADDMONTHS; operators + - * / & = <> < > <= >= && ||; cross-object paths like Account.Industry; globals $User.Id, $User.Name, $Profile.Name. Picklists must be tested with ISPICKVAL. Return only JSON {"formula": string, "explanation": string}.',
      prompt: `Object: ${obj.apiName}\nFields:\n${fields}\n\nRequirement: ${description}\n${guide}${lastError ? `\n\nYour previous answer failed validation: ${lastError}. Fix it.` : ''}`,
    });
    const out = parseJson(res.text);
    try {
      const ast = compile(String(out.formula || ''));
      const bad = [...references(ast)].filter((p) => !p.startsWith('$') && !fieldAtPath(obj.apiName, p));
      if (bad.length) throw new Error(`unknown field(s) ${bad.join(', ')}`);
      return { formula: out.formula, explanation: out.explanation || '' };
    } catch (e) {
      lastError = e.message;
    }
  }
  throw new HttpError(502, `The AI could not produce a valid formula (${lastError}). Try rephrasing.`);
}

function schemaSummary(ctx) {
  return listObjects().filter((o) => objectPerm(ctx, o.apiName, 'read')).map((o) => {
    const fields = getFields(o.apiName).filter((f) => fieldAccess(ctx, o.apiName, f).read).map((f) => `${f.apiName}:${f.type === 'Formula' || f.type === 'Rollup' ? f.returnType : f.type}${f.relationshipName && !f.polymorphic ? `→${f.relationshipName}` : ''}`);
    return `${o.apiName}: ${fields.join(', ')}`;
  }).join('\n');
}

export async function generateSoql(ctx, { question }) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generate(ctx, {
      feature: 'builder', json: true,
      system: 'You translate questions into Slavy SOQL. Supported: SELECT fields, Parent.Field paths, child subqueries (SELECT ... FROM ChildPluralLabel), FIELDS(ALL), WHERE with AND/OR/NOT, =, !=, <, >, <=, >=, LIKE, IN, NOT IN, INCLUDES, date literals (TODAY, THIS_MONTH, LAST_N_DAYS:n, THIS_QUARTER, ...), GROUP BY with COUNT()/COUNT(field)/SUM/AVG/MIN/MAX and aliases, ORDER BY ASC/DESC NULLS FIRST/LAST, LIMIT, OFFSET. Use owner via Owner.Name. Return only JSON {"soql": string, "explanation": string}.',
      prompt: `Today is ${ISO_TODAY()}. Current user: ${ctx.user.Name} (Id ${ctx.user.Id}).\nSchema:\n${schemaSummary(ctx)}\n\nQuestion: ${question}${lastError ? `\n\nYour previous query failed: ${lastError}. Fix it.` : ''}`,
    });
    const out = parseJson(res.text);
    try {
      parseSoql(out.soql);
      return { soql: out.soql, explanation: out.explanation || '' };
    } catch (e) {
      lastError = e.message;
    }
  }
  throw new HttpError(502, `The AI could not produce a valid query (${lastError}).`);
}

// ---------- agent ----------
export const DEFAULT_AGENT = {
  name: 'Slavy Agent',
  role: 'You are Slavy Agent, a helpful CRM assistant for sales, service and marketing teams.',
  instructions: 'Answer using real data from the CRM by calling tools. Be concise. When you mention a record, link it as [Record Name](#/r/RECORD_ID). Use Markdown tables for lists of records. If a request is ambiguous, ask a short clarifying question. Never invent record IDs or field values.',
  topics: [
    { name: 'Sales', description: 'Pipeline, opportunities, accounts, contacts and leads', instructions: 'Highlight deal risks (overdue close dates, no recent activity) and suggest next steps.', enabled: true },
    { name: 'Service', description: 'Cases and customer issues', instructions: 'Prioritize high-priority and escalated cases. Be empathetic when drafting customer replies.', enabled: true },
    { name: 'Productivity', description: 'Tasks, calls, follow-ups and Chatter updates', instructions: 'When creating tasks, set sensible due dates (default 2 business days).', enabled: true },
  ],
  tools: { search_records: true, query_records: true, get_record: true, describe_object: true, run_report: true, create_record: true, update_record: true, create_task: true, log_call: true, post_to_feed: true, submit_for_approval: true },
  requireConfirmation: true,
  maxSteps: 8,
  welcome: 'Hi! I can look up records, summarize deals, create tasks, update fields and more. What do you need?',
  suggestions: ['What are my open opportunities closing this month?', 'Which high priority cases are open?', 'Summarize this record', 'Create a follow-up task for tomorrow'],
};

export function agentConfig() {
  const c = orgSetting('aiAgent', {});
  return { ...DEFAULT_AGENT, ...c, tools: { ...DEFAULT_AGENT.tools, ...(c.tools || {}) } };
}

export function saveAgentConfig(patch) {
  const cur = agentConfig();
  const next = { ...cur };
  for (const k of ['name', 'role', 'instructions', 'topics', 'tools', 'requireConfirmation', 'maxSteps', 'welcome', 'suggestions']) if (k in patch) next[k] = patch[k];
  next.maxSteps = Math.max(1, Math.min(15, Number(next.maxSteps) || 8));
  setOrgSetting('aiAgent', next);
  return next;
}

const S = (props, required = []) => ({ type: 'object', properties: props, required });
const str = (description) => ({ type: 'string', description });

export const AGENT_TOOLS = [
  { name: 'search_records', mutating: false, label: 'Search records', description: 'Full-text search across CRM records (names, emails, phones, text fields). Optionally limit to one object API name.', parameters: S({ query: str('Search text (at least 2 characters)'), object: str('Optional object API name, e.g. Account, Contact, Opportunity, Case, Lead') }, ['query']) },
  { name: 'query_records', mutating: false, label: 'Query records', description: 'Run a read-only SOQL query, e.g. SELECT Name, Amount, StageName FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate LIMIT 10. Supports parent paths (Account.Name, Owner.Name), date literals (THIS_MONTH, LAST_N_DAYS:30), GROUP BY with COUNT/SUM. Always include a LIMIT (max 50).', parameters: S({ soql: str('The SOQL query') }, ['soql']) },
  { name: 'get_record', mutating: false, label: 'Get record', description: 'Get all readable fields of one record by its 15-character Id, plus related lists, activities and feed.', parameters: S({ id: str('Record Id') }, ['id']) },
  { name: 'describe_object', mutating: false, label: 'Describe object', description: 'List the fields (API name, label, type, picklist values) of an object. Use before creating or updating records or writing SOQL on unfamiliar objects.', parameters: S({ object: str('Object API name') }, ['object']) },
  { name: 'run_report', mutating: false, label: 'Run report', description: 'Run a saved report by (partial) name and return its groups and totals.', parameters: S({ name: str('Report name') }, ['name']) },
  { name: 'create_record', mutating: true, label: 'Create record', description: 'Create a record. fields_json is a JSON object of field API names to values, e.g. {"LastName":"Smith","AccountId":"001..."}.', parameters: S({ object: str('Object API name'), fields_json: str('JSON object of field values') }, ['object', 'fields_json']) },
  { name: 'update_record', mutating: true, label: 'Update record', description: 'Update fields on an existing record. fields_json is a JSON object of field API names to new values.', parameters: S({ id: str('Record Id'), fields_json: str('JSON object of field values to change') }, ['id', 'fields_json']) },
  { name: 'create_task', mutating: true, label: 'Create task', description: 'Create a follow-up task assigned to the current user.', parameters: S({ subject: str('Task subject'), due_date: str('Due date YYYY-MM-DD (optional)'), related_id: str('Optional Id of the related record (account, opportunity, case, contact or lead)'), priority: { type: 'string', enum: ['High', 'Normal', 'Low'], description: 'Priority' }, description: str('Optional comments') }, ['subject']) },
  { name: 'log_call', mutating: true, label: 'Log a call', description: 'Log a completed call on a record.', parameters: S({ related_id: str('Id of the record the call was about'), subject: str('Short subject'), notes: str('Call notes') }, ['related_id', 'subject']) },
  { name: 'post_to_feed', mutating: true, label: 'Post to Chatter', description: 'Post a Chatter update on a record.', parameters: S({ record_id: str('Record Id'), message: str('Post text') }, ['record_id', 'message']) },
  { name: 'submit_for_approval', mutating: true, label: 'Submit for approval', description: 'Submit a record to its approval process.', parameters: S({ record_id: str('Record Id'), comments: str('Comments for the approver') }, ['record_id']) },
];

const strip = (r) => { const { attributes, _access, ...rest } = r; return rest; };
const json = (v, max = 9000) => { const s = JSON.stringify(v); return s.length > max ? s.slice(0, max) + '…(truncated)' : s; };
const parseFields = (s) => { try { const v = typeof s === 'string' ? JSON.parse(s) : s; if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(); return v; } catch { throw new HttpError(400, 'fields_json must be a JSON object'); } };
const whoish = (id) => ['Contact', 'Lead'].includes(objectForId(id));

function executeTool(ctx, name, input) {
  switch (name) {
    case 'search_records': {
      const groups = globalSearch(ctx, input.query, { object: input.object || undefined, limit: 5 });
      return groups.map((g) => ({ object: g.object, total: g.total, records: g.records.slice(0, 8).map((r) => ({ Id: r.Id, Name: r.Name, ...Object.fromEntries(g.columns.slice(1, 4).map((c) => [c, r._labels?.[c] ?? r[c]])) })) }));
    }
    case 'query_records': {
      const q = parseSoql(input.soql);
      if (q.limit == null || q.limit > 50) q.limit = 50;
      const res = executeSoql(ctx, q, { maxRows: 50 });
      return { totalSize: res.totalSize, records: res.records.map((r) => { const { attributes, ...rest } = r; return rest; }) };
    }
    case 'get_record': {
      const { text } = recordText(ctx, input.id, { maxChars: 8000 });
      return text;
    }
    case 'describe_object': {
      const d = describeObject(ctx, input.object);
      return { object: d.apiName, label: d.label, fields: d.fields.map((f) => ({ name: f.apiName, label: f.label, type: f.type, required: !!f.required, editable: !!f.access?.edit && !f.readOnly && !['Formula', 'Rollup', 'AutoNumber'].includes(f.type), ...(f.values ? { values: f.values.map((v) => v.value) } : {}), ...(f.referenceTo ? { referenceTo: f.referenceTo } : {}) })) };
    }
    case 'run_report': {
      const reps = listMeta('report').filter((r) => r.visibility === 'public' || r.ownerId === ctx.user.Id);
      const rep = reps.find((r) => r.name.toLowerCase() === String(input.name).toLowerCase()) || reps.find((r) => r.name.toLowerCase().includes(String(input.name).toLowerCase()));
      if (!rep) return { error: `No report matching "${input.name}". Available: ${reps.map((r) => r.name).join(', ')}` };
      const res = runReport(ctx, rep);
      return { report: rep.name, link: `#/reports/${rep.id}`, total: res.total, grandTotals: res.grandTotals, aggregates: res.aggregates.map((a) => a.label),
        groups: res.groups?.map((g) => ({ group: g.label, ...g.totals })), rows: res.rows?.slice(0, 20).map((r) => Object.fromEntries(res.columns.map((c) => [c.label, r._labels?.[c.path] ?? r[c.path]]))) };
    }
    case 'create_record': {
      const id = createRecord(ctx, input.object, parseFields(input.fields_json));
      return { created: strip(getRecord(ctx, id)), link: `#/r/${id}` };
    }
    case 'update_record': {
      updateRecord(ctx, input.id, parseFields(input.fields_json));
      return { updated: strip(getRecord(ctx, input.id)), link: `#/r/${input.id}` };
    }
    case 'create_task': {
      const vals = { Name: input.subject, ActivityDate: input.due_date || addDays(todayStr(), 2), Priority: input.priority || 'Normal', Status: 'Not Started', Description: input.description || null };
      if (input.related_id) vals[whoish(input.related_id) ? 'WhoId' : 'WhatId'] = input.related_id;
      const id = createRecord(ctx, 'Task', vals);
      return { created: strip(getRecord(ctx, id)), link: `#/r/${id}` };
    }
    case 'log_call': {
      const vals = { Name: input.subject, TaskSubtype: 'Call', Status: 'Completed', Priority: 'Normal', ActivityDate: todayStr(), Description: input.notes || null };
      vals[whoish(input.related_id) ? 'WhoId' : 'WhatId'] = input.related_id;
      const id = createRecord(ctx, 'Task', vals);
      return { logged: strip(getRecord(ctx, id)), link: `#/r/${id}` };
    }
    case 'post_to_feed': {
      const p = createPost(ctx, input.record_id, input.message);
      return { posted: true, id: p.id };
    }
    case 'submit_for_approval': return { submitted: true };
  }
  throw new HttpError(400, `Unknown tool ${name}`);
}

async function executeToolAsync(ctx, name, input) {
  if (name === 'submit_for_approval') {
    const a = submitForApproval(ctx, input.record_id, input.comments || '');
    return { submitted: true, approver: a.approver, status: a.status };
  }
  return executeTool(ctx, name, input);
}

function describeCall(ctx, tc) {
  const i = tc.input || {};
  const nm = (id) => { try { return nameOf(ctx, id) || id; } catch { return id; } };
  switch (tc.name) {
    case 'create_record': { let f = {}; try { f = parseFields(i.fields_json); } catch { /* shown raw */ } return { title: `Create ${getObject(i.object)?.label || i.object}`, details: f }; }
    case 'update_record': { let f = {}; try { f = parseFields(i.fields_json); } catch { /* shown raw */ } return { title: `Update ${getObject(objectForId(i.id))?.label || 'record'} "${nm(i.id)}"`, details: f }; }
    case 'create_task': return { title: `Create task "${i.subject}"`, details: { Due: i.due_date || addDays(todayStr(), 2), Priority: i.priority || 'Normal', 'Related To': i.related_id ? nm(i.related_id) : '—', ...(i.description ? { Comments: i.description } : {}) } };
    case 'log_call': return { title: `Log a call on "${nm(i.related_id)}"`, details: { Subject: i.subject, Notes: i.notes || '' } };
    case 'post_to_feed': return { title: `Post to Chatter on "${nm(i.record_id)}"`, details: { Message: i.message } };
    case 'submit_for_approval': return { title: `Submit "${nm(i.record_id)}" for approval`, details: { Comments: i.comments || '' } };
    default: return { title: AGENT_TOOLS.find((t) => t.name === tc.name)?.label || tc.name, details: i };
  }
}

function agentSystemPrompt(ctx, cfg, recordId) {
  const org = orgSetting('company', {});
  const profile = getMeta(ctx.user.ProfileId)?.name;
  const role = getMeta(ctx.user.RoleId)?.name;
  let recordLine = '';
  if (recordId) {
    try {
      const r = getRecord(ctx, recordId);
      recordLine = `\nThe user is currently viewing the ${getObject(r.attributes.type).label} "${r.Name}" (Id ${r.Id}). "This record", "this deal", "this case" etc. refer to it.`;
    } catch { /* no access */ }
  }
  const topics = (cfg.topics || []).filter((t) => t.enabled !== false).map((t) => `- ${t.name}: ${t.description}. ${t.instructions || ''}`).join('\n');
  const objects = listObjects().filter((o) => objectPerm(ctx, o.apiName, 'read')).map((o) => `${o.apiName} (${o.label})`).join(', ');
  return `${cfg.role}
${cfg.instructions}

Topics you handle:
${topics || '- General CRM assistance'}

Context:
- Organization: ${org.name || 'Slavy'}; currency ${org.currency || 'USD'}. Today is ${ISO_TODAY()}.
- User: ${ctx.user.Name} (Id ${ctx.user.Id}), profile ${profile || '—'}, role ${role || '—'}. "My" records are records where OwnerId = '${ctx.user.Id}'.
- Objects this user can access: ${objects}.${recordLine}
- Tools run with this user's permissions; if a tool returns an error, explain it plainly.
${cfg.requireConfirmation ? '- Changes (create/update/log/post/submit) are shown to the user for confirmation before they run; just call the tool.' : ''}`;
}

// messages: canonical conversation (client keeps it between turns). decision: 'approve' | 'reject' for pending calls.
export async function agentTurn(ctx, { messages = [], recordId = null, decision = null }) {
  const cfg = agentConfig();
  const tools = AGENT_TOOLS.filter((t) => cfg.tools[t.name] !== false);
  const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const system = agentSystemPrompt(ctx, cfg, recordId);
  const convo = messages.slice(-40);
  const steps = [];
  if (!convo.length) throw new HttpError(400, 'No message');

  // Resolve a pending confirmation: the last assistant turn's tool calls.
  const last = convo[convo.length - 1];
  if (last.role === 'assistant' && last.toolCalls?.length) {
    if (!decision) throw new HttpError(400, 'Approve or reject the pending action first');
    convo.push(await runCalls(ctx, last.toolCalls, tools, decision === 'approve', steps));
  }

  for (let step = 0; step < cfg.maxSteps; step++) {
    const res = await generate(ctx, { feature: 'agent', recordId, system, messages: convo, tools: toolDefs });
    const assistant = { role: 'assistant', content: res.text || '', toolCalls: res.toolCalls?.length ? res.toolCalls : undefined, raw: res.raw };
    convo.push(assistant);
    if (!res.toolCalls?.length) return { messages: convo, reply: res.text, steps };
    const needsConfirm = cfg.requireConfirmation && res.toolCalls.some((tc) => tools.find((t) => t.name === tc.name)?.mutating);
    if (needsConfirm) {
      return { messages: convo, reply: res.text, steps, pending: res.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, mutating: !!tools.find((t) => t.name === tc.name)?.mutating, ...describeCall(ctx, tc) })) };
    }
    convo.push(await runCalls(ctx, res.toolCalls, tools, true, steps));
  }
  return { messages: convo, reply: 'I stopped after reaching the maximum number of steps. Please narrow the request.', steps };
}

async function runCalls(ctx, calls, tools, approved, steps) {
  const results = [];
  for (const tc of calls) {
    const def = tools.find((t) => t.name === tc.name);
    if (!def) { results.push({ id: tc.id, name: tc.name, output: `Error: tool ${tc.name} is not available`, isError: true }); continue; }
    if (def.mutating && !approved) {
      results.push({ id: tc.id, name: tc.name, output: 'The user declined this action. Do not retry it; ask what they would like instead.', isError: true });
      steps.push({ tool: tc.name, label: def.label, ok: false, declined: true });
      continue;
    }
    try {
      const out = await executeToolAsync(ctx, tc.name, tc.input || {});
      results.push({ id: tc.id, name: tc.name, output: typeof out === 'string' ? out : json(out) });
      steps.push({ tool: tc.name, label: def.label, ok: true, mutating: def.mutating, link: out?.link || null, input: def.mutating ? undefined : tc.input });
    } catch (e) {
      results.push({ id: tc.id, name: tc.name, output: `Error: ${e.message}`, isError: true });
      steps.push({ tool: tc.name, label: def.label, ok: false, error: e.message });
    }
  }
  return { role: 'tool', results };
}

// ---------- async jobs (flow "AI Prompt" step) ----------
export function enqueueJob(userId, kind, payload) {
  run('INSERT INTO ai_jobs(created_at, user_id, kind, payload, status) VALUES (?, ?, ?, ?, ?)', nowIso(), userId, kind, JSON.stringify(payload), 'Queued');
}

let working = false;
export async function processJobs() {
  if (working) return;
  working = true;
  try {
    for (const job of all("SELECT * FROM ai_jobs WHERE status = 'Queued' ORDER BY id LIMIT 5")) {
      run("UPDATE ai_jobs SET status = 'Running', attempts = attempts + 1 WHERE id = ?", job.id);
      try {
        const p = JSON.parse(job.payload);
        const user = getUser(job.user_id) || get('SELECT * FROM users WHERE is_active = 1 ORDER BY created_at LIMIT 1');
        // fromAiJob: the field update below must not queue further AI Prompt jobs (prevents an endless flow ↔ job loop).
        const ctx = { ...asSystem(buildContext(user)), fromAiJob: true };
        const out = await runPromptTemplate(ctx, p.templateId, p.recordId, { save: false });
        const t = getMeta(p.templateId, 'promptTemplate');
        const field = getField(t?.object || objectForId(p.recordId), p.outputField || t?.outputField);
        if (field) updateRecord(ctx, p.recordId, { [field.apiName]: out.response.trim().slice(0, field.length || 32000) }, { trusted: true });
        run("UPDATE ai_jobs SET status = 'Done', result = ?, finished_at = ? WHERE id = ?", out.response.slice(0, 2000), nowIso(), job.id);
      } catch (e) {
        run('UPDATE ai_jobs SET status = ?, result = ?, finished_at = ? WHERE id = ?', job.attempts >= 2 ? 'Failed' : 'Queued', e.message, nowIso(), job.id);
      }
    }
  } finally {
    working = false;
  }
}

export function startJobWorker() {
  const t = setInterval(() => { processJobs().catch((e) => console.error('[ai-jobs]', e.message)); }, 3000);
  t.unref();
  return t;
}

export { aiConfig, evaluate, toText, hasPerm };
