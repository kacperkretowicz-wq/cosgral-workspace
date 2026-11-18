import { safeCliError } from "./provider-error";

export { safeCliError } from "./provider-error";

import type { ManagedCliState, SubscriptionsDesktopApi } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Badge, Button, Card, Field, Heading, Input, Switch, Text } from "./ui";
// W5-BE2: the API also has account methods, so the CLI actions are named here (not "everything but listCli").
export type CliAction = Extract<
  keyof SubscriptionsDesktopApi,
  "checkCli" | "installCli" | "updateCli" | "removeCli" | "pinCli" | "setCliSettings"
>;
export type CliInput = {
  id: ManagedCliState["id"];
  version?: string | null;
  customPath?: string | null;
  autoUpdate?: boolean;
};
export function cliPathError(path: string) {
  if (!path.trim()) return "";
  return path.length > 1024 || /[\r\n\0]/.test(path) || !/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(path.trim())
    ? t("Enter the full path to the CLI file (max 1024 characters).")
    : "";
}
function sourceLabel(source: ManagedCliState["source"]): string {
  switch (source) {
    case "custom":
      return t("Custom path");
    case "managed":
      return t("Downloaded");
    case "system":
      return t("System");
    default:
      return t("None");
  }
}
function phaseLabel(phase: ManagedCliState["phase"]): string {
  switch (phase) {
    case "idle":
      return t("Ready");
    case "checking":
      return t("Checking version");
    case "awaiting-approval":
      return t("Waiting for approval in Needs you");
    case "downloading":
      return t("Downloading");
    case "verifying":
      return t("Verifying SHA-256");
    case "installing":
      return t("Installing");
    case "removing":
      return t("Removing");
    default:
      return t("Failed");
  }
}
export function ManagedCliCard(props: {
  state: ManagedCliState;
  pending?: boolean;
  installLabel?: string;
  onAction: (action: CliAction, input: CliInput) => void;
}) {
  const [path, setPath] = createSignal("");
  const [version, setVersion] = createSignal("");
  createEffect(
    () => props.state.customPath,
    (value) => {
      setPath(value ?? "");
    },
  );
  createEffect(
    () => props.state.pinnedVersion,
    (value) => {
      setVersion(value ?? "");
    },
  );
  const busy = () => props.pending || !["idle", "error"].includes(props.state.phase);
  const send = (action: CliAction, extra: Omit<CliInput, "id"> = {}) =>
    props.onAction(action, { id: props.state.id, ...extra });
  const percent = () =>
    props.state.progress?.totalBytes
      ? Math.min(100, Math.max(0, (100 * props.state.progress.receivedBytes) / props.state.progress.totalBytes))
      : undefined;
  return (
    <Card class="managed-cli-card">
      <div class="providers-heading">
        <Heading as="h3" size="md">
          {props.state.id === "codex" ? "Codex" : "Claude"}
        </Heading>
        <Badge>{sourceLabel(props.state.source)}</Badge>
      </div>
      <Text as="p">
        {t("In use: {version} · Downloaded: {managed} · Latest: {latest}", {
          version: props.state.version ?? "—",
          managed: props.state.managedVersion ?? "—",
          latest: props.state.latestVersion ?? t("not checked yet"),
        })}
      </Text>
      <Text as="p" role="status" aria-live="polite">
        {phaseLabel(props.state.phase)}
      </Text>
      <Show when={props.state.progress}>
        {(progress) => (
          <div
            role="progressbar"
            aria-label={t("Download progress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent()}
          >
            <div class="managed-cli-track">
              <div class="managed-cli-fill" style={{ width: `${percent() ?? 0}%` }} />
            </div>
            <Text as="p" tone="muted">
              {t("{received} / {total} bytes", {
                received: String(progress().receivedBytes),
                total: String(progress().totalBytes || "?"),
              })}
            </Text>
          </div>
        )}
      </Show>
      <Show when={props.state.error}>
        <Text as="p" tone="danger" role="alert">
          {safeCliError(props.state.error ?? "")}
        </Text>
      </Show>
      <div class="managed-cli-actions">
        <Button disabled={busy()} onClick={() => send("installCli")}>
          {props.installLabel ?? t("Download")}
        </Button>
        <Button disabled={busy()} onClick={() => send("checkCli")}>
          {t("Check")}
        </Button>
        <Show when={props.state.managedVersion}>
          <Button disabled={busy()} onClick={() => send("updateCli")}>
            {t("Update")}
          </Button>
          <Button disabled={busy()} onClick={() => send("removeCli")}>
            {t("Remove")}
          </Button>
        </Show>
        <Show when={props.state.error}>
          <Button disabled={busy()} onClick={() => send(props.state.managedVersion ? "updateCli" : "installCli")}>
            {t("Retry")}
          </Button>
        </Show>
      </div>
      <Switch
        label={t("Update automatically")}
        checked={props.state.autoUpdate}
        disabled={busy()}
        onChange={(autoUpdate) => send("setCliSettings", { autoUpdate })}
      />
      <Text as="p" tone="muted">
        {t("Pinning a version pauses automatic updates.")}
      </Text>
      <Field label={t("Pinned version")}>
        <Input value={version()} onInput={(e) => setVersion(e.currentTarget.value)} />
      </Field>
      <div class="managed-cli-actions">
        <Button
          disabled={busy() || !/^[0-9A-Za-z.+-]{1,64}$/.test(version())}
          onClick={() => send("pinCli", { version: version() })}
        >
          {t("Pin")}
        </Button>
        <Button disabled={busy() || !props.state.pinnedVersion} onClick={() => send("pinCli", { version: null })}>
          {t("Unpin")}
        </Button>
      </div>
      <Field label={t("Custom path to the CLI")} error={cliPathError(path())}>
        <Input value={path()} onInput={(e) => setPath(e.currentTarget.value)} />
      </Field>
      <div class="managed-cli-actions">
        <Button
          disabled={busy() || !path().trim() || !!cliPathError(path())}
          onClick={() => send("setCliSettings", { customPath: path().trim() })}
        >
          {t("Save path")}
        </Button>
        <Button
          disabled={busy() || !props.state.customPath}
          onClick={() => send("setCliSettings", { customPath: null })}
        >
          {t("Clear path")}
        </Button>
      </div>
    </Card>
  );
}
export function ManagedCliSection(props: {
  provider?: string;
  onReady?: () => void;
  onAvailability?: (id: string, ready: boolean) => void;
}) {
  const [states, setStates] = createSignal<ManagedCliState[]>([]);
  const [error, setError] = createSignal("");
  const [pending, setPending] = createSignal<string[]>([]);
  let revision = 0;
  createEffect(
    () => states(),
    (items) => {
      for (const state of items)
        props.onAvailability?.(state.id, state.source !== "none" && ["idle", "error"].includes(state.phase));
    },
  );
  const replace = (state: ManagedCliState) =>
    setStates((items) =>
      [...items.filter((item) => item.id !== state.id), state].sort((a, b) => a.id.localeCompare(b.id)),
    );
  async function load() {
    const serial = ++revision;
    try {
      const result = await window.openbot.subscriptions?.listCli();
      if (serial === revision) {
        setStates(result ?? []);
        setError("");
      }
    } catch (e) {
      setError(safeCliError(String(e)));
    }
  }
  onSettled(() => {
    void load();
    const off = window.openbot.agent?.onEvent((event) => {
      if (event.type === "managed-cli-changed") {
        revision++;
        replace(event.state);
      }
    });
    return () => {
      revision++;
      off?.();
    };
  });
  async function action(method: CliAction, input: CliInput) {
    const api = window.openbot.subscriptions;
    if (!api) return;
    setPending((ids) => [...ids, input.id]);
    setError("");
    try {
      // Input shape is constrained by each card action; the desktop validates it again.
      const invoke = (input: CliInput) => {
        switch (method) {
          case "pinCli":
            return api.pinCli({ id: input.id, version: input.version ?? null });
          case "installCli":
            return api.installCli({ id: input.id, ...(input.version ? { version: input.version } : {}) });
          case "setCliSettings":
            return api.setCliSettings(input);
          default:
            return api[method]({ id: input.id });
        }
      };
      const state = await invoke(input);
      replace(state);
      if (method === "installCli" && state.source !== "none" && state.phase === "idle") props.onReady?.();
    } catch (e) {
      setError(safeCliError(String(e)));
    } finally {
      setPending((ids) => ids.filter((id) => id !== input.id));
    }
  }
  return (
    <section class="providers-section" aria-label={t("CLI tools")}>
      <Heading as="h2" size="md">
        {props.provider ? t("Connect a provider") : t("CLI tools")}
      </Heading>
      <Text as="p" tone="muted">
        {t(
          "Custom path → downloaded → system. The first download needs your approval. Connect accounts on the Providers page.",
        )}
      </Text>
      <Show when={error()}>
        <Text as="p" role="alert" tone="danger">
          {error()}
        </Text>
        <Button onClick={() => void load()}>{t("Retry loading")}</Button>
      </Show>
      <Show
        when={states().length}
        fallback={
          <Show
            when={window.openbot.subscriptions}
            fallback={
              <Text as="p" tone="muted">
                {t("CLI management is not available in this version.")}
              </Text>
            }
          >
            <CosgralLoadingSkeleton label={t("Loading CLI tools…")} />
          </Show>
        }
      >
        <div class="managed-cli-grid">
          <For each={states().filter((state) => !props.provider || state.id === props.provider)}>
            {(state) => (
              <ManagedCliCard
                state={state}
                pending={pending().includes(state.id)}
                installLabel={props.provider ? t("Download and continue") : undefined}
                onAction={(method, input) => void action(method, input)}
              />
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
