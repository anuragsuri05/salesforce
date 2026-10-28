// Company Information: org profile (name, address, currency, locale, time zone, fiscal year) and storage usage.
import { h, icon, fmt, mount, spinner, toast, setLocale, objIcon } from '../lib.js';
import { GET, PATCH, loadSession, getObj } from '../api.js';
import { setupHeader } from './index.js';
import { canCustomize, formRow, detailField, select, stat, dataTable, TIMEZONES, CURRENCIES, LOCALES, MONTHS, readOnlyNote } from './admin-common.js';

const STORAGE_LIMIT_MB = 1024; // data storage allocation shown on the page
const KB_PER_RECORD = 2; // Salesforce counts most records as 2 KB

export default async function render(container, { app }) {
  app.setTitle('Company Information');
  const canEdit = canCustomize();
  mount(container, setupHeader('Company Information', { crumb: 'Setup › Administration', iconName: 'building' }), spinner());
  const [org, objects] = await Promise.all([GET('/api/setup/org'), GET('/api/setup/objects').catch(() => [])]);
  let company = org.company || {};
  let editing = false;
  const infoCard = h('div', { class: 'card' });

  function drawInfo() {
    if (!editing) {
      const cur = CURRENCIES.find(([c]) => c === company.currency);
      const loc = LOCALES.find(([c]) => c === company.locale);
      mount(infoCard,
        h('div', { class: 'card-header' }, icon('building'), h('h3', 'Organization Detail'), canEdit ? h('button', { class: 'btn btn-sm', onClick: () => { editing = true; drawInfo(); } }, icon('edit'), 'Edit') : null),
        h('div', { class: 'card-body' }, h('div', { class: 'detail-grid' },
          detailField('Organization Name', company.name), detailField('Phone', company.phone ? h('a', { href: `tel:${company.phone}` }, company.phone) : null),
          detailField('Address', company.address ? h('span', { class: 'pre-wrap' }, company.address) : null), detailField('Website', company.website ? h('a', { href: /^https?:/.test(company.website) ? company.website : `https://${company.website}`, target: '_blank', rel: 'noopener noreferrer' }, company.website) : null),
          detailField('Default Currency', company.currency ? `${company.currency}${cur ? ` — ${cur[1]}` : ''}` : null),
          detailField('Default Locale', loc ? loc[1] : company.locale),
          detailField('Default Time Zone', company.timezone),
          detailField('Fiscal Year Starts In', MONTHS[(Number(company.fiscalYearStartMonth) || 1) - 1]),
          detailField('Primary Contact', company.primaryContact),
          detailField('Currency Preview', fmt.currency(1234567.89)))));
      return;
    }
    const v = { ...company };
    const inp = (k, attrs = {}) => h('input', { class: 'input', id: `co-${k}`, value: v[k] || '', ...attrs, onInput: (e) => { v[k] = e.target.value; } });
    const addr = h('textarea', { class: 'input', id: 'co-address', rows: 3, onInput: (e) => { v.address = e.target.value; } });
    addr.value = v.address || '';
    const curOpts = CURRENCIES.some(([c]) => c === v.currency) || !v.currency ? CURRENCIES : [[v.currency, v.currency], ...CURRENCIES];
    const saveBtn = h('button', { class: 'btn btn-brand', onClick: async () => {
      if (!String(v.name || '').trim()) { toast('Organization name is required', 'error'); return; }
      saveBtn.disabled = true;
      try {
        const payload = { name: v.name.trim(), phone: v.phone || '', address: v.address || '', website: v.website || '', primaryContact: v.primaryContact || '',
          currency: v.currency || 'USD', locale: v.locale || 'en-US', timezone: v.timezone || 'UTC', fiscalYearStartMonth: Number(v.fiscalYearStartMonth) || 1 };
        await PATCH('/api/setup/org', { company: payload });
        company = { ...company, ...payload };
        await loadSession().catch(() => {});
        setLocale({ currency: company.currency, locale: company.locale });
        editing = false;
        toast('Company information saved', 'success');
        drawInfo();
      } catch (e) { toast(e.message, 'error'); saveBtn.disabled = false; }
    } }, 'Save');
    mount(infoCard,
      h('div', { class: 'card-header' }, icon('building'), h('h3', 'Edit Organization Detail')),
      h('div', { class: 'card-body' }, h('div', { class: 'form-grid' },
        formRow('Organization Name', inp('name'), { required: true, id: 'co-name' }),
        formRow('Phone', inp('phone', { type: 'tel' }), { id: 'co-phone' }),
        formRow('Address', addr, { id: 'co-address' }),
        h('div', formRow('Website', inp('website', { type: 'url', placeholder: 'https://' }), { id: 'co-website' }), formRow('Primary Contact', inp('primaryContact'), { id: 'co-primaryContact' })),
        formRow('Default Currency (ISO Code)', select(curOpts.map(([c, l]) => [c, `${c} — ${l}`]), v.currency || 'USD', { id: 'co-currency', onChange: (x) => { v.currency = x; } }), { id: 'co-currency' }),
        formRow('Default Locale', select(LOCALES, v.locale || 'en-US', { id: 'co-locale', onChange: (x) => { v.locale = x; } }), { id: 'co-locale', help: 'Controls date and number formats.' }),
        formRow('Default Time Zone', select(TIMEZONES.includes(v.timezone) || !v.timezone ? TIMEZONES : [v.timezone, ...TIMEZONES], v.timezone || 'UTC', { id: 'co-timezone', onChange: (x) => { v.timezone = x; } }), { id: 'co-timezone' }),
        formRow('Fiscal Year Start Month', select(MONTHS.map((m, i) => [String(i + 1), m]), String(v.fiscalYearStartMonth || 1), { id: 'co-fy', onChange: (x) => { v.fiscalYearStartMonth = Number(x); } }), { id: 'co-fy', help: 'Used for fiscal quarters in reports.' }))),
      h('div', { class: 'card-footer' }, h('button', { class: 'btn', onClick: () => { editing = false; drawInfo(); } }, 'Cancel'), saveBtn));
  }
  drawInfo();

  const s = org.stats || {};
  const usedMb = ((s.records || 0) * KB_PER_RECORD) / 1024;
  const pct = Math.min(100, (usedMb / STORAGE_LIMIT_MB) * 100);
  const byObject = objects.filter((o) => o.recordCount > 0).sort((a, b) => b.recordCount - a.recordCount);
  const storageCard = h('div', { class: 'card' },
    h('div', { class: 'card-header' }, icon('database'), h('h3', 'Used Data Storage')),
    h('div', { class: 'card-body' },
      h('div', { class: 'row mb-8' }, h('strong', { class: 'grow' }, `${fmt.number(usedMb, 2)} MB of ${fmt.number(STORAGE_LIMIT_MB)} MB`), h('span', { class: 'muted small' }, `${fmt.number(pct, 2)}% used`)),
      h('div', { class: ['sa-progress', pct > 90 ? 'danger' : pct > 75 ? 'warning' : ''], role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Data storage used' }, h('span', { style: { width: Math.max(pct, 0.5) + '%' } })),
      h('div', { class: 'tiny muted mt-8' }, `${fmt.number(s.records || 0)} records × ${KB_PER_RECORD} KB each.`)),
    byObject.length ? dataTable({ compact: true, rows: byObject, initialSort: { key: 'recordCount', dir: 'desc' }, columns: [
      { key: 'label', label: 'Object', render: (o) => h('div', { class: 'row' }, objIcon(getObj(o.apiName) || o, 'sm'), o.label) },
      { key: 'recordCount', label: 'Records', cls: 'num', render: (o) => fmt.number(o.recordCount) },
      { key: 'storage', label: 'Storage', cls: 'num', render: (o) => `${fmt.number((o.recordCount * KB_PER_RECORD) / 1024, 2)} MB`, sort: (o) => o.recordCount },
      { key: 'pct', label: 'Percent', cls: 'num', render: (o) => `${fmt.number((o.recordCount / Math.max(1, s.records)) * 100, 1)}%`, sort: (o) => o.recordCount },
    ] }).el : null);

  mount(container,
    setupHeader('Company Information', { crumb: 'Setup › Administration', iconName: 'building', description: 'Your organization’s profile and regional defaults. Currency and locale affect how numbers and dates are shown.' }),
    canEdit ? null : readOnlyNote('You need the "Customize Application" permission to change company information.'),
    h('div', { class: 'grid-4 mb-16' },
      stat('Active Users', fmt.number(s.users || 0), 'users'),
      stat('Objects', fmt.number(s.objects || 0), 'layers', `${s.customObjects || 0} custom`),
      stat('Records', fmt.number(s.records || 0), 'database'),
      stat('Data Storage', `${fmt.number(usedMb, 1)} MB`, 'box', `${fmt.number(pct, 1)}% of ${STORAGE_LIMIT_MB} MB`)),
    infoCard, storageCard);
}
