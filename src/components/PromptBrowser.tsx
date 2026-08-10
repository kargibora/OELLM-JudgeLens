import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Coactivation, ConditionalBundle, ConditionalData, ElicitationData, PromptFeatures, ReportBattles } from "../types";
import { Card, Explain, ConceptLabel, conceptLabel, ConceptBarRow, Segmented, clip, divergeColor, WINRATE_REF } from "./ui";
import { pct, usePromptExamples } from "../data";
import JointEvidence from "./JointEvidence";

// Prompt-first browser: pick a prompt concept and read, on one page, what responses it
// tends to elicit (co-activation lift) and which of those actually help win it (the
// length-controlled Δwin-rate within that prompt type), plus example prompts + outcomes.
// Replaces the dense feature×prompt heatmap.

type PC = { id: number; name: string | null; n: number | null; maxAbsDelta: number };

export default function PromptBrowser({
  conditional,
  elicitation,
  reportBattles,
  canLoadExamples = false,
  onLoadExamples,
  promptFeatures,
  coactivation,
  hasLabels = true,
  focus,
  onJumpFeature,
}: {
  conditional: ConditionalBundle | null;
  elicitation: ElicitationData | null;
  // undefined = optional large artifact has not been requested; null = unavailable.
  reportBattles: ReportBattles | null | undefined;
  canLoadExamples?: boolean;
  onLoadExamples?: () => void;
  promptFeatures: PromptFeatures | null;
  coactivation: Coactivation | null;
  hasLabels?: boolean;
  focus?: { pc: number } | null;
  onJumpFeature?: (cf: number) => void;
}) {
  const [showCompound, setShowCompound] = useState(false);
  const [keyspace, setKeyspace] = useState<"raw" | "clustered">("raw");
  const cond = keyspace === "clustered" ? conditional?.clustered ?? null : conditional?.raw ?? null;
  const clustered = keyspace === "clustered";
  // prompt-lens verification/cluster per prompt concept (from the prompt lens)
  const pmeta = useMemo(() => {
    const m = new Map<number, { verified: boolean; behavior?: string }>();
    for (const p of promptFeatures?.features ?? [])
      m.set(p.feature_id, { verified: !!p.fidelity_pass, behavior: p.behavior });
    return m;
  }, [promptFeatures]);
  const [query, setQuery] = useState("");
  // no labels → no within-prompt Δwin, so "most win-differentiating" is meaningless; sort by frequency.
  const [sortBy, setSortBy] = useState<"n" | "effect">(hasLabels ? "effect" : "n");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sel, setSel] = useState<number | null>(null);

  // prompt-concept list, with battle count n and the strongest within-type Δwin (effect)
  const concepts = useMemo<PC[]>(() => {
    const nBy = new Map<number, number>();
    const effBy = new Map<number, number>();
    for (const c of cond?.cells ?? []) {
      if (c.n != null) nBy.set(c.pc, Math.max(nBy.get(c.pc) ?? 0, c.n));
      if (c.sig) effBy.set(c.pc, Math.max(effBy.get(c.pc) ?? 0, Math.abs(c.delta)));
    }
    // A bundle can legitimately contain interpreted prompt axes without preference
    // labels or a prompt→response linkage table (for example a first-pass SFT atlas).
    // Do not hide those concepts merely because the optional relationship analyses are
    // absent. Counts stay unknown rather than pretending each concept has zero support.
    const byId = new Map<number, { id: number; name: string | null }>();
    if (!clustered) {
      for (const p of promptFeatures?.features ?? [])
        byId.set(p.feature_id, { id: p.feature_id, name: p.concept ?? null });
      for (const p of elicitation?.prompt_concepts ?? []) {
        const old = byId.get(p.id);
        byId.set(p.id, { id: p.id, name: p.concept ?? old?.name ?? null });
      }
    }
    for (const p of cond?.prompt_concepts ?? []) {
      const old = byId.get(p.id);
      byId.set(p.id, { id: p.id, name: p.name ?? old?.name ?? null });
    }
    return [...byId.values()].map((p) => ({
      id: p.id,
      name: p.name,
      n: nBy.get(p.id) ?? null,
      maxAbsDelta: effBy.get(p.id) ?? 0,
    }));
  }, [clustered, cond, elicitation, promptFeatures]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return concepts
      .filter((p) => !q || conceptLabel(p.id, p.name).toLowerCase().includes(q))
      .filter((p) => clustered || !verifiedOnly || pmeta.get(p.id)?.verified)
      .sort((a, b) => (sortBy === "n"
        ? (b.n ?? -1) - (a.n ?? -1)
        : b.maxAbsDelta - a.maxAbsDelta || (b.n ?? -1) - (a.n ?? -1)));
  }, [clustered, concepts, query, sortBy, verifiedOnly, pmeta]);

  // default / cross-tab focus selection
  const handledFocus = useRef<unknown>(null);
  useEffect(() => {
    if (focus && handledFocus.current !== focus) {
      setSel(focus.pc);
      handledFocus.current = focus;
    } else if (sel == null && filtered.length) {
      setSel(filtered[0].id);
    }
  }, [focus, filtered, sel]);

  if (!cond && !elicitation && !(promptFeatures?.features.length))
    return (
      <Card>
        No prompt data in this bundle. Re-export with a prompt lens (elicitation +
        conditional win-relevance).
      </Card>
    );

  const selName = concepts.find((p) => p.id === sel)?.name ?? null;
  const selectionHidden = sel != null && !filtered.some((p) => p.id === sel);

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        {elicitation || cond ? <>
          Browse by <b>prompt concept</b>: pick one on the left to see, for that kind of
          prompt, which response concepts it tends to <b>elicit</b>{hasLabels && <> and which
          of them are associated with <b>winning</b> within this prompt type</>}.
        </> : <>
          Browse the <b>prompt concepts</b> named by the prompt lens. This bundle does not
          yet include prompt→response linkage, so it does not claim what each concept elicits.
        </>}
      </Explain>

      {conditional?.clustered && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Prompt units</span>
          <Segmented
            value={keyspace}
            onChange={(v) => { setKeyspace(v); setSel(null); setVerifiedOnly(false); }}
            options={[
              { value: "raw", label: "Individual concepts", title: "Fine-grained prompt features" },
              { value: "clustered", label: "Behavior clusters", title: "Broader groups of co-firing prompt features" },
            ]}
          />
          {clustered && <span className="text-[11px] text-slate-500">Cluster view summarizes conditional outcomes; elicitation edges remain feature-level.</span>}
        </div>
      )}

      {!clustered && coactivation && coactivation.pairs.length > 0 && (
        <Card>
          <button onClick={() => setShowCompound((s) => !s)}
            className="flex w-full items-center justify-between text-left">
            <h3 className="text-sm font-semibold text-slate-200">
              Compound prompt concepts — prompt types that co-occur
            </h3>
            <span className="text-xs text-slate-500">
              {coactivation.n_significant} significant pairs · {showCompound ? "hide" : "show"}
            </span>
          </button>
          {showCompound && (
            <>
              <p className="mb-2 mt-1 text-[11px] leading-snug text-slate-500">
                Prompt concepts that fire together above chance (lift = P(A∧B)/P(A)P(B)) — a
                "compound vocabulary" (e.g. Excel ∧ SQL = data-tooling prompts). Descriptive
                co-occurrence, symmetric and not causal.
              </p>
              <div className="flex flex-col gap-0.5">
                {coactivation.pairs.slice(0, 25).map((p, i) => {
                  const mx = coactivation.pairs[0]?.lift ?? 1;
                  return (
                    <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                      <span className="min-w-0 flex-1 truncate" title={`${p.na} ∧ ${p.nb}`}>
                        <span className="text-slate-200">{p.na}</span>
                        <span className="text-slate-500"> ∧ </span>
                        <span className="text-slate-200">{p.nb}</span>
                      </span>
                      <span className="hidden h-2 w-24 shrink-0 overflow-hidden rounded-full bg-edge/40 sm:block">
                        <span className="block h-full rounded-full bg-accent"
                          style={{ width: `${Math.round(Math.min(1, p.lift / mx) * 100)}%` }} />
                      </span>
                      <span className="w-14 shrink-0 text-right tabular-nums text-slate-300">
                        ×{p.lift.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* prompt-concept list */}
        <Card className="h-fit lg:sticky lg:top-4">
          <div className="grid gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">Search concepts</span>
              <span className="relative block">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter prompt concepts…"
                  className="w-full rounded-lg border border-edge bg-ink py-2 pl-8 pr-2 text-sm outline-none placeholder:text-slate-600 focus:border-accent/60"
            />
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "n" | "effect")}
                className="w-full rounded-lg border border-edge bg-ink px-2.5 py-2 text-sm text-slate-300 outline-none focus:border-accent/60">
                {hasLabels && <option value="effect">Largest win-rate difference</option>}
                <option value="n">Most frequent</option>
              </select>
            </label>
            {!clustered && <label className="flex items-start gap-2 rounded-lg bg-ink/35 p-2 text-[11px] leading-snug text-slate-400">
              <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="mt-0.5 accent-accent" />
              <span><b className="font-medium text-slate-300">Verified labels only</b><br />Hide prompt labels that did not pass held-out verification.</span>
            </label>}
            <div className="flex items-center justify-between border-t border-edge/60 pt-2 text-[11px] text-slate-500">
              <span>{filtered.length.toLocaleString()} of {concepts.length.toLocaleString()} concepts</span>
              {(query || verifiedOnly) && <button onClick={() => { setQuery(""); setVerifiedOnly(false); }} className="text-accent hover:text-accent/80">Clear filters</button>}
            </div>
          </div>
          {selectionHidden && (
            <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-2 text-[11px] leading-snug text-amber-200/80">
              Your selected concept is hidden by the filters; its details remain open.
            </div>
          )}
          <div className="mt-3 max-h-[55vh] overflow-y-auto border-t border-edge/60 pt-2 pr-1">
            <div className="flex flex-col">
            {filtered.map((p) => {
              const meta = clustered ? undefined : pmeta.get(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setSel(p.id)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    sel === p.id ? "bg-accent/20 text-slate-100" : "text-slate-300 hover:bg-edge/40"
                  }`}
                >
                  <span className="shrink-0 text-xs" title={meta?.verified ? "verified prompt concept" : "unverified"}>
                    {meta?.verified ? <span className="text-good">✓</span> : <span className="text-slate-600">·</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <ConceptLabel id={p.id} name={p.name} wrap />
                    {meta?.behavior && <span className="ml-1 text-[10px] text-slate-500">· {meta.behavior}</span>}
                  </span>
                  {p.n != null && <span className="shrink-0 text-right text-xs tabular-nums text-slate-500">
                    n={p.n.toLocaleString()}
                  </span>}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-1 py-3 text-sm text-slate-500">No prompt concept matches “{query}”.</p>
            )}
            </div>
          </div>
        </Card>

        {/* detail for the selected prompt concept */}
        {sel == null ? (
          <Card>Pick a prompt concept.</Card>
        ) : (
          <div className="min-w-0 flex flex-col gap-4">
            <Card>
              <h3 className="text-lg font-semibold leading-snug text-slate-100">
                <ConceptLabel id={sel} name={selName} wrap />
                <span className="ml-2 whitespace-nowrap rounded bg-edge/60 px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal text-slate-500">
                  {clustered ? "cluster " : "p"}{sel}
                </span>
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {elicitation || cond
                  ? `what this prompt tends to produce${hasLabels ? ", and what wins it" : ""}`
                  : "interpreted prompt-lens axis"}
              </p>
            </Card>
            {!clustered && <PromptExamplesPanel featureId={sel} />}
            {!clustered && <ElicitsPanel elicitation={elicitation} pc={sel} promptName={selName} onJumpFeature={onJumpFeature} />}
            {hasLabels && <WinsPanel cond={cond} pc={sel} promptName={selName} showEvidence={!clustered} onJumpFeature={onJumpFeature} />}
            {/* report_battles keys concepts by their raw name (bare id string when unnamed),
                NOT the "feature N" display label — match that, else examples never join. */}
            {!clustered && <ExamplesPanel reportBattles={reportBattles} conceptName={selName ?? String(sel)}
              canLoad={canLoadExamples} onLoad={onLoadExamples} />}
          </div>
        )}
      </div>
    </div>
  );
}

function PromptExamplesPanel({ featureId }: { featureId: number }) {
  const examples = usePromptExamples(featureId);
  if (examples === undefined)
    return <Card><p className="text-sm text-slate-500">Loading top-activating prompts…</p></Card>;
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-200">Top-activating prompts</h4>
        <span className="text-xs text-slate-500">{examples?.length ?? 0} shown</span>
      </div>
      {examples === null ? (
        <p className="text-sm text-slate-500">Prompt examples were not included in this bundle.</p>
      ) : examples.length === 0 ? (
        <p className="text-sm text-slate-500">
          This axis has no positive activation in the exported prompt corpus. No unrelated
          example is substituted.
        </p>
      ) : (
        <div className="space-y-2">
          {examples.slice(0, 6).map((example, index) => (
            <details key={index} className="group rounded-lg border border-edge/70 bg-ink/35 px-3 py-2">
              <summary className="cursor-pointer list-none text-sm text-slate-300">
                <span className="line-clamp-2">{clip(example.prompt, 260)}</span>
                <span className="mt-1 block font-mono text-[10px] text-accent-soft">prompt z +{example.z.toFixed(2)}</span>
              </summary>
              <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap border-t border-edge/60 pt-2 text-sm leading-relaxed text-slate-300">
                {example.prompt}
              </p>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}

function ElicitsPanel({ elicitation, pc, promptName, onJumpFeature }: {
  elicitation: ElicitationData | null;
  pc: number;
  promptName: string | null;
  onJumpFeature?: (cf: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const rows = useMemo(() => {
    if (!elicitation) return [];
    const nameOf = new Map(elicitation.response_concepts.map((c) => [c.id, c.concept]));
    const edges = elicitation.edges.filter((e) => e.px === pc && e.l2 > 0 && (showAll || e.sig))
      .sort((a, b) => b.lift - a.lift).slice(0, 14);
    const maxL2 = Math.max(0.5, ...edges.map((e) => e.l2));
    return edges.map((e) => ({ id: e.cy, name: nameOf.get(e.cy) ?? null, lift: e.lift,
      pyx: e.pyx, l2: e.l2, sig: e.sig, nx: e.nx, nco: e.nco, w: e.l2 / maxL2 }));
  }, [elicitation, pc, showAll]);
  useEffect(() => { setSelected(null); }, [pc]);
  useEffect(() => {
    if (selected == null || !rows.some((r) => r.id === selected))
      setSelected(rows[0]?.id ?? null);
  }, [rows, selected]);
  const active = rows.find((r) => r.id === selected) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <Card>
      <h4 className="text-sm font-semibold text-slate-200">Elicits these behaviours</h4>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">
        Response concepts that co-activate with this prompt. Select one to inspect a
        prompt–response example carrying both concepts.
      </p>
      {elicitation && elicitation.edges.some((e) => e.px === pc && e.l2 > 0 && !e.sig) && (
        <label className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-accent" />
          show non-significant estimates
        </label>
      )}
      {rows.length === 0 ? (
        <p className="px-1 py-3 text-sm text-slate-500">No elicited response concept in the bundle.</p>
      ) : (
        rows.map((r) => (
          <ConceptBarRow key={r.id} id={r.id} name={r.name}
            value={`×${r.lift.toFixed(1)}`} title={`lift ×${r.lift.toFixed(2)} · fires ${pct(r.pyx, 0)}${r.sig ? "" : " (ns)"}`}
            detail={`${r.nco.toLocaleString()} co-occurrences · ${r.nx.toLocaleString()} prompt activations`}
            width={r.w} color="rgba(96,165,250,0.85)" dim={!r.sig}
            selected={selected === r.id} onClick={() => setSelected(r.id)} />
        ))
      )}
      </Card>
      {active && <JointEvidence promptFeature={pc} responseFeature={active.id}
        promptName={promptName} responseName={active.name} kind="elicitation"
        onOpenBehavior={onJumpFeature ? () => onJumpFeature(active.id) : undefined} />}
    </div>
  );
}

function WinsPanel({ cond, pc, promptName, showEvidence, onJumpFeature }: {
  cond: ConditionalData | null;
  pc: number;
  promptName: string | null;
  showEvidence: boolean;
  onJumpFeature?: (cf: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const rows = useMemo(() => {
    if (!cond) return [];
    const nameOf = new Map(cond.features.map((f) => [f.id, f.concept]));
    const cells = cond.cells.filter((c) => c.pc === pc && (showAll || c.sig))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 14);
    const maxD = Math.max(0.02, ...cells.map((c) => Math.abs(c.delta)));
    return cells.map((c) => ({ id: c.f, name: nameOf.get(c.f) ?? null, delta: c.delta, sig: c.sig,
      nf: c.nf ?? null, n: c.n ?? null, w: Math.abs(c.delta) / maxD }));
  }, [cond, pc, showAll]);
  useEffect(() => { setSelected(null); }, [pc]);
  useEffect(() => {
    if (selected == null || !rows.some((r) => r.id === selected))
      setSelected(rows[0]?.id ?? null);
  }, [rows, selected]);
  const active = rows.find((r) => r.id === selected) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <Card>
      <h4 className="text-sm font-semibold text-slate-200">What wins here</h4>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">
        Δwin-rate when a response shows this behaviour vs not, on this prompt type
        (length-controlled). Select a row to inspect matched evidence. Faded = not significant.
      </p>
      {cond && cond.cells.some((c) => c.pc === pc && !c.sig) && (
        <label className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-accent" />
          show non-significant estimates
        </label>
      )}
      {rows.length === 0 ? (
        <p className="px-1 py-3 text-sm text-slate-500">
          {cond ? "No response concept for this prompt type." : "No conditional win data in this bundle."}
        </p>
      ) : (
        rows.map((r) => (
          <ConceptBarRow key={r.id} id={r.id} name={r.name}
            value={`${r.delta >= 0 ? "+" : ""}${Math.round(r.delta * 100)}pp`}
            title={`Δwin ${r.delta >= 0 ? "+" : ""}${(r.delta * 100).toFixed(1)}pp${r.sig ? " (significant)" : " (ns)"}${
              r.nf != null ? ` · fires in ${r.nf} of ${r.n ?? "?"} battles of this type` : r.n != null ? ` · n=${r.n}` : ""}`}
            detail={r.nf != null ? `${r.nf.toLocaleString()} fires / ${(r.n ?? 0).toLocaleString()} battles` : r.n != null ? `${r.n.toLocaleString()} battles` : undefined}
            width={r.w} color={divergeColor(r.delta, WINRATE_REF)} dim={!r.sig}
            selected={selected === r.id} onClick={() => setSelected(r.id)} />
        ))
      )}
      </Card>
      {showEvidence && active && <JointEvidence promptFeature={pc} responseFeature={active.id}
        promptName={promptName} responseName={active.name} kind="preference"
        onOpenBehavior={onJumpFeature ? () => onJumpFeature(active.id) : undefined} />}
    </div>
  );
}

function ExamplesPanel({ reportBattles, conceptName, canLoad, onLoad }: {
  reportBattles: ReportBattles | null | undefined;
  conceptName: string;
  canLoad?: boolean;
  onLoad?: () => void;
}) {
  const [ex, nAll] = useMemo(() => {
    if (!reportBattles) return [[], 0] as const;
    // gather across ALL models, then take a deterministic spread — object-key order
    // systematically over-sampled whichever models serialize first.
    const all: { prompt: string; self: string; other: string; outcome: string; model: string }[] = [];
    for (const [model, byConcept] of Object.entries(reportBattles))
      for (const b of byConcept[conceptName] ?? []) all.push({ ...b, model });
    const k = Math.min(5, all.length);
    const picked = k === 0 ? [] : Array.from({ length: k }, (_, i) => all[Math.floor((i * all.length) / k)]);
    return [picked, all.length] as const;
  }, [reportBattles, conceptName]);
  if (reportBattles === undefined && canLoad)
    return (
      <Card className="border-dashed">
        <h4 className="text-sm font-semibold text-slate-200">Example prompts</h4>
        <p className="mt-1 text-xs text-slate-500">Transcripts are an optional large artifact and are not loaded until requested.</p>
        <button onClick={onLoad} className="mt-3 rounded-lg border border-edge bg-ink/50 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-accent/40 hover:text-slate-100">
          Load example prompts
        </button>
      </Card>
    );
  if (reportBattles === undefined)
    return (
      <Card><p className="text-xs text-slate-500">Loading example prompts…</p></Card>
    );
  if (!reportBattles) return null; // examples not in this bundle at all — nothing to promise
  const tone = (o: string) => (o === "win" ? "text-good" : o === "loss" ? "text-bad" : "text-slate-400");
  if (ex.length === 0)
    return (
      <Card>
        <h4 className="text-sm font-semibold text-slate-200">Example prompts</h4>
        <p className="mt-1 px-1 py-3 text-xs text-slate-500">No sample prompts for this concept in the bundle.</p>
      </Card>
    );
  return (
    <Card>
      <h4 className="text-sm font-semibold text-slate-200">
        Example prompts <span className="font-normal text-slate-500">— {ex.length} of {nAll}, spread across models</span>
      </h4>
      <div className="mt-2 flex flex-col gap-2">
        {ex.map((b, i) => (
          <div key={i} className="rounded-lg border border-edge bg-ink/40 p-2 text-xs">
            <div className="mb-1 text-slate-300">{clip(b.prompt, 260)}</div>
            <div className="text-[11px] text-slate-500">
              {b.model} <span className={tone(b.outcome)}>({b.outcome})</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
