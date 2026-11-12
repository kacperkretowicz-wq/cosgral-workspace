/** Placeholder for pages that are on the page rail but not built yet. Fills the conversation column. */
export function ComingSoon(props: { title: string }) {
  return (
    <section class="coming-soon" aria-label={props.title}>
      <div class="window-drag coming-soon-drag" />
      <div class="coming-soon-body">
        <h1>{props.title}</h1>
        <p>Coming soon</p>
      </div>
    </section>
  );
}
