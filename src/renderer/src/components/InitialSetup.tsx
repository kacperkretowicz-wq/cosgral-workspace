import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import type {
  AgentProviderId,
  AgentProviderState,
  AgentStatus,
  AppSetupState,
  DesktopPlatform,
  JoinServerInput,
  MacPermissionId,
  MacPermissionsState,
  OnboardingState,
} from "@openbot/contracts/ipc";
import { createEffect, createMemo, createSignal, For, flush, onCleanup, onSettled, Show, untrack } from "solid-js";
import { language, t } from "../i18n";
import { AppBehaviorSection } from "./AppBehaviorSection";
import { AppearanceSettings } from "./AppearanceSettings";
import { AppSettingsW3, type OnboardingChoice, OnboardingFields } from "./AppSettingsW3";
import { BudgetSettings } from "./BudgetSettings";
import { ContextSettingsSection } from "./ContextSettingsSection";
import { DataWipeSection } from "./DataWipeSection";
import { ManagedCliSection } from "./ManagedCliSection";
import { ProviderPicker, type ProviderPickerOption } from "./ProviderPicker";
import { UpdatesPanel } from "./UpdatesPanel";
import { Button, Dialog, Textarea } from "./ui";
import { VoiceOverviewPanel } from "./VoiceOverviewPanel";

interface InitialSetupProps {
  reviewing?: boolean;
  state: AppSetupState;
  agentStatus: AgentStatus;
  platform: DesktopPlatform;
  accountEmail: string;
  /** `onboarding` is set on the first run when the program has onboarding (language and first agent). */
  onSave: (provider: AgentProviderId, onboarding?: OnboardingChoice) => Promise<void>;
  onJoinRemote: (input: JoinServerInput, provider: AgentProviderId) => Promise<void>;
  onLogout: () => Promise<void>;
  onClose?: () => void;
}

type SetupRoute = "local" | "remote";

const PROVIDERS: Array<{ id: AgentProviderId; name: string }> = [
  { id: "codex", name: "Codex" },
  { id: "claude", name: "Claude" },
];

const PERMISSIONS: Array<{
  id: MacPermissionId;
  title: string;
  description: string;
}> = [
  {
    id: "screen-recording",
    title: "Screen Recording",
    description: "Let Computer Use see what is on your screen.",
  },
  {
    id: "accessibility",
    title: "Accessibility",
    description: "Let Computer Use control apps on your Mac.",
  },
];

const EMPTY_PERMISSIONS: MacPermissionsState = {
  screenRecording: "unknown",
  accessibility: "unknown",
};

export function InitialSetup(props: InitialSetupProps) {
  const [route, setRoute] = createSignal<SetupRoute | null>(untrack(() => (props.reviewing ? "local" : null)));
  const [selectedProvider, setSelectedProvider] = createSignal<AgentProviderId | null>(
    untrack(() => props.state.preferredProvider),
  );
  const [permissions, setPermissions] = createSignal(EMPTY_PERMISSIONS);
  const [saving, setSaving] = createSignal(false);
  const [permissionBusy, setPermissionBusy] = createSignal<MacPermissionId | null>(null);
  const [error, setError] = createSignal("");
  const [inviteUrl, setInviteUrl] = createSignal("");
  const [onboarding, setOnboarding] = createSignal<OnboardingState>();
  // Start on the language the window already shows (system language until one is chosen), not on a fixed "en".
  const [onboardingChoice, setOnboardingChoice] = createSignal<OnboardingChoice>({
    language: untrack(language),
    firstAgent: null,
  });
  const [cliReady, setCliReady] = createSignal<Record<string, boolean>>({});
  let permissionRevision = 0;

  // First run only: the onboarding questions join this step, so there is one flow and one provider question.
  onSettled(() => {
    if (untrack(() => props.reviewing)) return;
    void window.openbot.onboarding
      ?.getState()
      .then((state) => {
        if (state.completed) return;
        setOnboardingChoice((choice) => ({ ...choice, language: state.language ?? choice.language }));
        setOnboarding(state);
      })
      .catch(() => undefined);
  });
  const providerOptions = createMemo<ProviderPickerOption[]>(() =>
    PROVIDERS.map((provider) => {
      const status = props.agentStatus.providers?.find((candidate) => candidate.id === provider.id);
      return {
        ...provider,
        state: status?.state ?? fallbackProviderState(props.agentStatus),
        message: status?.message,
        email: status?.email,
      };
    }),
  );
  const availableProviders = createMemo(() => providerOptions().filter((provider) => provider.state === "available"));
  /**
   * The chosen provider has a CLI: the managed-CLI card says so (own path, downloaded, PATH or a known folder), or the
   * program's own provider status already says "available" (e.g. a CLI the program was started with). Only a provider
   * that really has none keeps Continue blocked, and then "Pobierz i przejdź dalej" is the way on.
   */
  const providerHasCli = () => {
    const id = selectedProvider() ?? "";
    return (
      !!cliReady()[id] || providerOptions().some((provider) => provider.id === id && provider.state === "available")
    );
  };

  createEffect(
    () => ({
      options: providerOptions(),
      available: availableProviders(),
      selected: selectedProvider(),
      preferredProvider: props.state.preferredProvider,
    }),
    ({ options, available, selected, preferredProvider }) => {
      if (selected && options.some((provider) => provider.id === selected)) return;
      const preferred = options.find((provider) => provider.id === preferredProvider);
      setSelectedProvider(preferred?.id ?? available[0]?.id ?? options[0]?.id ?? null);
    },
  );

  async function loadPermissions(): Promise<void> {
    const revision = ++permissionRevision;
    try {
      const next = await window.openbot.getMacPermissions();
      if (revision === permissionRevision) flush(() => setPermissions(next));
    } catch (cause) {
      setError(errorMessage(cause, t("COSGRAL Workspace could not read macOS permissions.")));
    }
  }

  createEffect(
    () => ({ route: route(), platform: props.platform }),
    ({ route: currentRoute, platform }) => {
      if (platform === "darwin" && currentRoute === "local") void loadPermissions();
    },
  );

  const handleFocus = () => {
    const shouldRefresh = untrack(() => props.platform === "darwin" && route() === "local");
    if (shouldRefresh) void loadPermissions();
  };
  window.addEventListener("focus", handleFocus);
  onCleanup(() => window.removeEventListener("focus", handleFocus));

  async function requestPermission(permission: MacPermissionId): Promise<void> {
    if (permissionBusy()) return;
    const revision = ++permissionRevision;
    setPermissionBusy(permission);
    setError("");
    try {
      const next = await window.openbot.requestMacPermission(permission);
      if (revision === permissionRevision) flush(() => setPermissions(next));
    } catch (cause) {
      setError(errorMessage(cause, t("COSGRAL Workspace could not open this macOS permission.")));
    } finally {
      setPermissionBusy(null);
    }
  }

  function chooseRoute(nextRoute: SetupRoute): void {
    setError("");
    setRoute(nextRoute);
  }

  async function saveLocal(): Promise<void> {
    const provider = selectedProvider();
    if (!provider || saving()) return;
    setSaving(true);
    setError("");
    try {
      await props.onSave(provider, onboarding() && !props.reviewing ? onboardingChoice() : undefined);
    } catch (cause) {
      setError(errorMessage(cause, t("COSGRAL Workspace could not save your local setup.")));
      setSaving(false);
    }
  }

  async function connectRemote(): Promise<void> {
    const provider = selectedProvider() ?? "codex";
    if (saving()) return;
    setSaving(true);
    setError("");
    try {
      await props.onJoinRemote({ inviteUrl: inviteUrl().trim() }, provider);
    } catch (cause) {
      setError(errorMessage(cause, t("COSGRAL Workspace could not connect to this host.")));
      setSaving(false);
    }
  }

  const title = () => {
    if (props.reviewing) return props.platform === "darwin" ? t("Providers & permissions") : t("Settings");
    if (route() === "local") return t("Set up this computer");
    if (route() === "remote") return t("Connect to a host");
    return t("Where will COSGRAL Workspace run?");
  };

  const description = () => {
    if (props.reviewing) {
      return props.platform === "darwin"
        ? t("Choose the default provider for local agents and review macOS permissions.")
        : t("Default provider for local agents, language, notifications and voice.");
    }
    if (route() === "local") {
      return t("Agents, conversations, and files stay on this computer.");
    }
    if (route() === "remote") {
      return t("Use an invitation from the person who runs your COSGRAL host.");
    }
    return t("Use this computer, or connect to a COSGRAL host that runs somewhere else.");
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && props.onClose?.()}>
      <main class="initial-setup-screen">
        <Dialog.Content
          as="section"
          class="initial-setup"
          onOpenAutoFocus={(event: Event) => {
            // The dialog would focus its first button, "Sign out", so Enter would sign out. Focus the first choice.
            const container = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
            const first = container?.querySelector<HTMLElement>(
              ".setup-route-button, .setup-local-content input, .setup-local-content button",
            );
            if (!first) return;
            event.preventDefault();
            first.focus();
          }}
        >
          <header class="initial-setup-header">
            <div class="initial-setup-account-row">
              <Show when={!props.reviewing && route()}>
                <Button
                  type="button"
                  class="initial-setup-back"
                  aria-label={t("Back to connection choice")}
                  onClick={() => {
                    setError("");
                    setRoute(null);
                  }}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m12.5 4.5-5 5 5 5" />
                  </svg>
                </Button>
              </Show>
              <span class="initial-setup-account">
                <i aria-hidden="true" />
                {props.accountEmail}
              </span>
              <Button type="button" class="initial-setup-signout" onClick={() => void props.onLogout()}>
                {t("Sign out")}
              </Button>
            </div>
            <p class="initial-setup-eyebrow">{t("COSGRAL setup")}</p>
            <Dialog.Title as="h1" id="initial-setup-title">
              {title()}
            </Dialog.Title>
            <Dialog.Description as="p" id="initial-setup-description" class="initial-setup-intro">
              {description()}
            </Dialog.Description>
          </header>

          <Show when={!props.reviewing && route() === null}>
            <ul class="setup-route-list" aria-label={t("Connection type")}>
              <li>
                <Button type="button" class="setup-route-button" onClick={() => chooseRoute("local")}>
                  <span class="setup-route-icon setup-route-icon-local" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <title>{t("Local computer")}</title>
                      <rect x="3" y="4" width="18" height="13" rx="2.5" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                    <i />
                  </span>
                  <span class="setup-route-copy">
                    <strong>{t("Use this computer")}</strong>
                    <small>{t("Run Codex or Claude locally. Keep all COSGRAL data here.")}</small>
                  </span>
                  <RouteArrow />
                </Button>
              </li>
              <li>
                <Button type="button" class="setup-route-button" onClick={() => chooseRoute("remote")}>
                  <span class="setup-route-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <title>{t("Remote host")}</title>
                      <rect x="3" y="3" width="18" height="7" rx="2.5" />
                      <rect x="3" y="14" width="18" height="7" rx="2.5" />
                      <path d="M7 6.5h.01M7 17.5h.01" />
                    </svg>
                    <i />
                  </span>
                  <span class="setup-route-copy">
                    <strong>{t("Connect to a host")}</strong>
                    <small>{t("Use agents and conversations from an existing COSGRAL host.")}</small>
                  </span>
                  <RouteArrow />
                </Button>
              </li>
            </ul>
          </Show>

          <Show when={route() === "local"}>
            <div class="setup-local-content">
              <ProviderPicker
                value={selectedProvider()}
                options={providerOptions()}
                ariaLabel={t("Default provider")}
                label={t("Default provider")}
                hint={t("Used for new local agents. You can change it for each agent later.")}
                disabled={saving()}
                allowUnavailableSelection
                focusFirst
                onChange={setSelectedProvider}
              />

              <Show when={!props.reviewing && window.openbot.subscriptions && selectedProvider()} keyed>
                {(provider) => (
                  <ManagedCliSection
                    provider={provider}
                    onAvailability={(id, ready) => setCliReady((current) => ({ ...current, [id]: ready }))}
                    onReady={() => void saveLocal()}
                  />
                )}
              </Show>
              <Show when={!props.reviewing && onboarding()}>
                {(state) => (
                  <OnboardingFields
                    state={state()}
                    value={onboardingChoice()}
                    disabled={saving()}
                    onChange={setOnboardingChoice}
                  />
                )}
              </Show>

              <Show when={props.platform === "darwin"}>
                <section class="mac-permissions" aria-labelledby="mac-permissions-title">
                  <div class="mac-permissions-heading">
                    <div>
                      <h2 id="mac-permissions-title">{t("Mac permissions")}</h2>
                      <p>{t("Optional. Computer Use needs both permissions.")}</p>
                    </div>
                  </div>
                  <div class="mac-permission-list">
                    <For each={PERMISSIONS}>
                      {(permission) => {
                        const state = () => permissionState(permissions(), permission.id);
                        return (
                          <div class="mac-permission-row">
                            <span class="mac-permission-copy">
                              <strong>{t(permission.title)}</strong>
                              <small>{t(permission.description)}</small>
                            </span>
                            <Button
                              type="button"
                              class={["mac-permission-action", { "mac-permission-allowed": state() === "granted" }]}
                              disabled={permissionBusy() !== null || state() === "granted" || state() === "restricted"}
                              onClick={() => void requestPermission(permission.id)}
                            >
                              {permissionBusy() === permission.id ? t("Checking…") : t(permissionLabel(state()))}
                            </Button>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </section>
              </Show>
              <Show when={props.reviewing}>
                <AppSettingsW3 />
                {/* KK-AC: the dialog of app settings was never opened from the program, so Updates and the microphone were out of reach. */}
                <AppBehaviorSection />
                <AppearanceSettings />
                <ContextSettingsSection />
                <BudgetSettings />
                <UpdatesPanel />
                <VoiceOverviewPanel />
                <DataWipeSection />
              </Show>
            </div>
          </Show>

          <Show when={!props.reviewing && route() === "remote"}>
            <form
              class="setup-remote-form"
              onSubmit={(event) => {
                event.preventDefault();
                void connectRemote();
              }}
            >
              <label>
                <span>{t("Host invitation")}</span>
                <Textarea
                  rows="3"
                  maxlength={INPUT_LIMITS.inviteUrl}
                  value={inviteUrl()}
                  onInput={(event) => setInviteUrl(event.currentTarget.value)}
                  placeholder={t("Paste an cosgral:// invitation link")}
                  spellcheck={false}
                  autofocus
                  required
                />
              </label>
              <p class="setup-remote-note">
                {t("You will join as")} <strong>{props.accountEmail}</strong>.{" "}
                {t("Email invitations only work for the address that received them.")}
              </p>
            </form>
          </Show>

          <Show when={error()}>
            <p class="initial-setup-error" role="alert">
              {error()}
            </p>
          </Show>

          <Show when={route() !== null}>
            <div class="initial-setup-actions">
              <Show when={props.reviewing}>
                <Button type="button" class="initial-setup-secondary" onClick={props.onClose}>
                  {t("Cancel")}
                </Button>
              </Show>
              <Button
                type="button"
                class="initial-setup-save"
                disabled={
                  saving() ||
                  (!props.reviewing && route() === "local" && !!window.openbot.subscriptions && !providerHasCli()) ||
                  (route() === "local" && !selectedProvider()) ||
                  (route() === "remote" && !inviteUrl().trim())
                }
                onClick={() => (route() === "local" ? void saveLocal() : void connectRemote())}
              >
                {saving()
                  ? route() === "remote"
                    ? t("Connecting…")
                    : t("Saving…")
                  : props.reviewing
                    ? t("Save changes")
                    : route() === "remote"
                      ? t("Connect to host")
                      : selectedProvider()
                        ? t("Continue with {provider}", { provider: providerName(selectedProvider()) })
                        : t("Choose a provider")}
              </Button>
            </div>
          </Show>
        </Dialog.Content>
      </main>
    </Dialog.Root>
  );
}

function RouteArrow() {
  return (
    <svg class="setup-route-arrow" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function permissionState(
  permissions: MacPermissionsState,
  permission: MacPermissionId,
): MacPermissionsState["screenRecording"] {
  return permission === "screen-recording" ? permissions.screenRecording : permissions.accessibility;
}

function permissionLabel(
  state: MacPermissionsState["screenRecording"],
): "Allowed" | "Open Settings" | "Restricted" | "Allow" {
  if (state === "granted") return "Allowed";
  if (state === "denied" || state === "unknown") return "Open Settings";
  if (state === "restricted") return "Restricted";
  return "Allow";
}

function providerName(provider: AgentProviderId | null): "Claude" | "Codex" {
  return provider === "claude" ? "Claude" : "Codex";
}

function fallbackProviderState(status: AgentStatus): AgentProviderState {
  return status.phase === "starting" || status.phase === "restarting" ? "checking" : "error";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
