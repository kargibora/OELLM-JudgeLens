import { useEffect, useMemo, useState } from "react";
import type { CoactivationPair, ConceptCoactivation } from "../types";
import { conceptLabel } from "./ui";
import { ActivationMeter, EvidenceText, ExampleGroupSelect, activationDomain } from "./ActivationEvidence";

const activation = (
  example: NonNullable<ConceptCoactivation["examples"]>[string],
  featureId: number,
) => example.activations?.[String(featureId)];

export default function CoactivationPairEvidence({
  pair,
  coactivation,
  kind = "response",
  limit = 3,
}: {
  pair: CoactivationPair;
  coactivation: ConceptCoactivation;
  kind?: "response" | "prompt";
  limit?: number;
}) {
  const [group, setGroup] = useState("");
  useEffect(() => { setGroup(""); }, [pair.a, pair.b]);
  const allExamples = pair.rows
    .map((row) => ({ row, example: coactivation.examples?.[String(row)] }))
    .filter((item): item is {
      row: number;
      example: NonNullable<ConceptCoactivation["examples"]>[string];
    } => Boolean(item.example));
  const groups = useMemo(() => [...new Set(allExamples.map(({ example }) => example.group).filter((value): value is string => Boolean(value)))].sort(), [allExamples]);
  const examples = allExamples.filter(({ example }) => !group || example.group === group).slice(0, limit);
  const aName = conceptLabel(pair.a, pair.a_concept);
  const bName = conceptLabel(pair.b, pair.b_concept);
  const hasActivationValues = examples.some(({ example }) =>
    activation(example, pair.a) != null && activation(example, pair.b) != null,
  );
  const axisValues = (featureId: number) => Object.values(coactivation.examples ?? {})
    .map((example) => activation(example, featureId))
    .filter((value): value is number => value != null);
  const aDomain = activationDomain(axisValues(pair.a));
  const bDomain = activationDomain(axisValues(pair.b));
  const groupColumn = allExamples.find(({ example }) => example.group_column)?.example.group_column ?? "language";

  return (
    <div className="rounded-xl border border-accent/25 bg-accent/5 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {kind === "prompt" ? "Prompts" : "Responses"} where both axes activate
      </div>
      <div className="mt-1 text-sm font-medium text-slate-200">
        {aName} <span className="text-slate-500">+</span> {bName}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {pair.lift.toFixed(1)}× lift · {pair.count.toLocaleString()} co-activations · {examples.length} examples shown
        </p>
        <ExampleGroupSelect groups={groups} value={group} onChange={setGroup} column={groupColumn} />
      </div>

      {examples.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No transcript was included for this retained pair. Re-export with a corpus to attach evidence.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {examples.map(({ row, example }) => {
            const aValue = activation(example, pair.a);
            const bValue = activation(example, pair.b);
            return (
              <details key={row} className="group rounded-lg border border-edge/60 bg-ink/45 p-3" open={examples.length === 1}>
                <summary className="cursor-pointer list-none">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {aValue != null && <ActivationMeter value={aValue} min={aDomain.min} max={aDomain.max} label={`Axis #${pair.a}`} compact />}
                    {bValue != null && <ActivationMeter value={bValue} min={bDomain.min} max={bDomain.max} label={`Axis #${pair.b}`} compact />}
                  </div>
                  <div className="mt-3 group-open:hidden"><EvidenceText kind="prompt" preview>{example.prompt}</EvidenceText></div>
                  <span className="mt-1 block text-right text-[9px] text-slate-600">row {row}</span>
                </summary>
                <div className="mt-3 space-y-3 border-t border-edge/60 pt-3">
                  <EvidenceText kind="prompt">{example.prompt}</EvidenceText>
                  {example.response && <EvidenceText kind="response">{example.response}</EvidenceText>}
                </div>
              </details>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        {hasActivationValues
          ? "Both displayed sparse activations are positive. Examples are ranked by the weaker mean-normalized activation."
          : "These rows were selected because both sparse activations were positive; this older bundle does not include their magnitudes."}
        {" "}Co-activation is descriptive and does not prove that either interpretation is correct or causal.
      </p>
    </div>
  );
}
