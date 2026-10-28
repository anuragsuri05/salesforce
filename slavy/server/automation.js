// Declarative automation: validation rules, record-triggered / scheduled / autolaunched flows,
// approval processes, in-app notifications, email log and record feed posts.
import { all, get, run, tx, orgSetting, setOrgSetting } from './db.js';
import { listMeta, getMeta, getObject, objectForId, getField } from './metadata.js';
import {
  hooks, formulaContext, applyTrusted, createRecord, updateRecord, enriched, getRecord, nameOf, visibleRecords,
} from './records.js';
import { asSystem, getUser, hasPerm, systemContext, userInGroup, buildContext } from './security.js';
import { evaluate, mergeTemplate, SDate, toText } from './formula.js';
import { evalCondition, filtersToCondition } from './conditions.js';
import { loadRaw } from './store.js';
import { HttpError, ValidationError, newId, nowIso, PREFIX, prefixOf, todayStr, addDays } from './util.js';

// ---------- notifications, email, feed ----------
export function notify(userId, title, body, link) {
  if (!userId || prefixOf(userId) !== PREFIX.User) return;
  run('INSERT INTO notifications(id, user_id, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    newId(PREFIX.Notification), userId, title, body || '', link || '', nowIso());
}

export function logEmail({ to, subject, body, relatedId, sentBy, source }) {
  run('INSERT INTO email_log(id, to_addr, subject, body, related_id, sent_by, sent_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    newId(PREFIX.Email), to, subject, body, relatedId || null, sentBy || null, nowIso(), source || 'flow');
}

export function postFeed(parentId, userId, body, type = 'post', data = null) {
  const id = newId(PREFIX.Feed);
  run('INSERT INTO feed(id, parent_id, type, body, data, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, parentId, type, body, data ? JSON.stringify(data) : null, userId, nowIso());
  return id;
}

// ---------- helpers ----------
function evalValue(ctx, objApi, rec, a, prior, isNew) {
  if (!a.isFormula) return a.value;
  const v = evaluate(String(a.value), formulaContext(ctx, objApi, rec, { prior, isNew }));
  if (v instanceof SDate) return v.toString();
  if (v instanceof Date) return v.toISOString();
  return v;
}

function assignmentValues(ctx, objApi, rec, assignments = [], prior, isNew) {
  const out = {};
  for (const a of assignments) {
    if (!a.field) continue;
    out[a.field] = evalValue(ctx, objApi, rec, a, prior, isNew);
  }
  return out;
}

function conditionTrue(ctx, objApi, rec, formula, prior, isNew) {
  if (!formula || !String(formula).trim()) return true;
  return Boolean(evaluate(formula, formulaContext(ctx, objApi, rec, { prior, isNew })));
}

function resolveRecipient(rec, who) {
  if (!who || who === 'owner') return rec.OwnerId;
  if (who === 'creator') return rec.CreatedById;
  if (who === 'lastModifiedBy') return rec.LastModifiedById;
  if (who === 'ownerManager') return getUser(rec.OwnerId)?.manager_id || null;
  return who;
}

function flowError(flow, e) {
  const msg = e instanceof ValidationError ? e.errors.map((x) => x.message).join('; ') : e.message;
  return new HttpError(400, `Flow "${flow.label || flow.name}" failed: ${msg}`, { flow: flow.id });
}

// ---------- validation rules ----------
hooks.validate.push((ctx, obj, rec, old, isNew) => {
  const errors = [];
  for (const rule of listMeta('validationRule', obj.apiName)) {
    if (rule.active === false) continue;
    try {
      if (evaluate(rule.formula, formulaContext(ctx, obj.apiName, rec, { prior: old, isNew }))) {
        errors.push({ field: rule.errorField || undefined, message: rule.errorMessage || `Validation rule ${rule.name} failed` });
      }
    } catch (e) {
      errors.push({ message: `Validation rule "${rule.name}" has an error: ${e.message}` });
    }
  }
  return errors;
});

// ---------- record-triggered flows ----------
function recordFlows(objApi, event, timing) {
  return listMeta('flow', objApi).filter((f) => f.active && f.flowType === 'record' && f.timing === timing
    && (f.trigger === event || (f.trigger === 'createOrUpdate' && (event === 'create' || event === 'update'))))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function entryMet(ctx, flow, rec, old, isNew) {
  const met = conditionTrue(ctx, flow.object, rec, flow.condition, old, isNew);
  if (!met) return false;
  if (flow.onlyWhenChanged && !isNew && old && flow.condition) {
    return !conditionTrue(ctx, flow.object, old, flow.condition, null, false);
  }
  return true;
}

hooks.beforeSave.push((ctx, obj, rec, old, isNew) => {
  const flows = recordFlows(obj.apiName, isNew ? 'create' : 'update', 'before');
  if (!flows.length) return;
  const sys = asSystem(ctx);
  for (const flow of flows) {
    try {
      const view = enriched({ ...sys, cache: new Map() }, { ...rec, __object: obj.apiName }) || rec;
      if (!entryMet(sys, flow, view, old, isNew)) continue;
      for (const el of flow.elements || []) {
        if (el.type !== 'update') continue;
        const cur = enriched({ ...sys, cache: new Map() }, { ...rec, __object: obj.apiName }) || rec;
        if (!conditionTrue(sys, obj.apiName, cur, el.condition, old, isNew)) continue;
        applyTrusted(sys, obj.apiName, rec, assignmentValues(sys, obj.apiName, cur, el.assignments, old, isNew));
      }
    } catch (e) {
      throw flowError(flow, e);
    }
  }
});

hooks.afterSave.push((ctx, obj, rec, old, isNew) => {
  const flows = recordFlows(obj.apiName, isNew ? 'create' : 'update', 'after');
  for (const flow of flows) {
    const sys = asSystem(ctx);
    try {
      if (!entryMet(sys, flow, rec, old, isNew)) continue;
      runElements(sys, flow, obj.apiName, rec, old, isNew);
    } catch (e) {
      throw flowError(flow, e);
    }
  }
});

hooks.afterDelete.push((ctx, obj, rec) => {
  for (const flow of recordFlows(obj.apiName, 'delete', 'after')) {
    const sys = asSystem(ctx);
    try {
      if (!conditionTrue(sys, obj.apiName, rec, flow.condition, null, false)) continue;
      runElements(sys, flow, obj.apiName, rec, null, false, { deleted: true });
    } catch (e) {
      throw flowError(flow, e);
    }
  }
});

// Execute a flow's elements against one record. Returns a log of what happened.
export function runElements(ctx, flow, objApi, rec, old, isNew, { deleted = false } = {}) {
  const log = [];
  let current = rec;
  const refresh = () => {
    if (deleted || !current?.Id) return;
    const raw = loadRaw({ cache: new Map() }, current.Id);
    if (raw) current = enriched({ ...ctx, cache: new Map() }, raw);
  };
  for (const el of flow.elements || []) {
    if (!conditionTrue(ctx, objApi, current, el.condition, old, isNew)) { log.push({ element: el.label || el.type, skipped: true }); continue; }
    const fctx = formulaContext(ctx, objApi, current, { prior: old, isNew });
    const text = (t) => mergeTemplate(t, fctx);
    switch (el.type) {
      case 'update': {
        if (deleted) break;
        updateRecord(ctx, current.Id, assignmentValues(ctx, objApi, current, el.assignments, old, isNew), { trusted: true });
        refresh();
        log.push({ element: el.label || 'Update Record', id: current.Id });
        break;
      }
      case 'updateRelated': {
        const parentId = current[el.lookupField];
        if (!parentId) { log.push({ element: el.label || 'Update Related', skipped: true }); break; }
        updateRecord(ctx, parentId, assignmentValues(ctx, objApi, current, el.assignments, old, isNew), { trusted: true });
        log.push({ element: el.label || 'Update Related', id: parentId });
        break;
      }
      case 'create': {
        const id = createRecord(ctx, el.object, assignmentValues(ctx, objApi, current, el.assignments, old, isNew), { trusted: true });
        log.push({ element: el.label || 'Create Record', id });
        break;
      }
      case 'task': {
        const whoish = ['Contact', 'Lead'].includes(objApi);
        const id = createRecord(ctx, 'Task', {
          Name: text(el.subject) || 'Follow up',
          ActivityDate: addDays(todayStr(), Number(el.dueInDays || 0)),
          Priority: el.priority || 'Normal',
          Status: 'Not Started',
          OwnerId: resolveRecipient(current, el.assignTo),
          Description: text(el.description),
          ...(deleted ? {} : whoish ? { WhoId: current.Id } : { WhatId: current.Id }),
        }, { trusted: true });
        log.push({ element: el.label || 'Create Task', id });
        break;
      }
      case 'notify': {
        const to = resolveRecipient(current, el.recipient);
        notify(to, text(el.title) || flow.label, text(el.body), deleted ? '' : `#/r/${current.Id}`);
        log.push({ element: el.label || 'Send Notification', to });
        break;
      }
      case 'email': {
        let to = el.to || 'owner';
        if (to === 'owner' || to === 'creator' || to === 'ownerManager') to = getUser(resolveRecipient(current, to))?.email;
        else if (to.startsWith('field:')) to = current[to.slice(6)];
        if (to) logEmail({ to, subject: text(el.subject), body: text(el.body), relatedId: current.Id, sentBy: ctx.user?.Id, source: `Flow: ${flow.label || flow.name}` });
        log.push({ element: el.label || 'Send Email', to });
        break;
      }
      case 'post': {
        if (!deleted) postFeed(current.Id, ctx.user?.Id || null, text(el.body), 'post', { source: flow.label || flow.name });
        log.push({ element: el.label || 'Post to Feed' });
        break;
      }
      case 'aiPrompt': {
        // Generative AI runs asynchronously (outside the save transaction): queue a job.
        // Skip when this save was made by an AI job itself — otherwise the job's field update re-triggers the flow forever.
        if (!deleted && !ctx.fromAiJob) {
          run('INSERT INTO ai_jobs(created_at, user_id, kind, payload, status) VALUES (?, ?, ?, ?, ?)', nowIso(), ctx.user?.Id || flow.createdBy || null, 'flowPrompt',
            JSON.stringify({ flowId: flow.id, templateId: el.templateId, recordId: current.Id, outputField: el.outputField }), 'Queued');
        }
        log.push({ element: el.label || 'AI Prompt', queued: !deleted && !ctx.fromAiJob });
        break;
      }
      case 'submitApproval': {
        if (!deleted && !get("SELECT 1 FROM approvals WHERE record_id = ? AND status = 'Pending'", current.Id)) {
          submitForApproval(ctx, current.Id, text(el.comments) || 'Submitted automatically', { submitterId: current.OwnerId });
        }
        log.push({ element: el.label || 'Submit for Approval' });
        break;
      }
      default:
        throw new HttpError(400, `Unknown flow element type ${el.type}`);
    }
  }
  return log;
}

// ---------- autolaunched & scheduled flows ----------
export function runFlowOnRecord(ctx, flowId, recordId) {
  const flow = getMeta(flowId, 'flow');
  if (!flow) throw new HttpError(404, 'Flow not found');
  if (!flow.active) throw new HttpError(400, 'Flow is not active');
  const rec = getRecord(ctx, recordId); // enforces the caller's access
  const sys = asSystem(ctx);
  const raw = enriched(sys, loadRaw(sys, rec.Id));
  return tx(() => runElements(sys, flow, raw.__object, raw, null, false));
}

export function runScheduledFlow(flowId, actingUserId) {
  const flow = getMeta(flowId, 'flow');
  if (!flow) throw new HttpError(404, 'Flow not found');
  const user = getUser(actingUserId || flow.createdBy);
  const sys = systemContext(user);
  const where = filtersToCondition(flow.filters || [], flow.filterLogic);
  const items = visibleRecords(sys, flow.object, { where });
  const results = { processed: 0, errors: [] };
  for (const { rec } of items) {
    try {
      if (!conditionTrue(sys, flow.object, rec, flow.condition, null, false)) continue;
      tx(() => runElements({ ...sys, cache: new Map() }, flow, flow.object, rec, null, false));
      results.processed++;
    } catch (e) {
      results.errors.push({ id: rec.Id, message: e.message });
    }
  }
  const runs = orgSetting('flowRuns', {});
  runs[flow.id] = { at: nowIso(), ...results, errors: results.errors.slice(0, 20) };
  setOrgSetting('flowRuns', runs);
  return results;
}

function isDue(flow, last, now) {
  const s = flow.schedule || {};
  const [hh, mm] = String(s.time || '00:00').split(':').map(Number);
  if (s.startDate && todayStr(now) < s.startDate) return false;
  const lastAt = last ? new Date(last.at) : null;
  if (s.frequency === 'hourly') return !lastAt || now - lastAt >= 3600000 - 30000;
  const todayRun = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh || 0, mm || 0));
  if (now < todayRun) return false;
  if (s.frequency === 'weekly') {
    if (now.getUTCDay() !== Number(s.dayOfWeek ?? 1)) return false;
  }
  if (s.frequency === 'once' && lastAt) return false;
  return !lastAt || lastAt < todayRun;
}

export function startScheduler() {
  const tick = () => {
    try {
      const runs = orgSetting('flowRuns', {});
      const now = new Date();
      for (const flow of listMeta('flow')) {
        if (!flow.active || flow.flowType !== 'scheduled') continue;
        if (isDue(flow, runs[flow.id], now)) runScheduledFlow(flow.id);
      }
    } catch (e) {
      console.error('[scheduler]', e.message);
    }
  };
  const timer = setInterval(tick, 60000);
  timer.unref();
  return timer;
}

// ---------- approval processes ----------
function canAct(ctx, approval) {
  if (hasPerm(ctx, 'ModifyAllData')) return true;
  if (approval.approver_id === ctx.user.Id) return true;
  if (prefixOf(approval.approver_id) === PREFIX.Group) {
    const g = getMeta(approval.approver_id, 'group');
    return !!g && userInGroup(ctx.user.Id, ctx.user.RoleId, g);
  }
  return false;
}

function approvalLink(id) { return `#/r/${id}`; }

export function submitForApproval(ctx, recordId, comments = '', { submitterId } = {}) {
  const shaped = getRecord(ctx, recordId);
  const objApi = shaped.attributes.type;
  if (get("SELECT 1 FROM approvals WHERE record_id = ? AND status = 'Pending'", recordId)) throw new HttpError(400, 'This record is already pending approval');
  const sys = asSystem(ctx);
  const rec = enriched(sys, loadRaw(sys, recordId));
  const processes = listMeta('approvalProcess', objApi).filter((p) => p.active).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!processes.length) throw new HttpError(400, `No active approval process for ${getObject(objApi).label}`);
  const process = processes.find((p) => conditionTrue(sys, objApi, rec, p.entryCriteria, null, false));
  if (!process) throw new HttpError(400, 'This record does not meet the entry criteria of any active approval process');
  const submitter = submitterId || ctx.user.Id;
  let approver = null;
  const a = process.approver || { kind: 'manager' };
  if (a.kind === 'manager') approver = getUser(submitter)?.manager_id;
  else if (a.kind === 'ownerManager') approver = getUser(rec.OwnerId)?.manager_id;
  else approver = a.id;
  if (!approver) throw new HttpError(400, 'No approver found: the submitter has no manager. Set a Manager on the user record or change the approval process.');
  const id = newId(PREFIX.Approval);
  tx(() => {
    run(`INSERT INTO approvals(id, record_id, object, process_id, status, submitted_by, approver_id, comments, created_at)
         VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?)`, id, recordId, objApi, process.id, submitter, approver, comments || '', nowIso());
    if (process.onSubmit?.length) updateRecord(sys, recordId, assignmentValues(sys, objApi, rec, process.onSubmit), { trusted: true });
    postFeed(recordId, submitter, `submitted this record for approval${comments ? `: "${comments}"` : '.'}`, 'approval', { approvalId: id, status: 'Pending' });
  });
  const who = nameOf(ctx, submitter);
  if (prefixOf(approver) === PREFIX.Group) {
    const g = getMeta(approver, 'group');
    for (const u of all('SELECT id, role_id FROM users WHERE is_active = 1')) if (userInGroup(u.id, u.role_id, g)) notify(u.id, 'Approval requested', `${who} requests approval for ${rec.Name}`, approvalLink(recordId));
  } else notify(approver, 'Approval requested', `${who} requests approval for ${rec.Name}`, approvalLink(recordId));
  return getApproval(ctx, id);
}

export function actOnApproval(ctx, approvalId, action, comments = '') {
  const ap = get('SELECT * FROM approvals WHERE id = ?', approvalId);
  if (!ap) throw new HttpError(404, 'Approval request not found');
  if (ap.status !== 'Pending') throw new HttpError(400, `This request is already ${ap.status}`);
  const process = getMeta(ap.process_id, 'approvalProcess') || {};
  const sys = asSystem(ctx);
  if (action === 'recall') {
    if (ap.submitted_by !== ctx.user.Id && !hasPerm(ctx, 'ModifyAllData')) throw new HttpError(403, 'Only the submitter or an administrator can recall');
  } else if (!canAct(ctx, ap)) throw new HttpError(403, 'You are not the assigned approver');
  const status = { approve: 'Approved', reject: 'Rejected', recall: 'Recalled' }[action];
  if (!status) throw new HttpError(400, 'Unknown approval action');
  const updates = { approve: process.onApprove, reject: process.onReject, recall: process.onRecall }[action] || [];
  tx(() => {
    run('UPDATE approvals SET status = ?, comments = ?, acted_at = ?, acted_by = ? WHERE id = ?',
      status, [ap.comments, comments].filter(Boolean).join('\n— ') , nowIso(), ctx.user.Id, approvalId);
    const rec = enriched(sys, loadRaw(sys, ap.record_id));
    if (rec && updates.length) updateRecord(sys, ap.record_id, assignmentValues(sys, ap.object, rec, updates), { trusted: true });
    postFeed(ap.record_id, ctx.user.Id, `${status.toLowerCase()} the approval request${comments ? `: "${comments}"` : '.'}`, 'approval', { approvalId, status });
  });
  if (action !== 'recall') notify(ap.submitted_by, `Approval ${status.toLowerCase()}`, `${ctx.user.Name} ${status.toLowerCase()} your request for ${nameOf(ctx, ap.record_id)}`, approvalLink(ap.record_id));
  return getApproval(ctx, approvalId);
}

function shapeApproval(ctx, a) {
  return {
    id: a.id, recordId: a.record_id, recordName: nameOf(ctx, a.record_id), object: a.object,
    objectLabel: getObject(a.object)?.label, process: getMeta(a.process_id)?.label || getMeta(a.process_id)?.name,
    status: a.status, submittedBy: nameOf(ctx, a.submitted_by), submittedById: a.submitted_by,
    approver: nameOf(ctx, a.approver_id), approverId: a.approver_id, comments: a.comments,
    createdAt: a.created_at, actedAt: a.acted_at, actedBy: nameOf(ctx, a.acted_by), canAct: a.status === 'Pending' && canAct(ctx, a),
    canRecall: a.status === 'Pending' && (a.submitted_by === ctx.user.Id || hasPerm(ctx, 'ModifyAllData')),
  };
}

export function getApproval(ctx, id) {
  const a = get('SELECT * FROM approvals WHERE id = ?', id);
  return a ? shapeApproval(ctx, a) : null;
}

export function approvalsForRecord(ctx, recordId) {
  getRecord(ctx, recordId);
  return all('SELECT * FROM approvals WHERE record_id = ? ORDER BY created_at DESC', recordId).map((a) => shapeApproval(ctx, a));
}

export function pendingApprovals(ctx) {
  return all("SELECT * FROM approvals WHERE status = 'Pending' ORDER BY created_at DESC")
    .filter((a) => canAct(ctx, a) && (a.approver_id === ctx.user.Id || prefixOf(a.approver_id) === PREFIX.Group || hasPerm(ctx, 'ModifyAllData')))
    .map((a) => shapeApproval(ctx, a));
}

export function hasApprovalProcess(objApi) {
  return listMeta('approvalProcess', objApi).some((p) => p.active);
}

export { toText, buildContext };
