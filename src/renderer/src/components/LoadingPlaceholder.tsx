import { t } from "../i18n";

/**
 * A loading place: two pulsing bars for the eye and the word "Loading…" for screen readers and tests. The bars are
 * `aria-hidden`, so the contrast check never reads a half-faded text (the pulse is on the bars only).
 */
export function LoadingPlaceholder() {
  return (
    <div role="status" class="cosgral-loading">
      <span class="cosgral-skeleton cosgral-loading-line" aria-hidden="true" />
      <span class="cosgral-skeleton cosgral-loading-line cosgral-loading-short" aria-hidden="true" />
      <span class="sr-only">{t("Loading…")}</span>
    </div>
  );
}
