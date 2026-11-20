import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { PageIcon } from "./PageRail";
import { Button, Dialog, IconButton } from "./ui";
import { X } from "./ui/icons";

export interface SettingsDialogSection {
  id: string;
  label: string;
  icon: (props: { "aria-hidden": "true"; size: number; "stroke-width": number }) => JSX.Element;
}

/**
 * The Settings window (gear at the bottom of the page rail): a list of sections with icons on the left that scrolls
 * to one and follows the scroll, every section on one scrolling page on the right (people scan settings; tests and
 * acceptance scripts expect every region), and the actions in one footer. Sections mark themselves with
 * `data-anchor="<id>"` (see `SettingsSection`).
 */
export function SettingsDialog(props: {
  title: string;
  description: string;
  accountEmail: string;
  sections: ReadonlyArray<SettingsDialogSection>;
  footer: JSX.Element;
  onLogout: () => void;
  onClose?: () => void;
  children: JSX.Element;
}) {
  const [active, setActive] = createSignal(untrack(() => props.sections[0]?.id ?? ""));
  const [edges, setEdges] = createSignal({ up: false, down: false });
  let content: HTMLDivElement | undefined;
  const target = (id: string) => content?.querySelector<HTMLElement>(`[data-anchor="${id}"]`) ?? null;
  const measure = () => {
    if (!content) return;
    setEdges({
      up: content.scrollTop > 2,
      down: content.scrollTop + content.clientHeight < content.scrollHeight - 2,
    });
  };
  onSettled(() => {
    measure();
    if (!content || !("IntersectionObserver" in window)) return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-anchor");
          if (id) seen.set(id, entry.isIntersecting);
        }
        const first = props.sections.find((section) => seen.get(section.id));
        if (first) setActive(first.id);
      },
      { root: content, rootMargin: "0px 0px -65% 0px" },
    );
    // Sections that load their data later (voice, updates) appear after the first paint: observe what is there now.
    for (const section of props.sections) {
      const element = target(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  });
  return (
    <Dialog.Root open onOpenChange={(open) => !open && props.onClose?.()}>
      <div class="initial-setup-screen settings-modal-backdrop settings-dialog-backdrop">
        <Dialog.Content as="section" class="settings-modal settings-dialog">
          <aside class="settings-modal-sidebar">
            <div class="settings-dialog-brand">
              <span class="settings-dialog-icon" aria-hidden="true">
                <PageIcon page="settings" />
              </span>
              <Dialog.Title as="h1" class="settings-dialog-title">
                {props.title}
              </Dialog.Title>
            </div>
            <nav class="settings-modal-nav" aria-label={t("Settings sections")}>
              <For each={props.sections}>
                {(section) => (
                  <Button
                    unstyled
                    type="button"
                    class="settings-modal-nav-item settings-dialog-nav-item"
                    aria-current={active() === section.id ? "true" : undefined}
                    onClick={() => {
                      setActive(section.id);
                      target(section.id)?.scrollIntoView({ block: "start" });
                    }}
                  >
                    {section.icon({ "aria-hidden": "true", size: 16, "stroke-width": 1.75 })}
                    <span>{section.label}</span>
                  </Button>
                )}
              </For>
            </nav>
            <div class="settings-dialog-account">
              <span class="initial-setup-account">
                <i aria-hidden="true" />
                <span>{props.accountEmail}</span>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => props.onLogout()}>
                {t("Sign out")}
              </Button>
            </div>
          </aside>
          <div class="settings-modal-main settings-dialog-main">
            <div class="settings-modal-header">
              <Dialog.Description as="p" class="settings-modal-description">
                {props.description}
              </Dialog.Description>
              <Show when={props.onClose}>
                <IconButton
                  type="button"
                  variant="ghost"
                  class="settings-dialog-close"
                  label={t("Close settings")}
                  onClick={() => props.onClose?.()}
                >
                  <X aria-hidden="true" size={16} stroke-width={1.75} />
                </IconButton>
              </Show>
            </div>
            <div
              class="settings-modal-scroll-frame"
              data-scroll-up={edges().up ? "" : undefined}
              data-scroll-down={edges().down ? "" : undefined}
            >
              <div ref={(element) => (content = element)} class="settings-modal-content" onScroll={measure}>
                {props.children}
              </div>
            </div>
            <footer class="settings-dialog-footer">{props.footer}</footer>
          </div>
        </Dialog.Content>
      </div>
    </Dialog.Root>
  );
}

/** One section of the Settings window: a title, one sentence, and its rows. */
export function SettingsSection(props: {
  id: string;
  title: string;
  description?: string;
  /** Set when the content brings its own (hidden) heading with this name, e.g. the voice panel's `h2`. */
  class?: string;
  children: JSX.Element;
}) {
  const headingId = untrack(() => `settings-section-${props.id}`);
  return (
    // A plain block, not a landmark: the panels inside are regions with the same names ("Updates", "Appearance").
    <div class={["settings-dialog-section", props.class]} data-anchor={props.id}>
      <div class="settings-dialog-section-header">
        <h2 id={headingId}>{props.title}</h2>
        <Show when={props.description}>
          <p>{props.description}</p>
        </Show>
      </div>
      <div class="settings-dialog-section-body">{props.children}</div>
    </div>
  );
}
