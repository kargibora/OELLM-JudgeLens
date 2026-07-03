import { useRef, useState } from "react";
import type { MapData, PromptMapData, ResponseMapData } from "../types";
import { useMap } from "../data";
import { Card, Segmented, Skeleton } from "./ui";
import MapView from "./MapView";
import ResponseMapView from "./ResponseMapView";
import PromptMapView from "./PromptMapView";

type Sub = "battle" | "feature" | "prompt";
const SUBS: { id: Sub; label: string }[] = [
  { id: "battle", label: "Battle map" },
  { id: "feature", label: "Feature map" },
  { id: "prompt", label: "Prompt map" },
];

// One tab for all three UMAP maps. Each sub-map's data is fetched lazily on first
// visit (via useMap) so startup isn't blocked on tens of MB of map JSON; panes stay
// mounted once visited (hidden when inactive) so their state + parsed data persist.
export default function MapsTab({ onJump, hasLabels = true }: { onJump: (pc: number, cf: number) => void; hasLabels?: boolean }) {
  const [sub, setSub] = useState<Sub>("battle");
  const visited = useRef<Set<Sub>>(new Set(["battle"]));
  visited.current.add(sub);

  return (
    <div className="flex flex-col gap-4">
      <Segmented value={sub} onChange={(v) => setSub(v)}
        options={SUBS.map((s) => ({ value: s.id, label: s.label }))} />

      {visited.current.has("battle") && (
        <div hidden={sub !== "battle"}>
          <BattleMapPane />
        </div>
      )}
      {visited.current.has("feature") && (
        <div hidden={sub !== "feature"}>
          <FeatureMapPane />
        </div>
      )}
      {visited.current.has("prompt") && (
        <div hidden={sub !== "prompt"}>
          <PromptMapPane onJump={onJump} hasLabels={hasLabels} />
        </div>
      )}
    </div>
  );
}

function Loading({ what }: { what: string }) {
  return (
    <Card>
      <p className="mb-2 text-xs text-slate-500">loading {what}…</p>
      <Skeleton className="h-[420px] w-full" />
    </Card>
  );
}

function BattleMapPane() {
  const map = useMap<MapData>("map.json");
  if (map === undefined) return <Loading what="battle map" />;
  return <MapView map={map} />;
}

function FeatureMapPane() {
  const map = useMap<ResponseMapData>("response_map.json");
  if (map === undefined) return <Loading what="feature map" />;
  return <ResponseMapView map={map} />;
}

function PromptMapPane({ onJump, hasLabels }: { onJump: (pc: number, cf: number) => void; hasLabels: boolean }) {
  const map = useMap<PromptMapData>("prompt_map.json");
  if (map === undefined) return <Loading what="prompt map" />;
  return <PromptMapView map={map} onJump={onJump} hasLabels={hasLabels} />;
}
