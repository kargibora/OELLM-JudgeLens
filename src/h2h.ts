// Head-to-head statistics helpers.
//
// The export stores, per model pair (a<b) and feature, the DISCORDANT counts
// bpos (a fires, b doesn't) and cpos (b fires, a doesn't). Everything the report card
// shows for the "vs model" mode is derived here so the component stays declarative.
//
// Why discordant counts and not a bare difference: for a paired binary contrast the
// concordant battles (both/neither fire) carry no signal, so the effective sample is
// bpos+cpos, NOT the shared-battle count n. A high-base-rate behaviour ("markdown") that
// both models almost always do is nearly all-concordant → its difference is a tiny,
// low-power number even when n is huge. We surface that honestly (n_disc + significance).

import type { H2HPair, HeadToHead } from "./types";

// standard normal CDF via an Abramowitz–Stegun erf approximation (max abs err ~1.5e-7) —
// enough precision to grey non-significant cells and rank by evidence.
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

// Two-sided McNemar p-value from discordant counts, normal approx with continuity
// correction. b+c == 0 (no discordant battles) → p = 1 (no evidence of a difference).
export function mcnemarP(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const z = (Math.abs(b - c) - 1) / Math.sqrt(n); // continuity-corrected
  if (z <= 0) return 1;
  return Math.min(1, 2 * (1 - normCdf(z)));
}

// Benjamini–Hochberg adjusted p-values, returned in the input order. Standard step-up
// with monotone enforcement so an adjusted p never falls below a smaller raw p.
export function bhAdjust(ps: number[]): number[] {
  const m = ps.length;
  if (m === 0) return [];
  const order = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const adj = new Array<number>(m);
  let prev = 1;
  for (let rank = m - 1; rank >= 0; rank--) {
    const { p, i } = order[rank];
    const val = Math.min(prev, (p * m) / (rank + 1));
    adj[i] = val;
    prev = val;
  }
  return adj;
}

// One feature's head-to-head cell, oriented for the SELECTED model X against opponent Y.
export interface H2HCell {
  fid: number;
  diff: number; // (X fires − Y fires) rate on the shared battles = (bx - cx) / n
  bx: number; // shared battles where X fires but Y doesn't
  cx: number; // shared battles where Y fires but X doesn't
  nDisc: number; // effective sample = bx + cx
  n: number; // shared battles
  p: number; // McNemar p (raw)
  q?: number; // BH-adjusted p (filled by cellsForPair)
}

// Index a HeadToHead bundle for O(1) pair + feature lookup.
export class H2HIndex {
  private modelIdx: Map<string, number>;
  private pairByKey: Map<number, H2HPair>;
  private M: number;
  readonly minShared: number;
  readonly features: number[];

  constructor(private h2h: HeadToHead) {
    this.M = h2h.models.length;
    this.modelIdx = new Map(h2h.models.map((m, i) => [m, i]));
    this.pairByKey = new Map(h2h.pairs.map((p) => [p.a * this.M + p.b, p]));
    this.minShared = h2h.min_shared;
    this.features = h2h.features;
  }

  hasModel(m: string): boolean {
    return this.modelIdx.has(m);
  }

  // qualifying opponents for X: every model that shares a stored pair with X
  opponentsFor(x: string): string[] {
    const xi = this.modelIdx.get(x);
    if (xi == null) return [];
    const out: string[] = [];
    for (const [m, mi] of this.modelIdx) {
      if (mi === xi) continue;
      const key = Math.min(xi, mi) * this.M + Math.max(xi, mi);
      if (this.pairByKey.has(key)) out.push(m);
    }
    return out;
  }

  pairOf(x: string, y: string): { pair: H2HPair; xIsA: boolean } | null {
    const xi = this.modelIdx.get(x);
    const yi = this.modelIdx.get(y);
    if (xi == null || yi == null || xi === yi) return null;
    const lo = Math.min(xi, yi);
    const hi = Math.max(xi, yi);
    const pair = this.pairByKey.get(lo * this.M + hi);
    return pair ? { pair, xIsA: xi === lo } : null;
  }

  // all per-feature cells for X-vs-Y, oriented so positive diff = X does it more, with
  // BH-adjusted q-values across the feature set. Empty array if the pair isn't stored.
  cellsForPair(x: string, y: string): H2HCell[] {
    const got = this.pairOf(x, y);
    if (!got) return [];
    const { pair, xIsA } = got;
    const cells: H2HCell[] = this.features.map((fid, k) => {
      // bpos = a-fires-not-b, cpos = b-fires-not-a. Orient to X: if X is `a`, X-fires-not-Y
      // is bpos; else X is `b`, so X-fires-not-Y is cpos.
      const bx = xIsA ? pair.bpos[k] : pair.cpos[k];
      const cx = xIsA ? pair.cpos[k] : pair.bpos[k];
      const nDisc = bx + cx;
      return {
        fid,
        diff: pair.n > 0 ? (bx - cx) / pair.n : 0,
        bx,
        cx,
        nDisc,
        n: pair.n,
        p: mcnemarP(bx, cx),
      };
    });
    const qs = bhAdjust(cells.map((c) => c.p));
    cells.forEach((c, i) => (c.q = qs[i]));
    return cells;
  }
}
