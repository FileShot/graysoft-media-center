import { create } from "zustand";
import type {
  AppSettings,
  EngineStatus,
  GalleryItem,
  JobRecord,
  ModelInfo,
  ModelSchema,
  ProgressPoint,
  ToastItem,
} from "../lib/types";

interface AppStore {
  settings: AppSettings | null;
  engineStatus: EngineStatus | null;
  models: ModelInfo[];
  selectedModelId: string | null;
  schema: ModelSchema | null;
  params: Record<string, unknown>;
  prompt: string;
  negativePrompt: string;
  mediaMode: "image" | "video" | "all";
  jobs: JobRecord[];
  jobMessages: Record<string, string>;
  jobProgressHistory: Record<string, ProgressPoint[]>;
  jobMessageHistory: Record<string, string[]>;
  toasts: ToastItem[];
  gallery: GalleryItem[];
  galleryFilters: { mediaType: string; modelId: string; search: string; collectionId: string };
  previewItem: GalleryItem | null;
  showSettings: boolean;
  showSetup: boolean;
  showLoadModel: boolean;
  showModelCatalog: boolean;
  sidebarExpanded: boolean;
  sidebarPanel: "models" | null;
  queueExpanded: boolean;
  isGenerating: boolean;
  activeView: "create" | "browse" | "models" | "activity";
  layout: {
    galleryHeight: number;
    promptSplitPercent: number;
  };

  setSettings: (s: AppSettings) => void;
  setEngineStatus: (s: EngineStatus) => void;
  setModels: (m: ModelInfo[]) => void;
  setSelectedModelId: (id: string | null) => void;
  setSchema: (s: ModelSchema | null) => void;
  setParams: (p: Record<string, unknown>) => void;
  updateParam: (key: string, value: unknown) => void;
  setPrompt: (p: string) => void;
  setNegativePrompt: (p: string) => void;
  setMediaMode: (m: "image" | "video" | "all") => void;
  setJobs: (j: JobRecord[]) => void;
  patchJob: (id: string, patch: Partial<JobRecord>) => void;
  setJobMessage: (id: string, message: string) => void;
  appendJobProgress: (id: string, point: ProgressPoint) => void;
  appendJobMessage: (id: string, message: string) => void;
  addToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
  setGallery: (g: GalleryItem[]) => void;
  setGalleryFilters: (f: Partial<AppStore["galleryFilters"]>) => void;
  setPreviewItem: (item: GalleryItem | null) => void;
  setShowSettings: (v: boolean) => void;
  setShowSetup: (v: boolean) => void;
  setShowLoadModel: (v: boolean) => void;
  setShowModelCatalog: (v: boolean) => void;
  setSidebarExpanded: (v: boolean) => void;
  setSidebarPanel: (v: "models" | null) => void;
  setQueueExpanded: (v: boolean) => void;
  setIsGenerating: (v: boolean) => void;
  setActiveView: (v: AppStore["activeView"]) => void;
  setLayout: (patch: Partial<AppStore["layout"]>) => void;
}

const LAYOUT_KEY = "gmc-layout";

function loadLayout(): AppStore["layout"] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppStore["layout"];
      return {
        galleryHeight: parsed.galleryHeight ?? 220,
        promptSplitPercent: parsed.promptSplitPercent ?? 48,
      };
    }
  } catch {
    /* ignore */
  }
  return { galleryHeight: 220, promptSplitPercent: 48 };
}

function saveLayout(layout: AppStore["layout"]) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

export const useAppStore = create<AppStore>((set) => ({
  settings: null,
  engineStatus: null,
  models: [],
  selectedModelId: null,
  schema: null,
  params: {},
  prompt: "",
  negativePrompt: "",
  mediaMode: "video",
  jobs: [],
  jobMessages: {},
  jobProgressHistory: {},
  jobMessageHistory: {},
  toasts: [],
  gallery: [],
  galleryFilters: { mediaType: "all", modelId: "all", search: "", collectionId: "all" },
  previewItem: null,
  showSettings: false,
  showSetup: false,
  showLoadModel: false,
  showModelCatalog: false,
  sidebarExpanded: false,
  sidebarPanel: null,
  queueExpanded: false,
  isGenerating: false,
  activeView: "create",
  layout: loadLayout(),

  setSettings: (settings) => set({ settings }),
  setEngineStatus: (engineStatus) => set({ engineStatus }),
  setModels: (models) => set({ models }),
  setSelectedModelId: (selectedModelId) => set({ selectedModelId }),
  setSchema: (schema) => set({ schema }),
  setParams: (params) => set({ params }),
  updateParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [key]: value } })),
  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setMediaMode: (mediaMode) => set({ mediaMode }),
  setJobs: (jobs) => set({ jobs }),
  patchJob: (id, patch) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    })),
  setJobMessage: (id, message) =>
    set((s) => ({ jobMessages: { ...s.jobMessages, [id]: message } })),
  appendJobProgress: (id, point) =>
    set((s) => {
      const prev = s.jobProgressHistory[id] ?? [];
      const next = [...prev, point].slice(-200);
      return { jobProgressHistory: { ...s.jobProgressHistory, [id]: next } };
    }),
  appendJobMessage: (id, message) =>
    set((s) => {
      const prev = s.jobMessageHistory[id] ?? [];
      const next = [...prev, message].slice(-20);
      return {
        jobMessages: { ...s.jobMessages, [id]: message },
        jobMessageHistory: { ...s.jobMessageHistory, [id]: next },
      };
    }),
  addToast: (toast) =>
    set((s) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      window.setTimeout(() => {
        useAppStore.getState().dismissToast(id);
      }, 8000);
      return { toasts: [...s.toasts, { ...toast, id }] };
    }),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setGallery: (gallery) => set({ gallery }),
  setGalleryFilters: (f) =>
    set((s) => ({ galleryFilters: { ...s.galleryFilters, ...f } })),
  setPreviewItem: (previewItem) => set({ previewItem }),
  setShowSettings: (showSettings) => set({ showSettings }),
  setShowSetup: (showSetup) => set({ showSetup }),
  setShowLoadModel: (showLoadModel) => set({ showLoadModel }),
  setShowModelCatalog: (showModelCatalog) => set({ showModelCatalog }),
  setSidebarExpanded: (sidebarExpanded) => set({ sidebarExpanded }),
  setSidebarPanel: (sidebarPanel) => set({ sidebarPanel }),
  setQueueExpanded: (queueExpanded) => set({ queueExpanded }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setActiveView: (activeView) => set({ activeView }),
  setLayout: (patch) =>
    set((s) => {
      const layout = { ...s.layout, ...patch };
      saveLayout(layout);
      return { layout };
    }),
}));
