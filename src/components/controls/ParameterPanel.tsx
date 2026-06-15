import type { ParameterField } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { Shuffle } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

interface ParameterPanelProps {
  disabled?: boolean;
  compact?: boolean;
}

type SpeedPreset = "fast" | "balanced" | "quality";

const WAN_PRESETS: Record<
  SpeedPreset,
  { width: number; height: number; frame_count: number; steps: number }
> = {
  fast: { width: 512, height: 288, frame_count: 33, steps: 16 },
  balanced: { width: 672, height: 384, frame_count: 49, steps: 20 },
  quality: { width: 672, height: 384, frame_count: 81, steps: 30 },
};

function isVisible(field: ParameterField, params: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  return params[field.visibleWhen.field] === field.visibleWhen.equals;
}

function FieldControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ParameterField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const baseClass = "glass-input w-full px-2.5 py-1.5 text-sm";

  switch (field.type) {
    case "text":
      return (
        <input
          type="text"
          className={baseClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );

    case "number":
      return (
        <input
          type="number"
          className={baseClass}
          value={Number(value ?? field.default ?? 0)}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
        />
      );

    case "slider":
      return (
        <div className="flex items-center gap-2">
          <input
            type="range"
            className="flex-1 accent-[var(--color-accent)]"
            value={Number(value ?? field.default ?? 0)}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={disabled}
          />
          <span className="w-10 text-right text-xs text-[var(--text-muted)]">
            {Number(value ?? field.default ?? 0)}
          </span>
        </div>
      );

    case "select":
      return (
        <select
          className={baseClass}
          value={String(value ?? field.default ?? "")}
          onChange={(e) => {
            const opt = field.options?.find((o) => String(o.value) === e.target.value);
            onChange(opt?.value ?? e.target.value);
          }}
          disabled={disabled}
        >
          {field.options?.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case "toggle":
      return (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value ?? field.default ?? false)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="accent-[var(--color-accent)]"
          />
          <span className="text-xs text-[var(--text-muted)]">
            {Boolean(value) ? "On" : "Off"}
          </span>
        </label>
      );

    case "file":
      return (
        <div className="flex gap-2">
          <input
            type="text"
            className={`${baseClass} flex-1`}
            value={String(value ?? "")}
            readOnly
            placeholder="No file selected"
            disabled={disabled}
          />
          <button
            type="button"
            className="btn-ghost shrink-0 px-2 py-1 text-xs"
            disabled={disabled}
            onClick={async () => {
              const picked = await open({
                multiple: false,
                filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
              });
              if (picked && typeof picked === "string") onChange(picked);
            }}
          >
            Browse
          </button>
        </div>
      );

    case "seed":
      return (
        <div className="flex gap-2">
          <input
            type="number"
            className={`${baseClass} flex-1`}
            value={Number(value ?? -1)}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={disabled}
          />
          <button
            type="button"
            className="btn-ghost flex h-8 w-8 items-center justify-center p-0"
            onClick={() => onChange(-1)}
            disabled={disabled}
            title="Random seed"
          >
            <Shuffle size={14} />
          </button>
        </div>
      );

    default:
      return (
        <input
          type="text"
          className={baseClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
  }
}

export function ParameterPanel({ disabled, compact }: ParameterPanelProps) {
  const schema = useAppStore((s) => s.schema);
  const params = useAppStore((s) => s.params);
  const updateParam = useAppStore((s) => s.updateParam);
  const setParams = useAppStore((s) => s.setParams);

  const applyPreset = (preset: SpeedPreset) => {
    const values = WAN_PRESETS[preset];
    setParams({ ...params, ...values });
  };

  const activePreset = (): SpeedPreset | null => {
    for (const key of ["fast", "balanced", "quality"] as SpeedPreset[]) {
      const p = WAN_PRESETS[key];
      if (
        params.width === p.width &&
        params.height === p.height &&
        params.frame_count === p.frame_count &&
        params.steps === p.steps
      ) {
        return key;
      }
    }
    return null;
  };

  if (!schema) {
    return (
      <div className="p-4 text-sm text-[var(--text-muted)]">
        Select a model to configure parameters
      </div>
    );
  }

  return (
    <div className={`flex flex-col overflow-y-auto ${compact ? "gap-2 p-2" : "gap-3 p-3"}`}>
      {schema.id === "wan-2.2-5b" && (
        <div>
          <h3
            className={`mb-1.5 font-semibold uppercase tracking-wider text-[var(--text-muted)] ${compact ? "text-[10px]" : "text-[11px]"}`}
          >
            Speed preset
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {(["fast", "balanced", "quality"] as SpeedPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={disabled}
                className={`rounded-lg px-2.5 py-1 text-[10px] capitalize ${
                  activePreset() === preset
                    ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                    : "bg-white/5 text-[var(--text-muted)] hover:bg-white/10"
                }`}
                onClick={() => applyPreset(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      )}
      {schema.groups
        .filter((g) => g.id !== "prompt")
        .map((group) => {
          const visibleFields = group.fields.filter((f) => isVisible(f, params));
          if (visibleFields.length === 0) return null;

          return (
            <div key={group.id}>
              <h3 className={`mb-1.5 font-semibold uppercase tracking-wider text-[var(--text-muted)] ${compact ? "text-[10px]" : "text-[11px]"}`}>
                {group.label}
              </h3>
              <div className={`grid ${compact ? "grid-cols-2 gap-2" : "flex flex-col gap-2.5"}`}>
                {visibleFields.map((field) => (
                  <div key={field.id} className={compact ? "min-w-0" : ""}>
                    <label className={`mb-0.5 block text-[var(--text-secondary)] ${compact ? "text-[10px]" : "text-xs"}`}>
                      {field.label}
                    </label>
                    <FieldControl
                      field={field}
                      value={params[field.id]}
                      onChange={(v) => updateParam(field.id, v)}
                      disabled={disabled}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
