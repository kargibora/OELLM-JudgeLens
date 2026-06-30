import { useMemo, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import type { ElicEdge, ElicitationData } from "../types";
import { Card, Caveat, ConceptLabel, Explain, conceptLabel, isUnnamed } from "./ui";

type Dir = "elicit" | "suppress" | "both";

// FIXED bar reference (not per-card max): log2 lift of 3 = ×8 fills the bar, so a bar's
// length is comparable across cards and sessions. Matches ui.tsx's fixed-reference rule.
const LIFT_REF_L2 = 3;
const DRILL_N = 15;

export default function Elicitation({ data }: { data: ElicitationData | null }) {
  const [focusP, setFocusP] = useState<number | null>(null);
  const [focusC, setFocusC] = useState<number | null>(null);
  const [sigOnly, setSigOnly] = useState(true);
  const [namedOnly, setNamedOnly] = useState(true);
  const [dir, setDir] = useState<Dir>("elicit");
  const [query, setQuery] = useState("");

  const pName = useMemo(() => {
    const m = new Map<number, string | null>();
    data?.prompt_concepts.forEach((p) => m.set(p.id, p.concept));
    return m;
  }, [data]);
  const cName = useMemo(() => {
    const m = new Map<number, string | null>();
    data?.response_concepts.forEach((c) => m.set(c.id, c.concept));
    return m;
  }, [data]);
  const namedCount = useMemo(
    () => (data?.response_concepts.filter((c) => !isUnnamed(c.concept)).length ?? 0),
    [data]
  );

  const filtered = useMemo(() => {
    if (!data) return [] as ElicEdge[];
    const q = query.trim().toLowerCase();
    return data.edges.filter((e) => {
      if (sigOnly && !e.sig) return false;
      // most response features aren't annotated yet (null / legacy "nan"); hide those
      // by default so the table isn't mostly "feature N" noise
      if (namedOnly && (isUnnamed(cName.get(e.cy)) || isUnnamed(pName.get(e.px)))) return false;
      if (dir === "elicit" && e.l2 <= 0) return false;
      if (dir === "suppress" && e.l2 >= 0) return false;
      if (q) {
        const hay = `${conceptLabel(e.px, pName.get(e.px))} ${conceptLabel(e.cy, cName.get(e.cy))}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, sigOnly, namedOnly, dir, query, pName, cName]);

  const ranked = useMemo(
    () => [...filtered].sort((a, b) => Math.abs(b.l2) - Math.abs(a.l2)).slice(0, 60),
    [filtered]
  );

  if (!data)
    return (
      <Card>
        <p className="text-sm text-slate-400">
          No elicitation table. Generate it with{" "}
          <code className="text-slate-200">prefscope elicit</code> then re-export
          (auto-detects <code>prompt_response_elicitation.csv</code>).
        </p>
      </Card>
    );

  const liftStr = (l: number) => `×${l.toFixed(l >= 10 ? 0 : l >= 1 ? 1 : 2)}`;

  // a horizontal bar list of edges, scaled to a FIXED reference so bars are comparable
  // across cards (a full-width bar always means ×8, never "the most in this card").
  const BarList = ({ edges, side }: { edges: ElicEdge[]; side: "response" | "prompt" }) => (
    <ul className="flex flex-col gap-1">
      {edges.map((e) => {
        const id = side === "response" ? e.cy : e.px;
        const name = side === "response" ? cName.get(e.cy) : pName.get(e.px);
        const pos = e.l2 >= 0;
        return (
          <li key={`${e.px}:${e.cy}`} className="flex items-center gap-2 text-sm">
            <span className="w-1/2 text-slate-300">
              <ConceptLabel id={id} name={name} wrap />
            </span>
            <div className="relative h-4 flex-1 rounded bg-ink/60">
              <div
                className="absolute inset-y-0 left-0 rounded"
                style={{
                  width: `${Math.min(1, Math.abs(e.l2) / LIFT_REF_L2) * 100}%`,
                  background: pos ? "rgba(52,211,153,0.6)" : "rgba(248,113,113,0.6)",
                }}
              />
            </div>
            <span className={`w-20 text-right font-mono text-xs ${pos ? "text-good" : "text-bad"}`}>
              {liftStr(e.lift)}{!e.sig && <span className="text-slate-600"> n.s.</span>}
            </span>
            <span className="w-14 text-right font-mono text-[11px] text-slate-500">n={e.nco}</span>
          </li>
        );
      })}
    </ul>
  );

  const sorted = (pred: (e: ElicEdge) => boolean) =>
    filtered.filter(pred).sort((a, b) => Math.abs(b.l2) - Math.abs(a.l2));

  // drilldown body: full sorted set, capped at DRILL_N with an honest "top N of M"
  const Drill = ({ edges, side }: { edges: ElicEdge[]; side: "response" | "prompt" }) => {
    const shown = edges.slice(0, DRILL_N);
    return (
      <>
        {shown.length ? <BarList edges={shown} side={side} />
          : <p className="text-sm text-slate-500">no edges under current filters</p>}
        {edges.length > DRILL_N && (
          <p className="mt-1.5 text-[11px] text-slate-500">showing top {DRILL_N} of {edges.length}</p>
        )}
      </>
    );
  };

  const Toggle = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs transition ${
        active ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        For every <b>prompt concept</b> and <b>response concept</b>, how much more often the response
        concept appears when the prompt concept is present — <b>lift</b> = P(response&nbsp;Y |
        prompt&nbsp;X) / P(Y). <span className="text-good">×&gt;1 = above base rate</span>,{" "}
        <span className="text-bad">×&lt;1 = below</span>. <b>Descriptive</b> co-occurrence,
        independent of who wins — the complement to Win-relevance. Rows are ranked by deviation from
        base rate (|log₂ lift|), significant first. Click any concept to drill in both directions.{" "}
        <i>lift is symmetric — the prompt→response direction is structural (the prompt comes first),
        not causal.</i>
        <br />
        <span className="text-slate-400">
          <b>Which view do I want?</b> This (<i>Elicits</i>) = what a prompt pulls out, regardless of
          who wins. <i>Wins within prompt type</i> = whether a behaviour helps win, per prompt type.
          <i> Winner contrast</i> = which trait separates the winner from the loser.
        </span>
      </Explain>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-edge p-0.5">
            <Toggle active={dir === "elicit"} onClick={() => setDir("elicit")}>elicits ↑</Toggle>
            <Toggle active={dir === "suppress"} onClick={() => setDir("suppress")}>suppresses ↓</Toggle>
            <Toggle active={dir === "both"} onClick={() => setDir("both")}>both</Toggle>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={sigOnly} onChange={(e) => setSigOnly(e.target.checked)} className="accent-accent" />
            significant only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400"
                 title="most response features aren't annotated yet; hide unnamed ones">
            <input type="checkbox" checked={namedOnly} onChange={(e) => setNamedOnly(e.target.checked)} className="accent-accent" />
            named only ({namedCount} of {data.response_concepts.length} named)
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter concepts… (e.g. french, finance)"
            className="ml-auto w-64 rounded-lg border border-edge bg-ink px-3 py-1.5 text-sm placeholder:text-slate-600"
          />
        </div>
      </Card>

      {(focusP !== null || focusC !== null) && (
        <div className="grid gap-4 md:grid-cols-2">
          {focusP !== null && (
            <Card>
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-200">
                  Prompts about “{conceptLabel(focusP, pName.get(focusP))}” — response concepts that co-occur:
                </h3>
                <button onClick={() => setFocusP(null)} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
              </div>
              <Drill edges={sorted((e) => e.px === focusP)} side="response" />
            </Card>
          )}
          {focusC !== null && (
            <Card>
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-200">
                  “{conceptLabel(focusC, cName.get(focusC))}” — prompt concepts it co-occurs with:
                </h3>
                <button onClick={() => setFocusC(null)} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
              </div>
              <Drill edges={sorted((e) => e.cy === focusC)} side="prompt" />
            </Card>
          )}
        </div>
      )}

      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Strongest prompt → response edges</h2>
          <span className="text-xs text-slate-500">
            {filtered.length.toLocaleString()} edges · showing top {ranked.length}
          </span>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-1.5 pr-2">prompt concept</th>
                <th className="px-2"></th>
                <th className="py-1.5 pr-2">response concept</th>
                <th className="py-1.5 pr-2 text-right">lift</th>
                <th className="py-1.5 pr-2 text-right">P(Y|X)</th>
                <th className="py-1.5 pr-2 text-right">n</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((e) => {
                const pos = e.l2 >= 0;
                return (
                  <tr key={`${e.px}:${e.cy}`} className="border-b border-edge/40 hover:bg-edge/20">
                    <td className="py-1.5 pr-2">
                      <button onClick={() => setFocusP(e.px)} className="block max-w-[220px] truncate text-left text-slate-300 hover:text-accent" title={conceptLabel(e.px, pName.get(e.px))}>
                        {conceptLabel(e.px, pName.get(e.px))}
                      </button>
                    </td>
                    <td className="px-2 text-slate-600"><ArrowRight size={13} /></td>
                    <td className="py-1.5 pr-2">
                      <button onClick={() => setFocusC(e.cy)} className="block max-w-[220px] truncate text-left text-slate-300 hover:text-accent" title={conceptLabel(e.cy, cName.get(e.cy))}>
                        {conceptLabel(e.cy, cName.get(e.cy))}
                      </button>
                    </td>
                    <td className={`py-1.5 pr-2 text-right font-mono ${pos ? "text-good" : "text-bad"}`}>
                      {liftStr(e.lift)}{!e.sig && <span className="text-slate-600"> ·n.s.</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-slate-400">{e.pyx.toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-slate-500">{e.nco}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Caveat>
          {data.n_significant} of {data.n_edges} tested edges significant (Bonferroni, 2×2 χ²
          corrected for the A/B stacking)
          {data.n_shown != null && data.n_shown < data.n_edges
            ? `; this table holds the strongest ${data.n_shown}`
            : ""}. lift is co-occurrence, <b>not causation</b> — a finance prompt and a descriptive
          answer may share a third cause, and model/topic/length are not controlled. n = responses
          where both fired. Concepts are LLM-named.
        </Caveat>
      </Card>
    </div>
  );
}
