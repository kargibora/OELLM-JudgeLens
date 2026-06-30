import { useEffect, useMemo, useRef, useState } from "react";
import type { DeltaData, DeltaCell } from "../types";
import { Card, Explain, divergeColor } from "./ui";

// neutral fill for not-significant / not-tested cells — deliberately NOT white,
// so "no reliable effect" never reads as "zero effect".
const NEUTRAL = "rgba(148,163,184,0.07)";
const CONFOUND = "#f59e0b"; // amber = length/style-entangled

type Col = {
  key: string;
  label: string;
  ids: number[];
  win_assoc: number | null;
  confounded: boolean;
  verified: boolean;
};

export default function DeltaHeatmap(
  { delta, focus }: { delta: DeltaData | null; focus?: { pc: number; cf: number } | null }
) {
  const [byBehavior, setByBehavior] = useState(true);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const focusRef = useRef<HTMLDivElement | null>(null);
  // scroll the jumped-to cell into view when arriving from the prompt map
  useEffect(() => {
    if (focus && focusRef.current)
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [focus]);

  const cellMap = useMemo(() => {
    const m = new Map<string, DeltaCell>();
    delta?.cells.forEach((c) => m.set(`${c.pc}-${c.cf}`, c));
    return m;
  }, [delta]);

  // a cell counts only if split-half stable AND Bonferroni-significant
  const sigDelta = (pc: number, cf: number): number | null => {
    const c = cellMap.get(`${pc}-${cf}`);
    return c && c.stable && c.p !== null && c.p < 0.05 ? c.delta : null;
  };

  const cols: Col[] = useMemo(() => {
    if (!delta) return [];
    let feats = delta.completion_features;
    if (verifiedOnly) feats = feats.filter((f) => f.fidelity_pass);
    if (!byBehavior) {
      return feats.map((f) => ({
        key: `f${f.id}`,
        label: (f.concept ?? `feature ${f.id}`).slice(0, 48),
        ids: [f.id],
        win_assoc: f.win_assoc ?? null,
        confounded: !!f.confound_entangled,
        verified: !!f.fidelity_pass,
      }));
    }
    const groups = new Map<string, typeof feats>();
    feats.forEach((f) => {
      const k = f.behavior ?? (f.cluster_id != null ? `cluster ${f.cluster_id}` : "unclustered");
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(f);
    });
    return [...groups.entries()].map(([label, members]) => {
      const was = members.map((m) => m.win_assoc).filter((v): v is number => v != null);
      return {
        key: label,
        label,
        ids: members.map((m) => m.id),
        win_assoc: was.length ? was.reduce((a, b) => a + b, 0) / was.length : null,
        confounded: members.some((m) => m.confound_entangled),
        verified: members.some((m) => m.fidelity_pass),
      };
    });
  }, [delta, byBehavior, verifiedOnly]);

  // value for a (row, col): mean of the col's significant member deltas, else null
  const cellValue = (pc: number, col: Col): number | null => {
    const ds = col.ids.map((id) => sigDelta(pc, id)).filter((v): v is number => v != null);
    return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
  };

  const maxAbs = useMemo(() => {
    let m = 0.0001;
    delta?.cells.forEach((c) => {
      if (c.stable && c.p !== null && c.p < 0.05) m = Math.max(m, Math.abs(c.delta));
    });
    return m;
  }, [delta]);

  const maxWin = useMemo(
    () => Math.max(0.0001, ...cols.map((c) => Math.abs(c.win_assoc ?? 0))),
    [cols]
  );

  if (!delta)
    return (
      <Card>
        <h2 className="text-lg font-semibold">Prompt → response relationship</h2>
        <p className="mt-2 text-sm text-slate-400">
          No <code>delta.json</code>. Generate it:{" "}
          <code className="text-slate-300">
            prefscope conditional-delta --permute 50
          </code>{" "}
          then re-run the exporter with <code className="text-slate-300">--delta …</code>.
        </p>
      </Card>
    );

  const cell = 30;
  // hide-empty: drop prompt rows / behavior columns that have no significant cell,
  // so the grid condenses to just the informative block (most cells are n.s.).
  const allRows = delta.prompt_concepts;
  const colHasSig = (c: Col) => allRows.some((r) => cellValue(r.id, c) != null);
  const rowHasSig = (r: { id: number }) => cols.some((c) => cellValue(r.id, c) != null);
  const vcols = hideEmpty ? cols.filter(colHasSig) : cols;
  const rows = hideEmpty ? allRows.filter(rowHasSig) : allRows;

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Prompt → response relationship (Δ)</h2>
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setByBehavior((v) => !v)}
            className="rounded-lg border border-edge px-3 py-1 text-slate-300 hover:bg-edge/50"
          >
            {byBehavior ? "behaviors" : "features"}
          </button>
          <button
            onClick={() => setVerifiedOnly((v) => !v)}
            className={`rounded-lg border px-3 py-1 ${
              verifiedOnly
                ? "border-good/50 bg-good/10 text-good"
                : "border-edge text-slate-300 hover:bg-edge/50"
            }`}
          >
            {verifiedOnly ? "verified only ✓" : "all features"}
          </button>
          <button
            onClick={() => setHideEmpty((v) => !v)}
            className={`rounded-lg border px-3 py-1 ${
              hideEmpty
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-edge text-slate-300 hover:bg-edge/50"
            }`}
          >
            {hideEmpty ? "hiding empty ✓" : "show all cells"}
          </button>
        </div>
      </div>

      <div className="mb-3">
        <Explain>
          For each <b>prompt type</b> (row) and each response <b>behavior</b> (column), the cell
          shows how strongly that property <i>is associated with</i> the human-preferred response —{" "}
          <span className="text-good">green = the winner shows it more</span>,{" "}
          <span className="text-bad">red = the loser shows it more</span>. Only cells that are{" "}
          <b>statistically significant (Bonferroni) and split-half stable</b> are colored; faint
          cells are not reliable (not zero — untested). The right strip is each behavior&apos;s
          overall win-association, <span style={{ color: CONFOUND }}>amber if length/style-entangled</span>.{" "}
          A column colored across <i>every</i> row = a universal preference; colored in only a few
          rows = conditional. <b>Association, not causation</b>; behavior names are LLM-generated.{" "}
          {delta.n_significant} of {delta.n_cells} tested cells are significant + stable.{" "}
          <b>This is a raw association, not length-controlled</b> — for the length-controlled
          per-prompt-type effect (and the reward/penalty sign-flips), see the{" "}
          <b>Wins within prompt type</b> tab.
          <br />
          <span className="text-slate-400">
            <b>Which view do I want?</b> This (<i>Winner contrast</i>) = which trait separates the
            winner from the loser. <i>Elicits</i> = what a prompt pulls out, regardless of who wins.
            <i> Wins within prompt type</i> = whether a behaviour helps win, per prompt type.
          </span>
        </Explain>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* column headers — numbered (1…N); full labels in the legend below */}
          <div className="flex items-end" style={{ marginLeft: 168 }}>
            {vcols.map((c, i) => (
              <div
                key={c.key}
                title={c.label}
                className="shrink-0 text-center text-[11px] tabular-nums text-slate-400"
                style={{ width: cell, height: 18 }}
              >
                {c.verified ? "" : "○"}
                {i + 1}
              </div>
            ))}
          </div>

          {/* rows */}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center">
              <div
                className="shrink-0 truncate pr-2 text-right text-[11px] text-slate-300"
                style={{ width: 168 }}
                title={r.name}
              >
                {r.name}
              </div>
              {vcols.map((c) => {
                const v = cellValue(r.id, c);
                const isFocus = !!focus && r.id === focus.pc && c.ids.includes(focus.cf);
                return (
                  <div
                    key={c.key}
                    ref={isFocus ? focusRef : undefined}
                    title={`${r.name} · ${c.label}\nΔ = ${v == null ? "n.s." : v.toFixed(3)}`}
                    className="relative shrink-0 border border-ink"
                    style={{
                      width: cell,
                      height: cell,
                      background: v == null ? NEUTRAL : divergeColor(v, maxAbs),
                      boxShadow: isFocus ? "0 0 0 2px #818cf8" : undefined,
                      zIndex: isFocus ? 10 : undefined,
                    }}
                  />
                );
              })}
            </div>
          ))}

          {/* win-assoc strip (one bar per column, under the matrix) */}
          <div className="mt-2 flex items-start" style={{ marginLeft: 168 }}>
            {vcols.map((c) => {
              const w = c.win_assoc ?? 0;
              const h = Math.round((Math.abs(w) / maxWin) * 28);
              return (
                <div
                  key={c.key}
                  title={`${c.label}\nwin assoc = ${c.win_assoc?.toFixed(3) ?? "—"}${
                    c.confounded ? " (length/style-entangled)" : ""
                  }`}
                  className="flex shrink-0 items-end justify-center"
                  style={{ width: cell, height: 30 }}
                >
                  <div
                    style={{
                      width: cell - 8,
                      height: Math.max(2, h),
                      background: c.confounded ? CONFOUND : "#6366f1",
                      opacity: w >= 0 ? 0.95 : 0.5,
                    }}
                  />
                </div>
              );
            })}
            <div className="ml-3 w-20 text-[10px] text-slate-500">
              bar = |win assoc|;<br />
              <span style={{ color: CONFOUND }}>amber</span> = confound-entangled
            </div>
          </div>
        </div>
      </div>

      {/* column legend: number -> full concept/behavior (axis labels stay legible) */}
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
        {vcols.map((c, i) => (
          <div key={c.key} className="flex gap-2" title={c.label}>
            <span className="w-5 shrink-0 text-right tabular-nums text-slate-500">{i + 1}</span>
            <span className="truncate">
              {c.verified ? "" : "○ "}
              {c.label}
              {c.confounded && <span style={{ color: CONFOUND }}> ⚠</span>}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
