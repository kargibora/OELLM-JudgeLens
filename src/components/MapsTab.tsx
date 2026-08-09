import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConceptCoactivation,
  Feature,
  FeatureMapData,
  MapData,
  PromptMapData,
  ResponseMapData,
} from "../types";
import { useDataArtifact, useDataClient, useMap } from "../data";
import { Card, Segmented, Skeleton } from "./ui";
import FeatureAtlasView from "./FeatureAtlasView";
import MapView from "./MapView";
import ResponseMapView from "./ResponseMapView";
import PromptMapView from "./PromptMapView";

type Sub = "features" | "responses" | "battle" | "prompt";
const SUBS: { id: Sub; label: string; artifact: string }[] = [
  { id: "features", label: "Feature atlas", artifact: "feature_map.json" },
  { id: "responses", label: "Response scatter", artifact: "response_map.json" },
  { id: "battle", label: "Battle scatter", artifact: "map.json" },
  { id: "prompt", label: "Prompt scatter", artifact: "prompt_map.json" },
];

// Map artifacts are fetched only after their sub-view is visited. The feature atlas is
// distinct from response/battle scatters: it contains every decoder axis exactly once.
export default function MapsTab({
  features,
  onJump,
  onOpenFeature,
  onOpenCoactivation,
  hasLabels = true,
}: {
  features: Feature[];
  onJump: (pc: number, cf: number) => void;
  onOpenFeature?: (featureId: number) => void;
  onOpenCoactivation?: (featureId: number) => void;
  hasLabels?: boolean;
}) {
  const client = useDataClient();
  const available = useMemo(
    () => SUBS.filter((item) => client.hasArtifact(item.artifact)),
    [client],
  );
  const [sub, setSub] = useState<Sub>(available[0]?.id ?? "features");
  const visited = useRef<Set<Sub>>(new Set([sub]));

  useEffect(() => {
    if (!available.some((item) => item.id === sub) && available[0]) setSub(available[0].id);
  }, [available, sub]);
  visited.current.add(sub);

  if (available.length === 0)
    return <Card><p className="text-sm text-slate-400">No map artifact is available for this dataset.</p></Card>;

  return (
    <div className="flex flex-col gap-4">
      {available.length > 1 && (
        <Segmented value={sub} onChange={(value) => setSub(value)}
          options={available.map((item) => ({ value: item.id, label: item.label }))} />
      )}

      {visited.current.has("features") && available.some((item) => item.id === "features") && (
        <div hidden={sub !== "features"}>
          <FeatureAtlasPane features={features} onOpenFeature={onOpenFeature}
            onOpenCoactivation={onOpenCoactivation} />
        </div>
      )}
      {visited.current.has("responses") && available.some((item) => item.id === "responses") && (
        <div hidden={sub !== "responses"}><ResponseMapPane /></div>
      )}
      {visited.current.has("battle") && available.some((item) => item.id === "battle") && (
        <div hidden={sub !== "battle"}><BattleMapPane /></div>
      )}
      {visited.current.has("prompt") && available.some((item) => item.id === "prompt") && (
        <div hidden={sub !== "prompt"}>
          <PromptMapPane onJump={onJump} hasLabels={hasLabels} />
        </div>
      )}
    </div>
  );
}

function Loading({ what }: { what: string }) {
  return <Card><p className="mb-2 text-xs text-slate-500">loading {what}…</p><Skeleton className="h-[520px] w-full" /></Card>;
}

function FeatureAtlasPane({
  features,
  onOpenFeature,
  onOpenCoactivation,
}: {
  features: Feature[];
  onOpenFeature?: (featureId: number) => void;
  onOpenCoactivation?: (featureId: number) => void;
}) {
  const map = useMap<FeatureMapData>("feature_map.json");
  const coactivation = useDataArtifact<ConceptCoactivation>("coactivation.json");
  if (map === undefined) return <Loading what="feature atlas" />;
  return <FeatureAtlasView map={map} features={features} coactivation={coactivation}
    onOpenFeature={onOpenFeature} onOpenCoactivation={onOpenCoactivation} />;
}

function BattleMapPane() {
  const map = useMap<MapData>("map.json");
  if (map === undefined) return <Loading what="battle scatter" />;
  return <MapView map={map} />;
}

function ResponseMapPane() {
  const map = useMap<ResponseMapData>("response_map.json");
  if (map === undefined) return <Loading what="response scatter" />;
  return <ResponseMapView map={map} />;
}

function PromptMapPane({ onJump, hasLabels }: { onJump: (pc: number, cf: number) => void; hasLabels: boolean }) {
  const map = useMap<PromptMapData>("prompt_map.json");
  if (map === undefined) return <Loading what="prompt scatter" />;
  return <PromptMapView map={map} onJump={onJump} hasLabels={hasLabels} />;
}
