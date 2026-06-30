import type { Bundle } from "./types";

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
  const [meta, features, validation, diagnosis, examples, map, delta, bias, promptFeatures, promptMap, responseMap, conditional, elicitation, reportBattles] =
    await Promise.all([
      getJSON<Bundle["meta"]>("meta.json"),
      getJSON<Bundle["features"]>("features.json"),
      getJSON<Bundle["validation"]>("validation.json"),
      getJSON<Bundle["diagnosis"]>("diagnosis.json", true),
      getJSON<Bundle["examples"]>("examples.json", true),
      getJSON<Bundle["map"]>("map.json", true),
      getJSON<Bundle["delta"]>("delta.json", true),
      getJSON<Bundle["bias"]>("bias_screen.json", true),
      getJSON<Bundle["promptFeatures"]>("prompt_features.json", true),
      getJSON<Bundle["promptMap"]>("prompt_map.json", true),
      getJSON<Bundle["responseMap"]>("response_map.json", true),
      getJSON<Bundle["conditional"]>("conditional.json", true),
      getJSON<Bundle["elicitation"]>("elicitation.json", true),
      getJSON<Bundle["reportBattles"]>("report_battles.json", true),
    ]);
  return {
    meta: meta!,
    features: features!,
    validation: validation ?? [],
    diagnosis: diagnosis ?? null,
    examples: examples ?? null,
    map: map ?? null,
    delta: delta ?? null,
    bias: bias ?? null,
    promptFeatures: promptFeatures ?? null,
    promptMap: promptMap ?? null,
    responseMap: responseMap ?? null,
    conditional: conditional ?? null,
    elicitation: elicitation ?? null,
    reportBattles: reportBattles ?? null,
  };
}

export const fmt = (x: number | null | undefined, d = 3) =>
  x === null || x === undefined || Number.isNaN(x) ? "—" : x.toFixed(d);

export const pct = (x: number | null | undefined, d = 1) =>
  x === null || x === undefined || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(d)}%`;
