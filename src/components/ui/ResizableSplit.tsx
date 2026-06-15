import { useCallback, useRef } from "react";

type Axis = "horizontal" | "vertical";

interface ResizableSplitProps {
  axis: Axis;
  /** First pane size: pixels when vertical, percent (0–100) when horizontal */
  size: number;
  onSizeChange: (size: number) => void;
  minFirst?: number;
  minSecond?: number;
  first: React.ReactNode;
  second: React.ReactNode;
  className?: string;
}

export function ResizableSplit({
  axis,
  size,
  onSizeChange,
  minFirst = 120,
  minSecond = 120,
  first,
  second,
  className = "",
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();

      const onMove = (ev: PointerEvent) => {
        if (axis === "vertical") {
          const next = Math.min(
            rect.height - minSecond,
            Math.max(minFirst, ev.clientY - rect.top),
          );
          onSizeChange(Math.round(next));
        } else {
          const total = rect.width;
          const pct = ((ev.clientX - rect.left) / total) * 100;
          const clamped = Math.min(
            100 - (minSecond / total) * 100,
            Math.max((minFirst / total) * 100, pct),
          );
          onSizeChange(Math.round(clamped));
        }
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = axis === "vertical" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [axis, size, onSizeChange, minFirst, minSecond],
  );

  const isVertical = axis === "vertical";

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 min-w-0 ${isVertical ? "flex-col" : "flex-row"} ${className}`}
    >
      <div
        className="min-h-0 min-w-0 shrink-0 overflow-hidden"
        style={
          isVertical
            ? { height: size, minHeight: minFirst }
            : { width: `${size}%`, minWidth: minFirst }
        }
      >
        {first}
      </div>

      <div
        role="separator"
        aria-orientation={isVertical ? "horizontal" : "vertical"}
        className={`resize-handle shrink-0 ${isVertical ? "resize-handle-h" : "resize-handle-v"}`}
        onPointerDown={onPointerDown}
      />

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{second}</div>
    </div>
  );
}
