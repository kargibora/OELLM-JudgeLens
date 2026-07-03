import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Boxes, ClipboardList, LayoutDashboard, Map, ScatterChart, Split,
} from "lucide-react";
import type { Bundle } from "./types";
import { BUNDLE_SCHEMA_VERSION } from "./types";
import { loadBundle } from "./data";
import Overview from "./components/Overview";
import Validation from "./components/Validation";
import MapsTab from "./components/MapsTab";
import PromptBrowser from "./components/PromptBrowser";
import FeaturePanel from "./components/FeaturePanel";
import BiasScreen from "./components/BiasScreen";
import ReportCard from "./components/ReportCard";

// `groupStart` renders a divider before the tab. Two browse hubs (Prompt/Feature) →
// per-model + trust views → geometry.
const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "prompts-outcome", label: "Prompt panel", icon: Split, groupStart: " " },
  { id: "feature-panel", label: "Feature panel", icon: Boxes },
  { id: "report", label: "Model report", icon: ClipboardList, groupStart: " " },
  { id: "confound", label: "Length bias", icon: AlertTriangle },
  { id: "validation", label: "Validation", icon: ScatterChart },
  { id: "maps", label: "Maps", icon: Map, groupStart: " " },
] as const;

export default function App() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("overview");
  // cross-tab link: ★ in the maps / a hub row jumps to the matching concept in a hub.
  // cf/pc are -1 when only the other axis is meaningful (e.g. feature→prompt jump).
  const [focusCell, setFocusCell] = useState<{ pc: number; cf: number } | null>(null);
  // stable focus objects (identity only changes when the target changes) so a hub's
  // focus effect fires once per jump instead of every render — and never on the -1 sentinel.
  const featureFocus = useMemo(
    () => (focusCell && focusCell.cf >= 0 ? { cf: focusCell.cf } : null), [focusCell]);
  const promptFocus = useMemo(
    () => (focusCell && focusCell.pc >= 0 ? { pc: focusCell.pc } : null), [focusCell]);

  useEffect(() => {
    loadBundle().then(setBundle).catch((e) => setErr(String(e)));
  }, []);

  if (err)
    return (
      <div className="m-8 rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
        Failed to load data: {err}
        <div className="mt-2 text-slate-400">
          Generate it with{" "}
          <code className="text-slate-200">python scripts/export_viewer_data.py …</code>
        </div>
      </div>
    );
  if (!bundle)
    return (
      <div className="mx-auto max-w-7xl px-4 pt-6">
        <div className="mb-6 h-8 w-64 animate-pulse rounded-lg bg-edge/40" />
        <div className="mb-6 h-11 animate-pulse rounded-2xl bg-edge/40" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-edge/40" />
          ))}
        </div>
      </div>
    );

  // no preference labels → drop the purely-preference tabs (Bias, Validation) from nav and
  // degrade the preference-derived sections inside the surviving hubs. Absent flag = labels.
  const hasLabels = bundle.meta.has_preference ?? true;
  const tabs = TABS.filter((t) => hasLabels || (t.id !== "confound" && t.id !== "validation"));

  // bundle-manifest health: a missing manifest means an old export (stale files can't be
  // told apart from current ones); a version mismatch means the viewer and export drifted.
  const mf = bundle.manifest;
  const bundleNote = !mf
    ? "This data bundle predates the manifest format — some panels may show stale or missing data. Re-run the export to refresh it."
    : mf.schema_version !== BUNDLE_SCHEMA_VERSION
      ? `Bundle schema v${mf.schema_version} ≠ viewer v${BUNDLE_SCHEMA_VERSION} — re-run the export to match this viewer.`
      : mf.errors && mf.errors.length > 0
        ? `The export reported ${mf.errors.length} issue${mf.errors.length > 1 ? "s" : ""}: ${mf.errors.map((e) => e.stage).join(", ")} — those panels show partial or no data.`
        : null;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <header className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight">JudgeLens</h1>
        <span className="text-sm text-slate-500">
          {bundle.meta.lens} · {bundle.meta.embed_model_id}
        </span>
      </header>

      <nav className="mb-6 flex flex-wrap items-center gap-1 rounded-2xl border border-edge bg-panel/60 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          const groupStart = "groupStart" in t ? (t as { groupStart?: string }).groupStart : undefined;
          return (
            <span key={t.id} className="flex items-center gap-1">
              {groupStart !== undefined &&
                (groupStart.trim() ? (
                  <span className="ml-2 mr-0.5 select-none text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {groupStart}
                  </span>
                ) : (
                  <span className="mx-1 h-5 w-px bg-edge" />
                ))}
              <button
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                  active ? "bg-accent text-white" : "text-slate-400 hover:bg-edge/50 hover:text-slate-200"
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            </span>
          );
        })}
      </nav>

      {bundleNote && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
          {bundleNote}
        </div>
      )}

      {tab === "overview" && (
        <Overview bundle={bundle}
          onJumpFeature={(cf) => { setFocusCell({ pc: -1, cf }); setTab("feature-panel"); }} />
      )}
      {tab === "prompts-outcome" && (
        <PromptBrowser
          conditional={bundle.conditional}
          elicitation={bundle.elicitation}
          reportBattles={bundle.reportBattles}
          promptFeatures={bundle.promptFeatures}
          hasLabels={hasLabels}
          focus={promptFocus}
          onJumpFeature={(cf) => { setFocusCell({ pc: -1, cf }); setTab("feature-panel"); }}
        />
      )}
      {tab === "feature-panel" && (
        <FeaturePanel
          features={bundle.features}
          elicitation={bundle.elicitation}
          conditional={bundle.conditional}
          hasLabels={hasLabels}
          focus={featureFocus}
          onJumpPrompt={(pc) => { setFocusCell({ pc, cf: -1 }); setTab("prompts-outcome"); }}
        />
      )}
      {tab === "report" && (
        <ReportCard
          diagnosis={bundle.diagnosis}
          features={bundle.features}
          reportBattles={bundle.reportBattles}
          headToHead={bundle.headToHead}
          hasLabels={hasLabels}
          onJumpFeature={(cf) => { setFocusCell({ pc: -1, cf }); setTab("feature-panel"); }}
        />
      )}
      {tab === "confound" && <BiasScreen bias={bundle.bias} />}
      {tab === "validation" && <Validation validation={bundle.validation} meta={bundle.meta} />}
      {tab === "maps" && (
        <MapsTab hasLabels={hasLabels}
          onJump={(pc, cf) => { setFocusCell({ pc, cf }); setTab("prompts-outcome"); }} />
      )}
    </div>
  );
}
