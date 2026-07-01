import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type {
  ConditionalBundle, ElicitationData, Examples, Feature,
} from "../types";
import {
  Card, Explain, ConceptLabel, conceptLabel, ConceptBarRow, clip, divergeColor, WINRATE_REF, VerifiedBadge,
} from "./ui";
import { fmt, pct } from "../data";

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
  examples,
  focus,
  onJumpPrompt,
}: {
  features: Feature[];
  elicitation: ElicitationData | null;
  conditional: ConditionalBundle | null;
  examples: Examples | null;
  focus?: { cf: number } | null;
  onJumpPrompt?: (pc: number) => void;
}) {
  const cond = conditional?.raw ?? null;
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<Sort>("reward");
  const [onlyGeneral, setOnlyGeneral] = useState<"" | "general" | "content">("");
  // verified features are the only ones with elicitation/conditional data, so default to
  // them — otherwise browsing lands on unverified features with empty sub-tabs.
  const [verifiedOnly, setVerifiedOnly] = useState(true);
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

  const rewardRef = useMemo(
    () => Math.max(0.02, ...named.map((f) => Math.abs(f.delta_win_rate ?? f.win_assoc ?? 0))),
    [named]
  );

  // default / cross-tab focus selection
  const handledFocus = useRef<unknown>(null);
  useEffect(() => {
    if (focus && handledFocus.current !== focus) { setSel(focus.cf); handledFocus.current = focus; }
    // default to the first VERIFIED feature — only verified axes carry elicitation /
    // conditional data, so opening on an unverified one would show empty sub-tabs.
    else if (sel == null && rows.length) setSel((rows.find((f) => f.fidelity_pass) ?? rows[0]).feature_id);
  }, [focus, rows, sel]);

  const feat = features.find((f) => f.feature_id === sel) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        Browse by <b>response feature</b> (a behaviour the SAE found). Pick one to see how
        often it fires, how much humans reward it, which prompts activate it, and where it
        helps or hurts winning — with example answers. This is the corpus-wide view; per-model
        behaviour is in <i>Model report</i>.
      </Explain>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* master list */}
        <Card className="max-h-[74vh] overflow-y-auto">
          <div className="mb-2 flex items-center gap-2">
            <Search size={14} className="text-slate-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="filter features…"
              className="w-full rounded-lg border border-edge bg-ink px-2 py-1.5 text-sm placeholder:text-slate-600" />
          </div>
          <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
            sort:
            {(["reward", "generality", "fidelity", "name"] as Sort[]).map((s) => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`rounded px-1.5 py-0.5 ${sortBy === s ? "bg-accent text-white" : "hover:text-slate-200"}`}>{s}</button>
            ))}
          </div>
          <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
            show:
            {([["", "all"], ["general", "general"], ["content", "content-bound"]] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setOnlyGeneral(v)}
                className={`rounded px-1.5 py-0.5 ${onlyGeneral === v ? "bg-accent text-white" : "hover:text-slate-200"}`}>{lbl}</button>
            ))}
          </div>
          <label className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="accent-accent" />
            verified only <span className="text-slate-600">(unverified features have no prompt/reward data)</span>
          </label>
          <div className="flex flex-col">
            {rows.map((f) => {
              const rew = f.delta_win_rate ?? f.win_assoc ?? 0;
              return (
                <button key={f.feature_id} onClick={() => setSel(f.feature_id)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    sel === f.feature_id ? "bg-accent/20 text-slate-100" : "text-slate-300 hover:bg-edge/40"}`}>
                  <span className="shrink-0 text-xs" title={f.fidelity_pass ? "verified" : "unverified"}>
                    {f.fidelity_pass ? <span className="text-good">✓</span> : <span className="text-slate-600">·</span>}
                  </span>
                  <span className="min-w-0 flex-1"><ConceptLabel id={f.feature_id} name={f.concept} wrap /></span>
                  <span className="hidden h-2 w-16 shrink-0 overflow-hidden rounded-full bg-edge/40 sm:block" title={`reward ${fmt(rew, 2)}`}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.round((Math.abs(rew) / rewardRef) * 100)}%`, background: divergeColor(rew, WINRATE_REF) }} />
                  </span>
                  <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-500" title="fire rate (pervasiveness)">
                    {f.generality != null ? `${(f.generality * 100).toFixed(f.generality < 0.01 ? 1 : 0)}%` : "—"}
                  </span>
                </button>
              );
            })}
            {rows.length === 0 && <p className="px-1 py-3 text-sm text-slate-500">No feature matches.</p>}
          </div>
        </Card>

        {/* detail */}
        {!feat ? <Card>Pick a feature.</Card> : (
          <div className="flex flex-col gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-slate-200">
                <ConceptLabel id={feat.feature_id} name={feat.concept} wrap />
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <Stat label="fire rate" value={feat.generality != null ? pct(feat.generality, feat.generality < 0.01 ? 1 : 0) : "—"} sub="pervasiveness" />
                <Stat label="reward (Δwin)" value={feat.delta_win_rate != null ? `${feat.delta_win_rate >= 0 ? "+" : ""}${(feat.delta_win_rate * 100).toFixed(0)}pp` : "—"}
                  sub={`win-assoc ${fmt(feat.win_assoc, 2)}`} tone={feat.delta_win_rate} />
                <Stat label="prompt types" value={feat.n_prompt_types != null ? String(feat.n_prompt_types) : "—"} sub="sig. elicitors" />
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">fidelity</div>
                  <div className="mt-0.5"><VerifiedBadge pass={feat.fidelity_pass} n={feat.fidelity_n} /></div>
                </div>
              </div>
              {feat.behavior && <p className="mt-2 text-[11px] text-slate-500">cluster: {feat.behavior}</p>}
            </Card>

            <div className="inline-flex w-fit rounded-lg border border-edge p-0.5 text-xs">
              {([["activated", "Activated by"], ["reward", "Reward by prompt"], ["examples", "Examples"]] as const).map(([v, lbl]) => (
                <button key={v} onClick={() => setSub(v)}
                  className={`rounded-md px-2.5 py-1 transition ${sub === v ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"}`}>{lbl}</button>
              ))}
            </div>

            {sub === "activated" && <ActivatedBy elicitation={elicitation} fid={feat.feature_id} unverified={!feat.fidelity_pass} onJumpPrompt={onJumpPrompt} />}
            {sub === "reward" && <RewardByPrompt cond={cond} fid={feat.feature_id} overall={feat.delta_win_rate} unverified={!feat.fidelity_pass} onJumpPrompt={onJumpPrompt} />}
            {sub === "examples" && <FeatureExamples examples={examples} fid={feat.feature_id} concept={conceptLabel(feat.feature_id, feat.concept)} />}
          </div>
        )}
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
        {unverified ? "This feature is unverified — prompt-association analysis covers verified features only."
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
          : unverified ? "This feature is unverified — per-prompt-type reward covers verified features only."
          : "No prompt-type reward data for this feature."}</p> :
        rows.map((r) => (
          <ConceptBarRow key={r.id} id={r.id} name={r.name} value={`${r.delta >= 0 ? "+" : ""}${Math.round(r.delta * 100)}pp`}
            title={`Δwin ${(r.delta * 100).toFixed(1)}pp${r.sig ? " (significant)" : " (ns)"}`}
            width={r.w} color={divergeColor(r.delta, WINRATE_REF)} dim={!r.sig} onClick={onJumpPrompt ? () => onJumpPrompt(r.id) : undefined} />
        ))}
    </Card>
  );
}

function FeatureExamples({ examples, fid, concept }: { examples: Examples | null; fid: number; concept: string }) {
  const items = useMemo(() => {
    return (examples?.[String(fid)] ?? []).map((e) => {
      const aSide = e.z >= 0; // A exhibits the feature more when z_diff > 0
      return { z: e.z, prompt: e.prompt, model: aSide ? e.model_a : e.model_b, completion: aSide ? e.completion_a : e.completion_b };
    }).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 6);
  }, [examples, fid]);
  const clipC = (s: string, n = 1400) => (s.length > n ? s.slice(0, n) + " …[truncated]" : s);
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
