import { useMemo } from "react";
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
import { Card } from "./ui";

export default function WinRelevance({ features }: { features: Feature[] }) {
  const data = useMemo(
    () =>
      features
        .filter((f) => f.win_assoc !== undefined && f.win_assoc !== null)
        .map((f) => ({
          id: f.feature_id,
          label: (f.concept ?? `feature ${f.feature_id}`).slice(0, 64),
          win_assoc: f.win_assoc as number,
          significant: !!f.win_significant,
        }))
        .sort((a, b) => a.win_assoc - b.win_assoc),
    [features]
  );

  return (
    <Card>
      <h2 className="text-lg font-semibold">Which behaviours do humans reward?</h2>
      <p className="mb-3 text-sm text-slate-400">
        Per-feature win association: how much "A expresses this concept more" coincides with humans
        preferring A. Faded bars are not statistically significant.
      </p>
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
            formatter={(v: number) => [v.toFixed(3), "win assoc"]}
          />
          <ReferenceLine x={0} stroke="#475569" />
          <Bar dataKey="win_assoc" radius={[0, 4, 4, 0]}>
            {data.map((d) => {
              const pos = d.win_assoc >= 0;
              const base = pos ? "52,211,153" : "248,113,113";
              return <Cell key={d.id} fill={`rgba(${base},${d.significant ? 0.95 : 0.35})`} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
