import type { ApiKeyEntry, ApiKeyProvider, ApiKeysDesktopApi } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { emptyApiKeys, providerLabel, statusLabel, statusTone } from "./api-keys-view";
import { Badge, Button, Card, Field, Heading, Input, Text } from "./ui";
import { KeyRound } from "./ui/icons";

function ApiKeyCard(props: {
  record: ApiKeyEntry;
  busy: boolean;
  checking: boolean;
  onSet: (provider: ApiKeyProvider, key: string) => Promise<void>;
  onRemove: (provider: ApiKeyProvider) => Promise<void>;
  onCheck: (provider: ApiKeyProvider) => Promise<void>;
}) {
  const [draft, setDraft] = createSignal("");
  const label = () => providerLabel(props.record.provider);
  const hasKey = () => props.record.maskedKey !== null;
  return (
    <fieldset
      class="api-key-card provider-key-row"
      aria-label={t("{name} key", { name: label() })}
      data-status={props.record.status}
      data-has-key={hasKey() ? "true" : "false"}
    >
      <div class="provider-key-head">
        <span class="provider-key-icon" aria-hidden="true">
          <KeyRound size={18} stroke-width={1.75} />
        </span>
        <div class="provider-key-copy">
          <div class="api-key-card-head">
            <Heading as="h3" size="sm">
              {label()}
            </Heading>
            <Show when={hasKey()}>
              <Badge tone={statusTone(props.record.status)} size="sm" dot>
                {statusLabel(props.record.status)}
              </Badge>
            </Show>
          </div>
          <Show
            when={hasKey()}
            fallback={
              <Text as="p" tone="muted">
                {t("No key saved")}
              </Text>
            }
          >
            <Text as="p" tone="muted" role="status" class="provider-key-saved">
              {t("Saved key: {key}", { key: props.record.maskedKey ?? "" })}
            </Text>
          </Show>
          <Show when={props.record.message}>
            <Text as="p" tone="muted" role="status">
              {props.record.message}
            </Text>
          </Show>
        </div>
        <div class="api-key-card-actions">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={props.busy || !hasKey() || props.checking}
            loading={props.checking}
            loadingLabel={t("Checking connection")}
            onClick={() => void props.onCheck(props.record.provider)}
          >
            {t("Check connection")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={props.busy || !hasKey()}
            onClick={() => {
              setDraft("");
              void props.onRemove(props.record.provider);
            }}
          >
            {t("Remove key")}
          </Button>
        </div>
      </div>
      <div class="provider-key-form-row">
        <Field label={t("{name} API key", { name: label() })}>
          <Input
            type="password"
            autocomplete="off"
            spellcheck={false}
            value={draft()}
            aria-describedby={`api-key-hint-${props.record.provider}`}
            disabled={props.busy}
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
        </Field>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={props.busy || !draft().trim()}
          onClick={() => {
            const key = draft().trim();
            if (!key) return;
            setDraft("");
            void props.onSet(props.record.provider, key);
          }}
        >
          {t("Save key")}
        </Button>
      </div>
      <Text as="p" tone="muted" id={`api-key-hint-${props.record.provider}`} class="provider-key-hint">
        {t("The key is never shown again after you save it. Paste it only into this password field.")}
      </Text>
    </fieldset>
  );
}

/** Providers page section: set / remove / check API keys using the desktop contract. */
export function ApiKeysSection(props: { api?: ApiKeysDesktopApi }) {
  // Use the desktop API in production; stories inject the shared backend mock.
  const client = props.api ?? window.openbot.apiKeys;
  const [rows, setRows] = createSignal<ApiKeyEntry[]>(emptyApiKeys());
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [checking, setChecking] = createSignal<ApiKeyProvider | null>(null);
  let loadGeneration = 0;

  async function refresh() {
    const serial = ++loadGeneration;
    try {
      if (!client) throw new Error(t("API keys are unavailable in this version."));
      const next = await client.list();
      if (serial !== loadGeneration) return;
      // Keep the same array reference when nothing changed so open password drafts survive the first load.
      setRows((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setError("");
    } catch (e) {
      if (serial !== loadGeneration) return;
      setError(e instanceof Error ? e.message : t("Could not load API keys."));
    }
  }

  onSettled(() => {
    void refresh();
  });

  async function run(work: () => Promise<void>) {
    if (busy() || checking()) return;
    setBusy(true);
    setError("");
    // Invalidate any in-flight first load so it cannot overwrite a just-saved row.
    loadGeneration += 1;
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("The API key action failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card class="providers-section api-keys-section" role="region" aria-label={t("API keys")}>
      <div class="providers-heading">
        <Heading as="h2" size="md">
          {t("API keys")}
        </Heading>
      </div>
      <Text as="p" tone="secondary">
        {t(
          "One API key per provider, stored encrypted. A saved key is always used, even when rejected, until you remove it to return to subscription login. Changes apply when the provider process next starts.",
        )}
      </Text>
      <Show when={error()}>
        <Text as="p" tone="danger" role="alert">
          {error()}
        </Text>
      </Show>
      <div class="api-keys-list">
        <For each={rows()}>
          {(record) => (
            <ApiKeyCard
              record={record}
              busy={busy() || checking() !== null || !client}
              checking={checking() === record.provider}
              onSet={async (provider, key) => {
                await run(async () => {
                  if (!client) throw new Error(t("API keys are unavailable."));
                  const next = await client.set({ provider, key });
                  setRows((list) => list.map((row) => (row.provider === provider ? next : row)));
                });
              }}
              onRemove={async (provider) => {
                await run(async () => {
                  if (!client) throw new Error(t("API keys are unavailable."));
                  const next = await client.remove({ provider });
                  setRows((list) => list.map((row) => (row.provider === provider ? next : row)));
                });
              }}
              onCheck={async (provider) => {
                if (busy() || checking()) return;
                loadGeneration += 1;
                setChecking(provider);
                setError("");
                try {
                  if (!client) throw new Error(t("API keys are unavailable."));
                  const next = await client.check({ provider });
                  setRows((list) => list.map((row) => (row.provider === provider ? next : row)));
                } catch (e) {
                  setError(e instanceof Error ? e.message : t("Could not check the connection."));
                } finally {
                  setChecking(null);
                }
              }}
            />
          )}
        </For>
      </div>
    </Card>
  );
}
