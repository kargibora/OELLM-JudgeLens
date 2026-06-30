import { useMemo, useState } from "react";
import type { PromptFeatures as PF } from "../types";
import { Badge, Card, Explain } from "./ui";

export default function PromptFeatures({ data }: { data: PF | null }) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const fs = data?.features ?? [];
    const needle = q.trim().toLowerCase();
    return fs
      .filter((f) => !needle || (f.concept ?? "").toLowerCase().includes(needle))
      .sort((a, b) => (a.cluster_id ?? 0) - (b.cluster_id ?? 0) || a.feature_id - b.feature_id);
  }, [data, q]);

  if (!data)
    return (
      <Card>
        <h2 className="text-lg font-semibold">Prompt concepts</h2>
        <p className="mt-2 text-sm text-slate-400">
          No <code>prompt_features.json</code>. Run <code className="text-slate-300">name-prompts</code>{" "}
          (+ <code className="text-slate-300">interpret verify --lens-kind prompt</code> /{" "}
          <code className="text-slate-300">cluster-features --lens-kind prompt</code>), then re-run the exporter with{" "}
          <code className="text-slate-300">--prompt-interpret-dir …</code>.
        </p>
      </Card>
    );

  const hasFid = rows.some((r) => r.fidelity_pass !== undefined);
  const hasClu = rows.some((r) => r.behavior || r.cluster_id != null);

  return (
    <Card>
      <h2 className="text-lg font-semibold">Prompt concepts ({rows.length})</h2>
      <div className="my-3">
        <Explain>
          The concepts the prompt-lens SAE found in the <b>prompts</b> (what each battle is asking
          for) — the conditioning side of the relationship map. Concept names are{" "}
          <b>LLM-generated</b>; the <b>verified</b> badge means the name survived held-out detection.
          Behaviors group co-activating prompt concepts into higher-level prompt <i>types</i>.
        </Explain>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="filter concepts…"
        className="mb-3 w-full rounded-lg border border-edge bg-ink/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">concept</th>
              {hasClu && <th className="py-2 pr-3">prompt type</th>}
              {hasFid && <th className="py-2 pr-3">verified</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.feature_id} className="border-t border-edge/60">
                <td className="py-2 pr-3 text-slate-500">{r.feature_id}</td>
                <td className="py-2 pr-3 text-slate-200">{r.concept ?? "—"}</td>
                {hasClu && (
                  <td className="py-2 pr-3 text-slate-400">
                    {r.behavior ?? (r.cluster_id != null ? `cluster ${r.cluster_id}` : "—")}
                  </td>
                )}
                {hasFid && (
                  <td className="py-2 pr-3">
                    <Badge ok={!!r.fidelity_pass}>{r.fidelity_pass ? "verified" : "unverified"}</Badge>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
