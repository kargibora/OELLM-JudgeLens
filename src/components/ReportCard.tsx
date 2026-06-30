import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
import type { Diagnosis, Feature, ReportBattles } from "../types";
import { Card, Explain, Metric, divergeColor, WINRATE_REF } from "./ui";
import { pct } from "../data";

// One consolidated, visual per-model report: what this model does a lot / rarely,
// the rewarded behaviours it under-expresses, the prompt types it's strong / weak
// on (click a prompt type to see its battles), and — per model — which prompt
// concepts elicit which response concepts and whether that helps it win.

const FIRE_COLOR = "rgba(96,165,250,0.85)"; // frequency is neutral → blue, not good/bad
const clip = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

type BarRow = { label: string; full: string; v: number; color: string; tip?: string };
type Bound = number | string | ((n: number) => number);

// y-axis tick that shows the (possibly truncated) label but carries the FULL text
// in an SVG <title>, so long concept names are readable on hover.
const YTick = (props: any) => {
  const { x, y, payload, fulls } = props;
  const full = fulls?.[payload?.index] ?? payload?.value;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-4} dy={4} textAnchor="end" fill="#94a3b8" fontSize={11}>
        <title>{full}</title>
        {payload?.value}
      </text>
    </g>
  );
};

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
  labels?: boolean;
  axis?: boolean;
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
          tickLine={false}
          axisLine={false}
          tick={<YTick fulls={data.map((d) => d.full)} />}
        />
        <Tooltip
          cursor={{ fill: "rgba(148,163,184,0.08)" }}
          contentStyle={{ background: "#0b0f17", border: "1px solid #1f2937", borderRadius: 8 }}
          labelFormatter={(_l: any, p: any) => p?.[0]?.payload?.full ?? ""}
          formatter={(v: any, _n: any, p: any) => [fmtVal(Number(v)), p?.payload?.tip ?? ""]}
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

type PT = { concept: string; win_rate: number; n: number };

// clickable prompt-type row: full name (wraps), inline win bar vs the model's own
// average, win%, and battle count n. Clicking opens the drill-in below.
function PromptTypeRow({
  p,
  modelWin,
  open,
  onClick,
  drillable,
}: {
  p: PT;
  modelWin: number;
  open: boolean;
  onClick: () => void;
  drillable: boolean;
}) {
  const color = divergeColor(p.win_rate - modelWin, WINRATE_REF);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <button
      onClick={onClick}
      disabled={!drillable}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition ${
        drillable ? "hover:bg-edge/40" : "cursor-default"
      } ${open ? "bg-edge/60" : ""}`}
    >
      {drillable ? (
        <Chevron size={14} className="shrink-0 text-slate-500" />
      ) : (
        <span className="w-[14px] shrink-0" />
      )}
      <span className="flex-1 text-sm text-slate-300">{p.concept}</span>
      <span className="hidden h-2 w-24 shrink-0 overflow-hidden rounded-full bg-edge/50 sm:block">
        <span className="block h-full rounded-full" style={{ width: `${Math.round(p.win_rate * 100)}%`, background: color }} />
      </span>
      <span className="w-10 shrink-0 text-right text-sm tabular-nums text-slate-200">{pct(p.win_rate, 0)}</span>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500">n={p.n.toLocaleString()}</span>
    </button>
  );
}

export default function ReportCard({
  diagnosis,
  features,
  reportBattles,
}: {
  diagnosis: Diagnosis | null;
  features: Feature[];
  reportBattles: ReportBattles | null;
}) {
  const [model, setModel] = useState(diagnosis?.models?.[0] ?? "");
  const [openPrompt, setOpenPrompt] = useState<string | null>(null);

  const featureById = useMemo(() => {
    const m: Record<number, Feature> = {};
    for (const f of features) m[f.feature_id] = f;
    return m;
  }, [features]);

  const row = diagnosis?.rows[model];

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
  // exclude anything already shown as "Strongest" so a middling concept can't appear
  // in both columns (and double-open its drill-in)
  const weakPrompts = useMemo(() => {
    const strong = new Set(strongPrompts.map((p) => p.concept));
    return [...promptTypes]
      .sort((a, b) => a.win_rate - b.win_rate)
      .filter((p) => !strong.has(p.concept))
      .slice(0, 10);
  }, [promptTypes, strongPrompts]);
  const relations = useMemo(
    () =>
      [...(row?.relations ?? [])]
        .sort((a, b) => Math.abs(b.delta_win) - Math.abs(a.delta_win))
        .slice(0, 14),
    [row]
  );

  const fireBars = (rows: typeof doesALot): BarRow[] =>
    rows.map((v) => ({ label: clip(v.concept), full: v.concept, v: v.fire ?? 0, color: FIRE_COLOR, tip: "fires in" }));
  const gapBars: BarRow[] = rewardedGaps.map((v) => ({
    label: clip(v.concept),
    full: v.concept,
    v: v.reward ?? 0,
    color: divergeColor(v.reward ?? 0, WINRATE_REF),
    tip: "Δwin (length-controlled)",
  }));
  const relationBars: BarRow[] = relations.map((r) => {
    const full = `${r.prompt_concept} ⇒ ${r.response_concept}`;
    return { label: clip(full, 56), full, v: r.delta_win, color: divergeColor(r.delta_win, WINRATE_REF), tip: `Δwin · n=${r.n}` };
  });

  const battlesFor = (concept: string) => reportBattles?.[model]?.[concept] ?? [];

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

  const togglePrompt = (c: string) => setOpenPrompt((cur) => (cur === c ? null : c));
  const promptList = (rows: PT[]) =>
    rows.map((p) => (
      <div key={p.concept}>
        <PromptTypeRow
          p={p}
          modelWin={wr}
          open={openPrompt === p.concept}
          onClick={() => togglePrompt(p.concept)}
          drillable={battlesFor(p.concept).length > 0}
        />
        {openPrompt === p.concept && <BattleDrill battles={battlesFor(p.concept)} model={model} />}
      </div>
    ));

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        A per-model <b>report card</b>: what this model <i>does a lot</i> / <i>rarely</i>, the
        rewarded behaviours it <i>under-expresses</i> (gaps worth closing), the prompt types it's
        strongest / weakest on (<i>click one to see its battles</i>), and — for this model — which
        prompt concepts elicit which response concepts and whether that <i>helps it win</i>.
      </Explain>

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-slate-400">
          model ({diagnosis.models.length})
        </span>
        <select
          value={model}
          onChange={(e) => { setModel(e.target.value); setOpenPrompt(null); }}
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
            hint="behaviours this model under-expresses that humans reward (length-controlled Δwin-rate) — i.e. doing more of them tends to win, but it currently does them less than the model pool. Gaps worth closing."
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
            hint="win rate per prompt concept, vs this model's own average. Click a row to see sample battles of this model on that prompt type."
            empty={!row.prompt_types}
          >
            {promptTypes.length === 0 ? (
              <p className="px-1 py-4 text-sm text-slate-500">
                No prompt concept cleared the support floor for this model.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-good">Strongest</h4>
                  <div className="flex flex-col">{promptList(strongPrompts)}</div>
                </div>
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-bad">Weakest</h4>
                  <div className="flex flex-col">{promptList(weakPrompts)}</div>
                </div>
              </div>
            )}
            {row.prompt_types && row.prompt_types.length > 0 && !reportBattles?.[model] && (
              <p className="mt-2 text-[11px] text-slate-500">
                Rows aren't clickable for this model — re-export with <code>--report-battles</code> to
                enable the battle drill-in.
              </p>
            )}
          </Section>

          <Section
            title="What helps this model win, by prompt type"
            hint="within a prompt type, does producing this response concept help this model win? Δwin = win rate when it fires minus when it doesn't. (Per-model; the 'Prompt → Response' tab is the global, preference-independent view.)"
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

function BattleDrill({ battles, model }: { battles: { prompt: string; self: string; other: string; outcome: string }[]; model: string }) {
  if (battles.length === 0)
    return (
      <p className="px-3 py-2 text-xs text-slate-500">
        No sample battles exported for this prompt type.
      </p>
    );
  const tone = (o: string) =>
    o === "win" ? "text-good" : o === "loss" ? "text-bad" : "text-slate-400";
  return (
    <div className="mb-2 ml-5 flex flex-col gap-3 border-l border-edge pl-3">
      {battles.map((b, i) => (
        <div key={i} className="rounded-lg border border-edge bg-ink/40 p-2 text-xs">
          <div className="mb-1 text-slate-400">
            <span className="font-semibold text-slate-300">prompt:</span> {b.prompt}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className={`mb-0.5 font-semibold ${tone(b.outcome)}`}>{model} ({b.outcome})</div>
              <div className="whitespace-pre-wrap text-slate-300">{b.self}</div>
            </div>
            <div>
              <div className="mb-0.5 font-semibold text-slate-500">opponent</div>
              <div className="whitespace-pre-wrap text-slate-400">{b.other}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
