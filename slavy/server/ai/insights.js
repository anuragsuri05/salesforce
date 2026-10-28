// Rule-based deal & case insights (no LLM): overdue close dates, inactivity, slipping deals, stuck stages, aging cases.
import { all } from '../db.js';
import { getObject } from '../metadata.js';
import { getRecord, visibleRecords } from '../records.js';
import { activitiesFor } from '../features.js';
import { todayStr } from '../util.js';

const days = (a, b = new Date()) => Math.floor((b - new Date(a)) / 86400000);

function lastActivity(ctx, id) {
  try {
    const a = activitiesFor(ctx, id);
    const dates = [...a.past, ...a.upcoming].map((x) => x.LastModifiedDate || x.CreatedDate).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : null;
  } catch { return null; }
}

function history(id, field) {
  return all('SELECT * FROM field_history WHERE record_id = ? AND field = ? ORDER BY id', id, field);
}

export function insightsFor(ctx, id) {
  const r = getRecord(ctx, id);
  const obj = r.attributes.type;
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const today = todayStr();
  if (obj === 'Opportunity' && !r.IsClosed) {
    if (r.CloseDate && r.CloseDate < today) add('high', 'Close date has passed', `The close date (${r.CloseDate}) is ${days(r.CloseDate)} days in the past. Update it or close the deal.`);
    const pushes = history(id, 'CloseDate').filter((h) => h.old_value && h.new_value && h.new_value > h.old_value).length;
    if (pushes >= 2) add('medium', 'Deal is slipping', `The close date has been pushed out ${pushes} times.`);
    const last = lastActivity(ctx, id);
    if (!last || days(last) > 30) add('medium', 'No recent activity', last ? `No activity logged in ${days(last)} days.` : 'No activities have been logged on this deal.');
    const stageChanges = history(id, 'StageName');
    const since = stageChanges.length ? stageChanges[stageChanges.length - 1].changed_at : r.CreatedDate;
    if (since && days(since) > 45) add('medium', 'Stuck in stage', `In "${r.StageName}" for ${days(since)} days.`);
    if (Number(r.Amount) >= 100000 && r.Approval_Status__c && r.Approval_Status__c !== 'Approved' && ['Proposal/Price Quote', 'Negotiation/Review'].includes(r.StageName)) {
      add('low', 'Approval needed before closing', 'Deals of $100K or more need manager approval before they can be Closed Won.');
    }
    if (r.CloseDate && r.CloseDate >= today && days(today, new Date(r.CloseDate)) <= 14 && Number(r.Probability) < 50) {
      add('medium', 'Closing soon at low probability', `Closes in ${days(today, new Date(r.CloseDate))} days but the probability is only ${r.Probability}%.`);
    }
  }
  if (obj === 'Case' && r.Status !== 'Closed') {
    const age = days(r.CreatedDate);
    if (r.Priority === 'High' && age > 3) add('high', 'Aging high-priority case', `Open for ${age} days.`);
    else if (age > 14) add('medium', 'Aging case', `Open for ${age} days.`);
    if (r.Status === 'Escalated') add('high', 'Escalated', 'This case is escalated — make sure a manager is engaged.');
    const last = lastActivity(ctx, id);
    if (!last || days(last) > 5) add('low', 'Customer may be waiting', last ? `Last activity ${days(last)} days ago.` : 'No activities logged yet.');
  }
  if (obj === 'Lead' && !r.IsConverted) {
    if (r.Status === 'Open - Not Contacted' && days(r.CreatedDate) > 3) add(r.Rating === 'Hot' ? 'high' : 'medium', 'Not contacted yet', `Created ${days(r.CreatedDate)} days ago and still not contacted.`);
    if (r.Rating === 'Hot' && !lastActivity(ctx, id)) add('medium', 'Hot lead without follow-up', 'Log a call or create a task.');
  }
  if (obj === 'Account') {
    const cases = getObject('Case') ? visibleRecords(ctx, 'Case', { where: { t: 'and', items: [{ t: 'cmp', field: 'AccountId', op: '=', value: id }, { t: 'cmp', field: 'Status', op: '!=', value: 'Closed' }] } }).length : 0;
    if (cases >= 3) add('high', 'Several open cases', `${cases} open support cases — consider a check-in call.`);
    const opps = getObject('Opportunity') ? visibleRecords(ctx, 'Opportunity', { where: { t: 'cmp', field: 'AccountId', op: '=', value: id } }).map((x) => x.rec) : [];
    if (String(r.Type || '').startsWith('Customer') && !opps.some((o) => !o.IsClosed)) add('low', 'No open pipeline', 'This customer has no open opportunities — explore upsell or renewal.');
    const last = lastActivity(ctx, id);
    if (!last || days(last) > 60) add('low', 'Relationship going quiet', last ? `No activity in ${days(last)} days.` : 'No activities logged.');
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// Highest-severity insights across the user's open deals and cases.
export function myInsights(ctx, { limit = 8 } = {}) {
  const items = [];
  for (const objApi of ['Opportunity', 'Case']) {
    if (!getObject(objApi)) continue;
    let recs = [];
    try { recs = visibleRecords(ctx, objApi, { scope: 'mine' }).map((i) => i.rec); } catch { continue; }
    for (const r of recs) {
      if (objApi === 'Opportunity' && r.IsClosed) continue;
      if (objApi === 'Case' && r.Status === 'Closed') continue;
      for (const ins of insightsFor(ctx, r.Id)) if (ins.severity !== 'low') items.push({ ...ins, recordId: r.Id, recordName: r.Name, object: objApi });
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, limit);
}
