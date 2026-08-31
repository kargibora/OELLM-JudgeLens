import { MessageSquareText, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { answerTypeOf, useAnalysisFilters } from "../analysisFilters";
import { normalizeConditional, pct, useDataArtifact } from "../data";
import type { CondCell, ElicEdge, ElicitationData, Feature, PromptFeatures } from "../types";
import { Card, Segmented, SkeletonList, conceptLabel } from "./ui";
import JointEvidence from "./JointEvidence";

type Pole = "positive" | "negative";
type Rank = "probability" | "enrichment" | "support" | "preference";
type Relation = { edge: ElicEdge; feature?: Feature; preference?: CondCell };

const pp = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
const clip = (value: string, length: number) => value.length <= length ? value : `${value.slice(0, length - 1)}…`;

export default function PromptAnswerExplorer({
  features,
  hasLabels,
}: {
  features: Feature[];
  hasLabels: boolean;
}) {
  const positive = useDataArtifact<ElicitationData>("elicitation.json");
  const negative = useDataArtifact<ElicitationData>("elicitation_negative.json");
  const promptFeatures = useDataArtifact<PromptFeatures>("prompt_features.json");
  const conditionalRaw = useDataArtifact<unknown>(hasLabels ? "conditional.json" : null);
  const { filters } = useAnalysisFilters();
  const [query, setQuery] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<number | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<number | null>(null);
  const [pole, setPole] = useState<Pole>("positive");
  const [rank, setRank] = useState<Rank>("probability");

  const elicitation = pole === "negative" ? negative : positive;
  const conditional = useMemo(() => normalizeConditional(conditionalRaw)?.raw ?? null, [conditionalRaw]);
  const featureById = useMemo(() => new Map(features.map((feature) => [feature.feature_id, feature])), [features]);
  const promptById = useMemo(() => new Map(
    (promptFeatures?.features ?? []).map((feature) => [feature.feature_id, feature]),
  ), [promptFeatures]);
  const relationNames = useMemo(() => new Map(
    (elicitation?.prompt_concepts ?? []).map((prompt) => [prompt.id, prompt.concept]),
  ), [elicitation]);

  const axes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const support = new Map<number, { count: number; n: number }>();
    for (const edge of elicitation?.edges ?? []) {
      if (edge.l2 <= 0) continue;
      const current = support.get(edge.px) ?? { count: 0, n: 0 };
      current.count += 1;
      current.n = Math.max(current.n, edge.nx);
      support.set(edge.px, current);
    }
    const source: Feature[] = promptFeatures?.features ?? (positive?.prompt_concepts ?? []).map((item) => ({
      feature_id: item.id,
      concept: item.concept ?? undefined,
    }));
    return source
      .map((axis) => ({ ...axis, ...support.get(axis.feature_id) }))
      .filter((axis) => {
        const positiveName = axis.positive_concept ?? axis.concept ?? "";
        const negativeName = axis.negative_concept ?? "";
        return !q || String(axis.feature_id) === q
          || positiveName.toLowerCase().includes(q)
          || negativeName.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || (b.n ?? 0) - (a.n ?? 0) || a.feature_id - b.feature_id);
  }, [elicitation, positive, promptFeatures, query]);

  useEffect(() => {
    if (selectedPrompt == null || !axes.some((axis) => axis.feature_id === selectedPrompt)) {
      setSelectedPrompt(axes[0]?.feature_id ?? null);
      setSelectedResponse(null);
    }
  }, [axes, selectedPrompt]);

  const relations = useMemo(() => {
    if (!elicitation || selectedPrompt == null) return [] as Relation[];
    const conditionalByFeature = new Map(
      pole === "positive"
        ? (conditional?.cells ?? []).filter((cell) => cell.pc === selectedPrompt).map((cell) => [cell.f, cell])
        : [],
    );
    const rows: Relation[] = elicitation.edges
      .filter((edge) => edge.px === selectedPrompt && edge.l2 > 0)
      .map((edge) => ({ edge, feature: featureById.get(edge.cy), preference: conditionalByFeature.get(edge.cy) }))
      .filter(({ feature }) => filters.answerType === "all" || answerTypeOf(feature) === filters.answerType);
    const compare: Record<Rank, (a: Relation, b: Relation) => number> = {
      probability: (a, b) => b.edge.pyx - a.edge.pyx,
      enrichment: (a, b) => b.edge.lift - a.edge.lift,
      support: (a, b) => b.edge.nco - a.edge.nco,
      preference: (a, b) => Math.abs(b.preference?.delta ?? 0) - Math.abs(a.preference?.delta ?? 0),
    };
    return rows.sort(compare[rank]);
  }, [elicitation, selectedPrompt, pole, conditional, featureById, filters.answerType, rank]);

  useEffect(() => {
    if (selectedResponse == null || !relations.some(({ edge }) => edge.cy === selectedResponse))
      setSelectedResponse(relations[0]?.edge.cy ?? null);
  }, [relations, selectedResponse]);

  if (positive === undefined || negative === undefined || promptFeatures === undefined
      || (hasLabels && conditionalRaw === undefined))
    return <SkeletonList n={3} itemClass="h-40" />;
  if (!positive)
    return <Card><p className="text-sm text-slate-500">This dataset does not include prompt→answer links.</p></Card>;

  const selectedAxis = selectedPrompt == null ? undefined : promptById.get(selectedPrompt);
  const promptName = pole === "negative"
    ? selectedAxis?.negative_concept ?? relationNames.get(selectedPrompt ?? -1)
    : selectedAxis?.positive_concept ?? selectedAxis?.concept ?? relationNames.get(selectedPrompt ?? -1);
  const selected = relations.find(({ edge }) => edge.cy === selectedResponse);
  const hasNegative = Boolean(negative);

  const selectPole = (next: Pole) => {
    if (next === "negative" && !hasNegative) return;
    setPole(next);
    if (next === "negative" && rank === "preference") setRank("probability");
    setSelectedResponse(null);
  };

  return (
    <div className="space-y-4">
      {filters.group && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/80">
          Showing {filters.groupColumn}={filters.group} evidence.
        </div>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
        <Card className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Prompt axes</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">{promptFeatures?.features.length ?? axes.length} axes · {(promptFeatures?.features.length ?? axes.length) * (hasNegative ? 2 : 1)} poles</p>
            </div>
            <Segmented value={pole} onChange={selectPole} size="xs" options={[
              { value: "positive", label: "z > 0", activeClassName: "bg-sky-500/85 text-white shadow-sm" },
              { value: "negative", label: "z < 0", disabled: !hasNegative, activeClassName: "bg-amber-400 text-slate-950 shadow-sm" },
            ]} />
          </div>
          <label className="relative mt-3 block">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)}
              aria-label="Search prompt concepts" placeholder="Search either pole…"
              className="w-full rounded-lg border border-edge bg-ink py-2 pl-8 pr-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent/60" />
          </label>
          <div className="mt-3 max-h-[680px] space-y-1 overflow-auto pr-1">
            {axes.map((axis) => {
              const active = axis.feature_id === selectedPrompt;
              const name = pole === "negative"
                ? axis.negative_concept ?? `feature ${axis.feature_id} negative pole`
                : axis.positive_concept ?? axis.concept ?? `feature ${axis.feature_id}`;
              return (
                <button key={axis.feature_id} type="button"
                  onClick={() => { setSelectedPrompt(axis.feature_id); setSelectedResponse(null); }}
                  className={`w-full rounded-xl px-3 py-2.5 text-left ${active ? (pole === "negative" ? "bg-amber-400/10 ring-1 ring-inset ring-amber-400/25" : "bg-sky-400/10 ring-1 ring-inset ring-sky-400/25") : "hover:bg-edge/35"}`}>
                  <div className="flex items-start gap-2">
                    <MessageSquareText size={13} className={`mt-0.5 shrink-0 ${pole === "negative" ? "text-amber-300/70" : "text-sky-300/70"}`} />
                    <span className="min-w-0 flex-1 text-sm leading-snug text-slate-300">{name}</span>
                  </div>
                  <div className="mt-1.5 flex justify-between gap-3 pl-5 text-[10px] text-slate-600">
                    <span>axis {axis.feature_id}</span><span>{axis.count ?? 0} answer links</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className={`min-w-0 border-l-2 pl-3 ${pole === "negative" ? "border-amber-400/70" : "border-sky-400/70"}`}>
                <div className={`font-mono text-[10px] ${pole === "negative" ? "text-amber-300/80" : "text-sky-300/80"}`}>{pole === "negative" ? "z < 0" : "z > 0"} · axis {selectedPrompt}</div>
                <h2 className="mt-1 max-w-3xl text-lg font-semibold leading-snug text-slate-50">{promptName ?? "Choose a prompt pole"}</h2>
              </div>
              <Segmented value={rank} onChange={setRank} options={[
                { value: "probability" as const, label: "Common" },
                { value: "enrichment" as const, label: "Distinctive" },
                { value: "support" as const, label: "Support" },
                ...(hasLabels && pole === "positive" ? [{ value: "preference" as const, label: "Win effect" }] : []),
              ]} />
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            {relations.length === 0 ? (
              <p className="px-4 py-16 text-center text-sm text-slate-500">No positive relationship matches these filters.</p>
            ) : (
              <RelationshipGraph relations={relations} promptName={promptName ?? `axis ${selectedPrompt}`}
                pole={pole} selectedResponse={selectedResponse} onSelect={setSelectedResponse} />
            )}
            {selected && (
              <div className="grid grid-cols-3 border-t border-edge bg-ink/30 px-4 py-3 text-xs">
                <div><div className="text-[10px] uppercase text-slate-600">Appears here</div><div className="mt-1 font-mono text-slate-200">{pct(selected.edge.pyx, 1)}</div></div>
                <div><div className="text-[10px] uppercase text-slate-600">Enrichment</div><div className="mt-1 font-mono text-accent-soft">{selected.edge.lift.toFixed(1)}×</div></div>
                <div><div className="text-[10px] uppercase text-slate-600">Win effect</div><div className={`mt-1 font-mono ${selected.preference?.sig ? (selected.preference.delta >= 0 ? "text-good" : "text-bad") : "text-slate-500"}`}>{selected.preference ? pp(selected.preference.delta) : "—"}</div></div>
              </div>
            )}
          </Card>

          {selected && selectedPrompt != null && (
            <JointEvidence promptFeature={selectedPrompt} responseFeature={selected.edge.cy}
              promptName={promptName} responseName={selected.feature?.concept}
              pole={pole} kind={hasLabels && selected.preference ? "preference" : "elicitation"} />
          )}
        </div>
      </div>
    </div>
  );
}

function RelationshipGraph({ relations, promptName, pole, selectedResponse, onSelect }: {
  relations: Relation[];
  promptName: string;
  pole: Pole;
  selectedResponse: number | null;
  onSelect: (featureId: number) => void;
}) {
  const shown = relations.slice(0, 10);
  const height = Math.max(310, shown.length * 48 + 30);
  const centreY = height / 2;
  const tone = pole === "negative" ? "#fbbf24" : "#38bdf8";
  return (
    <div className="overflow-x-auto bg-[#080b12]">
      <svg viewBox={`0 0 900 ${height}`} className="block h-auto min-w-[760px] w-full" role="img"
        aria-label={`Answer concepts associated with ${promptName}`}>
        <rect width="900" height={height} fill="#080b12" />
        {shown.map(({ edge }, index) => {
          const y = 28 + index * 48;
          const selected = edge.cy === selectedResponse;
          return <line key={`edge-${edge.cy}`} x1="244" y1={centreY} x2="430" y2={y + 17}
            stroke={selected ? tone : "#475569"} strokeOpacity={selected ? 0.9 : 0.36}
            strokeWidth={selected ? 3 : 1 + Math.min(2, Math.log1p(edge.nco) / 4)} />;
        })}
        <rect x="24" y={centreY - 39} width="220" height="78" rx="7" fill="#111827" stroke={tone} strokeWidth="2" />
        <text x="42" y={centreY - 10} fill={tone} fontSize="11" fontFamily="ui-monospace, SFMono-Regular, monospace">PROMPT POLE</text>
        <text x="42" y={centreY + 15} fill="#f8fafc" fontSize="14" fontWeight="600">{clip(promptName, 27)}</text>
        {shown.map(({ edge, feature }, index) => {
          const y = 28 + index * 48;
          const selected = edge.cy === selectedResponse;
          return (
            <g key={edge.cy} role="button" tabIndex={0} className="cursor-pointer outline-none"
              onClick={() => onSelect(edge.cy)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(edge.cy); } }}>
              <rect x="430" y={y} width="442" height="34" rx="6"
                fill={selected ? "#172033" : "#0f172a"} stroke={selected ? tone : "#263244"} strokeWidth={selected ? 2 : 1} />
              <text x="446" y={y + 21} fill={selected ? "#f8fafc" : "#cbd5e1"} fontSize="13">{clip(conceptLabel(edge.cy, feature?.concept), 43)}</text>
              <text x="852" y={y + 21} textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, monospace">{pct(edge.pyx, 0)} · {edge.lift.toFixed(1)}×</text>
              <title>{conceptLabel(edge.cy, feature?.concept)}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
