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
import type { Diagnosis, Feature } from "../types";
import { Card, Explain, Metric, divergeColor, WINRATE_REF } from "./ui";
import { pct } from "../data";

// One consolidated, visual per-model report: what this model does a lot / rarely,
// the rewarded behaviours it under-expresses, the prompt types it's strong / weak
// on, and — per model — which prompt concepts elicit which response concepts and
// whether that helps it win. Mirrors `prefscope report`.

const FIRE_COLOR = "rgba(96,165,250,0.85)"; // frequency is neutral → blue, not good/bad
const clip = (s: string, n = 46) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

type BarRow = { label: string; v: number; color: string; tip?: string };

type Bound = number | string | ((n: number) => number);

function BarPanel({
  data,
  domain,
  fmtVal,
  zero = false,
  yWidth = 250,
  labels = true,
  axis = false,
}: {
  data: BarRow[];
  domain: [Bound, Bound];
  fmtVal: (v: number) => string;
  zero?: boolean;
  yWidth?: number;
  labels?: boolean; // inline value labels at the bar end
  axis?: boolean; // show the numeric x-axis (use for signed panels instead of labels)
}) {
  if (data.length === 0)
    return <p className="px-1 py-6 text-center text-sm text-slate-500">(nothing to show)</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 30 + (axis ? 32 : 16))}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 52, top: 4, bottom: 4 }}>
        <XAxis type="number" domain={domain} hide={!axis} stroke="#64748b" fontSize={11}
          tickFormatter={fmtVal} />
        <YAxis
          type="category"
          dataKey="label"
          width={yWidth}
          stroke="#94a3b8"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(148,163,184,0.08)" }}
          contentStyle={{ background: "#0b0f17", border: "1px solid #1f2937", borderRadius: 8 }}
          formatter={(v: number, _n, p) => [fmtVal(v), p?.payload?.tip ?? ""]}
        />
        {zero && <ReferenceLine x={0} stroke="#475569" />}
        <Bar
          dataKey="v"
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
          label={labels ? { position: "right", formatter: fmtVal, fill: "#94a3b8", fontSize: 11 } : undefined}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Section({
  title,
  hint,
  empty,
  children,
}: {
  title: string;
  hint?: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {hint && <p className="mb-1 mt-0.5 text-[11px] text-slate-500">{hint}</p>}
      {empty ? (
        <p className="px-1 py-4 text-sm text-slate-500">
          Not in this bundle — re-export with a built bank and a prompt lens.
        </p>
      ) : (
        <div className="mt-2">{children}</div>
      )}
    </Card>
  );
}

export default function ReportCard({
  diagnosis,
  features,
}: {
  diagnosis: Diagnosis | null;
  features: Feature[];
}) {
  const [model, setModel] = useState(diagnosis?.models?.[0] ?? "");

  const featureById = useMemo(() => {
    const m: Record<number, Feature> = {};
    for (const f of features) m[f.feature_id] = f;
    return m;
  }, [features]);

  const row = diagnosis?.rows[model];

  // per-feature view: concept + this model's fire rate + under-expression + reward
  const view = useMemo(() => {
    if (!row || !diagnosis) return [];
    return diagnosis.features.map((fid, i) => {
      const f = featureById[fid];
      return {
        fid,
        concept: diagnosis.concepts[i] ?? "",
        fire: row.fire_rate?.[i],
        under: row.delta_vs_pool?.[i] ?? row.net_direction?.[i],
        reward: f?.delta_win_rate ?? f?.win_assoc,
      };
    });
  }, [diagnosis, row, featureById]);

  const named = useMemo(() => view.filter((v) => v.concept && v.concept.trim() !== ""), [view]);
  const hasFire = !!row?.fire_rate;

  const fired = useMemo(() => named.filter((v) => v.fire != null), [named]);
  const doesALot = useMemo(
    () => [...fired].sort((a, b) => (b.fire ?? 0) - (a.fire ?? 0)).slice(0, 12),
    [fired]
  );
  // exclude anything already in "Does a lot" so a small feature set doesn't show
  // the same concepts mirror-imaged in both panels
  const doesRarely = useMemo(() => {
    const lot = new Set(doesALot.map((v) => v.fid));
    return [...fired]
      .sort((a, b) => (a.fire ?? 0) - (b.fire ?? 0))
      .filter((v) => !lot.has(v.fid))
      .slice(0, 12);
  }, [fired, doesALot]);
  const rewardedGaps = useMemo(
    () =>
      named
        .filter((v) => v.under != null && v.under < 0 && v.reward != null && v.reward > 0)
        .sort((a, b) => (b.reward ?? 0) - (a.reward ?? 0))
        .slice(0, 12),
    [named]
  );

  const wr = row?.win_rate ?? 0.5;
  const promptTypes = row?.prompt_types ?? [];
  const strongPrompts = useMemo(
    () => [...promptTypes].sort((a, b) => b.win_rate - a.win_rate).slice(0, 10),
    [promptTypes]
  );
  const weakPrompts = useMemo(
    () => [...promptTypes].sort((a, b) => a.win_rate - b.win_rate).slice(0, 10),
    [promptTypes]
  );
  const relations = useMemo(
    () =>
      [...(row?.relations ?? [])]
        .sort((a, b) => Math.abs(b.delta_win) - Math.abs(a.delta_win))
        .slice(0, 14),
    [row]
  );

  // --- bar rows ---
  const fireBars = (rows: typeof doesALot): BarRow[] =>
    rows.map((v) => ({
      label: clip(v.concept),
      v: v.fire ?? 0,
      color: FIRE_COLOR,
      tip: "fires in",
    }));
  const gapBars: BarRow[] = rewardedGaps.map((v) => ({
    label: clip(v.concept),
    v: v.reward ?? 0,
    color: divergeColor(v.reward ?? 0, WINRATE_REF),
    tip: "Δwin (length-controlled)",
  }));
  const promptBars = (rows: typeof strongPrompts): BarRow[] =>
    rows.map((p) => ({
      label: clip(p.concept),
      v: p.win_rate,
      // colour relative to the model's OWN average win rate: above = green, below = red
      color: divergeColor(p.win_rate - wr, WINRATE_REF),
      tip: `win rate · n=${p.n}`,
    }));
  const relationBars: BarRow[] = relations.map((r) => ({
    label: clip(`${r.prompt_concept} ⇒ ${r.response_concept}`, 60),
    v: r.delta_win,
    color: divergeColor(r.delta_win, WINRATE_REF),
    tip: `Δwin · n=${r.n}`,
  }));

  if (!diagnosis)
    return <Card>No diagnosis exported. Build a bank and re-run export_viewer_data.py.</Card>;

  if (diagnosis.error === "no_bank")
    return (
      <Card>
        <h2 className="text-lg font-semibold text-amber-400">No model report yet</h2>
        <p className="mt-1 text-sm text-slate-300">
          This bundle has no oriented bank, so per-model diagnoses couldn't be built. Build one
          and re-export:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-edge bg-ink p-3 text-xs text-slate-300">
          {diagnosis.message ??
            "prefscope build-bank --lens-dir <lens> --from-embeddings <dump> --label human --corpus <corpus> --out <lens>/bank\nthen re-run export_viewer_data.py"}
        </pre>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        A per-model <b>report card</b>: what this model <i>does a lot</i> / <i>rarely</i>, the
        rewarded behaviours it <i>under-expresses</i> (gaps worth closing), the prompt types it's
        strongest / weakest on, and — for this model — which prompt concepts elicit which response
        concepts and whether that <i>helps it win</i>. Mirrors <code>prefscope report</code>.
      </Explain>

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-slate-400">
          model ({diagnosis.models.length})
        </span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-96 max-w-full rounded-lg border border-edge bg-ink px-3 py-2 text-sm"
        >
          {diagnosis.models.map((m) => (
            <option key={m} value={m}>
              {m} · {pct(diagnosis.rows[m]?.win_rate, 0)}
            </option>
          ))}
        </select>
      </div>

      {!row ? (
        <Card>No diagnosis row for this model.</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Metric label="model" value={<span className="text-base">{model}</span>} />
            <Metric label="win rate" value={pct(row.win_rate, 0)} />
            <Metric label="battles" value={row.n_battles.toLocaleString()} />
          </div>

          {!hasFire && (
            <Card>
              <p className="text-sm text-amber-400">
                This bundle predates the visual report card — re-run export_viewer_data.py (with a
                built bank and a prompt lens) to populate the behavioural fingerprint, prompt types,
                and prompt→response sections. Showing rewarded gaps only.
              </p>
            </Card>
          )}

          {hasFire && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Does a lot" hint="highest activation rate across this model's battles">
                <BarPanel data={fireBars(doesALot)} domain={[0, 1]} fmtVal={(v) => pct(v, 0)} />
              </Section>
              <Section title="Does rarely" hint="lowest activation rate — behaviours it seldom shows">
                <BarPanel data={fireBars(doesRarely)} domain={[0, 1]} fmtVal={(v) => pct(v, 0)} />
              </Section>
            </div>
          )}

          <Section
            title="Rewarded gaps"
            hint="behaviours it under-expresses that humans reward (length-controlled Δwin) — gaps worth closing"
          >
            {gapBars.length === 0 ? (
              <p className="px-1 py-4 text-sm text-slate-500">
                No rewarded behaviour is under-expressed.
              </p>
            ) : (
              <BarPanel data={gapBars} domain={[0, "dataMax"]} fmtVal={(v) => `+${v.toFixed(2)}`} />
            )}
          </Section>

          <Section
            title="Strong / weak prompt types"
            hint="win rate per prompt concept, coloured vs this model's own average"
            empty={!row.prompt_types}
          >
            {promptTypes.length === 0 ? (
              <p className="px-1 py-4 text-sm text-slate-500">
                No prompt concept cleared the support floor for this model.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-good">
                    Strongest
                  </h4>
                  <BarPanel data={promptBars(strongPrompts)} domain={[0, 1]} fmtVal={(v) => pct(v, 0)} />
                </div>
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-bad">
                    Weakest
                  </h4>
                  <BarPanel data={promptBars(weakPrompts)} domain={[0, 1]} fmtVal={(v) => pct(v, 0)} />
                </div>
              </div>
            )}
          </Section>

          <Section
            title="Prompt → Response (this model)"
            hint="within a prompt type, does producing this response concept help this model win? (Δwin = win rate when it fires minus when it doesn't)"
            empty={!row.relations}
          >
            {relationBars.length === 0 ? (
              <p className="px-1 py-4 text-sm text-slate-500">
                No prompt→response edge clears the support floor for this model.
              </p>
            ) : (
              <BarPanel
                data={relationBars}
                domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
                fmtVal={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`}
                zero
                axis
                labels={false}
                yWidth={300}
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
