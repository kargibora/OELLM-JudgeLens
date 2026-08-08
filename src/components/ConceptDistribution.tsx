import { useMemo, useState } from "react";
import type { ConceptDistribution as Dist, ConceptDistributionFeature } from "../types";
import { Card, ConceptLabel, Explain, Metric, Segmented, conceptLabel } from "./ui";
import { VirtualList } from "./VirtualList";

type Sort = "prevalence" | "rarity" | "strength";

const SORTS: { value: Sort; label: string }[] = [
  { value: "prevalence", label: "Most common" },
  { value: "rarity", label: "Rarest" },
  { value: "strength", label: "Strongest" },
];

const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;

/** Concepts-per-row histogram, trimmed to the populated range. */
function CountHistogram({ histogram }: { histogram: number[] }) {
  const trimmed = useMemo(() => {
    let end = histogram.length;
    while (end > 1 && histogram[end - 1] === 0) end--;
    return histogram.slice(0, end);
  }, [histogram]);
  const max = useMemo(() => trimmed.reduce((m, v) => (v > m ? v : m), 0), [trimmed]);
  if (!max) return null;
  return (
    <div className="flex items-end gap-px h-24" aria-label="concepts per response">
      {trimmed.map((count, i) => (
        <div
          key={i}
          title={`${count.toLocaleString()} responses activate ${i} concept${i === 1 ? "" : "s"}`}
          className="flex-1 min-w-[2px] bg-sky-500/70 hover:bg-sky-400 rounded-t"
          style={{ height: `${Math.max(1, (count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Per-group fire rates for one concept, as a compact bar row. */
function GroupBars({ rates, groups }: { rates?: Record<string, number>; groups: string[] }) {
  if (!rates) return null;
  const max = groups.reduce((m, g) => Math.max(m, rates[g] ?? 0), 0) || 1;
  return (
    <div className="flex gap-1 items-end h-6" aria-hidden>
      {groups.map((g) => (
        <div key={g} className="flex-1 flex flex-col justify-end" title={`${g}: ${pct(rates[g] ?? 0)}`}>
          <div
            className="bg-violet-500/70 rounded-sm"
            style={{ height: `${Math.max(2, ((rates[g] ?? 0) / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export default function ConceptDistribution({
  dist,
  onSelectConcept,
}: {
  dist: Dist;
  onSelectConcept?: (featureId: number) => void;
}) {
  const [sort, setSort] = useState<Sort>("prevalence");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? dist.features.filter(
          (f) =>
            (f.concept ?? "").toLowerCase().includes(q) || String(f.feature_id) === q,
        )
      : dist.features;
    const live = filtered.filter((f) => f.n_active > 0);
    const cmp: Record<Sort, (a: ConceptDistributionFeature, b: ConceptDistributionFeature) => number> = {
      prevalence: (a, b) => b.fire_rate - a.fire_rate,
      rarity: (a, b) => a.fire_rate - b.fire_rate,
      strength: (a, b) => b.mean_activation - a.mean_activation,
    };
    return [...live].sort(cmp[sort]);
  }, [dist.features, sort, query]);

  const maxRate = rows.length ? rows.reduce((m, f) => Math.max(m, f.fire_rate), 0) : 1;
  const q = dist.concepts_per_row.quantiles;

  return (
    <div className="space-y-4">
      <Explain>
        How concepts are spread across the dataset: how much of the corpus each concept
        covers, how many concepts a typical response activates, and which concepts never
        fire at all. Prevalence is measured on the lens's own codes, independent of any
        preference label.
      </Explain>

      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Responses" value={dist.n_rows.toLocaleString()} />
          <Metric
            label="Coverage"
            value={pct(dist.coverage)}
            sub="activate ≥1 concept"
          />
          <Metric
            label="Concepts per response"
            value={dist.concepts_per_row.mean.toFixed(1)}
            sub={q["0.5"] !== undefined ? `median ${q["0.5"]}, p99 ${q["0.99"]}` : undefined}
          />
          <Metric
            label="Never fire"
            value={`${dist.dead_features.length} / ${dist.n_features}`}
            sub="dead features"
          />
        </div>
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Concepts activated per response
          </div>
          <CountHistogram histogram={dist.concepts_per_row.histogram} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Segmented value={sort} onChange={setSort} options={SORTS} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter concepts…"
            className="flex-1 min-w-[12rem] rounded border border-slate-300 px-2 py-1 text-sm"
            aria-label="Filter concepts"
          />
          <span className="text-xs text-slate-500">{rows.length.toLocaleString()} shown</span>
        </div>

        {dist.groups.length > 1 && (
          <div className="text-xs text-slate-500 mb-2">
            Bars on the right compare fire rate across{" "}
            <span className="font-medium">{dist.group_column}</span>:{" "}
            {dist.groups.join(" · ")}
          </div>
        )}

        <VirtualList
          items={rows}
          rowHeight={44}
          height={520}
          emptyMessage="No concept matches that filter."
          renderRow={(f) => (
            <button
              type="button"
              onClick={() => onSelectConcept?.(f.feature_id)}
              className="w-full h-full flex items-center gap-3 px-2 text-left hover:bg-slate-50 rounded"
              title={conceptLabel(f.feature_id, f.concept)}
            >
              <div className="w-64 shrink-0 truncate text-sm">
                <ConceptLabel id={f.feature_id} name={f.concept} />
              </div>
              <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                <div
                  className="h-full bg-sky-500"
                  style={{ width: `${Math.max(1, (f.fire_rate / maxRate) * 100)}%` }}
                />
              </div>
              <div className="w-20 shrink-0 text-right text-sm tabular-nums">
                {pct(f.fire_rate)}
              </div>
              <div className="w-24 shrink-0 text-right text-xs text-slate-500 tabular-nums">
                {f.n_active.toLocaleString()} rows
              </div>
              {dist.groups.length > 1 && (
                <div className="w-24 shrink-0">
                  <GroupBars rates={f.group_fire_rate} groups={dist.groups} />
                </div>
              )}
            </button>
          )}
        />
      </Card>
    </div>
  );
}
