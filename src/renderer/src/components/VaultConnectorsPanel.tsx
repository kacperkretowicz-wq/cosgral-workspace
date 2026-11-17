import type {
  VaultConnectorId,
  VaultConnectorLoginList,
  VaultConnectorMethod,
  VaultConnectorStatus,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Badge, type BadgeTone, Button, Input, NativeSelect } from "./ui";

const STATE_VIEW: Record<VaultConnectorStatus["state"], { label: string; tone: BadgeTone }> = {
  disconnected: { label: "Not connected", tone: "neutral" },
  connecting: { label: "Connecting…", tone: "accent" },
  "choose-account": { label: "Choose an account", tone: "warning" },
  connected: { label: "Connected", tone: "success" },
  failed: { label: "Problem", tone: "danger" },
};

function methodLabel(method: VaultConnectorMethod): string {
  switch (method) {
    case "app":
      return t("Use the desktop app");
    case "token":
      return t("Use a token");
    case "session-key":
      return t("Use a session key");
    default:
      return t("Sign in with the browser");
  }
}

function cliLabel(status: VaultConnectorStatus): string {
  switch (status.setup.cli) {
    case "ready":
      return status.setup.cliVersion
        ? t("Tool ready ({version})", { version: status.setup.cliVersion })
        : t("Tool ready");
    case "missing":
      return t("Tool not found");
    case "installing":
      return t("Downloading the tool…");
    default:
      return t("Looking for the tool…");
  }
}

function needsSecret(method: VaultConnectorMethod): boolean {
  return method === "token" || method === "session-key";
}

/**
 * The Vault connectors (window.openbot.vaultConnectors): 1Password, Bitwarden and Proton Pass. Each card shows its state,
 * lets the person check or download the manager's tool, connect with the method the manager supports (secrets are
 * write-only), pick an account, see which logins agents may use (titles and sites, never secrets) and disconnect.
 */
export function VaultConnectorsPanel() {
  const api = untrack(() => window.openbot?.vaultConnectors);
  const [connectors, setConnectors] = createSignal<VaultConnectorStatus[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal<VaultConnectorId | null>(null);
  const [logins, setLogins] = createSignal<Partial<Record<VaultConnectorId, VaultConnectorLoginList>>>({});
  const [methods, setMethods] = createSignal<Partial<Record<VaultConnectorId, VaultConnectorMethod>>>({});
  const [secrets, setSecrets] = createSignal<Partial<Record<VaultConnectorId, string>>>({});
  const [servers, setServers] = createSignal<Partial<Record<VaultConnectorId, string>>>({});
  const [accounts, setAccounts] = createSignal<Partial<Record<VaultConnectorId, string>>>({});

  const replace = (status: VaultConnectorStatus) =>
    setConnectors((list) => list.map((item) => (item.connector === status.connector ? status : item)));
  const chosenMethod = (status: VaultConnectorStatus): VaultConnectorMethod | undefined =>
    methods()[status.connector] ?? status.methods[0];

  async function load() {
    if (!api) return;
    try {
      setConnectors((await api.list()).connectors);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not load the connectors."));
    } finally {
      setLoaded(true);
    }
  }

  onSettled(() => {
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "vault-connectors-changed") setConnectors(event.connectors);
    });
    return () => off?.();
  });

  async function run(
    connector: VaultConnectorId,
    work: () => Promise<VaultConnectorStatus | undefined>,
    failure: string,
  ) {
    if (busy()) return;
    setBusy(connector);
    setError("");
    try {
      const status = await work();
      if (status) replace(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setBusy(null);
    }
  }

  const showLogins = (connector: VaultConnectorId) =>
    run(
      connector,
      async () => {
        const list = await api?.listLogins({ connector });
        if (list) setLogins({ ...logins(), [connector]: list });
        return undefined;
      },
      t("Could not read the logins."),
    );

  function connect(status: VaultConnectorStatus) {
    const method = chosenMethod(status);
    if (!method) return;
    const connector = status.connector;
    const secret = secrets()[connector]?.trim();
    const serverUrl = servers()[connector]?.trim();
    const accountId = accounts()[connector];
    void run(
      connector,
      async () => {
        const result = await api?.connect({
          connector,
          method,
          ...(needsSecret(method) && secret ? { secret } : {}),
          ...(serverUrl ? { serverUrl } : {}),
          ...(accountId ? { accountId } : {}),
        });
        setSecrets({ ...secrets(), [connector]: "" });
        return result;
      },
      t("Could not connect."),
    );
  }

  return (
    <section class="vault-connectors" aria-label={t("Password managers")}>
      <h2>{t("Password managers")}</h2>
      <p class="vault-connectors-note">
        {t("Agents may use logins from a manager you connect. They never see the passwords; you stay in control.")}
      </p>
      <Show
        when={api}
        fallback={<p class="vault-connectors-note">{t("Connectors are not available in this version.")}</p>}
      >
        <Show when={error()}>
          <p class="vault-connectors-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={loaded()} fallback={<p role="status">{t("Loading connectors…")}</p>}>
          <ul class="vault-connector-list">
            <For each={connectors()}>
              {(status) => (
                <li class="vault-connector-card" data-state={status.state}>
                  <header>
                    <strong>{status.label}</strong>
                    <Badge tone={STATE_VIEW[status.state].tone} dot>
                      {t(STATE_VIEW[status.state].label)}
                    </Badge>
                  </header>

                  <Show when={status.state === "connected"}>
                    <p class="vault-connectors-note">
                      {status.loginCount === null
                        ? t("Checking the logins…")
                        : t("{count} logins agents may use", { count: status.loginCount })}
                      <Show when={status.vaultNames.length > 0}> · {status.vaultNames.join(", ")}</Show>
                    </p>
                    <div class="vault-connector-actions">
                      <Button
                        type="button"
                        disabled={busy() !== null}
                        onClick={() => void showLogins(status.connector)}
                      >
                        {t("Show logins")}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={busy() !== null}
                        onClick={() =>
                          void run(
                            status.connector,
                            async () => api?.disconnect({ connector: status.connector }),
                            t("Could not disconnect."),
                          )
                        }
                      >
                        {t("Disconnect")}
                      </Button>
                    </div>
                    <Show when={logins()[status.connector]}>
                      {(list) => (
                        <ul class="vault-connector-logins" aria-label={t("Logins agents may use")}>
                          <For each={list().logins}>
                            {(login) => (
                              <li>
                                <strong>{login.title}</strong>
                                <small>
                                  {login.hosts.join(", ")}
                                  <Show when={login.username}> · {login.username}</Show>
                                  <Show when={login.hasOneTimePassword}> · {t("one-time code")}</Show>
                                </small>
                              </li>
                            )}
                          </For>
                          <Show when={list().truncated}>
                            <li class="vault-connectors-note">{t("Only the first logins are listed.")}</li>
                          </Show>
                        </ul>
                      )}
                    </Show>
                  </Show>

                  <Show when={status.state === "failed" && status.error}>
                    <p class="vault-connectors-error" role="alert">
                      {status.error}
                    </p>
                  </Show>

                  <Show when={status.state === "connecting"}>
                    <div class="vault-connector-actions">
                      <Button
                        type="button"
                        disabled={busy() !== null}
                        onClick={() =>
                          void run(
                            status.connector,
                            async () => api?.cancel({ connector: status.connector }),
                            t("Could not cancel."),
                          )
                        }
                      >
                        {t("Cancel")}
                      </Button>
                    </div>
                  </Show>

                  <Show
                    when={
                      status.state === "disconnected" || status.state === "failed" || status.state === "choose-account"
                    }
                  >
                    <p class="vault-connectors-note">{cliLabel(status)}</p>
                    <div class="vault-connector-actions">
                      <Button
                        type="button"
                        disabled={busy() !== null}
                        onClick={() =>
                          void run(
                            status.connector,
                            async () => api?.checkSetup({ connector: status.connector }),
                            t("Could not check the tool."),
                          )
                        }
                      >
                        {t("Check the tool")}
                      </Button>
                      <Show when={status.setup.cli === "missing" && status.setup.canInstall}>
                        <Button
                          type="button"
                          disabled={busy() !== null}
                          onClick={() =>
                            void run(
                              status.connector,
                              async () => api?.installCli({ connector: status.connector }),
                              t("Could not download the tool."),
                            )
                          }
                        >
                          {t("Download the tool")}
                        </Button>
                      </Show>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          void run(
                            status.connector,
                            async () => {
                              await api?.openApp({ connector: status.connector });
                              return undefined;
                            },
                            t("Could not open the app."),
                          )
                        }
                      >
                        {t("Open the app")}
                      </Button>
                    </div>

                    <Show when={status.state === "choose-account" && status.accounts.length > 0}>
                      <NativeSelect
                        aria-label={t("Account")}
                        value={accounts()[status.connector] ?? ""}
                        onChange={(event) =>
                          setAccounts({ ...accounts(), [status.connector]: event.currentTarget.value })
                        }
                      >
                        <option value="">{t("Choose an account")}</option>
                        <For each={status.accounts}>
                          {(account) => <option value={account.id}>{account.label}</option>}
                        </For>
                      </NativeSelect>
                    </Show>

                    <form
                      class="vault-connector-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        connect(status);
                      }}
                    >
                      <Show when={status.methods.length > 1}>
                        <NativeSelect
                          aria-label={t("Connection method")}
                          value={chosenMethod(status) ?? ""}
                          onChange={(event) => {
                            const picked = status.methods.find((method) => method === event.currentTarget.value);
                            if (picked) setMethods({ ...methods(), [status.connector]: picked });
                          }}
                        >
                          <For each={status.methods}>
                            {(method) => <option value={method}>{methodLabel(method)}</option>}
                          </For>
                        </NativeSelect>
                      </Show>
                      <Show when={needsSecret(chosenMethod(status) ?? "app")}>
                        <Input
                          type="password"
                          autocomplete="off"
                          aria-label={t("Token or key")}
                          placeholder={t("Token or key")}
                          value={secrets()[status.connector] ?? ""}
                          onInput={(event) =>
                            setSecrets({ ...secrets(), [status.connector]: event.currentTarget.value })
                          }
                        />
                      </Show>
                      <Show when={status.connector === "bitwarden"}>
                        <Input
                          type="url"
                          aria-label={t("Server address (optional)")}
                          placeholder={t("Server address (optional)")}
                          value={servers()[status.connector] ?? ""}
                          onInput={(event) =>
                            setServers({ ...servers(), [status.connector]: event.currentTarget.value })
                          }
                        />
                      </Show>
                      <Button type="submit" variant="primary" disabled={busy() !== null || status.methods.length === 0}>
                        {t("Connect")}
                      </Button>
                    </form>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}
