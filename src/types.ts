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
  win_assoc?: number;
  fire_rate?: number;
  win_significant?: boolean;
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
}

export interface Diagnosis {
  features: number[];
  concepts: string[];
  models: string[];
  rows: Record<string, DiagnosisRow>;
  clusters?: number[]; // cluster_id parallel to `features`
  behaviors?: Record<string, string>;
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

export interface Bundle {
  meta: Meta;
  features: Feature[];
  validation: ModelValidation[];
  diagnosis: Diagnosis | null;
  examples: Examples | null;
  map: MapData | null;
}
