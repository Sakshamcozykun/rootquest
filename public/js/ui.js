// Small DOM helpers. Everything is built with textContent/createElement - never innerHTML -
// so user-controlled text (usernames, notes, challenge text) cannot inject markup.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let deferredValue;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') deferredValue = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k.nodeType ? k : String(k));
  }
  if (deferredValue !== undefined) el.value = deferredValue;
  return el;
}

export function toast(msg) {
  const root = document.getElementById('toast-root');
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  root.replaceChildren(el);
  setTimeout(() => el.remove(), 3200);
}

// Minimal text formatting: ``` blocks, `inline code` and *italics*.
function inline(s) {
  return s.split(/(`[^`\n]+`|\*[^*\n]+\*)/).filter((x) => x !== '').map((tok) => {
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) return h('code', {}, tok.slice(1, -1));
    if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) return h('em', {}, tok.slice(1, -1));
    return tok;
  });
}
export function rich(text) {
  const frag = document.createDocumentFragment();
  String(text || '').split(/```\n?/).forEach((part, i) => {
    if (i % 2 === 1) frag.append(h('pre', {}, part.replace(/\n$/, '')));
    else {
      const t = part.replace(/^\n+|\n+$/g, '');
      if (t) frag.append(h('p', { class: 'rich' }, inline(t)));
    }
  });
  return frag;
}

export const fmtDate = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
export function clock(sec) {
  sec = Math.max(0, Math.round(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}
export function dur(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export function pips(difficulty) {
  const n = { easy: 1, medium: 2, hard: 3 }[difficulty] || 1;
  return h('span', { class: `pips ${difficulty}`, role: 'img', 'aria-label': difficulty },
    [1, 2, 3].map((i) => h('i', { class: i <= n ? 'on' : '' })));
}

const NS = 'http://www.w3.org/2000/svg';
export function brandIcon(size = 22) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M16 5v10m0 0c0 4-5 5-8 10m8-10c0 4 5 5 8 10M16 15v12');
  p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2.6'); p.setAttribute('fill', 'none'); p.setAttribute('stroke-linecap', 'round');
  svg.append(p);
  return svg;
}

// Topographic contour lines: nested wobbly rings, like a survey map.
export function contours(rings = 12, seed = 2) {
  const w = 900, h2 = 600, cx = w * 0.5, cy = h2 * 0.52;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h2}`); svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'art');
  for (let k = 1; k <= rings; k++) {
    const n = 56, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = k * 30 * (1 + 0.2 * Math.sin(3 * a + seed + k * 0.32) + 0.1 * Math.sin(5 * a - seed * 2 + k * 0.21));
      pts.push([cx + r * 1.45 * Math.cos(a), cy + r * 0.95 * Math.sin(a)]);
    }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let d = `M${mid(pts[n - 1], pts[0]).map((v) => v.toFixed(1)).join(' ')}`;
    for (let i = 0; i < n; i++) {
      const m = mid(pts[i], pts[(i + 1) % n]);
      d += `Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
    }
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d + 'Z'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', k % 4 === 0 ? '1.8' : '1');
    svg.append(path);
  }
  return svg;
}

// ---- radar chart (Chart.js is loaded globally by index.html) ----
let charts = [];
export function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function radarChart(skills, label = 'Skills solved (%)') {
  const box = h('div', { class: 'chart-box' });
  if (!skills.length) return h('div', { class: 'empty' }, 'No skills to show yet. Solve a challenge to start filling the map.');
  const canvas = h('canvas', { role: 'img', 'aria-label': `${label}: ` + skills.map((s) => `${s.skill} ${s.pct}%`).join(', ') });
  box.append(canvas);
  requestAnimationFrame(() => {
    if (!window.Chart || !canvas.isConnected) return;
    const moss = css('--moss');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    charts.push(new window.Chart(canvas, {
      type: 'radar',
      data: {
        labels: skills.map((s) => s.skill),
        datasets: [{ label, data: skills.map((s) => s.pct), backgroundColor: moss + '40', borderColor: moss, pointBackgroundColor: moss, borderWidth: 2 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: reduce ? false : undefined,
        scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent', color: css('--muted') }, grid: { color: css('--line') }, angleLines: { color: css('--line') }, pointLabels: { color: css('--ink'), font: { size: 13 } } } },
        plugins: { legend: { display: false } },
      },
    }));
  });
  return box;
}

export const errBox = (e) => h('div', { class: 'msg bad', role: 'alert' }, e.message || String(e));
export const empty = (text) => h('div', { class: 'empty' }, text);
