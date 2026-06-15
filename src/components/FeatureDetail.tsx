import { useMemo, useState } from "react";
import type { Examples, Feature } from "../types";
import { Card } from "./ui";
import { fmt } from "../data";

function Expandable({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 500;
  return (
    <div>
      <div className={`relative ${!open && long ? "max-h-44 overflow-hidden" : ""}`}>
        <p className="whitespace-pre-wrap text-sm text-slate-200">{text}</p>
        {!open && long && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-ink to-transparent" />
        )}
      </div>
      {long && (
        <button
          onClick={() => setOpen(!open)}
          className="mt-2 text-xs font-medium text-accent hover:underline"
        >
          {open ? "Show less ▲" : "Show full response ▾"}
        </button>
      )}
    </div>
  );
}

export default function FeatureDetail({
  features,
  examples,
}: {
  features: Feature[];
  examples: Examples | null;
}) {
  const withEx = useMemo(
    () => features.filter((f) => examples && examples[String(f.feature_id)]?.length),
    [features, examples]
  );
  const [fid, setFid] = useState<number>(withEx[0]?.feature_id ?? features[0]?.feature_id ?? 0);
  const feat = features.find((f) => f.feature_id === fid);
  const rows = examples?.[String(fid)] ?? [];

  if (!examples) return <Card>No examples exported — re-run export with --corpus.</Card>;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={fid}
            onChange={(e) => setFid(Number(e.target.value))}
            className="max-w-xl rounded-lg border border-edge bg-ink px-3 py-2 text-sm"
          >
            {withEx.map((f) => (
              <option key={f.feature_id} value={f.feature_id}>
                {f.feature_id}: {f.concept}
              </option>
            ))}
          </select>
          {feat && (
            <div className="flex gap-4 text-sm text-slate-400">
              <span>fidelity <span className="font-mono text-slate-200">{fmt(feat.correlation, 2)}</span></span>
              <span>
                win assoc{" "}
                <span className={`font-mono ${(feat.win_assoc ?? 0) >= 0 ? "text-good" : "text-bad"}`}>
                  {fmt(feat.win_assoc, 3)}
                </span>
              </span>
            </div>
          )}
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Battles where this axis fires hardest. <span className="text-good">z &gt; 0</span> = response A
          expresses the concept more; z &lt; 0 = B does.
        </p>
      </Card>

      {rows.map((r, i) => (
        <Card key={i}>
          <div className="mb-2 flex items-center gap-3">
            <span
              className={`rounded-md px-2 py-0.5 font-mono text-xs ${
                r.z >= 0 ? "bg-good/15 text-good" : "bg-bad/15 text-bad"
              }`}
            >
              z = {r.z >= 0 ? "+" : ""}
              {r.z.toFixed(3)}
            </span>
            <span className="truncate text-sm text-slate-400">{r.prompt.slice(0, 120)}</span>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-slate-500">prompt</summary>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{r.prompt}</p>
          </details>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-edge bg-ink/60 p-3">
              <div className="mb-1 text-xs font-semibold text-slate-400">A · {r.model_a}</div>
              <Expandable text={r.completion_a} />
            </div>
            <div className="rounded-xl border border-edge bg-ink/60 p-3">
              <div className="mb-1 text-xs font-semibold text-slate-400">B · {r.model_b}</div>
              <Expandable text={r.completion_b} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
