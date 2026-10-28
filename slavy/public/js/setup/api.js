// Setup › API & SOQL: REST API reference, copyable curl examples and a SOQL cheat sheet.
import { h, icon, mount, toast, badge } from '../lib.js';
import { can } from '../api.js';
import { setupHeader } from './index.js';

function copyText(text) {
  const done = () => toast('Copied to clipboard', 'success', { timeout: 1500 });
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(done, () => fallback());
  fallback();
  function fallback() {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch { toast('Copy failed — select the text manually', 'error'); }
    ta.remove();
  }
}

export function codeBlock(text, { lang = 'bash' } = {}) {
  return h('div', { class: 'doc-code' },
    h('div', { class: 'doc-code-bar' }, h('span', { class: 'tiny muted' }, lang), h('button', { class: 'btn btn-ghost btn-sm', onClick: () => copyText(text), 'aria-label': 'Copy code' }, icon('copy', { size: 13 }), 'Copy')),
    h('pre', { class: 'doc-pre' }, text));
}

const METHOD_CLS = { GET: 'get', POST: 'post', PATCH: 'patch', DELETE: 'delete' };

export default async function apiDocs(container, { app }) {
  app.setTitle('API & SOQL');
  const origin = location.origin;
  const base = '/services/data/v1.0';
  const endpoints = [
    ['POST', '/services/oauth2/token', 'Log in (grant_type=password) and get a Bearer access token.'],
    ['GET', '/services/data', 'List available API versions (no auth).'],
    ['GET', `${base}`, 'Resources available in this version.'],
    ['GET', `${base}/limits`, 'API request and data storage limits.'],
    ['GET', `${base}/sobjects`, 'List the objects you can access.'],
    ['GET', `${base}/sobjects/{Object}`, 'Object summary and recently created records.'],
    ['GET', `${base}/sobjects/{Object}/describe`, 'Full metadata: fields, types, picklist values, relationships.'],
    ['POST', `${base}/sobjects/{Object}`, 'Create a record. Returns { id, success, errors }.'],
    ['GET', `${base}/sobjects/{Object}/{Id}?fields=Name,Industry`, 'Retrieve a record (optionally only some fields).'],
    ['PATCH', `${base}/sobjects/{Object}/{Id}`, 'Update a record. Returns 204 No Content.'],
    ['DELETE', `${base}/sobjects/{Object}/{Id}`, 'Delete a record (moves it to the Recycle Bin).'],
    ['PATCH', `${base}/sobjects/{Object}/{ExternalIdField}/{value}`, 'Upsert by an External ID field.'],
    ['GET', `${base}/query?q={SOQL}`, 'Run a SOQL query (up to 2,000 rows).'],
    ['GET', `${base}/search?q=FIND {term}`, 'Search across searchable objects.'],
  ];

  const auth = `curl -s ${origin}/services/oauth2/token \\
  -d grant_type=password \\
  -d username=admin@slavy.dev \\
  -d password=slavy123`;
  const tokenVar = `TOKEN=$(curl -s ${origin}/services/oauth2/token \\
  -d grant_type=password -d username=admin@slavy.dev -d password=slavy123 \\
  | sed -E 's/.*"access_token":"([^"]+)".*/\\1/')`;
  const query = `curl -s -H "Authorization: Bearer $TOKEN" \\
  "${origin}${base}/query?q=SELECT+Id,Name,Industry+FROM+Account+WHERE+Industry='Technology'+LIMIT+5"`;
  const create = `curl -s -X POST -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"Name":"Acme Robotics","Industry":"Technology"}' \\
  ${origin}${base}/sobjects/Account`;
  const update = `curl -s -X PATCH -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"Rating":"Hot"}' \\
  ${origin}${base}/sobjects/Account/001XXXXXXXXXXXX`;
  const describe = `curl -s -H "Authorization: Bearer $TOKEN" ${origin}${base}/sobjects/Opportunity/describe`;
  const js = `const res = await fetch('${origin}${base}/query?q=' + encodeURIComponent('SELECT Id, Name FROM Contact LIMIT 10'), {
  headers: { Authorization: 'Bearer ' + token },
});
const { totalSize, records } = await res.json();`;

  const soql = [
    ['Basic query', 'SELECT Id, Name, Industry FROM Account'],
    ['Filter & sort', "SELECT Name, Amount, StageName FROM Opportunity WHERE Amount > 50000 AND IsClosed = false ORDER BY Amount DESC LIMIT 10"],
    ['Parent fields (dot notation)', 'SELECT Name, Account.Name, Account.Industry, Owner.Name FROM Opportunity'],
    ['Child subquery', 'SELECT Name, (SELECT Name, Email FROM Contacts) FROM Account LIMIT 5'],
    ['LIKE and IN', "SELECT Name FROM Lead WHERE Company LIKE 'Acme%' AND Status IN ('Open - Not Contacted', 'Working - Contacted')"],
    ['Date literals', 'SELECT Name, CloseDate FROM Opportunity WHERE CloseDate = THIS_QUARTER'],
    ['Relative dates', 'SELECT Subject FROM Case WHERE CreatedDate = LAST_N_DAYS:30'],
    ['Aggregates', 'SELECT StageName, COUNT(Id), SUM(Amount) total FROM Opportunity GROUP BY StageName'],
    ['Count', 'SELECT COUNT() FROM Contact'],
    ['All fields', 'SELECT FIELDS(ALL) FROM Account LIMIT 5'],
    ['Multi-select picklists', "SELECT Name FROM Project__c WHERE Workstreams__c INCLUDES ('Build')"],
    ['Null checks & paging', 'SELECT Name FROM Contact WHERE Email != null ORDER BY Name NULLS LAST LIMIT 20 OFFSET 20'],
  ];

  const devConsole = can('RunSoql') || can('ModifyAllData');

  mount(container,
    setupHeader('API & SOQL', {
      crumb: 'Setup › Developer', iconName: 'code',
      description: 'Integrate with Slavy using a Salesforce-compatible REST API, and query data with SOQL.',
      actions: devConsole ? [h('a', { class: 'btn btn-brand', href: '#/devconsole' }, icon('code'), 'Open Developer Console')] : [],
    }),
    h('div', { class: 'doc-layout' },
      h('nav', { class: 'card doc-toc', 'aria-label': 'On this page' },
        h('div', { class: 'group-title' }, 'On this page'),
        [['auth', 'Authentication'], ['endpoints', 'Endpoints'], ['examples', 'Examples'], ['errors', 'Errors'], ['soql', 'SOQL Cheat Sheet']].map(([id, l]) =>
          h('a', { href: `#/setup/api`, onClick: (e) => { e.preventDefault(); document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, l))),
      h('div', { class: 'doc-main' },
        h('div', { class: 'card', id: 'doc-auth' }, h('div', { class: 'card-header' }, icon('key'), h('h3', 'Authentication')), h('div', { class: 'card-body doc-prose' },
          h('p', 'Request an access token with the OAuth 2.0 ', h('strong', 'username-password'), ' flow, then send it on every call in the ', h('code', 'Authorization: Bearer <token>'), ' header. Tokens are session IDs and expire like normal sessions. The user needs the ', h('strong', 'API Enabled'), ' permission.'),
          codeBlock(auth),
          h('p', 'Response:'),
          codeBlock(JSON.stringify({ access_token: '6f1c…', instance_url: origin, token_type: 'Bearer', issued_at: '1767225600000', id: `${origin}/id/005…` }, null, 2), { lang: 'json' }),
          h('p', 'Save it in a shell variable for the examples below:'),
          codeBlock(tokenVar),
          h('div', { class: 'alert' }, icon('info'), h('div', 'Inside the Slavy web app you are already authenticated with your session cookie — the Developer Console’s REST Explorer uses it automatically.')))),
        h('div', { class: 'card', id: 'doc-endpoints' }, h('div', { class: 'card-header' }, icon('list'), h('h3', 'Endpoints'), badge('v1.0', 'brand')), h('div', { class: 'card-body flush table-wrap' },
          h('table', { class: 'table' }, h('thead', h('tr', h('th', 'Method'), h('th', 'Path'), h('th', 'Description'))),
            h('tbody', endpoints.map(([m, p, d]) => h('tr', h('td', h('span', { class: `http-method ${METHOD_CLS[m]}` }, m)), h('td', h('code', p)), h('td', { style: { whiteSpace: 'normal' } }, d))))))),
        h('div', { class: 'card', id: 'doc-examples' }, h('div', { class: 'card-header' }, icon('code'), h('h3', 'Examples')), h('div', { class: 'card-body doc-prose' },
          h('h4', 'Run a SOQL query'), codeBlock(query),
          h('h4', 'Create a record'), codeBlock(create),
          h('h4', 'Update a record'), codeBlock(update),
          h('h4', 'Describe an object'), codeBlock(describe),
          h('h4', 'From JavaScript'), codeBlock(js, { lang: 'javascript' }))),
        h('div', { class: 'card', id: 'doc-errors' }, h('div', { class: 'card-header' }, icon('alert'), h('h3', 'Errors')), h('div', { class: 'card-body doc-prose' },
          h('p', 'Errors use the Salesforce format — an array of ', h('code', '{ message, errorCode, fields }'), ' with an HTTP status code:'),
          h('table', { class: 'table compact' }, h('tbody',
            [['400', 'MALFORMED_QUERY / FIELD_CUSTOM_VALIDATION_EXCEPTION', 'Bad SOQL, failed validation rule or required field missing'], ['401', 'INVALID_SESSION_ID', 'Missing, invalid or expired token'], ['403', 'INSUFFICIENT_ACCESS', 'No permission for the object, field or record'], ['404', 'NOT_FOUND', 'Unknown object or record']]
              .map(([s, c, d]) => h('tr', h('td', h('strong', s)), h('td', h('code', c)), h('td', { style: { whiteSpace: 'normal' } }, d))))))),
        h('div', { class: 'card', id: 'doc-soql' }, h('div', { class: 'card-header' }, icon('database'), h('h3', 'SOQL Cheat Sheet'),
          devConsole ? h('a', { class: 'btn btn-sm', href: '#/devconsole' }, icon('external', { size: 13 }), 'Try in Developer Console') : null), h('div', { class: 'card-body doc-prose' },
          h('p', 'SOQL respects object, field and record-level security for the running user. Supported: ', ['SELECT', 'FROM', 'WHERE', 'AND/OR/NOT', '=, !=, <, >, <=, >=', 'LIKE', 'IN / NOT IN', 'INCLUDES / EXCLUDES', 'GROUP BY', 'ORDER BY … ASC|DESC NULLS FIRST|LAST', 'LIMIT', 'OFFSET', 'COUNT / SUM / AVG / MIN / MAX / COUNT_DISTINCT', 'FIELDS(ALL|STANDARD|CUSTOM)'].map((k) => h('code', { class: 'doc-kw' }, k))),
          h('div', { class: 'soql-grid' }, soql.map(([t, q]) => h('div', { class: 'soql-item' },
            h('div', { class: 'row' }, h('strong', { class: 'grow small' }, t),
              h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': `Copy query: ${t}`, title: 'Copy', onClick: () => copyText(q) }, icon('copy', { size: 13 })),
              devConsole ? h('a', { class: 'btn btn-ghost btn-sm btn-icon', href: `#/devconsole?q=${encodeURIComponent(q)}`, 'aria-label': `Run query: ${t}`, title: 'Run in Developer Console' }, icon('play', { size: 13 })) : null),
            h('code', { class: 'soql-q' }, q)))),
          h('p', { class: 'small muted mt-16' }, 'Date literals: TODAY, YESTERDAY, TOMORROW, THIS_WEEK, LAST_WEEK, NEXT_WEEK, THIS_MONTH, LAST_MONTH, NEXT_MONTH, THIS_QUARTER, LAST_QUARTER, NEXT_QUARTER, THIS_YEAR, LAST_YEAR, NEXT_YEAR, LAST_90_DAYS, NEXT_90_DAYS, LAST_N_DAYS:n, NEXT_N_DAYS:n, LAST_N_MONTHS:n. Child relationship names are the plural label without spaces (e.g. Contacts, Opportunities, Cases).'))))));
}
