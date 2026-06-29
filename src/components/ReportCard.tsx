import { useMemo, useState } from "react";
import type { Diagnosis, Feature } from "../types";
import { Card, Explain } from "./ui";
import { pct } from "../data";

// Mirrors `prefscope report`: per-model "what it does a lot / rarely / rewarded
// gaps / strong-weak prompt types", as plain ranked lists (no scatter).
export default function ReportCard({
  diagnosis,
  features,
}: {
  diagnosis: Diagnosis | null;
  features: Feature[];
}) {
  // build the model selector state (default to the first model, no hardcoded regex)
  const [model, setModel] = useState(diagnosis?.models?.[0] ?? "");

  const featureById = useMemo(() => {
    const m: Record<number, Feature> = {};
    for (const f of features) m[f.feature_id] = f;
    return m;
  }, [features]);

  const row = diagnosis?.rows[model];

  // per-feature view: concept + this model's fire rate + under-expression + reward
  const view = useMemo(() => {
    if (!row || !diagnosis) return [];
    return diagnosis.features.map((fid, i) => {
      const f = featureById[fid];
      return {
        fid,
        concept: diagnosis.concepts[i] ?? "",
        fire: row.fire_rate?.[i],
        under: row.delta_vs_pool?.[i] ?? row.net_direction?.[i],
        reward: f?.delta_win_rate ?? f?.win_assoc,
      };
    });
  }, [diagnosis, row, featureById]);

  const named = useMemo(() => view.filter((v) => v.concept && v.concept.trim() !== ""), [view]);
  const hasFire = !!row?.fire_rate;

  const doesALot = useMemo(
    () =>
      named
        .filter((v) => v.fire != null)
        .sort((a, b) => (b.fire ?? 0) - (a.fire ?? 0))
        .slice(0, 15),
    [named]
  );
  const doesRarely = useMemo(
    () =>
      named
        .filter((v) => v.fire != null)
        .sort((a, b) => (a.fire ?? 0) - (b.fire ?? 0))
        .slice(0, 15),
    [named]
  );
  const rewardedGaps = useMemo(
    () =>
      named
        .filter((v) => v.under != null && v.under < 0 && v.reward != null && v.reward > 0)
        .sort((a, b) => (b.reward ?? 0) - (a.reward ?? 0))
        .slice(0, 15),
    [named]
  );

  const promptTypes = row?.prompt_types ?? [];
  const strongPrompts = useMemo(
    () => [...promptTypes].sort((a, b) => b.win_rate - a.win_rate).slice(0, 15),
    [promptTypes]
  );
  const weakPrompts = useMemo(
    () => [...promptTypes].sort((a, b) => a.win_rate - b.win_rate).slice(0, 15),
    [promptTypes]
  );

  if (!diagnosis) return <Card>No diagnosis exported (run export with a built bank).</Card>;

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        A per-model <b>report card</b> mirroring <code>prefscope report</code>: what this model{" "}
        <i>does a lot</i> / <i>rarely</i>, the rewarded behaviours it <i>under-expresses</i> (gaps
        worth closing), and the prompt types it is strongest / weakest on.
      </Explain>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-400">
            model ({diagnosis.models.length})
          </span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-80 rounded-lg border border-edge bg-ink px-3 py-2 text-sm"
          >
            {diagnosis.models.map((m) => (
              <option key={m} value={m}>
                {m} · {pct(diagnosis.rows[m]?.win_rate, 0)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!row ? (
        <Card>No diagnosis row for this model.</Card>
      ) : (
        <>
          <Card>
            <h2 className="text-lg font-semibold">{model}</h2>
            <p className="text-sm text-slate-400">
              {row.n_battles} battles · win rate {pct(row.win_rate, 0)}
            </p>
          </Card>

          {!hasFire && (
            <Card>
              <p className="text-sm text-amber-400">
                This bundle predates the report card — re-run export_viewer_data.py to populate
                fire_rate / prompt_types. Showing rewarded gaps only.
              </p>
            </Card>
          )}

          {hasFire && (
            <div className="grid gap-4 md:grid-cols-2">
              <RankedList title="Does a lot" items={doesALot} render={(v) => `${v.concept} — fires ${pct(v.fire, 0)}`} />
              <RankedList title="Does rarely" items={doesRarely} render={(v) => `${v.concept} — fires ${pct(v.fire, 0)}`} />
            </div>
          )}

          <RankedList
            title="Rewarded gaps"
            accent="bad"
            empty="No rewarded behaviour is under-expressed."
            items={rewardedGaps}
            render={(v) => `${v.concept} — under-expressed, +${(v.reward ?? 0).toFixed(2)} Δwin`}
          />

          <Card>
            <h3 className="mb-2 text-sm font-semibold">Strong / weak prompt types</h3>
            {promptTypes.length === 0 ? (
              <p className="text-sm text-slate-500">
                Prompt-type breakdown not in this bundle — re-export with a prompt lens.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-good">Strongest</h4>
                  <ul className="space-y-1 text-sm">
                    {strongPrompts.map((p) => (
                      <li key={`s-${p.concept}`} className="text-slate-300">
                        {p.concept} — win rate {pct(p.win_rate, 0)} (n={p.n})
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-bad">Weakest</h4>
                  <ul className="space-y-1 text-sm">
                    {weakPrompts.map((p) => (
                      <li key={`w-${p.concept}`} className="text-slate-300">
                        {p.concept} — win rate {pct(p.win_rate, 0)} (n={p.n})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function RankedList<T extends { fid: number }>({
  title,
  items,
  render,
  accent,
  empty,
}: {
  title: string;
  items: T[];
  render: (v: T) => string;
  accent?: "bad";
  empty?: string;
}) {
  return (
    <Card>
      <h3 className={`mb-2 text-sm font-semibold ${accent === "bad" ? "text-bad" : ""}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty ?? "(none)"}</p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-300">
          {items.map((v) => (
            <li key={v.fid}>{render(v)}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
