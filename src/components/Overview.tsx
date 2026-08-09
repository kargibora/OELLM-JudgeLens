import { Activity, ArrowRight, Bot, MessageSquareText } from "lucide-react";
import type { Bundle, Feature } from "../types";
import { Card, Caveat, Explain, Metric, VerifiedBadge } from "./ui";
import { fmt } from "../data";

// length-controlled Δwin-rate is the honest effect; fall back to the raw gap only
// when the logistic AME wasn't exported.
const eff = (f: Feature) => f.delta_win_rate ?? f.win_assoc ?? 0;
const sig = (f: Feature) => f.delta_win_significant ?? f.win_significant ?? false;
const pp = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}pp`;

export default function Overview({
  bundle,
  onNavigate,
  onJumpFeature,
}: {
  bundle: Bundle;
  onNavigate?: (view: "prompts" | "behaviors" | "models") => void;
  onJumpFeature?: (cf: number) => void;
}) {
  const m = bundle.meta;
  const hasLabels = m.has_preference ?? true;
  const single = m.dataset_mode === "single";
  const files = new Set(bundle.manifest?.files ?? []);
  const legacy = bundle.manifest == null;
  const hasPromptView = legacy || ["prompt_features.json", "elicitation.json", "prompt_map.json"]
    .some((name) => files.has(name));
  const hasModelView = legacy || ["diagnosis.json", "model_compare.json", "head_to_head.json"]
    .some((name) => files.has(name));
  // honest fit reporting: r2/is_loo are authoritative; loo_r2 alone (older bundles)
  // implies LOO. NEVER label an in-sample fit "held-out".
  const r2 = m.r2 ?? m.loo_r2;
  const isLoo = m.is_loo ?? (m.loo_r2 != null);
  // describe the ACTUAL lens (individual vs difference), not a hardcoded story.
  const isDiff = m.input_rep === "difference";
  const lensKind = isDiff ? "difference" : "completion";
  const howBuilt = isDiff
    ? "we embed each response and learn a small set of interpretable “axes of difference” between the two answers (chosen − rejected) with a sparse autoencoder"
    : single
      ? "we embed each response and learn a sparse set of candidate response concepts with a sparse autoencoder"
      : "we embed each response and learn a sparse set of candidate response concepts, then compare prompt-matched answers through their feature codes";

  const trustworthy = bundle.features.filter((f) => f.fidelity_pass && sig(f));
  const pool = trustworthy.length ? trustworthy : bundle.features.filter(sig);
  const verifiedBasis = trustworthy.length > 0;
  const rewarded = [...pool].filter((f) => eff(f) > 0).sort((a, b) => eff(b) - eff(a)).slice(0, 3);
  const penalized = [...pool].filter((f) => eff(f) < 0).sort((a, b) => eff(a) - eff(b)).slice(0, 3);
  const namedDenom = m.n_named ?? bundle.features.length;
  const startCards = [
    ...(hasPromptView ? [{
      view: "prompts" as const,
      icon: MessageSquareText,
      title: "Start with a prompt",
      body: hasLabels
        ? "Which response concepts do these requests elicit, and what tends to win?"
        : "Which response concepts tend to appear for these requests?",
    }] : []),
    {
      view: "behaviors" as const,
      icon: Activity,
      title: "Start with a response concept",
      body: "Where does it appear, which prompts elicit it, and how faithful is its label?",
    },
    ...(hasModelView ? [{
      view: "models" as const,
      icon: Bot,
      title: "Start with a model",
      body: "Which response tendencies distinguish it, and where is it strong or weak?",
    }] : []),
  ];

  // each driver row jumps to its feature in the Feature panel — the best entry point
  // into the app shouldn't be a dead display.
  const Row = ({ f, tone }: { f: Feature; tone: "good" | "bad" }) => (
    <li>
      <button
        onClick={onJumpFeature ? () => onJumpFeature(f.feature_id) : undefined}
        disabled={!onJumpFeature}
        className={`flex w-full items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left transition-colors duration-150 ${
          onJumpFeature ? "hover:bg-edge/30" : "cursor-default"}`}
        title={onJumpFeature ? "open in Feature panel" : undefined}
      >
        <span className="min-w-0 truncate text-slate-300">
          <span className={`${tone === "good" ? "text-good" : "text-bad"} font-mono`}>{pp(eff(f))}</span>
          {" · "}{f.concept}
        </span>
        <VerifiedBadge pass={f.fidelity_pass} n={f.fidelity_n} />
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-3xl border border-edge bg-hero px-5 py-6 shadow-2xl sm:px-7 sm:py-8">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent-soft">
            {m.input_rep === "difference" ? "Difference-SAE analysis" : "Response concept analysis"}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            {single
              ? "See what this response dataset contains—and the evidence behind each concept."
              : "Find what models do, when they do it, and how reliably we know."}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
            {single
              ? "Explore response concepts, their prevalence and co-activation, prompt context, held-out verification, and concrete activation examples."
              : "Start from a user request, response concept, or model. Every route leads back to activation examples, verification, support, and preference associations."}
          </p>
        </div>
        <div className={`mt-6 grid gap-3 ${startCards.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {startCards.map(({ view, icon: Icon, title, body }) => (
            <button
              key={view}
              onClick={() => onNavigate?.(view)}
              disabled={!onNavigate}
              className="group rounded-2xl border border-edge/80 bg-ink/45 p-4 text-left transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-panel/80"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent-soft"><Icon size={17} /></span>
                <ArrowRight size={16} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-accent-soft" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-100">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
            </button>
          ))}
        </div>
      </section>

      <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 ${hasLabels ? "lg:grid-cols-6" : "lg:grid-cols-4"}`}>
        <Metric label="Reconstruction" value={fmt(m.ev, 3)} sub={`${lensKind} lens EV`} />
        <Metric label="Verified features" value={`${m.n_verified ?? "—"} / ${namedDenom}`} sub="of named" />
        {hasLabels && (
          <>
            <Metric label="Predicts win rate" value={r2 != null ? `${(r2 * 100).toFixed(0)}%` : "—"}
              sub={isLoo ? "R², held-out (LOO)" : "R², in-sample fit"} />
            <Metric label="Models" value={m.n_models ?? "—"} sub="in validation" />
          </>
        )}
        <Metric label={single ? "Examples" : "Battles"} value={(m.n_battles ?? 0).toLocaleString()} />
        <Metric label="M / K" value={`${m.m_total} / ${m.k}`} sub={`dim ${m.input_dim}`} />
      </div>

      <Explain>
        <b>What this is.</b> {howBuilt}. <b>Reconstruction</b> = how much of the embeddings the
        features capture. <b>Verified features</b> = labels an LLM verifier reproduced on
        held-out examples (of the {namedDenom} named).{hasLabels && (
          <> <b>Predicts win rate</b> = how well those axes predict each model’s real win rate
          {isLoo
            ? ", with every model held out of its own prediction — higher means the diagnosis genuinely generalises."
            : " — an in-sample fit (no held-out predictions in this bundle), so treat it optimistically."}</>
        )}
      </Explain>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">What this lens found</h2>
        <p className="text-sm leading-relaxed text-slate-300">
          A {lensKind} SAE over <span className="text-slate-100">{m.embed_model_id ?? "the embedding model"}</span>{" "}
          response embeddings, trained on {(m.n_battles ?? 0).toLocaleString()} {single ? "instruction–response examples" : "paired response comparisons"}. It found{" "}
          <span className="text-slate-100">{m.n_verified ?? "—"}</span> response-concept labels that passed
          an LLM verification step on held-out examples.
          {r2 != null && m.n_models != null && (
            <> A predictor built only from those features (weighted by how much humans reward each)
              explains <span className="text-good">{(r2 * 100).toFixed(0)}%</span> of the variance
              in actual win rate across {m.n_models} models
              {isLoo ? " — held out leave-one-model-out." : " — fit in-sample (not held out)."}</>
          )}
        </p>
        {hasLabels && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-good">Humans reward</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {rewarded.length === 0 && <li className="text-slate-500">—</li>}
                {rewarded.map((f) => <Row key={f.feature_id} f={f} tone="good" />)}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-bad">Humans penalise</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {penalized.length === 0 && <li className="text-slate-500">—</li>}
                {penalized.map((f) => <Row key={f.feature_id} f={f} tone="bad" />)}
              </ul>
            </div>
          </div>
        )}
        <Caveat>
          {hasLabels ? (
            <>Values are the <b>length-controlled</b> Δwin-rate in percentage points, not the raw gap.{" "}</>
          ) : (
            <>This dataset has <b>no preference labels</b>, so there's no reward/win analysis — the
            viewer shows concept structure only (what concepts exist and how prompts and responses
            relate).{" "}</>
          )}
          Concepts are <b>LLM-assigned labels</b>; ✓ marks ones an LLM verifier reproduced on
          held-out {single ? "examples" : "pairs"}. {hasLabels && (verifiedBasis
            ? "Showing verified, significant axes only. "
            : "No verified axes yet — showing significant-but-unverified axes; treat the labels as provisional. ")}
          Association, not causation.
        </Caveat>
      </Card>
    </div>
  );
}
