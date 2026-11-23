import { For, Show } from "solid-js";
import { t, tData } from "../i18n";
import { useAccounts } from "./account-state";
import { Button, Field, NativeSelect, Text } from "./ui";

export function AgentAccountPicker(props: { botId: string; provider: string; disabled?: boolean }) {
  const state = useAccounts();
  const accounts = () => state.snapshot()?.accounts.filter((a) => a.provider === props.provider) ?? [];
  const assigned = () => state.snapshot()?.assignments.find((a) => a.botId === props.botId)?.accountId ?? "";
  const answeringWith = () => tData(state.snapshot()?.active?.find((item) => item.botId === props.botId)?.label ?? "");
  return (
    <section aria-label={t("Agent account")}>
      <Show
        when={props.provider === "codex" || props.provider === "claude"}
        fallback={
          <Text as="p" tone="muted">
            {t("COSGRAL accounts are available for Codex and Claude.")}
          </Text>
        }
      >
        <Field
          label={t("Account")}
          description={
            props.disabled
              ? t("Save the model change first. You pick an account for the saved provider.")
              : t("The account choice saves immediately. Default uses the provider settings.")
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
            <option value="">{t("Default")}</option>
            <Show when={assigned() && !accounts().some((a) => a.id === assigned())}>
              <option value={assigned()} disabled>
                {t("Assigned account from another provider or removed — pick again")}
              </option>
            </Show>
            <For each={accounts()}>
              {(account) => (
                <option value={account.id}>
                  {tData(account.label)}
                  {account.system ? t(" (system)") : ""}
                  {!account.loggedIn ? t(" — signed out") : ""}
                  {!account.enabled ? t(" — disabled") : ""}
                </option>
              )}
            </For>
          </NativeSelect>
        </Field>
        <Show when={answeringWith()}>
          {(label) => (
            <Text as="p" tone="secondary" role="status">
              {t("Answering with account: {label}", { label: label() })}
            </Text>
          )}
        </Show>
        <Show when={!window.openbot.subscriptions}>
          <Text as="p" tone="muted">
            {t("Account picking is unavailable in this version.")}
          </Text>
        </Show>
        <Show when={state.error()}>
          <Text as="p" role="alert" tone="danger">
            {state.error()}
          </Text>
          <Button onClick={() => void state.load()}>{t("Reload accounts")}</Button>
        </Show>
      </Show>
    </section>
  );
}
