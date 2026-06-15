import type { Bundle } from "../types";
import { Card, Metric } from "./ui";
import { fmt } from "../data";

export default function Overview({ bundle }: { bundle: Bundle }) {
  const m = bundle.meta;
  const rewarded = [...bundle.features]
    .filter((f) => f.win_significant && (f.win_assoc ?? 0) > 0)
    .sort((a, b) => (b.win_assoc ?? 0) - (a.win_assoc ?? 0))
    .slice(0, 3);
  const penalized = [...bundle.features]
    .filter((f) => f.win_significant && (f.win_assoc ?? 0) < 0)
    .sort((a, b) => (a.win_assoc ?? 0) - (b.win_assoc ?? 0))
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Metric label="Explained var" value={fmt(m.ev, 3)} sub="difference SAE" />
        <Metric label="Verified features" value={`${m.n_verified ?? "—"} / ${m.m_total}`} sub="fidelity-passing" />
        <Metric label="LOO R²" value={fmt(m.loo_r2, 3)} sub="deficit → win rate" />
        <Metric label="Models" value={m.n_models ?? "—"} sub="in pool" />
        <Metric label="Battles" value={(m.n_battles ?? 0).toLocaleString()} />
        <Metric label="M / K" value={`${m.m_total} / ${m.k}`} sub={`dim ${m.input_dim}`} />
      </div>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">What this lens found</h2>
        <p className="text-sm leading-relaxed text-slate-300">
          A difference-SAE over <span className="text-slate-100">{m.embed_model_id}</span> response
          embeddings, trained on {(m.n_battles ?? 0).toLocaleString()} arena battles. It found{" "}
          <span className="text-slate-100">{m.n_verified}</span> human-verified axes of difference. A
          linear predictor built only from those axes (weighted by how much humans reward each)
          explains <span className="text-good">{m.loo_r2 ? `${(m.loo_r2 * 100).toFixed(0)}%` : "—"}</span> of
          the variance in actual win rate across {m.n_models} models — held out leave-one-model-out.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-good">Humans reward</h3>
            <ul className="mt-1 space-y-1 text-sm text-slate-300">
              {rewarded.map((f) => (
                <li key={f.feature_id}>
                  <span className="text-good">+{fmt(f.win_assoc, 2)}</span> · {f.concept}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-bad">Humans penalise</h3>
            <ul className="mt-1 space-y-1 text-sm text-slate-300">
              {penalized.map((f) => (
                <li key={f.feature_id}>
                  <span className="text-bad">{fmt(f.win_assoc, 2)}</span> · {f.concept}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
