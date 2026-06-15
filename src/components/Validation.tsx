import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ModelValidation } from "../types";
import { Card, Explain, Metric } from "./ui";
import { fmt } from "../data";

export default function Validation({ validation }: { validation: ModelValidation[] }) {
  const { points, r2, line } = useMemo(() => {
    const pts = validation.map((m) => ({
      x: m.predicted_score_loo ?? m.predicted_score,
      y: m.actual_win_rate,
      model: m.model,
      n: m.n_battles,
    }));
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    let sxy = 0,
      sxx = 0,
      syy = 0;
    for (const p of pts) {
      sxy += (p.x - mx) * (p.y - my);
      sxx += (p.x - mx) ** 2;
      syy += (p.y - my) ** 2;
    }
    const r = sxy / Math.sqrt(sxx * syy || 1);
    const slope = sxy / (sxx || 1);
    const intercept = my - slope * mx;
    const xs = pts.map((p) => p.x);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return {
      points: pts,
      r2: r * r,
      line: [
        { x: lo, y: intercept + slope * lo },
        { x: hi, y: intercept + slope * hi },
      ],
    };
  }, [validation]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="R²" value={fmt(r2, 3)} sub="predicted vs actual" />
        <Metric label="models" value={validation.length} />
      </div>
      <Card>
        <h2 className="text-lg font-semibold">Predicted deficit vs actual win rate</h2>
        <div className="mb-3">
          <Explain>
            Each dot is a model. The <b>predicted deficit score</b> (x) sums, over every verified
            behaviour, how much more or less this model does it than the average model, weighted by
            how much humans reward that behaviour — one number for “does it do the right things?”.
            The y-axis is the model’s <b>real human win rate</b>. Dots on a rising line mean what the
            lens says a model lacks predicts how often it actually loses. <b>R²</b> = the share of
            win-rate differences this explains ({fmt(r2, 2)} ≈ {(r2 * 100).toFixed(0)}%); it’s{" "}
            <b>leave-one-model-out</b>, so each model’s score never uses its own data.
          </Explain>
        </div>
        <ResponsiveContainer width="100%" height={460}>
          <ScatterChart margin={{ left: 8, right: 24, top: 8, bottom: 16 }}>
            <CartesianGrid stroke="#1f2937" />
            <XAxis
              type="number"
              dataKey="x"
              name="predicted"
              stroke="#64748b"
              fontSize={12}
              label={{ value: "predicted deficit score", position: "bottom", fill: "#64748b" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="win rate"
              stroke="#64748b"
              fontSize={12}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <ZAxis type="number" dataKey="n" range={[20, 320]} name="battles" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ background: "#0b0f17", border: "1px solid #1f2937", borderRadius: 8 }}
              formatter={(v: number, n: string) =>
                n === "win rate" ? `${(v * 100).toFixed(1)}%` : v.toFixed(4)
              }
              labelFormatter={() => ""}
              content={({ payload }) =>
                payload && payload.length ? (
                  <div className="rounded-lg border border-edge bg-ink px-3 py-2 text-xs">
                    <div className="font-semibold text-slate-100">{payload[0].payload.model}</div>
                    <div>win rate {(payload[0].payload.y * 100).toFixed(1)}%</div>
                    <div>predicted {payload[0].payload.x.toFixed(4)}</div>
                    <div className="text-slate-500">{payload[0].payload.n} battles</div>
                  </div>
                ) : null
              }
            />
            <ReferenceLine
              segment={line}
              stroke="#6366f1"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
            <Scatter data={points} fill="#34d399" fillOpacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
