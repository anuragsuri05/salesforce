// Global search results: "Top Results" across objects, or all matches in one object.
import { h, icon, mount, clear, objIcon, spinner, emptyState } from '../lib.js';
import { GET, getObj, fieldAtPath } from '../api.js';
import { displayValue } from '../fields.js';

export default async function render(root, { query, app }) {
  const q = (query.q || '').trim();
  app.setTitle(`Search: ${q}`);
  if (q.length < 2) {
    mount(root, h('div', { class: 'card p-24' }, emptyState('Search Slavy', 'Type at least 2 characters in the search box at the top of the page.', { iconName: 'search' })));
    return;
  }
  const groups = await GET(`/api/search?q=${encodeURIComponent(q)}`);
  let active = query.object || 'top';
  const side = h('div', { class: 'card setup-nav' });
  const main = h('div', { class: 'col gap-16' });
  mount(root, h('div', { class: 'page-header' }, h('div', { class: 'title-row' }, h('div', { class: 'setup-icon', style: { background: 'var(--brand)' } }, icon('search')),
    h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, 'Search Results'), h('h1', `"${q}"`)))),
  h('div', { class: 'setup-layout' }, side, main));

  function drawSide() {
    clear(side);
    side.appendChild(h('div', { class: 'group-title' }, 'Search Results'));
    side.appendChild(h('a', { href: `#/search?q=${encodeURIComponent(q)}`, class: active === 'top' ? 'active' : '', onClick: (e) => { e.preventDefault(); active = 'top'; draw(); } }, 'Top Results'));
    for (const g of groups) {
      side.appendChild(h('a', { href: `#/search?q=${encodeURIComponent(q)}&object=${g.object}`, class: active === g.object ? 'active' : '', onClick: (e) => { e.preventDefault(); active = g.object; draw(); } },
        `${g.label} (${g.total})`));
    }
  }

  function table(objApi, records, columns) {
    const obj = getObj(objApi);
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', h('tr', columns.map((c) => h('th', fieldAtPath(objApi, c)?.fullLabel || c)))),
      h('tbody', records.map((r) => h('tr', columns.map((c) => {
        const f = obj.fieldMap.get(c);
        return h('td', f ? displayValue(f, r[c], r) : r[c]);
      }))))));
  }

  async function draw() {
    drawSide();
    if (!groups.length) { mount(main, h('div', { class: 'card p-24' }, emptyState('No results', `We couldn't find any records matching "${q}". Check the spelling or try fewer words.`))); return; }
    if (active === 'top') {
      mount(main, groups.map((g) => h('div', { class: 'card' },
        h('div', { class: 'card-header' }, objIcon(getObj(g.object), 'sm'), h('h3', `${g.label} (${g.total})`),
          g.total > g.records.length ? h('button', { class: 'btn btn-sm', onClick: () => { active = g.object; draw(); } }, 'View More') : null),
        table(g.object, g.records, g.columns))));
      return;
    }
    mount(main, spinner());
    const [g] = await GET(`/api/search?q=${encodeURIComponent(q)}&object=${active}`);
    if (!g) { mount(main, h('div', { class: 'card p-24' }, emptyState('No results', ''))); return; }
    mount(main, h('div', { class: 'card' }, h('div', { class: 'card-header' }, objIcon(getObj(g.object), 'sm'), h('h3', `${g.label} (${g.total})`)), table(g.object, g.records, g.columns)));
  }
  draw();
}
