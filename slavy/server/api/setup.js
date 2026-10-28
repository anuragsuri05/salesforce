// Setup API: object manager, fields, layouts, generic metadata, users, org settings, monitoring.
import { all, get, run, audit, orgSetting, setOrgSetting } from '../db.js';
import {
  listObjects, getObject, requireObject, getFields, getField, saveObject, deleteObject, saveField, deleteField,
  listMeta, getMeta, saveMeta, deleteMeta, FIELD_TYPES, childRelationships,
} from '../metadata.js';
import { requirePerm, hasPerm, publicUser, getUser, SYSTEM_PERMISSIONS, OBJECT_PERMS, subordinateRoleIds } from '../security.js';
import { compile, references } from '../formula.js';
import { fieldAtPath, nameOf } from '../records.js';
import { layoutFor, defaultLayout } from '../features.js';
import { runScheduledFlow } from '../automation.js';
import { HttpError, newId, nowIso, hashPassword, PREFIX } from '../util.js';
import crypto from 'node:crypto';

const RESERVED = new Set(['Id', 'Name', 'OwnerId', 'CreatedById', 'CreatedDate', 'LastModifiedById', 'LastModifiedDate']);

function apiFromLabel(label) {
  const base = String(label || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'X$1');
  return base || 'Field';
}

function checkFormula(objApi, formula) {
  const ast = compile(String(formula || ''));
  const bad = [...references(ast)].filter((p) => !p.startsWith('$') && !fieldAtPath(objApi, p));
  if (bad.length) throw new HttpError(400, `Formula references unknown field(s): ${bad.join(', ')}`);
}

// Per-type validation + required permission for the generic metadata endpoints.
const META_RULES = {
  validationRule: {
    perm: 'CustomizeApplication',
    clean: (b) => {
      requireObject(b.object);
      if (!b.name) throw new HttpError(400, 'Rule name is required');
      if (!b.errorMessage) throw new HttpError(400, 'Error message is required');
      checkFormula(b.object, b.formula);
      return { name: b.name, object: b.object, description: b.description || '', formula: b.formula, errorMessage: b.errorMessage, errorField: b.errorField || '', active: b.active !== false };
    },
  },
  flow: {
    perm: 'ManageFlows',
    clean: (b) => {
      if (!b.label) throw new HttpError(400, 'Flow label is required');
      if (!['record', 'scheduled', 'autolaunched'].includes(b.flowType)) throw new HttpError(400, 'Flow type must be record, scheduled or autolaunched');
      requireObject(b.object);
      if (b.condition) checkFormula(b.object, b.condition);
      const elements = (b.elements || []).map((e, i) => {
        if (!['update', 'updateRelated', 'create', 'task', 'notify', 'email', 'post', 'submitApproval', 'aiPrompt'].includes(e.type)) throw new HttpError(400, `Unknown element type ${e.type}`);
        if (e.type === 'aiPrompt') {
          const t = getMeta(e.templateId, 'promptTemplate');
          if (!t) throw new HttpError(400, 'AI Prompt step: choose a prompt template');
          if (t.object !== b.object) throw new HttpError(400, `AI Prompt step: template "${t.label}" is for ${t.object}, not ${b.object}`);
          const of = getField(b.object, e.outputField || t.outputField);
          if (!of || !['Text', 'TextArea', 'LongTextArea'].includes(of.type)) throw new HttpError(400, 'AI Prompt step: choose a text field to store the response');
        }
        if (b.flowType === 'record' && b.timing === 'before' && e.type !== 'update') throw new HttpError(400, 'Before-save flows can only update the triggering record');
        if (e.condition) checkFormula(b.object, e.condition);
        if (e.type === 'create') requireObject(e.object);
        for (const a of e.assignments || []) {
          const target = e.type === 'create' ? e.object : e.type === 'updateRelated' ? getField(b.object, e.lookupField)?.referenceTo : b.object;
          if (target && !getField(target, a.field)) throw new HttpError(400, `Unknown field ${a.field} on ${target}`);
          if (a.isFormula) checkFormula(b.object, a.value);
        }
        return { ...e, id: e.id || `el${i + 1}` };
      });
      return {
        name: b.name || apiFromLabel(b.label), label: b.label, description: b.description || '', flowType: b.flowType, object: b.object,
        trigger: b.trigger || 'create', timing: b.timing === 'before' ? 'before' : 'after', condition: b.condition || '', onlyWhenChanged: !!b.onlyWhenChanged,
        filters: b.filters || [], filterLogic: b.filterLogic || '', schedule: b.schedule || null, elements, active: !!b.active, order: Number(b.order) || 0,
        version: (Number(b.version) || 0) + 1,
      };
    },
  },
  approvalProcess: {
    perm: 'CustomizeApplication',
    clean: (b) => {
      requireObject(b.object);
      if (!b.label) throw new HttpError(400, 'Process name is required');
      if (b.entryCriteria) checkFormula(b.object, b.entryCriteria);
      return {
        name: b.name || apiFromLabel(b.label), label: b.label, object: b.object, description: b.description || '', entryCriteria: b.entryCriteria || '',
        approver: b.approver || { kind: 'manager' }, onSubmit: b.onSubmit || [], onApprove: b.onApprove || [], onReject: b.onReject || [], onRecall: b.onRecall || [],
        active: !!b.active, order: Number(b.order) || 0,
      };
    },
  },
  app: {
    perm: 'CustomizeApplication',
    clean: (b, existing) => {
      if (!b.label) throw new HttpError(400, 'App name is required');
      return { name: b.name || apiFromLabel(b.label), label: b.label, description: b.description || '', color: b.color || '#4f46e5', icon: b.icon || b.label[0],
        items: (b.items || []).filter(Boolean), profiles: b.profiles || [], active: b.active !== false, console: !!b.console,
        sortOrder: b.sortOrder != null && b.sortOrder !== '' ? Number(b.sortOrder) : existing?.sortOrder ?? null };
    },
  },
  action: {
    perm: 'CustomizeApplication',
    clean: (b) => {
      requireObject(b.object);
      if (!b.label) throw new HttpError(400, 'Label is required');
      if (!['update', 'create', 'flow', 'url'].includes(b.actionType)) throw new HttpError(400, 'Action type must be update, create, flow or url');
      if (b.actionType === 'create') requireObject(b.childObject);
      return { name: b.name || apiFromLabel(b.label), label: b.label, object: b.object, actionType: b.actionType, assignments: b.assignments || [],
        childObject: b.childObject || null, lookupField: b.lookupField || null, flowId: b.flowId || null, url: b.url || '', fields: b.fields || [],
        successMessage: b.successMessage || '', confirm: b.confirm || '', active: b.active !== false };
    },
  },
  sharingRule: {
    perm: 'CustomizeApplication',
    clean: (b) => {
      requireObject(b.object);
      if (!b.label) throw new HttpError(400, 'Label is required');
      if (!b.sharedWith?.kind) throw new HttpError(400, 'Choose who to share with');
      return { name: b.name || apiFromLabel(b.label), label: b.label, object: b.object, ruleType: b.ruleType === 'criteria' ? 'criteria' : 'owner',
        ownedBy: b.ownedBy || null, filters: b.filters || [], filterLogic: b.filterLogic || '', sharedWith: b.sharedWith, access: b.access === 'edit' ? 'edit' : 'read', active: b.active !== false };
    },
  },
  profile: {
    perm: 'ManageUsers',
    clean: (b) => ({ name: b.name, description: b.description || '', permissions: cleanPerms(b.permissions), license: b.license || 'Slavy' }),
  },
  permissionSet: {
    perm: 'ManageUsers',
    clean: (b) => ({ name: b.name, label: b.label || b.name, description: b.description || '', permissions: cleanPerms(b.permissions) }),
  },
  role: {
    perm: 'ManageUsers',
    clean: (b, existing) => {
      if (!b.name) throw new HttpError(400, 'Role name is required');
      if (existing && b.parentId && (b.parentId === existing.id || subordinateRoleIds(existing.id).has(b.parentId))) throw new HttpError(400, 'A role cannot report to itself or its subordinates');
      return { name: b.name, parentId: b.parentId || null, description: b.description || '' };
    },
  },
  group: {
    perm: 'ManageUsers',
    clean: (b) => {
      if (!b.label) throw new HttpError(400, 'Label is required');
      return { name: b.name || apiFromLabel(b.label), label: b.label, kind: b.kind === 'queue' ? 'queue' : 'public', members: b.members || [], queueObjects: b.queueObjects || [], email: b.email || '' };
    },
  },
  promptTemplate: {
    perm: 'CustomizeApplication',
    clean: (b) => {
      if (!b.label) throw new HttpError(400, 'Template name is required');
      requireObject(b.object);
      if (!String(b.instructions || '').trim()) throw new HttpError(400, 'Prompt instructions are required');
      const type = ['summary', 'email', 'field', 'flex'].includes(b.templateType) ? b.templateType : 'flex';
      if (b.outputField) {
        const f = getField(b.object, b.outputField);
        if (!f || !['Text', 'TextArea', 'LongTextArea'].includes(f.type)) throw new HttpError(400, 'Output field must be a text field');
      }
      if (type === 'field' && !b.outputField) throw new HttpError(400, 'Field generation templates need an output field');
      return { name: b.name || apiFromLabel(b.label), label: b.label, description: b.description || '', object: b.object, templateType: type,
        instructions: String(b.instructions), outputField: b.outputField || null, active: b.active !== false };
    },
  },
  layout: {
    perm: 'CustomizeApplication',
    clean: (b) => {
      requireObject(b.object);
      return { name: b.name || `${b.object} Layout`, object: b.object, sections: b.sections || [], relatedLists: b.relatedLists || [] };
    },
  },
};

function cleanPerms(p = {}) {
  const system = {};
  for (const [k] of SYSTEM_PERMISSIONS) if (p.system?.[k]) system[k] = true;
  const objects = {};
  for (const [obj, ops] of Object.entries(p.objects || {})) {
    if (!getObject(obj)) continue;
    objects[obj] = Object.fromEntries(OBJECT_PERMS.filter((k) => ops[k]).map((k) => [k, true]));
  }
  const fields = {};
  for (const [key, fls] of Object.entries(p.fields || {})) fields[key] = { read: !!fls.read || !!fls.edit, edit: !!fls.edit };
  return { system, objects, fields };
}

function userRow(u) {
  const pu = publicUser(u);
  return { ...pu, ProfileName: getMeta(u.profile_id)?.name, RoleName: getMeta(u.role_id)?.name, ManagerName: u.manager_id ? publicUser(getUser(u.manager_id))?.Name : null,
    PermissionSets: all('SELECT permset_id FROM permset_assignments WHERE user_id = ?', u.id).map((r) => r.permset_id) };
}

export function registerSetup(r) {
  const view = (ctx) => requirePerm(ctx, 'ViewSetup', 'CustomizeApplication', 'ManageUsers');

  // ---------- objects ----------
  r.get('/api/setup/objects', ({ ctx }) => {
    view(ctx);
    return listObjects().map((o) => ({ ...o, fieldCount: getFields(o.apiName).length, recordCount: get('SELECT COUNT(*) AS n FROM records WHERE object = ? AND is_deleted = 0', o.apiName).n }));
  });
  r.get('/api/setup/objects/:api', ({ ctx, params }) => {
    view(ctx);
    const o = requireObject(params.api);
    return {
      ...o, fields: getFields(o.apiName), children: childRelationships(o.apiName), layout: layoutFor(o.apiName), defaultLayout: defaultLayout(o.apiName),
      validationRules: listMeta('validationRule', o.apiName), actions: listMeta('action', o.apiName), flows: listMeta('flow', o.apiName),
      approvalProcesses: listMeta('approvalProcess', o.apiName), sharingRules: listMeta('sharingRule', o.apiName),
      fieldTypes: FIELD_TYPES,
    };
  });
  r.post('/api/setup/objects', ({ ctx, body }) => {
    requirePerm(ctx, 'CustomizeApplication');
    const apiName = body.apiName ? (body.apiName.endsWith('__c') ? body.apiName : body.apiName + '__c') : apiFromLabel(body.label) + '__c';
    const obj = saveObject({
      apiName, label: body.label, pluralLabel: body.pluralLabel, description: body.description || '', isCustom: true,
      nameField: body.nameField || { label: `${body.label} Name`, type: 'Text' }, sharingModel: body.sharingModel || 'ReadWrite',
      trackHistory: !!body.trackHistory, enableActivities: body.enableActivities !== false, enableFeed: body.enableFeed !== false,
      icon: body.icon || body.label[0].toUpperCase(), color: body.color || '#0ea5e9', highlightFields: [], searchable: true,
    }, ctx.user.Id, { isNew: true });
    for (const appId of body.addToApps || []) {
      const app = getMeta(appId, 'app');
      if (app && !app.items.includes(obj.apiName)) saveMeta('app', { ...app, items: [...app.items, obj.apiName] }, ctx.user.Id);
    }
    for (const pid of body.grantProfiles || []) {
      const p = getMeta(pid, 'profile');
      if (!p) continue;
      const perms = p.permissions || {};
      perms.objects = { ...(perms.objects || {}), [obj.apiName]: { read: true, create: true, edit: true, delete: true } };
      saveMeta('profile', { ...p, permissions: perms }, ctx.user.Id);
    }
    return obj;
  });
  r.patch('/api/setup/objects/:api', ({ ctx, params, body }) => {
    requirePerm(ctx, 'CustomizeApplication');
    const o = requireObject(params.api);
    const allowed = ['label', 'pluralLabel', 'description', 'sharingModel', 'trackHistory', 'enableActivities', 'enableFeed', 'icon', 'color',
      'highlightFields', 'pathField', 'listColumns', 'searchable', 'nameField'];
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    if (patch.nameField && o.nameField?.type !== patch.nameField.type && get('SELECT 1 FROM records WHERE object = ? LIMIT 1', o.apiName)) {
      throw new HttpError(400, 'Cannot change the record name data type once records exist');
    }
    if (patch.sharingModel && !['Private', 'Read', 'ReadWrite', 'ControlledByParent'].includes(patch.sharingModel)) throw new HttpError(400, 'Invalid sharing model');
    if (patch.pathField) {
      const f = getField(o.apiName, patch.pathField);
      if (!f || f.type !== 'Picklist') throw new HttpError(400, 'Path field must be a picklist');
    }
    return saveObject({ ...patch, apiName: o.apiName }, ctx.user.Id);
  });
  r.delete('/api/setup/objects/:api', ({ ctx, params }) => {
    requirePerm(ctx, 'CustomizeApplication');
    deleteObject(params.api, ctx.user.Id);
    return { ok: true };
  });

  // ---------- fields ----------
  r.post('/api/setup/objects/:api/fields', ({ ctx, params, body }) => {
    requirePerm(ctx, 'CustomizeApplication');
    const o = requireObject(params.api);
    let apiName = body.apiName || apiFromLabel(body.label);
    if (!apiName.endsWith('__c')) apiName += '__c';
    if (RESERVED.has(apiName)) throw new HttpError(400, 'Reserved field name');
    if (body.type === 'Formula') checkFormula(o.apiName, body.formula);
    if (body.type === 'Rollup') {
      const md = getField(body.rollup?.childObject, body.rollup?.relField);
      if (!md || md.type !== 'MasterDetail' || md.referenceTo !== o.apiName) throw new HttpError(400, 'Roll-up summary fields need a master-detail relationship from the child object to this object');
    }
    const f = saveField(o.apiName, { ...cleanField(body), apiName, isCustom: true }, ctx.user.Id, { isNew: true });
    // Add new field to the page layout if one exists.
    const layout = listMeta('layout', o.apiName)[0];
    if (layout && body.addToLayout !== false && layout.sections?.length) {
      const sections = layout.sections.map((s, i) => (i === 0 ? { ...s, fields: [...s.fields, f.apiName] } : s));
      saveMeta('layout', { ...layout, sections }, ctx.user.Id);
    }
    if (f.type === 'MasterDetail' || f.type === 'Lookup') {
      const parentLayout = listMeta('layout', f.referenceTo)[0];
      if (parentLayout && body.addRelatedList !== false) {
        saveMeta('layout', { ...parentLayout, relatedLists: [...(parentLayout.relatedLists || []), { object: o.apiName, field: f.apiName, label: f.relatedListLabel || o.pluralLabel, columns: ['Name', 'CreatedDate'] }] }, ctx.user.Id);
      }
    }
    return f;
  });
  r.patch('/api/setup/objects/:api/fields/:field', ({ ctx, params, body }) => {
    requirePerm(ctx, 'CustomizeApplication');
    const o = requireObject(params.api);
    const existing = getField(o.apiName, params.field);
    if (!existing) throw new HttpError(404, 'Field not found');
    if (existing.system) {
      // Allow relabeling a few system fields (e.g. Name label) via the object definition.
      if (existing.apiName === 'Name' && body.label) { saveObject({ apiName: o.apiName, nameField: { ...o.nameField, label: body.label } }, ctx.user.Id); return getField(o.apiName, 'Name'); }
      throw new HttpError(400, 'System fields cannot be edited');
    }
    const merged = { ...existing, ...cleanField({ ...existing, ...body }) };
    if (merged.type === 'Formula') checkFormula(o.apiName, merged.formula);
    return saveField(o.apiName, merged, ctx.user.Id);
  });
  r.delete('/api/setup/objects/:api/fields/:field', ({ ctx, params }) => {
    requirePerm(ctx, 'CustomizeApplication');
    deleteField(params.api, params.field, ctx.user.Id);
    return { ok: true };
  });

  // ---------- generic metadata ----------
  r.get('/api/setup/meta/:type', ({ ctx, params, query }) => {
    view(ctx);
    if (!META_RULES[params.type]) throw new HttpError(404, 'Unknown metadata type');
    return listMeta(params.type, query.object || undefined);
  });
  r.get('/api/setup/meta/:type/:id', ({ ctx, params }) => {
    view(ctx);
    const m = getMeta(params.id, params.type);
    if (!m) throw new HttpError(404, 'Not found');
    return m;
  });
  const saveTyped = (ctx, type, body, existing) => {
    const rule = META_RULES[type];
    if (!rule) throw new HttpError(404, 'Unknown metadata type');
    requirePerm(ctx, rule.perm);
    const clean = rule.clean(body, existing);
    const saved = saveMeta(type, existing ? { ...clean, id: existing.id } : clean, ctx.user.Id);
    audit(ctx.user.Id, typeSection(type), existing ? `Changed ${type}` : `Created ${type}`, saved.label || saved.name);
    return saved;
  };
  r.post('/api/setup/meta/:type', ({ ctx, params, body }) => saveTyped(ctx, params.type, body, null));
  r.put('/api/setup/meta/:type/:id', ({ ctx, params, body }) => {
    const existing = getMeta(params.id, params.type);
    if (!existing) throw new HttpError(404, 'Not found');
    return saveTyped(ctx, params.type, { ...body, version: existing.version }, existing);
  });
  r.delete('/api/setup/meta/:type/:id', ({ ctx, params }) => {
    const rule = META_RULES[params.type];
    if (!rule) throw new HttpError(404, 'Unknown metadata type');
    requirePerm(ctx, rule.perm);
    const m = getMeta(params.id, params.type);
    if (!m) throw new HttpError(404, 'Not found');
    if (params.type === 'profile' && get('SELECT 1 FROM users WHERE profile_id = ?', m.id)) throw new HttpError(400, 'Profile is assigned to users');
    if (params.type === 'role' && get('SELECT 1 FROM users WHERE role_id = ?', m.id)) throw new HttpError(400, 'Role is assigned to users');
    if (params.type === 'role' && listMeta('role').some((x) => x.parentId === m.id)) throw new HttpError(400, 'Role has child roles');
    if (params.type === 'permissionSet') run('DELETE FROM permset_assignments WHERE permset_id = ?', m.id);
    if (params.type === 'group' && get('SELECT 1 FROM records WHERE owner_id = ? AND is_deleted = 0', m.id)) throw new HttpError(400, 'Queue still owns records');
    deleteMeta(m.id);
    audit(ctx.user.Id, typeSection(params.type), `Deleted ${params.type}`, m.label || m.name);
    return { ok: true };
  });
  r.post('/api/setup/flows/:id/run', ({ ctx, params }) => {
    requirePerm(ctx, 'ManageFlows');
    const f = getMeta(params.id, 'flow');
    if (!f || f.flowType !== 'scheduled') throw new HttpError(400, 'Only scheduled flows can be run from Setup');
    return runScheduledFlow(f.id, ctx.user.Id);
  });
  r.get('/api/setup/flow-runs', ({ ctx }) => { view(ctx); return orgSetting('flowRuns', {}); });

  // ---------- users ----------
  r.get('/api/setup/users', ({ ctx }) => {
    view(ctx);
    return all('SELECT * FROM users ORDER BY last_name, first_name').map(userRow);
  });
  r.get('/api/users', () => all('SELECT * FROM users WHERE is_active = 1 ORDER BY first_name, last_name').map(publicUser).map((u) => ({ Id: u.Id, Name: u.Name, Title: u.Title, Email: u.Email })));
  r.post('/api/setup/users', ({ ctx, body }) => {
    requirePerm(ctx, 'ManageUsers');
    const username = String(body.Username || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(username)) throw new HttpError(400, 'Username must look like an email address');
    if (get('SELECT 1 FROM users WHERE lower(username) = ?', username)) throw new HttpError(400, 'Username already exists');
    if (!body.LastName) throw new HttpError(400, 'Last name is required');
    if (!getMeta(body.ProfileId, 'profile')) throw new HttpError(400, 'Profile is required');
    const temp = body.Password || crypto.randomBytes(6).toString('base64url') + '7a!';
    const id = newId(PREFIX.User);
    run(`INSERT INTO users(id, username, email, first_name, last_name, alias, title, phone, profile_id, role_id, manager_id, is_active, password_hash, timezone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`, id, username, body.Email || username, body.FirstName || '', body.LastName,
      body.Alias || (String(body.FirstName || '')[0] || '') + String(body.LastName).slice(0, 4).toLowerCase(), body.Title || '', body.Phone || '',
      body.ProfileId, body.RoleId || null, body.ManagerId || null, hashPassword(temp), body.TimeZone || 'UTC', nowIso());
    audit(ctx.user.Id, 'Manage Users', 'Created user', username);
    return { ...userRow(getUser(id)), temporaryPassword: body.Password ? undefined : temp };
  });
  r.patch('/api/setup/users/:id', ({ ctx, params, body }) => {
    requirePerm(ctx, 'ManageUsers');
    const u = getUser(params.id);
    if (!u) throw new HttpError(404, 'User not found');
    const cols = { FirstName: 'first_name', LastName: 'last_name', Email: 'email', Alias: 'alias', Title: 'title', Phone: 'phone', ProfileId: 'profile_id', RoleId: 'role_id', ManagerId: 'manager_id', TimeZone: 'timezone' };
    if (body.ManagerId && body.ManagerId === u.id) throw new HttpError(400, 'A user cannot be their own manager');
    if ('ProfileId' in body && !getMeta(body.ProfileId, 'profile')) throw new HttpError(400, 'Invalid profile');
    for (const [k, col] of Object.entries(cols)) if (k in body) run(`UPDATE users SET ${col} = ? WHERE id = ?`, body[k] || null, u.id);
    if ('Username' in body) {
      const un = String(body.Username).trim().toLowerCase();
      if (get('SELECT 1 FROM users WHERE lower(username) = ? AND id != ?', un, u.id)) throw new HttpError(400, 'Username already exists');
      run('UPDATE users SET username = ? WHERE id = ?', un, u.id);
    }
    if ('IsActive' in body) {
      if (!body.IsActive && u.id === ctx.user.Id) throw new HttpError(400, 'You cannot deactivate yourself');
      run('UPDATE users SET is_active = ? WHERE id = ?', body.IsActive ? 1 : 0, u.id);
      if (!body.IsActive) run('DELETE FROM sessions WHERE user_id = ?', u.id);
    }
    if (Array.isArray(body.PermissionSets)) {
      run('DELETE FROM permset_assignments WHERE user_id = ?', u.id);
      for (const ps of body.PermissionSets) if (getMeta(ps, 'permissionSet')) run('INSERT INTO permset_assignments(user_id, permset_id) VALUES (?, ?)', u.id, ps);
    }
    audit(ctx.user.Id, 'Manage Users', 'Changed user', u.username);
    return userRow(getUser(u.id));
  });
  r.post('/api/setup/users/:id/reset-password', ({ ctx, params }) => {
    requirePerm(ctx, 'ManageUsers');
    const u = getUser(params.id);
    if (!u) throw new HttpError(404, 'User not found');
    const temp = crypto.randomBytes(6).toString('base64url') + '7a!';
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(temp), u.id);
    run('DELETE FROM sessions WHERE user_id = ?', u.id);
    audit(ctx.user.Id, 'Manage Users', 'Reset password', u.username);
    return { temporaryPassword: temp };
  });

  // ---------- org settings ----------
  r.get('/api/setup/org', ({ ctx }) => {
    view(ctx);
    return { company: orgSetting('company', {}), webToLead: orgSetting('webToLead', {}), webToCase: orgSetting('webToCase', {}),
      stats: { records: get('SELECT COUNT(*) AS n FROM records WHERE is_deleted = 0').n, users: get('SELECT COUNT(*) AS n FROM users WHERE is_active = 1').n,
        objects: listObjects().length, customObjects: listObjects().filter((o) => o.isCustom).length } };
  });
  r.patch('/api/setup/org', ({ ctx, body }) => {
    requirePerm(ctx, 'CustomizeApplication');
    for (const key of ['company', 'webToLead', 'webToCase']) {
      if (body[key]) setOrgSetting(key, { ...orgSetting(key, {}), ...body[key] });
    }
    audit(ctx.user.Id, 'Company Profile', 'Changed organization settings', Object.keys(body).join(', '));
    return { ok: true };
  });

  // ---------- monitoring ----------
  r.get('/api/setup/audit', ({ ctx }) => {
    view(ctx);
    return all('SELECT * FROM audit_trail ORDER BY id DESC LIMIT 500').map((a) => ({ ...a, user: nameOf({ cache: new Map() }, a.user_id) }));
  });
  r.get('/api/setup/logins', ({ ctx }) => { requirePerm(ctx, 'ManageUsers'); return all('SELECT * FROM login_history ORDER BY id DESC LIMIT 500'); });
  r.get('/api/setup/emails', ({ ctx }) => {
    view(ctx);
    return all('SELECT * FROM email_log ORDER BY sent_at DESC LIMIT 500').map((e) => ({ ...e, sentBy: nameOf({ cache: new Map() }, e.sent_by) }));
  });
  r.get('/api/setup/meta-catalog', ({ ctx }) => {
    view(ctx);
    return { systemPermissions: SYSTEM_PERMISSIONS, objectPermissions: OBJECT_PERMS, fieldTypes: FIELD_TYPES };
  });
}

function typeSection(type) {
  return { validationRule: 'Customize', flow: 'Flows', approvalProcess: 'Approval Processes', app: 'Apps', action: 'Customize', sharingRule: 'Sharing Rules',
    profile: 'Manage Users', permissionSet: 'Manage Users', role: 'Manage Users', group: 'Manage Users', layout: 'Customize', promptTemplate: 'Prompt Builder' }[type] || 'Setup';
}

function cleanField(b) {
  const out = {
    label: String(b.label || '').slice(0, 80), type: b.type, required: !!b.required, unique: !!b.unique, externalId: !!b.externalId,
    helpText: b.helpText || '', description: b.description || '', defaultValue: b.defaultValue ?? null, trackHistory: !!b.trackHistory,
  };
  if (['Text', 'TextArea', 'LongTextArea'].includes(b.type)) out.length = Math.min(Number(b.length) || (b.type === 'LongTextArea' ? 32768 : 255), b.type === 'LongTextArea' ? 131072 : 255);
  if (['Number', 'Currency', 'Percent'].includes(b.type)) { out.precision = Number(b.precision) || 18; out.scale = b.scale == null || b.scale === '' ? (b.type === 'Currency' ? 2 : 0) : Number(b.scale); }
  if (['Picklist', 'MultiPicklist'].includes(b.type)) {
    out.values = (b.values || []).map((v) => (typeof v === 'string' ? { value: v, label: v } : { ...v, value: String(v.value).trim(), label: v.label || v.value })).filter((v) => v.value);
    out.restricted = b.restricted !== false;
  }
  if (['Lookup', 'MasterDetail'].includes(b.type)) {
    out.referenceTo = b.referenceTo; out.relatedListLabel = b.relatedListLabel || ''; out.deleteConstraint = b.type === 'MasterDetail' ? 'cascade' : b.deleteConstraint || 'setNull';
    out.reparentable = !!b.reparentable;
  }
  if (b.type === 'Formula') { out.formula = b.formula; out.returnType = b.returnType || 'Text'; if (b.scale != null) out.scale = Number(b.scale); }
  if (b.type === 'Rollup') { out.rollup = b.rollup; out.returnType = b.returnType || 'Number'; out.scale = b.scale == null ? 2 : Number(b.scale); }
  if (b.type === 'AutoNumber') out.format = b.format || '{0000}';
  if (b.type === 'TextArea' || b.type === 'LongTextArea') out.visibleLines = Number(b.visibleLines) || 3;
  return out;
}
