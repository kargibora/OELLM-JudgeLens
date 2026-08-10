import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { ConceptCoactivation, ElicitationData, Example, Feature } from "../types";
import { pct, useDataArtifact, useFeatureExamples } from "../data";
import { Card, ConceptLabel, VerifiedBadge, clip, conceptLabel } from "./ui";
import JointEvidence from "./JointEvidence";

export default function ConceptDetailDrawer({
  featureId,
  features,
  onClose,
  onSelectFeature,
}: {
  featureId: number;
  features: Feature[];
  onClose: () => void;
  onSelectFeature: (featureId: number) => void;
}) {
  const feature = features.find((row) => row.feature_id === featureId);
  const examples = useFeatureExamples(featureId);
  const coactivation = useDataArtifact<ConceptCoactivation>("coactivation.json");
  const elicitation = useDataArtifact<ElicitationData>("elicitation.json");
  const [activePair, setActivePair] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<number | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  useEffect(() => { setActivePair(null); setActivePrompt(null); }, [featureId]);

  const pairs = useMemo(() => (coactivation?.pairs ?? [])
    .filter((pair) => pair.a === featureId || pair.b === featureId)
    .sort((a, b) => b.lift - a.lift || b.count - a.count)
    .slice(0, 10), [coactivation, featureId]);
  const promptEdges = useMemo(() => (elicitation?.edges ?? [])
    .filter((edge) => edge.cy === featureId && edge.l2 > 0)
    .sort((a, b) => Number(b.sig) - Number(a.sig) || b.lift - a.lift)
    .slice(0, 10), [elicitation, featureId]);
  const promptNames = useMemo(() => new Map(
    (elicitation?.prompt_concepts ?? []).map((row) => [row.id, row.concept]),
  ), [elicitation]);
  const selectedPair = pairs.find((pair) => `${pair.a}-${pair.b}` === activePair) ?? null;
  const pairExamples = selectedPair?.rows
    .map((row) => coactivation?.examples?.[String(row)])
    .filter((row): row is NonNullable<typeof row> => Boolean(row)) ?? [];

  const ownExamples = useMemo(() => (examples ?? []).map((row: Example) => {
    const paired = Boolean(row.completion_b);
    const sideA = row.z >= 0;
    return {
      z: row.z,
      prompt: row.prompt,
      response: paired ? (sideA ? row.completion_a : row.completion_b) : row.completion_a,
    };
  }).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 5), [examples]);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/65 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label={`Concept ${featureId} details`}
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-edge bg-[#0b101a] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-edge bg-[#0b101a]/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Response feature {featureId}</div>
            <h2 className="mt-1 text-xl font-semibold leading-snug text-slate-50"><ConceptLabel id={featureId} name={feature?.concept} wrap /></h2>
          </div>
          <button type="button" onClick={onClose} autoFocus aria-label="Close concept details"
            className="icon-button grid shrink-0"><X size={18} /></button>
        </div>

        <div className="space-y-4 p-5">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <p className="max-w-xl text-sm leading-relaxed text-slate-400">
                {feature?.feature_summary || "LLM-assigned concept label. Inspect the activation evidence before treating it as a semantic claim."}
              </p>
              <VerifiedBadge pass={feature?.fidelity_pass} n={feature?.fidelity_n} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div><dt className="text-slate-500">Prevalence</dt><dd className="mt-1 text-slate-200">{pct(feature?.semantic_presence_rate ?? feature?.generality ?? feature?.fire_rate, 2)}</dd></div>
              <div><dt className="text-slate-500">Semantic family</dt><dd className="mt-1 text-slate-200">{feature?.semantic_family?.replace(/_/g, " ") ?? "unclassified"}</dd></div>
              <div><dt className="text-slate-500">Behavior scope</dt><dd className="mt-1 text-slate-200">{feature?.behavior_category?.replace(/_/g, " ") ?? "unclassified"}</dd></div>
              <div><dt className="text-slate-500">Fidelity agreement</dt><dd className="mt-1 text-slate-200">{pct(feature?.agreement, 0)}</dd></div>
            </dl>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">Strongest activation examples</h3>
              <span className="text-xs text-slate-500">{ownExamples.length} shown</span>
            </div>
            {examples === undefined ? <p className="text-sm text-slate-500">Loading examples…</p>
              : ownExamples.length === 0 ? <p className="text-sm text-slate-500">No corpus example was exported for this axis.</p>
                : <div className="space-y-2">{ownExamples.map((example, index) => (
                  <details key={index} className="rounded-xl border border-edge/70 bg-ink/40 p-3">
                    <summary className="cursor-pointer list-none text-sm text-slate-300">
                      <span className="line-clamp-2">{clip(example.response, 260)}</span>
                      <span className="mt-1 block font-mono text-[10px] text-accent-soft">activation {example.z >= 0 ? "+" : ""}{example.z.toFixed(2)}</span>
                    </summary>
                    <div className="mt-3 space-y-3 border-t border-edge/60 pt-3 text-sm leading-relaxed text-slate-300">
                      <div><div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Prompt</div><p className="whitespace-pre-wrap">{example.prompt}</p></div>
                      <div><div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Response</div><p className="whitespace-pre-wrap">{example.response}</p></div>
                    </div>
                  </details>
                ))}</div>}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-100">Co-activation neighbors</h3>
            <p className="mb-3 mt-1 text-xs text-slate-500">Observed on the same responses; descriptive, not causal.</p>
            {pairs.length === 0 ? <p className="text-sm text-slate-500">No retained co-activation pair.</p>
              : <div className="space-y-1">{pairs.map((pair) => {
                const other = pair.a === featureId ? pair.b : pair.a;
                const otherName = pair.a === featureId ? pair.b_concept : pair.a_concept;
                const key = `${pair.a}-${pair.b}`;
                return <div key={key} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-edge/35">
                  <button type="button" onClick={() => onSelectFeature(other)} className="min-w-0 flex-1 truncate text-left text-sm text-slate-300 hover:underline">{conceptLabel(other, otherName)}</button>
                  <span className="font-mono text-xs text-accent-soft">{pair.lift.toFixed(1)}×</span>
                  <span className="w-20 text-right text-xs text-slate-500">n={pair.count.toLocaleString()}</span>
                  {pair.rows.length > 0 && <button type="button" onClick={() => setActivePair(activePair === key ? null : key)} className="rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:bg-edge/40">Example</button>}
                </div>;
              })}</div>}
            {selectedPair && <div className="mt-3 rounded-xl border border-accent/20 bg-accent/5 p-3">
              {pairExamples.length === 0 ? <p className="text-sm text-slate-500">No transcript was included for this retained pair.</p>
                : pairExamples.slice(0, 2).map((example, index) => <div key={index} className="mb-3 last:mb-0">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Prompt</div><p className="text-sm text-slate-300">{example.prompt}</p>
                  <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">Response</div><p className="text-sm text-slate-300">{example.response}</p>
                </div>)}
            </div>}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-100">Activated by these prompts</h3>
            <p className="mb-3 mt-1 text-xs text-slate-500">Prompt→response co-activation; significant edges are listed first.</p>
            {promptEdges.length === 0 ? <p className="text-sm text-slate-500">No retained positive prompt linkage for this feature.</p>
              : <div className="space-y-1">{promptEdges.map((edge) => <button key={edge.px} type="button" onClick={() => setActivePrompt(edge.px)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${activePrompt === edge.px ? "bg-accent/15" : "hover:bg-edge/35"}`}>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{conceptLabel(edge.px, promptNames.get(edge.px))}</span>
                <span className="font-mono text-xs text-accent-soft">{edge.lift.toFixed(1)}×</span>
                <span className="text-[10px] text-slate-500">{edge.sig ? "significant" : "exploratory"}</span>
              </button>)}</div>}
          </Card>
          {activePrompt != null && <JointEvidence promptFeature={activePrompt} responseFeature={featureId}
            promptName={promptNames.get(activePrompt)} responseName={feature?.concept ?? null} kind="elicitation" />}
        </div>
      </aside>
    </div>
  );
}
