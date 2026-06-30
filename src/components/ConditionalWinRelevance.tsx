import { useEffect, useMemo, useRef, useState } from "react";
import type { ConditionalBundle, DeltaBundle, Feature } from "../types";
import { Card, Caveat, ConceptLabel, Explain, conceptLabel, divergeColor, isUnnamed, WINRATE_REF } from "./ui";

type SortBy = "effect" | "flip" | "general" | "nsig" | "name";
type Metric = "controlled" | "raw";

// a row's per-(prompt-concept) value, normalized across the two metrics so the grid
// renders the same way regardless of which is shown.
type Cell = { delta: number; sig: boolean; n: number | null; p: number | null };

/**
 * Wins within prompt type — for each behaviour f and prompt concept k, how f relates to
 * winning *among battles of type k*. Two metrics share one grid:
 *  • controlled (default) = length-controlled Δwin-rate (does the behaviour HELP win?)
 *  • raw                  = winner−loser feature contrast (what the winner EXPRESSES more;
 *                           NOT length-controlled — the old "Winner contrast" view)
 * Columns are individual prompt concepts by default; a checkbox folds them into clusters
 * (needs the clustered keyspace from the export). The headline is the SIGN-FLIP: a
 * behaviour rewarded for one prompt type and penalised for another.
 */
export default function ConditionalWinRelevance({
  conditional,
  delta,
  features,
  focus,
}: {
  conditional: ConditionalBundle | null;
  delta: DeltaBundle | null;
  features: Feature[];
  focus?: { pc: number; cf: number } | null;
}) {
  const [groupByCluster, setGroupByCluster] = useState(false);
  const [metric, setMetric] = useState<Metric>("controlled");
  const [namedPromptsOnly, setNamedPromptsOnly] = useState(true);
  const [sigOnly, setSigOnly] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("effect");
  const [query, setQuery] = useState("");
  const [highlightF, setHighlightF] = useState<number | null>(null);
  const [selected, setSelected] = useState<{ pc: number; f: number } | null>(null);
  const focusRef = useRef<HTMLButtonElement | null>(null);
  // identity of the last focus we've fully consumed (set state + scrolled). Each ★ jump
  // from App passes a NEW focus object, so a new jump re-triggers; manual toggles after a
  // jump keep the SAME object identity, so they don't re-force the view or re-scroll.
  const handledFocus = useRef<unknown>(null);

  // a ★ jump from the prompt map lands on the RAW winner-contrast cell (the prompt map is
  // keyed by raw prompt concepts in the same keyspace as delta.raw). Show ALL rows (sigOnly
  // off) so a non-significant target isn't filtered out before we can scroll to it.
  useEffect(() => {
    if (focus && handledFocus.current !== focus) {
      setMetric("raw");
      setGroupByCluster(false);
      setNamedPromptsOnly(false);
      setSigOnly(false);
    }
  }, [focus]);
  useEffect(() => {
    if (!focus || handledFocus.current === focus) return;
    if (focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      handledFocus.current = focus; // consumed — later toggles won't re-scroll to it
    }
  }, [focus, metric, groupByCluster, namedPromptsOnly, sigOnly]);

  const genMap = useMemo(() => {
    const m = new Map<number, { generality?: number; n_prompt_types?: number }>();
    features.forEach((f) => m.set(f.feature_id, { generality: f.generality, n_prompt_types: f.n_prompt_types }));
    return m;
  }, [features]);

  // fall back to raw when "group into clusters" is on but the bundle has no clustered
  // keyspace (older export) — show raw + a notice rather than an empty grid.
  const condData = (groupByCluster ? conditional?.clustered ?? conditional?.raw : conditional?.raw) ?? null;
  const deltaData = (groupByCluster ? delta?.clustered ?? delta?.raw : delta?.raw) ?? null;
  const clusteredMissing =
    groupByCluster && !(metric === "controlled" ? conditional?.clustered : delta?.clustered);

  // normalize the active (metric × keyspace) dataset into one shape the grid renders.
  const view = useMemo(() => {
    if (metric === "controlled") {
      const d = condData;
      if (!d) return null;
      const cellOf = new Map<string, Cell>();
      for (const c of d.cells) cellOf.set(`${c.pc}:${c.f}`, { delta: c.delta, sig: c.sig, n: c.n, p: c.p });
      return {
        prompt_concepts: d.prompt_concepts,
        featureList: d.features.map((f) => ({ id: f.id, concept: f.concept })),
        cellOf,
        ref: WINRATE_REF,
        n_cells: d.n_cells,
        n_significant: d.n_significant,
      };
    }
    const d = deltaData;
    if (!d) return null;
    const cellOf = new Map<string, Cell>();
    let ref = 0.0001;
    for (const c of d.cells) {
      const sig = c.stable && c.p != null && c.p < 0.05;
      cellOf.set(`${c.pc}:${c.cf}`, { delta: c.delta, sig, n: null, p: c.p });
      if (sig) ref = Math.max(ref, Math.abs(c.delta));
    }
    return {
      prompt_concepts: d.prompt_concepts,
      featureList: d.completion_features.map((f) => ({ id: f.id, concept: f.concept ?? null })),
      cellOf,
      ref,
      n_cells: d.n_cells,
      n_significant: d.n_significant,
    };
  }, [metric, condData, deltaData]);

  // visible columns (prompt concepts). raw mode has many unnamed prompt features, so the
  // "named only" filter defaults on to keep the grid legible.
  const pcs = useMemo(() => {
    const all = view?.prompt_concepts ?? [];
    return namedPromptsOnly ? all.filter((p) => !isUnnamed(p.name)) : all;
  }, [view, namedPromptsOnly]);

  // per-column battle count (controlled metric only — winner-contrast has no per-cell n)
  const colN = useMemo(() => {
    const m = new Map<number, number>();
    if (metric === "controlled" && condData)
      for (const c of condData.cells) if (c.n != null && !m.has(c.pc)) m.set(c.pc, c.n);
    return m;
  }, [metric, condData]);

  // rows = response behaviours, with sig stats computed over the VISIBLE columns
  const { rows, flips } = useMemo(() => {
    if (!view) return { rows: [] as RowT[], flips: [] as RowT[] };
    const featRows: RowT[] = view.featureList.map((f) => {
      const sigCells: { pc: number; delta: number }[] = [];
      let sigMax = 0;
      for (const p of pcs) {
        const c = view.cellOf.get(`${p.id}:${f.id}`);
        if (c && c.sig) {
          sigMax = Math.max(sigMax, Math.abs(c.delta));
          sigCells.push({ pc: p.id, delta: c.delta });
        }
      }
      const pos = sigCells.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta);
      const neg = sigCells.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta);
      const span = pos.length && neg.length ? pos[0].delta - neg[0].delta : 0;
      const g = genMap.get(f.id);
      return {
        f, sigMax, nsig: sigCells.length, hasSig: sigCells.length > 0, span, pos, neg,
        generality: g?.generality ?? null, n_prompt_types: g?.n_prompt_types ?? null,
      };
    });
    const flips = featRows.filter((r) => r.span > 0).sort((a, b) => b.span - a.span);
    const rows = featRows.filter((r) => !sigOnly || r.hasSig);
    return { rows, flips };
  }, [view, pcs, sigOnly, genMap]);

  const shownRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => conceptLabel(r.f.id, r.f.concept).toLowerCase().includes(q)) : rows;
    const cmp: Record<SortBy, (a: RowT, b: RowT) => number> = {
      effect: (a, b) => b.sigMax - a.sigMax,
      flip: (a, b) => b.span - a.span || b.sigMax - a.sigMax,
      general: (a, b) => (b.generality ?? -1) - (a.generality ?? -1) || b.sigMax - a.sigMax,
      nsig: (a, b) => b.nsig - a.nsig || b.sigMax - a.sigMax,
      name: (a, b) => conceptLabel(a.f.id, a.f.concept).localeCompare(conceptLabel(b.f.id, b.f.concept)),
    };
    return [...filtered].sort(cmp[sortBy]);
  }, [rows, query, sortBy]);

  if (!conditional && !delta)
    return (
      <Card>
        <p className="text-sm text-slate-400">
          No conditional δ / winner contrast. Generate with{" "}
          <code className="text-slate-200">prefscope conditional-delta …</code> then re-export.
        </p>
      </Card>
    );

  const pcName = (id: number) => view?.prompt_concepts.find((p) => p.id === id)?.name ?? null;
  const selCell = selected && view ? view.cellOf.get(`${selected.pc}:${selected.f}`) : null;
  const selFeature = selected ? shownRows.find((r) => r.f.id === selected.f)?.f
    ?? view?.featureList.find((f) => f.id === selected.f) ?? null : null;
  const selRank = (() => {
    if (!selected || !view || !selCell?.sig) return null;
    const sig: { pc: number; delta: number }[] = [];
    for (const p of view.prompt_concepts) {
      const c = view.cellOf.get(`${p.id}:${selected.f}`);
      if (c?.sig) sig.push({ pc: p.id, delta: c.delta });
    }
    sig.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { rank: sig.findIndex((c) => c.pc === selected.pc) + 1, of: sig.length };
  })();

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        Each behaviour's relationship to winning, computed <b>separately within each prompt
        concept</b>. The same behaviour can <span className="text-good">win</span> for one kind of
        prompt and <span className="text-bad">lose</span> for another — human preference is{" "}
        <b>conditional on what the prompt asked for</b>, so a single global "humans reward X" number
        hides the structure.
        <br />
        <span className="text-slate-400">
          Two metrics: <b>controlled</b> = length-controlled Δwin-rate (does the behaviour <i>help
          win</i>?). <b>raw</b> = winner−loser feature contrast (what the winner <i>expresses</i>{" "}
          more — not length-controlled; the former "Winner contrast"). Trust controlled; raw is the
          before-length-control companion. Columns are individual prompt concepts (check "group into
          clusters" to fold them). <i>Elicits</i> is the third, preference-independent view (what a
          prompt pulls out, regardless of who wins).
        </span>
      </Explain>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-edge p-0.5 text-xs">
            <button
              onClick={() => setMetric("controlled")}
              className={`rounded-md px-2.5 py-1 transition ${metric === "controlled" ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              length-controlled Δwin-rate
            </button>
            <button
              onClick={() => setMetric("raw")}
              className={`rounded-md px-2.5 py-1 transition ${metric === "raw" ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              raw winner contrast
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-400"
                 title="fold individual prompt concepts into LLM-named clusters (needs the clustered keyspace)">
            <input type="checkbox" checked={groupByCluster} onChange={(e) => setGroupByCluster(e.target.checked)} className="accent-accent" />
            group into clusters
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400"
                 title="hide prompt concepts that aren't LLM-named (raw mode has many)">
            <input type="checkbox" checked={namedPromptsOnly} onChange={(e) => setNamedPromptsOnly(e.target.checked)} className="accent-accent" />
            named prompt concepts only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={sigOnly} onChange={(e) => setSigOnly(e.target.checked)} className="accent-accent" />
            significant rows only
          </label>
        </div>
        {clusteredMissing && (
          <p className="mt-2 text-xs text-amber-400">
            No clustered keyspace in this bundle — re-export with{" "}
            <code>--conditional-clustered</code>/<code>--delta-clustered</code>. Showing raw.
          </p>
        )}
      </Card>

      {flips.length > 0 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Sign-flips — conditional behaviours</h2>
          <p className="mb-3 text-sm text-slate-400">
            Behaviours {metric === "controlled" ? "humans reward" : "the winner shows more"} for one
            prompt type and {metric === "controlled" ? "penalise" : "shows less"} for another (ranked
            by span). Click one to highlight its row in the grid.
          </p>
          <ul className="flex flex-col gap-2">
            {flips.slice(0, 12).map(({ f, pos, neg, span }) => (
              <li key={f.id}>
                <button
                  onClick={() => setHighlightF((h) => (h === f.id ? null : f.id))}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    highlightF === f.id ? "border-accent bg-accent/10" : "border-edge bg-ink/40 hover:bg-edge/30"
                  }`}
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-slate-200">{conceptLabel(f.id, f.concept)}</span>
                    <span className="font-mono text-xs text-slate-500">span {span.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded bg-good/15 px-1.5 py-0.5 text-good">
                      +{pos[0].delta.toFixed(2)} for "{conceptLabel(pos[0].pc, pcName(pos[0].pc))}"
                    </span>
                    <span className="rounded bg-bad/15 px-1.5 py-0.5 text-bad">
                      {neg[0].delta.toFixed(2)} for "{conceptLabel(neg[0].pc, pcName(neg[0].pc))}"
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {metric === "controlled" ? "δ heatmap — Δwin-rate" : "Δ heatmap — winner contrast"} × prompt concept
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <ColorLegend ref0={view?.ref ?? WINRATE_REF} metric={metric} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-lg border border-edge bg-ink px-2 py-1 text-xs"
            >
              <option value="effect">sort: max |Δ|</option>
              <option value="flip">sort: sign-flip span</option>
              <option value="general">sort: most general</option>
              <option value="nsig"># significant cells</option>
              <option value="name">behaviour A–Z</option>
            </select>
          </div>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter behaviours…"
          className="mb-3 w-72 rounded-lg border border-edge bg-ink px-3 py-1.5 text-sm placeholder:text-slate-600"
        />
        {!view || pcs.length === 0 ? (
          <p className="text-sm text-slate-500">No columns under the current filters.</p>
        ) : (
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 bg-panel/95 p-2 text-left font-medium text-slate-400">
                    behaviour ({shownRows.length})
                  </th>
                  {pcs.map((p) => (
                    <th key={p.id} className="sticky top-0 z-10 max-w-[120px] bg-panel/95 p-2 text-left align-bottom font-medium text-slate-400">
                      <ConceptLabel id={p.id} name={p.name} />
                      {colN.get(p.id) != null && (
                        <div className="text-[10px] font-normal text-slate-600">n={colN.get(p.id)!.toLocaleString()}</div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.map(({ f, span, generality, n_prompt_types }) => (
                  <tr key={f.id} className={highlightF === f.id ? "ring-1 ring-inset ring-accent" : "hover:bg-edge/20"}>
                    <td className="sticky left-0 z-10 max-w-[260px] bg-panel/95 p-2 text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate" title={conceptLabel(f.id, f.concept)}>{conceptLabel(f.id, f.concept)}</span>
                        {generality != null && (
                          <span
                            className="shrink-0 rounded bg-slate-600/25 px-1 text-[10px] font-medium text-slate-400"
                            title={`prompt-generality ${generality.toFixed(2)} (0 = content-bound, 1 = fires across all prompt concepts)${n_prompt_types != null ? `; ${n_prompt_types} prompt types` : ""}`}
                          >
                            g{generality.toFixed(2)}
                          </span>
                        )}
                        {span > 0 && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-400" title={`sign-flip span ${span.toFixed(2)}`}>
                            ⇄ {span.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </td>
                    {pcs.map((p) => {
                      const c = view.cellOf.get(`${p.id}:${f.id}`);
                      const show = c && c.sig;
                      const isSel = selected?.pc === p.id && selected?.f === f.id;
                      const isFocus = !!focus && p.id === focus.pc && f.id === focus.cf;
                      return (
                        <td key={p.id} className="p-1">
                          <button
                            ref={isFocus ? focusRef : undefined}
                            disabled={!c}
                            onClick={() => setSelected(isSel ? null : { pc: p.id, f: f.id })}
                            className={`flex h-7 w-full items-center justify-center rounded font-mono ${c ? "cursor-pointer" : "cursor-default"} ${isSel || isFocus ? "ring-2 ring-accent" : ""}`}
                            style={{
                              background: show ? divergeColor(c!.delta, view.ref) : "transparent",
                              color: show ? "#0b0f17" : "#475569",
                            }}
                            title={c ? `Δ=${c.delta.toFixed(3)}${c.n != null ? `, n=${c.n}` : ""}${c.sig ? "" : " (n.s.)"}` : "not tested"}
                          >
                            {show ? c!.delta.toFixed(2) : c ? "·" : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selCell && selFeature && (
          <div className="mt-3 rounded-xl border border-edge bg-ink/40 p-3 text-sm">
            <div className="mb-1 flex items-start justify-between gap-2">
              <div>
                <span className="font-semibold text-slate-200">{conceptLabel(selFeature.id, selFeature.concept)}</span>
                <span className="text-slate-500"> within </span>
                <span className="font-semibold text-slate-200">"{conceptLabel(selected!.pc, pcName(selected!.pc))}"</span>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-slate-500 hover:text-slate-300">close</button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-slate-400">
              <span>{metric === "controlled" ? "Δwin" : "Δ contrast"} <span className={selCell.delta >= 0 ? "text-good" : "text-bad"}>{selCell.delta >= 0 ? "+" : ""}{selCell.delta.toFixed(3)}</span></span>
              {selCell.n != null && <span>n={selCell.n.toLocaleString()}</span>}
              {selCell.p != null && <span>p={selCell.p.toExponential(1)}</span>}
              <span>{selCell.sig ? "significant" : "not significant"}</span>
              {selRank && <span>rank {selRank.rank}/{selRank.of} in this behaviour</span>}
            </div>
          </div>
        )}

        <Caveat>
          {view ? `${view.n_significant} of ${view.n_cells}` : "0"} (behaviour × prompt-concept) cells
          significant after Bonferroni. Blank = not tested (too few battles); "·" = tested, not
          significant. {metric === "controlled"
            ? `Colour saturation fixed (±${WINRATE_REF} = full).`
            : "Colour saturation scales to this view's strongest contrast. Raw contrast is NOT length-controlled."}{" "}
          <b>g</b> = prompt-generality (how broadly the behaviour fires across prompt concepts). Click a cell for details.
        </Caveat>
      </Card>
    </div>
  );
}

type RowT = {
  f: { id: number; concept: string | null };
  sigMax: number;
  nsig: number;
  hasSig: boolean;
  span: number;
  pos: { pc: number; delta: number }[];
  neg: { pc: number; delta: number }[];
  generality: number | null;
  n_prompt_types: number | null;
};

function ColorLegend({ ref0, metric }: { ref0: number; metric: Metric }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
      <span>{metric === "controlled" ? "penalised" : "loser more"}</span>
      <span
        className="h-2.5 w-24 rounded"
        style={{
          background: `linear-gradient(to right, ${divergeColor(-ref0, ref0)}, ${divergeColor(0, ref0)}, ${divergeColor(ref0, ref0)})`,
        }}
      />
      <span>{metric === "controlled" ? "rewarded" : "winner more"}</span>
    </div>
  );
}
