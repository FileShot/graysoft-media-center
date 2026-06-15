import { useEffect, useMemo, useState } from "react";

import { createPortal } from "react-dom";

import { Download, Globe, Image, Sparkles, Video, X } from "lucide-react";

import {

  catalogModelId,

  getDefaultParams,

  getModelSchema,

  installCatalogModel,

  installHfGgufModel,

  listHfRepoGguf,

  listModelCatalog,

  onSetupProgress,

  searchHfGgufRepos,

} from "../lib/tauri";

import type { CatalogEntry, HfGgufFile, HfGgufRepo } from "../lib/types";

import { useAppStore } from "../store/appStore";

import { showToast } from "./ui/Toast";



type Tab = "video" | "image" | "browse";

type FormatFilter = "all" | "gguf" | "diffusers";



function CatalogCard({

  entry,

  installed,

  installing,

  selectedQuant,

  onQuantChange,

  onInstall,

  dimmed,

}: {

  entry: CatalogEntry;

  installed: boolean;

  installing: boolean;

  selectedQuant: string;

  onQuantChange: (quantId: string) => void;

  onInstall: () => void;

  dimmed?: boolean;

}) {

  const variants = entry.quantVariants ?? [];

  const activeVariant = variants.find((v) => v.id === selectedQuant) ?? variants[0];

  const sizeGb = activeVariant?.sizeGb ?? entry.sizeGb;

  const vramGb = activeVariant?.vramGb ?? entry.vramGb;



  return (

    <div

      className={`rounded-[16px] border border-[var(--glass-border)] bg-black/10 p-4 dark:bg-white/[0.03] ${

        dimmed ? "opacity-50" : ""

      }`}

    >

      <div className="flex items-start justify-between gap-3">

        <div className="min-w-0 flex-1">

          <div className="flex flex-wrap items-center gap-2">

            <h3 className="text-[0.95rem] font-semibold">{entry.name}</h3>

            {entry.recommended && (

              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-muted)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-accent)]">

                <Sparkles size={10} />

                Recommended

              </span>

            )}

          </div>

          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">

            {entry.description}

          </p>

          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">

            <span>~{sizeGb} GB download</span>

            <span>{vramGb} GB VRAM</span>

            {entry.tags?.includes("gguf") && <span>GGUF</span>}

          </div>

          {variants.length > 1 && (

            <select

              className="glass-input mt-2 w-full max-w-[220px] px-2 py-1 text-xs"

              value={selectedQuant}

              disabled={installed || installing}

              onChange={(e) => onQuantChange(e.target.value)}

            >

              {variants.map((variant) => (

                <option key={variant.id} value={variant.id}>

                  {variant.label}

                </option>

              ))}

            </select>

          )}

        </div>

        <button

          type="button"

          className={`btn-primary shrink-0 px-4 py-2 text-sm ${installed ? "opacity-70" : ""}`}

          disabled={installed || installing || dimmed}

          onClick={onInstall}

        >

          {installed ? "Installed" : installing ? "Installing…" : dimmed ? "Too large" : "Install"}

        </button>

      </div>

    </div>

  );

}



export function ModelCatalogDialog() {

  const isOpen = useAppStore((s) => s.showModelCatalog);

  const setOpen = useAppStore((s) => s.setShowModelCatalog);

  const models = useAppStore((s) => s.models);

  const engineStatus = useAppStore((s) => s.engineStatus);

  const setModels = useAppStore((s) => s.setModels);

  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);

  const setSchema = useAppStore((s) => s.setSchema);

  const setParams = useAppStore((s) => s.setParams);

  const setMediaMode = useAppStore((s) => s.setMediaMode);



  const [tab, setTab] = useState<Tab>("video");

  const [entries, setEntries] = useState<CatalogEntry[]>([]);

  const [loading, setLoading] = useState(false);

  const [installingId, setInstallingId] = useState<string | null>(null);

  const [statusMessage, setStatusMessage] = useState("");

  const [progress, setProgress] = useState(0);

  const [error, setError] = useState<string | null>(null);

  const [maxVram, setMaxVram] = useState(16);

  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");

  const [recommendedOnly, setRecommendedOnly] = useState(false);

  const [quantSelections, setQuantSelections] = useState<Record<string, string>>({});



  const [hfQuery, setHfQuery] = useState("");

  const [hfRepos, setHfRepos] = useState<HfGgufRepo[]>([]);

  const [hfLoading, setHfLoading] = useState(false);

  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  const [hfFiles, setHfFiles] = useState<HfGgufFile[]>([]);

  const [selectedFile, setSelectedFile] = useState<string>("");

  const [hfSchemaId, setHfSchemaId] = useState("sdxl-base");



  useEffect(() => {

    if (!isOpen) return;

    setError(null);

    setLoading(true);

    listModelCatalog()

      .then((catalog) => {

        setEntries(catalog.entries);

        const defaults: Record<string, string> = {};

        for (const entry of catalog.entries) {

          defaults[entry.id] = entry.quantVariants?.[0]?.id ?? "q4";

        }

        setQuantSelections(defaults);

      })

      .catch((e) => setError(String(e)))

      .finally(() => setLoading(false));

  }, [isOpen]);



  useEffect(() => {

    if (engineStatus?.vramGb) {

      setMaxVram(Math.max(4, Math.ceil(engineStatus.vramGb)));

    }

  }, [engineStatus?.vramGb]);



  useEffect(() => {

    if (!installingId) return;

    let unlisten: (() => void) | undefined;

    onSetupProgress((payload) => {

      setStatusMessage(payload.message);

      setProgress(Math.round(payload.progress * 100));

    }).then((fn) => {

      unlisten = fn;

    });

    return () => unlisten?.();

  }, [installingId]);



  useEffect(() => {

    if (!isOpen || tab !== "browse") return;

    setHfLoading(true);

    searchHfGgufRepos(hfQuery)

      .then(setHfRepos)

      .catch((e) => setError(String(e)))

      .finally(() => setHfLoading(false));

  }, [isOpen, tab, hfQuery]);



  useEffect(() => {

    if (!selectedRepo) {

      setHfFiles([]);

      setSelectedFile("");

      return;

    }

    listHfRepoGguf(selectedRepo)

      .then((files) => {

        setHfFiles(files);

        setSelectedFile(files[0]?.filename ?? "");

      })

      .catch((e) => setError(String(e)));

  }, [selectedRepo]);



  const filtered = useMemo(() => {

    let list = entries.filter((e) => {

      if (tab === "browse") return false;

      return e.mediaType === tab;

    });

    if (recommendedOnly) {

      list = list.filter((e) => e.recommended);

    }

    if (formatFilter === "gguf") {

      list = list.filter((e) => e.downloadType === "gguf_bundle" || e.downloadType === "gguf_bundle_dual" || e.tags?.includes("gguf"));

    } else if (formatFilter === "diffusers") {

      list = list.filter((e) => e.downloadType === "diffusers");

    }

    list.sort((a, b) => {

      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;

      const aFits = (a.minVramGb ?? a.vramGb) <= (engineStatus?.vramGb ?? 99);

      const bFits = (b.minVramGb ?? b.vramGb) <= (engineStatus?.vramGb ?? 99);

      if (aFits !== bFits) return aFits ? -1 : 1;

      return a.sizeGb - b.sizeGb;

    });

    return list;

  }, [entries, tab, recommendedOnly, formatFilter, engineStatus?.vramGb]);



  const videoCount = useMemo(() => entries.filter((e) => e.mediaType === "video").length, [entries]);

  const imageCount = useMemo(() => entries.filter((e) => e.mediaType === "image").length, [entries]);



  const installedIds = useMemo(

    () => new Set(models.map((m) => m.id)),

    [models],

  );



  if (!isOpen) return null;



  const close = () => {

    if (!installingId) setOpen(false);

  };



  const registerModel = async (model: Awaited<ReturnType<typeof installCatalogModel>>, mediaType: string) => {

    const current = useAppStore.getState().models;

    setModels([model, ...current.filter((m) => m.id !== model.id)]);

    setSelectedModelId(model.id);

    setMediaMode(mediaType as "image" | "video");

    const [schema, defaults] = await Promise.all([

      getModelSchema(model.id),

      getDefaultParams(model.id),

    ]);

    setSchema(schema);

    setParams(defaults);

    setOpen(false);

    showToast(`${model.name} installed`, "success");

  };



  const handleInstall = async (entry: CatalogEntry) => {

    setInstallingId(entry.id);

    setError(null);

    setProgress(0);

    setStatusMessage(`Installing ${entry.name}…`);

    try {

      const quantId = entry.quantVariants?.length

        ? quantSelections[entry.id] ?? entry.quantVariants[0].id

        : undefined;

      const model = await installCatalogModel(entry.id, quantId);

      await registerModel(model, entry.mediaType);

    } catch (e) {

      setError(String(e));

      showToast(String(e), "error");

    } finally {

      setInstallingId(null);

      setStatusMessage("");

      setProgress(0);

    }

  };



  const handleHfInstall = async () => {

    if (!selectedRepo || !selectedFile) return;

    setInstallingId(selectedRepo);

    setError(null);

    setProgress(0);

    setStatusMessage(`Installing ${selectedFile}…`);

    try {

      const model = await installHfGgufModel(

        selectedRepo,

        selectedFile,

        hfSchemaId,

        selectedFile.replace(".gguf", ""),

      );

      const mediaType = hfSchemaId.includes("wan") || hfSchemaId.includes("ltx") ? "video" : "image";

      await registerModel(model, mediaType);

    } catch (e) {

      setError(String(e));

      showToast(String(e), "error");

    } finally {

      setInstallingId(null);

      setStatusMessage("");

      setProgress(0);

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

        className="glass glass-panel-3d flex max-h-[85vh] w-full max-w-3xl flex-col rounded-[20px] shadow-2xl"

        role="dialog"

        aria-modal="true"

        aria-labelledby="model-catalog-title"

      >

        <div className="border-b border-[var(--glass-border)] p-6 pb-4">

          <div className="flex items-start justify-between gap-4">

            <div>

              <h2 id="model-catalog-title" className="text-xl font-semibold tracking-tight">

                Get Models

              </h2>

              <p className="mt-1 text-sm text-[var(--text-muted)]">

                Curated models with one-click install, or browse HuggingFace GGUF repos.

              </p>

            </div>

            <button

              type="button"

              className="btn-ghost flex h-10 w-10 shrink-0 items-center justify-center p-0"

              onClick={close}

              disabled={!!installingId}

            >

              <X size={18} />

            </button>

          </div>



          <div className="mt-4 flex flex-wrap gap-2">

            <button

              type="button"

              className={`flex items-center gap-2 rounded-[12px] px-4 py-2 text-sm transition-colors ${

                tab === "video"

                  ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"

                  : "text-[var(--text-secondary)] hover:bg-white/5"

              }`}

              onClick={() => setTab("video")}

              disabled={!!installingId}

            >

              <Video size={16} />

              Video ({videoCount})

            </button>

            <button

              type="button"

              className={`flex items-center gap-2 rounded-[12px] px-4 py-2 text-sm transition-colors ${

                tab === "image"

                  ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"

                  : "text-[var(--text-secondary)] hover:bg-white/5"

              }`}

              onClick={() => setTab("image")}

              disabled={!!installingId}

            >

              <Image size={16} />

              Image ({imageCount})

            </button>

            <button

              type="button"

              className={`flex items-center gap-2 rounded-[12px] px-4 py-2 text-sm transition-colors ${

                tab === "browse"

                  ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"

                  : "text-[var(--text-secondary)] hover:bg-white/5"

              }`}

              onClick={() => setTab("browse")}

              disabled={!!installingId}

            >

              <Globe size={16} />

              Browse HF

            </button>

          </div>



          {tab !== "browse" && (

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">

              <label className="flex items-center gap-2">

                Max VRAM {maxVram} GB

                <input

                  type="range"

                  min={4}

                  max={24}

                  step={1}

                  value={maxVram}

                  onChange={(e) => setMaxVram(Number(e.target.value))}

                  disabled={!!installingId}

                  className="w-28 accent-[var(--color-accent)]"

                />

              </label>

              <select

                className="glass-input px-2 py-1"

                value={formatFilter}

                onChange={(e) => setFormatFilter(e.target.value as FormatFilter)}

                disabled={!!installingId}

              >

                <option value="all">All formats</option>

                <option value="gguf">GGUF</option>

                <option value="diffusers">Diffusers</option>

              </select>

              <label className="flex items-center gap-1.5">

                <input

                  type="checkbox"

                  checked={recommendedOnly}

                  onChange={(e) => setRecommendedOnly(e.target.checked)}

                  disabled={!!installingId}

                  className="accent-[var(--color-accent)]"

                />

                Recommended only

              </label>

            </div>

          )}

        </div>



        <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-4">

          {tab === "browse" ? (

            <div className="space-y-4">

              <input

                className="glass-input w-full px-3 py-2 text-sm"

                placeholder="Search GGUF repos…"

                value={hfQuery}

                onChange={(e) => setHfQuery(e.target.value)}

                disabled={!!installingId}

              />

              {hfLoading && <p className="text-sm text-[var(--text-muted)]">Searching HuggingFace…</p>}

              <div className="grid gap-2">

                {hfRepos.map((repo) => (

                  <button

                    key={repo.id}

                    type="button"

                    className={`rounded-xl border px-3 py-2 text-left ${

                      selectedRepo === repo.id

                        ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"

                        : "border-[var(--glass-border)] hover:bg-white/5"

                    }`}

                    onClick={() => setSelectedRepo(repo.id)}

                    disabled={!!installingId}

                  >

                    <div className="text-sm font-medium">{repo.name}</div>

                    <div className="text-xs text-[var(--text-muted)]">{repo.id}</div>

                  </button>

                ))}

              </div>

              {selectedRepo && hfFiles.length > 0 && (

                <div className="rounded-xl border border-[var(--glass-border)] p-3">

                  <label className="mb-1 block text-xs text-[var(--text-muted)]">GGUF file</label>

                  <select

                    className="glass-input mb-3 w-full px-2 py-1.5 text-sm"

                    value={selectedFile}

                    onChange={(e) => setSelectedFile(e.target.value)}

                    disabled={!!installingId}

                  >

                    {hfFiles.map((file) => (

                      <option key={file.filename} value={file.filename}>

                        {file.filename} ({file.quant})

                      </option>

                    ))}

                  </select>

                  <label className="mb-1 block text-xs text-[var(--text-muted)]">Pipeline</label>

                  <select

                    className="glass-input mb-3 w-full px-2 py-1.5 text-sm"

                    value={hfSchemaId}

                    onChange={(e) => setHfSchemaId(e.target.value)}

                    disabled={!!installingId}

                  >

                    <option value="wan-2.2-5b">WAN 2.2 5B (video)</option>

                    <option value="wan-2.1">WAN 2.1 (video)</option>

                    <option value="ltx-video-2">LTX Video (video)</option>

                    <option value="flux-schnell">Flux Schnell (image)</option>

                    <option value="flux-dev">Flux Dev (image)</option>

                    <option value="sdxl-base">SDXL Base (image)</option>

                  </select>

                  <button

                    type="button"

                    className="btn-primary w-full py-2 text-sm"

                    disabled={!!installingId || !selectedFile}

                    onClick={handleHfInstall}

                  >

                    Install selected GGUF

                  </button>

                </div>

              )}

            </div>

          ) : (

            <>

              {loading && (

                <p className="text-sm text-[var(--text-muted)]">Loading catalog…</p>

              )}



              {!loading && filtered.length === 0 && (

                <p className="text-sm text-[var(--text-muted)]">

                  No models match your filters. Try clearing Recommended only or format filters.

                </p>

              )}



              <div className="flex flex-col gap-3">

                {filtered.map((entry) => {

                  const minVram = entry.minVramGb ?? entry.vramGb;

                  const dimmed = (engineStatus?.vramGb ?? 99) < minVram;

                  return (

                    <CatalogCard

                      key={entry.id}

                      entry={entry}

                      installed={installedIds.has(catalogModelId(entry.id))}

                      installing={installingId === entry.id}

                      selectedQuant={quantSelections[entry.id] ?? entry.quantVariants?.[0]?.id ?? "q4"}

                      onQuantChange={(quantId) =>

                        setQuantSelections((prev) => ({ ...prev, [entry.id]: quantId }))

                      }

                      onInstall={() => handleInstall(entry)}

                      dimmed={dimmed}

                    />

                  );

                })}

              </div>

            </>

          )}



          {installingId && (

            <div className="mt-5 rounded-[14px] bg-black/15 px-4 py-3 dark:bg-white/5">

              <div className="mb-2 flex justify-between text-xs text-[var(--text-muted)]">

                <span>{statusMessage || "Downloading…"}</span>

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



          {error && <p className="mt-4 text-sm text-[var(--color-danger)]">{error}</p>}

        </div>



        <div className="border-t border-[var(--glass-border)] px-6 py-4">

          <button

            type="button"

            className="btn-ghost flex w-full items-center justify-center gap-2 py-2 text-sm text-[var(--text-muted)]"

            onClick={() => {

              setOpen(false);

              useAppStore.getState().setShowLoadModel(true);

            }}

            disabled={!!installingId}

          >

            <Download size={14} />

            Already have a model? Load from disk instead

          </button>

        </div>

      </div>

    </div>,

    document.body,

  );

}

