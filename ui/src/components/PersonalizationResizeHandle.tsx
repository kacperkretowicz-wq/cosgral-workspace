import { useRef, type PointerEvent } from "react";
export function PersonalizationResizeHandle({ label, value, min, max, reverse = false, onChange }: {
  label: string; value: number; min: number; max: number; reverse?: boolean; onChange: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number; next: number } | null>(null);
  const clamp = (width: number) => Math.round(Math.min(max, Math.max(min, width)));
  const finish = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const width = drag.current.next; drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId); onChange(width);
  };
  return <div role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} tabIndex={0}
    className="cosgral-resize-handle hidden shrink-0 cursor-col-resize bg-border focus-visible:bg-ring md:block"
    onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, width: value, next: value }; }}
    onPointerMove={e => { if (!drag.current) return; drag.current.next = clamp(drag.current.width + (e.clientX - drag.current.x) * (reverse ? -1 : 1));
      const panel = reverse ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      (panel as HTMLElement | null)?.style.setProperty("--cosgral-panel-width", `${drag.current.next}px`);
    }}
    onPointerUp={finish} onPointerCancel={finish}
    onKeyDown={e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      onChange(e.key === "Home" ? min : e.key === "End" ? max : clamp(value + (e.key === "ArrowRight" ? 16 : -16) * (reverse ? -1 : 1)));
    }} />;
}
