/** Shared loading placeholder (UI densify): pulse bars instead of bare "Loading…" text. */
export function CosgralLoadingSkeleton(props: { label: string }) {
  return (
    <div class="agent-cards-skeleton cosgral-arrive" role="status" aria-label={props.label}>
      <span class="cosgral-skeleton cosgral-skeleton-wide" />
      <span class="cosgral-skeleton cosgral-skeleton-mid" />
      <span class="cosgral-skeleton cosgral-skeleton-wide" />
      <span class="cosgral-skeleton cosgral-skeleton-mid" />
    </div>
  );
}
