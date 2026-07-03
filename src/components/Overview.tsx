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
  onJumpFeature,
}: {
  bundle: Bundle;
  onJumpFeature?: (cf: number) => void;
}) {
  const m = bundle.meta;
  const hasLabels = m.has_preference ?? true;
  // honest fit reporting: r2/is_loo are authoritative; loo_r2 alone (older bundles)
  // implies LOO. NEVER label an in-sample fit "held-out".
  const r2 = m.r2 ?? m.loo_r2;
  const isLoo = m.is_loo ?? (m.loo_r2 != null);
  // describe the ACTUAL lens (individual vs difference), not a hardcoded story.
  const isDiff = m.input_rep === "difference";
  const lensKind = isDiff ? "difference" : "completion";
  const howBuilt = isDiff
    ? "we embed each response and learn a small set of interpretable “axes of difference” between the two answers (chosen − rejected) with a sparse autoencoder"
    : "we embed each response and learn a small set of interpretable behaviour features with a sparse autoencoder, then compare the two answers by the difference of their feature codes";

  const trustworthy = bundle.features.filter((f) => f.fidelity_pass && sig(f));
  const pool = trustworthy.length ? trustworthy : bundle.features.filter(sig);
  const verifiedBasis = trustworthy.length > 0;
  const rewarded = [...pool].filter((f) => eff(f) > 0).sort((a, b) => eff(b) - eff(a)).slice(0, 3);
  const penalized = [...pool].filter((f) => eff(f) < 0).sort((a, b) => eff(a) - eff(b)).slice(0, 3);
  const namedDenom = m.n_named ?? bundle.features.length;

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
        <Metric label="Battles" value={(m.n_battles ?? 0).toLocaleString()} />
        <Metric label="M / K" value={`${m.m_total} / ${m.k}`} sub={`dim ${m.input_dim}`} />
      </div>

      <Explain>
        <b>What this is.</b> {howBuilt}. <b>Reconstruction</b> = how much of the embeddings the
        features capture. <b>Verified features</b> = axes an independent LLM confirmed are real
        (of the {namedDenom} named).{hasLabels && (
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
          response embeddings, trained on {(m.n_battles ?? 0).toLocaleString()} arena battles. It found{" "}
          <span className="text-slate-100">{m.n_verified ?? "—"}</span> human-verified behaviour features.
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
          Concepts are <b>LLM-assigned labels</b>; ✓ marks ones an independent LLM confirmed on
          held-out pairs. {hasLabels && (verifiedBasis
            ? "Showing verified, significant axes only. "
            : "No verified axes yet — showing significant-but-unverified axes; treat the labels as provisional. ")}
          Association, not causation.
        </Caveat>
      </Card>
    </div>
  );
}
