import {
  ACCOUNT_LIMITS,
  ACCOUNT_POOL_WARNING,
  type ProviderAccount,
  type ProviderAccountProvider,
  type SetAccountPoolInput,
} from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { useAccounts } from "./account-state";
import { safeCliError } from "./ManagedCliSection";
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
const phases = {
  idle: "",
  "waiting-for-browser": "Czekam na przeglądarkę",
  "code-required": "Wpisz kod z przeglądarki",
  success: "Zalogowano",
  error: "Błąd logowania",
};
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
  const working = () => ["waiting-for-browser", "code-required"].includes(props.account.login.phase);
  const pool = (extra: Partial<SetAccountPoolInput>) =>
    props.onPool({ id: props.account.id, inPool: props.account.inPool, ...extra });
  return (
    <Card class="managed-cli-card" aria-label={props.account.label}>
      <div class="providers-heading">
        <Heading as="h4" size="sm">
          {props.account.label}
        </Heading>
        <Show when={props.account.system}>
          <Badge>Systemowe</Badge>
        </Show>
        <Show when={props.account.isDefault}>
          <Badge>Domyślne</Badge>
        </Show>
      </div>
      <Text as="p">
        {props.account.account ?? "Konto nieznane"} · {props.account.plan ?? "Plan nieznany"} ·{" "}
        {props.account.loggedIn ? "Zalogowane" : "Wylogowane"}
      </Text>
      <Show when={props.account.limitedUntil && new Date(props.account.limitedUntil).getTime() > Date.now()}>
        <Text as="p" tone="warning">
          Ograniczone do godz. {new Date(props.account.limitedUntil ?? "").toLocaleString()}
        </Text>
      </Show>
      <Text as="p" role="status" aria-live="polite">
        {phases[props.account.login.phase]}
      </Text>
      <Show when={props.account.login.message}>
        <Text
          as="p"
          tone={props.account.login.phase === "error" ? "danger" : "muted"}
          role={props.account.login.phase === "error" ? "alert" : undefined}
        >
          {safeCliError(props.account.login.message ?? "")}
        </Text>
      </Show>
      <Show when={working() && safeLoginUrl(props.account.login.url)}>
        {(url) => (
          <Button disabled={props.busy} onClick={() => props.onAction("openUrl", url())}>
            Otwórz stronę logowania
          </Button>
        )}
      </Show>
      <Show when={working() && props.account.login.userCode}>
        <Text as="p">Kod urządzenia: {props.account.login.userCode}</Text>
      </Show>
      <Show when={props.account.login.phase === "code-required" && !props.account.system}>
        <Field label="Kod logowania">
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
          Przekaż kod
        </Button>
      </Show>
      <div class="managed-cli-actions">
        <Button disabled={props.busy} onClick={() => props.onAction("refreshAccount", props.account.id)}>
          Odśwież
        </Button>
        <Show when={!props.account.system}>
          <Show
            when={working()}
            fallback={
              <Button disabled={props.busy} onClick={() => props.onAction("loginAccount", props.account.id)}>
                {props.account.login.phase === "error" ? "Ponów logowanie" : "Zaloguj"}
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
              Anuluj logowanie
            </Button>
          </Show>
          <Show when={props.account.loggedIn}>
            <Button disabled={props.busy} onClick={() => props.onAction("logoutAccount", props.account.id)}>
              Wyloguj
            </Button>
          </Show>
          <Button disabled={props.busy} variant="danger" onClick={() => setConfirm("remove")}>
            Usuń
          </Button>
          <Show when={props.account.login.phase === "error"}>
            <Button disabled={props.busy} onClick={() => props.onAction("openLoginTerminal", props.account.id)}>
              Otwórz terminal z poleceniem…
            </Button>
            <Text as="p" tone="muted">
              Obejście problemu logowania. Najpierw karta zgody; po zakończeniu wybierz Odśwież.
            </Text>
          </Show>
        </Show>
      </div>
      <Switch
        label="W puli"
        checked={props.account.inPool}
        disabled={props.busy || (!props.account.inPool && props.poolFull)}
        onChange={(value) => (value ? setConfirm("pool") : pool({ inPool: false }))}
      />
      <Switch
        label="Włączone"
        checked={props.account.enabled}
        disabled={props.busy}
        onChange={(enabled) => pool({ enabled })}
      />
      <Show when={!props.account.inPool && props.poolFull}>
        <Text as="p" tone="warning">
          Limit puli osiągnięty. Wyłącz inne konto lub zwiększ limit.
        </Text>
      </Show>
      <div class="managed-cli-actions">
        <Button disabled={props.busy || props.account.isDefault} onClick={() => pool({ isDefault: true })}>
          Ustaw jako domyślne
        </Button>
        <Show when={props.account.inPool}>
          <Button
            aria-label={`Przesuń ${props.account.label} w górę`}
            disabled={props.busy || props.position === 0}
            onClick={() => pool({ poolOrder: props.account.poolOrder - 1 })}
          >
            ↑ W górę
          </Button>
          <Button
            aria-label={`Przesuń ${props.account.label} w dół`}
            disabled={props.busy || props.position === props.count - 1}
            onClick={() => pool({ poolOrder: props.account.poolOrder + 1 })}
          >
            ↓ W dół
          </Button>
        </Show>
      </div>
      <Show when={confirm()}>
        <Card class="managed-cli-card" aria-label="Potwierdzenie zmiany konta">
          <Text as="p">
            {confirm() === "pool"
              ? ACCOUNT_POOL_WARNING
              : `Usunąć konto „${props.account.label}” i jego dane logowania? Przypisani agenci wrócą do konta domyślnego.`}
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
              {confirm() === "pool" ? "Włącz do puli" : "Usuń konto i dane"}
            </Button>
            <Button disabled={props.busy} onClick={() => setConfirm(null)}>
              Anuluj
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
    <Card class="managed-cli-card">
      <Heading as="h4" size="sm">
        Dodaj konto
      </Heading>
      <Text as="p" tone="muted">
        {ACCOUNT_POOL_WARNING}
      </Text>
      <Field label={`Etykieta konta ${props.provider === "codex" ? "Codex" : "Claude"}`}>
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
        Dodaj konto
      </Button>
      <Show when={props.full}>
        <Text as="p" tone="warning">
          Osiągnięto maksymalną liczbę kont. Zwiększ limit lub usuń własne konto.
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
    <section class="providers-section" aria-label="Konta">
      <Heading as="h2" size="md">
        Konta i pula
      </Heading>
      <Text as="p" tone="muted">
        Konta jednego dostawcy mają osobne logowanie. Strzałki zmieniają kolejność puli; Tab wybiera przycisk, Enter
        zatwierdza.
      </Text>
      <Show when={state.error()}>
        <Text as="p" tone="danger" role="alert">
          {state.error()}
        </Text>
        <Button onClick={() => void state.load()}>Ponów wczytanie</Button>
      </Show>
      <Show
        when={state.snapshot()}
        fallback={<Text as="p">{api() ? "Wczytywanie kont…" : "Konta niedostępne w tej wersji."}</Text>}
      >
        {(snapshot) => (
          <>
            <Card class="managed-cli-card">
              <Field
                label="Maks. kont w puli"
                description={`Obecny limit: ${snapshot().pool.maxAccountsPerProvider}. Od 1 do 10, domyślnie 3. Limit obejmuje także dodawanie kont.`}
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
                Zapisz limit
              </Button>
            </Card>
            <For each={["codex", "claude"] as const}>
              {(provider) => {
                const accounts = () =>
                  snapshot()
                    .accounts.filter((a) => a.provider === provider)
                    .sort((a, b) => a.poolOrder - b.poolOrder);
                return (
                  <section aria-label={`Konta ${provider}`}>
                    <Heading as="h3" size="md">
                      {provider === "codex" ? "Codex" : "Claude"}
                    </Heading>
                    <Show
                      when={accounts().length}
                      fallback={
                        <Text as="p" tone="muted">
                          Nie ma kont. Dodaj pierwsze konto tego dostawcy.
                        </Text>
                      }
                    >
                      <div class="managed-cli-grid">
                        <For each={accounts()}>
                          {(account, index) => (
                            <ProviderAccountCard
                              account={account}
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
