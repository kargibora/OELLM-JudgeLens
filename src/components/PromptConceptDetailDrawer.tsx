import { useEffect, useMemo, useState } from "react";

import type { ConceptCoactivation, Feature } from "../types";
import { pct, useDataArtifact } from "../data";
import { Card, conceptLabel } from "./ui";
import { PromptAtlasExamples } from "./FeatureAtlasView";
import CoactivationPairEvidence from "./CoactivationPairEvidence";
import FeatureDetailDrawerShell from "./FeatureDetailDrawerShell";

export default function PromptConceptDetailDrawer({
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
  const coactivation = useDataArtifact<ConceptCoactivation>("prompt_coactivation.json");
  const [activePair, setActivePair] = useState<string | null>(null);

  useEffect(() => { setActivePair(null); }, [featureId]);

  const pairs = useMemo(() => (coactivation?.pairs ?? [])
    .filter((pair) => pair.a === featureId || pair.b === featureId)
    .sort((a, b) => b.lift - a.lift || b.count - a.count)
    .slice(0, 10), [coactivation, featureId]);
  const selectedPair = pairs.find((pair) => `${pair.a}-${pair.b}` === activePair) ?? null;
  const name = conceptLabel(featureId, feature?.concept);

  return (
    <FeatureDetailDrawerShell kind="prompt" featureId={featureId} feature={feature} onClose={onClose}>
      <Card className="overflow-hidden bg-gradient-to-br from-panel/90 to-ink/60">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Interpretation</div>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-300">
          {feature?.feature_summary || "LLM-assigned prompt concept. Inspect its strongest prompts before treating the label as a semantic claim."}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-edge/70 bg-ink/45 px-3 py-2.5"><dt className="text-slate-500">Verification</dt><dd className="mt-1 text-sm text-slate-100">{feature?.fidelity_pass === true ? "passed" : feature?.fidelity_pass === false ? "did not pass" : "not tested"}</dd></div>
          <div className="rounded-xl border border-edge/70 bg-ink/45 px-3 py-2.5"><dt className="text-slate-500">Fidelity agreement</dt><dd className="mt-1 text-sm text-slate-100">{pct(feature?.agreement, 0)}</dd></div>
        </dl>
      </Card>

          <PromptAtlasExamples fid={featureId} concept={name} />

          <Card>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Prompt relationships</div>
            <h3 className="mt-1 text-base font-semibold text-slate-100">Co-activation neighbors</h3>
            <p className="mb-3 mt-1 text-xs leading-relaxed text-slate-500">Prompt axes active on the same request more often than independence predicts. Open evidence to inspect both activations.</p>
            {coactivation === undefined ? <p className="text-sm text-slate-500">Loading co-activations…</p>
              : pairs.length === 0 ? <p className="text-sm text-slate-500">No retained prompt co-activation pair.</p>
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
              <CoactivationPairEvidence pair={selectedPair} coactivation={coactivation} kind="prompt" />
            </div>}
          </Card>
    </FeatureDetailDrawerShell>
  );
}
