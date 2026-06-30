import { useMemo, useState } from "react";
import type { ConditionalData } from "../types";
import { Card, Caveat, Explain, divergeColor, WINRATE_REF } from "./ui";

/**
 * Conditional δ_{f,k}: the framework thesis as a statistic. For each behaviour f and
 * prompt type k, the length-controlled Δwin-rate of f *among battles of type k*. The
 * headline is the SIGN-FLIP: behaviours humans reward for one prompt type and penalise
 * for another — preference is conditional on what the prompt asked for.
 */
export default function ConditionalWinRelevance({ data }: { data: ConditionalData | null }) {
  const [sigOnly, setSigOnly] = useState(true);

  const { cellOf, flips, rows, pcs } = useMemo(() => {
    const empty = { cellOf: new Map(), flips: [], rows: [], pcs: [] as ConditionalData["prompt_concepts"] };
    if (!data) return empty;
    const cellOf = new Map<string, ConditionalData["cells"][number]>();
    for (const c of data.cells) cellOf.set(`${c.pc}:${c.f}`, c);

    // sign-flip ranking: a feature with ≥1 significant + and ≥1 significant − cell.
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

    // heatmap rows: features ordered by how much any significant cell moves
    const rows = data.features
      .map((f) => {
        const cs = data.cells.filter((c) => c.f === f.id);
        const sigMax = Math.max(0, ...cs.filter((c) => c.sig).map((c) => Math.abs(c.delta)));
        return { f, sigMax, hasSig: cs.some((c) => c.sig) };
      })
      .filter((r) => !sigOnly || r.hasSig)
      .sort((a, b) => b.sigMax - a.sigMax);

    return { cellOf, flips, rows, pcs: data.prompt_concepts };
  }, [data, sigOnly]);

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

  const pcName = (id: number) => pcs.find((p) => p.id === id)?.name ?? `type ${id}`;

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
          </p>
          <ul className="flex flex-col gap-2">
            {flips.slice(0, 12).map(({ f, pos, neg, span }) => (
              <li key={f.id} className="rounded-xl border border-edge bg-ink/40 p-3">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-slate-200">{f.concept}</span>
                  <span className="font-mono text-xs text-slate-500">span {span.toFixed(2)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded bg-good/15 px-1.5 py-0.5 text-good">
                    +{pos[0].delta.toFixed(2)} for "{pcName(pos[0].pc)}"
                  </span>
                  <span className="rounded bg-bad/15 px-1.5 py-0.5 text-bad">
                    {neg[0].delta.toFixed(2)} for "{pcName(neg[0].pc)}"
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">δ heatmap — behaviour × prompt type</h2>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={sigOnly}
              onChange={(e) => setSigOnly(e.target.checked)}
              className="accent-accent"
            />
            significant rows only
          </label>
        </div>
        <div className="overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-panel/95 p-2 text-left font-medium text-slate-400">
                  behaviour
                </th>
                {pcs.map((p) => (
                  <th key={p.id} className="max-w-[120px] p-2 text-left align-bottom font-medium text-slate-400">
                    <div className="truncate" title={p.name}>{p.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ f }) => (
                <tr key={f.id} className="hover:bg-edge/20">
                  <td className="sticky left-0 z-10 max-w-[260px] truncate bg-panel/95 p-2 text-slate-300" title={f.concept}>
                    {f.concept}
                  </td>
                  {pcs.map((p) => {
                    const c = cellOf.get(`${p.id}:${f.id}`);
                    const show = c && c.sig;
                    return (
                      <td key={p.id} className="p-1">
                        <div
                          className="flex h-7 items-center justify-center rounded font-mono"
                          style={{
                            background: show ? divergeColor(c!.delta, WINRATE_REF) : "transparent",
                            color: show ? "#0b0f17" : "#475569",
                          }}
                          title={
                            c
                              ? `Δ=${c.delta.toFixed(3)}${c.n != null ? `, n=${c.n}` : ""}${
                                  c.sig ? "" : " (n.s.)"
                                }`
                              : "not tested"
                          }
                        >
                          {show ? c!.delta.toFixed(2) : c ? "·" : ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Caveat>
          {data.n_significant} of {data.n_cells} (behaviour × prompt-type) cells significant after
          Bonferroni. Blank = behaviour never tested for that prompt type (too few battles); "·" =
          tested, not significant. Colour saturation is fixed (±{WINRATE_REF} = full), so small
          effects look small.
        </Caveat>
      </Card>
    </div>
  );
}
