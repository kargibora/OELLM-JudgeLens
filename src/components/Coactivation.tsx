import { useEffect, useMemo, useState } from "react";
import type { CoactivationPair, ConceptCoactivation } from "../types";
import { Card, ConceptLabel, Explain, Metric, Segmented, conceptLabel } from "./ui";
import { VirtualList } from "./VirtualList";

type Scope = "all" | "selected";

const nameOf = (p: CoactivationPair, side: "a" | "b") =>
  conceptLabel(side === "a" ? p.a : p.b, side === "a" ? p.a_concept : p.b_concept);

export default function Coactivation({
  coact,
  selected,
  onSelectConcept,
}: {
  coact: ConceptCoactivation;
  /** Optional concept to centre the view on. */
  selected?: number | null;
  onSelectConcept?: (featureId: number) => void;
}) {
  const [scope, setScope] = useState<Scope>(selected == null ? "all" : "selected");
  const [query, setQuery] = useState("");
  const [openPair, setOpenPair] = useState<string | null>(null);

  useEffect(() => {
    if (selected != null) setScope("selected");
  }, [selected]);

  const pairs = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = coact.pairs;
    if (scope === "selected" && selected != null) {
      rows = rows.filter((p) => p.a === selected || p.b === selected);
    }
    if (q) {
      rows = rows.filter(
        (p) =>
          nameOf(p, "a").toLowerCase().includes(q) || nameOf(p, "b").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [coact.pairs, scope, selected, query]);

  const maxLift = useMemo(
    () => pairs.reduce((m, p) => (p.lift > m ? p.lift : m), 0) || 1,
    [pairs],
  );

  return (
    <div className="space-y-4">
      <Explain>
        Concepts that fire together on the same response more often than independence
        predicts. Lift is P(both) ÷ P(a)·P(b) — above 1 means they co-occur, and a pair
        near 1 is just two common concepts meeting by chance. Ranked per concept, so a
        few dense concepts cannot crowd out the rest.
      </Explain>

      <Card>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Metric label="Pairs" value={coact.pairs.length.toLocaleString()} />
          <Metric label="Responses" value={coact.n_rows.toLocaleString()} />
          <Metric
            label="Minimum co-occurrence"
            value={coact.min_pair_count}
            sub={coact.truncated ? "list truncated at the export cap" : undefined}
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "all" as Scope, label: "All pairs" },
              { value: "selected" as Scope, label: "Selected concept" },
            ]}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by concept name…"
            className="flex-1 min-w-[12rem] rounded-lg border border-edge/70 bg-ink/60 px-2.5 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent/50 focus:outline-none"
            aria-label="Filter co-activation pairs"
          />
          <span className="text-xs text-slate-500">{pairs.length.toLocaleString()} shown</span>
        </div>

        {scope === "selected" && selected == null && (
          <div className="text-sm text-slate-500 py-4">
            Pick a concept to see only the pairs it takes part in.
          </div>
        )}

        {openPair && coact.examples && (() => {
          const pair = pairs.find((p) => `${p.a}-${p.b}` === openPair);
          if (!pair) return null;
          const rows = pair.rows
            .map((r) => coact.examples?.[String(r)])
            .filter((x): x is NonNullable<typeof x> => Boolean(x));
          return (
            <div className="mb-4 rounded-xl border border-accent/25 bg-accent/5 p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Responses where both fire
                  </div>
                  <div className="mt-1 text-sm text-slate-200">
                    <span className="line-clamp-2">
                      {pair.a_concept || `feature ${pair.a}`} <span className="text-slate-500">+</span>{" "}
                      {pair.b_concept || `feature ${pair.b}`}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {pair.lift.toFixed(1)}x lift · {pair.count.toLocaleString()} responses ·{" "}
                      {rows.length} shown
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => setOpenPair(null)}
                  className="shrink-0 rounded border border-edge/70 px-2 py-1 text-xs text-slate-400 hover:bg-edge/40">
                  Close
                </button>
              </div>
              {rows.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Example text is unavailable; re-export with <code>--corpus</code>.
                </p>
              ) : (
                <div className="space-y-3">
                  {rows.map((ex, i) => (
                    <div key={i} className="rounded-lg border border-edge/60 bg-ink/40 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Prompt</p>
                      <p className="mb-2 text-sm text-slate-300">{ex.prompt}</p>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Response</p>
                      <p className="text-sm text-slate-300">{ex.response}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <VirtualList
          items={pairs}
          rowHeight={52}
          height={520}
          emptyMessage="No co-activating pair matches that filter."
          renderRow={(p) => {
            const key = `${p.a}-${p.b}`;
            const isOpen = openPair === key;
            return (
              <div className="h-full flex items-center gap-3 px-2 hover:bg-edge/40 rounded">
                <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    className="truncate max-w-[40%] text-left hover:underline"
                    onClick={() => onSelectConcept?.(p.a)}
                  >
                    <ConceptLabel id={p.a} name={p.a_concept ?? null} />
                  </button>
                  <span className="text-slate-400 shrink-0">+</span>
                  <button
                    type="button"
                    className="truncate max-w-[40%] text-left hover:underline"
                    onClick={() => onSelectConcept?.(p.b)}
                  >
                    <ConceptLabel id={p.b} name={p.b_concept ?? null} />
                  </button>
                </div>
                <div className="w-28 shrink-0 h-2 bg-edge/40 rounded overflow-hidden">
                  <div
                    className="h-full bg-good/80"
                    style={{ width: `${Math.max(2, (p.lift / maxLift) * 100)}%` }}
                  />
                </div>
                <div className="w-16 shrink-0 text-right text-sm tabular-nums" title="lift">
                  {p.lift.toFixed(1)}×
                </div>
                <div className="w-20 shrink-0 text-right text-xs text-slate-500 tabular-nums">
                  {p.count.toLocaleString()}
                </div>
                {p.rows.length > 0 && coact.examples && (
                  <button
                    type="button"
                    className="shrink-0 text-xs px-2 py-1 rounded border border-edge/70 hover:bg-edge/40 text-slate-300"
                    onClick={() => setOpenPair(isOpen ? null : key)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? "Hide" : `${p.rows.length} examples`}
                  </button>
                )}
              </div>
            );
          }}
        />


      </Card>
    </div>
  );
}
