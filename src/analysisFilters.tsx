import { createContext, useContext } from "react";
import type { Feature } from "./types";

export type AnswerTypeFilter = "all" | "behavioral" | "prompt_specific" | "mixed_or_unclear" | "unclassified";

export function answerTypeOf(feature: Feature | undefined): Exclude<AnswerTypeFilter, "all"> {
  const value = feature?.semantic_family;
  if (value === "behavioral" || value === "prompt_specific" || value === "mixed_or_unclear")
    return value;
  return "unclassified";
}

export interface AnalysisFilters {
  /** Corpus grouping exported by PrefScope: normally language, sometimes source. */
  group: string;
  groupColumn: string;
  /** LLM-assigned answer concept family. Prompt concepts are not filtered by this. */
  answerType: AnswerTypeFilter;
}

export interface AnalysisFilterContextValue {
  filters: AnalysisFilters;
  setGroup: (group: string, column?: string) => void;
  setAnswerType: (answerType: AnswerTypeFilter) => void;
  reset: () => void;
}

const EMPTY: AnalysisFilterContextValue = {
  filters: { group: "", groupColumn: "language", answerType: "all" },
  setGroup: () => undefined,
  setAnswerType: () => undefined,
  reset: () => undefined,
};

export const AnalysisFilterContext = createContext<AnalysisFilterContextValue>(EMPTY);

export function useAnalysisFilters() {
  return useContext(AnalysisFilterContext);
}
