import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type {
  BehaviorCategory, ConditionalBundle, ElicitationData, Example, Feature,
} from "../types";
import {
  Card, Explain, ConceptLabel, conceptLabel, ConceptBarRow, Segmented, SkeletonList, clip, divergeColor, WINRATE_REF, VerifiedBadge,
} from "./ui";
import { fmt, pct, useFeatureExamples } from "../data";
import JointEvidence from "./JointEvidence";
import { VirtualList } from "./VirtualList";

// Feature-first hub (master-detail). Left: browse/sort/filter response features. Right:
// the selected feature's fire rate + reward (header, always visible) and three sub-tabs —
// Activated by (feature→prompt), Reward (Δwin by prompt type), Examples. Folds in the old
// Features table, Win relevance, Feature detail, response scopes, and Elicits' feature
// side. Corpus-marginal (aggregated over all models) — per-model lives in Model report.

type Sort = "reward" | "generality" | "fidelity" | "name";
type SubTab = "activated" | "reward" | "examples";

export default function FeaturePanel({
  features,
  elicitation,
  conditional,
  lensInputRep,
  hasLabels = true,
  focus,
  onJumpPrompt,
}: {
  features: Feature[];
  elicitation: ElicitationData | null;
  conditional: ConditionalBundle | null;
  lensInputRep?: string | null;
  hasLabels?: boolean;
  focus?: { cf: number } | null;
  onJumpPrompt?: (pc: number) => void;
}) {
  const cond = conditional?.raw ?? null;
  const [query, setQuery] = useState("");
  // no preference labels → no reward signal; default-sort by pervasiveness instead.
  const [sortBy, setSortBy] = useState<Sort>(hasLabels ? "reward" : "generality");
  const [category, setCategory] = useState<"" | BehaviorCategory>("");
  // verified features are the only ones with elicitation/conditional data, so default to
  // them — otherwise browsing lands on unverified features with empty sub-tabs. But if the
  // bundle was never verified at all, defaulting to true would render an EMPTY list.
  const anyVerified = useMemo(() => features.some((f) => f.fidelity_pass), [features]);
  const [verifiedOnly, setVerifiedOnly] = useState(anyVerified);
  const [sel, setSel] = useState<number | null>(null);
  const [sub, setSub] = useState<SubTab>("activated");

  const hasContextClassification = useMemo(
    () => features.some((f) => f.behavior_category != null), [features]);
  useEffect(() => {
    if (!hasContextClassification && category !== "" && category !== "unclassified") {
      setCategory("");
    }
  }, [hasContextClassification, category]);

  const named = useMemo(() => features.filter((f) => f.concept && f.concept.trim() !== ""), [features]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r = named.filter((f) => !q || (f.concept ?? "").toLowerCase().includes(q));
    if (verifiedOnly) r = r.filter((f) => f.fidelity_pass);
    if (category) r = r.filter((f) =>
      (f.behavior_category ?? "unclassified") === category);
    const rew = (f: Feature) => f.delta_win_rate ?? f.win_assoc ?? 0;
    return [...r].sort((a, b) => {
      if (sortBy === "reward") return Math.abs(rew(b)) - Math.abs(rew(a));
      if (sortBy === "generality") return (b.generality ?? -1) - (a.generality ?? -1);
      if (sortBy === "fidelity") return Number(b.fidelity_pass ?? false) - Number(a.fidelity_pass ?? false) || Math.abs(rew(b)) - Math.abs(rew(a));
      return (a.concept ?? "").localeCompare(b.concept ?? "");
    });
  }, [named, query, category, verifiedOnly, sortBy]);

  // default / cross-tab focus selection
  const handledFocus = useRef<unknown>(null);
  useEffect(() => {
    if (focus && handledFocus.current !== focus) { setSel(focus.cf); handledFocus.current = focus; }
    // default to the first VERIFIED feature — only verified axes carry elicitation /
    // conditional data, so opening on an unverified one would show empty sub-tabs.
    else if (sel == null && rows.length) setSel((rows.find((f) => f.fidelity_pass) ?? rows[0]).feature_id);
  }, [focus, rows, sel]);

  const feat = features.find((f) => f.feature_id === sel) ?? null;
  const selectionHidden = sel != null && !rows.some((f) => f.feature_id === sel);
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
        Browse by <b>response feature</b> (a sparse pattern the SAE found). Pick one to see how
        often it fires, which prompts activate it,{hasLabels && <> how much humans reward it
        (Δwin in <b>pp</b> = percentage points of win rate, length-controlled), and where it
        helps or hurts winning,</>} with example answers. This is the corpus-wide view; per-model
        model-specific tendencies are in <i>Model report</i>.
      </Explain>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* master list */}
        <Card className="h-fit lg:sticky lg:top-4">
          <div className="grid gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">Search response concepts</span>
              <span className="relative block">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="filter response features…"
                  className="w-full rounded-lg border border-edge bg-ink py-2 pl-8 pr-2 text-sm outline-none placeholder:text-slate-600 focus:border-accent/60" />
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">Sort by</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as Sort)}
                  className="w-full rounded-lg border border-edge bg-ink px-2 py-2 text-xs text-slate-300 outline-none focus:border-accent/60">
                  {hasLabels && <option value="reward">Reward effect</option>}
                  <option value="generality">Fire rate</option>
                  <option value="fidelity">Fidelity</option>
                  <option value="name">Name</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">Category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value as "" | BehaviorCategory)}
                  className="w-full rounded-lg border border-edge bg-ink px-2 py-2 text-xs text-slate-300 outline-none focus:border-accent/60">
                  <option value="">All</option>
                  {hasContextClassification ? <>
                    <option value="general">General</option>
                    <option value="context_specific">Context-specific</option>
                    <option value="prompt_content">Prompt/content</option>
                  </> : null}
                  <option value="unclassified">Unclassified</option>
                </select>
              </label>
            </div>
            {!hasContextClassification && <p className="text-[10px] text-amber-400/80">
              No semantic/context profile; features are unclassified.
            </p>}
            <label className="flex items-start gap-2 rounded-lg bg-ink/35 p-2 text-[11px] leading-snug text-slate-400">
              <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="mt-0.5 accent-accent" />
              <span><b className="font-medium text-slate-300">Verified labels only</b><br />Unverified features do not have prompt or reward relationships.</span>
            </label>
            <div className="flex items-center justify-between border-t border-edge/60 pt-2 text-[11px] text-slate-500">
              <span>{rows.length.toLocaleString()} of {named.length.toLocaleString()} response concepts</span>
              {(query || category || verifiedOnly !== anyVerified) && <button onClick={() => { setQuery(""); setCategory(""); setVerifiedOnly(anyVerified); }} className="text-accent hover:text-accent/80">Reset filters</button>}
            </div>
          </div>
          {selectionHidden && (
            <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-2 text-[11px] leading-snug text-amber-200/80">
              Your selected response concept is hidden by the filters; its details remain open.
            </div>
          )}
          <div className="mt-3 border-t border-edge/60 pt-2 pr-1">
            <VirtualList
              items={rows}
              rowHeight={58}
              height={Math.round(typeof window === "undefined" ? 520 : window.innerHeight * 0.58)}
              emptyMessage="No feature matches."
              renderRow={(f) => {
              const rew = f.delta_win_rate ?? f.win_assoc ?? 0;
              const rsig = f.delta_win_significant ?? f.win_significant ?? false;
              return (
                <button onClick={() => setSel(f.feature_id)}
                  className={`flex h-full w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    sel === f.feature_id ? "bg-accent/20 text-slate-100" : "text-slate-300 hover:bg-edge/40"}`}>
                  {!verifiedOnly && (
                    <span className="shrink-0 text-xs" title={f.fidelity_pass ? "verified" : "not verified"}>
                      {f.fidelity_pass ? <span className="text-good">✓</span> : <span className="text-slate-600">·</span>}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block overflow-hidden" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      <ConceptLabel id={f.feature_id} name={f.concept} wrap />
                    </span>
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
            }}
            />
            {hasLabels && <p className="px-2 pt-1 text-[10px] text-slate-600">* = not statistically significant</p>}
          </div>
        </Card>

        {/* detail */}
        {!feat ? <Card>Pick a feature.</Card> : (
          <div className="min-w-0 flex flex-col gap-4">
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
              <p className="mt-2 text-[11px] text-slate-500">
                category: <span className="text-slate-300">{
                  (feat.behavior_category ?? "unclassified").replace(/_/g, " ")
                }</span>
                {feat.presence_pass
                  ? <> · semantic presence calibrated (precision LCB {feat.precision_lcb != null ? feat.precision_lcb.toFixed(2) : "—"})</>
                  : <> · nonzero activations are not calibrated as semantic presence</>}
              </p>
              {feat.behavior && <p className="mt-2 text-[11px] text-slate-500">cluster: {feat.behavior}</p>}
            </Card>

            <Segmented value={activeSub} onChange={(v) => setSub(v)}
              options={subTabs.map(([v, lbl]) => ({ value: v, label: lbl }))} />

            {activeSub === "activated" && <ActivatedBy elicitation={elicitation} fid={feat.feature_id} responseName={feat.concept} unverified={!feat.fidelity_pass} onJumpPrompt={onJumpPrompt} />}
            {activeSub === "reward" && <RewardByPrompt cond={cond} fid={feat.feature_id} responseName={feat.concept} overall={feat.delta_win_rate} unverified={!feat.fidelity_pass} onJumpPrompt={onJumpPrompt} />}
            {activeSub === "examples" && <FeatureExamples items={exItems} concept={conceptLabel(feat.feature_id, feat.concept)}
              contrastOnly={lensInputRep === "difference" || lensInputRep === "individual"} />}
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
    "verifier-vs-feature correlation on held-out pairs — one input to the configured multi-part pass rule");
  add("agreement", num(f.agreement), "raw verifier/feature agreement rate");
  if (!chips.length) return null;
  return (
    <div className="mt-3 border-t border-edge/60 pt-2">
      <p className="mb-1.5 text-[11px] text-slate-500">
        <span className="uppercase tracking-wider">verification</span>
        {f.fidelity_n != null && <> — an LLM verifier re-judged {f.fidelity_n} held-out pairs against this label</>}
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

function ActivatedBy({ elicitation, fid, responseName, unverified, onJumpPrompt }: {
  elicitation: ElicitationData | null;
  fid: number;
  responseName: string | null | undefined;
  unverified?: boolean;
  onJumpPrompt?: (pc: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const rows = useMemo(() => {
    if (!elicitation) return [];
    const nameOf = new Map(elicitation.prompt_concepts.map((p) => [p.id, p.concept]));
    const edges = elicitation.edges.filter((e) => e.cy === fid && e.l2 > 0 && (showAll || e.sig)).sort((a, b) => b.lift - a.lift).slice(0, 16);
    const maxL2 = Math.max(0.5, ...edges.map((e) => e.l2));
    return edges.map((e) => ({ id: e.px, name: nameOf.get(e.px) ?? null, lift: e.lift,
      pyx: e.pyx, sig: e.sig, nx: e.nx, nco: e.nco, w: e.l2 / maxL2 }));
  }, [elicitation, fid, showAll]);
  useEffect(() => { setSelected(null); }, [fid]);
  useEffect(() => {
    if (selected == null || !rows.some((r) => r.id === selected))
      setSelected(rows[0]?.id ?? null);
  }, [rows, selected]);
  const active = rows.find((r) => r.id === selected) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <Card>
      <h4 className="text-sm font-semibold text-slate-200">Activated by these prompts</h4>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">Prompt concepts whose presence raises this feature's firing. Select one to inspect a concrete prompt and response carrying both concepts.</p>
      {elicitation && elicitation.edges.some((e) => e.cy === fid && e.l2 > 0 && !e.sig) && (
        <label className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-accent" />
          show non-significant estimates
        </label>
      )}
      {rows.length === 0 ? <p className="px-1 py-3 text-sm text-slate-500">
        {unverified ? "This feature hasn't passed verification — prompt-association analysis only runs on verified features."
          : "No specific prompt raises this feature above its base rate (it fires broadly)."}</p> :
        rows.map((r) => <ConceptBarRow key={r.id} id={r.id} name={r.name} value={`×${r.lift.toFixed(1)}`}
          title={`lift ×${r.lift.toFixed(2)} · fires ${pct(r.pyx, 0)}${r.sig ? "" : " (ns)"}`}
          detail={`${r.nco.toLocaleString()} co-occurrences · ${r.nx.toLocaleString()} prompt activations`}
          width={r.w} color="rgba(96,165,250,0.85)" dim={!r.sig}
          selected={selected === r.id} onClick={() => setSelected(r.id)} />)}
      </Card>
      {active && <JointEvidence promptFeature={active.id} responseFeature={fid}
        promptName={active.name} responseName={responseName} kind="elicitation"
        onOpenPrompt={onJumpPrompt ? () => onJumpPrompt(active.id) : undefined} />}
    </div>
  );
}

function RewardByPrompt({ cond, fid, responseName, overall, unverified, onJumpPrompt }: {
  cond: import("../types").ConditionalData | null;
  fid: number;
  responseName: string | null | undefined;
  overall?: number;
  unverified?: boolean;
  onJumpPrompt?: (pc: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const rows = useMemo(() => {
    if (!cond) return [];
    const nameOf = new Map(cond.prompt_concepts.map((p) => [p.id, p.name]));
    const cells = cond.cells.filter((c) => c.f === fid && (showAll || c.sig)).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 16);
    const maxD = Math.max(0.02, ...cells.map((c) => Math.abs(c.delta)));
    return cells.map((c) => ({ id: c.pc, name: nameOf.get(c.pc) ?? null, delta: c.delta, sig: c.sig,
      n: c.n ?? null, nf: c.nf ?? null, w: Math.abs(c.delta) / maxD }));
  }, [cond, fid, showAll]);
  useEffect(() => { setSelected(null); }, [fid]);
  useEffect(() => {
    if (selected == null || !rows.some((r) => r.id === selected))
      setSelected(rows[0]?.id ?? null);
  }, [rows, selected]);
  const active = rows.find((r) => r.id === selected) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <Card>
      <h4 className="text-sm font-semibold text-slate-200">Reward by prompt type</h4>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">
        Δwin-rate from producing this feature, within each prompt type (length-controlled).
        {overall != null && <> Overall: <span className="text-slate-300">{overall >= 0 ? "+" : ""}{(overall * 100).toFixed(0)}pp</span>.</>} Faded = not significant.
      </p>
      {cond && cond.cells.some((c) => c.f === fid && !c.sig) && (
        <label className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-accent" />
          show non-significant estimates
        </label>
      )}
      {rows.length === 0 ? <p className="px-1 py-3 text-sm text-slate-500">
        {!cond ? "No conditional win data in this bundle."
          : unverified ? "This feature hasn't passed verification — per-prompt-type reward only runs on verified features."
          : "No prompt-type reward data for this feature."}</p> :
        rows.map((r) => (
          <ConceptBarRow key={r.id} id={r.id} name={r.name} value={`${r.delta >= 0 ? "+" : ""}${Math.round(r.delta * 100)}pp`}
            title={`Δwin ${(r.delta * 100).toFixed(1)}pp${r.sig ? " (significant)" : " (ns)"}`}
            detail={r.nf != null ? `${r.nf.toLocaleString()} fires / ${(r.n ?? 0).toLocaleString()} battles` : r.n != null ? `${r.n.toLocaleString()} battles` : undefined}
            width={r.w} color={divergeColor(r.delta, WINRATE_REF)} dim={!r.sig}
            selected={selected === r.id} onClick={() => setSelected(r.id)} />
        ))}
      </Card>
      {active && <JointEvidence promptFeature={active.id} responseFeature={fid}
        promptName={active.name} responseName={responseName} kind="preference"
        onOpenPrompt={onJumpPrompt ? () => onJumpPrompt(active.id) : undefined} />}
    </div>
  );
}

function FeatureExamples({ items: raw, concept, contrastOnly }: {
  items: Example[] | null | undefined;
  concept: string;
  contrastOnly?: boolean;
}) {
  // Single-response data has no second answer, so there is no side to choose and no
  // contrast to report: the activation is simply the concept's strength on that response.
  const paired = useMemo(
    () => (raw ?? []).some((e) => Boolean(e.completion_b)),
    [raw],
  );
  const items = useMemo(() => {
    return (raw ?? []).map((e) => {
      const aSide = e.z >= 0; // A exhibits the feature more when z_diff > 0
      return {
        z: e.z,
        prompt: e.prompt,
        model: paired ? (aSide ? e.model_a : e.model_b) : "",
        completion: paired ? (aSide ? e.completion_a : e.completion_b) : e.completion_a,
      };
    }).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 12);
  }, [raw, paired]);
  const clipC = (s: string, n = 1400) => (s.length > n ? s.slice(0, n) + " …[truncated]" : s);
  const loading = raw === undefined;
  if (loading)
    return (
      <Card>
        <h4 className="mb-2 text-sm font-semibold text-slate-200">Strongest examples of “{concept}”</h4>
        <SkeletonList n={3} itemClass="h-24" />
      </Card>
    );
  return (
    <Card>
      <h4 className="text-sm font-semibold text-slate-200">{paired ? `Examples with strongest contrast on “${concept}”` : `Strongest examples of “${concept}”`}</h4>
      {contrastOnly && paired && (
        <p className="mt-1 text-[11px] leading-relaxed text-amber-300/80">
          Selected by relative axis contrast: this side scores above the paired answer. That
          alone does not prove positive-pole concept presence.
        </p>
      )}
      {items.length === 0 ? <p className="mt-1 px-1 py-3 text-xs text-slate-500">No examples for this feature in the bundle.</p> : (
        <div className="mt-2 flex flex-col gap-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-lg border border-edge bg-ink/40 p-2 text-xs">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {it.model && (
                  <span className="rounded bg-slate-600/25 px-1.5 py-0.5 font-medium text-slate-400">{it.model}</span>
                )}
                <span className="font-mono text-slate-500"
                  title={paired ? "signed A-minus-B feature-axis contrast" : "activation on this response"}>
                  {paired
                    ? `pairwise contrast ${it.z >= 0 ? "+" : ""}${it.z.toFixed(2)}`
                    : `activation ${it.z.toFixed(2)}`}
                </span>
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
