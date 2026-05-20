# Bivariate Bicycle Code Explorer

Interactive, zero-backend explorer for **bivariate bicycle (BB)** quantum LDPC codes —
including IBM's **`[[144,12,12]]` "gross code."** Build a code from two polynomials, see
its qubit / Tanner layout on the torus, inject Pauli errors, and watch the syndrome.
Everything is computed live in your browser over GF(2); nothing is sent anywhere.

**Live:** _(deploy link TBD)_

## Why this exists

Quantum LDPC codes are the leading path to low-overhead fault-tolerant quantum computing,
and bivariate bicycle codes (Bravyi et al., *Nature* 2024) are the hot example — the
centerpiece of IBM's 2029 fault-tolerance roadmap. But every interactive QEC teaching tool
targets **surface codes on a 2D lattice**; there was no hands-on explorer for the
*algebraic, long-range* BB codes. This fills that gap.

## Features

- **Presets** for the paper's canonical codes: `[[72,12,6]]`, `[[90,8,10]]`,
  `[[108,8,10]]`, `[[144,12,12]]` (gross), `[[288,12,18]]`.
- **Build any BB code** from two polynomials `A(x,y)`, `B(x,y)` over GF(2).
- Live `[[n,k,d]]`, **CSS-orthogonality** and **(6,6)-regularity** checks.
- **Click a data qubit** → cycle its error `none → X → Z → Y` → the stabilizer checks that
  detect it light up (the syndrome).
- **Hover a check** → see the six qubits it measures, with nearest-neighbor vs
  **long-range** edges (the long ones are what make qLDPC powerful — and hard to draw).

## Run locally

No build step, no dependencies. Serve the `web/` folder:

```sh
cd web && python -m http.server 8000
# open http://localhost:8000/
```

**Self-test:** open `http://localhost:8000/test.html` — it rebuilds every canonical code and
asserts `n`, `k`, weight-6 checks, weight-3 columns, CSS orthogonality (`Hx·Hzᵀ=0`), and the
single-qubit syndrome behaviour.

## The math

A BB code is defined by two polynomials in the cyclic shifts `x = Sℓ⊗Im`, `y = Iℓ⊗Sm` on an
ℓ×m torus. Parity checks are `Hx = [A | B]` and `Hz = [Bᵀ | Aᵀ]`; there are `n = 2ℓm` data
qubits and `k = n − rank(Hx) − rank(Hz)` logical qubits. Full construction, index
conventions, presets, and pitfalls are in [`docs/SPEC.md`](docs/SPEC.md).

## Attribution & license

Construction and code parameters from **S. Bravyi, A. Cross, J. Gambetta, D. Maslov, P. Rall,
T. Yoder, "High-threshold and low-overhead fault-tolerant quantum memory," *Nature* **627**,
778–782 (2024)** ([arXiv:2308.07915](https://arxiv.org/abs/2308.07915)). The published code
distances `d` are quoted from that paper. This is an **independent educational
re-implementation** — the math is reimplemented from the paper; no source code was copied —
released under the **MIT License** (see [`LICENSE`](LICENSE)).

One of a series of small, free, give-away tools for real science communities.
