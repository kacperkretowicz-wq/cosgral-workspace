import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
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
  Mic,
  NativeSelect,
  Palette,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Switch,
  Text,
  X,
} from "./ui";
import { VoiceOverviewPanel } from "./VoiceOverviewPanel";

export interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const navItems: ReadonlyArray<{ label: string; icon: typeof Settings; current: boolean }> = [
  { label: "General", icon: Settings, current: true },
  { label: "Appearance", icon: Palette, current: false },
  { label: "Voice", icon: Mic, current: false },
  { label: "Updates", icon: RefreshCw, current: false },
  { label: "Notifications", icon: Bell, current: false },
  { label: "Advanced", icon: SlidersHorizontal, current: false },
];

/** The sections of the dialog that already have a page (the others say "Soon"). */
function isOpenSection(label: string): boolean {
  return label === "Appearance" || label === "Voice" || label === "Updates";
}

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
  const [launchAtLogin, setLaunchAtLogin] = createSignal(false);
  const [launchBusy, setLaunchBusy] = createSignal(false);
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

  onSettled(() => {
    void window.openbot.appSettings
      ?.get()
      .then((settings) => setLaunchAtLogin(settings.behavior.launchAtLogin))
      .catch(() => {
        /* Keep the default off until the person can try again. */
      });
  });

  async function saveLaunchAtLogin(enabled: boolean): Promise<void> {
    if (launchBusy()) return;
    setLaunchBusy(true);
    setLaunchAtLogin(enabled);
    try {
      const next = await window.openbot.appSettings?.update({ behavior: { launchAtLogin: enabled } });
      if (next) setLaunchAtLogin(next.behavior.launchAtLogin);
    } catch {
      setLaunchAtLogin(!enabled);
    } finally {
      setLaunchBusy(false);
    }
  }

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
                      disabled={!item.current && !isOpenSection(item.label)}
                      title={item.current || isOpenSection(item.label) ? undefined : t("Coming soon")}
                    >
                      <NavIcon aria-hidden="true" />
                      <span>{t(item.label)}</span>
                      {!item.current && !isOpenSection(item.label) && (
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
                  ) : section() === "Updates" ? (
                    <UpdatesPanel />
                  ) : section() === "Voice" ? (
                    <VoiceOverviewPanel />
                  ) : (
                    <>
                      <section class="settings-modal-group" aria-labelledby="settings-app-behavior">
                        <Heading id="settings-app-behavior" as="h3" size="sm" tone="secondary">
                          {t("App behavior")}
                        </Heading>
                        <Card class="settings-modal-card">
                          <Switch
                            checked={launchAtLogin()}
                            disabled={launchBusy()}
                            onChange={(checked) => void saveLaunchAtLogin(checked)}
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
