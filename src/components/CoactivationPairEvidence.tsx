import type { CoactivationPair, ConceptCoactivation } from "../types";
import { conceptLabel } from "./ui";

const activation = (
  example: NonNullable<ConceptCoactivation["examples"]>[string],
  featureId: number,
) => example.activations?.[String(featureId)];

const z = (value: number | undefined) =>
  value == null ? null : `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;

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
  const examples = pair.rows
    .map((row) => ({ row, example: coactivation.examples?.[String(row)] }))
    .filter((item): item is {
      row: number;
      example: NonNullable<ConceptCoactivation["examples"]>[string];
    } => Boolean(item.example))
    .slice(0, limit);
  const aName = conceptLabel(pair.a, pair.a_concept);
  const bName = conceptLabel(pair.b, pair.b_concept);
  const hasActivationValues = examples.some(({ example }) =>
    activation(example, pair.a) != null && activation(example, pair.b) != null,
  );

  return (
    <div className="rounded-xl border border-accent/25 bg-accent/5 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {kind === "prompt" ? "Prompts" : "Responses"} where both axes activate
      </div>
      <div className="mt-1 text-sm font-medium text-slate-200">
        {aName} <span className="text-slate-500">+</span> {bName}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {pair.lift.toFixed(1)}× lift · {pair.count.toLocaleString()} co-activations · {examples.length} examples shown
      </p>

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
              <details key={row} className="rounded-lg border border-edge/60 bg-ink/45 p-3" open={examples.length === 1}>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent-soft">
                      #{pair.a} {z(aValue) ?? "active"}
                    </span>
                    <span className="rounded-full bg-good/10 px-2 py-0.5 font-mono text-[10px] text-good">
                      #{pair.b} {z(bValue) ?? "active"}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-600">row {row}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-300">{example.prompt}</p>
                </summary>
                <div className="mt-3 space-y-3 border-t border-edge/60 pt-3">
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Prompt</div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{example.prompt}</p>
                  </div>
                  {example.response && (
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Response</div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{example.response}</p>
                    </div>
                  )}
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
