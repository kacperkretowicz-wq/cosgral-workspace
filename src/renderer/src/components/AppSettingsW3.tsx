import type { AppLanguage, AppSettings, CompleteOnboardingInput, OnboardingState } from "@openbot/contracts/ipc";
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { Dialog } from "./ui";

export function AppSettingsW3() {
  const [settings, setSettings] = createSignal<AppSettings>();
  const [error, setError] = createSignal("");
  onSettled(() => {
    void window.openbot.appSettings
      ?.get()
      .then(setSettings)
      .catch((e) => setError(String(e)));
  });
  async function save() {
    const value = settings();
    if (!value || !window.openbot.appSettings) return;
    try {
      setSettings(
        await window.openbot.appSettings.update({ language: value.language, notifications: value.notifications }),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    }
  }
  return (
    <section aria-label="Application settings">
      <h2>Application settings</h2>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={settings()}>
        {(value) => (
          <>
            <label>
              Language{" "}
              <select
                value={value().language}
                onChange={(e) => {
                  const language = e.currentTarget.value;
                  if (language === "en" || language === "pl") setSettings((s) => s && { ...s, language });
                }}
              >
                <option value="en">English</option>
                <option value="pl">Polski</option>
              </select>
            </label>
            <table>
              <caption>Notifications</caption>
              <thead>
                <tr>
                  <th>Event</th>
                  <For each={NOTIFICATION_CHANNELS}>{(channel) => <th>{channel}</th>}</For>
                </tr>
              </thead>
              <tbody>
                <For each={NOTIFICATION_EVENTS}>
                  {(event) => (
                    <tr>
                      <th>{event}</th>
                      <For each={NOTIFICATION_CHANNELS}>
                        {(channel) => (
                          <td>
                            <input
                              aria-label={`${event} ${channel}`}
                              type="checkbox"
                              checked={value().notifications.matrix[event][channel]}
                              onChange={(e) =>
                                setSettings(
                                  (s) =>
                                    s && {
                                      ...s,
                                      notifications: {
                                        ...s.notifications,
                                        matrix: {
                                          ...s.notifications.matrix,
                                          [event]: {
                                            ...s.notifications.matrix[event],
                                            [channel]: e.currentTarget.checked,
                                          },
                                        },
                                      },
                                    },
                                )
                              }
                            />
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <label>
              <input
                type="checkbox"
                checked={value().notifications.onlyWhenUnfocused}
                onChange={(e) =>
                  setSettings(
                    (s) =>
                      s && { ...s, notifications: { ...s.notifications, onlyWhenUnfocused: e.currentTarget.checked } },
                  )
                }
              />{" "}
              Notify only when unfocused
            </label>
            <h3>Settings sections</h3>
            <ul>
              <For each={value().tabs}>
                {(tab) => (
                  <li>
                    {tab.id}
                    {tab.available ? "" : " — unavailable"}
                  </li>
                )}
              </For>
            </ul>
            <button type="button" onClick={() => void save()}>
              Save application settings
            </button>
          </>
        )}
      </Show>
    </section>
  );
}

export function OnboardingW3(props: {
  state: OnboardingState;
  complete: (input: CompleteOnboardingInput) => Promise<unknown>;
}) {
  const [language, setLanguage] = createSignal<AppLanguage>(props.state.language ?? "en");
  const [provider, setProvider] = createSignal<"codex" | "claude">(
    props.state.preferredProvider === "claude" ? "claude" : "codex",
  );
  const [template, setTemplate] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [error, setError] = createSignal("");
  async function finish() {
    if (busy() || done()) return;
    setBusy(true);
    try {
      await props.complete({
        language: language(),
        preferredProvider: provider(),
        firstAgent: template() ? { templateId: template() } : null,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish setup.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Show when={!done() && !props.state.completed}>
      <Dialog.Root open>
        <main class="initial-setup-screen">
          <Dialog.Content as="section" class="initial-setup" aria-label="Welcome setup">
            <h1>Welcome to COSGRAL</h1>
            <label>
              Language{" "}
              <select
                value={language()}
                onChange={(e) => {
                  if (e.currentTarget.value === "en" || e.currentTarget.value === "pl")
                    setLanguage(e.currentTarget.value);
                }}
              >
                <option value="en">English</option>
                <option value="pl">Polski</option>
              </select>
            </label>
            <label>
              Provider{" "}
              <select
                value={provider()}
                onChange={(e) => {
                  if (e.currentTarget.value === "codex" || e.currentTarget.value === "claude")
                    setProvider(e.currentTarget.value);
                }}
              >
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
              </select>
            </label>
            <label>
              First agent{" "}
              <select value={template()} onChange={(e) => setTemplate(e.currentTarget.value)}>
                <option value="">Choose later</option>
                <For each={props.state.proposals}>
                  {(proposal) => (
                    <option value={proposal.id}>
                      {proposal.name} — {proposal.summary}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <h2>Computer Use</h2>
            <p>
              {props.state.computerUse.available
                ? "Available; actions require your approval."
                : (props.state.computerUse.reason ?? "Unavailable on this computer.")}
            </p>
            <Show when={error()}>
              <p role="alert">{error()}</p>
            </Show>
            <button type="button" disabled={busy()} onClick={() => void finish()}>
              Finish setup
            </button>
          </Dialog.Content>
        </main>
      </Dialog.Root>
    </Show>
  );
}

export function OnboardingW3Gate(props: { onComplete: (provider: "codex" | "claude") => Promise<void> }) {
  const [state, setState] = createSignal<OnboardingState>();
  onSettled(() => {
    void window.openbot.onboarding?.getState().then(setState);
  });
  return (
    <Show when={state()}>
      {(current) => (
        <OnboardingW3
          state={current()}
          complete={async (input) => {
            const api = window.openbot.onboarding;
            if (!api) throw new Error("Onboarding unavailable.");
            const next = await api.complete(input);
            await props.onComplete(input.preferredProvider === "claude" ? "claude" : "codex");
            setState(next);
          }}
        />
      )}
    </Show>
  );
}
