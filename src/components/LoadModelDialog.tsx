import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileUp, FolderOpen, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { getDefaultParams, getModelSchema, listPipelineTypes, loadModel } from "../lib/tauri";
import type { PipelineType } from "../lib/types";
import { useAppStore } from "../store/appStore";

const WEIGHT_FILTERS = [
  { name: "All weights", extensions: ["gguf", "safetensors", "ckpt", "pt", "bin", "pth"] },
  { name: "GGUF", extensions: ["gguf"] },
  { name: "Safetensors", extensions: ["safetensors"] },
  { name: "Checkpoint", extensions: ["ckpt", "pt", "pth"] },
];

function guessSchema(path: string, pipelines: PipelineType[]): string {
  const lower = path.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/flux.*schnell|schnell.*flux/, "flux-schnell"],
    [/flux/, "flux-dev"],
    [/sdxl|xl_base|stable-diffusion-xl/, "sdxl-base"],
    [/turbo|z-image/, "z-image-turbo"],
    [/wan.*ti2v|ti2v.*5b|wan2\.2.*5b/i, "wan-2.2-5b"],
    [/wan.*a14b|highnoise|lownoise/i, "wan-2.2"],
    [/wan.*2\.?2|wan2\.?2|wan22/i, "wan-2.2-5b"],
    [/wan/i, "wan-2.2-5b"],
    [/ltx/, "ltx-video-2"],
    [/\.gguf$/, "wan-2.2"],
  ];
  for (const [pattern, id] of rules) {
    if (pattern.test(lower) && pipelines.some((p) => p.id === id)) return id;
  }
  return pipelines[0]?.id ?? "";
}

function leafName(path: string): string {
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? "Model";
}

export function LoadModelDialog() {
  const isOpen = useAppStore((s) => s.showLoadModel);
  const setOpen = useAppStore((s) => s.setShowLoadModel);
  const setModels = useAppStore((s) => s.setModels);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const setSchema = useAppStore((s) => s.setSchema);
  const setParams = useAppStore((s) => s.setParams);

  const [pipelines, setPipelines] = useState<PipelineType[]>([]);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [schemaId, setSchemaId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setPath("");
    setName("");
    listPipelineTypes().then((types) => {
      setPipelines(types);
      if (types.length > 0) setSchemaId(types[0].id);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const close = () => {
    if (!busy) setOpen(false);
  };

  const applyPath = (selected: string) => {
    setPath(selected);
    setName(leafName(selected));
    const guess = guessSchema(selected, pipelines);
    if (guess) setSchemaId(guess);
  };

  const pickFolder = async () => {
    setError(null);
    const selected = await open({ directory: true, multiple: false });
    if (selected) applyPath(selected as string);
  };

  const pickFile = async () => {
    setError(null);
    const selected = await open({
      directory: false,
      multiple: false,
      filters: WEIGHT_FILTERS,
    });
    if (selected) applyPath(selected as string);
  };

  const handleLoad = async () => {
    if (!path.trim()) {
      setError("Choose a weight file (.gguf, .safetensors, .ckpt) or a model folder.");
      return;
    }
    if (!schemaId) {
      setError("Select a pipeline type for this model.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const model = await loadModel(path, schemaId, name.trim() || undefined);
      const current = useAppStore.getState().models;
      setModels([model, ...current.filter((m) => m.id !== model.id)]);
      setSelectedModelId(model.id);
      const [schema, defaults] = await Promise.all([
        getModelSchema(model.id),
        getDefaultParams(model.id),
      ]);
      setSchema(schema);
      setParams(defaults);
      setOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-6 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="glass glass-panel-3d w-full max-w-xl rounded-[20px] p-7 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-model-title"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 id="load-model-title" className="text-xl font-semibold tracking-tight">
              Load Model
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Select a GGUF file, checkpoint, or weights folder from your machine.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost flex h-10 w-10 shrink-0 items-center justify-center p-0"
            onClick={close}
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="section-label mb-2 block">Model location</label>
            <input
              className="glass-input mb-2 min-h-[48px] w-full px-3 py-2"
              value={path}
              readOnly
              placeholder="Browse to a .gguf file or folder..."
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn-ghost flex items-center justify-center gap-2 py-2.5"
                onClick={pickFile}
                disabled={busy}
              >
                <FileUp size={18} />
                Weight file
              </button>
              <button
                type="button"
                className="btn-ghost flex items-center justify-center gap-2 py-2.5"
                onClick={pickFolder}
                disabled={busy}
              >
                <FolderOpen size={18} />
                Folder
              </button>
            </div>
          </div>

          <div>
            <label className="section-label mb-2 block">Display name</label>
            <input
              className="glass-input min-h-[48px] w-full px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name shown in the sidebar"
              disabled={busy}
            />
          </div>

          <div>
            <label className="section-label mb-2 block">Pipeline type</label>
            <select
              className="glass-input min-h-[48px] w-full px-3 py-2"
              value={schemaId}
              onChange={(e) => setSchemaId(e.target.value)}
              disabled={busy}
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.mediaType})
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-ghost px-5 py-2.5" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary px-6 py-2.5"
            disabled={busy}
            onClick={handleLoad}
          >
            {busy ? "Loading..." : "Load Model"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
