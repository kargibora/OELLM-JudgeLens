import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { ConditionalBundle, ConditionalData, ElicitationData, ReportBattles } from "../types";
import { Card, Explain, ConceptLabel, conceptLabel, divergeColor, WINRATE_REF } from "./ui";
import { pct } from "../data";

// Prompt-first browser: pick a prompt concept and read, on one page, what responses it
// tends to elicit (co-activation lift) and which of those actually help win it (the
// length-controlled Δwin-rate within that prompt type), plus example prompts + outcomes.
// Replaces the dense feature×prompt heatmap.

const clip = (s: string, n = 200) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

type PC = { id: number; name: string | null; n: number; maxAbsDelta: number };

export default function PromptBrowser({
  conditional,
  elicitation,
  reportBattles,
  focus,
}: {
  conditional: ConditionalBundle | null;
  elicitation: ElicitationData | null;
  reportBattles: ReportBattles | null;
  focus?: { pc: number } | null;
}) {
  const cond = conditional?.raw ?? null; // raw = individual prompt concepts (not clusters)
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"n" | "effect">("effect");
  const [sel, setSel] = useState<number | null>(null);

  // prompt-concept list, with battle count n and the strongest within-type Δwin (effect)
  const concepts = useMemo<PC[]>(() => {
    const nBy = new Map<number, number>();
    const effBy = new Map<number, number>();
    for (const c of cond?.cells ?? []) {
      if (c.n != null) nBy.set(c.pc, Math.max(nBy.get(c.pc) ?? 0, c.n));
      if (c.sig) effBy.set(c.pc, Math.max(effBy.get(c.pc) ?? 0, Math.abs(c.delta)));
    }
    const base = cond?.prompt_concepts ?? elicitation?.prompt_concepts?.map((p) => ({ id: p.id, name: p.concept })) ?? [];
    return base.map((p) => ({ id: p.id, name: p.name, n: nBy.get(p.id) ?? 0, maxAbsDelta: effBy.get(p.id) ?? 0 }));
  }, [cond, elicitation]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return concepts
      .filter((p) => !q || conceptLabel(p.id, p.name).toLowerCase().includes(q))
      .sort((a, b) => (sortBy === "n" ? b.n - a.n : b.maxAbsDelta - a.maxAbsDelta || b.n - a.n));
  }, [concepts, query, sortBy]);

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

  if (!cond && !elicitation)
    return (
      <Card>
        No prompt data in this bundle. Re-export with a prompt lens (elicitation +
        conditional win-relevance).
      </Card>
    );

  const selName = concepts.find((p) => p.id === sel)?.name ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Explain>
        Browse by <b>prompt concept</b>: pick one on the left to see, for that kind of
        prompt, which response behaviours it tends to <b>elicit</b> (co-activation) and which
        of them actually <b>help win</b> it (length-controlled Δwin-rate within this prompt
        type), plus example prompts and their outcomes. In short — "when users ask this, what
        do models produce, and what wins?"
      </Explain>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* prompt-concept list */}
        <Card className="max-h-[70vh] overflow-y-auto">
          <div className="mb-2 flex items-center gap-2">
            <Search size={14} className="text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter prompt concepts…"
              className="w-full rounded-lg border border-edge bg-ink px-2 py-1.5 text-sm placeholder:text-slate-600"
            />
          </div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
            sort:
            {(["effect", "n"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`rounded px-1.5 py-0.5 ${sortBy === s ? "bg-accent text-white" : "hover:text-slate-200"}`}
              >
                {s === "effect" ? "most win-differentiating" : "most frequent"}
              </button>
            ))}
          </div>
          <div className="flex flex-col">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSel(p.id)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                  sel === p.id ? "bg-accent/20 text-slate-100" : "text-slate-300 hover:bg-edge/40"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <ConceptLabel id={p.id} name={p.name} wrap />
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-slate-500">
                  n={p.n.toLocaleString()}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-1 py-3 text-sm text-slate-500">No prompt concept matches “{query}”.</p>
            )}
          </div>
        </Card>

        {/* detail for the selected prompt concept */}
        {sel == null ? (
          <Card>Pick a prompt concept.</Card>
        ) : (
          <div className="flex flex-col gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-slate-200">
                <ConceptLabel id={sel} name={selName} wrap />
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                what this prompt tends to produce, and what wins it
              </p>
            </Card>
            <ElicitsPanel elicitation={elicitation} pc={sel} />
            <WinsPanel cond={cond} pc={sel} />
            {/* report_battles keys concepts by their raw name (bare id string when unnamed),
                NOT the "feature N" display label — match that, else examples never join. */}
            <ExamplesPanel reportBattles={reportBattles} conceptName={selName ?? String(sel)} />
          </div>
        )}
      </div>
    </div>
  );
}

// horizontal bar row (simple, readable — no chart lib)
function Bar({ label, id, value, fmt, width, color }: {
  label: string | null; id: number; value: string; fmt?: string; width: number; color: string;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <span className="min-w-0 flex-1">
        <ConceptLabel id={id} name={label} wrap className="text-slate-300" />
      </span>
      <span className="hidden h-2 w-28 shrink-0 overflow-hidden rounded-full bg-edge/40 sm:block">
        <span className="block h-full rounded-full" style={{ width: `${Math.round(width * 100)}%`, background: color }} />
      </span>
      <span className="w-16 shrink-0 text-right tabular-nums text-slate-300" title={fmt}>{value}</span>
    </div>
  );
}

function ElicitsPanel({ elicitation, pc }: { elicitation: ElicitationData | null; pc: number }) {
  const rows = useMemo(() => {
    if (!elicitation) return [];
    const nameOf = new Map(elicitation.response_concepts.map((c) => [c.id, c.concept]));
    const edges = elicitation.edges.filter((e) => e.px === pc && e.l2 > 0)
      .sort((a, b) => b.lift - a.lift).slice(0, 14);
    const maxL2 = Math.max(0.5, ...edges.map((e) => e.l2));
    return edges.map((e) => ({ id: e.cy, name: nameOf.get(e.cy) ?? null, lift: e.lift, pyx: e.pyx, l2: e.l2, sig: e.sig, w: e.l2 / maxL2 }));
  }, [elicitation, pc]);
  return (
    <Card>
      <h4 className="text-sm font-semibold text-slate-200">Elicits these behaviours</h4>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">
        response concepts that co-activate with this prompt (lift = P(fires | this prompt) / base rate)
      </p>
      {rows.length === 0 ? (
        <p className="px-1 py-3 text-sm text-slate-500">No elicited response concept in the bundle.</p>
      ) : (
        rows.map((r) => (
          <Bar key={r.id} id={r.id} label={r.name}
            value={`×${r.lift.toFixed(1)}`} fmt={`lift ×${r.lift.toFixed(2)} · fires ${pct(r.pyx, 0)}${r.sig ? "" : " (ns)"}`}
            width={r.w} color="rgba(96,165,250,0.85)" />
        ))
      )}
    </Card>
  );
}

function WinsPanel({ cond, pc }: { cond: ConditionalData | null; pc: number }) {
  const rows = useMemo(() => {
    if (!cond) return [];
    const nameOf = new Map(cond.features.map((f) => [f.id, f.concept]));
    const cells = cond.cells.filter((c) => c.pc === pc)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 14);
    const maxD = Math.max(0.02, ...cells.map((c) => Math.abs(c.delta)));
    return cells.map((c) => ({ id: c.f, name: nameOf.get(c.f) ?? null, delta: c.delta, sig: c.sig, w: Math.abs(c.delta) / maxD }));
  }, [cond, pc]);
  return (
    <Card>
      <h4 className="text-sm font-semibold text-slate-200">What wins here</h4>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">
        Δwin-rate when a response shows this behaviour vs not, on this prompt type
        (length-controlled). <span className="text-slate-400">bold</span> = significant.
      </p>
      {rows.length === 0 ? (
        <p className="px-1 py-3 text-sm text-slate-500">
          {cond ? "No response concept for this prompt type." : "No conditional win data in this bundle."}
        </p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className={r.sig ? "font-medium" : "opacity-70"}>
            <Bar id={r.id} label={r.name}
              value={`${r.delta >= 0 ? "+" : ""}${Math.round(r.delta * 100)}pp`}
              fmt={`Δwin ${r.delta >= 0 ? "+" : ""}${(r.delta * 100).toFixed(1)}pp${r.sig ? " (significant)" : " (ns)"}`}
              width={r.w} color={divergeColor(r.delta, WINRATE_REF)} />
          </div>
        ))
      )}
    </Card>
  );
}

function ExamplesPanel({ reportBattles, conceptName }: { reportBattles: ReportBattles | null; conceptName: string }) {
  const ex = useMemo(() => {
    if (!reportBattles) return [];
    const out: { prompt: string; self: string; other: string; outcome: string; model: string }[] = [];
    for (const [model, byConcept] of Object.entries(reportBattles)) {
      for (const b of byConcept[conceptName] ?? []) out.push({ ...b, model });
      if (out.length >= 20) break;
    }
    return out.slice(0, 5);
  }, [reportBattles, conceptName]);
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
      <h4 className="text-sm font-semibold text-slate-200">Example prompts</h4>
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
