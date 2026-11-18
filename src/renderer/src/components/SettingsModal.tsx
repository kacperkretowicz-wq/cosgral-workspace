import { createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { t } from "../i18n";
import { AppearanceSettings } from "./AppearanceSettings";
import { BudgetSettings } from "./BudgetSettings";
import { ContextSettingsSection } from "./ContextSettingsSection";
import { LanguageSettings } from "./LanguageSettings";
import { UpdatesPanel } from "./UpdatesPanel";
import {
  Bell,
  Button,
  Card,
  Dialog,
  Heading,
  IconButton,
  NativeSelect,
  Palette,
  Settings,
  SlidersHorizontal,
  Switch,
  Text,
  X,
} from "./ui";

export interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const navItems: ReadonlyArray<{ label: string; icon: typeof Settings; current: boolean }> = [
  { label: "General", icon: Settings, current: true },
  { label: "Appearance", icon: Palette, current: false },
  { label: "Notifications", icon: Bell, current: false },
  { label: "Advanced", icon: SlidersHorizontal, current: false },
];

function durationToMilliseconds(value: string, fallback: number): number {
  const duration = value.trim();
  if (duration.endsWith("ms")) return Number.parseFloat(duration) || fallback;
  if (duration.endsWith("s")) return (Number.parseFloat(duration) || fallback / 1_000) * 1_000;
  return fallback;
}

function closeDuration(): number {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return durationToMilliseconds(
    getComputedStyle(document.documentElement).getPropertyValue("--openbot-duration-fast"),
    120,
  );
}

export function SettingsModal(props: SettingsModalProps) {
  const [section, setSection] = createSignal("General");
  const [rendered, setRendered] = createSignal(untrack(() => props.open));
  const [closing, setClosing] = createSignal(false);
  const [canScrollUp, setCanScrollUp] = createSignal(false);
  const [canScrollDown, setCanScrollDown] = createSignal(false);
  let closeTimer: number | undefined;
  let restoreTarget: HTMLElement | null = null;
  let restoreFrame: number | undefined;
  let modalElement: HTMLElement | undefined;
  let scrollElement: HTMLDivElement | undefined;
  let scrollResizeObserver: ResizeObserver | undefined;

  function clearCloseTimer(): void {
    if (closeTimer === undefined) return;
    window.clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  function restoreFocus(): void {
    if (!restoreTarget?.isConnected) return;
    const target = restoreTarget;
    restoreFrame = window.requestAnimationFrame(() => {
      restoreFrame = window.requestAnimationFrame(() => target.focus());
    });
  }

  function updateScrollFades(): void {
    if (!scrollElement) return;
    setCanScrollUp(scrollElement.scrollTop > 1);
    setCanScrollDown(scrollElement.scrollTop + scrollElement.clientHeight < scrollElement.scrollHeight - 1);
  }

  function registerScrollElement(element: HTMLDivElement): void {
    scrollResizeObserver?.disconnect();
    scrollElement = element;
    scrollResizeObserver = new ResizeObserver(updateScrollFades);
    scrollResizeObserver.observe(element);
    queueMicrotask(updateScrollFades);
  }

  createEffect(
    () => props.open,
    (open) => {
      clearCloseTimer();
      const isRendered = untrack(rendered);

      if (open) {
        if (!isRendered) {
          restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }
        setRendered(true);
        setClosing(false);
        return;
      }

      if (!isRendered) return;
      setClosing(true);
      closeTimer = window.setTimeout(() => {
        closeTimer = undefined;
        setRendered(false);
        setClosing(false);
        restoreFocus();
      }, closeDuration());
    },
  );

  onCleanup(() => {
    clearCloseTimer();
    scrollResizeObserver?.disconnect();
    if (restoreFrame !== undefined) window.cancelAnimationFrame(restoreFrame);
  });

  function requestOpenChange(open: boolean): void {
    if (!open && closing()) return;
    props.onOpenChange(open);
  }

  return (
    <Dialog.Root open={rendered()} onOpenChange={requestOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          class="settings-modal-backdrop"
          data-motion={closing() ? "closing" : "open"}
          data-testid="settings-modal-backdrop"
        >
          <Dialog.Content
            as="section"
            ref={(element) => (modalElement = element)}
            class="settings-modal"
            data-motion={closing() ? "closing" : "open"}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              queueMicrotask(() => modalElement?.focus({ preventScroll: true }));
            }}
          >
            <aside class="settings-modal-sidebar">
              <Text class="settings-modal-label" variant="label" tone="secondary">
                {t("Settings")}
              </Text>
              <nav class="settings-modal-nav" aria-label={t("Settings sections")}>
                {navItems.map((item) => {
                  const NavIcon = item.icon;
                  return (
                    <Button
                      unstyled
                      type="button"
                      class="settings-modal-nav-item"
                      aria-current={section() === item.label ? "page" : undefined}
                      onClick={() => setSection(item.label)}
                      disabled={!item.current && item.label !== "Appearance"}
                      title={item.current || item.label === "Appearance" ? undefined : t("Coming soon")}
                    >
                      <NavIcon aria-hidden="true" />
                      <span>{t(item.label)}</span>
                      {!item.current && item.label !== "Appearance" && (
                        <span class="settings-modal-nav-status" aria-hidden="true">
                          {t("Soon")}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </nav>
            </aside>

            <div class="settings-modal-main">
              <header class="settings-modal-header">
                <div>
                  <Dialog.Title class="settings-modal-title">{t(section())}</Dialog.Title>
                  <Dialog.Description class="settings-modal-description">
                    {t("Control how COSGRAL Workspace behaves on this computer.")}
                  </Dialog.Description>
                </div>
                <IconButton
                  label={t("Close settings")}
                  tooltip={t("Close settings")}
                  variant="ghost"
                  onClick={() => requestOpenChange(false)}
                >
                  <X />
                </IconButton>
              </header>

              <div
                class="settings-modal-scroll-frame"
                data-scroll-up={canScrollUp() ? "" : undefined}
                data-scroll-down={canScrollDown() ? "" : undefined}
                data-testid="settings-modal-scroll-frame"
              >
                <div ref={registerScrollElement} class="settings-modal-content" onScroll={updateScrollFades}>
                  {section() === "Appearance" ? (
                    <AppearanceSettings />
                  ) : (
                    <>
                      <section class="settings-modal-group" aria-labelledby="settings-app-behavior">
                        <Heading id="settings-app-behavior" as="h3" size="sm" tone="secondary">
                          {t("App behavior")}
                        </Heading>
                        <Card class="settings-modal-card">
                          <Switch
                            defaultChecked
                            label={t("Launch COSGRAL Workspace at login")}
                            description={t("Open the app when you sign in to this computer.")}
                          />
                          <Switch
                            label={t("Keep COSGRAL Workspace running in the background")}
                            description={t("Keep active tasks running after you close the window.")}
                          />
                        </Card>
                      </section>

                      <LanguageSettings />
                      <ContextSettingsSection />
                      <BudgetSettings />
                      <section class="settings-modal-group" aria-labelledby="settings-workspace">
                        <Heading id="settings-workspace" as="h3" size="sm" tone="secondary">
                          {t("Workspace")}
                        </Heading>
                        <Card class="settings-modal-card">
                          <Switch
                            defaultChecked
                            label={t("Restore the last workspace on launch")}
                            description={t("Open the workspace and tasks from your previous session.")}
                          />
                          <div class="settings-modal-row">
                            <div class="settings-modal-row-copy">
                              <span class="settings-modal-row-title">{t("Open external links in")}</span>
                              <Text tone="muted" variant="caption">
                                {t("Choose where links from conversations open.")}
                              </Text>
                            </div>
                            <NativeSelect
                              class="settings-modal-select"
                              size="sm"
                              aria-label={t("Open external links in")}
                            >
                              <option value="browser">{t("Default browser")}</option>
                              <option value="openbot">COSGRAL</option>
                            </NativeSelect>
                          </div>
                        </Card>
                      </section>

                      <section class="settings-modal-group" aria-labelledby="settings-notifications">
                        <Heading id="settings-notifications" as="h3" size="sm" tone="secondary">
                          {t("Notifications")}
                        </Heading>
                        <Card class="settings-modal-card">
                          <Switch
                            defaultChecked
                            label={t("Desktop notifications")}
                            description={t("Show a notification when an agent needs attention.")}
                          />
                          <Switch
                            label={t("Play a sound when a task finishes")}
                            description={t("Use a short sound for completed tasks.")}
                          />
                        </Card>
                      </section>

                      <UpdatesPanel />
                    </>
                  )}
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
