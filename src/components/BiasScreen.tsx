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

  return (
    <Card>
      <h2 className="text-lg font-semibold">Confound screen — rewarded vs length-entangled</h2>
      <div className="my-3">
        <Explain>
          Each point is a response feature. <b>x</b> = how much humans reward it; <b>y</b> = how
          much its direction <i>co-varies with length</i> (
          <span className="text-slate-300">length(A) − length(B)</span>). The{" "}
          <span style={{ color: CONFOUND }}>amber</span> points are{" "}
          <b>candidates for inspection</b>: rewarded <i>and</i> their reward largely collapses once
          length is partialled out (top-right). This is a <b>screening tool, not a bias verdict</b>{" "}
          — high covariance means you can&apos;t separate quality from length, not that the feature
          is fake. {nFlag} of {data.length} features flagged. (Hover for the length-controlled
          reward.)
        </Explain>
      </div>
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
