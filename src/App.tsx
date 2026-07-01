import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRightLeft, BarChart3, Boxes, ClipboardList, FlaskConical,
  LayoutDashboard, Map, MessageSquare, ScatterChart, Split, Sparkles, Table2,
} from "lucide-react";
import type { Bundle } from "./types";
import { loadBundle } from "./data";
import Overview from "./components/Overview";
import FeaturesTable from "./components/FeaturesTable";
import WinRelevance from "./components/WinRelevance";
import Validation from "./components/Validation";
import FeatureDetail from "./components/FeatureDetail";
import MapsTab from "./components/MapsTab";
import Elicitation from "./components/Elicitation";
import PromptBrowser from "./components/PromptBrowser";
import FeaturePanel from "./components/FeaturePanel";
import BiasScreen from "./components/BiasScreen";
import PromptFeatures from "./components/PromptFeatures";
import ReportCard from "./components/ReportCard";
import GeneralBehaviours from "./components/GeneralBehaviours";

// `groupStart` renders a small section label before the tab — used to cluster the
// three prompt↔response views (which are different statistics, not duplicates).
const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "features", label: "Features", icon: Table2 },
  { id: "feature-panel", label: "Feature panel", icon: Boxes },
  { id: "reward", label: "Win relevance", icon: BarChart3 },
  { id: "elicitation", label: "Elicits", icon: ArrowRightLeft, groupStart: "Prompt ↔ Response" },
  { id: "general", label: "General behaviours", icon: Sparkles },
  { id: "prompts-outcome", label: "Prompt browser", icon: Split },
  { id: "confound", label: "Confound screen", icon: AlertTriangle, groupStart: " " },
  { id: "prompts", label: "Prompt concepts", icon: MessageSquare },
  { id: "validation", label: "Validation", icon: ScatterChart },
  { id: "report", label: "Model report", icon: ClipboardList },
  { id: "maps", label: "Maps", icon: Map },
  { id: "detail", label: "Feature detail", icon: FlaskConical },
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
  if (!bundle) return <div className="m-8 text-slate-400">Loading…</div>;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <header className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight">JudgeLens</h1>
        <span className="text-sm text-slate-500">
          {bundle.meta.lens} · {bundle.meta.embed_model_id}
        </span>
      </header>

      <nav className="mb-6 flex flex-wrap items-center gap-1 rounded-2xl border border-edge bg-panel/60 p-1">
        {TABS.map((t) => {
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

      {tab === "overview" && <Overview bundle={bundle} />}
      {tab === "features" && <FeaturesTable features={bundle.features} />}
      {tab === "reward" && <WinRelevance features={bundle.features} />}
      {tab === "feature-panel" && (
        <FeaturePanel
          features={bundle.features}
          elicitation={bundle.elicitation}
          conditional={bundle.conditional}
          examples={bundle.examples}
          focus={featureFocus}
          onJumpPrompt={(pc) => { setFocusCell({ pc, cf: -1 }); setTab("prompts-outcome"); }}
        />
      )}
      {tab === "prompts-outcome" && (
        <PromptBrowser
          conditional={bundle.conditional}
          elicitation={bundle.elicitation}
          reportBattles={bundle.reportBattles}
          focus={promptFocus}
        />
      )}
      {tab === "elicitation" && <Elicitation data={bundle.elicitation} />}
      {tab === "general" && (
        <GeneralBehaviours
          features={bundle.features}
          elicitation={bundle.elicitation}
          examples={bundle.examples}
        />
      )}
      {tab === "confound" && <BiasScreen bias={bundle.bias} />}
      {tab === "prompts" && <PromptFeatures data={bundle.promptFeatures} />}
      {tab === "validation" && <Validation validation={bundle.validation} />}
      {tab === "report" && (
        <ReportCard
          diagnosis={bundle.diagnosis}
          features={bundle.features}
          reportBattles={bundle.reportBattles}
          examples={bundle.examples}
          headToHead={bundle.headToHead}
        />
      )}
      {tab === "maps" && (
        <MapsTab onJump={(pc, cf) => { setFocusCell({ pc, cf }); setTab("prompts-outcome"); }} />
      )}
      {tab === "detail" && <FeatureDetail features={bundle.features} examples={bundle.examples} />}
    </div>
  );
}
