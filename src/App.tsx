import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRightLeft, BarChart3, ClipboardList, FlaskConical, Grid3x3,
  LayoutDashboard, Map, MessageSquare, ScatterChart, Split, Table2,
} from "lucide-react";
import type { Bundle } from "./types";
import { loadBundle } from "./data";
import Overview from "./components/Overview";
import FeaturesTable from "./components/FeaturesTable";
import WinRelevance from "./components/WinRelevance";
import Validation from "./components/Validation";
import ModelDiagnosis from "./components/ModelDiagnosis";
import FeatureDetail from "./components/FeatureDetail";
import MapView from "./components/MapView";
import ResponseMapView from "./components/ResponseMapView";
import PromptMapView from "./components/PromptMapView";
import DeltaHeatmap from "./components/DeltaHeatmap";
import Elicitation from "./components/Elicitation";
import ConditionalWinRelevance from "./components/ConditionalWinRelevance";
import BiasScreen from "./components/BiasScreen";
import PromptFeatures from "./components/PromptFeatures";
import ReportCard from "./components/ReportCard";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "features", label: "Features", icon: Table2 },
  { id: "reward", label: "Win relevance", icon: BarChart3 },
  { id: "conditional", label: "Conditional δ", icon: Split },
  { id: "elicitation", label: "Prompt → Response", icon: ArrowRightLeft },
  { id: "relationship", label: "Relationship Δ", icon: Grid3x3 },
  { id: "confound", label: "Confound screen", icon: AlertTriangle },
  { id: "prompts", label: "Prompt concepts", icon: MessageSquare },
  { id: "validation", label: "Validation", icon: ScatterChart },
  { id: "diagnosis", label: "Model diagnosis", icon: Activity },
  { id: "report", label: "Report card", icon: ClipboardList },
  { id: "map", label: "Map", icon: Map },
  { id: "responsemap", label: "Feature map", icon: ScatterChart },
  { id: "promptmap", label: "Prompt map", icon: MessageSquare },
  { id: "detail", label: "Feature detail", icon: FlaskConical },
] as const;

export default function App() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("overview");
  // cross-tab link: ★ in the prompt-map panel jumps to its Δ cell in the heatmap
  const [focusCell, setFocusCell] = useState<{ pc: number; cf: number } | null>(null);

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

      <nav className="mb-6 flex flex-wrap gap-1 rounded-2xl border border-edge bg-panel/60 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                active ? "bg-accent text-white" : "text-slate-400 hover:bg-edge/50 hover:text-slate-200"
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "overview" && <Overview bundle={bundle} />}
      {tab === "features" && <FeaturesTable features={bundle.features} />}
      {tab === "reward" && <WinRelevance features={bundle.features} />}
      {tab === "conditional" && <ConditionalWinRelevance data={bundle.conditional} />}
      {tab === "elicitation" && <Elicitation data={bundle.elicitation} />}
      {tab === "relationship" && <DeltaHeatmap delta={bundle.delta} focus={focusCell} />}
      {tab === "confound" && <BiasScreen bias={bundle.bias} />}
      {tab === "prompts" && <PromptFeatures data={bundle.promptFeatures} />}
      {tab === "validation" && <Validation validation={bundle.validation} />}
      {tab === "diagnosis" && <ModelDiagnosis diagnosis={bundle.diagnosis} features={bundle.features} />}
      {tab === "report" && <ReportCard diagnosis={bundle.diagnosis} features={bundle.features} />}
      {tab === "map" && <MapView map={bundle.map} />}
      {tab === "responsemap" && <ResponseMapView map={bundle.responseMap} />}
      {tab === "promptmap" && (
        <PromptMapView
          map={bundle.promptMap}
          onJump={(pc, cf) => { setFocusCell({ pc, cf }); setTab("relationship"); }}
        />
      )}
      {tab === "detail" && <FeatureDetail features={bundle.features} examples={bundle.examples} />}
    </div>
  );
}
