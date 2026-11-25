import type { AgentIsolation, IsolationDesktopApi } from "@openbot/contracts/ipc";
import { createSignal, onSettled, Show, untrack } from "solid-js";
import { t, tDataParts } from "../i18n";
import type { SettingsEvents } from "./AccessSettings";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { PanelHeading } from "./PanelHeading";
import { Switch, Text } from "./ui";
import { Lock } from "./ui/icons";
export function IsolationSettings(props: { botId: string; api?: IsolationDesktopApi; onEvent?: SettingsEvents }) {
  const api = untrack(() => props.api ?? window.openbot?.isolation);
  const [state, setState] = createSignal<AgentIsolation>();
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  onSettled(() => {
    let live = true;
    void api
      ?.get({ botId: props.botId })
      .then((value) => {
        if (live) setState(value);
      })
      .catch(() => {
        if (live) setError(t("Could not load isolation. Reopen settings to retry."));
      });
    const off = (props.onEvent ?? window.openbot?.agent?.onEvent)?.((event) => {
      if (event.type === "isolation-changed") {
        const next = event.agents.find((agent) => agent.botId === props.botId);
        if (next) {
          setState(next);
          setNotice("");
        }
      }
    });
    return () => {
      live = false;
      off?.();
    };
  });
  async function toggle() {
    const current = state();
    if (!api || !current || busy()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.setEnabled({ botId: props.botId, enabled: !current.enabled });
      setState(result.isolation);
      setNotice(
        result.offRequested
          ? t("Approval requested in Needs you. Isolation stays on until you approve.")
          : t("Isolation enabled."),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not change isolation."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="providers-form" aria-label={t("Agent isolation")}>
      <PanelHeading level="h3" icon={Lock} tint="red">
        {t("Process isolation")}
      </PanelHeading>
      <Show when={error()}>
        <Text role="alert" tone="danger">
          {error()}
        </Text>
      </Show>
      <Show when={notice()}>
        <Text role="status">{notice()}</Text>
      </Show>
      <Show
        when={state()}
        fallback={
          <Show when={api} fallback={<Text>{t("Isolation is unavailable on this connection.")}</Text>}>
            <CosgralLoadingSkeleton label={t("Loading isolation…")} />
          </Show>
        }
      >
        {(current) => (
          <>
            <Text>
              {current().state === "active"
                ? t("Isolation: active")
                : current().state === "shared-process"
                  ? t("Isolation: shared process")
                  : current().state === "unavailable"
                    ? t("Isolation: unavailable")
                    : t("Isolation: off")}
            </Text>
            <Show when={current().state === "shared-process"}>
              <Text>{t("Codex: one shared process, not isolated per agent")}</Text>
            </Show>
            <Show when={current().reason}>
              <Text>{tDataParts(current().reason ?? "")}</Text>
            </Show>
            <Show when={current().state === "active"}>
              <Text>{t("Process limits are active. This does not provide an AppContainer disk boundary.")}</Text>
            </Show>
            <Show when={current().state === "unavailable"}>
              <Text>
                {t(
                  "Process isolation is unavailable: file and shell tools below Full access are refused. Access is not widened automatically.",
                )}
              </Text>
            </Show>
            <Switch
              label={t("Enable process isolation")}
              checked={current().enabled}
              disabled={busy()}
              onChange={() => void toggle()}
            />
          </>
        )}
      </Show>
    </section>
  );
}
