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

// One verified behaviour per dot. x = delta_vs_pool (does less ← → more than the pool),
// y = reward (penalised ← → rewarded). Top-left (red) = under-expressed yet rewarded — a gap.
export type QuadrantPoint = {
  fid: number;
  concept: string;
  behavior?: string;
  delta: number;
  win: number;
  gap: boolean;
};

export default function GapQuadrant({ points }: { points: QuadrantPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={420}>
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
          name="reward"
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
                <div>reward {payload[0].payload.win.toFixed(3)}</div>
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
  );
}
