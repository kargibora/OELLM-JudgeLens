import "./index.css";

export { default as PrefScopeViewer } from "./App";
export type { PrefScopeViewerProps, ViewId } from "./App";
export {
  configureDataSource,
  currentDataSource,
  loadBundle,
  loadDatasets,
  PrefScopeDataClient,
} from "./data";
export type { DatasetInfo } from "./data";
export * from "./types";
