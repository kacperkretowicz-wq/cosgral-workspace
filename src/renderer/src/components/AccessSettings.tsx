import type { AccessDesktopApi, AgentAccess, AgentEvent } from "@openbot/contracts/ipc";
import { ACCESS_LEVEL_INFO, ACCESS_LEVELS, accessFolderProblem } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { PanelHeading } from "./PanelHeading";
import { Button, Field, NativeSelect, Text, Textarea } from "./ui";
import { ShieldCheck } from "./ui/icons";
export type SettingsEvents = (listener: (event: AgentEvent) => void) => () => void;
export function AccessSettings(props: { botId: string; api?: AccessDesktopApi; onEvent?: SettingsEvents }) {
  const api = untrack(() => props.api ?? window.openbot?.access);
  const [access, setAccess] = createSignal<AgentAccess>();
  const [additional, setAdditional] = createSignal("");
  const [excluded, setExcluded] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  let revision = 0;
  const accept = (value: AgentAccess) => {
    if (value.botId !== props.botId) return;
    setAccess(value);
    setAdditional(value.additionalFolders.join("\n"));
    setExcluded(value.excludedFolders.join("\n"));
  };
  async function reload() {
    const serial = ++revision;
    setAccess(undefined);
    if (!api) return;
    try {
      const next = await api.get({ botId: props.botId });
      if (serial === revision) accept(next);
    } catch {
      if (serial === revision) setError(t("Could not load access settings."));
    }
  }
  createEffect(
    () => props.botId,
    () => {
      setError("");
      setNotice("");
      void reload();
    },
  );
  onSettled(() => {
    const off = (props.onEvent ?? window.openbot?.agent?.onEvent)?.((event) => {
      if (event.type === "access-changed" && event.access.botId === props.botId) {
        revision++;
        accept(event.access);
        setNotice(t("Access settings updated."));
      }
      if (event.type === "access-denied" && event.botId === props.botId)
        setError(t("Access denied: {message}", { message: event.message }));
    });
    return () => {
      revision++;
      off?.();
    };
  });
  async function run(action: () => Promise<void>) {
    if (busy()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not update access settings."));
    } finally {
      setBusy(false);
    }
  }
  const folders = (text: string) =>
    text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  return (
    <section class="providers-form" aria-label={t("Agent access")}>
      <PanelHeading level="h3" icon={ShieldCheck} tint="orange">
        {t("Access level")}
      </PanelHeading>
      <Text as="p">
        {t(
          "Computer Use and the camera ask for separate permission. Excluded folders remain forbidden at every level, including Full.",
        )}
      </Text>
      <Show when={error()}>
        <Text role="alert" tone="danger">
          {error()}
        </Text>
      </Show>
      <Show when={notice()}>
        <Text role="status">{notice()}</Text>
      </Show>
      <Show
        when={access()}
        fallback={
          <Show when={api} fallback={<Text>{t("Access settings are unavailable on this connection.")}</Text>}>
            <CosgralLoadingSkeleton label={t("Loading access settings…")} />
          </Show>
        }
      >
        {(current) => (
          <>
            <Field label={t("Access level")}>
              <NativeSelect
                disabled={busy()}
                value={current().level}
                onChange={(event) => {
                  const level = ACCESS_LEVELS.find((value) => value === event.currentTarget.value);
                  if (!level) return;
                  event.currentTarget.value = current().level;
                  void run(async () => {
                    if (!api) return;
                    const result = await api.setLevel({ botId: props.botId, level });
                    accept(result.access);
                    setNotice(
                      result.raiseRequested
                        ? t("Approval requested in Needs you. The current level stays unchanged until you approve.")
                        : t("Access level updated."),
                    );
                  });
                }}
              >
                <For each={ACCESS_LEVELS}>
                  {(level) => <option value={level}>{ACCESS_LEVEL_INFO[level].name}</option>}
                </For>
              </NativeSelect>
            </Field>
            <Text as="p" tone="secondary">
              {t("Current: {name}. {summary}", {
                name: ACCESS_LEVEL_INFO[current().level].name,
                summary: ACCESS_LEVEL_INFO[current().level].summary,
              })}
            </Text>
            <Show when={current().raisedAt}>
              <Text as="p">{t("Last approved increase: {at}", { at: current().raisedAt ?? "" })}</Text>
            </Show>
            <form
              class="providers-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const additionalFolders = folders(additional());
                  const excludedFolders = folders(excluded());
                  for (const folder of [...additionalFolders, ...excludedFolders]) {
                    const problem = accessFolderProblem(folder);
                    if (problem) throw new Error(problem);
                  }
                  if (api) accept(await api.setFolders({ botId: props.botId, additionalFolders, excludedFolders }));
                  setNotice(t("Folder rules saved."));
                });
              }}
            >
              <Field label={t("Additional folders")} description={t("Absolute paths, one folder per line.")}>
                <Textarea
                  value={additional()}
                  rows={3}
                  disabled={busy()}
                  onInput={(e) => setAdditional(e.currentTarget.value)}
                />
              </Field>
              <Field
                label={t("Excluded folders")}
                description={t("Always refused, including at Full access. Absolute paths, one per line.")}
              >
                <Textarea
                  value={excluded()}
                  rows={3}
                  disabled={busy()}
                  onInput={(e) => setExcluded(e.currentTarget.value)}
                />
              </Field>
              <Button type="submit" disabled={busy()}>
                {t("Save folder rules")}
              </Button>
            </form>
          </>
        )}
      </Show>
      <Show when={error() && !access()}>
        <Button onClick={() => void reload()}>{t("Retry access settings")}</Button>
      </Show>
    </section>
  );
}
