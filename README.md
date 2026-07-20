# PrefScope Viewer

PrefScope Viewer is an interactive behavior explorer for PrefScope analysis bundles. It
connects four questions that are otherwise easy to inspect in isolation:

- What behavior does a model exhibit?
- Which prompt types elicit it?
- How does that differ across models or correlate with preferences?
- What examples, support, verification, and confound checks justify the claim?

The repository works both as a standalone Vite application and as the
`@prefscope/viewer` React package.

## What the interface provides

- **Discover** — analysis coverage, SAE reconstruction, verification, and direct paths
  into prompt-, behavior-, and model-first exploration.
- **Prompt behavior** — prompt features or clusters, response behaviors they elicit,
  conditional preference associations, support, and matched prompt–response evidence.
- **Behaviors** — searchable response features with fidelity, prevalence, prompt
  associations, conditional effects, and activation examples. Selecting an associated
  prompt shows a response where both sparse concepts activate.
- **Models** — per-model prevalence, same-prompt contrasts, model-to-model comparisons,
  prompt-type performance, and evidence drill-downs.
- **Reliability** — interpretation fidelity, length-confound screening, and honest
  in-sample versus leave-one-model-out validation.
- **Embedding atlas** — lazily loaded exploratory maps. These are diagnostics, not causal
  evidence.

Heavy artifacts are loaded by route and transcripts are requested explicitly. A complete
bundle no longer blocks the first render.

## Run the standalone app

```bash
npm ci
npm run dev
```

Production checks:

```bash
npm run build
npm run preview
```

The default application reads an exported bundle from `public/data/`. Generate one from
the PrefScope repository:

```bash
python scripts/export_viewer_data.py \
  --lens-dir /path/to/completion-lens \
  --corpus /path/to/corpus.parquet \
  --prompt-interpret-dir /path/to/prompt-results \
  --prompt-lens /path/to/prompt-lens \
  --completion-lens /path/to/completion-lens \
  --joint-examples \
  --bias-screen /path/to/bias_screen.csv \
  --out viewer-web/public/data
```

`bundle_manifest.json` is authoritative. Optional files that are present on disk but not
listed in the manifest are ignored, preventing stale results from entering the UI.

## Embed as a React package

Build the package locally:

```bash
npm run build:lib
```

Then use it from another React application:

```tsx
import { PrefScopeViewer } from "@prefscope/viewer";
import "@prefscope/viewer/style.css";

export default function Analysis() {
  return (
    <PrefScopeViewer
      dataBaseUrl="https://example.org/my-analysis/"
      initialView="models"
      layout="embedded"
      syncUrl
    />
  );
}
```

The data URL must contain `meta.json`, `features.json`, and normally
`bundle_manifest.json`. Every mounted viewer owns an isolated data client, cache, manifest,
and in-flight request set, so multiple viewers may point at different bundles on one page.
The published stylesheet is scoped below `.prefscope-viewer` and does not apply Tailwind's
global reset to the host application.

## Dataset overlays

`datasets.json` may list dataset-specific overlays. At present, an overlay is expected to
provide its own `meta.json` and `diagnosis.json`; it reuses only immutable lens metadata
such as feature IDs, labels, clusters, and fidelity.

The viewer deliberately does **not** fall back to root-corpus reward, elicitation,
confound, map, or head-to-head artifacts while an overlay is selected. Mixing those files
would make measurements from one dataset look like measurements of another.

Future exporters should give each dataset a self-contained manifest and capability list.

## Interpretation rules

The viewer uses conservative language by design:

- A verified feature is an LLM-assigned label reproduced by an LLM verification step on
  held-out examples; it is not human verification, necessarily a different model, or proof
  that the feature is monosemantic.
- Preference effects describe what this dataset favors. They do not define whether a
  behavior is objectively good or bad.
- Elicitation is a coactivation relationship, not a causal intervention.
- Non-significant conditional estimates are hidden by default.
- Lift is always displayed with co-occurrence support.
- Legacy signed-feature examples selected by pairwise contrast are described as contrast
  examples, not guaranteed positive-pole activators.

## Publishing and data privacy

Do not publish real model outputs merely because the frontend is public. Keep production
bundles in object storage or release artifacts, run an explicit privacy/redaction review,
and use a small synthetic bundle for package demos. In particular,
`examples_by_model.json`, `report_battles.json`, and `joint_examples/` can contain
sensitive prompt or response text.

The GitHub Pages deployment keeps generated data out of Git. Build the compact,
redacted snapshot and package it as the release asset referenced by
`.github/workflows/deploy.yml`:

```bash
python scripts/build_public_bundle.py \
  --source public/data \
  --output /tmp/prefscope-public/completion_m2048

tar -czf /tmp/completion_m2048-public.tar.gz \
  -C /tmp/prefscope-public completion_m2048
```

The public profile retains aggregate results, caps activation evidence at three examples
per feature and one transcript per displayed prompt–response relationship, redacts common
credential and personal-data patterns, and omits the monolithic per-model transcript
artifact. The Pages workflow downloads this versioned release asset before building.

## Package status

The API is an initial `0.1.x` surface. Before 1.0, the main remaining engineering work is:

- a shared JSON Schema and runtime validation for exporter/client compatibility;
- self-contained dataset manifests and capability declarations;
- sharded per-model and per-prompt transcript artifacts;
- keyboard/table alternatives for canvas maps and more chart accessibility tests;
- component and end-to-end tests with a tiny synthetic fixture.

MIT licensed.
