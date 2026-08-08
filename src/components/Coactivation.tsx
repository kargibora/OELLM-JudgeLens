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
  renderExamples,
}: {
  coact: ConceptCoactivation;
  /** Optional concept to centre the view on. */
  selected?: number | null;
  onSelectConcept?: (featureId: number) => void;
  /** Host-supplied evidence renderer for a pair's example rows. */
  renderExamples?: (pair: CoactivationPair) => React.ReactNode;
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
            className="flex-1 min-w-[12rem] rounded border border-slate-300 px-2 py-1 text-sm"
            aria-label="Filter co-activation pairs"
          />
          <span className="text-xs text-slate-500">{pairs.length.toLocaleString()} shown</span>
        </div>

        {scope === "selected" && selected == null && (
          <div className="text-sm text-slate-500 py-4">
            Pick a concept to see only the pairs it takes part in.
          </div>
        )}

        <VirtualList
          items={pairs}
          rowHeight={52}
          height={520}
          emptyMessage="No co-activating pair matches that filter."
          renderRow={(p) => {
            const key = `${p.a}-${p.b}`;
            const isOpen = openPair === key;
            return (
              <div className="h-full flex items-center gap-3 px-2 hover:bg-slate-50 rounded">
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
                <div className="w-28 shrink-0 h-2 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.max(2, (p.lift / maxLift) * 100)}%` }}
                  />
                </div>
                <div className="w-16 shrink-0 text-right text-sm tabular-nums" title="lift">
                  {p.lift.toFixed(1)}×
                </div>
                <div className="w-20 shrink-0 text-right text-xs text-slate-500 tabular-nums">
                  {p.count.toLocaleString()}
                </div>
                {renderExamples && p.rows.length > 0 && (
                  <button
                    type="button"
                    className="shrink-0 text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
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

        {openPair && renderExamples && (
          <div className="mt-3 border-t pt-3">
            {(() => {
              const pair = pairs.find((p) => `${p.a}-${p.b}` === openPair);
              return pair ? renderExamples(pair) : null;
            })()}
          </div>
        )}
      </Card>
    </div>
  );
}
