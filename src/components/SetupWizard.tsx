import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import {
  getDefaultModelsDirectory,
  getDefaultOutputDirectory,
  getDefaultParams,
  getEngineStatus,
  getModelSchema,
  onSetupProgress,
  runInitialSetup,
} from "../lib/tauri";

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const setSettings = useAppStore((s) => s.setSettings);
  const setEngineStatus = useAppStore((s) => s.setEngineStatus);
  const setModels = useAppStore((s) => s.setModels);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const setSchema = useAppStore((s) => s.setSchema);
  const setParams = useAppStore((s) => s.setParams);
  const setMediaMode = useAppStore((s) => s.setMediaMode);

  const [modelsDir, setModelsDir] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [statusMessage, setStatusMessage] = useState("Click the button below — we handle the rest.");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDefaultOutputDirectory().then(setOutputDir);
    getDefaultModelsDirectory().then(setModelsDir);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onSetupProgress((payload) => {
      setStatusMessage(payload.message);
      setProgress(Math.round(payload.progress * 100));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const runSetup = async () => {
    setBusy(true);
    setError(null);
    setProgress(0);
    setStatusMessage("Starting setup…");
    try {
      const model = await runInitialSetup(modelsDir, outputDir);
      setSettings({
        modelsDirectory: modelsDir,
        outputDirectory: outputDir,
        theme: "dark",
        setupComplete: true,
      });
      setModels([model]);
      setSelectedModelId(model.id);
      setMediaMode("video");
      const [schema, defaults, engine] = await Promise.all([
        getModelSchema(model.id),
        getDefaultParams(model.id),
        getEngineStatus(),
      ]);
      setSchema(schema);
      setParams(defaults);
      setEngineStatus(engine);
      onComplete();
    } catch (e) {
      setError(String(e));
      setStatusMessage("Setup failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-md">
      <div className="glass glass-panel-3d w-full max-w-lg rounded-[20px] p-8 shadow-2xl">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome to Graysoft Media Center</h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          One click sets up everything: AI packages, a good quantized video model, and your
          workspace. After this, just type a prompt and hit Generate.
        </p>

        <div className="mt-5 rounded-[14px] bg-black/15 px-4 py-3 text-xs text-[var(--text-muted)] dark:bg-white/5">
          <div>Models: {modelsDir || "…"}</div>
          <div className="mt-1">Output: {outputDir || "…"}</div>
          <div className="mt-2 text-[var(--text-secondary)]">
            Includes WAN 2.2 Video (~3 GB download, one time)
          </div>
          <div className="mt-2 rounded-lg border border-[var(--glass-border)] px-3 py-2 text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">4GB GPU guide:</strong> use the Fast
            preset (512×288, 33 frames, 16 steps). Expect ~8–15 minutes per clip. Balanced and
            Quality presets need more VRAM and time.
          </div>
        </div>

        {busy && (
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-xs text-[var(--text-muted)]">
              <span>{statusMessage}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
                style={{ width: `${Math.max(4, progress)}%` }}
              />
            </div>
          </div>
        )}

        {!busy && (
          <p className="mt-4 text-sm text-[var(--text-muted)]">{statusMessage}</p>
        )}

        {error && (
          <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>
        )}

        <button
          type="button"
          className="btn-primary mt-6 w-full py-3.5 text-base"
          disabled={busy || !modelsDir || !outputDir}
          onClick={runSetup}
        >
          {busy ? "Setting up…" : "Set up Graysoft Media Center"}
        </button>
      </div>
    </div>
  );
}
