export interface AppSettings {
  modelsDirectory: string;
  outputDirectory: string;
  theme: string;
  setupComplete: boolean;
}

export interface EngineStatus {
  ready: boolean;
  message: string;
  cudaAvailable: boolean;
  deviceName: string;
  vramGb: number;
  pythonReady: boolean;
  sitePackagesReady: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  mediaType: string;
  schemaId: string;
  path: string;
  available: boolean;
  missingRequirements: string[];
}

export interface QuantVariant {
  id: string;
  ggufFile?: string;
  ggufFiles?: string[];
  sizeGb: number;
  vramGb: number;
  label: string;
}

export interface CatalogEntry {
  id: string;
  name: string;
  mediaType: "image" | "video";
  schemaId: string;
  description: string;
  sizeGb: number;
  vramGb: number;
  minVramGb?: number;
  recommended: boolean;
  downloadType: string;
  tags?: string[];
  quantVariants?: QuantVariant[];
  ggufRepo?: string;
  ggufFile?: string;
  ggufFiles?: string[];
  componentsRepo?: string;
  hfRepo?: string;
}

export interface HfGgufRepo {
  id: string;
  name: string;
  downloads?: number;
  tags?: string[];
}

export interface HfGgufFile {
  filename: string;
  quant: string;
  sizeBytes?: number;
}

export interface ModelCatalog {
  entries: CatalogEntry[];
}

export interface PipelineType {
  id: string;
  name: string;
  mediaType: string;
}

export interface FieldBinding {
  nodeId?: string;
  input: string;
  transform?: string;
}

export interface SelectOption {
  label: string;
  value: string | number | boolean;
}

export interface ResolutionPreset {
  label: string;
  width: number;
  height: number;
}

export interface ParameterField {
  id: string;
  label: string;
  type: string;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: SelectOption[];
  presets?: ResolutionPreset[];
  bindings?: FieldBinding[];
  visibleWhen?: { field: string; equals: unknown };
}

export interface ParameterGroup {
  id: string;
  label: string;
  fields: ParameterField[];
}

export interface ModelSchema {
  id: string;
  name: string;
  mediaType: string;
  groups: ParameterGroup[];
}

export interface JobRecord {
  id: string;
  modelId: string;
  status: string;
  progress: number;
  prompt: string;
  negativePrompt: string;
  paramsJson: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: string;
}

export interface GalleryItem {
  id: string;
  mediaType: string;
  modelId: string;
  prompt: string;
  negativePrompt: string;
  paramsJson: Record<string, unknown>;
  filePath: string;
  thumbPath: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  seed: number | null;
  createdAt: string;
  jobId: string | null;
  status: string;
  collectionId: string | null;
}

export interface GalleryFilters {
  mediaType?: string;
  modelId?: string;
  search?: string;
  collectionId?: string;
  limit?: number;
  offset?: number;
}

export interface ProgressPoint {
  progress: number;
  message: string;
  phase?: string;
  step?: number;
  totalSteps?: number;
  elapsedMs?: number;
  timestamp: number;
}

export interface JobProgressEvent {
  jobId: string;
  progress: number;
  status: string;
  message: string;
  phase?: string;
  step?: number;
  totalSteps?: number;
  elapsedMs?: number;
}

export interface ToastItem {
  id: string;
  message: string;
  type: "info" | "error" | "success";
  action?: { label: string; onClick: () => void };
}
