import { onSettled } from "solid-js";
import waves from "../assets/ambient/waves.webm";
import poster from "../assets/ambient/waves-poster.jpg";

/**
 * The COSGRAL Hub wallpaper behind the whole window: the Hub's liquid waves (the cosgral.pl shader) as a
 * seamless 90 s video loop, the Hub's two accent tints, a soft veil and the charcoal grain. Same layers and
 * strengths as `CosgralAmbient` in the Hub, so both apps share one background.
 *
 * The video plays only while the window is visible and motion is allowed; with "reduce animations" on it stays
 * on its first frame (a still of the waves). Nothing in it is interactive.
 */
export function HubAmbient() {
  let video: HTMLVideoElement | undefined;
  let scene: HTMLDivElement | undefined;

  onSettled(() => {
    if (!video || !scene) return;
    const element = video;
    const layer = scene;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (document.hidden || reducedMotion?.matches) element.pause();
      else void element.play().catch(() => undefined);
    };
    const ready = () => {
      layer.dataset.ready = "true";
    };
    if (element.readyState >= 2) ready();
    element.addEventListener("loadeddata", ready);
    document.addEventListener("visibilitychange", sync);
    reducedMotion?.addEventListener("change", sync);
    sync();
    return () => {
      element.removeEventListener("loadeddata", ready);
      document.removeEventListener("visibilitychange", sync);
      reducedMotion?.removeEventListener("change", sync);
    };
  });

  return (
    <div class="hub-ambient" aria-hidden="true">
      <div ref={scene} class="hub-ambient-scene">
        <video
          ref={video}
          class="hub-ambient-video"
          src={waves}
          poster={poster}
          muted
          loop
          playsinline
          preload="auto"
          tabindex={-1}
        />
      </div>
      <div class="hub-ambient-tints" />
      <div class="hub-ambient-veil" />
    </div>
  );
}
