import { useRef, useState } from "react";
import type { MapData, PromptMapData, ResponseMapData } from "../types";
import { useMap } from "../data";
import { Card } from "./ui";
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
export default function MapsTab({ onJump }: { onJump: (pc: number, cf: number) => void }) {
  const [sub, setSub] = useState<Sub>("battle");
  const visited = useRef<Set<Sub>>(new Set(["battle"]));
  visited.current.add(sub);

  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex w-fit rounded-xl border border-edge bg-panel/60 p-1">
        {SUBS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              sub === s.id ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

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
          <PromptMapPane onJump={onJump} />
        </div>
      )}
    </div>
  );
}

function Loading({ what }: { what: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-400">Loading {what}…</p>
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

function PromptMapPane({ onJump }: { onJump: (pc: number, cf: number) => void }) {
  const map = useMap<PromptMapData>("prompt_map.json");
  if (map === undefined) return <Loading what="prompt map" />;
  return <PromptMapView map={map} onJump={onJump} />;
}
