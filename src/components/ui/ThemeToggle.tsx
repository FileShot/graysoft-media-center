import { Moon, Sun } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { saveSettings } from "../../lib/tauri";

export function ThemeToggle() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const isDark = settings?.theme === "dark";

  const toggle = async () => {
    if (!settings) return;
    const next = isDark ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    const updated = { ...settings, theme: next };
    setSettings(updated);
    await saveSettings(updated);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-ghost flex h-8 w-8 items-center justify-center p-0"
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
