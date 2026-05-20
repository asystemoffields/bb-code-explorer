# Bivariate Bicycle (BB) Code Explorer — build spec & IO contract

Condensed from verified deep-research (all `n,k,CSS,weights` reproduced in NumPy).
The user types two bivariate polynomials → tool builds the code, renders the
qubit/Tanner layout on the torus, injects Pauli errors → shows the syndrome.

## Sources & license
- **Primary:** Bravyi, Cross, Gambetta, Maslov, Rall, Yoder, *"High-threshold and
  low-overhead fault-tolerant quantum memory,"* Nature **627**, 778–782 (2024);
  arXiv:2308.07915. Construction = Eq.(1),(2); k = Lemma 1; layout = Lemma 4 + Fig.1.
- **Author oracle code (Apache-2.0 — do NOT copy source):** github.com/sbravyi/BivariateBicycleCodes
- **MIT algorithm refs (free to mirror):** quantumgizmos/ldpc (rank, nullspace, css logicals),
  bp_osd, panqec/panqec (viz). We re-implement from the paper → ship clean **MIT**.

## Construction (exact, load-bearing)
- Cyclic shift `S_ℓ`: ℓ×ℓ, `S[i,(i+1) mod ℓ]=1` (0-indexed rows). `S_ℓ^s` = shift by s.
- `x = S_ℓ ⊗ I_m`, `y = I_ℓ ⊗ S_m` → ℓm×ℓm permutation matrices; commute; `x^ℓ=y^m=I`. Group Z_ℓ×Z_m.
- **INDEX CONVENTION:** flat sector index `q ∈ 0..ℓm−1` ⇒ `q = i·m + j`, with `i ∈ 0..ℓ−1`
  (the x / Z_ℓ coord) and `j ∈ 0..m−1` (the y / Z_m coord). `x^s: q→((i+s)%ℓ)·m+j`;
  `y^t: q→i·m+((j+t)%m)`. (Because Kronecker order is `S_ℓ ⊗ I_m`.)
- `A = A1+A2+A3`, `B = B1+B2+B3`: each term a monomial `x^a` or `y^b` (a permutation
  matrix); sum **mod 2**; terms within A distinct, within B distinct (else cancellation).
  Each of A,B has exactly 3 ones per row & per column.
- **Parity checks:** `Hx = [A | B]`, `Hz = [Bᵀ | Aᵀ]`. Each is (ℓm)×(2ℓm).
  `n = 2ℓm` data qubits, two sectors: **L = cols 0..ℓm−1**, **R = cols ℓm..2ℓm−1**.
  ℓm X-checks + ℓm Z-checks.
- `k = n − rank₂(Hx) − rank₂(Hz)`  (≡ 2·dim(ker A ∩ ker B)).
- **(6,6)-regular:** every check row weight 6; every data qubit in 6 checks (3X+3Z).
  **MUST hold:** `Hx·Hzᵀ = 0 (mod 2)` (CSS) — use as a validity gate.

## Presets (verified n,k; exponents from author code)
| [[n,k,d]] | ℓ,m | A | B |
|---|---|---|---|
| [[72,12,6]]   | 6,6   | x³+y+y²  | y³+x+x²  |
| [[90,8,10]]   | 15,3  | x⁹+y+y²  | 1+x²+x⁷  |
| [[108,8,10]]  | 9,6   | x³+y+y²  | y³+x+x²  |
| **[[144,12,12]] (GROSS)** | 12,6 | x³+y+y² | y³+x+x² |
| [[288,12,18]] | 12,12 | x³+y²+y⁷ | y³+x+x² |

As `(var,power)` lists (x⁰=identity allowed, e.g. the 90-code's B):
```
72 : ℓ6  m6  A=[(x,3),(y,1),(y,2)]  B=[(y,3),(x,1),(x,2)]
90 : ℓ15 m3  A=[(x,9),(y,1),(y,2)]  B=[(x,0),(x,2),(x,7)]
108: ℓ9  m6  A=[(x,3),(y,1),(y,2)]  B=[(y,3),(x,1),(x,2)]
144: ℓ12 m6  A=[(x,3),(y,1),(y,2)]  B=[(y,3),(x,1),(x,2)]
288: ℓ12 m12 A=[(x,3),(y,2),(y,7)]  B=[(y,3),(x,1),(x,2)]
```
⚠ **Naming:** gross = [[144,12,12]] with ℓ,m=**12,6**. [[72,12,6]] uses the SAME A,B but ℓ,m=6,6.
Some pages wrongly attach ℓ=12,m=6 to the 72-code — trust the table. Also: gross = 144
**data** qubits; a chip needs `2n=288` physical (data+ancilla) — distinct from the
[[288,…]] code. Label clearly in UI.

## Tanner adjacency (Option A layout — v1)
Four classes (L data, R data, X-check, Z-check), each ℓm; member `q=i·m+j` at torus cell
`(row=i mod ℓ, col=j mod m)`. Neighbors of a check (the 6 data qubits it touches):
- **X-check** at cell (a,b): L-neighbors via A's monomials (reads ROW of A); R-neighbors via
  B's monomials (reads ROW of B). Offset = **+exponent**: `x^s→(Δrow=+s%ℓ, 0)`; `y^t→(0, +t%m)`.
- **Z-check** at (a,b): L-neighbors via Bᵀ (reads COLUMN of B); R-neighbors via Aᵀ (column of A).
  Offset = **−exponent**: `x^s→(−s, 0)`; `y^t→(0, −t)`.
- Verified gross example: X-check@(2,1) L:(5,1),(2,2),(2,3) R:(2,4),(3,1),(4,1);
  Z-check@(2,1) L:(2,4),(1,1),(0,1) R:(11,1),(2,0),(2,5).
- Local/long-range toggle (v1 heuristic): **local = unit step on one axis** `(±1,0)/(0,±1)`;
  else long-range. Exact paper 4-local+2-long split depends on the Lemma-4 embedding → label
  v1 toggle "axis-local vs other"; exact split = v2.

## Syndrome
- X-error `e_x` detected by **Z-checks**: `s_z = Hz·e_x (mod 2)`. Z-error `e_z` by **X-checks**:
  `s_x = Hx·e_z`. (Z-checks catch X; X-checks catch Z.)
- Single qubit **X** → flips exactly its 3 Z-checks (the 3 ones in that column of Hz);
  **Z** → its 3 X-checks; **Y** → up to 6. Multi-qubit = mod-2 sum of columns (overlaps
  cancel — a teaching moment).

## GF(2) ops (client-side; n≤288 is trivial, ms)
`rank` (Gaussian elim with XOR), `rref→nullspace` (for k and a logical rep
`v ∈ ker(Hz)\rowspace(Hx)`), `matvec` (`s=H·e`: per row, popcount(row AND e)&1). Rows as
`Uint8Array` (simple) or bit-packed `Uint32Array` (fast). **Distance d is NP-hard** → DISPLAY
published d for presets, "?" for custom (optional clearly-labeled heuristic for tiny toy codes).

## GOLDEN TEST (must pass before building UI)
Gross ℓ,m=12,6, A=x³+y+y², B=y³+x+x²: assert `n=144`, `k=12`, all Hx/Hz row weights=6,
all column weights=3, `Hx·Hzᵀ=0`. Cross-check k: 72→12, 90→8, 108→8, 288→12 (all CSS-valid,
wts 6/3). Single X fires exactly 3 Z-checks; single Z fires 3 X-checks.

## Pitfalls
1. **Transpose:** `Hz=[Bᵀ|Aᵀ]` not `[B|A]`. X-checks read ROWS of A,B; Z-checks read COLUMNS.
   Wrong transpose still passes weight-6 but breaks CSS → always assert `Hx·Hzᵀ=0`.
2. **Index** `q=i·m+j`, i=x-coord(range ℓ), j=y-coord(range m). Don't swap ℓ/m.
3. **Offset signs:** X=+exp, Z=−exp.
4. GF(2) rank: reduce ALL rows; mod-2 arithmetic. Validate k vs table.
5. Data `n=2ℓm` vs physical `2n`. 6. Even-weight A/B (repeated monomial) → not (6,6)-regular; validate+warn.

## IO contract & v1 scope
- **Input:** ℓ,m; A,B as `[(var,power)]` lists (+presets, default = gross). Validate distinct
  terms; cap n≲288–576 for snappy UI on low-RAM.
- **Computed (live):** n; monomial perms; A,B; Hx,Hz; k via rank; Tanner adjacency; torus
  coords; check weights; CSS flag; d from preset table (else "?").
- **Interaction:** click data qubit → cycle none→X→Z→Y; recompute syndrome; highlight fired
  checks; readout syndrome weight + [[n,k,d]]; optional "show a logical X".
- **Render:** 4-class toric layout on **Canvas 2D** (tile 3×3 to show wraparound); select a
  check → draw its 6 edges; local/long-range toggle; preset dropdown; A/B text inputs;
  CSS-valid badge; live [[n,k,d]].
- **v1:** construction+presets, live n/k/CSS/weights, torus render, click X/Z/Y → syndrome,
  edge toggle, published-d. **DEFER:** 2ℓ×2m interleaved embedding, decoders (BP-OSD), true
  distance, Stim/Pyodide (NOT needed — all v1 math is plain GF(2) JS).
