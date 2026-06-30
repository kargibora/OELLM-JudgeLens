import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Diagnosis, Feature } from "../types";
import { Card, Explain, Metric } from "./ui";
import { fmt } from "../data";

export default function ModelDiagnosis({
  diagnosis,
  features,
}: {
  diagnosis: Diagnosis | null;
  features: Feature[];
}) {
  if (!diagnosis || diagnosis.error || diagnosis.models.length === 0)
    return <Card>No bank diagnosis exported — build a bank and re-run export_viewer_data.py.</Card>;

  const winAssoc = useMemo(() => {
    const m: Record<number, number> = {};
    for (const f of features) m[f.feature_id] = f.win_assoc ?? 0;
    return m;
  }, [features]);

  // default to a clearly weak model if present, else the first
  const [model, setModel] = useState(
    diagnosis.models.find((m) => /olmo|phi|qwen2-7b/i.test(m)) ?? diagnosis.models[0]
  );
  const [query, setQuery] = useState("");

  const row = diagnosis.rows[model];
  const behaviorOf = (i: number): string =>
    diagnosis.clusters && diagnosis.behaviors
      ? diagnosis.behaviors[String(diagnosis.clusters[i])] ?? ""
      : "";
  const points = useMemo(() => {
    if (!row) return [];
    return diagnosis.features.map((fid, i) => ({
      fid,
      concept: diagnosis.concepts[i] ?? `feature ${fid}`,
      behavior: behaviorOf(i),
      delta: row.delta_vs_pool[i],
      win: winAssoc[fid] ?? 0,
      gap: row.delta_vs_pool[i] < 0 && (winAssoc[fid] ?? 0) > 0,
    }));
  }, [diagnosis, row, winAssoc]);

  const gaps = useMemo(
    () =>
      [...points]
        .map((p) => ({ ...p, score: -p.delta * p.win }))
        .filter((p) => p.gap)
        .sort((a, b) => b.score - a.score),
    [points]
  );

  // weakest models first, optionally narrowed by the search box
  const filtered = useMemo(
    () =>
      diagnosis.models
        .filter((m) => m.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => (diagnosis.rows[a]?.win_rate ?? 0) - (diagnosis.rows[b]?.win_rate ?? 0)),
    [diagnosis, query]
  );

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        Pick a model. Each dot is a verified behaviour. <b>Left/right</b> = the model does it{" "}
        <i>less / more</i> than the average model in the pool (delta vs pool). <b>Down/up</b> = humans{" "}
        <i>penalise / reward</i> it. So the <span className="text-bad">top-left</span> corner is the
        danger zone — behaviours the model under-does that humans reward (its <b>gaps</b>); the ranked
        list below is exactly those.
      </Explain>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-400">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter models…"
            className="w-64 rounded-lg border border-edge bg-ink px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-400">
            model ({filtered.length})
          </span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-80 rounded-lg border border-edge bg-ink px-3 py-2 text-sm"
          >
            {filtered.map((m) => (
              <option key={m} value={m}>
                {m} · {((diagnosis.rows[m]?.win_rate ?? 0) * 100).toFixed(0)}%
              </option>
            ))}
          </select>
        </div>
        {row && <Metric label={`${model} — win rate`} value={fmt(row.win_rate, 3)} sub={`${row.n_battles} battles`} />}
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Gap quadrant</h2>
        <p className="mb-3 text-sm text-slate-400">
          Each point is a verified feature. <span className="text-bad">Top-left</span> = the model
          does this <b>less</b> than the pool, yet humans <b>reward</b> it — a gap worth closing.
        </p>
        <ResponsiveContainer width="100%" height={440}>
          <ScatterChart margin={{ left: 8, right: 24, top: 8, bottom: 16 }}>
            <CartesianGrid stroke="#1f2937" />
            <XAxis
              type="number"
              dataKey="delta"
              name="delta_vs_pool"
              stroke="#64748b"
              fontSize={12}
              label={{ value: "← does LESS than pool   ·   does MORE →", position: "bottom", fill: "#64748b" }}
            />
            <YAxis
              type="number"
              dataKey="win"
              name="win_assoc"
              stroke="#64748b"
              fontSize={12}
              label={{ value: "← penalised · rewarded →", angle: -90, position: "left", fill: "#64748b" }}
            />
            <ReferenceLine x={0} stroke="#475569" />
            <ReferenceLine y={0} stroke="#475569" />
            <Tooltip
              content={({ payload }) =>
                payload && payload.length ? (
                  <div className="max-w-xs rounded-lg border border-edge bg-ink px-3 py-2 text-xs">
                    {payload[0].payload.behavior && (
                      <div className="mb-0.5 text-accent">{payload[0].payload.behavior}</div>
                    )}
                    <div className="font-semibold text-slate-100">{payload[0].payload.concept}</div>
                    <div>delta vs pool {payload[0].payload.delta.toFixed(3)}</div>
                    <div>win assoc {payload[0].payload.win.toFixed(3)}</div>
                  </div>
                ) : null
              }
            />
            <Scatter
              data={points}
              shape={(props: any) => (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={6}
                  fill={props.payload.gap ? "#f87171" : "#6366f1"}
                  fillOpacity={0.75}
                />
              )}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-bad">
          Top gaps for {model} (under-does a rewarded behaviour)
        </h3>
        {gaps.length === 0 ? (
          <p className="text-sm text-slate-400">No clear gaps — this model isn't under-doing rewarded behaviours.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {gaps.map((g) => (
              <li key={g.fid} className="flex gap-3">
                <span className="font-mono text-bad">{g.delta.toFixed(2)}</span>
                <span className="text-slate-300">{g.concept}</span>
                <span className="ml-auto font-mono text-slate-500">reward {g.win.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
