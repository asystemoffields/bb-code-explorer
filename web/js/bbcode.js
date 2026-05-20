// bbcode.js — Bivariate Bicycle (BB) quantum LDPC code construction.
// Re-implemented from Bravyi et al., Nature 627, 778 (2024) / arXiv:2308.07915 (see docs/SPEC.md).
// Conventions (load-bearing): sector index q = i*m + j, i in [0,l) is the x/Z_l coord,
// j in [0,m) is the y/Z_m coord (Kronecker order S_l (x) I_m). Hx = [A|B], Hz = [B^T|A^T], n = 2lm.

import { rank2, transpose, dotMod2, matVecMod2 } from './gf2.js';

const sum = (arr) => { let s = 0; for (const v of arr) s += v; return s; };

// Build the lm x lm GF(2) matrix for a polynomial = sum of monomials (mod 2).
// terms: array of [var, power], var in {'x','y'}. x^s: q->((i+s)%l)*m+j ; y^t: q->i*m+((j+t)%m).
export function polyMatrix(l, m, terms) {
  const lm = l * m;
  const M = Array.from({ length: lm }, () => new Uint8Array(lm));
  for (const [v, sRaw] of terms) {
    if (v === 'x') {
      const s = ((sRaw % l) + l) % l;
      for (let i = 0; i < l; i++)
        for (let j = 0; j < m; j++)
          M[i * m + j][((i + s) % l) * m + j] ^= 1;
    } else if (v === 'y') {
      const t = ((sRaw % m) + m) % m;
      for (let i = 0; i < l; i++)
        for (let j = 0; j < m; j++)
          M[i * m + j][i * m + ((j + t) % m)] ^= 1;
    } else {
      throw new Error('monomial variable must be "x" or "y", got: ' + v);
    }
  }
  return M;
}

// Horizontally stack two (nRows x half) matrices into nRows x (2*half).
function hstack(L, R, nRows, half) {
  return Array.from({ length: nRows }, (_, r) => {
    const row = new Uint8Array(2 * half);
    row.set(L[r], 0);
    row.set(R[r], half);
    return row;
  });
}

// Construct the BB code QC(A,B). Returns matrices + computed n, k.
// Data-qubit columns: L sector = 0..lm-1, R sector = lm..2lm-1.
export function buildBBCode(l, m, Aterms, Bterms) {
  const lm = l * m, n = 2 * lm;
  const A = polyMatrix(l, m, Aterms);
  const B = polyMatrix(l, m, Bterms);
  const AT = transpose(A, lm, lm);
  const BT = transpose(B, lm, lm);
  const Hx = hstack(A, B, lm, lm);    // [A | B]
  const Hz = hstack(BT, AT, lm, lm);  // [B^T | A^T]
  const k = n - rank2(Hx, n) - rank2(Hz, n);
  return { l, m, lm, n, k, A, B, Hx, Hz };
}

export function rowWeights(rows) {
  return rows.map((r) => sum(r));
}
export function colWeights(rows, nCols) {
  const w = new Array(nCols).fill(0);
  for (const r of rows) for (let c = 0; c < nCols; c++) w[c] += r[c];
  return w;
}
// CSS condition: every X-check row orthogonal (mod 2) to every Z-check row, i.e. Hx*Hz^T = 0.
export function cssOrthogonal(Hx, Hz) {
  for (let i = 0; i < Hx.length; i++)
    for (let j = 0; j < Hz.length; j++)
      if (dotMod2(Hx[i], Hz[j])) return false;
  return true;
}

// Torus cell of a sector index q (0..lm-1).
export function cellOf(q, m) { return { row: Math.floor(q / m), col: q % m }; }

// The (up to 6) data qubits a given check touches, read directly from the parity matrices.
// type: 'X' | 'Z'; r: check index 0..lm-1. qubit = global column index 0..n-1.
export function checkNeighbors(code, type, r) {
  const H = type === 'X' ? code.Hx : code.Hz;
  const row = H[r], lm = code.lm, out = [];
  for (let c = 0; c < row.length; c++) {
    if (row[c]) {
      const sector = c < lm ? 'L' : 'R';
      const idx = c < lm ? c : c - lm;
      out.push({ qubit: c, sector, cellIndex: idx, ...cellOf(idx, code.m) });
    }
  }
  return out;
}

// Syndrome of a Pauli error pattern. errors: { qubitIndex: 'X'|'Y'|'Z' } over data qubits 0..n-1.
// Z-checks detect X-component (s_z = Hz*e_x); X-checks detect Z-component (s_x = Hx*e_z).
export function syndrome(code, errors) {
  const n = code.n;
  const ex = new Uint8Array(n), ez = new Uint8Array(n);
  for (const [qStr, type] of Object.entries(errors)) {
    const q = +qStr;
    if (type === 'X' || type === 'Y') ex[q] ^= 1;
    if (type === 'Z' || type === 'Y') ez[q] ^= 1;
  }
  const sZ = matVecMod2(code.Hz, ex); // fired Z-checks
  const sX = matVecMod2(code.Hx, ez); // fired X-checks
  return { sX, sZ, weight: sum(sX) + sum(sZ) };
}

// Canonical codes from the paper (verified n,k; d = published value). x^0 = identity is allowed.
export const PRESETS = [
  { name: '[[72,12,6]]',                l: 6,  m: 6,  A: [['x',3],['y',1],['y',2]], B: [['y',3],['x',1],['x',2]], k: 12, d: 6  },
  { name: '[[90,8,10]]',                l: 15, m: 3,  A: [['x',9],['y',1],['y',2]], B: [['x',0],['x',2],['x',7]], k: 8,  d: 10 },
  { name: '[[108,8,10]]',               l: 9,  m: 6,  A: [['x',3],['y',1],['y',2]], B: [['y',3],['x',1],['x',2]], k: 8,  d: 10 },
  { name: '[[144,12,12]] — gross code', l: 12, m: 6,  A: [['x',3],['y',1],['y',2]], B: [['y',3],['x',1],['x',2]], k: 12, d: 12 },
  { name: '[[288,12,18]]',              l: 12, m: 12, A: [['x',3],['y',2],['y',7]], B: [['y',3],['x',1],['x',2]], k: 12, d: 18 },
];

// Self-test: rebuild every preset and check n, k, weight-6 rows, weight-3 cols, CSS orthogonality,
// plus the single-qubit syndrome behaviour on the gross code. Returns {allPass, results}.
export function runTests() {
  const results = [];
  for (const p of PRESETS) {
    const code = buildBBCode(p.l, p.m, p.A, p.B);
    const rw = rowWeights(code.Hx).concat(rowWeights(code.Hz));
    const cwX = colWeights(code.Hx, code.n);
    const cwZ = colWeights(code.Hz, code.n);
    const nOK = code.n === 2 * p.l * p.m;
    const kOK = code.k === p.k;
    const rowsOK = rw.every((w) => w === 6);
    const colsOK = cwX.every((w) => w === 3) && cwZ.every((w) => w === 3);
    const css = cssOrthogonal(code.Hx, code.Hz);
    results.push({ name: p.name, n: code.n, k: code.k, expectedK: p.k,
      nOK, kOK, rowsOK, colsOK, css, pass: nOK && kOK && rowsOK && colsOK && css });
  }
  const gross = buildBBCode(12, 6, [['x',3],['y',1],['y',2]], [['y',3],['x',1],['x',2]]);
  const sX = syndrome(gross, { 0: 'X' });
  const sZ = syndrome(gross, { 0: 'Z' });
  const xFiresZ = sum(sX.sZ), xFiresX = sum(sX.sX);
  const zFiresX = sum(sZ.sX), zFiresZ = sum(sZ.sZ);
  const synOK = xFiresZ === 3 && xFiresX === 0 && zFiresX === 3 && zFiresZ === 0;
  results.push({ name: 'gross single-qubit syndrome', xFiresZ, zFiresX, pass: synOK });

  return { allPass: results.every((r) => r.pass), results };
}
