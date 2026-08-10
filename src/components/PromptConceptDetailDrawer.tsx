import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import type { ConceptCoactivation, Feature } from "../types";
import { useDataArtifact } from "../data";
import { Card, ConceptLabel, VerifiedBadge, conceptLabel } from "./ui";
import { PromptAtlasExamples } from "./FeatureAtlasView";
import CoactivationPairEvidence from "./CoactivationPairEvidence";

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
  useEffect(() => { setActivePair(null); }, [featureId]);

  const pairs = useMemo(() => (coactivation?.pairs ?? [])
    .filter((pair) => pair.a === featureId || pair.b === featureId)
    .sort((a, b) => b.lift - a.lift || b.count - a.count)
    .slice(0, 10), [coactivation, featureId]);
  const selectedPair = pairs.find((pair) => `${pair.a}-${pair.b}` === activePair) ?? null;
  const name = conceptLabel(featureId, feature?.concept);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/65 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label={`Prompt concept ${featureId} details`}
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-edge bg-[#0b101a] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-edge bg-[#0b101a]/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Prompt feature {featureId}</div>
            <h2 className="mt-1 text-xl font-semibold leading-snug text-slate-50"><ConceptLabel id={featureId} name={feature?.concept} wrap /></h2>
          </div>
          <button type="button" onClick={onClose} autoFocus aria-label="Close prompt concept details"
            className="icon-button grid shrink-0"><X size={18} /></button>
        </div>

        <div className="space-y-4 p-5">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <p className="max-w-xl text-sm leading-relaxed text-slate-400">
                {feature?.feature_summary || "LLM-assigned prompt concept. Inspect its strongest prompts before treating the label as a semantic claim."}
              </p>
              <VerifiedBadge pass={feature?.fidelity_pass} n={feature?.fidelity_n} />
            </div>
          </Card>

          <PromptAtlasExamples fid={featureId} concept={name} />

          <Card>
            <h3 className="text-sm font-semibold text-slate-100">Co-activation neighbors</h3>
            <p className="mb-3 mt-1 text-xs text-slate-500">Prompt axes active on the same request; descriptive, not causal.</p>
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
        </div>
      </aside>
    </div>
  );
}
