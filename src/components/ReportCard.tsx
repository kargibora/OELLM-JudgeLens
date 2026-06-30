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
import { Card, Explain, Metric, conceptLabel, divergeColor, fireDivergeColor, WINRATE_REF } from "./ui";
import { pct } from "../data";
import GapQuadrant, { type QuadrantPoint } from "./GapQuadrant";

type FireMode = "freq" | "paired" | "model";

// One consolidated, visual per-model report: what this model does a lot / rarely,
// the rewarded behaviours it under-expresses, the prompt types it's strong / weak
// on (click a prompt type to see its battles), and — per model — which prompt
// concepts elicit which response concepts and whether that helps it win.

const FIRE_COLOR = "rgba(96,165,250,0.85)"; // frequency is neutral → blue, not good/bad
const clip = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

type BarRow = { label: string; full: string; v: number; color: string; tip?: string };
type Bound = number | string | ((n: number) => number);

// greedy word-wrap into up to `maxLines` lines that fit `maxChars`; the last line is
// ellipsized only if the text genuinely overflows. So most concept names render fully
// on two lines with NO hover needed (recharts axis labels can't reflow HTML).
function wrapLabel(text: string, maxChars: number, maxLines = 2): string[] {
  const norm = (text || "").trim().replace(/\s+/g, " "); // collapse so spacing can't fake overflow
  const words = norm.split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length) {
    const overflow = lines.join(" ").length < norm.length; // unshown words remain
    const last = lines[lines.length - 1];
    if (overflow || last.length > maxChars) {
      lines[lines.length - 1] =
        (last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last).replace(/\s+$/, "") + "…";
    }
  }
  return lines.slice(0, maxLines);
}

// y-axis tick: render the FULL label word-wrapped to two lines (most names fit), with
// the complete text in an SVG <title> as a fallback for the rare 3-line name.
const YTick = (props: any) => {
  const { x, y, payload, fulls, width = 250 } = props;
  const full = String(fulls?.[payload?.index] ?? payload?.value ?? "");
  const maxChars = Math.max(8, Math.floor((width - 10) / 6));
  const lines = wrapLabel(full, maxChars, 2);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-4} y={0} textAnchor="end" fill="#94a3b8" fontSize={11}>
        <title>{full}</title>
        {lines.map((ln, i) => (
          <tspan key={i} x={-4} dy={i === 0 ? (lines.length === 2 ? -1 : 4) : 12}>
            {ln}
          </tspan>
        ))}
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
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 40 + (axis ? 32 : 16))}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 52, top: 4, bottom: 4 }}>
        <XAxis type="number" domain={domain} hide={!axis} stroke="#64748b" fontSize={11}
          tickFormatter={fmtVal} />
        <YAxis
          type="category"
          dataKey="label"
          width={yWidth}
          tickLine={false}
          axisLine={false}
          tick={<YTick fulls={data.map((d) => d.full)} width={yWidth} />}
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
  const [fireMode, setFireMode] = useState<FireMode>("freq");
  const [compareModel, setCompareModel] = useState<string>("");
  const [query, setQuery] = useState("");
  const [showQuadrant, setShowQuadrant] = useState(false);

  // model picker options: search filter + weakest-first (gaps are the point), folded in
  // from the old Model-diagnosis tab
  const filteredModels = useMemo(
    () =>
      (diagnosis?.models ?? [])
        .filter((m) => m.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => (diagnosis?.rows[a]?.win_rate ?? 0) - (diagnosis?.rows[b]?.win_rate ?? 0)),
    [diagnosis, query]
  );

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
        idx: i, // position in diagnosis.features (for pool/compare lookups)
        concept: diagnosis.concepts[i] ?? "",
        fire: row.fire_rate?.[i],
        under: row.delta_vs_pool?.[i] ?? row.net_direction?.[i],
        reward: f?.delta_win_rate ?? f?.win_assoc,
      };
    });
  }, [diagnosis, row, featureById]);

  // resolve the 2nd model synchronously (never self-vs-self): the user's pick if valid,
  // else the first other model — so there's no one-frame "More than —" flash.
  const cmpModel =
    fireMode === "model"
      ? compareModel && compareModel !== model
        ? compareModel
        : diagnosis?.models.find((m) => m !== model) ?? null
      : null;
  const compareFire = cmpModel ? diagnosis?.rows[cmpModel]?.fire_rate : undefined;

  const named = useMemo(() => view.filter((v) => v.concept && v.concept.trim() !== ""), [view]);
  const hasFire = !!row?.fire_rate;

  // points for the folded-in Gap quadrant scatter (delta_vs_pool × reward); all features
  const quadrantPoints: QuadrantPoint[] = useMemo(() => {
    const behaviorOf = (i: number) =>
      diagnosis?.clusters && diagnosis?.behaviors
        ? diagnosis.behaviors[String(diagnosis.clusters[i])] ?? ""
        : "";
    return view.map((v) => ({
      fid: v.fid,
      concept: conceptLabel(v.fid, v.concept),
      behavior: behaviorOf(v.idx),
      delta: v.under ?? 0,
      win: v.reward ?? 0,
      gap: (v.under ?? 0) < 0 && (v.reward ?? 0) > 0,
    }));
  }, [view, diagnosis]);

  const fired = useMemo(() => named.filter((v) => v.fire != null), [named]);
  // per-feature display value for the current fire mode:
  //  freq   = absolute fire rate (frequency; NOT prompt-controlled)
  //  paired = delta_vs_pool — expresses more/less than other models comparing answers
  //           to the SAME prompt (prompt-controlled; shared behaviours cancel to ~0)
  //  model  = fire-rate difference vs a chosen model (frequency; not prompt-controlled)
  const fireRows = useMemo(
    () =>
      fired.map((v) => {
        const base = fireMode === "model" ? compareFire?.[v.idx] ?? 0 : 0;
        const val =
          fireMode === "freq" ? v.fire ?? 0
          : fireMode === "paired" ? v.under ?? 0
          : (v.fire ?? 0) - base;
        return { ...v, base, val };
      }),
    [fired, fireMode, compareFire]
  );
  // intensity reference for the paired (delta_vs_pool) palette — scaled to the data,
  // since delta_vs_pool is in oriented-code units, not percentage points
  const pairedRef = useMemo(
    () => Math.max(0.01, ...fireRows.map((v) => Math.abs(v.under ?? 0))),
    [fireRows]
  );
  const moreFire = useMemo(
    () => [...fireRows].sort((a, b) => b.val - a.val).slice(0, 12),
    [fireRows]
  );
  const lessFire = useMemo(() => {
    const more = new Set(moreFire.map((v) => v.fid));
    return [...fireRows].sort((a, b) => a.val - b.val).filter((v) => !more.has(v.fid)).slice(0, 12);
  }, [fireRows, moreFire]);
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

  const relMode = fireMode !== "freq";
  const fireBars = (rows: typeof fireRows): BarRow[] =>
    rows.map((v) => {
      if (fireMode === "freq")
        return { label: clip(v.concept), full: v.concept, v: v.fire ?? 0, color: FIRE_COLOR, tip: "fires in" };
      if (fireMode === "paired")
        return {
          label: clip(v.concept),
          full: v.concept,
          v: v.val,
          color: fireDivergeColor(v.val, pairedRef),
          tip: `Δ vs other models, same prompt · fires ${pct(v.fire, 0)}`,
        };
      return {
        label: clip(v.concept),
        full: v.concept,
        v: v.val,
        color: fireDivergeColor(v.val),
        tip: `fires ${pct(v.fire, 0)} · ${cmpModel} ${pct(v.base, 0)}`,
      };
    });
  const ppFmt = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}pp`;
  const fireFmt =
    fireMode === "freq" ? (v: number) => pct(v, 0)
    : fireMode === "model" ? ppFmt
    : (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`; // paired: delta_vs_pool units
  const fireDomain: [number | string | ((n: number) => number), number | string | ((n: number) => number)] =
    relMode ? [(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)] : [0, 1];
  const moreTitle =
    fireMode === "freq" ? "Does a lot"
    : fireMode === "paired" ? "Expresses more (vs other models)"
    : `More than ${cmpModel ?? "—"}`;
  const lessTitle =
    fireMode === "freq" ? "Does rarely"
    : fireMode === "paired" ? "Expresses less (vs other models)"
    : `Less than ${cmpModel ?? "—"}`;
  const moreHint =
    fireMode === "freq" ? "highest activation rate across this model's battles"
    : fireMode === "paired" ? "expresses more than other models do, comparing answers to the same prompt"
    : "fires more often (frequency — not prompt-controlled)";
  const lessHint =
    fireMode === "freq" ? "lowest activation rate — behaviours it seldom shows"
    : fireMode === "paired" ? "expresses less than other models do, on the same prompt"
    : "fires less often (frequency — not prompt-controlled)";
  const gapBars: BarRow[] = rewardedGaps.map((v) => ({
    label: clip(v.concept),
    full: v.concept,
    v: v.reward ?? 0,
    color: divergeColor(v.reward ?? 0, WINRATE_REF),
    tip: `Δwin (length-controlled) · ${(v.under ?? 0).toFixed(2)} vs pool`,
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

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-400">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter models…"
            className="w-56 rounded-lg border border-edge bg-ink px-3 py-2 text-sm placeholder:text-slate-600"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-400">
            model ({filteredModels.length}, weakest first)
          </span>
          <select
            value={model}
            onChange={(e) => { setModel(e.target.value); setOpenPrompt(null); }}
            className="w-96 max-w-full rounded-lg border border-edge bg-ink px-3 py-2 text-sm"
          >
            {filteredModels.map((m) => (
              <option key={m} value={m}>
                {m} · {pct(diagnosis.rows[m]?.win_rate, 0)}
              </option>
            ))}
          </select>
        </div>
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
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg border border-edge p-0.5">
                  {(["freq", "paired", "model"] as FireMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setFireMode(m)}
                      title={
                        m === "freq" ? "how often each behaviour appears in this model's answers"
                        : m === "paired" ? "expresses more/less than other models, comparing answers to the SAME prompt (prompt-controlled)"
                        : "fire-rate difference vs a chosen model (frequency — affected by which prompts each model saw)"
                      }
                      className={`rounded-md px-2.5 py-1 text-xs transition ${
                        fireMode === m ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {m === "freq" ? "Frequency" : m === "paired" ? "Distinctive (same prompt)" : "vs model"}
                    </button>
                  ))}
                </div>
                {fireMode === "model" && (
                  <select
                    value={cmpModel ?? ""}
                    onChange={(e) => setCompareModel(e.target.value)}
                    className="rounded-lg border border-edge bg-ink px-2 py-1 text-xs"
                  >
                    {diagnosis.models
                      .filter((m) => m !== model)
                      .map((m) => (
                        <option key={m} value={m}>
                          {m} · {pct(diagnosis.rows[m]?.win_rate, 0)}
                        </option>
                      ))}
                  </select>
                )}
                {relMode && (
                  <span className="text-[11px] text-slate-500">
                    <span style={{ color: "rgb(96,165,250)" }}>blue</span> = more ·{" "}
                    <span style={{ color: "rgb(251,191,36)" }}>amber</span> = less
                    {fireMode === "paired"
                      ? " · prompt-controlled (same-prompt contrast)"
                      : " · frequency, not prompt-controlled"}
                  </span>
                )}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Section title={moreTitle} hint={moreHint}>
                  <BarPanel data={fireBars(moreFire)} domain={fireDomain} fmtVal={fireFmt}
                    zero={relMode} axis={relMode} labels={!relMode} />
                </Section>
                <Section title={lessTitle} hint={lessHint}>
                  <BarPanel data={fireBars(lessFire)} domain={fireDomain} fmtVal={fireFmt}
                    zero={relMode} axis={relMode} labels={!relMode} />
                </Section>
              </div>
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
            <button
              onClick={() => setShowQuadrant((s) => !s)}
              className="mt-3 flex w-full items-center gap-2 text-left text-xs font-semibold text-slate-300 hover:text-slate-100"
            >
              {showQuadrant ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Gap quadrant
              <span className="font-normal text-slate-500">
                — delta vs pool × reward; top-left (red) = under-expressed yet rewarded
              </span>
            </button>
            {showQuadrant && (
              <div className="mt-2">
                <GapQuadrant points={quadrantPoints} />
              </div>
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
