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
  return (await res.json()) as T;
}

export async function loadBundle(): Promise<Bundle> {
  const [meta, features, validation, diagnosis, examples, map] = await Promise.all([
    getJSON<Bundle["meta"]>("meta.json"),
    getJSON<Bundle["features"]>("features.json"),
    getJSON<Bundle["validation"]>("validation.json"),
    getJSON<Bundle["diagnosis"]>("diagnosis.json", true),
    getJSON<Bundle["examples"]>("examples.json", true),
    getJSON<Bundle["map"]>("map.json", true),
  ]);
  return {
    meta: meta!,
    features: features!,
    validation: validation ?? [],
    diagnosis: diagnosis ?? null,
    examples: examples ?? null,
    map: map ?? null,
  };
}

export const fmt = (x: number | null | undefined, d = 3) =>
  x === null || x === undefined || Number.isNaN(x) ? "—" : x.toFixed(d);

export const pct = (x: number | null | undefined, d = 1) =>
  x === null || x === undefined || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(d)}%`;
