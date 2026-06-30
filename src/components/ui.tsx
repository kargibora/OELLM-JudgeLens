import React from "react";
import { Info } from "lucide-react";

// plain-language "how to read this" callout
export function Explain({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm leading-relaxed text-slate-300">
      <Info size={16} className="mt-0.5 shrink-0 text-accent" />
      <div>{children}</div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-edge bg-panel/70 p-4 shadow-lg ${className}`}>
      {children}
    </div>
  );
}

export function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-2xl font-semibold text-slate-100">{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </Card>
  );
}

export function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? "bg-good/15 text-good" : "bg-slate-600/20 text-slate-400"
      }`}
    >
      {children}
    </span>
  );
}

// red (negative) → slate (zero) → green (positive), magnitude-scaled.
// `ref` is the saturation reference: pass a FIXED value (not the dataset max) so a
// ±0.03 effect renders pale, not full-saturation — tiny effects must look tiny.
export function divergeColor(v: number, ref: number): string {
  const t = Math.max(-1, Math.min(1, ref ? v / ref : 0));
  if (t >= 0) {
    const a = 0.18 + 0.82 * t;
    return `rgba(52, 211, 153, ${a.toFixed(2)})`;
  }
  const a = 0.18 + 0.82 * -t;
  return `rgba(248, 113, 113, ${a.toFixed(2)})`;
}

// fixed saturation reference for win-rate effects: a Δwin-rate of ±0.20 is "strong".
export const WINRATE_REF = 0.2;

// Frequency (fire-rate) is NOT good/bad, so it gets its own NEUTRAL diverging pair —
// blue (more) ↔ amber (less) — kept distinct from the green/red valence palette so the
// two never collide on one page. A ±0.25 fire-rate difference saturates.
export const FIRE_REF = 0.25;
export function fireDivergeColor(v: number, ref: number = FIRE_REF): string {
  const t = Math.max(-1, Math.min(1, ref ? v / ref : 0));
  const a = 0.18 + 0.82 * Math.abs(t);
  return t >= 0 ? `rgba(96, 165, 250, ${a.toFixed(2)})` : `rgba(251, 191, 36, ${a.toFixed(2)})`;
}

// unnamed features carry a null concept (only the top-N are annotated). Render their
// id as a de-emphasized placeholder rather than a bare number. Also treat the legacy
// string "nan"/"NaN"/"" as unnamed, so bundles exported before the null fix still work.
export const isUnnamed = (name: string | null | undefined) =>
  name == null || name === "nan" || name === "NaN" || name.trim() === "";
export const conceptLabel = (id: number, name: string | null | undefined) =>
  isUnnamed(name) ? `feature ${id}` : (name as string);

// Truncated concept label that reveals its FULL text on hover OR keyboard-focus OR tap
// (focusable), via a pure-CSS popover — the consistent full-text affordance across the
// app's HTML labels (recharts axis labels use two-line wrap instead). Unnamed concepts
// render de-emphasized and teach how to fix them.
export function ConceptLabel({
  id,
  name,
  className = "",
}: {
  id: number;
  name: string | null | undefined;
  className?: string;
}) {
  const unnamed = isUnnamed(name);
  const text = conceptLabel(id, name);
  const full = unnamed
    ? `feature ${id} — unnamed (annotate with \`prefscope interpret name\`)`
    : (name as string);
  return (
    <span
      tabIndex={0}
      className={`group relative inline-block max-w-full truncate align-bottom outline-none ${
        unnamed ? "italic text-slate-500" : ""
      } ${className}`}
    >
      {text}
      <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-max max-w-md whitespace-normal rounded-lg border border-edge bg-ink px-2 py-1 text-xs font-normal not-italic text-slate-200 shadow-lg group-hover:block group-focus:block">
        {full}
      </span>
    </span>
  );
}

// ✓ verified / unverified pill — drives the "is this label trustworthy?" signal.
// `n` (held-out pairs) shown when present so n=14 doesn't masquerade as n=200.
export function VerifiedBadge({ pass, n }: { pass?: boolean | null; n?: number | null }) {
  if (pass === undefined || pass === null)
    return <span className="rounded-full bg-slate-700/30 px-1.5 py-0.5 text-[10px] text-slate-500">unverified</span>;
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        pass ? "bg-good/15 text-good" : "bg-amber-500/15 text-amber-400"
      }`}
      title={pass ? "passed held-out fidelity check" : "failed held-out fidelity check"}
    >
      {pass ? "✓ verified" : "✗ unverified"}
      {n != null ? ` · n=${n}` : ""}
    </span>
  );
}

// muted "this is an LLM-assigned label, association not causation" footnote
export function Caveat({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-snug text-slate-500">{children}</p>;
}
