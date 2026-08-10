import { useEffect, useMemo, useState } from "react";
import type { ConceptCoactivation, ElicitationData, Example, Feature } from "../types";
import { pct, useDataArtifact, useFeatureExamples } from "../data";
import { Card, clip, conceptLabel } from "./ui";
import JointEvidence from "./JointEvidence";
import CoactivationPairEvidence from "./CoactivationPairEvidence";
import FeatureDetailDrawerShell from "./FeatureDetailDrawerShell";

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
    <FeatureDetailDrawerShell kind="response" featureId={featureId} feature={feature} onClose={onClose}>
      <Card className="overflow-hidden bg-gradient-to-br from-panel/90 to-ink/60">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Interpretation</div>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-300">
          {feature?.feature_summary || "LLM-assigned concept label. Inspect the activation evidence before treating it as a semantic claim."}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-xl border border-edge/70 bg-ink/45 px-3 py-2.5"><dt className="text-slate-500">Prevalence</dt><dd className="mt-1 text-sm font-medium text-slate-100">{pct(feature?.semantic_presence_rate ?? feature?.generality ?? feature?.fire_rate, 2)}</dd></div>
          <div className="rounded-xl border border-edge/70 bg-ink/45 px-3 py-2.5"><dt className="text-slate-500">Semantic family</dt><dd className="mt-1 text-sm text-slate-200">{feature?.semantic_family?.replace(/_/g, " ") ?? "unclassified"}</dd></div>
          <div className="rounded-xl border border-edge/70 bg-ink/45 px-3 py-2.5"><dt className="text-slate-500">Behavior scope</dt><dd className="mt-1 text-sm text-slate-200">{feature?.behavior_category?.replace(/_/g, " ") ?? "unclassified"}</dd></div>
          <div className="rounded-xl border border-edge/70 bg-ink/45 px-3 py-2.5"><dt className="text-slate-500">Fidelity agreement</dt><dd className="mt-1 text-sm font-medium text-slate-100">{pct(feature?.agreement, 0)}</dd></div>
        </dl>
      </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Activation evidence</div><h3 className="mt-1 text-base font-semibold text-slate-100">Strongest corpus examples</h3></div>
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
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Response relationships</div>
            <h3 className="mt-1 text-base font-semibold text-slate-100">Co-activation neighbors</h3>
            <p className="mb-3 mt-1 text-xs leading-relaxed text-slate-500">Features observed on the same responses more often than independence predicts. Open evidence to inspect both activations.</p>
            {pairs.length === 0 ? <p className="text-sm text-slate-500">No retained co-activation pair.</p>
              : <div className="space-y-1">{pairs.map((pair) => {
                const other = pair.a === featureId ? pair.b : pair.a;
                const otherName = pair.a === featureId ? pair.b_concept : pair.a_concept;
                const key = `${pair.a}-${pair.b}`;
                return <div key={key} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-edge/35">
                  <button type="button" onClick={() => onSelectFeature(other)} className="min-w-0 flex-1 truncate text-left text-sm text-slate-300 hover:underline">{conceptLabel(other, otherName)}</button>
                  <span className="font-mono text-xs text-accent-soft">{pair.lift.toFixed(1)}×</span>
                  <span className="w-20 text-right text-xs text-slate-500">n={pair.count.toLocaleString()}</span>
                  {pair.rows.length > 0 && <button type="button" onClick={() => setActivePair(activePair === key ? null : key)} aria-expanded={activePair === key} className="rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:bg-edge/40">{activePair === key ? "Hide evidence" : "Evidence"}</button>}
                </div>;
              })}</div>}
            {selectedPair && coactivation && <div className="mt-3">
              <CoactivationPairEvidence pair={selectedPair} coactivation={coactivation} />
            </div>}
          </Card>

          <Card>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Prompt relationships</div>
            <h3 className="mt-1 text-base font-semibold text-slate-100">Activated by these prompts</h3>
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
    </FeatureDetailDrawerShell>
  );
}
