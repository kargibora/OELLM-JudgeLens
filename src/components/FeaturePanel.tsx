import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type {
  ConditionalBundle, ElicitationData, Example, Feature,
} from "../types";
import {
  Card, Explain, ConceptLabel, conceptLabel, ConceptBarRow, Segmented, SkeletonList, clip, divergeColor, WINRATE_REF, VerifiedBadge,
} from "./ui";
import { fmt, pct, useFeatureExamples } from "../data";

// Feature-first hub (master-detail). Left: browse/sort/filter response features. Right:
// the selected feature's fire rate + reward (header, always visible) and three sub-tabs —
// Activated by (feature→prompt), Reward (Δwin by prompt type), Examples. Folds in the old
// Features table, Win relevance, Feature detail, General behaviours, and Elicits' feature
// side. Corpus-marginal (aggregated over all models) — per-model lives in Model report.

type Sort = "reward" | "generality" | "fidelity" | "name";
type SubTab = "activated" | "reward" | "examples";

export default function FeaturePanel({
  features,
  elicitation,
  conditional,
  hasLabels = true,
  focus,
  onJumpPrompt,
}: {
  features: Feature[];
  elicitation: ElicitationData | null;
  conditional: ConditionalBundle | null;
  hasLabels?: boolean;
  focus?: { cf: number } | null;
  onJumpPrompt?: (pc: number) => void;
}) {
  const cond = conditional?.raw ?? null;
  const [query, setQuery] = useState("");
  // no preference labels → no reward signal; default-sort by pervasiveness instead.
  const [sortBy, setSortBy] = useState<Sort>(hasLabels ? "reward" : "generality");
  const [onlyGeneral, setOnlyGeneral] = useState<"" | "general" | "content">("");
  // verified features are the only ones with elicitation/conditional data, so default to
  // them — otherwise browsing lands on unverified features with empty sub-tabs. But if the
  // bundle was never verified at all, defaulting to true would render an EMPTY list.
  const anyVerified = useMemo(() => features.some((f) => f.fidelity_pass), [features]);
  const [verifiedOnly, setVerifiedOnly] = useState(anyVerified);
  const [sel, setSel] = useState<number | null>(null);
  const [sub, setSub] = useState<SubTab>("activated");

  // percentile of generality (fire rate) for the general↔content-bound filter
  const genPct = useMemo(() => {
    const vals = features.map((f) => f.generality).filter((g): g is number => g != null).sort((a, b) => a - b);
    const rank = (g: number) => {
      let lo = 0, hi = vals.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < g) lo = m + 1; else hi = m; }
      return vals.length > 1 ? lo / (vals.length - 1) : 1;
    };
    return rank;
  }, [features]);

  const named = useMemo(() => features.filter((f) => f.concept && f.concept.trim() !== ""), [features]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r = named.filter((f) => !q || (f.concept ?? "").toLowerCase().includes(q));
    if (verifiedOnly) r = r.filter((f) => f.fidelity_pass);
    if (onlyGeneral) r = r.filter((f) => {
      if (f.generality == null) return false;
      const p = genPct(f.generality);
      return onlyGeneral === "general" ? p >= 0.6 : p < 0.6;
    });
    const rew = (f: Feature) => f.delta_win_rate ?? f.win_assoc ?? 0;
    return [...r].sort((a, b) => {
      if (sortBy === "reward") return Math.abs(rew(b)) - Math.abs(rew(a));
      if (sortBy === "generality") return (b.generality ?? -1) - (a.generality ?? -1);
      if (sortBy === "fidelity") return Number(b.fidelity_pass ?? false) - Number(a.fidelity_pass ?? false) || Math.abs(rew(b)) - Math.abs(rew(a));
      return (a.concept ?? "").localeCompare(b.concept ?? "");
    });
  }, [named, query, onlyGeneral, verifiedOnly, sortBy, genPct]);

  // default / cross-tab focus selection
  const handledFocus = useRef<unknown>(null);
  useEffect(() => {
    if (focus && handledFocus.current !== focus) { setSel(focus.cf); handledFocus.current = focus; }
    // default to the first VERIFIED feature — only verified axes carry elicitation /
    // conditional data, so opening on an unverified one would show empty sub-tabs.
    else if (sel == null && rows.length) setSel((rows.find((f) => f.fidelity_pass) ?? rows[0]).feature_id);
  }, [focus, rows, sel]);

  const feat = features.find((f) => f.feature_id === sel) ?? null;
  const exItems = useFeatureExamples(sel); // lazy per-feature shard, cached

  // Activated-by / Reward-by-prompt are pipeline-gated to VERIFIED features, so they're
  // always empty for unverified ones — show only Examples there (no dead-click tabs).
  const subTabs = useMemo<[SubTab, string][]>(() => {
    const all: [SubTab, string][] = [
      ["activated", "Activated by"], ["reward", "Reward by prompt"], ["examples", "Examples"],
    ];
    return all.filter(([v]) => {
      if (v === "examples") return true;
      if (!feat?.fidelity_pass) return false;
      if (v === "reward") return hasLabels;
      return true;
    });
  }, [feat, hasLabels]);
  // derived so the active tab is always valid for the current feature (→ Examples).
  const activeSub: SubTab = subTabs.some(([v]) => v === sub) ? sub : "examples";

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        Browse by <b>response feature</b> (a behaviour the SAE found). Pick one to see how
        often it fires, which prompts activate it,{hasLabels && <> how much humans reward it
        (Δwin in <b>pp</b> = percentage points of win rate, length-controlled), and where it
        helps or hurts winning,</>} with example answers. This is the corpus-wide view; per-model
        behaviour is in <i>Model report</i>.
      </Explain>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* master list */}
        <div className="relative">
        <Card className="max-h-[74vh] overflow-y-auto">
          {/* controls stay visible while the 100+-row list scrolls under them */}
          <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-1 border-b border-edge/60 bg-panel/95 px-4 pb-2 pt-4 backdrop-blur">
          <div className="mb-2 flex items-center gap-2">
            <Search size={14} className="text-slate-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="filter features…"
              className="w-full rounded-lg border border-edge bg-ink px-2 py-1.5 text-sm placeholder:text-slate-600" />
          </div>
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            sort:
            <Segmented size="xs" value={sortBy} onChange={(v) => setSortBy(v)}
              options={(hasLabels
                ? [{ value: "reward", label: "reward" }, { value: "generality", label: "fire rate" }, { value: "fidelity", label: "fidelity" }, { value: "name", label: "name" }]
                : [{ value: "generality", label: "fire rate" }, { value: "fidelity", label: "fidelity" }, { value: "name", label: "name" }]) as { value: Sort; label: string }[]} />
          </div>
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            show:
            <Segmented size="xs" value={onlyGeneral} onChange={(v) => setOnlyGeneral(v)}
              options={[{ value: "", label: "all" }, { value: "general", label: "general" }, { value: "content", label: "content-bound" }] as { value: "" | "general" | "content"; label: string }[]} />
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="accent-accent" />
            verified only <span className="text-slate-600">(unverified features have no prompt/reward data)</span>
          </label>
          </div>
          <div className="flex flex-col">
            {rows.map((f) => {
              const rew = f.delta_win_rate ?? f.win_assoc ?? 0;
              const rsig = f.delta_win_significant ?? f.win_significant ?? false;
              return (
                <button key={f.feature_id} onClick={() => setSel(f.feature_id)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    sel === f.feature_id ? "bg-accent/20 text-slate-100" : "text-slate-300 hover:bg-edge/40"}`}>
                  {!verifiedOnly && (
                    <span className="shrink-0 text-xs" title={f.fidelity_pass ? "verified" : "not verified"}>
                      {f.fidelity_pass ? <span className="text-good">✓</span> : <span className="text-slate-600">·</span>}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <ConceptLabel id={f.feature_id} name={f.concept} wrap />
                    <span className="block text-[10px] tabular-nums text-slate-600" title="fire rate: % of responses this feature appears in">
                      fires {f.generality != null ? `${(f.generality * 100).toFixed(f.generality < 0.01 ? 1 : 0)}%` : "—"}
                    </span>
                  </span>
                  {hasLabels && (
                    <>
                      {/* bar and its number are the SAME quantity (reward), same normalization */}
                      <span className={`hidden h-2 w-16 shrink-0 overflow-hidden rounded-full bg-edge/40 sm:block ${rsig ? "" : "opacity-40"}`}
                        title={`reward ${fmt(rew, 2)}${rsig ? "" : " (not significant)"}`}>
                        <span className="block h-full rounded-full" style={{ width: `${Math.round(Math.min(1, Math.abs(rew) / WINRATE_REF) * 100)}%`, background: divergeColor(rew, WINRATE_REF) }} />
                      </span>
                      <span className={`w-12 shrink-0 text-right text-[11px] tabular-nums ${rsig ? "text-slate-400" : "text-slate-600"}`}
                        title={rsig ? "length-controlled Δwin-rate" : "length-controlled Δwin-rate — not significant"}>
                        {rew >= 0 ? "+" : ""}{Math.round(rew * 100)}pp{rsig ? "" : "*"}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
            {rows.length === 0 && <p className="px-1 py-3 text-sm text-slate-500">No feature matches.</p>}
            {hasLabels && <p className="px-2 pt-1 text-[10px] text-slate-600">* = not statistically significant</p>}
          </div>
        </Card>
        {/* bottom fade: signals there's more list below the rounded edge */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-2xl bg-gradient-to-t from-panel to-transparent" />
        </div>

        {/* detail */}
        {!feat ? <Card>Pick a feature.</Card> : (
          <div className="flex flex-col gap-4">
            <Card>
              <h3 className="text-lg font-semibold leading-snug text-slate-100">
                <ConceptLabel id={feat.feature_id} name={feat.concept} wrap />
                <span className="ml-2 whitespace-nowrap rounded bg-edge/60 px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal text-slate-500">
                  f{feat.feature_id}
                </span>
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <Stat label="fire rate" value={feat.generality != null ? pct(feat.generality, feat.generality < 0.01 ? 1 : 0) : "—"}
                  sub="% of responses it appears in" />
                {hasLabels && (() => {
                  const rsig = feat.delta_win_significant ?? feat.win_significant ?? false;
                  return (
                    <Stat label="reward (Δwin)"
                      value={feat.delta_win_rate != null ? `${feat.delta_win_rate >= 0 ? "+" : ""}${(feat.delta_win_rate * 100).toFixed(0)}pp${rsig ? "" : " (ns)"}` : "—"}
                      sub={rsig ? `win-assoc ${fmt(feat.win_assoc, 2)}` : "not statistically significant"}
                      tone={rsig ? feat.delta_win_rate : null} />
                  );
                })()}
                <Stat label="prompt types" value={feat.n_prompt_types != null ? String(feat.n_prompt_types) : "—"} sub="sig. elicitors" />
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">fidelity</div>
                  <div className="mt-0.5"><VerifiedBadge pass={feat.fidelity_pass} n={feat.fidelity_n} /></div>
                </div>
              </div>
              <FidelityMetrics f={feat} />
              {feat.behavior && <p className="mt-2 text-[11px] text-slate-500">cluster: {feat.behavior}</p>}
            </Card>

            <Segmented value={activeSub} onChange={(v) => setSub(v)}
              options={subTabs.map(([v, lbl]) => ({ value: v, label: lbl }))} />

            {activeSub === "activated" && <ActivatedBy elicitation={elicitation} fid={feat.feature_id} unverified={!feat.fidelity_pass} onJumpPrompt={onJumpPrompt} />}
            {activeSub === "reward" && <RewardByPrompt cond={cond} fid={feat.feature_id} overall={feat.delta_win_rate} unverified={!feat.fidelity_pass} onJumpPrompt={onJumpPrompt} />}
            {activeSub === "examples" && <FeatureExamples items={exItems} concept={conceptLabel(feat.feature_id, feat.concept)} />}
          </div>
        )}
      </div>
    </div>
  );
}

// held-out verification metrics, as scannable label/value chips. Shown for any tested
// feature — verified OR not — so a failed axis reveals WHY it failed. The pass gate is
// |corr| ≥ 0.3 with Bonferroni p < 0.05, so the corr chip is tinted by that gate.
// `n` is deliberately NOT repeated here — the VerifiedBadge above already shows it.
function FidelityMetrics({ f }: { f: Feature }) {
  const num = (x?: number, d = 2) => (x == null || Number.isNaN(x) ? null : x.toFixed(d));
  const chips: { k: string; v: string; tip: string; tone?: "good" | "bad" }[] = [];
  const add = (k: string, v: string | null, tip: string, tone?: "good" | "bad") => {
    if (v != null) chips.push({ k, v, tip, tone });
  };
  add("F1", num(f.f1), "harmonic mean of precision and recall on the held-out pairs");
  add("precision", num(f.precision), "when the verifier said 'label present', how often the feature fired");
  add("recall", num(f.recall), "of the pairs where the feature fired, how many the verifier confirmed");
  add("FP rate", num(f.fp_rate), "how often the verifier saw the label in pairs where the feature was silent");
  add("corr", num(f.correlation),
    "verifier-vs-feature correlation on held-out pairs — the PASS GATE is |corr| ≥ 0.3 (Bonferroni p < 0.05)",
    f.correlation != null ? (Math.abs(f.correlation) >= 0.3 ? "good" : "bad") : undefined);
  add("agreement", num(f.agreement), "raw verifier/feature agreement rate");
  if (!chips.length) return null;
  return (
    <div className="mt-3 border-t border-edge/60 pt-2">
      <p className="mb-1.5 text-[11px] text-slate-500">
        <span className="uppercase tracking-wider">verification</span>
        {f.fidelity_n != null && <> — an independent LLM re-judged {f.fidelity_n} held-out pairs against this label</>}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map(({ k, v, tip, tone }) => (
          <span key={k} title={tip}
            className="rounded-md border border-edge/60 bg-ink/50 px-1.5 py-0.5 text-[11px] text-slate-400">
            {k}{" "}
            <b className={`tabular-nums ${tone === "good" ? "text-good" : tone === "bad" ? "text-amber-400" : "text-slate-200"}`}>
              {v}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number | null }) {
  const color = tone == null ? "text-slate-100" : tone > 0 ? "text-good" : tone < 0 ? "text-bad" : "text-slate-100";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function ActivatedBy({ elicitation, fid, unverified, onJumpPrompt }: { elicitation: ElicitationData | null; fid: number; unverified?: boolean; onJumpPrompt?: (pc: number) => void }) {
  const rows = useMemo(() => {
    if (!elicitation) return [];
    const nameOf = new Map(elicitation.prompt_concepts.map((p) => [p.id, p.concept]));
    const edges = elicitation.edges.filter((e) => e.cy === fid && e.l2 > 0).sort((a, b) => b.lift - a.lift).slice(0, 16);
    const maxL2 = Math.max(0.5, ...edges.map((e) => e.l2));
    return edges.map((e) => ({ id: e.px, name: nameOf.get(e.px) ?? null, lift: e.lift, pyx: e.pyx, sig: e.sig, w: e.l2 / maxL2 }));
  }, [elicitation, fid]);
  return (
    <Card>
      <h4 className="text-sm font-semibold text-slate-200">Activated by these prompts</h4>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">prompt concepts whose presence raises this feature's firing (lift = P(fires | prompt) / base rate)</p>
      {rows.length === 0 ? <p className="px-1 py-3 text-sm text-slate-500">
        {unverified ? "This feature hasn't passed verification — prompt-association analysis only runs on verified features."
          : "No specific prompt raises this feature above its base rate (it fires broadly)."}</p> :
        rows.map((r) => <ConceptBarRow key={r.id} id={r.id} name={r.name} value={`×${r.lift.toFixed(1)}`}
          title={`lift ×${r.lift.toFixed(2)} · fires ${pct(r.pyx, 0)}${r.sig ? "" : " (ns)"}`}
          width={r.w} color="rgba(96,165,250,0.85)" dim={!r.sig} onClick={onJumpPrompt ? () => onJumpPrompt(r.id) : undefined} />)}
    </Card>
  );
}

function RewardByPrompt({ cond, fid, overall, unverified, onJumpPrompt }: {
  cond: import("../types").ConditionalData | null; fid: number; overall?: number; unverified?: boolean; onJumpPrompt?: (pc: number) => void;
}) {
  const rows = useMemo(() => {
    if (!cond) return [];
    const nameOf = new Map(cond.prompt_concepts.map((p) => [p.id, p.name]));
    const cells = cond.cells.filter((c) => c.f === fid).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 16);
    const maxD = Math.max(0.02, ...cells.map((c) => Math.abs(c.delta)));
    return cells.map((c) => ({ id: c.pc, name: nameOf.get(c.pc) ?? null, delta: c.delta, sig: c.sig, w: Math.abs(c.delta) / maxD }));
  }, [cond, fid]);
  return (
    <Card>
      <h4 className="text-sm font-semibold text-slate-200">Reward by prompt type</h4>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">
        Δwin-rate from producing this feature, within each prompt type (length-controlled).
        {overall != null && <> Overall: <span className="text-slate-300">{overall >= 0 ? "+" : ""}{(overall * 100).toFixed(0)}pp</span>.</>} Faded = not significant.
      </p>
      {rows.length === 0 ? <p className="px-1 py-3 text-sm text-slate-500">
        {!cond ? "No conditional win data in this bundle."
          : unverified ? "This feature hasn't passed verification — per-prompt-type reward only runs on verified features."
          : "No prompt-type reward data for this feature."}</p> :
        rows.map((r) => (
          <ConceptBarRow key={r.id} id={r.id} name={r.name} value={`${r.delta >= 0 ? "+" : ""}${Math.round(r.delta * 100)}pp`}
            title={`Δwin ${(r.delta * 100).toFixed(1)}pp${r.sig ? " (significant)" : " (ns)"}`}
            width={r.w} color={divergeColor(r.delta, WINRATE_REF)} dim={!r.sig} onClick={onJumpPrompt ? () => onJumpPrompt(r.id) : undefined} />
        ))}
    </Card>
  );
}

function FeatureExamples({ items: raw, concept }: { items: Example[] | null | undefined; concept: string }) {
  const items = useMemo(() => {
    return (raw ?? []).map((e) => {
      const aSide = e.z >= 0; // A exhibits the feature more when z_diff > 0
      return { z: e.z, prompt: e.prompt, model: aSide ? e.model_a : e.model_b, completion: aSide ? e.completion_a : e.completion_b };
    }).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 12);
  }, [raw]);
  const clipC = (s: string, n = 1400) => (s.length > n ? s.slice(0, n) + " …[truncated]" : s);
  const loading = raw === undefined;
  if (loading)
    return (
      <Card>
        <h4 className="mb-2 text-sm font-semibold text-slate-200">Example answers exhibiting “{concept}”</h4>
        <SkeletonList n={3} itemClass="h-24" />
      </Card>
    );
  return (
    <Card>
      <h4 className="text-sm font-semibold text-slate-200">Example answers exhibiting “{concept}”</h4>
      {items.length === 0 ? <p className="mt-1 px-1 py-3 text-xs text-slate-500">No examples for this feature in the bundle.</p> : (
        <div className="mt-2 flex flex-col gap-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-lg border border-edge bg-ink/40 p-2 text-xs">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-600/25 px-1.5 py-0.5 font-medium text-slate-400">{it.model}</span>
                <span className="font-mono text-slate-500">activation {it.z >= 0 ? "+" : ""}{it.z.toFixed(2)}</span>
              </div>
              <div className="mb-1 text-slate-400"><span className="font-semibold text-slate-300">prompt:</span> {clip(it.prompt, 260)}</div>
              <div className="whitespace-pre-wrap text-slate-300">{clipC(it.completion)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
