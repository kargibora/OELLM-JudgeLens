import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ElicitationData, Examples, Feature } from "../types";
import { Card, Explain, ConceptLabel, conceptLabel } from "./ui";

// A dedicated view that decomposes response features by GENERALITY = pervasiveness: the
// fraction of responses a feature fires in. A general behaviour pervades responses
// ("refuses", "produces a list"); a niche / content-bound feature fires rarely ("American
// football"). Fire rate is the robust signal — topic-based measures can't isolate niche
// content the prompt lens has no concept for. n_prompt_types (# prompt concepts that
// significantly trigger it) is shown as a separate "topic-gated" context column. Fire rates
// are skewed, so the bar + the general/content-bound cut use the PERCENTILE, while the
// number shows the raw "fires in X%".

const clip = (s: string, n = 320) => (s.length > n ? s.slice(0, n) + " …" : s);

type Row = Feature & { generality: number; pct: number };

export default function GeneralBehaviours({
  features,
  elicitation,
  examples,
}: {
  features: Feature[];
  elicitation: ElicitationData | null;
  examples: Examples | null;
}) {
  const [thr, setThr] = useState(0.6); // percentile cut: general = top (1 - thr) by fire rate
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  // named features with a fire rate, sorted most-pervasive first, tagged with their
  // percentile (fire rates are skewed, so the bar + cut use percentile for even spacing).
  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const named = features
      .filter(
        (f) =>
          f.generality != null &&
          !Number.isNaN(f.generality) &&
          f.concept &&
          f.concept.trim() !== "" &&
          (!q || f.concept.toLowerCase().includes(q))
      )
      .map((f) => ({ ...f, generality: f.generality as number }))
      .sort((a, b) => b.generality - a.generality);
    const n = named.length;
    return named.map((f, i) => ({ ...f, pct: n > 1 ? (n - 1 - i) / (n - 1) : 1 }));
  }, [features, query]);

  const anyGenerality = features.some((f) => f.generality != null && !Number.isNaN(f.generality));
  const general = rows.filter((r) => r.pct >= thr);
  const bound = rows.filter((r) => r.pct < thr);

  if (!anyGenerality)
    return (
      <Card>
        <h2 className="text-lg font-semibold text-amber-400">No generality data yet</h2>
        <p className="mt-1 text-sm text-slate-300">
          This bundle has no per-feature <code>generality</code>. Re-run{" "}
          <code>export_viewer_data.py</code> against an individual lens (it reads the
          per-response codes <code>z_a</code>/<code>z_b</code>) to populate this view.
        </p>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        Response features split by <b>generality</b> = <b>pervasiveness</b>: the fraction of
        responses a behaviour appears in. <b>General</b> behaviours ("refuses", "produces a
        list", "responds in the user's language") pervade responses; <b>content-bound</b>
        ones ("American football", "crypto investment advice") fire in a tiny fraction. Fire
        rate is the robust signal here — with this prompt lens, topic-based measures can't
        isolate niche content that has no matching prompt concept, whereas 0.5% of responses
        is niche regardless. The bar and the cut below use the <i>percentile</i> (fire rates
        are skewed); the number is the raw "fires in X%". The <i>topic-gated</i> count is a
        separate context signal: how many prompt concepts significantly trigger the feature.
      </Explain>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-400">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter concepts…"
            className="w-64 rounded-lg border border-edge bg-ink px-3 py-2 text-sm placeholder:text-slate-600"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-400">
            cut · general = top {Math.round((1 - thr) * 100)}% by fire rate
          </span>
          <input
            type="range" min={0} max={0.95} step={0.05} value={thr}
            onChange={(e) => setThr(Number(e.target.value))}
            className="w-64 accent-accent"
          />
        </div>
        <span className="pb-1 text-[11px] text-slate-500">{rows.length} features</span>
      </div>

      <GroupCard
        title="General behaviours"
        hint="appear in a large fraction of responses — pervasive, not topic-bound"
        rows={general}
        open={open}
        setOpen={setOpen}
        elicitation={elicitation}
        examples={examples}
        accent="text-good"
      />
      <GroupCard
        title="Content-bound"
        hint="fire in only a small fraction of responses — niche / tied to a topic"
        rows={bound}
        open={open}
        setOpen={setOpen}
        elicitation={elicitation}
        examples={examples}
        accent="text-slate-400"
      />
    </div>
  );
}

function GroupCard({
  title, hint, rows, open, setOpen, elicitation, examples, accent,
}: {
  title: string;
  hint: string;
  rows: Row[];
  open: number | null;
  setOpen: (f: number | null) => void;
  elicitation: ElicitationData | null;
  examples: Examples | null;
  accent: string;
}) {
  return (
    <Card>
      <h3 className={`text-sm font-semibold ${accent}`}>
        {title} <span className="font-normal text-slate-500">· {rows.length}</span>
      </h3>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">{hint}</p>
      {rows.length === 0 ? (
        <p className="px-1 py-3 text-sm text-slate-500">(none on this side of the cut)</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((r) => (
            <div key={r.feature_id}>
              <GenRow r={r} open={open === r.feature_id} onClick={() =>
                setOpen(open === r.feature_id ? null : r.feature_id)} />
              {open === r.feature_id && (
                <FeatureDrill r={r} elicitation={elicitation} examples={examples} />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GenRow({ r, open, onClick }: { r: Row; open: boolean; onClick: () => void }) {
  const firePct = r.generality * 100; // fraction of responses -> %
  const reward = r.delta_win_rate ?? r.win_assoc;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-edge/40 ${
        open ? "bg-edge/60" : ""
      }`}
    >
      <Chevron size={14} className="shrink-0 text-slate-500" />
      <span className="min-w-0 flex-1">
        <ConceptLabel id={r.feature_id} name={r.concept} wrap className="text-sm text-slate-300" />
      </span>
      <span
        className="hidden h-2 w-24 shrink-0 overflow-hidden rounded-full bg-edge/50 sm:block"
        title={`percentile ${Math.round(r.pct * 100)} by fire rate`}
      >
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(r.pct * 100)}%` }} />
      </span>
      <span
        className="w-24 shrink-0 text-right text-sm tabular-nums text-slate-200"
        title="fraction of responses this behaviour appears in (pervasiveness = generality)"
      >
        fires {firePct < 1 ? firePct.toFixed(2) : firePct.toFixed(1)}%
      </span>
      <span
        className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500"
        title="prompt concepts that SIGNIFICANTLY trigger this feature (topic-gatedness)"
      >
        {r.n_prompt_types ?? 0} topic-gated
      </span>
      <span className="w-8 shrink-0 text-right text-xs" title="win-relevance sign (length-controlled Δwin)">
        {reward == null ? "" : reward > 0 ? <span className="text-good">↑</span> : reward < 0 ? <span className="text-bad">↓</span> : ""}
      </span>
    </button>
  );
}

// drill-in: the prompt concepts this feature is most associated with (co-occurrence lift —
// association, NOT proven elicitation), plus example answers exhibiting it.
function FeatureDrill({
  r, elicitation, examples,
}: {
  r: Row;
  elicitation: ElicitationData | null;
  examples: Examples | null;
}) {
  const assoc = useMemo(() => {
    if (!elicitation) return [];
    const nameOf = new Map(elicitation.prompt_concepts.map((p) => [p.id, p.concept]));
    return elicitation.edges
      .filter((e) => e.cy === r.feature_id && e.l2 > 0)
      .sort((a, b) => b.lift - a.lift)
      .slice(0, 8)
      .map((e) => ({ id: e.px, name: nameOf.get(e.px) ?? null, lift: e.lift, pyx: e.pyx, sig: e.sig }));
  }, [elicitation, r.feature_id]);

  const ex = useMemo(() => {
    const raw = examples?.[String(r.feature_id)] ?? [];
    return raw
      .map((e) => {
        const aSide = e.z >= 0; // A exhibits the feature more when z_diff > 0
        return {
          z: e.z,
          prompt: e.prompt,
          model: aSide ? e.model_a : e.model_b,
          completion: aSide ? e.completion_a : e.completion_b,
        };
      })
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 4);
  }, [examples, r.feature_id]);

  return (
    <div className="mb-2 ml-5 flex flex-col gap-3 border-l border-edge pl-3 pt-1">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Associated prompt concepts <span className="font-normal normal-case">(co-occurrence lift — association, not proven elicitation)</span>
        </h4>
        {assoc.length === 0 ? (
          <p className="py-1 text-xs text-slate-500">No positive-lift prompt concept in the bundle.</p>
        ) : (
          <div className="mt-1 flex flex-col gap-1">
            {assoc.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1">
                  <ConceptLabel id={a.id} name={a.name} wrap className="text-slate-300" />
                </span>
                <span className="tabular-nums text-slate-400">×{a.lift.toFixed(1)} lift</span>
                <span className="tabular-nums text-slate-500">P(fires)={Math.round(a.pyx * 100)}%</span>
                {!a.sig && <span className="text-slate-600">(ns)</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Example answers exhibiting “{conceptLabel(r.feature_id, r.concept)}”
        </h4>
        {ex.length === 0 ? (
          <p className="py-1 text-xs text-slate-500">No examples for this feature in the bundle.</p>
        ) : (
          <div className="mt-1 flex flex-col gap-2">
            {ex.map((it, i) => (
              <div key={i} className="rounded-lg border border-edge bg-ink/40 p-2 text-xs">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-600/25 px-1.5 py-0.5 font-medium text-slate-400">{it.model}</span>
                  <span className="font-mono text-slate-500">activation {it.z >= 0 ? "+" : ""}{it.z.toFixed(2)}</span>
                </div>
                <div className="mb-1 text-slate-400">
                  <span className="font-semibold text-slate-300">prompt:</span> {clip(it.prompt, 240)}
                </div>
                <div className="whitespace-pre-wrap text-slate-300">{clip(it.completion, 1200)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
