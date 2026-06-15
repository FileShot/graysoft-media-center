import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "./store/appStore";
import {
  ensureDefaultVideoModel,
  getDefaultParams,
  getEngineStatus,
  getLogPath,
  getModelSchema,
  getSettings,
  installPythonEnvironment,
  listGallery,
  listJobs,
  listModels,
  onJobCancelled,
  onJobComplete,
  onJobFailed,
  onJobProgress,
  onJobQueued,
  onJobsRecovered,
} from "./lib/tauri";
import type { ModelInfo } from "./lib/types";
import { CustomTitleBar } from "./components/layout/CustomTitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import { MainWorkspace } from "./components/layout/MainWorkspace";
import { SetupWizard } from "./components/SetupWizard";
import { SettingsModal } from "./components/SettingsModal";
import { LoadModelDialog } from "./components/LoadModelDialog";
import { ModelCatalogDialog } from "./components/ModelCatalogDialog";
import { ToastContainer, showToast } from "./components/ui/Toast";

function PackagesBanner({ message }: { message: string }) {
  return (
    <div className="mx-4 mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
      {message}
    </div>
  );
}

export default function App() {
  const showSetup = useAppStore((s) => s.showSetup);
  const showSettings = useAppStore((s) => s.showSettings);
  const mediaMode = useAppStore((s) => s.mediaMode);
  const models = useAppStore((s) => s.models);
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const engineStatus = useAppStore((s) => s.engineStatus);
  const jobs = useAppStore((s) => s.jobs);
  const setSettings = useAppStore((s) => s.setSettings);
  const setEngineStatus = useAppStore((s) => s.setEngineStatus);
  const setModels = useAppStore((s) => s.setModels);
  const setShowSetup = useAppStore((s) => s.setShowSetup);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const setSchema = useAppStore((s) => s.setSchema);
  const setParams = useAppStore((s) => s.setParams);
  const setJobs = useAppStore((s) => s.setJobs);
  const patchJob = useAppStore((s) => s.patchJob);
  const setJobMessage = useAppStore((s) => s.setJobMessage);
  const appendJobProgress = useAppStore((s) => s.appendJobProgress);
  const appendJobMessage = useAppStore((s) => s.appendJobMessage);
  const setGallery = useAppStore((s) => s.setGallery);
  const setMediaMode = useAppStore((s) => s.setMediaMode);
  const setIsGenerating = useAppStore((s) => s.setIsGenerating);
  const setSidebarExpanded = useAppStore((s) => s.setSidebarExpanded);
  const setSidebarPanel = useAppStore((s) => s.setSidebarPanel);
  const [installing, setInstalling] = useState(false);

  const refreshLight = useCallback(async () => {
    const [modelList, jobList] = await Promise.all([listModels(), listJobs(30)]);
    setModels(modelList);
    setJobs(jobList);
  }, [setModels, setJobs]);

  const refreshEngine = useCallback(async () => {
    const engine = await getEngineStatus();
    setEngineStatus(engine);
  }, [setEngineStatus]);

  const refreshGallery = useCallback(async () => {
    const gallery = await listGallery({ limit: 60 });
    setGallery(gallery);
  }, [setGallery]);

  const handleInstallPackages = async () => {
    setInstalling(true);
    try {
      await installPythonEnvironment();
      await refreshLight();
      await refreshEngine();
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setInstalling(false);
    }
  };

  const handleModelSelect = useCallback(
    async (model: ModelInfo) => {
      setSelectedModelId(model.id);
      setMediaMode(model.mediaType as "image" | "video");
      const [schema, defaults] = await Promise.all([
        getModelSchema(model.id),
        getDefaultParams(model.id),
      ]);
      setSchema(schema);
      setParams(defaults);
    },
    [setSelectedModelId, setSchema, setParams, setMediaMode],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const s = await getSettings();
      if (cancelled) return;
      setSettings(s);
      document.documentElement.classList.toggle("dark", s.theme === "dark");
      if (!s.setupComplete) {
        setShowSetup(true);
      }

      await refreshLight();
      if (cancelled) return;

      window.setTimeout(() => {
        refreshEngine().catch(() => {});
      }, 250);

      window.setTimeout(() => {
        refreshGallery().catch(() => {});
      }, 150);

      if (s.setupComplete) {
        window.setTimeout(async () => {
          if (cancelled) return;
          try {
            const defaultModel = await ensureDefaultVideoModel();
            if (cancelled || !defaultModel) {
              if (!defaultModel) setShowSetup(true);
              return;
            }
            setMediaMode("video");
            setSidebarPanel("models");
            setSidebarExpanded(true);
            const current = useAppStore.getState().models;
            if (!current.some((m) => m.id === defaultModel.id)) {
              setModels([defaultModel, ...current]);
            }
            await handleModelSelect(defaultModel);
          } catch {
            setShowSetup(true);
          }
        }, 400);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    setSettings,
    setShowSetup,
    refreshLight,
    refreshEngine,
    refreshGallery,
    setMediaMode,
    setModels,
    setSidebarExpanded,
    setSidebarPanel,
    handleModelSelect,
  ]);

  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "pending" || j.status === "running");
    const interval = window.setInterval(
      () => {
        refreshLight();
        if (hasActive) refreshGallery();
        if (hasActive) refreshEngine();
      },
      hasActive ? 3000 : 20000,
    );
    return () => window.clearInterval(interval);
  }, [refreshLight, refreshEngine, refreshGallery, jobs]);

  useEffect(() => {
    const unsubs: Promise<() => void>[] = [
      onJobProgress((event) => {
        patchJob(event.jobId, {
          status: event.status === "pending" ? "pending" : "running",
          progress: event.progress,
        });
        setJobMessage(event.jobId, event.message);
        appendJobProgress(event.jobId, {
          progress: event.progress,
          message: event.message,
          phase: event.phase,
          step: event.step,
          totalSteps: event.totalSteps,
          elapsedMs: event.elapsedMs,
          timestamp: Date.now(),
        });
        appendJobMessage(event.jobId, event.message);
      }),
      onJobQueued(async () => {
        setJobs(await listJobs(30));
      }),
      onJobComplete(async (payload) => {
        setIsGenerating(false);
        patchJob(payload.jobId, { status: "complete", progress: 1 });
        await refreshGallery();
      }),
      onJobFailed(async (payload) => {
        setIsGenerating(false);
        patchJob(payload.jobId, {
          status: "failed",
          progress: 0,
          errorMessage: payload.error,
        });
        setJobs(await listJobs(30));
        const logPath = await getLogPath().catch(() => null);
        showToast(payload.error.split("\n")[0] ?? payload.error, "error", logPath
          ? {
              label: "View log",
              onClick: () => {
                window.open(`file:///${logPath.replace(/\\/g, "/")}`);
              },
            }
          : undefined);
      }),
      onJobCancelled(async (payload) => {
        setIsGenerating(false);
        patchJob(payload.jobId, {
          status: "cancelled",
          progress: 0,
          errorMessage: null,
        });
        setJobs(await listJobs(30));
        showToast("Generation cancelled", "info");
      }),
      onJobsRecovered((payload) => {
        if (payload.count > 0) {
          showToast(`Recovered ${payload.count} interrupted job(s)`, "info");
        }
      }),
    ];
    return () => {
      Promise.all(unsubs).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [refreshGallery, setJobs, setIsGenerating, patchJob, setJobMessage, appendJobProgress, appendJobMessage]);

  useEffect(() => {
    const filtered = models.filter((m) => m.mediaType === mediaMode);
    if (filtered.length === 0) {
      setSelectedModelId(null);
      setSchema(null);
      setParams({});
      return;
    }
    if (!filtered.find((m) => m.id === selectedModelId)) {
      handleModelSelect(filtered[0]);
    }
  }, [mediaMode, models, handleModelSelect, selectedModelId, setSelectedModelId, setSchema, setParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        const btn = document.querySelector<HTMLButtonElement>("[data-generate-btn]");
        btn?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CustomTitleBar />

      {!engineStatus?.sitePackagesReady && engineStatus?.message && (
        <PackagesBanner message={engineStatus.message} />
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          onSelectModel={handleModelSelect}
          onInstallPackages={handleInstallPackages}
          installing={installing}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <MainWorkspace onSelectModel={handleModelSelect} />
        </main>
      </div>

      {showSetup && (
        <SetupWizard
          onComplete={() => {
            setShowSetup(false);
            setSidebarExpanded(true);
            setSidebarPanel("models");
            refreshLight();
            refreshGallery();
          }}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <LoadModelDialog />
      <ModelCatalogDialog />
      <ToastContainer />
    </div>
  );
}
