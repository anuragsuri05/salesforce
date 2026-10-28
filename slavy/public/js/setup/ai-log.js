// Setup › AI › AI Audit Trail: every generative AI request (Trust Layer log) and background AI jobs.
import { h, icon, mount, clear, fmt, spinner, emptyState, modal, badge } from '../lib.js';
import { GET } from '../api.js';
import { aiHeader, FEATURE_LABELS, STATUS_KIND, maskedPre } from './ai-common.js';
import { searchBox, select, dataTable, downloadCsv, detailField } from './admin-common.js';

export default async function render(container, { app, query }) {
  app.setTitle('AI Audit Trail');
  let tab = query.tab === 'jobs' ? 'jobs' : 'requests';
  const refreshBtn = h('button', { class: 'btn', onClick: () => draw() }, icon('refresh'), 'Refresh');
  const tabBar = h('div', { class: 'tabs aia-tabs', role: 'tablist' });
  const body = h('div');
  mount(container,
    aiHeader('AI Audit Trail', { crumb: 'Setup › AI', description: 'Every generative AI request made in your org — who, which feature and model, latency, tokens and what the Trust Layer masked.', actions: [refreshBtn] }),
    h('div', { class: 'card' }, tabBar, body));

  const drawTabs = () => {
    clear(tabBar);
    for (const [k, l] of [['requests', 'Requests'], ['jobs', 'Background Jobs']]) {
      tabBar.appendChild(h('button', { class: ['tab', tab === k && 'active'], role: 'tab', 'aria-selected': String(tab === k), onClick: () => { tab = k; draw(); } }, l));
    }
  };

  async function draw() {
    drawTabs();
    mount(body, spinner());
    try {
      if (tab === 'requests') await requests(body);
      else await jobs(body);
    } catch (e) { mount(body, h('div', { class: 'p-24' }, emptyState('Could not load the AI audit trail', e.message, { iconName: 'lock' }))); }
  }
  await draw();
}

const featureLabel = (f) => FEATURE_LABELS[f] || f || 'Other';
const statusBadge = (s) => badge(s || '—', STATUS_KIND[s] ?? '');
const recordLink = (id, name) => (id ? h('a', { href: `#/r/${id}`, onClick: (e) => e.stopPropagation() }, name || id) : h('span', { class: 'muted' }, '—'));

async function requests(body) {
  const rows = await GET('/api/setup/ai/log');
  let term = '', feature = '', status = '';
  const features = [...new Set(rows.map((r) => r.feature).filter(Boolean))].sort();
  const statuses = [...new Set(rows.map((r) => r.status).filter(Boolean))].sort();
  const filtered = () => rows.filter((r) => (!feature || r.feature === feature) && (!status || r.status === status)
    && (!term || [r.user, r.feature, featureLabel(r.feature), r.provider, r.model, r.recordName, r.status, r.error].some((v) => String(v || '').toLowerCase().includes(term))));
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const table = dataTable({ rows: [], initialSort: { key: 'at', dir: 'desc' }, empty: rows.length ? 'No requests match your filters.' : 'No AI requests yet.', rowClass: () => 'aia-row-click', columns: [
    { key: 'at', label: 'Time', render: (r) => h('span', { class: 'nowrap', dataset: { logId: String(r.id) }, title: fmt.relative(r.at) }, fmt.datetime(r.at)), sort: (r) => r.at },
    { key: 'user', label: 'User', render: (r) => r.user || h('span', { class: 'muted' }, 'System') },
    { key: 'feature', label: 'Feature', render: (r) => h('span', { class: 'aia-feature' }, featureLabel(r.feature)), sort: (r) => featureLabel(r.feature) },
    { key: 'model', label: 'Provider / Model', render: (r) => h('div', h('div', { class: 'small' }, r.provider || '—'), h('div', { class: 'tiny muted mono' }, r.model || '')) },
    { key: 'recordName', label: 'Record', render: (r) => recordLink(r.record_id, r.recordName) },
    { key: 'status', label: 'Status', render: (r) => h('span', { title: r.error || '' }, statusBadge(r.status)) },
    { key: 'latency_ms', label: 'Latency', cls: 'right', render: (r) => (r.latency_ms != null ? `${fmt.number(r.latency_ms, 0)} ms` : '—') },
    { key: 'input_tokens', label: 'Tokens In / Out', cls: 'right', render: (r) => h('span', { class: 'nowrap' }, `${fmt.number(r.input_tokens || 0, 0)} / ${fmt.number(r.output_tokens || 0, 0)}`) },
    { key: 'masked', label: 'Masked', cls: 'right', render: (r) => (r.masked ? h('span', { class: 'aia-masked', title: 'Values masked by the Trust Layer' }, icon('shield', { size: 12 }), String(r.masked)) : h('span', { class: 'muted' }, '0')) },
  ] });
  table.el.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const id = e.target.closest('tr')?.querySelector('[data-log-id]')?.dataset.logId;
    if (id && byId.has(id)) detail(byId.get(id));
  });
  const count = h('span', { class: 'muted small' });
  const apply = () => { const f = filtered(); count.textContent = `${f.length} of ${rows.length} requests`; table.setRows(f); };
  apply();
  const fSel = select([['', 'All features'], ...features.map((f) => [f, featureLabel(f)])], '', { cls: 'input input-sm', ariaLabel: 'Filter by feature', onChange: (v) => { feature = v; apply(); } });
  const sSel = select([['', 'All statuses'], ...statuses.map((s) => [s, s])], '', { cls: 'input input-sm', ariaLabel: 'Filter by status', onChange: (v) => { status = v; apply(); } });
  fSel.style.width = '180px'; sSel.style.width = '140px';
  const totals = rows.reduce((t, r) => ({ tin: t.tin + (r.input_tokens || 0), tout: t.tout + (r.output_tokens || 0), err: t.err + (r.status === 'Error' ? 1 : 0), masked: t.masked + (r.masked || 0) }), { tin: 0, tout: 0, err: 0, masked: 0 });
  const csv = h('button', { class: 'btn btn-sm', onClick: () => downloadCsv('ai-audit-trail', [
    ['at', 'Time'], ['user', 'User'], [(r) => featureLabel(r.feature), 'Feature'], ['provider', 'Provider'], ['model', 'Model'], ['record_id', 'Record Id'], ['recordName', 'Record'],
    ['status', 'Status'], ['error', 'Error'], ['latency_ms', 'Latency (ms)'], ['input_tokens', 'Tokens In'], ['output_tokens', 'Tokens Out'], ['masked', 'Masked Values'],
  ], filtered()) }, icon('download'), 'Download CSV');
  mount(body,
    h('div', { class: 'aia-log-stats' },
      h('div', h('span', { class: 'aia-log-n' }, fmt.number(rows.length, 0)), h('span', { class: 'tiny muted' }, 'Requests (latest 300)')),
      h('div', h('span', { class: 'aia-log-n' }, fmt.compact(totals.tin)), h('span', { class: 'tiny muted' }, 'Tokens in')),
      h('div', h('span', { class: 'aia-log-n' }, fmt.compact(totals.tout)), h('span', { class: 'tiny muted' }, 'Tokens out')),
      h('div', h('span', { class: 'aia-log-n' }, String(totals.err)), h('span', { class: 'tiny muted' }, 'Errors')),
      h('div', h('span', { class: 'aia-log-n' }, fmt.number(totals.masked, 0)), h('span', { class: 'tiny muted' }, 'Values masked'))),
    h('div', { class: 'sa-toolbar' }, fSel, sSel, count, h('div', { class: 'spacer' }), csv, searchBox('Search requests...', (t) => { term = t; apply(); })),
    table.el,
    h('div', { class: 'tiny muted aia-log-foot' }, icon('info', { size: 12 }), ' Click a row to see the prompt sent to the model and its response. Masked values appear as highlighted tokens.'));
}

function detail(r) {
  const m = modal({
    title: `${featureLabel(r.feature)} · ${fmt.datetime(r.at)}`, size: 'lg',
    body: h('div',
      h('div', { class: 'aia-log-meta' },
        detailField('User', r.user || 'System'), detailField('Status', statusBadge(r.status)),
        detailField('Provider', r.provider), detailField('Model', h('span', { class: 'mono' }, r.model || '')),
        detailField('Record', recordLink(r.record_id, r.recordName)), detailField('Latency', r.latency_ms != null ? `${fmt.number(r.latency_ms, 0)} ms` : ''),
        detailField('Tokens In / Out', `${fmt.number(r.input_tokens || 0, 0)} / ${fmt.number(r.output_tokens || 0, 0)}`),
        detailField('Masked Values', r.masked ? h('span', { class: 'aia-masked' }, icon('shield', { size: 12 }), `${r.masked} masked by the Trust Layer`) : '0')),
      r.error ? h('div', { class: 'alert danger mb-16' }, icon('alert'), h('div', r.error)) : null,
      h('div', { class: 'aia-log-io' },
        h('div', h('div', { class: 'aia-io-title' }, icon('arrowUp', { size: 13 }), 'Prompt sent to the model'), maskedPre(r.prompt)),
        h('div', h('div', { class: 'aia-io-title' }, icon('arrowDown', { size: 13 }), 'Response'), maskedPre(r.response))),
      !r.prompt && !r.response ? h('div', { class: 'small muted mt-8' }, 'Prompt logging is off or nothing was returned. Turn on “Log prompts & responses” in AI Settings to capture them.') : null),
    footer: [h('button', { class: 'btn btn-brand', onClick: () => m.close() }, 'Close')],
  });
}

async function jobs(body) {
  const [rows, templates] = await Promise.all([GET('/api/setup/ai/jobs'), GET('/api/setup/meta/promptTemplate').catch(() => [])]);
  const tplName = Object.fromEntries(templates.map((t) => [t.id, t.label]));
  let status = '';
  const table = dataTable({ rows: [], initialSort: { key: 'created_at', dir: 'desc' }, empty: rows.length ? 'No jobs match.' : 'No background AI jobs yet. Flows with an “AI Prompt” element queue jobs here.', columns: [
    { key: 'created_at', label: 'Created', render: (r) => h('span', { class: 'nowrap', title: fmt.relative(r.created_at) }, fmt.datetime(r.created_at)), sort: (r) => r.created_at },
    { key: 'kind', label: 'Kind', render: (r) => (r.kind === 'flowPrompt' ? h('span', { class: 'row gap-4' }, icon('flow', { size: 13 }), 'Flow AI Prompt') : r.kind) },
    { key: 'template', label: 'Template', render: (r) => (r.payload?.templateId ? h('a', { href: `#/setup/prompts/${r.payload.templateId}` }, tplName[r.payload.templateId] || r.payload.templateId) : '—'), sort: (r) => tplName[r.payload?.templateId] },
    { key: 'record', label: 'Record', render: (r) => recordLink(r.payload?.recordId, r.payload?.recordId), sort: (r) => r.payload?.recordId },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
    { key: 'attempts', label: 'Attempts', cls: 'right' },
    { key: 'finished_at', label: 'Finished', render: (r) => (r.finished_at ? h('span', { class: 'nowrap small' }, fmt.datetime(r.finished_at)) : h('span', { class: 'muted' }, '—')) },
    { key: 'result', label: 'Result / Error', render: (r) => (r.result ? h('span', { class: ['aia-job-result', r.status === 'Failed' && 'err'], title: r.result }, r.result) : h('span', { class: 'muted' }, '—')) },
  ] });
  const count = h('span', { class: 'muted small' });
  const apply = () => { const f = rows.filter((r) => !status || r.status === status); count.textContent = `${f.length} job${f.length === 1 ? '' : 's'}`; table.setRows(f); };
  apply();
  const sSel = select([['', 'All statuses'], ...['Queued', 'Running', 'Done', 'Failed'].map((s) => [s, s])], '', { cls: 'input input-sm', ariaLabel: 'Filter by status', onChange: (v) => { status = v; apply(); } });
  sSel.style.width = '150px';
  mount(body,
    h('div', { class: 'sa-toolbar' }, sSel, count, h('div', { class: 'spacer' }), h('span', { class: 'tiny muted' }, 'Jobs run in the background every few seconds; failed jobs are retried (up to 3 attempts).')),
    table.el);
}
