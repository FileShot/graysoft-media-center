import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function CustomTitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized).catch(() => {});
    const unlisten = win.onResized(async () => {
      setMaximized(await win.isMaximized());
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const win = getCurrentWindow();

  return (
    <header
      data-tauri-drag-region
      className="titlebar flex h-10 shrink-0 items-center justify-between border-b border-[var(--glass-border)] bg-[var(--bg-elevated)] px-3 select-none"
    >
      <div data-tauri-drag-region className="flex min-w-0 items-center gap-2.5">
        <img src="/app-logo.svg" alt="" className="h-6 w-6 shrink-0" draggable={false} />
        <span data-tauri-drag-region className="truncate text-[13px] font-medium tracking-tight">
          Graysoft Media Center
        </span>
      </div>

      <div className="flex items-center">
        <button
          type="button"
          className="titlebar-btn"
          onClick={() => win.minimize()}
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          onClick={() => win.toggleMaximize()}
          aria-label={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? <Copy size={12} className="rotate-180" /> : <Square size={12} />}
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          onClick={() => win.close()}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
