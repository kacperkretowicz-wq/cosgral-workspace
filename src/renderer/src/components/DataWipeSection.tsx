import type { DataWipePlan } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { t } from "../i18n";
import { Button, Card, Field, Heading, Input, Text } from "./ui";

/**
 * COSGRAL W4-BE5: "Delete my data" in Settings (this computer only). Shows what goes and what is never touched, asks
 * for the confirmation word, then the program stops its agents, restarts and starts like the first time.
 */
export function DataWipeSection() {
  const [plan, setPlan] = createSignal<DataWipePlan>();
  const [open, setOpen] = createSignal(false);
  const [typed, setTyped] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [restarting, setRestarting] = createSignal(false);
  const [error, setError] = createSignal("");
  const api = () => window.openbot.appData;
  const confirmed = () => plan() !== undefined && typed() === plan()?.confirmationWord;

  async function start() {
    const appData = api();
    if (!appData) return;
    setError("");
    try {
      setPlan(await appData.describeWipe());
      setTyped("");
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not prepare the deletion."));
    }
  }

  async function wipe() {
    const appData = api();
    const word = plan()?.confirmationWord;
    if (!appData || !word || !confirmed() || busy()) return;
    setBusy(true);
    try {
      await appData.requestWipe({ confirmation: word });
      setRestarting(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not delete the data."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Show when={api()}>
      <Card class="cosgral-settings-block data-wipe" role="region" aria-labelledby="data-wipe-title">
        <Heading as="h2" size="sm" id="data-wipe-title">
          {t("Delete my data")}
        </Heading>
        <Text as="p" tone="secondary">
          {t(
            "Removes everything COSGRAL Workspace keeps on this computer and starts it fresh. Uninstalling the program keeps your data; this is the way to remove it.",
          )}
        </Text>
        <Show when={error()}>
          <Text as="p" tone="danger" role="alert">
            {error()}
          </Text>
        </Show>
        <Show
          when={open() && plan()}
          fallback={
            <div class="cosgral-settings-actions data-wipe-start">
              <Button type="button" variant="danger" onClick={() => void start()}>
                {t("Delete my data…")}
              </Button>
            </div>
          }
        >
          {(current) => (
            <div class="data-wipe-confirm">
              <Text as="strong" variant="label-sm">
                {t("Will be deleted")}
              </Text>
              <ul class="data-wipe-list">
                <For each={current().removes}>
                  {(item) => (
                    <li>
                      <Text as="span">{item.label}</Text>
                      <Show when={item.path}>
                        {(path) => (
                          <Text as="span" variant="caption" tone="muted" class="data-wipe-path">
                            {path()}
                          </Text>
                        )}
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
              <Text as="strong" variant="label-sm">
                {t("Never touched")}
              </Text>
              <ul class="data-wipe-list">
                <For each={current().keeps}>
                  {(item) => (
                    <li>
                      <Text as="span">{item.label}</Text>
                      <Show when={item.path}>
                        {(path) => (
                          <Text as="span" variant="caption" tone="muted" class="data-wipe-path">
                            {path()}
                          </Text>
                        )}
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
              <Field label={t("Type {word} to confirm", { word: current().confirmationWord })}>
                <Input
                  value={typed()}
                  autocomplete="off"
                  spellcheck={false}
                  disabled={busy() || restarting()}
                  onInput={(e) => setTyped(e.currentTarget.value)}
                />
              </Field>
              <Show
                when={!restarting()}
                fallback={
                  <Text as="p" role="status">
                    {t("Stopping the agents and restarting. The data is deleted before the next start.")}
                  </Text>
                }
              >
                <div class="cosgral-settings-actions">
                  <Button type="button" onClick={() => setOpen(false)} disabled={busy()}>
                    {t("Cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={!confirmed()}
                    loading={busy()}
                    onClick={() => void wipe()}
                  >
                    {t("Delete and restart")}
                  </Button>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </Card>
    </Show>
  );
}
