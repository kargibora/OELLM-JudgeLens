import { useEffect, useState } from "react";
import type {
  Bundle, ConditionalBundle, ConditionalData, DeltaBundle, DeltaData,
  MapData, PromptMapData, ResponseMapData,
} from "./types";

// conditional.json / delta.json are now `{raw, clustered}` wrappers. Older bundles wrote
// the flat object directly — normalize those to `{raw: flat, clustered: null}` so the
// viewer handles both without a re-export.
function wrapKeyspace<T>(d: unknown): { raw: T | null; clustered: T | null } | null {
  if (d == null || typeof d !== "object") return null; // guard: `in` throws on primitives
  const o = d as Record<string, unknown>;
  if ("raw" in o || "clustered" in o)
    return { raw: (o.raw as T) ?? null, clustered: (o.clustered as T) ?? null };
  return { raw: d as T, clustered: null }; // legacy flat shape
}

// resolve data files relative to the deploy base (works at "/" and under
// GitHub Pages "/<repo>/"); BASE_URL is "./" given vite base: "./"
const DATA = `${import.meta.env.BASE_URL}data/`.replace(/\/{2,}/g, "/");

async function getJSON<T>(name: string, optional = false): Promise<T | null> {
  const path = `${DATA}${name}`;
  const res = await fetch(path);
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`failed to load ${path} (${res.status})`);
  }
  // a missing public file can be answered by the dev server's SPA fallback —
  // a 200 with index.html. parse() would then choke on "<!doctype". for optional
  // files (e.g. prompt_map.json before it's generated) treat that as absent.
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    if (optional) return null;
    throw new Error(`failed to parse ${path} as JSON (got ${res.headers.get("content-type")})`);
  }
}

export async function loadBundle(): Promise<Bundle> {
  // NOTE: the three UMAP maps (map/prompt_map/response_map, ~tens of MB) are NOT loaded
  // here — they're fetched lazily by useMap() when the Maps tab opens, so startup isn't
  // blocked on the heaviest JSON parses in the app.
  const [meta, features, validation, diagnosis, examples, delta, bias, promptFeatures, conditional, elicitation, reportBattles] =
    await Promise.all([
      getJSON<Bundle["meta"]>("meta.json"),
      getJSON<Bundle["features"]>("features.json"),
      getJSON<Bundle["validation"]>("validation.json"),
      getJSON<Bundle["diagnosis"]>("diagnosis.json", true),
      getJSON<Bundle["examples"]>("examples.json", true),
      getJSON<unknown>("delta.json", true),
      getJSON<Bundle["bias"]>("bias_screen.json", true),
      getJSON<Bundle["promptFeatures"]>("prompt_features.json", true),
      getJSON<unknown>("conditional.json", true),
      getJSON<Bundle["elicitation"]>("elicitation.json", true),
      getJSON<Bundle["reportBattles"]>("report_battles.json", true),
    ]);
  return {
    meta: meta!,
    features: features!,
    validation: validation ?? [],
    diagnosis: diagnosis ?? null,
    examples: examples ?? null,
    delta: wrapKeyspace<DeltaData>(delta) as DeltaBundle | null,
    bias: bias ?? null,
    promptFeatures: promptFeatures ?? null,
    conditional: wrapKeyspace<ConditionalData>(conditional) as ConditionalBundle | null,
    elicitation: elicitation ?? null,
    reportBattles: reportBattles ?? null,
  };
}

// --- lazy map loading -------------------------------------------------------
// The maps are large and exploratory; fetch + parse each one only when its sub-tab
// is first opened, and cache the parsed result (re-visits are instant, no re-parse).
const mapCache = new Map<string, unknown>();
const mapInflight = new Map<string, Promise<unknown>>();

async function loadMap<T>(name: string): Promise<T | null> {
  if (mapCache.has(name)) return mapCache.get(name) as T | null;
  if (!mapInflight.has(name)) {
    mapInflight.set(
      name,
      getJSON<T>(name, true)
        .then((d) => {
          mapCache.set(name, d); // cache null (absent) too, so we don't refetch
          mapInflight.delete(name);
          return d;
        })
        .catch(() => {
          // hard fetch failure (e.g. offline): clear the inflight entry so a later
          // visit can retry, and don't poison the cache
          mapInflight.delete(name);
          return null;
        })
    );
  }
  return mapInflight.get(name) as Promise<T | null>;
}

// undefined = still loading, null = file absent, T = loaded
export function useMap<T = MapData | PromptMapData | ResponseMapData>(
  name: string
): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(() =>
    mapCache.has(name) ? (mapCache.get(name) as T | null) : undefined
  );
  useEffect(() => {
    let live = true;
    loadMap<T>(name).then((d) => {
      if (live) setData(d);
    });
    return () => {
      live = false;
    };
  }, [name]);
  return data;
}

export const fmt = (x: number | null | undefined, d = 3) =>
  x === null || x === undefined || Number.isNaN(x) ? "—" : x.toFixed(d);

export const pct = (x: number | null | undefined, d = 1) =>
  x === null || x === undefined || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(d)}%`;
