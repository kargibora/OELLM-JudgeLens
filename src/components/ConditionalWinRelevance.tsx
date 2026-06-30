import { useMemo, useState } from "react";
import type { ConditionalData } from "../types";
import { Card, Caveat, ConceptLabel, Explain, conceptLabel, divergeColor, WINRATE_REF } from "./ui";

type SortBy = "effect" | "flip" | "name" | "nsig";

/**
 * Conditional δ_{f,k}: the framework thesis as a statistic. For each behaviour f and
 * prompt type k, the length-controlled Δwin-rate of f *among battles of type k*. The
 * headline is the SIGN-FLIP: behaviours humans reward for one prompt type and penalise
 * for another — preference is conditional on what the prompt asked for.
 */
export default function ConditionalWinRelevance({ data }: { data: ConditionalData | null }) {
  const [sigOnly, setSigOnly] = useState(true);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("effect");
  const [highlightF, setHighlightF] = useState<number | null>(null);
  const [selected, setSelected] = useState<{ pc: number; f: number } | null>(null);

  const { cellOf, flips, flipSpan, colN, rows, pcs } = useMemo(() => {
    const empty = {
      cellOf: new Map<string, ConditionalData["cells"][number]>(),
      flips: [] as { f: ConditionalData["features"][number]; pos: ConditionalData["cells"]; neg: ConditionalData["cells"]; span: number }[],
      flipSpan: new Map<number, number>(),
      colN: new Map<number, number>(),
      rows: [] as { f: ConditionalData["features"][number]; sigMax: number; nsig: number; hasSig: boolean; span: number }[],
      pcs: [] as ConditionalData["prompt_concepts"],
    };
    if (!data) return empty;
    const cellOf = new Map<string, ConditionalData["cells"][number]>();
    for (const c of data.cells) cellOf.set(`${c.pc}:${c.f}`, c);

    // per-column battle count (cells of a prompt type share n)
    const colN = new Map<number, number>();
    for (const c of data.cells) if (c.n != null && !colN.has(c.pc)) colN.set(c.pc, c.n);

    // sign-flip: a feature with ≥1 significant + and ≥1 significant − cell
    const flips = data.features
      .map((f) => {
        const sigCells = data.cells.filter((c) => c.f === f.id && c.sig);
        const pos = sigCells.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta);
        const neg = sigCells.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta);
        const span = pos.length && neg.length ? pos[0].delta - neg[0].delta : 0;
        return { f, pos, neg, span };
      })
      .filter((r) => r.span > 0)
      .sort((a, b) => b.span - a.span);
    const flipSpan = new Map<number, number>(flips.map((r) => [r.f.id, r.span]));

    const rows = data.features
      .map((f) => {
        const cs = data.cells.filter((c) => c.f === f.id);
        const sigCs = cs.filter((c) => c.sig);
        const sigMax = Math.max(0, ...sigCs.map((c) => Math.abs(c.delta)));
        return { f, sigMax, nsig: sigCs.length, hasSig: sigCs.length > 0, span: flipSpan.get(f.id) ?? 0 };
      })
      .filter((r) => !sigOnly || r.hasSig);

    return { cellOf, flips, flipSpan, colN, rows, pcs: data.prompt_concepts };
  }, [data, sigOnly]);

  // search + sort applied outside the heavy memo so they're cheap to re-run
  const shownRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => conceptLabel(r.f.id, r.f.concept).toLowerCase().includes(q))
      : rows;
    const cmp: Record<SortBy, (a: typeof rows[number], b: typeof rows[number]) => number> = {
      effect: (a, b) => b.sigMax - a.sigMax,
      flip: (a, b) => b.span - a.span || b.sigMax - a.sigMax,
      name: (a, b) => conceptLabel(a.f.id, a.f.concept).localeCompare(conceptLabel(b.f.id, b.f.concept)),
      nsig: (a, b) => b.nsig - a.nsig || b.sigMax - a.sigMax,
    };
    return [...filtered].sort(cmp[sortBy]);
  }, [rows, query, sortBy]);

  if (!data)
    return (
      <Card>
        <p className="text-sm text-slate-400">
          No conditional δ. Generate it with{" "}
          <code className="text-slate-200">prefscope conditional-delta --conditional-out …</code>{" "}
          then re-export (it auto-detects <code>conditional_win_relevance.csv</code>).
        </p>
      </Card>
    );

  const pcName = (id: number) => pcs.find((p) => p.id === id)?.name ?? null;
  const selCell = selected ? cellOf.get(`${selected.pc}:${selected.f}`) : null;
  const selFeature = selected ? data.features.find((f) => f.id === selected.f) : null;
  // rank of the selected cell's |Δ| among its row's significant cells
  const selRank = (() => {
    if (!selected || !selCell?.sig) return null;
    const sig = data.cells.filter((c) => c.f === selected.f && c.sig).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { rank: sig.findIndex((c) => c.pc === selected.pc) + 1, of: sig.length };
  })();

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        Each behaviour's win-relevance, computed <b>separately within each prompt type</b>. The
        same behaviour can <span className="text-good">win</span> for one kind of prompt and{" "}
        <span className="text-bad">lose</span> for another — that's the point: human preference is{" "}
        <b>conditional on what the prompt asked for</b>, so a single global "humans reward X" number
        hides the real structure. Values are length-controlled Δwin-rate; only significant cells are
        coloured. Columns are prompt-concept <b>clusters</b>.
        <br />
        <span className="text-slate-400">
          <b>Which view do I want?</b> This (<i>Wins within prompt type</i>) = does a behaviour help
          win, per prompt type. <i>Elicits</i> = what a prompt pulls out, regardless of who wins.
          <i> Winner contrast</i> = which trait separates the winner from the loser.
        </span>
      </Explain>

      {flips.length > 0 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Sign-flips — conditional behaviours</h2>
          <p className="mb-3 text-sm text-slate-400">
            Behaviours humans reward for one prompt type and penalise for another (ranked by span).
            Click one to highlight its row in the grid.
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
          <h2 className="text-lg font-semibold">δ heatmap — behaviour × prompt type</h2>
          <div className="flex flex-wrap items-center gap-3">
            <ColorLegend />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-lg border border-edge bg-ink px-2 py-1 text-xs"
            >
              <option value="effect">sort: max |Δ|</option>
              <option value="flip">sort: sign-flip span</option>
              <option value="nsig"># significant cells</option>
              <option value="name">behaviour A–Z</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={sigOnly} onChange={(e) => setSigOnly(e.target.checked)} className="accent-accent" />
              significant rows only
            </label>
          </div>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter behaviours…"
          className="mb-3 w-72 rounded-lg border border-edge bg-ink px-3 py-1.5 text-sm placeholder:text-slate-600"
        />
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
              {shownRows.map(({ f, span }) => (
                <tr key={f.id} className={highlightF === f.id ? "ring-1 ring-inset ring-accent" : "hover:bg-edge/20"}>
                  <td className="sticky left-0 z-10 max-w-[260px] bg-panel/95 p-2 text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate" title={conceptLabel(f.id, f.concept)}>{conceptLabel(f.id, f.concept)}</span>
                      {span > 0 && (
                        <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-400" title={`sign-flip span ${span.toFixed(2)}`}>
                          ⇄ {span.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </td>
                  {pcs.map((p) => {
                    const c = cellOf.get(`${p.id}:${f.id}`);
                    const show = c && c.sig;
                    const isSel = selected?.pc === p.id && selected?.f === f.id;
                    return (
                      <td key={p.id} className="p-1">
                        <button
                          disabled={!c}
                          onClick={() => setSelected(isSel ? null : { pc: p.id, f: f.id })}
                          className={`flex h-7 w-full items-center justify-center rounded font-mono ${c ? "cursor-pointer" : "cursor-default"} ${isSel ? "ring-2 ring-accent" : ""}`}
                          style={{
                            background: show ? divergeColor(c!.delta, WINRATE_REF) : "transparent",
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
              <span>Δwin <span className={selCell.delta >= 0 ? "text-good" : "text-bad"}>{selCell.delta >= 0 ? "+" : ""}{selCell.delta.toFixed(3)}</span></span>
              {selCell.n != null && <span>n={selCell.n.toLocaleString()}</span>}
              {selCell.p != null && <span>p={selCell.p.toExponential(1)}</span>}
              <span>{selCell.sig ? "significant" : "not significant"}</span>
              {selRank && <span>rank {selRank.rank}/{selRank.of} in this behaviour</span>}
            </div>
          </div>
        )}

        <Caveat>
          {data.n_significant} of {data.n_cells} (behaviour × prompt-type) cells significant after
          Bonferroni. Blank = behaviour never tested for that prompt type (too few battles); "·" =
          tested, not significant. Colour saturation is fixed (±{WINRATE_REF} = full), so small
          effects look small. Click a cell for details.
        </Caveat>
      </Card>
    </div>
  );
}

function ColorLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
      <span>penalised</span>
      <span
        className="h-2.5 w-24 rounded"
        style={{
          background: `linear-gradient(to right, ${divergeColor(-WINRATE_REF, WINRATE_REF)}, ${divergeColor(0, WINRATE_REF)}, ${divergeColor(WINRATE_REF, WINRATE_REF)})`,
        }}
      />
      <span>rewarded</span>
    </div>
  );
}
