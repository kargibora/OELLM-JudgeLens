import { ArrowUpRight, Database, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useDataArtifact } from "../data";
import type { JointExample, JointExampleShard } from "../types";
import { Card, ConceptLabel, SkeletonList, clip } from "./ui";

type EvidenceKind = "elicitation" | "preference";

export default function JointEvidence({
  promptFeature,
  responseFeature,
  promptName,
  responseName,
  kind,
  onOpenPrompt,
  onOpenBehavior,
}: {
  promptFeature: number;
  responseFeature: number;
  promptName: string | null | undefined;
  responseName: string | null | undefined;
  kind: EvidenceKind;
  onOpenPrompt?: () => void;
  onOpenBehavior?: () => void;
}) {
  const shard = useDataArtifact<JointExampleShard>(`joint_examples/${promptFeature}.json`);
  const examples = shard?.examples[String(responseFeature)] ?? [];

  return (
    <Card className="border-accent/25 bg-accent/[0.035]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-accent" />
            <h4 className="text-sm font-semibold text-slate-100">Matched evidence</h4>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
            A concrete response where both <ConceptLabel id={promptFeature} name={promptName} wrap className="text-slate-200" /> and{" "}
            <ConceptLabel id={responseFeature} name={responseName} wrap className="text-slate-200" /> activate strongly.
          </p>
        </div>
        {(onOpenPrompt || onOpenBehavior) && (
          <div className="flex flex-wrap gap-2">
            {onOpenPrompt && <EvidenceLink onClick={onOpenPrompt}>Open prompt</EvidenceLink>}
            {onOpenBehavior && <EvidenceLink onClick={onOpenBehavior}>Open behavior</EvidenceLink>}
          </div>
        )}
      </div>

      {shard === undefined ? (
        <div className="mt-3"><SkeletonList n={2} itemClass="h-32" /></div>
      ) : shard === null ? (
        <div className="mt-3 flex gap-2 rounded-xl border border-dashed border-edge bg-ink/30 p-3 text-xs leading-relaxed text-slate-500">
          <Database size={15} className="mt-0.5 shrink-0" />
          <span>Matched transcripts were not included in this bundle. Re-export it with <code className="text-slate-300">--joint-examples</code>.</span>
        </div>
      ) : examples.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-edge bg-ink/30 p-3 text-xs text-slate-500">
          No response in the exported sample had positive activation on both selected axes.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {examples.map((example, index) => (
            <EvidenceCard key={`${example.side}-${index}`} example={example} />
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Selected by balanced raw positive activation on both axes. This makes the relationship
        inspectable, but {kind === "preference" ? "the displayed outcome does not by itself explain the estimated win-rate effect" : "co-activation is descriptive, not causal"}.
        Semantic presence thresholds have not been applied to this evidence export.
      </p>
    </Card>
  );
}

function EvidenceLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-edge bg-ink/50 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accent/50 hover:text-slate-100">
      {children}<ArrowUpRight size={13} />
    </button>
  );
}

function EvidenceCard({ example }: { example: JointExample }) {
  const outcomeTone = example.outcome === "win" ? "bg-good/15 text-good"
    : example.outcome === "loss" ? "bg-bad/15 text-bad" : "bg-slate-600/20 text-slate-400";
  return (
    <article className="min-w-0 rounded-xl border border-edge bg-ink/45 p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="rounded-md bg-slate-600/25 px-1.5 py-0.5 font-medium text-slate-300">{example.model}</span>
        {example.outcome && <span className={`rounded-md px-1.5 py-0.5 font-medium ${outcomeTone}`}>{example.outcome}</span>}
        <span className="rounded-md border border-edge/70 px-1.5 py-0.5 tabular-nums text-slate-400" title="raw positive prompt-feature activation">
          prompt z {example.prompt_activation.toFixed(2)}
        </span>
        <span className="rounded-md border border-edge/70 px-1.5 py-0.5 tabular-nums text-slate-400" title="raw positive response-feature activation">
          response z {example.response_activation.toFixed(2)}
        </span>
      </div>
      <div className="rounded-lg bg-panel/60 p-2 text-slate-400">
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-600">Prompt</span>
        {clip(example.prompt, 420)}
      </div>
      <div className="mt-2 whitespace-pre-wrap text-slate-300">
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-600">Response</span>
        {clip(example.response, 900)}
      </div>
    </article>
  );
}
