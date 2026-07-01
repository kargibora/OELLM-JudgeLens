import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { BiasRow } from "../types";
import { Card, Explain } from "./ui";

const CONFOUND = "#f59e0b";
const ACCENT = "#6366f1";

function PointTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as BiasRow;
  return (
    <div className="rounded-lg border border-edge bg-ink/95 p-2 text-xs text-slate-200">
      <div className="mb-1 font-medium">{d.concept ?? `feature ${d.feature_id}`}</div>
      <div>win assoc: {d.win_assoc?.toFixed(3) ?? "—"}</div>
      <div>length covariance: {d.corr_confound_len?.toFixed(3) ?? "—"}</div>
      <div>reward after controlling length: {d.correlation_resid_len?.toFixed(3) ?? "—"}</div>
      <div className="mt-1 text-slate-400">
        {d.confound_entangled ? "length/style-entangled candidate" : "reward survives length control"}
        {d.fidelity_pass ? " · verified" : " · unverified"}
      </div>
    </div>
  );
}

export default function BiasScreen({ bias }: { bias: BiasRow[] | null }) {
  const data = useMemo(
    () =>
      (bias ?? []).filter(
        (b) => b.win_assoc != null && b.corr_confound_len != null
      ),
    [bias]
  );

  if (!bias)
    return (
      <Card>
        <h2 className="text-lg font-semibold">Bias screen</h2>
        <p className="mt-2 text-sm text-slate-400">The length-confound screen isn't available for this dataset.</p>
      </Card>
    );

  const nFlag = data.filter((d) => d.confound_entangled).length;
  // per-feature verdict: for the rewarded features, does the reward survive length control?
  const rewarded = useMemo(
    () => data.filter((d) => (d.win_assoc ?? 0) > 0).sort((a, b) => (b.win_assoc ?? 0) - (a.win_assoc ?? 0)).slice(0, 12),
    [data]
  );

  return (
    <Card>
      <h2 className="text-lg font-semibold">Bias screen — is the reward real, or just length?</h2>
      <div className="my-3">
        <Explain>
          For each rewarded behaviour, does its reward <b>survive</b> once we control for
          answer length, or is it <b>length-driven</b>? A behaviour whose reward largely
          collapses when length is partialled out is a candidate for skepticism — you can’t
          separate quality from verbosity. {nFlag} of {data.length} screened features look
          length-entangled. (This is a screening flag, not proof the feature is fake.)
        </Explain>
      </div>

      {rewarded.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">Does the reward survive length control?</h3>
          <div className="flex flex-col">
            {rewarded.map((d) => (
              <div key={d.feature_id} className="flex items-center gap-3 rounded px-2 py-1 text-xs hover:bg-edge/20">
                <span className="min-w-0 flex-1 truncate text-slate-300" title={d.concept ?? `feature ${d.feature_id}`}>
                  {d.concept ?? `feature ${d.feature_id}`}
                </span>
                <span className="w-40 shrink-0 text-right tabular-nums text-slate-500">
                  reward {d.win_assoc?.toFixed(2) ?? "—"} → after length {d.correlation_resid_len?.toFixed(2) ?? "—"}
                </span>
                <span className={`w-24 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-medium ${
                  d.confound_entangled ? "bg-amber-500/15 text-amber-400" : "bg-good/15 text-good"}`}>
                  {d.confound_entangled ? "length-driven" : "survives"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height={460}>
        <ScatterChart margin={{ left: 8, right: 24, top: 8, bottom: 24 }}>
          <CartesianGrid stroke="#1f2937" />
          <XAxis
            type="number"
            dataKey="win_assoc"
            name="win assoc"
            stroke="#64748b"
            fontSize={12}
            label={{ value: "win association →", position: "bottom", fill: "#64748b", fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="corr_confound_len"
            name="length covariance"
            stroke="#64748b"
            fontSize={12}
            label={{
              value: "length covariance →",
              angle: -90,
              position: "insideLeft",
              fill: "#64748b",
              fontSize: 12,
            }}
          />
          <ZAxis range={[40, 40]} />
          <ReferenceLine x={0} stroke="#475569" />
          <ReferenceLine y={0.3} stroke="#f59e0b" strokeDasharray="4 4" />
          <ReferenceLine y={-0.3} stroke="#f59e0b" strokeDasharray="4 4" />
          <Tooltip content={<PointTip />} />
          <Scatter data={data}>
            {data.map((d) => (
              <Cell
                key={d.feature_id}
                fill={d.confound_entangled ? CONFOUND : ACCENT}
                fillOpacity={d.fidelity_pass ? 0.95 : 0.4}
                stroke={d.confound_entangled ? CONFOUND : ACCENT}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  );
}
