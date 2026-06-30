export interface Meta {
  lens: string;
  embed_model_id: string | null;
  m_total: number;
  k: number;
  input_dim: number;
  n_battles: number;
  ev: number | null;
  n_verified: number | null;
  loo_r2: number | null;
  n_models: number | null;
}

export interface Feature {
  feature_id: number;
  concept?: string;
  correlation?: number;
  sign?: number;
  p_bonferroni?: number;
  fidelity_pass?: boolean;
  // full fidelity verdict (un-dropped from feature_fidelity.csv)
  fidelity_n?: number; // # held-out pairs the verifier judged
  precision?: number;
  recall?: number;
  f1?: number;
  fp_rate?: number; // false-positive rate on silent pairs
  agreement?: number;
  // win relevance: raw gap AND length-controlled AME (WIMHF App. A.2)
  win_assoc?: number;
  fire_rate?: number;
  win_significant?: boolean;
  n_fire?: number; // battles where the feature fires
  win_rate_a_more?: number;
  win_rate_a_less?: number;
  delta_win_rate?: number; // length-controlled Δwin-rate — the honest quantity
  delta_win_significant?: boolean;
  cluster_id?: number;
  behavior?: string;
}

export interface ModelValidation {
  model: string;
  n_battles: number;
  predicted_score: number;
  predicted_score_loo?: number;
  actual_win_rate: number;
}

export interface DiagnosisRow {
  win_rate: number;
  n_battles: number;
  net_direction: number[];
  delta_vs_pool: number[];
  // report-card extras (added by export_viewer_data.py; absent in older bundles)
  fire_rate?: number[]; // per-feature activation rate for this model, parallel to features
  prompt_types?: { concept: string; win_rate: number; n: number }[];
  // per-model prompt-concept -> response-concept -> within-prompt Δwin edges
  relations?: { prompt_concept: string; response_concept: string; delta_win: number; n: number }[];
}

export interface Diagnosis {
  features: number[];
  concepts: string[];
  models: string[];
  rows: Record<string, DiagnosisRow>;
  clusters?: number[]; // cluster_id parallel to `features`
  behaviors?: Record<string, string>;
  // honest stub written when no oriented bank exists (export couldn't build a diagnosis)
  error?: string;
  message?: string;
}

export interface Example {
  z: number;
  prompt: string;
  model_a: string;
  model_b: string;
  completion_a: string;
  completion_b: string;
}

export type Examples = Record<string, Example[]>;

export interface MapPoint {
  x: number;
  y: number;
  f: number; // dominant verified feature_id, or -1 if nothing fired
  m?: number; // dominant verified-feature activation magnitude (0 = noise)
  ma: string;
  mb: string;
  p: string; // prompt (clipped)
  ca?: string; // completion A (clipped)
  cb?: string; // completion B (clipped)
}

export interface MapData {
  n_total: number;
  n_sampled: number;
  metric: string;
  mode?: string; // sampling mode: random | top-activating | hybrid
  features: number[];
  concepts: string[];
  points: MapPoint[];
  clusters?: number[]; // cluster_id parallel to `features`
  behaviors?: Record<string, string>; // cluster_id -> behavior name
}

// --- prompt-space map (one point per battle, positioned by prompt latents) ---
export interface PromptMapPoint {
  x: number;
  y: number;
  f: number; // dominant prompt feature_id
  m?: number; // its activation magnitude
  pc: number; // prompt concept/cluster key (matches delta keyspace)
  ma: string;
  mb: string;
  win: "A" | "B"; // human-preferred slot
  p: string; // prompt text (clipped)
  ca?: string; // response A (clipped)
  cb?: string; // response B (clipped)
  pf: { id: number; concept: string; z: number }[]; // prompt features firing (positive)
  cf: { id: number; concept: string; z: number; delta: number | null; sig: boolean }[]; // completion contrast (+ winner / − loser)
}
export interface PromptMapData {
  n_total: number;
  n_sampled: number;
  mode?: string;
  features: number[];
  concepts: string[];
  points: PromptMapPoint[];
  clusters?: number[]; // cluster_id parallel to `features`
  behaviors?: Record<string, string>;
}

// --- response-level feature map (one point per single response, individual lens) ---
export interface ResponseMapPoint {
  x: number;
  y: number;
  f: number; // dominant verified feature_id, or -1
  m?: number; // its activation magnitude
  side: "A" | "B"; // which response of the battle
  model: string;
  p: string; // prompt (clipped)
  r: string; // THIS response (clipped)
}
export interface ResponseMapData {
  n_total: number;
  n_sampled: number;
  mode?: string;
  features: number[];
  concepts: string[];
  points: ResponseMapPoint[];
  clusters?: number[];
  behaviors?: Record<string, string>;
}

// --- prompt-conditioned delta (relationship heatmap) ---
export interface DeltaCol {
  id: number;
  concept?: string | null;
  behavior?: string | null;
  cluster_id?: number | null;
  win_assoc?: number | null;
  fidelity_pass?: boolean | null;
  confound_entangled?: boolean | null;
}
export interface DeltaCell {
  pc: number; // prompt concept id
  cf: number; // completion feature id
  delta: number;
  p: number | null; // p_bonferroni
  stable: boolean; // split-half sign stability
}
export interface DeltaData {
  prompt_concepts: { id: number; name: string }[];
  completion_features: DeltaCol[];
  cells: DeltaCell[];
  n_cells: number;
  n_significant: number;
}

// --- confound screen ---
export interface BiasRow {
  feature_id: number;
  concept?: string;
  win_assoc?: number;
  correlation?: number;
  corr_confound_len?: number;
  correlation_resid_len?: number;
  confound_entangled?: boolean;
  fidelity_pass?: boolean;
}

// --- prompt-lens concepts ---
export interface PromptFeature {
  feature_id: number;
  concept?: string;
  fidelity_pass?: boolean;
  cluster_id?: number;
  behavior?: string;
  correlation?: number;
}
export interface PromptFeatures {
  features: PromptFeature[];
}

// --- conditional δ_{f,k}: behavior win-relevance WITHIN each prompt type ---
export interface CondCell {
  pc: number; // prompt concept/type id
  f: number; // completion feature id
  delta: number; // length-controlled Δwin-rate within this prompt type
  p: number | null; // cond_p_bonferroni
  sig: boolean; // cond_significant
  n: number | null; // battles of this prompt type
}
export interface ConditionalData {
  prompt_concepts: { id: number; name: string }[];
  features: { id: number; concept: string }[];
  cells: CondCell[];
  n_cells: number;
  n_significant: number;
}

// --- prompt → response elicitation (co-activation lift, preference-independent) ---
export interface ElicEdge {
  px: number; // prompt feature id
  cy: number; // response (completion) feature id
  lift: number; // P(Y|X)/P(Y)
  l2: number; // log2 lift (signed; >0 elicits, <0 suppresses)
  pyx: number; // P(Y fires | X fires)
  py: number; // base rate P(Y)
  nx: number; // responses where X fires
  nco: number; // X&Y co-occurrences
  p: number | null; // p_bonferroni
  sig: boolean;
}
export interface ElicitationData {
  prompt_concepts: { id: number; concept: string }[];
  response_concepts: { id: number; concept: string }[];
  edges: ElicEdge[];
  n_edges: number; // full tested-and-reported count
  n_significant: number; // significant among ALL tested
  n_shown?: number; // how many edges survived the payload cap (≤ n_edges)
}

// --- report-card drill-in: per (model × prompt-concept) sample battles ---
export interface ReportBattle {
  prompt: string;
  self: string; // this model's answer
  other: string; // the opponent's answer
  outcome: "win" | "loss" | "tie";
}
// { model: { promptConceptName: ReportBattle[] } }
export type ReportBattles = Record<string, Record<string, ReportBattle[]>>;

export interface Bundle {
  meta: Meta;
  features: Feature[];
  validation: ModelValidation[];
  diagnosis: Diagnosis | null;
  examples: Examples | null;
  map: MapData | null;
  delta: DeltaData | null;
  bias: BiasRow[] | null;
  promptFeatures: PromptFeatures | null;
  promptMap: PromptMapData | null;
  responseMap: ResponseMapData | null;
  conditional: ConditionalData | null;
  elicitation: ElicitationData | null;
  reportBattles: ReportBattles | null;
}
