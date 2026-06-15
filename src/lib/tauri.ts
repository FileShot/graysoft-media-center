import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
  EngineStatus,
  GalleryFilters,
  GalleryItem,
  HfGgufFile,
  HfGgufRepo,
  JobProgressEvent,
  JobRecord,
  ModelCatalog,
  ModelInfo,
  ModelSchema,
  PipelineType,
} from "./types";

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function getEngineStatus(): Promise<EngineStatus> {
  return invoke("get_engine_status_cmd");
}

export async function listModels(): Promise<ModelInfo[]> {
  return invoke("list_models");
}

export async function getModelSchema(modelId: string): Promise<ModelSchema> {
  return invoke("get_model_schema", { modelId });
}

export async function getDefaultParams(
  modelId: string,
): Promise<Record<string, unknown>> {
  return invoke("get_default_params", { modelId });
}

export async function submitGeneration(
  modelId: string,
  prompt: string,
  negativePrompt: string,
  params: Record<string, unknown>,
): Promise<string> {
  return invoke("submit_generation", {
    modelId,
    prompt,
    negativePrompt,
    params,
  });
}

export async function cancelJob(jobId: string): Promise<void> {
  return invoke("cancel_job", { jobId });
}

export async function clearQueue(dismissHistory: boolean): Promise<number> {
  return invoke("clear_queue", { dismissHistory });
}

export async function installPythonEnvironment(): Promise<string> {
  return invoke("install_python_environment");
}

export async function listPipelineTypes(): Promise<PipelineType[]> {
  return invoke("list_pipeline_types_cmd");
}

export async function loadModel(
  path: string,
  schemaId: string,
  name?: string,
): Promise<ModelInfo> {
  return invoke("load_model", { path, schemaId, name });
}

export async function unloadModel(modelId: string): Promise<void> {
  return invoke("unload_model", { modelId });
}

export async function listJobs(limit?: number): Promise<JobRecord[]> {
  return invoke("list_jobs", { limit });
}

export async function listGallery(
  filters: GalleryFilters,
): Promise<GalleryItem[]> {
  return invoke("list_gallery", { filters });
}

export async function deleteGalleryItem(id: string): Promise<void> {
  return invoke("delete_gallery_item", { id });
}

export async function exportGalleryItem(
  id: string,
  destPath: string,
): Promise<void> {
  return invoke("export_gallery_item", { id, destPath });
}

export async function getMediaDataUri(id: string): Promise<string> {
  return invoke("get_media_data_uri", { id });
}

export async function getDefaultOutputDirectory(): Promise<string> {
  return invoke("get_default_output_directory");
}

export async function getDefaultModelsDirectory(): Promise<string> {
  return invoke("get_default_models_directory");
}

export async function completeSetup(): Promise<void> {
  return invoke("complete_setup");
}

export async function getLogPath(): Promise<string> {
  return invoke("get_log_path");
}

export async function runInitialSetup(
  modelsDirectory: string,
  outputDirectory: string,
): Promise<ModelInfo> {
  return invoke("run_initial_setup", { modelsDirectory, outputDirectory });
}

export async function ensureDefaultVideoModel(): Promise<ModelInfo | null> {
  return invoke("ensure_default_video_model");
}

export async function listModelCatalog(): Promise<ModelCatalog> {
  return invoke("list_model_catalog");
}

export async function installCatalogModel(
  entryId: string,
  quantId?: string,
): Promise<ModelInfo> {
  return invoke("install_catalog_model", { entryId, quantId: quantId ?? null });
}

export async function searchHfGgufRepos(query?: string): Promise<HfGgufRepo[]> {
  return invoke("search_hf_gguf_repos", { query: query ?? "" });
}

export async function listHfRepoGguf(repoId: string): Promise<HfGgufFile[]> {
  return invoke("list_hf_repo_gguf", { repoId });
}

export async function installHfGgufModel(
  repoId: string,
  filename: string,
  schemaId: string,
  name: string,
): Promise<ModelInfo> {
  return invoke("install_hf_gguf_model", { repoId, filename, schemaId, name });
}

export function catalogModelId(entryId: string): string {
  return `catalog-${entryId}`;
}

export function onSetupProgress(
  handler: (payload: { message: string; progress: number }) => void,
): Promise<UnlistenFn> {
  return listen("setup-progress", (e) => handler(e.payload as never));
}

export function onJobQueued(
  handler: (payload: { jobId: string; modelId: string }) => void,
): Promise<UnlistenFn> {
  return listen("job-queued", (e) => handler(e.payload as never));
}

export function onJobProgress(
  handler: (event: JobProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<JobProgressEvent>("job-progress", (e) => handler(e.payload));
}

export function onJobComplete(
  handler: (payload: { jobId: string; galleryItemId: string }) => void,
): Promise<UnlistenFn> {
  return listen("job-complete", (e) => handler(e.payload as never));
}

export function onJobFailed(
  handler: (payload: { jobId: string; error: string }) => void,
): Promise<UnlistenFn> {
  return listen("job-failed", (e) => handler(e.payload as never));
}

export function onJobCancelled(
  handler: (payload: { jobId: string }) => void,
): Promise<UnlistenFn> {
  return listen("job-cancelled", (e) => handler(e.payload as never));
}

export function onJobsRecovered(
  handler: (payload: { count: number }) => void,
): Promise<UnlistenFn> {
  return listen("jobs-recovered", (e) => handler(e.payload as never));
}

export async function ensureGalleryThumb(id: string): Promise<string> {
  return invoke("ensure_gallery_thumb", { id });
}

export async function listCollections(): Promise<import("./types").Collection[]> {
  return invoke("list_collections");
}

export async function createCollection(name: string): Promise<import("./types").Collection> {
  return invoke("create_collection", { name });
}

export async function setGalleryCollection(
  itemId: string,
  collectionId: string | null,
): Promise<void> {
  return invoke("set_gallery_collection", { itemId, collectionId });
}
