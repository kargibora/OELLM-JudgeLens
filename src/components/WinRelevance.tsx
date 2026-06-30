import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Feature } from "../types";
import { Card, Caveat, Explain } from "./ui";

type Metric = "delta" | "raw";

export default function WinRelevance({ features }: { features: Feature[] }) {
  // default to the length-controlled AME when it's available — it's the honest quantity.
  const hasDelta = useMemo(
    () => features.some((f) => f.delta_win_rate !== undefined && f.delta_win_rate !== null),
    [features]
  );
  const [metric, setMetric] = useState<Metric>(hasDelta ? "delta" : "raw");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const val = (f: Feature) => (metric === "delta" ? f.delta_win_rate : f.win_assoc);
  const sig = (f: Feature) =>
    metric === "delta" ? !!f.delta_win_significant : !!f.win_significant;

  const data = useMemo(
    () =>
      features
        .filter((f) => val(f) !== undefined && val(f) !== null)
        .filter((f) => !verifiedOnly || f.fidelity_pass)
        .map((f) => ({
          id: f.feature_id,
          label: (f.concept ?? `feature ${f.feature_id}`).slice(0, 64),
          v: val(f) as number,
          significant: sig(f),
          verified: !!f.fidelity_pass,
          n: f.n_fire,
        }))
        .sort((a, b) => a.v - b.v),
    [features, metric, verifiedOnly]
  );

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
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Which behaviours do humans reward?</h2>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-edge p-0.5">
            <Toggle active={metric === "delta"} onClick={() => setMetric("delta")}>
              length-controlled Δ
            </Toggle>
            <Toggle active={metric === "raw"} onClick={() => setMetric("raw")}>
              raw gap
            </Toggle>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="accent-accent"
            />
            verified only
          </label>
        </div>
      </div>
      <div className="my-3">
        <Explain>
          Each bar is one behaviour.{" "}
          {metric === "delta" ? (
            <>
              Length is the <b>length-controlled Δwin-rate</b> (WIMHF App. A.2): the change in
              win probability from expressing the behaviour, holding response length fixed — so
              "longer answers win" can't masquerade as a real preference.
            </>
          ) : (
            <>
              Length is the <b>raw win gap</b>: how much more often the response showing the
              behaviour wins — <i>not</i> length-controlled, so it can be inflated by verbosity.
            </>
          )}{" "}
          <span className="text-good">right/green = rewarded</span>,{" "}
          <span className="text-bad">left/red = penalised</span>. Faded = not significant; a{" "}
          <span className="underline decoration-dotted">dotted outline</span> marks a fidelity-verified axis.
        </Explain>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(360, data.length * 30)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
          <XAxis type="number" stroke="#64748b" fontSize={12} />
          <YAxis
            type="category"
            dataKey="label"
            width={320}
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: "#0b0f17", border: "1px solid #1f2937", borderRadius: 8 }}
            formatter={(v: number, _n, p) => [
              `${v.toFixed(3)}${p?.payload?.n != null ? `  (n=${p.payload.n})` : ""}`,
              metric === "delta" ? "Δwin-rate" : "win assoc",
            ]}
          />
          <ReferenceLine x={0} stroke="#475569" />
          <Bar dataKey="v" radius={[0, 4, 4, 0]}>
            {data.map((d) => {
              const base = d.v >= 0 ? "52,211,153" : "248,113,113";
              return (
                <Cell
                  key={d.id}
                  fill={`rgba(${base},${d.significant ? 0.95 : 0.3})`}
                  stroke={d.verified ? "#e2e8f0" : "none"}
                  strokeWidth={d.verified ? 1 : 0}
                  strokeDasharray={d.verified ? "2 2" : undefined}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Caveat>
        {data.length} behaviours shown{verifiedOnly ? " (verified only)" : ""}. Concepts are
        LLM-assigned labels; the bar is an association with human preference, not proof of causation.
      </Caveat>
    </Card>
  );
}
