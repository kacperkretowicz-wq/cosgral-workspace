import type { AppVariant } from "@openbot/contracts/ipc";
import { createSignal, flush, onCleanup } from "solid-js";

export type AppLogoAnimation = "none" | "blink" | "look-around" | "surprised";

interface AppLogoProps {
  variant: AppVariant;
  animation?: AppLogoAnimation;
  interactive?: boolean;
  class?: string;
}

export function AppLogo(props: AppLogoProps) {
  const [clickReaction, setClickReaction] = createSignal(false);
  const [easterEgg, setEasterEgg] = createSignal(false);
  const className = () => ["app-logo", props.class].filter(Boolean).join(" ");
  const animation = () => props.animation ?? "none";
  let clickReactionTimer: number | undefined;
  let easterEggTimer: number | undefined;
  let logoElement: SVGSVGElement | undefined;
  let rapidClicks: number[] = [];

  function shouldReduceMotion(): boolean {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  function setEyePosition(x: number, y: number): void {
    logoElement?.style.setProperty("--app-logo-eye-x", `${x * 2.4}%`);
    logoElement?.style.setProperty("--app-logo-eye-y", `${y * 1.8}%`);
  }

  function resetEyePosition(): void {
    setEyePosition(0, 0);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!props.interactive || shouldReduceMotion()) return;
    if (event.pointerType && event.pointerType !== "mouse") return;
    const bounds = logoElement?.getBoundingClientRect();
    if (!bounds) return;
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2)));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2)));
    setEyePosition(x, y);
  }

  function triggerClickReaction(): void {
    if (!props.interactive || shouldReduceMotion()) return;
    window.clearTimeout(clickReactionTimer);
    flush(() => setClickReaction(false));
    void logoElement?.getBoundingClientRect();
    flush(() => setClickReaction(true));
    clickReactionTimer = window.setTimeout(() => setClickReaction(false), 360);
  }

  function registerRapidClick(): void {
    if (!props.interactive || shouldReduceMotion()) return;
    const now = performance.now();
    rapidClicks = [...rapidClicks.filter((time) => now - time < 900), now];
    if (rapidClicks.length < 5) return;

    rapidClicks = [];
    window.clearTimeout(easterEggTimer);
    flush(() => setEasterEgg(false));
    void logoElement?.getBoundingClientRect();
    flush(() => setEasterEgg(true));
    easterEggTimer = window.setTimeout(() => setEasterEgg(false), 1200);
  }

  function handleClick(): void {
    triggerClickReaction();
    registerRapidClick();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    triggerClickReaction();
  }

  onCleanup(() => {
    window.clearTimeout(clickReactionTimer);
    window.clearTimeout(easterEggTimer);
  });

  return (
    <svg
      ref={(element) => (logoElement = element)}
      class={className()}
      data-animation={animation()}
      data-click-reaction={clickReaction() ? "wink" : undefined}
      data-easter-egg={easterEgg() ? "party" : undefined}
      data-interactive={props.interactive ? "true" : undefined}
      data-variant={props.variant}
      viewBox="0 0 240 240"
      aria-hidden={props.interactive ? undefined : "true"}
      aria-label={props.interactive ? "Animate COSGRAL logo" : undefined}
      role={props.interactive ? "button" : undefined}
      tabindex={props.interactive ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerLeave={resetEyePosition}
      onPointerMove={handlePointerMove}
    >
      <rect class="app-logo-background" width="240" height="240" rx="50" ry="50" />
      <g class="app-logo-eye-motion">
        {/* Own C mark for COSGRAL branding */}
        <path
          class="app-logo-mark"
          d="M168 72c-18-22-48-36-82-36-62 0-108 44-108 110s46 110 108 110c34 0 64-14 82-36l-32-28c-12 14-30 22-50 22-36 0-62-26-62-68s26-68 62-68c20 0 38 8 50 22l32-28Z"
        />
      </g>
    </svg>
  );
}
