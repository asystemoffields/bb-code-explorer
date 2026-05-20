// gf2.js — minimal linear algebra over GF(2) = {0,1}, "+" is XOR.
// A matrix is an array of rows, each row a Uint8Array of 0/1 with length = #columns.
// Sizes here are tiny (n <= ~576), so plain Uint8Array rows are more than fast enough.

// Rank over GF(2) via forward Gaussian elimination. Works on a copy; input untouched.
export function rank2(rowsIn, nCols) {
  const rows = rowsIn.map((r) => Uint8Array.from(r));
  const nRows = rows.length;
  let rank = 0;
  let pr = 0; // current pivot row
  for (let col = 0; col < nCols && pr < nRows; col++) {
    let pivot = -1;
    for (let i = pr; i < nRows; i++) {
      if (rows[i][col]) { pivot = i; break; }
    }
    if (pivot === -1) continue; // no pivot in this column
    const tmp = rows[pr]; rows[pr] = rows[pivot]; rows[pivot] = tmp; // swap up
    for (let i = pr + 1; i < nRows; i++) { // eliminate below the pivot
      if (rows[i][col]) {
        const a = rows[i], b = rows[pr];
        for (let c = col; c < nCols; c++) a[c] ^= b[c];
      }
    }
    pr++; rank++;
  }
  return rank;
}

// Mod-2 matrix * vector. rows: array of Uint8Array; e: Uint8Array (len = #cols). Returns Uint8Array (len = #rows).
export function matVecMod2(rows, e) {
  const out = new Uint8Array(rows.length);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let s = 0;
    for (let c = 0; c < row.length; c++) s ^= row[c] & e[c];
    out[r] = s & 1;
  }
  return out;
}

// Transpose an nRows x nCols matrix → nCols x nRows.
export function transpose(M, nRows, nCols) {
  const T = Array.from({ length: nCols }, () => new Uint8Array(nRows));
  for (let r = 0; r < nRows; r++) {
    const Mr = M[r];
    for (let c = 0; c < nCols; c++) if (Mr[c]) T[c][r] = 1;
  }
  return T;
}

// Mod-2 inner product of two equal-length 0/1 vectors.
export function dotMod2(u, v) {
  let s = 0;
  for (let c = 0; c < u.length; c++) s ^= u[c] & v[c];
  return s & 1;
}
