// app.js — UI + Canvas rendering for the Bivariate Bicycle Code Explorer.
import {
  buildBBCode, PRESETS, checkNeighbors, syndrome,
  rowWeights, colWeights, cssOrthogonal, cellOf,
} from './bbcode.js';

const $ = (id) => document.getElementById(id);
const COL = {
  L: '#4aa3ff', R: '#ff9e57', X: '#5fd38d', Z: '#ff6b81',
  fired: '#ffd34d', grid: 'rgba(255,255,255,0.06)',
  err: { X: '#ff5d5d', Z: '#42d6ff', Y: '#d96bff' },
};
const SUB = { L: [0.30, 0.34], R: [0.70, 0.66], X: [0.70, 0.34], Z: [0.30, 0.66] };
const TAU = Math.PI * 2;

const state = {
  code: null, dVal: '?', errors: {}, hover: null, showLong: true,
  cell: 50, pad: 20, dataNodes: [], checkNodes: [],
  syn: null, kbq: 0, kbActive: false,
};

const cv = $('cv');
const ctx = cv.getContext('2d');

// ---- polynomial parsing / formatting ----
function parsePoly(str) {
  const terms = [], seen = new Set();
  for (let tok of str.split('+')) {
    tok = tok.trim().toLowerCase();
    if (!tok) continue;
    let term;
    if (tok === '1') term = ['x', 0];
    else {
      const m = tok.match(/^([xy])(?:\^)?(\d*)$/);
      if (!m) throw new Error(`can't parse "${tok}" — use terms like x3, y, y2, 1`);
      term = [m[1], m[2] === '' ? 1 : parseInt(m[2], 10)];
    }
    const key = term[0] + term[1];
    if (seen.has(key)) throw new Error(`duplicate term "${tok}" — repeats cancel over GF(2); use each x^i / y^j once`);
    seen.add(key); terms.push(term);
  }
  if (!terms.length) throw new Error('empty polynomial');
  return terms;
}
function polyToStr(terms) {
  return terms.map(([v, p]) => (p === 0 ? '1' : p === 1 ? v : v + p)).join(' + ');
}

// ---- layout (sized to the available stage width, so it fits on small screens) ----
function layout(code) {
  const MINC = 22, MAXC = 72, pad = state.pad;
  const stage = $('stage');
  const availW = Math.max(180, (stage ? stage.clientWidth : 600) - 2 * pad - 8);
  const availH = Math.max(180, Math.min(640, window.innerHeight - 230));
  const cell = Math.max(MINC, Math.min(MAXC, Math.floor(Math.min(availW / code.m, availH / code.l))));
  state.cell = cell;
  const w = code.m * cell + 2 * pad, h = code.l * cell + 2 * pad;
  const dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const px = (cls, i, j) => ({ x: pad + j * cell + SUB[cls][0] * cell, y: pad + i * cell + SUB[cls][1] * cell });
  state.dataNodes = []; state.checkNodes = [];
  for (let q = 0; q < code.lm; q++) {
    const { row: i, col: j } = cellOf(q, code.m);
    state.dataNodes.push({ qubit: q, cls: 'L', i, j, ...px('L', i, j) });
    state.dataNodes.push({ qubit: code.lm + q, cls: 'R', i, j, ...px('R', i, j) });
    state.checkNodes.push({ ctype: 'X', index: q, i, j, ...px('X', i, j) });
    state.checkNodes.push({ ctype: 'Z', index: q, i, j, ...px('Z', i, j) });
  }
  if (state.kbq >= state.dataNodes.length) state.kbq = 0;
}

const minOff = (d, n) => { d = ((d % n) + n) % n; if (d * 2 > n) d -= n; return d; };

// ---- syndrome (cached: only changes when errors change, not on hover) ----
function recomputeSyndrome() {
  state.syn = syndrome(state.code, state.errors);
  const ne = Object.keys(state.errors).length;
  const nX = state.syn.sX.reduce((s, v) => s + v, 0), nZ = state.syn.sZ.reduce((s, v) => s + v, 0);
  const live = $('live');
  if (live) live.textContent = ne
    ? `${ne} error${ne === 1 ? '' : 's'} injected; ${nZ} Z-check${nZ === 1 ? '' : 's'} and ${nX} X-check${nX === 1 ? '' : 's'} fired, syndrome weight ${state.syn.weight}.`
    : 'No errors injected.';
}

// ---- rendering ----
function render() {
  const code = state.code, cell = state.cell, pad = state.pad;
  if (!code) return;
  const w = cv.width / (window.devicePixelRatio || 1), h = cv.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
  for (let j = 0; j <= code.m; j++) { ctx.beginPath(); ctx.moveTo(pad + j * cell, pad); ctx.lineTo(pad + j * cell, pad + code.l * cell); ctx.stroke(); }
  for (let i = 0; i <= code.l; i++) { ctx.beginPath(); ctx.moveTo(pad, pad + i * cell); ctx.lineTo(pad + code.m * cell, pad + i * cell); ctx.stroke(); }

  const syn = state.syn || { sX: [], sZ: [], weight: 0 };
  const firedX = syn.sX, firedZ = syn.sZ;

  let hoverNbQubits = new Set();
  if (state.hover) {
    const { ctype, index } = state.hover;
    const a = Math.floor(index / code.m), b = index % code.m;
    const src = { x: pad + b * cell + SUB[ctype][0] * cell, y: pad + a * cell + SUB[ctype][1] * cell };
    for (const nb of checkNeighbors(code, ctype, index)) {
      const dr = minOff(nb.row - a, code.l), dc = minOff(nb.col - b, code.m);
      const local = (Math.abs(dr) === 1 && dc === 0) || (Math.abs(dc) === 1 && dr === 0);
      if (!local && !state.showLong) continue;
      const tx = pad + (b + dc) * cell + SUB[nb.sector][0] * cell;
      const ty = pad + (a + dr) * cell + SUB[nb.sector][1] * cell;
      ctx.strokeStyle = local ? 'rgba(255,255,255,.55)' : 'rgba(255,211,77,.7)';
      ctx.lineWidth = local ? 1.5 : 2; ctx.setLineDash(local ? [] : [4, 3]);
      ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.setLineDash([]);
      hoverNbQubits.add(nb.qubit);
    }
  }

  const cr = Math.max(3, cell * 0.11);
  for (const nd of state.checkNodes) {
    const fired = (nd.ctype === 'X' ? firedX : firedZ)[nd.index] === 1;
    ctx.fillStyle = fired ? COL.fired : COL[nd.ctype];
    ctx.globalAlpha = fired ? 1 : 0.85;
    ctx.fillRect(nd.x - cr, nd.y - cr, 2 * cr, 2 * cr);
    ctx.globalAlpha = 1;
    if (fired) { ctx.strokeStyle = COL.fired; ctx.lineWidth = 2; ctx.strokeRect(nd.x - cr - 2, nd.y - cr - 2, 2 * cr + 4, 2 * cr + 4); }
    if (state.hover && state.hover.ctype === nd.ctype && state.hover.index === nd.index) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(nd.x - cr - 3, nd.y - cr - 3, 2 * cr + 6, 2 * cr + 6);
    }
  }

  const dr0 = Math.max(4, cell * 0.14);
  for (const nd of state.dataNodes) {
    const err = state.errors[nd.qubit];
    ctx.beginPath(); ctx.arc(nd.x, nd.y, dr0, 0, TAU);
    ctx.fillStyle = err ? COL.err[err] : COL[nd.cls];
    ctx.globalAlpha = err ? 1 : 0.9; ctx.fill(); ctx.globalAlpha = 1;
    if (hoverNbQubits.has(nd.qubit)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(nd.x, nd.y, dr0 + 3, 0, TAU); ctx.stroke(); }
    if (err) { ctx.fillStyle = '#0b0e13'; ctx.font = `bold ${Math.round(dr0 * 1.4)}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(err, nd.x, nd.y + 0.5); }
  }

  // keyboard cursor
  if (state.kbActive && state.dataNodes[state.kbq]) {
    const nd = state.dataNodes[state.kbq];
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(nd.x, nd.y, dr0 + 5, 0, TAU); ctx.stroke();
  }

  const ne = Object.keys(state.errors).length;
  $('rd-err').textContent = ne;
  $('rd-syn').textContent = syn.weight;
  const nX = (firedX.reduce ? firedX.reduce((s, v) => s + v, 0) : 0);
  const nZ = (firedZ.reduce ? firedZ.reduce((s, v) => s + v, 0) : 0);
  const note = $('syn-note'); note.classList.remove('err');
  note.textContent = ne ? `${nZ} Z-check${nZ === 1 ? '' : 's'} + ${nX} X-check${nX === 1 ? '' : 's'} fired` : '';
}

// ---- set / build code ----
function setCode(code, dVal) {
  state.code = code; state.dVal = dVal; state.errors = {}; state.hover = null; state.kbq = 0;
  layout(code);
  recomputeSyndrome();

  const reg = rowWeights(code.Hx).concat(rowWeights(code.Hz)).every((x) => x === 6)
    && colWeights(code.Hx, code.n).every((x) => x === 3)
    && colWeights(code.Hz, code.n).every((x) => x === 3);
  const css = cssOrthogonal(code.Hx, code.Hz);

  $('nkd').textContent = `[[${code.n},${code.k},${dVal}]]`;
  $('rd-n').textContent = code.n; $('rd-k').textContent = code.k; $('rd-d').textContent = dVal;
  $('rd-checks').textContent = `${code.lm} / ${code.lm}`;
  const bc = $('badge-css'); bc.textContent = css ? 'CSS ✓' : 'CSS ✗'; bc.className = 'badge ' + (css ? 'ok' : 'no');
  const br = $('badge-reg'); br.textContent = reg ? '(6,6)-regular ✓' : 'not (6,6)-regular'; br.className = 'badge ' + (reg ? 'ok' : 'no');

  window.__STATE = { n: code.n, k: code.k, d: dVal, css, reg };
  render();
}
function applyPreset(p) {
  $('in-l').value = p.l; $('in-m').value = p.m;
  $('in-a').value = polyToStr(p.A); $('in-b').value = polyToStr(p.B);
  $('syn-note').classList.remove('err');
  setCode(buildBBCode(p.l, p.m, p.A, p.B), String(p.d));
}
function buildFromInputs() {
  const note = $('syn-note');
  try {
    const l = Math.max(1, Math.min(24, parseInt($('in-l').value, 10) || 1));
    const m = Math.max(1, Math.min(24, parseInt($('in-m').value, 10) || 1));
    if (2 * l * m > 800) throw new Error('too large for smooth in-browser compute — keep 2·ℓ·m ≲ 800');
    const A = parsePoly($('in-a').value), B = parsePoly($('in-b').value);
    $('preset').value = '__custom';
    setCode(buildBBCode(l, m, A, B), '?');
    note.classList.remove('err'); note.textContent = '';
  } catch (e) {
    note.textContent = e.message; note.classList.add('err');
  }
}

// ---- hit testing + pointer events ----
function nearest(mx, my) {
  const r2 = (state.cell * 0.24) ** 2; let best = null, bd = r2;
  for (const nd of state.dataNodes) { const d = (nd.x - mx) ** 2 + (nd.y - my) ** 2; if (d < bd) { bd = d; best = { type: 'data', nd }; } }
  for (const nd of state.checkNodes) { const d = (nd.x - mx) ** 2 + (nd.y - my) ** 2; if (d < bd) { bd = d; best = { type: 'check', nd }; } }
  return best;
}
function cycleError(q) {
  const cur = state.errors[q];
  const next = { undefined: 'X', X: 'Z', Z: 'Y', Y: undefined }[cur];
  if (next) state.errors[q] = next; else delete state.errors[q];
  recomputeSyndrome();
}
cv.addEventListener('mousemove', (e) => {
  const hit = nearest(e.offsetX, e.offsetY);
  const h = hit && hit.type === 'check' ? { ctype: hit.nd.ctype, index: hit.nd.index } : null;
  const changed = JSON.stringify(h) !== JSON.stringify(state.hover);
  if (changed) { state.hover = h; cv.style.cursor = hit ? 'pointer' : 'default'; render(); }
});
cv.addEventListener('mouseleave', () => { if (state.hover) { state.hover = null; render(); } });
cv.addEventListener('click', (e) => {
  const hit = nearest(e.offsetX, e.offsetY);
  if (!hit || hit.type !== 'data') return;
  cycleError(hit.nd.qubit); render();
});

// ---- keyboard accessibility ----
cv.addEventListener('focus', () => { state.kbActive = true; render(); });
cv.addEventListener('blur', () => { state.kbActive = false; render(); });
cv.addEventListener('keydown', (e) => {
  if (!state.dataNodes.length) return;
  const n = state.dataNodes.length, perRow = 2 * state.code.m;
  let handled = true;
  switch (e.key) {
    case 'ArrowRight': state.kbq = (state.kbq + 1) % n; break;
    case 'ArrowLeft': state.kbq = (state.kbq - 1 + n) % n; break;
    case 'ArrowDown': state.kbq = (state.kbq + perRow) % n; break;
    case 'ArrowUp': state.kbq = (state.kbq - perRow + n) % n; break;
    case 'Enter': case ' ': cycleError(state.dataNodes[state.kbq].qubit); break;
    case 'Delete': case 'Backspace': state.errors = {}; recomputeSyndrome(); break;
    default: handled = false;
  }
  if (handled) { e.preventDefault(); state.kbActive = true; render(); }
});

// ---- help modal (keyboard-accessible dialog) ----
function openHelp() { $('help-modal').classList.remove('hidden'); $('help-close').focus(); }
function closeHelp() { $('help-modal').classList.add('hidden'); $('btn-help').focus(); }

// ---- wire controls ----
function init() {
  const sel = $('preset');
  PRESETS.forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = p.name; sel.appendChild(o); });
  const custom = document.createElement('option'); custom.value = '__custom'; custom.textContent = 'Custom…'; sel.appendChild(custom);
  sel.addEventListener('change', () => { if (sel.value !== '__custom') applyPreset(PRESETS[+sel.value]); });
  $('btn-build').addEventListener('click', buildFromInputs);
  $('btn-clear').addEventListener('click', () => { state.errors = {}; recomputeSyndrome(); render(); });
  $('tg-long').addEventListener('change', (e) => { state.showLong = e.target.checked; render(); });
  $('btn-help').addEventListener('click', openHelp);
  $('help-close').addEventListener('click', closeHelp);
  $('help-modal').addEventListener('click', (e) => { if (e.target.id === 'help-modal') closeHelp(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('help-modal').classList.contains('hidden')) closeHelp(); });
  window.addEventListener('resize', () => { if (state.code) { layout(state.code); render(); } });

  const grossIdx = PRESETS.findIndex((p) => p.name.includes('gross'));
  sel.value = String(grossIdx);
  applyPreset(PRESETS[grossIdx]);
}

try { init(); window.__READY = true; }
catch (e) { window.__ERR = String(e) + '\n' + (e && e.stack); document.body.insertAdjacentHTML('beforeend', '<pre style="color:#ff6b81;padding:12px"></pre>'); document.body.lastChild.textContent = window.__ERR; }
