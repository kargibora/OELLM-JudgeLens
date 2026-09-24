# PrefScope Viewer

PrefScope Viewer is an interactive prompt and answer concept explorer for PrefScope data. It
connects four questions:

- What prompt and answer concepts does a dataset contain?
- Which answer concepts appear for each type of prompt?
- How do answer sets or models differ?
- What examples and checks support each result?

The repository works both as a standalone Vite application and as the
`@prefscope/viewer` React package.

The reviewed [Dolci prompt-256 / response-512 Viewer](https://kargibora.github.io/OELLM-JudgeLens/dolci-prompt256-response512-viewer/)
is published separately from the main Viewer. Its [versioned export](https://github.com/kargibora/OELLM-JudgeLens/releases/tag/dolci-prompt256-response512-reviewed-v1)
includes 250 named prompt features, 466 named response features, and response concept types.
Labels were audited but not held-out-verified; this dataset has no preference outcomes.

## What the interface provides

- **Dataset contents** — common and rare prompt or answer concepts, with language/source
  breakdowns and examples.
- **Prompt concepts** — matching prompts, related prompt concepts, answer concepts that
  appear with them, and win results when labels are available.
- **Answer concepts** — searchable answer concepts, prompt links, win results, and examples.
- **Prompt → answer** — pick a prompt type and rank its answer concepts by frequency,
  how unusual they are for that prompt, support, or win effect.
- **Concept relationships** — answer concepts that appear together, with matched evidence.
- **Models & comparisons** — model reports and prompt-matched answer-set differences.
- **Data checks** — coverage, missing or weak names, repeated labels, and available views.
- **Concept map** — searchable prompt and answer maps. Click a point once to focus it and
  again to open its examples and related concepts.

The top filter bar keeps the selected dataset, language/source, and answer type across
views. Answer types are **behavior or style**, **prompt or topic**, **mixed or unclear**,
and **not classified**. Pages state when a result still uses the full dataset. Long prompt
and answer examples use left/right controls instead of stacking many transcripts. New
exports can also switch between the strongest, a typical active, and a near-cutoff sample.

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
prefscope-export-viewer \
  --lens-dir /path/to/completion-lens \
  --analysis-dir /path/to/completion-results \
  --corpus /path/to/corpus.parquet \
  --prompt-interpret-dir /path/to/prompt-results \
  --prompt-lens /path/to/prompt-lens \
  --joint-examples \
  --feature-map \
  --bias-screen /path/to/bias_screen.csv \
  --out public/data
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

The viewer uses careful language by design:

- A checked name is an LLM-written label reproduced by an LLM check on held-out examples.
  It is not human verification and does not prove that the feature has only one meaning.
- Preference effects describe what this dataset favors. They do not define whether a
  behavior is objectively good or bad.
- Two concepts appearing together does not show that one caused the other.
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
  --output /tmp/prefscope-public/completion_m2048 \
  --profile public

tar -czf /tmp/completion_m2048-public.tar.gz \
  -C /tmp/prefscope-public completion_m2048
```

The `public` profile retains aggregate results plus a compact language/source-stratified
evidence sample, redacts common credential and personal-data patterns, and omits the
monolithic per-model transcript artifact. Use `--profile collaborator` for richer
stratified evidence or `--profile full` to retain every exported artifact. All profiles
apply redaction; profile selection changes coverage, not the privacy guarantee. The Pages
workflow downloads this versioned release asset before building.

## Package status

The API is an initial `0.1.x` surface. Before 1.0, the main remaining engineering work is:

- a shared JSON Schema and runtime validation for exporter/client compatibility;
- self-contained dataset manifests and capability declarations;
- sharded per-model and per-prompt transcript artifacts;
- keyboard/table alternatives for canvas maps and more chart accessibility tests;
- component and end-to-end tests with a tiny synthetic fixture.

MIT licensed.
