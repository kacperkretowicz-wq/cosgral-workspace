import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import type { PageId } from "./PageRail";
import { PageIcon } from "./PageRail";

/**
 * One frame for every work page on the rail (Library, Schedule, Workflows, Usage, ...): the page's own rail icon,
 * its title and one sentence on what it is for, the main actions on the right, and below either the content or a
 * section list beside it. Pages used to stack bare cards under a lone `h1`; this gives them one structure.
 */
export function WorkPage(props: {
  page: PageId;
  title: string;
  description?: string;
  actions?: JSX.Element;
  /** Extra class on `<main>` (page-specific layout). */
  class?: string;
  children: JSX.Element;
}) {
  return (
    <main class={["w2-library work-page", props.class]} data-page={props.page}>
      <header class="work-page-header">
        <span class="work-page-icon" aria-hidden="true">
          <PageIcon page={props.page} />
        </span>
        <div class="work-page-heading">
          <h1>{props.title}</h1>
          <Show when={props.description}>
            <p>{props.description}</p>
          </Show>
        </div>
        <Show when={props.actions}>
          <div class="work-page-actions">{props.actions}</div>
        </Show>
      </header>
      {props.children}
    </main>
  );
}

export interface WorkPageSection<Id extends string> {
  id: Id;
  label: string;
  /** One line under the section title in the content area. */
  description?: string;
  icon: (props: { "aria-hidden": "true"; size: number; "stroke-width": number }) => JSX.Element;
  render: () => JSX.Element;
}

/**
 * A page split into sections: a list of sections with icons on the left (tabs on a narrow window) and the chosen
 * section on the right. The choice is remembered per page in this browser profile (a convenience only).
 */
export function WorkPageSections<Id extends string>(props: {
  page: PageId;
  label: string;
  sections: ReadonlyArray<WorkPageSection<Id>>;
  initial?: Id;
}) {
  // The page and the first section are read once, when the page opens (untracked on purpose).
  const storageKey = untrack(() => `cosgral.work-page.${props.page}.section`);
  const known = (value: string | null | undefined): Id | undefined =>
    props.sections.find((section) => section.id === value)?.id;
  const stored = () => {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };
  const [active, setActive] = createSignal<string | undefined>(
    untrack(() => known(stored()) ?? props.initial ?? props.sections[0]?.id),
  );
  const select = (id: Id) => {
    setActive(() => id);
    try {
      window.localStorage.setItem(storageKey, id);
    } catch {
      // Remembering the section is a convenience; without storage the page still works.
    }
  };
  const current = () => props.sections.find((section) => section.id === active()) ?? props.sections[0];
  const onKeyDown = (event: KeyboardEvent, index: number, item: HTMLElement) => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step) return;
    const next = props.sections[(index + step + props.sections.length) % props.sections.length];
    if (!next) return;
    event.preventDefault();
    select(next.id);
    const target = item.parentElement?.querySelector<HTMLElement>(`[data-section="${next.id}"]`);
    target?.focus();
  };
  return (
    <div class="work-page-body">
      <nav class="work-page-nav" aria-label={props.label}>
        <For each={props.sections}>
          {(section, index) => (
            <button
              type="button"
              class="work-page-nav-item"
              data-section={section.id}
              aria-current={current()?.id === section.id ? "page" : undefined}
              tabindex={current()?.id === section.id ? 0 : -1}
              onClick={() => select(section.id)}
              onKeyDown={(event) => onKeyDown(event, index(), event.currentTarget)}
            >
              {section.icon({ "aria-hidden": "true", size: 16, "stroke-width": 1.5 })}
              <span>{section.label}</span>
            </button>
          )}
        </For>
      </nav>
      <section class="work-page-section" aria-label={current()?.label}>
        <Show when={current()} keyed>
          {(section) => (
            <>
              <header class="work-page-section-header">
                <h2>{section.label}</h2>
                <Show when={section.description}>
                  <p>{section.description}</p>
                </Show>
              </header>
              <div class="work-page-section-content">{section.render()}</div>
            </>
          )}
        </Show>
      </section>
    </div>
  );
}

export interface WorkPageAnchor {
  id: string;
  label: string;
  icon: (props: { "aria-hidden": "true"; size: number; "stroke-width": number }) => JSX.Element;
}

/**
 * A long page that keeps every section on screen (settings people scan, scripts that expect every region), with a
 * list of its sections on the left that scrolls to one and follows the scroll. Sections are marked in the content
 * with `data-anchor="<id>"`.
 */
export function WorkPageAnchors(props: {
  label: string;
  anchors: ReadonlyArray<WorkPageAnchor>;
  children: JSX.Element;
}) {
  const [active, setActive] = createSignal(untrack(() => props.anchors[0]?.id ?? ""));
  let content: HTMLDivElement | undefined;
  const target = (id: string) => content?.querySelector<HTMLElement>(`[data-anchor="${id}"]`) ?? null;
  onSettled(() => {
    if (!content || !("IntersectionObserver" in window)) return;
    const root = content.closest<HTMLElement>(".work-page");
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-anchor");
          if (id) seen.set(id, entry.isIntersecting);
        }
        const first = props.anchors.find((anchor) => seen.get(anchor.id));
        if (first) setActive(first.id);
      },
      { root, rootMargin: "0px 0px -60% 0px" },
    );
    for (const anchor of props.anchors) {
      const element = target(anchor.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  });
  return (
    <div class="work-page-body">
      <nav class="work-page-nav" aria-label={props.label}>
        <For each={props.anchors}>
          {(anchor) => (
            <button
              type="button"
              class="work-page-nav-item"
              aria-current={active() === anchor.id ? "true" : undefined}
              onClick={() => {
                setActive(anchor.id);
                target(anchor.id)?.scrollIntoView({ block: "start" });
              }}
            >
              {anchor.icon({ "aria-hidden": "true", size: 16, "stroke-width": 1.5 })}
              <span>{anchor.label}</span>
            </button>
          )}
        </For>
      </nav>
      <div ref={(element) => (content = element)} class="work-page-section work-page-anchored">
        {props.children}
      </div>
    </div>
  );
}
