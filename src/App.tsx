import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Braces,
  ChevronRight,
  Compass,
  Database,
  Map,
  Menu,
  MessageSquareText,
  RefreshCw,
  Share2,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  ConceptDistribution as ConceptDistributionType,
  ConceptCoactivation as ConceptCoactivationType,
  BiasRow,
  Bundle,
  ConditionalBundle,
  Diagnosis,
  ElicitationData,
  Feature,
  HeadToHead,
  ModelCompare as ModelCompareData,
  ModelValidation,
  PairedComparison as PairedComparisonData,
  PromptFeatures,
  ReportBattles,
} from "./types";
import { BUNDLE_SCHEMA_VERSION } from "./types";
import {
  DataClientContext,
  normalizeConditional,
  PrefScopeDataClient,
  useDataArtifact,
  useDataClient,
  type DatasetInfo,
} from "./data";
import Overview from "./components/Overview";
import { Card, Segmented, Skeleton, SkeletonList } from "./components/ui";

// Keep the analytical surfaces out of the startup chunk. A report card pulls in
// Recharts and >1k lines of UI; users browsing the overview should not pay for it.
const FeaturePanel = lazy(() => import("./components/FeaturePanel"));
const PromptBrowser = lazy(() => import("./components/PromptBrowser"));
const ReportCard = lazy(() => import("./components/ReportCard"));
const ModelCompare = lazy(() => import("./components/ModelCompare"));
const PairedComparison = lazy(() => import("./components/PairedComparison"));
const BiasScreen = lazy(() => import("./components/BiasScreen"));
const Validation = lazy(() => import("./components/Validation"));
const MapsTab = lazy(() => import("./components/MapsTab"));
const ConceptDistributionView = lazy(() => import("./components/ConceptDistribution"));
const CoactivationView = lazy(() => import("./components/Coactivation"));
const ConceptDetailDrawer = lazy(() => import("./components/ConceptDetailDrawer"));
const PromptConceptDetailDrawer = lazy(() => import("./components/PromptConceptDetailDrawer"));

export type ViewId = "discover" | "distribution" | "prompts" | "behaviors" | "coactivation" | "models" | "reliability" | "atlas";

export interface PrefScopeViewerProps {
  /** URL containing meta.json, features.json, and bundle_manifest.json. */
  dataBaseUrl?: string;
  initialView?: ViewId;
  /** Standalone deployments can mirror navigation into #view; embedders can disable it. */
  syncUrl?: boolean;
  layout?: "standalone" | "embedded";
  className?: string;
}

const VIEWS: {
  id: ViewId;
  label: string;
  description: string;
  icon: typeof Compass;
  group?: string;
  /** Bundle artifact this view needs; the tab is hidden when the bundle lacks it. */
  requires?: string;
}[] = [
  { id: "discover", label: "Discover", description: "What the lens found", icon: Compass },
  { id: "distribution", label: "Concept distribution", description: "What prompts and responses contain", icon: BarChart3, requires: "concept_distribution.json|prompt_concept_distribution.json" },
  { id: "prompts", label: "Prompt context", description: "When users ask X", icon: MessageSquareText, group: "Explore", requires: "prompt_features.json|elicitation.json|prompt_map.json" },
  { id: "behaviors", label: "Response concepts", description: "Inspect what responses express", icon: Activity },
  { id: "coactivation", label: "Co-activation", description: "Concepts that fire together", icon: Share2, requires: "coactivation.json" },
  { id: "models", label: "Models", description: "How each model responds", icon: Bot, requires: "diagnosis.json" },
  { id: "reliability", label: "Reliability", description: "Fidelity, bias, validation", icon: ShieldCheck, group: "Audit" },
  { id: "atlas", label: "Feature atlas", description: "Explore SAE geometry and communities", icon: Map, requires: "feature_map.json|prompt_feature_map.json|feature_clusters.json|prompt_feature_clusters.json|map.json|response_map.json|prompt_map.json" },
];

const isView = (x: string): x is ViewId => VIEWS.some((v) => v.id === x);
const hashView = (): ViewId | null => {
  if (typeof window === "undefined") return null;
  const value = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return isView(value) ? value : null;
};

function RouteFallback() {
  return (
    <div className="space-y-4" aria-label="Loading analysis panel">
      <Skeleton className="h-20" />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-[520px]" />
        <Skeleton className="h-[520px]" />
      </div>
    </div>
  );
}

function ArtifactNotice({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-dashed">
      <div className="flex items-start gap-3 text-sm text-slate-400">
        <Database size={18} className="mt-0.5 shrink-0 text-slate-500" />
        <div>{children}</div>
      </div>
    </Card>
  );
}

function PromptRoute({
  bundle,
  focus,
  onJumpFeature,
}: {
  bundle: Bundle;
  focus: { pc: number } | null;
  onJumpFeature: (cf: number) => void;
}) {
  const client = useDataClient();
  const promptFeatures = useDataArtifact<PromptFeatures>("prompt_features.json");
  const conditionalRaw = useDataArtifact<unknown>("conditional.json");
  const elicitation = useDataArtifact<ElicitationData>("elicitation.json");
  // Completion and prompt co-activation use different sparse-axis keyspaces. Load the
  // dedicated prompt artifact here; substituting response pairs produces plausible but
  // incorrect names and counts.
  const promptCoactivation = useDataArtifact<ConceptCoactivationType>("prompt_coactivation.json");
  const [wantExamples, setWantExamples] = useState(false);
  const reportBattles = useDataArtifact<ReportBattles>(wantExamples ? "report_battles.json" : null);
  const examplesAvailable = client.hasArtifact("report_battles.json");

  const conditional = useMemo<ConditionalBundle | null>(
    () => normalizeConditional(conditionalRaw),
    [conditionalRaw]
  );
  const coreLoading = promptFeatures === undefined || conditionalRaw === undefined || elicitation === undefined;
  if (coreLoading) return <RouteFallback />;

  return (
    <PromptBrowser
      conditional={conditional}
      elicitation={elicitation ?? null}
      reportBattles={!examplesAvailable ? null : wantExamples ? reportBattles : undefined}
      canLoadExamples={!wantExamples && examplesAvailable}
      onLoadExamples={() => setWantExamples(true)}
      promptFeatures={promptFeatures ?? null}
      coactivation={promptCoactivation ?? null}
      hasLabels={bundle.meta.has_preference ?? true}
      focus={focus}
      onJumpFeature={onJumpFeature}
    />
  );
}

function BehaviorRoute({
  bundle,
  focus,
  onJumpPrompt,
}: {
  bundle: Bundle;
  focus: { cf: number } | null;
  onJumpPrompt: (pc: number) => void;
}) {
  const conditionalRaw = useDataArtifact<unknown>("conditional.json");
  const elicitation = useDataArtifact<ElicitationData>("elicitation.json");
  const conditional = useMemo(() => normalizeConditional(conditionalRaw), [conditionalRaw]);

  if (conditionalRaw === undefined || elicitation === undefined) return <RouteFallback />;
  return (
    <FeaturePanel
      features={bundle.features}
      elicitation={elicitation ?? null}
      conditional={conditional}
      lensInputRep={bundle.meta.input_rep}
      hasLabels={bundle.meta.has_preference ?? true}
      focus={focus}
      onJumpPrompt={onJumpPrompt}
    />
  );
}

function ModelRoute({
  bundle,
  overlay,
  onJumpFeature,
}: {
  bundle: Bundle;
  overlay: string;
  onJumpFeature: (cf: number) => void;
}) {
  const client = useDataClient();
  const diagnosisPath = overlay ? `${overlay}diagnosis.json` : "diagnosis.json";
  const diagnosis = useDataArtifact<Diagnosis>(diagnosisPath, !overlay);
  // Root analytical artifacts MUST NOT leak into a dataset overlay. Overlays currently
  // contain their own meta + diagnosis only; feature identities/fidelity are immutable
  // lens metadata, while reward, prevalence and support fields belong to the root corpus.
  const headToHead = useDataArtifact<HeadToHead>(overlay ? null : "head_to_head.json");
  const modelCompare = useDataArtifact<ModelCompareData>(overlay ? null : "model_compare.json");
  const pairedComparison = useDataArtifact<PairedComparisonData>(overlay ? null : "paired_comparison.json");
  const [mode, setMode] = useState<"report" | "compare" | "shift">("report");
  const [wantBattles, setWantBattles] = useState(false);
  const reportBattles = useDataArtifact<ReportBattles>(wantBattles ? "report_battles.json" : null);
  const battlesAvailable = !overlay && client.hasArtifact("report_battles.json");

  if (diagnosis === undefined || (!overlay && (headToHead === undefined || modelCompare === undefined || pairedComparison === undefined)))
    return <RouteFallback />;

  const reportAvailable = diagnosis != null && diagnosis.error !== "no_bank";
  const compareAvailable = !overlay && modelCompare != null;
  const shiftAvailable = !overlay && pairedComparison != null;
  const effectiveMode = mode === "report" && !reportAvailable
    ? shiftAvailable ? "shift" : compareAvailable ? "compare" : "report"
    : mode === "compare" && !compareAvailable
      ? shiftAvailable ? "shift" : "report"
      : mode === "shift" && !shiftAvailable
        ? reportAvailable ? "report" : "compare"
        : mode;

  if (!reportAvailable && !compareAvailable && !shiftAvailable)
    return (
      <ArtifactNotice>
        No per-model diagnosis is present. Export a bank-backed diagnosis for full model
        reports, or <code className="text-slate-200">model_compare.json</code> for a small
        bring-your-own comparison.
      </ArtifactNotice>
    );

  return (
    <div className="space-y-4">
      {[reportAvailable, compareAvailable, shiftAvailable].filter(Boolean).length > 1 && (
        <Segmented
          value={effectiveMode}
          onChange={setMode}
          options={[
            ...(reportAvailable ? [{ value: "report" as const, label: "Model report", title: "Corpus-wide profile and prompt-conditioned outcomes" }] : []),
            ...(shiftAvailable ? [{ value: "shift" as const, label: "Response-set shifts", title: "Prompt-matched, label-free A/B concept shifts" }] : []),
            ...(compareAvailable ? [{ value: "compare" as const, label: "Arena pair comparison", title: "Marginal comparison for bring-your-own evaluations" }] : []),
          ]}
        />
      )}
      {effectiveMode === "shift" ? (
        <PairedComparison data={pairedComparison ?? null} />
      ) : effectiveMode === "compare" ? (
        <ModelCompare data={modelCompare ?? null} />
      ) : (
        <ReportCard
          diagnosis={diagnosis ?? null}
          features={overlay ? bundle.features.map(featureIdentityOnly) : bundle.features}
          reportBattles={!battlesAvailable ? null : wantBattles ? reportBattles : undefined}
          canLoadBattles={!wantBattles && battlesAvailable}
          onLoadBattles={() => setWantBattles(true)}
          headToHead={headToHead ?? null}
          allowExamples={!overlay}
          hasCorpusAssociations={!overlay}
          hasLabels={bundle.meta.has_preference ?? true}
          onJumpFeature={onJumpFeature}
        />
      )}
    </div>
  );
}

function featureIdentityOnly(f: Feature): Feature {
  return {
    feature_id: f.feature_id,
    concept: f.concept,
    type: f.type,
    correlation: f.correlation,
    sign: f.sign,
    p_bonferroni: f.p_bonferroni,
    fidelity_pass: f.fidelity_pass,
    fidelity_n: f.fidelity_n,
    precision: f.precision,
    recall: f.recall,
    f1: f.f1,
    fp_rate: f.fp_rate,
    agreement: f.agreement,
    cluster_id: f.cluster_id,
    behavior: f.behavior,
  };
}

function OverlayOverview({ bundle, onModels }: { bundle: Bundle; onModels: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card className="bg-hero p-6 sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-soft">Dataset overlay</div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-50">{bundle.meta.n_battles.toLocaleString()} evaluated prompts</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          This overlay reuses the lens vocabulary but has its own model outputs and diagnosis.
          Corpus-level reward, elicitation, maps, and confound files are intentionally hidden so
          results from the root dataset cannot be presented as measurements of this one.
        </p>
        <button onClick={onModels} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:bg-accent/90">
          Open model behavior <ChevronRight size={16} />
        </button>
      </Card>
      <Card>
        <h3 className="text-sm font-semibold text-slate-200">Available here</h3>
        <dl className="mt-3 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Models</dt><dd className="tabular-nums text-slate-200">{bundle.meta.n_models ?? "—"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Battles</dt><dd className="tabular-nums text-slate-200">{bundle.meta.n_battles.toLocaleString()}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Shared lens</dt><dd className="truncate text-right text-slate-200">{bundle.meta.lens}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Response features</dt><dd className="tabular-nums text-slate-200">{bundle.features.length.toLocaleString()}</dd></div>
        </dl>
      </Card>
    </div>
  );
}

function OverlayBlocked({ onModels }: { onModels: () => void }) {
  return (
    <ArtifactNotice>
      This panel has no artifact for the selected dataset. Showing the root corpus here
      would mix datasets and produce invalid conclusions. <button onClick={onModels} className="ml-1 font-medium text-accent-soft hover:underline">Open its model report instead.</button>
    </ArtifactNotice>
  );
}

function ReliabilityRoute({ bundle }: { bundle: Bundle }) {
  const client = useDataClient();
  const [mode, setMode] = useState<"fidelity" | "bias" | "validation">("fidelity");
  const bias = useDataArtifact<BiasRow[]>(mode === "bias" ? "bias_screen.json" : null);
  const validation = useDataArtifact<ModelValidation[]>(mode === "validation" ? "validation.json" : null);
  const named = bundle.features.filter((f) => f.concept && f.concept.trim() !== "");
  const tested = bundle.features.filter((f) => f.fidelity_pass != null);
  const passed = tested.filter((f) => f.fidelity_pass);
  const didNotPass = tested.length - passed.length;
  const notTested = Math.max(0, named.length - tested.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Reliability and limits</h2>
          <p className="mt-1 text-sm text-slate-400">Separate label fidelity, confounds, and predictive validation.</p>
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "fidelity" as const, label: "Feature fidelity" },
            // Both need preference labels; offering them on unlabelled data is a dead click.
            ...(client.hasArtifact("bias_screen.json")
              ? [{ value: "bias" as const, label: "Length confounds" }] : []),
            ...(client.hasArtifact("validation.json")
              ? [{ value: "validation" as const, label: "Model validation" }] : []),
          ]}
        />
      </div>

      {mode === "fidelity" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <h3 className="text-base font-semibold text-slate-100">Interpretation coverage</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              {named.length.toLocaleString()} features are named. An LLM verifier evaluated
              {" "}{tested.length.toLocaleString()}: <span className="font-semibold text-good">{passed.length.toLocaleString()} passed</span>
              {" "}and <span className="font-semibold text-amber-400">{didNotPass.toLocaleString()} did not pass</span>.
              {" "}{notTested.toLocaleString()} named features have no exported verdict. The current
              bundle does not distinguish verifier abstentions from other non-pass outcomes.
            </p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-edge/70">
              <div
                className="h-full rounded-full bg-good"
                style={{ width: `${tested.length ? (passed.length / tested.length) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs tabular-nums text-slate-500">
              {tested.length ? `${((passed.length / tested.length) * 100).toFixed(1)}% of tested labels passed` : "Verification has not been exported yet."}
            </p>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-slate-200">Interpret correctly</h3>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-slate-400">
              <li>Feature names are hypotheses assigned by an LLM.</li>
              <li>Δwin is an association with this dataset’s preferences, not moral value.</li>
              <li>Elicitation is coactivation, not causal intervention.</li>
              <li>Use examples and per-prompt support before making a model claim.</li>
            </ul>
          </Card>
        </div>
      )}
      {mode === "bias" && (bias === undefined ? <RouteFallback /> : <BiasScreen bias={bias ?? null} />)}
      {mode === "validation" && (
        validation === undefined ? <RouteFallback /> : <Validation validation={validation ?? []} meta={bundle.meta} />
      )}
    </div>
  );
}

export default function App({
  dataBaseUrl,
  initialView = "discover",
  syncUrl = false,
  layout = "embedded",
  className = "",
}: PrefScopeViewerProps) {
  const client = useMemo(() => new PrefScopeDataClient(dataBaseUrl), [dataBaseUrl]);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<ViewId>(() => (syncUrl && hashView()) || initialView);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [overlay, setOverlay] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const navTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeNavRef = useRef<HTMLButtonElement | null>(null);
  const [focusCell, setFocusCell] = useState<{ pc: number; cf: number } | null>(null);

  const featureFocus = useMemo(
    () => (focusCell && focusCell.cf >= 0 ? { cf: focusCell.cf } : null),
    [focusCell]
  );
  const promptFocus = useMemo(
    () => (focusCell && focusCell.pc >= 0 ? { pc: focusCell.pc } : null),
    [focusCell]
  );

  useEffect(() => {
    setOverlay("");
    setFocusCell(null);
    let live = true;
    client.loadDatasets()
      .then((rows) => { if (live) setDatasets(rows); })
      .catch(() => { if (live) setDatasets([{ id: "default", label: "Dataset", overlay: "" }]); });
    return () => { live = false; };
  }, [client]);

  useEffect(() => {
    let live = true;
    setBundle(null);
    setErr(null);
    client.loadBundle(overlay)
      .then((value) => { if (live) setBundle(value); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [overlay, client]);

  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") return;
    const onHash = () => {
      const next = hashView();
      if (next) setView(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [syncUrl]);

  useEffect(() => {
    if (!mobileNav) return;
    closeNavRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobileNav(false); return; }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      navTriggerRef.current?.focus();
    };
  }, [mobileNav]);

  const navigate = (next: ViewId) => {
    setView(next);
    setMobileNav(false);
    if (syncUrl && typeof window !== "undefined" && hashView() !== next)
      window.history.pushState(null, "", `#${next}`);
  };

  const jumpFeature = (cf: number) => {
    setFocusCell({ pc: -1, cf });
    navigate("behaviors");
  };
  const jumpPrompt = (pc: number) => {
    setFocusCell({ pc, cf: -1 });
    navigate("prompts");
  };

  const active = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  const ActiveIcon = active.icon;
  const manifest = bundle?.manifest;
  const bundleNote = !bundle
    ? null
    : !manifest
      ? "Legacy bundle: re-export it to get stale-file protection and data health reporting."
      : manifest.schema_version !== BUNDLE_SCHEMA_VERSION
        ? `Bundle schema v${manifest.schema_version} does not match viewer v${BUNDLE_SCHEMA_VERSION}.`
        : manifest.errors?.length
          ? `The export reported ${manifest.errors.length} partial stage${manifest.errors.length === 1 ? "" : "s"}.`
          : null;

  return (
    <DataClientContext.Provider value={client}>
    <div className={`prefscope-viewer ${layout === "standalone" ? "min-h-screen" : "min-h-[640px]"} ${className}`}>
      <div className={`mx-auto grid max-w-[1680px] lg:grid-cols-[248px_minmax(0,1fr)] ${layout === "standalone" ? "min-h-screen" : "min-h-[640px]"}`}>
        <aside className={`hidden border-r border-edge/70 bg-ink/70 px-4 py-6 lg:sticky lg:top-0 lg:block ${layout === "standalone" ? "lg:h-screen" : "lg:h-full"}`}>
          <Brand />
          <Navigation view={view} onNavigate={navigate} client={client} />
          <BundleStatus bundle={bundle} />
        </aside>

        {mobileNav && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close navigation" onClick={() => setMobileNav(false)} />
            <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label="Analysis navigation"
              className="relative h-full w-[min(86vw,320px)] border-r border-edge bg-ink p-5 shadow-2xl">
              <div className="mb-6 flex items-start justify-between">
                <Brand />
                <button ref={closeNavRef} className="icon-button grid" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button>
              </div>
              <Navigation view={view} onNavigate={navigate} client={client} />
            </aside>
          </div>
        )}

        <main className="min-w-0 px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
          <header className="mb-6 flex min-h-16 items-center gap-3 border-b border-edge/60 pb-4">
            <button ref={navTriggerRef} className="icon-button grid lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
              <Menu size={19} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-accent-soft">
                <ActiveIcon size={13} />
                {active.label}
              </div>
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
                {active.description}
              </h1>
            </div>
            {datasets.length > 1 && (
              <label className="hidden min-w-0 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:flex">
                Dataset
                <select
                  value={overlay}
                  onChange={(e) => setOverlay(e.target.value)}
                  className="max-w-[330px] rounded-xl border border-edge bg-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-200"
                >
                  {datasets.map((d) => <option key={d.id} value={d.overlay}>{d.label}</option>)}
                </select>
              </label>
            )}
          </header>

          {datasets.length > 1 && (
            <label className="mb-4 flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:hidden">
              Dataset
              <select value={overlay} onChange={(e) => setOverlay(e.target.value)} className="rounded-xl border border-edge bg-panel px-3 py-2 text-sm font-normal normal-case text-slate-200">
                {datasets.map((d) => <option key={d.id} value={d.overlay}>{d.label}</option>)}
              </select>
            </label>
          )}

          {bundleNote && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{bundleNote}</span>
            </div>
          )}

          {err ? (
            <div className="rounded-2xl border border-bad/30 bg-bad/5 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 text-bad" size={20} />
                <div>
                  <h2 className="font-semibold text-slate-100">Could not load this analysis</h2>
                  <p className="mt-1 text-sm text-bad/90">{err}</p>
                  <p className="mt-2 text-xs text-slate-500">Check the data URL and regenerate the viewer bundle.</p>
                </div>
              </div>
            </div>
          ) : !bundle ? (
            <RouteFallback />
          ) : (
            <Suspense fallback={<RouteFallback />}>
              {view === "discover" && (overlay
                ? <OverlayOverview bundle={bundle} onModels={() => navigate("models")} />
                : <Overview bundle={bundle} onNavigate={navigate} onJumpFeature={jumpFeature} />)}
              {view === "prompts" && (
                overlay ? <OverlayBlocked onModels={() => navigate("models")} />
                  : <PromptRoute bundle={bundle} focus={promptFocus} onJumpFeature={jumpFeature} />
              )}
              {view === "behaviors" && (
                overlay ? <OverlayBlocked onModels={() => navigate("models")} />
                  : <BehaviorRoute bundle={bundle} focus={featureFocus} onJumpPrompt={jumpPrompt} />
              )}
              {view === "distribution" && (
                overlay ? <OverlayBlocked onModels={() => navigate("models")} />
                  : <DistributionRoute features={bundle.features} />
              )}
              {view === "coactivation" && (
                overlay ? <OverlayBlocked onModels={() => navigate("models")} />
                  : <CoactivationRoute focus={featureFocus?.cf ?? null} onJumpFeature={jumpFeature} />
              )}
              {view === "models" && (
                <ModelRoute bundle={bundle} overlay={overlay} onJumpFeature={jumpFeature} />
              )}
              {view === "reliability" && (overlay
                ? <OverlayBlocked onModels={() => navigate("models")} />
                : <ReliabilityRoute bundle={bundle} />)}
              {view === "atlas" && (
                overlay ? <OverlayBlocked onModels={() => navigate("models")} /> : <MapsTab
                  features={bundle.features}
                  hasLabels={bundle.meta.has_preference ?? true}
                  onOpenFeature={jumpFeature}
                  onOpenPrompt={jumpPrompt}
                  onOpenCoactivation={(featureId) => {
                    setFocusCell({ pc: -1, cf: featureId });
                    navigate("coactivation");
                  }}
                  onJump={(pc, cf) => {
                    setFocusCell({ pc, cf });
                    navigate(pc >= 0 ? "prompts" : "behaviors");
                  }}
                />
              )}
            </Suspense>
          )}
        </main>
      </div>
    </div>
    </DataClientContext.Provider>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent-soft shadow-glow">
        <Braces size={20} />
      </div>
      <div>
        <div className="text-base font-semibold tracking-tight text-slate-50">PrefScope</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Response concept explorer</div>
      </div>
    </div>
  );
}

function DistributionRoute({ features }: { features: Feature[] }) {
  const responseDist = useDataArtifact<ConceptDistributionType>("concept_distribution.json");
  const promptDist = useDataArtifact<ConceptDistributionType>("prompt_concept_distribution.json");
  const promptFeatures = useDataArtifact<PromptFeatures>("prompt_features.json");
  const [kind, setKind] = useState<"response" | "prompt">("response");
  const [group, setGroup] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (responseDist === null && promptDist) setKind("prompt");
  }, [responseDist, promptDist]);

  if (responseDist === undefined || promptDist === undefined || promptFeatures === undefined)
    return <SkeletonList n={2} itemClass="h-48" />;
  if (!responseDist && !promptDist)
    return <ArtifactNotice>This bundle has no concept-distribution artifact. Re-export it with <code>prefscope-export-viewer</code>.</ArtifactNotice>;

  const available = [
    ...(responseDist ? [{ value: "response" as const, label: "Response concepts" }] : []),
    ...(promptDist ? [{ value: "prompt" as const, label: "Prompt concepts" }] : []),
  ];
  const activeKind = kind === "prompt" && promptDist ? "prompt" : "response";
  const dist = activeKind === "prompt" ? promptDist : responseDist;
  const promptFeatureRows: Feature[] = (promptFeatures?.features ?? []).map((row) => ({ ...row }));

  if (!dist) return null;
  return <>
    {available.length > 1 && (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-edge/70 bg-panel/55 p-2">
        <Segmented
          value={activeKind}
          onChange={(next) => { setKind(next); setSelected(null); setGroup(""); }}
          options={available}
        />
        <span className="hidden pr-2 text-xs text-slate-500 sm:block">Choose the sparse code space to summarize</span>
      </div>
    )}
    <ConceptDistributionView dist={dist} kind={activeKind} group={group}
      onGroupChange={(next) => { setGroup(next); setSelected(null); }} onSelectConcept={setSelected} />
    {selected != null && activeKind === "response" && (
      <ConceptDetailDrawer featureId={selected} features={features}
        initialGroup={group} onClose={() => setSelected(null)} onSelectFeature={setSelected} />
    )}
    {selected != null && activeKind === "prompt" && (
      <PromptConceptDetailDrawer featureId={selected} features={promptFeatureRows}
        initialGroup={group} onClose={() => setSelected(null)} onSelectFeature={setSelected} />
    )}
  </>;
}

function CoactivationRoute({ focus, onJumpFeature }: { focus: number | null; onJumpFeature: (fid: number) => void }) {
  const coact = useDataArtifact<ConceptCoactivationType>("coactivation.json");
  if (coact === undefined) return <SkeletonList n={2} itemClass="h-48" />;
  if (!coact) return <ArtifactNotice>This bundle has no <code>coactivation.json</code>. Re-run <code>prefscope-viewer</code> to add it.</ArtifactNotice>;
  return <CoactivationView coact={coact} selected={focus} onSelectConcept={onJumpFeature} />;
}

function Navigation({ view, onNavigate, client }: { view: ViewId; onNavigate: (view: ViewId) => void; client?: PrefScopeDataClient }) {
  let lastGroup: string | undefined;
  // A view whose artifact the bundle does not carry is hidden rather than shown as a
  // dead tab: absence is a property of the dataset, not an error to report per click.
  const available = VIEWS.filter((item) => {
    if (!item.requires || !client) return true;
    return item.requires.split("|").some((name) => client.hasArtifact(name));
  });
  return (
    <nav className="mt-8 space-y-1" aria-label="Analysis views">
      {available.map((item) => {
        const Icon = item.icon;
        const group = item.group && item.group !== lastGroup ? item.group : null;
        if (item.group) lastGroup = item.group;
        return (
          <div key={item.id}>
            {group && <div className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{group}</div>}
            <button
              onClick={() => onNavigate(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                view === item.id
                  ? "bg-accent/15 text-slate-50 ring-1 ring-inset ring-accent/25"
                  : "text-slate-400 hover:bg-panel/80 hover:text-slate-200"
              }`}
            >
              <Icon size={17} className={view === item.id ? "text-accent-soft" : "text-slate-500 group-hover:text-slate-300"} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block truncate text-[10px] text-slate-600 group-hover:text-slate-500">{item.description}</span>
              </span>
              {view === item.id && <ChevronRight size={14} className="text-accent-soft" />}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

function BundleStatus({ bundle }: { bundle: Bundle | null }) {
  const mf = bundle?.manifest;
  const healthy = !!mf && mf.schema_version === BUNDLE_SCHEMA_VERSION && !(mf.errors?.length);
  return (
    <div className="absolute bottom-6 left-4 right-4 rounded-xl border border-edge/70 bg-panel/45 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
        {bundle ? <Database size={14} className={healthy ? "text-good" : "text-amber-400"} /> : <RefreshCw size={14} className="animate-spin text-slate-500" />}
        {bundle ? bundle.meta.lens : "Loading bundle"}
      </div>
      {bundle && (
        <div className="mt-1 truncate text-[10px] text-slate-600" title={bundle.meta.embed_model_id ?? ""}>
          {bundle.features.length.toLocaleString()} features · {mf?.files.length ?? "legacy"} artifacts
        </div>
      )}
    </div>
  );
}
