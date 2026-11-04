// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PersonalizationResizeHandle } from "./PersonalizationResizeHandle";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it("resizes by keyboard, respects bounds, and reverses the right panel", async () => {
 const host = document.createElement("div"); const root = createRoot(host); const change = vi.fn();
 await act(async () => root.render(<PersonalizationResizeHandle label="Panel" value={250} min={240} max={260} reverse onChange={change} />));
 const handle = host.querySelector('[role="separator"]')!;
 for (const [key, expected] of [["ArrowRight", 240], ["ArrowLeft", 260], ["Home", 240], ["End", 260]] as const) {
  await act(async () => { handle.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
  expect(change).toHaveBeenLastCalledWith(expected);
 }
 await act(async () => root.unmount());
});
it("previews dragging locally and saves once when the pointer is released", async () => {
 const host = document.createElement("div"); const root = createRoot(host); const change = vi.fn();
 await act(async () => root.render(<><aside /><PersonalizationResizeHandle label="Panel" value={240} min={208} max={420} onChange={change} /></>));
 const handle = host.querySelector('[role="separator"]') as HTMLElement;
 handle.setPointerCapture = vi.fn(); handle.releasePointerCapture = vi.fn();
 const pointer = (name: string, clientX: number) => {
  const event = new Event(name, { bubbles: true }); Object.assign(event, { clientX, pointerId: 1 }); handle.dispatchEvent(event);
 };
 await act(async () => { pointer("pointerdown", 100); pointer("pointermove", 180); });
 expect(host.querySelector("aside")!.style.getPropertyValue("--cosgral-panel-width")).toBe("320px");
 expect(change).not.toHaveBeenCalled();
 await act(async () => pointer("pointerup", 180));
 expect(change).toHaveBeenCalledExactlyOnceWith(320);
 await act(async () => root.unmount());
});
