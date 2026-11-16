import { For, Show } from "solid-js";
import { useAccounts } from "./account-state";
import { Button, Field, NativeSelect, Text } from "./ui";
export function AgentAccountPicker(props: { botId: string; provider: string; disabled?: boolean }) {
  const state = useAccounts();
  const accounts = () => state.snapshot()?.accounts.filter((a) => a.provider === props.provider) ?? [];
  const assigned = () => state.snapshot()?.assignments.find((a) => a.botId === props.botId)?.accountId ?? "";
  const answeringWith = () => state.snapshot()?.active?.find((item) => item.botId === props.botId)?.label ?? "";
  return (
    <section aria-label="Konto agenta">
      <Show
        when={props.provider === "codex" || props.provider === "claude"}
        fallback={
          <Text as="p" tone="muted">
            Konta COSGRAL są dostępne dla Codex i Claude.
          </Text>
        }
      >
        <Field
          label="Konto"
          description={
            props.disabled
              ? "Najpierw zapisz zmianę modelu. Konto wybierzesz dla zapisanego dostawcy."
              : "Wybór konta zapisuje się od razu. Domyślne korzysta z ustawień dostawcy."
          }
        >
          <NativeSelect
            value={assigned()}
            disabled={props.disabled || state.busy() || !state.snapshot()}
            onChange={(e) => {
              const accountId = e.currentTarget.value || null;
              if (accountId && !accounts().some((a) => a.id === accountId)) return;
              void state.run(async () => {
                await window.openbot.subscriptions?.assignAccountToAgent({ botId: props.botId, accountId });
              });
            }}
          >
            <option value="">Domyślne</option>
            <Show when={assigned() && !accounts().some((a) => a.id === assigned())}>
              <option value={assigned()} disabled>
                Przypisane konto innego dostawcy lub usunięte — wybierz ponownie
              </option>
            </Show>
            <For each={accounts()}>
              {(account) => (
                <option value={account.id}>
                  {account.label}
                  {account.system ? " (systemowe)" : ""}
                  {!account.loggedIn ? " — wylogowane" : ""}
                  {!account.enabled ? " — wyłączone" : ""}
                </option>
              )}
            </For>
          </NativeSelect>
        </Field>
        <Show when={answeringWith()}>
          {(label) => (
            <Text as="p" tone="secondary" role="status">
              Teraz odpowiada kontem: {label()}
            </Text>
          )}
        </Show>
        <Show when={!window.openbot.subscriptions}>
          <Text as="p" tone="muted">
            Wybór kont niedostępny w tej wersji.
          </Text>
        </Show>
        <Show when={state.error()}>
          <Text as="p" role="alert" tone="danger">
            {state.error()}
          </Text>
          <Button onClick={() => void state.load()}>Ponów wczytanie kont</Button>
        </Show>
      </Show>
    </section>
  );
}
