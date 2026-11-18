/** FLIP for sidebar agent rows when “unread first” reorders the list. Only `transform`. */

const AGENT_ROW = ".agent-row[data-agent-id]";

export function prefersReducedMotion(
  matchMedia: ((query: string) => { matches: boolean }) | undefined = window.matchMedia?.bind(window),
): boolean {
  return matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Tops of agent rows keyed by `data-agent-id`. */
export function captureAgentRowTops(
  root: ParentNode,
  measure: (el: HTMLElement) => number = (el) => el.getBoundingClientRect().top,
): Map<string, number> {
  const tops = new Map<string, number>();
  for (const node of root.querySelectorAll<HTMLElement>(AGENT_ROW)) {
    const id = node.dataset.agentId;
    if (id) tops.set(id, measure(node));
  }
  return tops;
}

/**
 * Invert then play: set `translateY` so rows look where they were, then clear it so CSS transition moves them.
 * No-op when reduced motion is on, when there is no previous snapshot, or when the shift is under 1px.
 */
export function playAgentRowFlip(
  root: ParentNode,
  before: ReadonlyMap<string, number>,
  options: {
    reducedMotion?: boolean;
    measure?: (el: HTMLElement) => number;
    schedule?: (run: () => void) => void;
  } = {},
) {
  if (options.reducedMotion ?? prefersReducedMotion()) return 0 as const;
  if (before.size === 0) return 0 as const;
  const measure = options.measure ?? ((el) => el.getBoundingClientRect().top);
  const schedule = options.schedule ?? ((run) => requestAnimationFrame(() => requestAnimationFrame(run)));
  let moved = 0;
  const pending: HTMLElement[] = [];
  for (const node of root.querySelectorAll<HTMLElement>(AGENT_ROW)) {
    const id = node.dataset.agentId;
    if (!id) continue;
    const first = before.get(id);
    if (first === undefined) continue;
    const dy = first - measure(node);
    if (Math.abs(dy) < 1) continue;
    node.style.transition = "none";
    node.style.transform = `translateY(${dy}px)`;
    pending.push(node);
    moved += 1;
  }
  if (pending.length === 0) return 0 as const;
  schedule(() => {
    for (const node of pending) {
      node.style.transition = "";
      node.style.transform = "";
    }
  });
  return moved;
}
