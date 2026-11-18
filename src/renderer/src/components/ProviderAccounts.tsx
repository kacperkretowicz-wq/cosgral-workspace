import {
  ACCOUNT_LIMITS,
  ACCOUNT_POOL_WARNING,
  type ProviderAccount,
  type ProviderAccountProvider,
  type SetAccountPoolInput,
} from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, Show } from "solid-js";
import { t } from "../i18n";
import { accountError, useAccounts } from "./account-state";
import { Badge, Button, Card, Field, Heading, Input, Switch, Text } from "./ui";

export type AccountAction =
  | "loginAccount"
  | "logoutAccount"
  | "refreshAccount"
  | "cancelLogin"
  | "openLoginTerminal"
  | "removeAccount"
  | "submitLoginCode"
  | "openUrl";

export function safeLoginUrl(url: string | null) {
  try {
    const parsed = new URL(url ?? "");
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null;
  } catch {
    return null;
  }
}

function phaseLabel(phase: ProviderAccount["login"]["phase"]): string {
  switch (phase) {
    case "waiting-for-browser":
      return t("Waiting for the browser");
    case "code-required":
      return t("Enter the code from the browser");
    case "success":
      return t("Signed in");
    case "error":
      return t("Sign-in failed");
    default:
      return "";
  }
}

export function ProviderAccountCard(props: {
  account: ProviderAccount;
  busy: boolean;
  poolFull: boolean;
  position: number;
  count: number;
  onAction: (action: AccountAction, id: string, code?: string) => void;
  onPool: (input: SetAccountPoolInput) => void;
}) {
  const [confirm, setConfirm] = createSignal<"pool" | "remove" | null>(null);
  const [code, setCode] = createSignal("");
  createEffect(
    () => props.account.login.phase,
    (phase) => {
      if (phase !== "code-required") setCode("");
    },
  );
  const working = () => ["waiting-for-browser", "code-required"].includes(props.account.login.phase);
  const pool = (extra: Partial<SetAccountPoolInput>) =>
    props.onPool({ id: props.account.id, inPool: props.account.inPool, ...extra });
  return (
    <Card class="managed-cli-card provider-account-card" role="group" aria-label={props.account.label}>
      <div class="providers-heading account-heading">
        <Heading as="h4" size="sm">
          {props.account.label}
        </Heading>
        <Show when={props.account.system}>
          <Badge>{t("System")}</Badge>
        </Show>
        <Show when={props.account.isDefault}>
          <Badge>{t("Default")}</Badge>
        </Show>
      </div>
      <Text as="p">
        {props.account.account ?? t("Unknown account")} · {props.account.plan ?? t("Unknown plan")} ·{" "}
        {props.account.loggedIn ? t("Signed in") : t("Signed out")}
      </Text>
      <Show when={props.account.limitedUntil && new Date(props.account.limitedUntil).getTime() > Date.now()}>
        <Text as="p" tone="warning">
          {t("Limited until {time}", { time: new Date(props.account.limitedUntil ?? "").toLocaleString() })}
        </Text>
      </Show>
      <Text as="p" role="status" aria-live="polite">
        {phaseLabel(props.account.login.phase)}
      </Text>
      <Show when={props.account.login.message}>
        <Text
          as="p"
          tone={props.account.login.phase === "error" ? "danger" : "muted"}
          role={props.account.login.phase === "error" ? "alert" : undefined}
        >
          {accountError(props.account.login.message ?? "")}
        </Text>
      </Show>
      <Show when={working() && safeLoginUrl(props.account.login.url)}>
        {(url) => (
          <Button disabled={props.busy} onClick={() => props.onAction("openUrl", url())}>
            {t("Open sign-in page")}
          </Button>
        )}
      </Show>
      <Show when={working() && props.account.login.userCode}>
        <Text as="p">
          {t("Device code:")} {props.account.login.userCode}
        </Text>
      </Show>
      <Show when={props.account.login.phase === "code-required" && !props.account.system}>
        <Field label={t("Sign-in code")}>
          <Input
            type="password"
            autocomplete="off"
            value={code()}
            maxlength={ACCOUNT_LIMITS.code}
            onInput={(e) => setCode(e.currentTarget.value)}
          />
        </Field>
        <Button
          disabled={props.busy || !code().trim() || /[\r\n]/.test(code())}
          onClick={() => {
            const value = code().trim();
            setCode("");
            props.onAction("submitLoginCode", props.account.id, value);
          }}
        >
          {t("Submit code")}
        </Button>
      </Show>
      <div class="managed-cli-actions">
        <Button disabled={props.busy} onClick={() => props.onAction("refreshAccount", props.account.id)}>
          {t("Refresh")}
        </Button>
        <Show when={!props.account.system}>
          <Show
            when={working()}
            fallback={
              <Button disabled={props.busy} onClick={() => props.onAction("loginAccount", props.account.id)}>
                {props.account.login.phase === "error" ? t("Retry sign-in") : t("Sign in")}
              </Button>
            }
          >
            <Button
              disabled={props.busy}
              onClick={() => {
                setCode("");
                props.onAction("cancelLogin", props.account.id);
              }}
            >
              {t("Cancel sign-in")}
            </Button>
          </Show>
          <Show when={props.account.loggedIn}>
            <Button disabled={props.busy} onClick={() => props.onAction("logoutAccount", props.account.id)}>
              {t("Sign out")}
            </Button>
          </Show>
          <Button disabled={props.busy} variant="danger" onClick={() => setConfirm("remove")}>
            {t("Remove")}
          </Button>
          <Show when={props.account.login.phase === "error"}>
            <Button disabled={props.busy} onClick={() => props.onAction("openLoginTerminal", props.account.id)}>
              {t("Open terminal with the command…")}
            </Button>
            <Text as="p" tone="muted">
              {t("Workaround for a stuck sign-in. Needs you first; then choose Refresh.")}
            </Text>
          </Show>
        </Show>
      </div>
      <Switch
        label={t("In the pool")}
        checked={props.account.inPool}
        disabled={props.busy || (!props.account.inPool && props.poolFull)}
        onChange={(value) => (value ? setConfirm("pool") : pool({ inPool: false }))}
      />
      <Switch
        label={t("Enabled")}
        checked={props.account.enabled}
        disabled={props.busy}
        onChange={(enabled) => pool({ enabled })}
      />
      <Show when={!props.account.inPool && props.poolFull}>
        <Text as="p" tone="warning">
          {t("Pool limit reached. Turn off another account or raise the limit.")}
        </Text>
      </Show>
      <Show when={props.account.inPool}>
        <Text as="p" tone="muted">
          {t("Pool order: {order}", { order: String(props.account.poolOrder) })}
        </Text>
      </Show>
      <div class="managed-cli-actions">
        <Button disabled={props.busy || props.account.isDefault} onClick={() => pool({ isDefault: true })}>
          {t("Set as default")}
        </Button>
        <Show when={props.account.inPool}>
          <Button
            aria-label={t("Move {name} up", { name: props.account.label })}
            disabled={props.busy || props.position === 0}
            onClick={() => pool({ poolOrder: props.account.poolOrder - 1 })}
          >
            ↑ {t("Up")}
          </Button>
          <Button
            aria-label={t("Move {name} down", { name: props.account.label })}
            disabled={props.busy || props.position === props.count - 1}
            onClick={() => pool({ poolOrder: props.account.poolOrder + 1 })}
          >
            ↓ {t("Down")}
          </Button>
        </Show>
      </div>
      <Show when={confirm()}>
        <Card class="managed-cli-card provider-account-card" aria-label={t("Confirm account change")}>
          <Text as="p">
            {confirm() === "pool"
              ? t(ACCOUNT_POOL_WARNING)
              : t('Remove account "{name}" and its sign-in data? Agents on it go back to the default account.', {
                  name: props.account.label,
                })}
          </Text>
          <div class="managed-cli-actions">
            <Button
              disabled={props.busy}
              onClick={() => {
                if (confirm() === "pool") pool({ inPool: true });
                else props.onAction("removeAccount", props.account.id);
                setConfirm(null);
              }}
            >
              {confirm() === "pool" ? t("Add to pool") : t("Remove account and data")}
            </Button>
            <Button disabled={props.busy} onClick={() => setConfirm(null)}>
              {t("Cancel")}
            </Button>
          </div>
        </Card>
      </Show>
    </Card>
  );
}

function AddAccount(props: {
  provider: ProviderAccountProvider;
  busy: boolean;
  full: boolean;
  onAdd: (label: string) => Promise<boolean>;
}) {
  const [label, setLabel] = createSignal("");
  return (
    <Card class="managed-cli-card provider-account-card">
      <Heading as="h4" size="sm">
        {t("Add account")}
      </Heading>
      <Text as="p" tone="muted">
        {t(ACCOUNT_POOL_WARNING)}
      </Text>
      <Field label={t("Account label for {provider}", { provider: props.provider === "codex" ? "Codex" : "Claude" })}>
        <Input value={label()} maxlength={ACCOUNT_LIMITS.label} onInput={(e) => setLabel(e.currentTarget.value)} />
      </Field>
      <Button
        disabled={props.busy || props.full || !label().trim()}
        onClick={() =>
          void props.onAdd(label().trim()).then((ok) => {
            if (ok) setLabel("");
          })
        }
      >
        {t("Add account")}
      </Button>
      <Show when={props.full}>
        <Text as="p" tone="warning">
          {t("Maximum number of accounts reached. Raise the limit or remove an account.")}
        </Text>
      </Show>
    </Card>
  );
}

export function ProviderAccounts() {
  const state = useAccounts();
  const [maximum, setMaximum] = createSignal("");
  const api = () => window.openbot.subscriptions;
  function action(action: AccountAction, id: string, code?: string) {
    void state.run(async () => {
      const service = api();
      if (!service) return;
      switch (action) {
        case "openUrl":
          if (safeLoginUrl(id)) await window.openbot.openUrl(id);
          break;
        case "submitLoginCode":
          await service.submitLoginCode({ id, code: code ?? "" });
          break;
        default:
          await service[action]({ id });
      }
    });
  }
  return (
    <section class="providers-section provider-accounts" aria-label={t("Accounts")}>
      <Heading as="h2" size="md">
        {t("Accounts and pool")}
      </Heading>
      <Text as="p" tone="muted">
        {t(
          "Accounts of one provider have their own sign-in. Arrows change pool order; Tab picks a button, Enter confirms.",
        )}
      </Text>
      <Show when={state.error()}>
        <Text as="p" tone="danger" role="alert">
          {state.error()}
        </Text>
        <Button onClick={() => void state.load()}>{t("Reload")}</Button>
      </Show>
      <Show
        when={state.snapshot()}
        fallback={
          <Text as="p">{api() ? t("Loading accounts…") : t("Accounts are not available in this version.")}</Text>
        }
      >
        {(snapshot) => (
          <>
            <Card class="managed-cli-card provider-account-card">
              <Field
                label={t("Max accounts in the pool")}
                description={t(
                  "Current limit: {limit}. From 1 to 10, default 3. The limit also covers adding accounts.",
                  { limit: String(snapshot().pool.maxAccountsPerProvider) },
                )}
              >
                <Input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={maximum() || String(snapshot().pool.maxAccountsPerProvider)}
                  onInput={(e) => setMaximum(e.currentTarget.value)}
                />
              </Field>
              <Button
                disabled={
                  state.busy() ||
                  !Number.isInteger(Number(maximum())) ||
                  Number(maximum()) < 1 ||
                  Number(maximum()) > 10
                }
                onClick={() =>
                  void state.run(async () => {
                    await api()?.setPoolSettings({ maxAccountsPerProvider: Number(maximum()) });
                    setMaximum("");
                  })
                }
              >
                {t("Save limit")}
              </Button>
            </Card>
            <Switch
              label={t("Return to the first account after the limit resets")}
              checked={snapshot().pool.returnAfterReset !== false}
              disabled={state.busy() || !api()}
              onChange={(returnAfterReset) =>
                void state.run(async () => {
                  await api()?.setPoolSettings({
                    maxAccountsPerProvider: snapshot().pool.maxAccountsPerProvider,
                    returnAfterReset,
                  });
                })
              }
            />
            <For each={["codex", "claude"] as const}>
              {(provider) => {
                const accounts = () =>
                  snapshot()
                    .accounts.filter((a) => a.provider === provider)
                    .sort((a, b) => a.poolOrder - b.poolOrder);
                return (
                  <section class="account-provider" aria-label={t("Accounts for {provider}", { provider })}>
                    <Heading as="h3" size="md">
                      {provider === "codex" ? "Codex" : "Claude"}
                    </Heading>
                    <Show
                      when={accounts().length}
                      fallback={
                        <Text as="p" tone="muted">
                          {t("No accounts yet. Add the first account for this provider.")}
                        </Text>
                      }
                    >
                      <div class="managed-cli-grid">
                        <For each={accounts()} keyed={(account) => account.id}>
                          {(account, index) => (
                            <ProviderAccountCard
                              account={account()}
                              position={index()}
                              count={accounts().length}
                              busy={state.busy()}
                              poolFull={
                                accounts().filter((a) => a.inPool).length >= snapshot().pool.maxAccountsPerProvider
                              }
                              onAction={action}
                              onPool={(input) =>
                                void state.run(async () => {
                                  await api()?.setAccountPool(input);
                                })
                              }
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                    <AddAccount
                      provider={provider}
                      busy={state.busy()}
                      full={accounts().length >= snapshot().pool.maxAccountsPerProvider}
                      onAdd={(label) =>
                        state.run(async () => {
                          await api()?.addAccount({ provider, label });
                        })
                      }
                    />
                  </section>
                );
              }}
            </For>
          </>
        )}
      </Show>
    </section>
  );
}
