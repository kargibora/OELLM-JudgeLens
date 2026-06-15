# JudgeLens Viewer (web)

A modern, standalone interactive viewer for JudgeLens difference-SAE lenses — a
React/Vite/TypeScript app that replaces the Streamlit viewer with richer charts.
Publishable and shareable with colleagues.

## Views

- **Overview** — headline numbers (EV, verified features, LOO-R²) + top rewarded/penalised behaviours.
- **Features** — sortable, filterable table of every axis: concept, fidelity correlation, win-association, verified badge.
- **Win relevance** — diverging bar of what humans reward vs penalise (significance-shaded).
- **Validation** — predicted-deficit vs actual-win-rate scatter across all models, with R² and OLS line.
- **Model diagnosis** — pick any pooled model → **gap quadrant** (`delta_vs_pool` × `win_assoc`); top-left = under-does a rewarded behaviour. Top-gaps list.
- **Feature detail** — per-axis example battles with the A/B responses behind each activation.

## Data

The browser can't read `.npy`/`.parquet`, so a Python script flattens a lens +
its results into small JSON files under `public/data/`:

```bash
# from the repo root (criterion-concordance/)
python scripts/export_viewer_data.py \
    --lens-dir lens_arena8b_m32_k4 \
    --corpus corpora/arena_merged.parquet \
    --out viewer-web/public/data
```

Produces `meta.json`, `features.json`, `validation.json`, `diagnosis.json`
(needs a built `bank/`), and `examples.json` (needs `--corpus`). Re-run it to
point the viewer at a different lens.

## Run

```bash
cd viewer-web
npm install
npm run dev        # http://localhost:5273
```

Build a static bundle to share/publish:

```bash
npm run build      # -> dist/  (any static host: GitHub Pages, Vercel, S3…)
npm run preview
```

## Stack

React 18 · Vite 5 · TypeScript · Tailwind CSS · Recharts · lucide-react.
