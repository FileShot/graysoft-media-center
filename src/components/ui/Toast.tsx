import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useAppStore } from "../../store/appStore";

function ToastIcon({ type }: { type: string }) {
  if (type === "error") return <AlertCircle size={16} className="text-[var(--color-danger)]" />;
  if (type === "success") return <CheckCircle2 size={16} className="text-emerald-400" />;
  return <Info size={16} className="text-[var(--color-accent)]" />;
}

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[300] flex max-w-md flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 shadow-2xl backdrop-blur-md"
        >
          <ToastIcon type={toast.type} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--text-primary)]">{toast.message}</p>
            {toast.action && (
              <button
                type="button"
                className="mt-1 text-xs text-[var(--color-accent)] hover:underline"
                onClick={() => {
                  toast.action?.onClick();
                  dismissToast(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            className="titlebar-btn h-6 w-6 shrink-0"
            onClick={() => dismissToast(toast.id)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function showToast(
  message: string,
  type: "info" | "error" | "success" = "info",
  action?: { label: string; onClick: () => void },
) {
  useAppStore.getState().addToast({ message, type, action });
}
