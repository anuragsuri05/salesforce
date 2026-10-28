// Flow element catalog: labels, icons, colors, defaults and one-line summaries used by the Flow Builder.
import { getObj, fieldAtPath } from '../../api.js';

export const ELEMENT_TYPES = {
  update: { label: 'Update Triggering Record', short: 'Update Record', icon: 'edit', color: '#ff538a', group: 'Data', desc: 'Set field values on the record that started the flow.' },
  updateRelated: { label: 'Update Related Record', short: 'Update Related', icon: 'layers', color: '#ff538a', group: 'Data', desc: 'Update a parent record through one of this record’s lookup fields.' },
  create: { label: 'Create Record', short: 'Create Record', icon: 'plus', color: '#ff538a', group: 'Data', desc: 'Create a new record of any object, using values from this record.' },
  task: { label: 'Create Task', short: 'Create Task', icon: 'task', color: '#0176d3', group: 'Actions', desc: 'Create a follow-up task related to the record.' },
  notify: { label: 'Send Notification', short: 'Notification', icon: 'bell', color: '#0176d3', group: 'Actions', desc: 'Send an in-app (bell) notification to a user.' },
  email: { label: 'Send Email', short: 'Send Email', icon: 'mail', color: '#0176d3', group: 'Actions', desc: 'Send an email alert. Emails are recorded in the Email Log.' },
  post: { label: 'Post to Feed', short: 'Post to Feed', icon: 'message', color: '#0176d3', group: 'Actions', desc: 'Post an update to the record’s Chatter feed.' },
  submitApproval: { label: 'Submit for Approval', short: 'Submit for Approval', icon: 'approval', color: '#0176d3', group: 'Actions', desc: 'Submit the record to the first matching approval process.' },
  aiPrompt: { label: 'AI Prompt', short: 'AI Prompt', icon: 'sparkles', color: '#9050e9', group: 'AI', desc: 'Run a prompt template with generative AI and store the response in a field (runs in the background after save).' },
};

// Element palette groups, in display order.
export const ELEMENT_GROUPS = ['Data', 'Actions', 'AI'];

// Prompt templates known to the builder (id -> { label, object, outputField }), filled by the Flow Builder.
export const promptTemplates = new Map();

export const FLOW_TYPES = {
  record: { label: 'Record-Triggered Flow', short: 'Record-Triggered', icon: 'zap', color: '#3ba755', desc: 'Launches when a record is created, updated or deleted. Use it to update fields, create related records, send notifications and more.' },
  scheduled: { label: 'Schedule-Triggered Flow', short: 'Scheduled', icon: 'clock', color: '#3ba755', desc: 'Launches at a specified time and frequency for each record in a batch that matches your filters.' },
  autolaunched: { label: 'Autolaunched Flow (No Trigger)', short: 'Autolaunched', icon: 'play', color: '#3ba755', desc: 'Launches when invoked by a quick action or another process. Runs against the record it is called on.' },
};

export const TRIGGERS = {
  create: 'A record is created',
  update: 'A record is updated',
  createOrUpdate: 'A record is created or updated',
  delete: 'A record is deleted',
};
export const TRIGGER_SHORT = { create: 'Create', update: 'Update', createOrUpdate: 'Create or Update', delete: 'Delete' };

export const RECIPIENTS = { owner: 'Record Owner', creator: 'Record Creator', ownerManager: 'Owner’s Manager', lastModifiedBy: 'Last Modified By' };
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Which element types may be added to a flow in its current configuration.
export function allowedTypes(flow) {
  const all = Object.keys(ELEMENT_TYPES);
  if (flow.flowType === 'record' && flow.timing === 'before') return ['update'];
  if (flow.flowType === 'record' && flow.trigger === 'delete') return all.filter((t) => !['update', 'post', 'submitApproval', 'aiPrompt'].includes(t));
  return all;
}

let seq = 0;
export function newElementId() { return `el${Date.now().toString(36)}${(seq++).toString(36)}`; }

export function defaultElement(type, flow) {
  const base = { id: newElementId(), type, label: ELEMENT_TYPES[type].short };
  switch (type) {
    case 'update': return { ...base, assignments: [] };
    case 'updateRelated': return { ...base, lookupField: relatedLookups(flow.object)[0]?.apiName || '', assignments: [] };
    case 'create': return { ...base, object: 'Task', assignments: [] };
    case 'task': return { ...base, subject: 'Follow up on {!Name}', dueInDays: 3, priority: 'Normal', assignTo: 'owner', description: '' };
    case 'notify': return { ...base, recipient: 'owner', title: '{!Name} needs your attention', body: '' };
    case 'email': return { ...base, to: 'owner', subject: '{!Name}', body: '' };
    case 'post': return { ...base, body: '' };
    case 'submitApproval': return { ...base, comments: 'Submitted automatically by {!$User.Name}' };
    case 'aiPrompt': return { ...base, templateId: '', outputField: '' };
    default: return base;
  }
}

// Lookup fields usable by "Update Related Record" (single, non-user target).
export function relatedLookups(objApi) {
  const o = getObj(objApi);
  if (!o) return [];
  return o.fields.filter((f) => (f.type === 'Lookup' || f.type === 'MasterDetail') && !f.polymorphic && !f.system
    && !Array.isArray(f.referenceTo) && f.referenceTo !== 'User' && f.referenceTo !== '*' && getObj(f.referenceTo));
}

export function lookupTarget(objApi, lookupField) {
  const f = getObj(objApi)?.fieldMap.get(lookupField);
  return f ? (Array.isArray(f.referenceTo) ? f.referenceTo[0] : f.referenceTo) : null;
}

function fieldLabels(objApi, assignments = []) {
  return assignments.filter((a) => a.field).map((a) => fieldAtPath(objApi, a.field)?.label || a.field);
}

function listText(arr, max = 3) {
  if (!arr.length) return '';
  return arr.slice(0, max).join(', ') + (arr.length > max ? ` +${arr.length - max} more` : '');
}

export function recipientLabel(v, userNames = {}) {
  if (!v) return RECIPIENTS.owner;
  return RECIPIENTS[v] || userNames[v] || 'Specific user';
}

export function emailToLabel(flow, to) {
  if (!to || RECIPIENTS[to]) return RECIPIENTS[to || 'owner'];
  if (to.startsWith('field:')) return `${getObj(flow.object)?.fieldMap.get(to.slice(6))?.label || to.slice(6)} (field)`;
  return to;
}

const trunc = (s, n = 70) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export function summarize(el, flow, userNames = {}) {
  switch (el.type) {
    case 'update': {
      const f = fieldLabels(flow.object, el.assignments);
      return f.length ? `Set ${listText(f)}` : 'No field values set yet';
    }
    case 'updateRelated': {
      const lf = getObj(flow.object)?.fieldMap.get(el.lookupField);
      const target = lookupTarget(flow.object, el.lookupField);
      const f = fieldLabels(target, el.assignments);
      if (!lf) return 'Choose a lookup field';
      return `${lf.label.replace(/ ID$/, '')} → ${f.length ? `set ${listText(f)}` : 'no fields set'}`;
    }
    case 'create': {
      const o = getObj(el.object);
      const f = fieldLabels(el.object, el.assignments);
      return `New ${o?.label || el.object || 'record'}${f.length ? ` · ${listText(f)}` : ''}`;
    }
    case 'task': return `“${trunc(el.subject, 44) || 'Follow up'}” · due in ${Number(el.dueInDays || 0)} day${Number(el.dueInDays) === 1 ? '' : 's'} · ${recipientLabel(el.assignTo, userNames)}`;
    case 'notify': return `To ${recipientLabel(el.recipient, userNames)}: ${trunc(el.title, 50) || '(no title)'}`;
    case 'email': return `To ${emailToLabel(flow, el.to)}: ${trunc(el.subject, 50) || '(no subject)'}`;
    case 'post': return el.body ? trunc(el.body) : 'Empty post';
    case 'submitApproval': return el.comments ? `Comments: ${trunc(el.comments, 56)}` : 'Submit the record for approval';
    case 'aiPrompt': {
      if (!el.templateId) return 'Choose a prompt template';
      const t = promptTemplates.get(el.templateId);
      const fieldApi = el.outputField || t?.outputField;
      const field = fieldApi ? getObj(flow.object)?.fieldMap.get(fieldApi)?.label || fieldApi : null;
      return `Template “${trunc(t?.label || 'Unknown template', 40)}” → ${field || 'choose a field'}`;
    }
    default: return '';
  }
}

export function scheduleText(s) {
  if (!s) return 'No schedule';
  const t = s.time || '00:00';
  switch (s.frequency) {
    case 'hourly': return 'Every hour';
    case 'weekly': return `Weekly on ${DAYS[Number(s.dayOfWeek ?? 1)]} at ${t} UTC`;
    case 'once': return `Once${s.startDate ? ` on ${s.startDate}` : ''} at ${t} UTC`;
    default: return `Daily at ${t} UTC`;
  }
}

export function triggerText(flow) {
  if (flow.flowType === 'scheduled') return scheduleText(flow.schedule);
  if (flow.flowType === 'autolaunched') return 'Invoked by an action';
  if (flow.trigger === 'delete') return 'After Delete';
  return `${flow.timing === 'before' ? 'Before Save' : 'After Save'} · ${TRIGGER_SHORT[flow.trigger] || flow.trigger}`;
}

export function blankFlow(type = 'record') {
  const base = { label: '', name: '', description: '', flowType: type, object: 'Account', elements: [], active: false, order: 0, condition: '', onlyWhenChanged: false, filters: [], filterLogic: '', schedule: null, version: 0 };
  if (type === 'record') return { ...base, trigger: 'createOrUpdate', timing: 'after' };
  if (type === 'scheduled') return { ...base, trigger: 'create', timing: 'after', schedule: { frequency: 'daily', time: '08:00', dayOfWeek: 1, startDate: new Date().toISOString().slice(0, 10) } };
  return { ...base, trigger: 'create', timing: 'after' };
}
