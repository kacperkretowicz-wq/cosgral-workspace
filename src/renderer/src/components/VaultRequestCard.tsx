import type { VaultItemSummary, VaultRequest } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { Button } from "./ui";
import { VaultForm } from "./VaultPanel";
export function VaultRequestCard(props: { request: VaultRequest }) {
  const [items, setItems] = createSignal<VaultItemSummary[]>([]);
  const [savedId, setSavedId] = createSignal<string>();
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  onSettled(() => {
    void window.openbot.vault
      ?.list()
      .then(setItems)
      .catch(() => setError(t("Could not load Vault items.")));
  });
  async function respond(itemId?: string, decline = false) {
    const api = window.openbot.vault;
    if (!api) {
      setError(t("Vault unavailable."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.respondToRequest({
        requestId: props.request.requestId,
        ...(itemId ? { itemId } : {}),
        ...(decline ? { decline: true } : {}),
      });
    } catch {
      setError(t("Could not answer this request. Try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="w2-panel" aria-label={t("Vault request")}>
      <strong>
        {t("Vault")} · {props.request.kind}
      </strong>
      <p>{props.request.reason}</p>
      <Show when={props.request.origin}>
        <p>{props.request.origin}</p>
      </Show>
      <Show when={props.request.mode === "choose"}>
        <For each={items().filter((item) => props.request.candidateIds.includes(item.id))}>
          {(item) => (
            <Button unstyled type="button" disabled={busy()} onClick={() => void respond(item.id)}>
              {item.label} {item.username ?? item.cardLast4 ?? ""}
            </Button>
          )}
        </For>
        <Show when={!items().some((item) => props.request.candidateIds.includes(item.id))}>
          <p>{t("No matching items are available.")}</p>
        </Show>
      </Show>
      <Show when={props.request.mode === "add"}>
        <Show
          when={!savedId()}
          fallback={
            <Button unstyled type="button" disabled={busy()} onClick={() => void respond(savedId())}>
              {t("Use saved item")}
            </Button>
          }
        >
          <VaultForm
            kind={props.request.kind}
            onSave={async (input) => {
              const api = window.openbot.vault;
              if (!api) throw new Error(t("Vault unavailable"));
              const item = await api.save(input);
              setSavedId(item.id);
              await respond(item.id);
            }}
          />
        </Show>
      </Show>
      <Button unstyled type="button" disabled={busy()} onClick={() => void respond(undefined, true)}>
        {t("Decline")}
      </Button>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </section>
  );
}
