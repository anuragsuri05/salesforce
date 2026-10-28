// Slavy charts: dependency-free, theme-aware SVG renderers for reports and dashboards.
// renderChart(chartData, { type, height, measure, stacked, legend }) -> HTMLElement
// renderMetric(value, measure, { label, sub }) -> HTMLElement
// renderGauge(value, { min, max, breakpoints, measure, height }) -> HTMLElement
// chartData shape (from the server): { type, labels: [], series: [{ name, values: [] }], measure: { key, label, type }, stacked }
import { h, fmt, clear } from './lib.js';

const NS = 'http://www.w3.org/2000/svg';
export const CHART_TYPES = [
  { id: 'column', label: 'Vertical Bar', icon: 'chart' },
  { id: 'bar', label: 'Horizontal Bar', icon: 'list' },
  { id: 'line', label: 'Line', icon: 'activity' },
  { id: 'pie', label: 'Pie', icon: 'target' },
  { id: 'donut', label: 'Donut', icon: 'target' },
  { id: 'funnel', label: 'Funnel', icon: 'filter' },
];
export const PALETTE_SIZE = 10;
export const color = (i) => `var(--chart-${(((i % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE) + 1})`;

function s(tag, attrs, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v);
  for (const c of children.flat()) if (c != null && c !== false) el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  return el;
}

// ---------- formatting ----------
export function formatter(measure) {
  const t = measure?.type || 'Number';
  const num = (v) => Number(v ?? 0);
  if (t === 'Currency') return { short: (v) => fmt.currency(num(v), { compact: Math.abs(num(v)) >= 1000 }), full: (v) => fmt.currency(num(v)) };
  if (t === 'Percent') return { short: (v) => fmt.percent(num(v)), full: (v) => fmt.percent(num(v)) };
  return { short: (v) => (Math.abs(num(v)) >= 10000 ? fmt.compact(num(v)) : fmt.number(num(v))), full: (v) => fmt.number(num(v)) };
}

export function formatValue(v, measure, { compact = false } = {}) {
  if (v == null || v === '') return '—';
  const f = formatter(measure);
  return compact ? f.short(v) : f.full(v);
}

function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range || 1));
  const f = range / 10 ** exp;
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

export function niceTicks(min, max, count = 5) {
  if (min === max) { if (max === 0) max = 1; else if (max > 0) min = 0; else max = 0; }
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, count - 1), true);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

const textWidth = (str, size = 11) => String(str).length * size * 0.58;
function truncate(str, maxPx, size = 11) {
  str = String(str ?? '');
  const max = Math.max(3, Math.floor(maxPx / (size * 0.58)));
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ---------- shared shell (resize, tooltip, legend) ----------
function shell(opts, drawFn) {
  const wrap = h('div', { class: 'an-chart' });
  if (typeof opts.height === 'number') wrap.style.height = opts.height + 'px';
  const tip = h('div', { class: 'an-tip', role: 'tooltip' });
  const tips = new WeakMap();
  let last = '';
  const ctx = {
    wrap,
    setTip(el, title, rows) { tips.set(el, { title, rows }); el.classList.add('an-hit'); },
  };
  const draw = (force) => {
    const W = Math.round(wrap.clientWidth || opts.width || 560);
    const H = Math.round(wrap.clientHeight || (typeof opts.height === 'number' ? opts.height : 280));
    const key = `${W}x${H}`;
    if (!force && key === last) return;
    last = key;
    clear(wrap);
    tip.classList.remove('show');
    drawFn(ctx, W, Math.max(80, H));
    wrap.appendChild(tip);
  };
  ctx.redraw = () => draw(true);
  wrap.addEventListener('mousemove', (e) => {
    const t = e.target.closest?.('.an-hit');
    const data = t && tips.get(t);
    if (!data) { tip.classList.remove('show'); return; }
    clear(tip);
    tip.appendChild(h('div', { class: 'an-tip-title' }, data.title));
    for (const r of data.rows) {
      tip.appendChild(h('div', { class: 'an-tip-row' }, r.color ? h('span', { class: 'an-swatch', style: { background: r.color } }) : null,
        h('span', { class: 'grow' }, r.name), h('strong', r.value)));
    }
    tip.classList.add('show');
    const box = wrap.getBoundingClientRect();
    let x = e.clientX - box.left + 14, y = e.clientY - box.top + 14;
    if (x + tip.offsetWidth > box.width - 4) x = e.clientX - box.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > box.height) y = Math.max(0, e.clientY - box.top - tip.offsetHeight - 10);
    tip.style.left = Math.max(0, x) + 'px';
    tip.style.top = y + 'px';
  });
  wrap.addEventListener('mouseleave', () => tip.classList.remove('show'));
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => { if (!wrap.isConnected) return; draw(false); });
    ro.observe(wrap);
  }
  // First paint once attached to the DOM (ResizeObserver fires too; draw() is idempotent per size).
  requestAnimationFrame(() => { if (wrap.isConnected) draw(false); });
  return wrap;
}

function legendEl(items, { onToggle, hidden, vertical } = {}) {
  return h('div', { class: ['an-legend', vertical && 'vertical'] }, items.map((it, i) => h(onToggle ? 'button' : 'div', {
    class: ['an-legend-item', hidden?.has(i) && 'off'], type: onToggle ? 'button' : null, title: it.title || it.name,
    'aria-pressed': onToggle ? String(!hidden?.has(i)) : null,
    onClick: onToggle ? () => onToggle(i) : null,
    onMouseenter: it.onHover ? () => it.onHover(true) : null, onMouseleave: it.onHover ? () => it.onHover(false) : null,
  }, h('span', { class: 'an-swatch', style: { background: it.color } }), h('span', { class: 'an-legend-label' }, it.name), it.value ? h('span', { class: 'an-legend-value' }, it.value) : null)));
}

function emptyChart(msg = 'No data to display') {
  return h('div', { class: 'an-chart an-chart-empty' }, h('div', { class: 'an-empty-bars' }, h('i'), h('i'), h('i'), h('i')), h('div', msg));
}

function hasData(chart) {
  return chart && Array.isArray(chart.labels) && chart.labels.length && Array.isArray(chart.series) && chart.series.length
    && chart.series.some((se) => (se.values || []).some((v) => Number(v)));
}

// Combine all series into one value per label (for pie, donut, funnel).
function collapse(chart) {
  return chart.labels.map((label, i) => ({ label, value: chart.series.reduce((sum, se) => sum + (Number(se.values?.[i]) || 0), 0) }));
}

// ---------- public API ----------
export function renderChart(chart, opts = {}) {
  const type = opts.type || chart?.type || 'column';
  if (type === 'none') return null;
  if (!hasData(chart)) return emptyChart(opts.emptyText);
  const measure = opts.measure || chart.measure;
  const o = { ...opts, type, measure, f: formatter(measure) };
  let el;
  if (type === 'pie' || type === 'donut') el = shell(o, (ctx, W, H) => drawPie(ctx, chart, o, W, H));
  else if (type === 'funnel') el = shell(o, (ctx, W, H) => drawFunnel(ctx, chart, o, W, H));
  else {
    const hidden = new Set();
    el = shell(o, (ctx, W, H) => drawCartesian(ctx, chart, { ...o, horizontal: type === 'bar', line: type === 'line', hidden }, W, H));
  }
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${chart.title || measure?.label || 'Chart'}: ${type} chart of ${chart.labels.length} groups`);
  el.classList.add(`an-chart-${type}`);
  return el;
}

function drawCartesian(ctx, chart, o, W, H) {
  const { horizontal, line, hidden, f } = o;
  const allSeries = chart.series.map((se, i) => ({ ...se, idx: i }));
  const multi = allSeries.length > 1;
  const series = allSeries.filter((se) => !hidden.has(se.idx));
  const stacked = !line && (o.stacked ?? chart.stacked) && series.length > 1;
  const labels = chart.labels.map((l) => (l == null || l === '' ? '-' : String(l)));
  const n = labels.length;

  let legendH = 0;
  if (multi && o.legend !== false) {
    const lg = legendEl(allSeries.map((se) => ({ name: se.name, color: color(se.idx) })), {
      hidden, onToggle: (i) => { if (hidden.has(i)) hidden.delete(i); else if (hidden.size < allSeries.length - 1) hidden.add(i); ctx.redraw(); },
    });
    ctx.wrap.appendChild(lg);
    legendH = lg.offsetHeight + 4;
  }
  const PH = H - legendH;

  // value domain
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    if (stacked) {
      let pos = 0, neg = 0;
      for (const se of series) { const v = Number(se.values[i]) || 0; if (v >= 0) pos += v; else neg += v; }
      hi = Math.max(hi, pos); lo = Math.min(lo, neg);
    } else for (const se of series) { const v = Number(se.values[i]) || 0; hi = Math.max(hi, v); lo = Math.min(lo, v); }
  }
  const ticks = niceTicks(lo, hi, horizontal ? Math.max(3, Math.min(6, Math.floor(W / 90))) : Math.max(3, Math.min(6, Math.floor(PH / 45))));
  const vmin = ticks[0], vmax = ticks[ticks.length - 1];
  const tickLabels = ticks.map((t) => f.short(t));
  const maxLabel = Math.max(...labels.map((l) => l.length));

  const m = { top: 12, right: 14, bottom: 24, left: 10 };
  let rotate = false;
  if (horizontal) {
    m.left = Math.max(40, Math.min(W * 0.34, textWidth('x'.repeat(Math.min(maxLabel, 30))) + 18));
    m.right = 18;
  } else {
    m.left = Math.max(...tickLabels.map((t) => textWidth(t))) + 14;
    const band = (W - m.left - m.right) / n;
    if (textWidth('x'.repeat(maxLabel)) > band - 6) { rotate = true; m.bottom = Math.min(96, textWidth('x'.repeat(Math.min(maxLabel, 18))) * 0.72 + 22); }
  }
  const pw = Math.max(20, W - m.left - m.right), ph = Math.max(20, PH - m.top - m.bottom);
  const svg = s('svg', { viewBox: `0 0 ${W} ${PH}`, width: W, height: PH, class: 'an-svg' });
  const scale = (v) => (horizontal ? m.left + ((v - vmin) / (vmax - vmin)) * pw : m.top + ph - ((v - vmin) / (vmax - vmin)) * ph);
  const zero = scale(Math.max(vmin, Math.min(0, vmax)));

  // grid + value axis
  const grid = s('g', { class: 'an-grid' });
  ticks.forEach((t, i) => {
    const p = scale(t);
    if (horizontal) {
      grid.appendChild(s('line', { x1: p, x2: p, y1: m.top, y2: m.top + ph, class: t === 0 ? 'zero' : '' }));
      grid.appendChild(s('text', { x: p, y: m.top + ph + 16, 'text-anchor': 'middle', class: 'an-axis' }, tickLabels[i]));
    } else {
      grid.appendChild(s('line', { x1: m.left, x2: m.left + pw, y1: p, y2: p, class: t === 0 ? 'zero' : '' }));
      grid.appendChild(s('text', { x: m.left - 8, y: p + 4, 'text-anchor': 'end', class: 'an-axis' }, tickLabels[i]));
    }
  });
  svg.appendChild(grid);

  // category axis
  const band = (horizontal ? ph : pw) / n;
  const cat = s('g', { class: 'an-cat' });
  const step = horizontal ? Math.max(1, Math.ceil(13 / band)) : rotate ? Math.max(1, Math.ceil(13 / band)) : 1;
  labels.forEach((l, i) => {
    if (i % step) return;
    const c = (i + 0.5) * band;
    if (horizontal) cat.appendChild(s('text', { x: m.left - 8, y: m.top + c + 4, 'text-anchor': 'end', class: 'an-axis an-cat-label' }, s('title', {}, l), truncate(l, m.left - 14)));
    else if (rotate) cat.appendChild(s('text', { transform: `translate(${m.left + c + 3},${m.top + ph + 12}) rotate(-38)`, 'text-anchor': 'end', class: 'an-axis an-cat-label' }, s('title', {}, l), truncate(l, (m.bottom - 16) / 0.62)));
    else cat.appendChild(s('text', { x: m.left + c, y: m.top + ph + 16, 'text-anchor': 'middle', class: 'an-axis an-cat-label' }, s('title', {}, l), truncate(l, band - 4)));
  });
  svg.appendChild(cat);

  const marks = s('g', { class: 'an-marks' });
  const tipRows = (i) => series.map((se) => ({ name: se.name, value: f.full(se.values[i]), color: color(se.idx) }))
    .concat(stacked ? [{ name: 'Total', value: f.full(series.reduce((sum, se) => sum + (Number(se.values[i]) || 0), 0)) }] : []);

  if (line) {
    const x = (i) => m.left + (i + 0.5) * band;
    series.forEach((se) => {
      const pts = labels.map((_, i) => [x(i), scale(Number(se.values[i]) || 0)]);
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
      if (series.length === 1 && pts.length > 1) {
        marks.appendChild(s('path', { d: `${d}L${pts[pts.length - 1][0].toFixed(1)},${zero}L${pts[0][0].toFixed(1)},${zero}Z`, class: 'an-area', style: `fill:${color(se.idx)}` }));
      }
      marks.appendChild(s('path', { d, class: 'an-line', style: `stroke:${color(se.idx)}` }));
      if (band > 8) pts.forEach((p) => marks.appendChild(s('circle', { cx: p[0], cy: p[1], r: band > 24 ? 4 : 3, class: 'an-point', style: `stroke:${color(se.idx)}` })));
    });
    // hover bands with crosshair
    labels.forEach((l, i) => {
      const g = s('g', { class: 'an-hover-band' });
      g.appendChild(s('rect', { x: m.left + i * band, y: m.top, width: band, height: ph, class: 'an-hover-rect' }));
      g.appendChild(s('line', { x1: x(i), x2: x(i), y1: m.top, y2: m.top + ph, class: 'an-crosshair' }));
      ctx.setTip(g, l, tipRows(i));
      marks.appendChild(g);
    });
  } else {
    const inner = band * (n > 1 ? 0.72 : 0.5);
    const showValues = !stacked && series.length === 1 && n <= 16 && (horizontal ? band >= 14 : inner >= 26);
    labels.forEach((l, i) => {
      let pos = 0, neg = 0;
      series.forEach((se, si) => {
        const v = Number(se.values[i]) || 0;
        let a, b, off, thick;
        if (stacked) {
          if (v >= 0) { a = pos; b = pos + v; pos = b; } else { a = neg; b = neg + v; neg = b; }
          off = (band - inner) / 2; thick = inner;
        } else {
          a = 0; b = v; thick = inner / series.length; off = (band - inner) / 2 + si * thick;
        }
        const p1 = scale(a), p2 = scale(b);
        const start = i * band + off;
        const gap = !stacked && series.length > 1 ? Math.min(2, thick * 0.15) : 0;
        const rect = horizontal
          ? s('rect', { x: Math.min(p1, p2), y: m.top + start + gap / 2, width: Math.max(v ? 1 : 0, Math.abs(p2 - p1)), height: Math.max(1, thick - gap), rx: Math.min(3, thick / 4) })
          : s('rect', { x: m.left + start + gap / 2, y: Math.min(p1, p2), width: Math.max(1, thick - gap), height: Math.max(v ? 1 : 0, Math.abs(p2 - p1)), rx: Math.min(3, thick / 4) });
        rect.setAttribute('class', 'an-bar');
        rect.setAttribute('style', `fill:${color(se.idx)}`);
        ctx.setTip(rect, l, stacked || series.length > 1 ? tipRows(i) : [{ name: se.name, value: f.full(v), color: color(se.idx) }]);
        marks.appendChild(rect);
        if (showValues && v) {
          const txt = f.short(v);
          if (horizontal) {
            const room = W - m.right - Math.max(p1, p2);
            const inside = textWidth(txt) + 10 > room;
            marks.appendChild(s('text', { x: inside ? Math.max(p1, p2) - 6 : Math.max(p1, p2) + 5, y: m.top + start + thick / 2 + 4, 'text-anchor': inside ? 'end' : 'start', class: inside ? 'an-value inside' : 'an-value' }, txt));
          } else if (textWidth(txt) < inner + 14) {
            marks.appendChild(s('text', { x: m.left + start + thick / 2, y: (v >= 0 ? Math.min(p1, p2) - 5 : Math.max(p1, p2) + 13), 'text-anchor': 'middle', class: 'an-value' }, txt));
          }
        }
      });
    });
  }
  svg.appendChild(marks);
  ctx.wrap.insertBefore(svg, ctx.wrap.firstChild);
}

function arcPath(cx, cy, r, ir, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (rad, a) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
  const [x0, y0] = p(r, a0), [x1, y1] = p(r, a1);
  if (ir <= 0) return `M${cx},${cy}L${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}Z`;
  const [x2, y2] = p(ir, a1), [x3, y3] = p(ir, a0);
  return `M${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${ir},${ir} 0 ${large} 0 ${x3},${y3}Z`;
}

function drawPie(ctx, chart, o, W, H) {
  const { f } = o;
  const donut = o.type === 'donut';
  const items = collapse(chart).map((d, i) => ({ ...d, idx: i })).filter((d) => d.value > 0);
  const total = items.reduce((sum, d) => sum + d.value, 0);
  const side = W >= 380 && o.legend !== false;
  const slices = [];
  const highlight = (idx, on) => slices.forEach((sl) => sl.el.classList.toggle('dim', on && sl.idx !== idx));
  const lg = o.legend === false ? null : legendEl(items.map((d) => ({
    name: d.label, color: color(d.idx), value: `${f.short(d.value)} · ${Math.round((d.value / total) * 100)}%`, title: `${d.label}: ${f.full(d.value)}`,
    onHover: (on) => highlight(d.idx, on),
  })), { vertical: side });
  let pw = W, ph = H;
  if (lg) {
    if (side) { lg.style.width = Math.min(240, Math.round(W * 0.42)) + 'px'; ctx.wrap.classList.add('an-side'); ctx.wrap.appendChild(lg); pw = W - lg.offsetWidth - 8; }
    else { ctx.wrap.classList.remove('an-side'); ctx.wrap.appendChild(lg); ph = H - Math.min(lg.offsetHeight, H * 0.4) - 4; lg.style.maxHeight = Math.round(H * 0.4) + 'px'; }
  }
  const svg = s('svg', { viewBox: `0 0 ${pw} ${ph}`, width: pw, height: ph, class: 'an-svg' });
  const r = Math.max(20, Math.min(pw, ph) / 2 - 8);
  const cx = pw / 2, cy = ph / 2, ir = donut ? r * 0.62 : 0;
  let a = 0;
  for (const d of items) {
    const sweep = (d.value / total) * Math.PI * 2;
    const el = sweep >= Math.PI * 2 - 1e-6
      ? (donut ? s('path', { d: `${arcPath(cx, cy, r, ir, 0, Math.PI)}${arcPath(cx, cy, r, ir, Math.PI, Math.PI * 2 - 1e-4)}` }) : s('circle', { cx, cy, r }))
      : s('path', { d: arcPath(cx, cy, r, ir, a, a + sweep) });
    el.setAttribute('class', 'an-slice');
    el.setAttribute('style', `fill:${color(d.idx)}`);
    ctx.setTip(el, d.label, [{ name: chart.measure?.label || 'Value', value: f.full(d.value), color: color(d.idx) }, { name: 'Share', value: `${((d.value / total) * 100).toFixed(1)}%` }]);
    svg.appendChild(el);
    slices.push({ el, idx: d.idx });
    if (sweep > 0.38 && r > 56) {
      const mid = a + sweep / 2, lr = donut ? (r + ir) / 2 : r * 0.64;
      svg.appendChild(s('text', { x: cx + lr * Math.sin(mid), y: cy - lr * Math.cos(mid) + 4, 'text-anchor': 'middle', class: 'an-slice-label' }, `${Math.round((d.value / total) * 100)}%`));
    }
    a += sweep;
  }
  if (donut) {
    const big = Math.max(12, Math.min(26, ir * 0.38));
    svg.appendChild(s('text', { x: cx, y: cy + big * 0.3, 'text-anchor': 'middle', class: 'an-center-value', style: `font-size:${big}px` }, f.short(total)));
    svg.appendChild(s('text', { x: cx, y: cy + big * 0.3 + 16, 'text-anchor': 'middle', class: 'an-axis' }, 'Total'));
  }
  ctx.wrap.insertBefore(svg, ctx.wrap.firstChild);
}

function drawFunnel(ctx, chart, o, W, H) {
  const { f } = o;
  const items = collapse(chart);
  const n = items.length;
  const max = Math.max(...items.map((d) => Math.abs(d.value)), 1);
  const labelW = Math.min(W * 0.3, Math.max(...items.map((d) => textWidth(d.label))) + 12);
  const valueW = Math.min(W * 0.2, Math.max(...items.map((d) => textWidth(f.short(d.value)))) + 14);
  const fw = Math.max(40, Math.min(W - labelW - valueW - 16, 720));
  const rowH = Math.min(46, (H - 8) / n);
  const top = (H - rowH * n) / 2;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'an-svg' });
  const cx = labelW + 8 + (W - labelW - valueW - 16) / 2;
  const widths = items.map((d) => Math.max(fw * 0.04, (Math.abs(d.value) / max) * fw));
  const barH = rowH * 0.66;
  items.forEach((d, i) => {
    const y = top + i * rowH;
    const w = widths[i];
    if (i < n - 1) {
      const w2 = widths[i + 1], y2 = y + rowH;
      svg.appendChild(s('polygon', { points: `${cx - w / 2},${y + barH} ${cx + w / 2},${y + barH} ${cx + w2 / 2},${y2} ${cx - w2 / 2},${y2}`, class: 'an-funnel-neck', style: `fill:${color(i)}` }));
    }
    const rect = s('rect', { x: cx - w / 2, y, width: w, height: barH, rx: Math.min(4, barH / 4), class: 'an-bar', style: `fill:${color(i)}` });
    const prev = i > 0 && items[i - 1].value ? Math.round((d.value / items[i - 1].value) * 100) : null;
    const share = Math.round((d.value / (items.reduce((sum, x) => sum + x.value, 0) || 1)) * 100);
    ctx.setTip(rect, d.label, [{ name: chart.measure?.label || 'Value', value: f.full(d.value), color: color(i) }, { name: 'Share of total', value: `${share}%` },
      prev != null ? { name: 'vs. previous stage', value: `${prev}%` } : null].filter(Boolean));
    svg.appendChild(rect);
    const ty = y + barH / 2 + 4;
    svg.appendChild(s('text', { x: labelW, y: ty, 'text-anchor': 'end', class: 'an-axis an-cat-label' }, s('title', {}, d.label), truncate(d.label, labelW - 6)));
    svg.appendChild(s('text', { x: W - 4, y: ty, 'text-anchor': 'end', class: 'an-value strong' }, f.short(d.value)));
  });
  ctx.wrap.appendChild(svg);
}

// ---------- metric ----------
export function renderMetric(value, measure, { label, sub, compact } = {}) {
  const f = formatter(measure);
  const full = value == null ? '—' : f.full(value);
  const shown = value == null ? '—' : compact || full.length > 12 ? f.short(value) : full;
  return h('div', { class: 'an-metric', title: full },
    h('div', { class: 'an-metric-value' }, shown),
    label !== false ? h('div', { class: 'an-metric-label' }, label || measure?.label || '') : null,
    sub ? h('div', { class: 'an-metric-sub' }, sub) : null);
}

// ---------- gauge ----------
export function renderGauge(value, { min = 0, max, breakpoints, measure, height } = {}) {
  const f = formatter(measure);
  const v = Number(value) || 0;
  min = Number(min) || 0;
  max = Number(max);
  if (!Number.isFinite(max) || max <= min) max = niceTicks(min, Math.max(v * 1.2, min + 1), 5).pop();
  let bps = (Array.isArray(breakpoints) ? breakpoints : []).map(Number).filter((b) => Number.isFinite(b) && b > min && b < max).sort((a, b) => a - b).slice(0, 2);
  if (bps.length < 2) bps = [min + (max - min) / 3, min + ((max - min) * 2) / 3];
  const o = { height: height ?? undefined };
  const el = shell(o, (ctx, W, H) => {
    const r = Math.max(30, Math.min(W / 2 - 16, (H - 34) * 0.92));
    const cx = W / 2, cy = Math.min(H - 30, r + 14 + (H - 34 - r) / 2);
    const thick = Math.max(10, r * 0.22);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'an-svg' });
    const ang = (x) => -Math.PI / 2 + (Math.max(min, Math.min(max, x)) - min) / (max - min) * Math.PI;
    const bands = [[min, bps[0], 'var(--an-bad)', 'Below target'], [bps[0], bps[1], 'var(--an-warn)', 'Approaching target'], [bps[1], max, 'var(--an-good)', 'On target']];
    for (const [a, b, c, name] of bands) {
      const p = s('path', { d: arcPath(cx, cy, r, r - thick, ang(a), ang(b)), class: 'an-band', style: `fill:${c}` });
      ctx.setTip(p, name, [{ name: 'Range', value: `${f.short(a)} – ${f.short(b)}`, color: c }]);
      svg.appendChild(p);
    }
    const a = ang(v);
    const nl = r - thick / 2;
    const needle = s('g', { class: 'an-needle' },
      s('path', { d: `M${cx + 5 * Math.cos(a)},${cy + 5 * Math.sin(a)}L${cx + nl * Math.sin(a)},${cy - nl * Math.cos(a)}L${cx - 5 * Math.cos(a)},${cy - 5 * Math.sin(a)}Z` }),
      s('circle', { cx, cy, r: 7 }));
    ctx.setTip(needle, measure?.label || 'Value', [{ name: 'Value', value: f.full(v) }, { name: 'Of maximum', value: `${Math.round(((v - min) / (max - min)) * 100)}%` }]);
    svg.appendChild(needle);
    svg.appendChild(s('text', { x: cx - r + thick / 2, y: cy + 16, 'text-anchor': 'middle', class: 'an-axis' }, f.short(min)));
    svg.appendChild(s('text', { x: cx + r - thick / 2, y: cy + 16, 'text-anchor': 'middle', class: 'an-axis' }, f.short(max)));
    const big = Math.max(14, Math.min(28, r * 0.24));
    svg.appendChild(s('text', { x: cx, y: Math.min(H - 4, cy + big + 10), 'text-anchor': 'middle', class: 'an-center-value', style: `font-size:${big}px` }, f.short(v)));
    ctx.wrap.appendChild(svg);
  });
  el.classList.add('an-gauge');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `Gauge: ${f.full(v)} of ${f.full(max)}`);
  return el;
}
