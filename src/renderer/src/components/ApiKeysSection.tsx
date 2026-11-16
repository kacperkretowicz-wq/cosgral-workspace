import { createSignal, For, onSettled, Show } from "solid-js";
import {
  type ApiKeyProvider,
  type ApiKeyRecord,
  emptyApiKeys,
  maskApiKey,
  providerLabel,
  statusLabel,
  statusTone,
} from "./api-keys-view";
import { Badge, Button, Card, Field, Heading, Input, Text } from "./ui";

export type ApiKeysActions = {
  list: () => Promise<ApiKeyRecord[]>;
  set: (input: { provider: ApiKeyProvider; key: string }) => Promise<ApiKeyRecord>;
  remove: (input: { provider: ApiKeyProvider }) => Promise<ApiKeyRecord>;
  check: (input: { provider: ApiKeyProvider }) => Promise<ApiKeyRecord>;
};

/** In-memory mock for Storybook / unit tests until W5-BE3 IPC exists. */
export function createMockApiKeys(seed?: ApiKeyRecord[]): ApiKeysActions {
  let rows = seed ? structuredClone(seed) : emptyApiKeys();
  return {
    list: async () => structuredClone(rows),
    set: async ({ provider, key }) => {
      const trimmed = key.trim();
      if (!trimmed) throw new Error("Enter an API key.");
      if (/[\r\n\0]/.test(trimmed) || trimmed.length > 512) throw new Error("That key looks invalid.");
      rows = rows.map((row) =>
        row.provider === provider
          ? { provider, maskedKey: maskApiKey(trimmed), status: "unchecked" as const }
          : row,
      );
      return structuredClone(rows.find((row) => row.provider === provider)!);
    },
    remove: async ({ provider }) => {
      rows = rows.map((row) =>
        row.provider === provider ? { provider, maskedKey: null, status: "unchecked" as const } : row,
      );
      return structuredClone(rows.find((row) => row.provider === provider)!);
    },
    check: async ({ provider }) => {
      const current = rows.find((row) => row.provider === provider);
      if (!current?.maskedKey) throw new Error("Save a key before checking the connection.");
      // Demo only: keys ending in "bad0" are rejected; everything else is OK.
      const status = current.maskedKey.endsWith("bad0") ? ("rejected" as const) : ("ok" as const);
      rows = rows.map((row) => (row.provider === provider ? { ...row, status } : row));
      return structuredClone(rows.find((row) => row.provider === provider)!);
    },
  };
}

function ApiKeyCard(props: {
  record: ApiKeyRecord;
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
    <Card
      class="api-key-card"
      role="group"
      aria-label={`${label()} key`}
      data-status={props.record.status}
      data-has-key={hasKey() ? "true" : "false"}
    >
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
            No key saved
          </Text>
        }
      >
        <Text as="p" role="status">
          Saved key ending in {props.record.maskedKey}
        </Text>
      </Show>
      <Field label={`${label()} API key`}>
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
      <Text as="p" tone="muted" id={`api-key-hint-${props.record.provider}`}>
        The key is never shown again after you save it. Paste it only into this password field.
      </Text>
      <div class="api-key-card-actions">
        <Button
          type="button"
          disabled={props.busy || !draft().trim()}
          onClick={() => {
            const key = draft().trim();
            if (!key) return;
            setDraft("");
            void props.onSet(props.record.provider, key);
          }}
        >
          Save key
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={props.busy || !hasKey() || props.checking}
          loading={props.checking}
          loadingLabel="Checking connection"
          onClick={() => void props.onCheck(props.record.provider)}
        >
          Check connection
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={props.busy || !hasKey()}
          onClick={() => {
            setDraft("");
            void props.onRemove(props.record.provider);
          }}
        >
          Remove key
        </Button>
      </div>
    </Card>
  );
}

/** Providers page section: set / remove / check API keys (mock-ready). */
export function ApiKeysSection(props: { api?: ApiKeysActions }) {
  // Stable client for this mount (do not recreate the mock on each call).
  const client = props.api ?? createMockApiKeys();
  const [rows, setRows] = createSignal<ApiKeyRecord[]>(emptyApiKeys());
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [checking, setChecking] = createSignal<ApiKeyProvider | null>(null);
  let loadGeneration = 0;

  async function refresh() {
    const serial = ++loadGeneration;
    try {
      const next = await client.list();
      if (serial !== loadGeneration) return;
      // Keep the same array reference when nothing changed so open password drafts survive the first load.
      setRows((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setError("");
    } catch (e) {
      if (serial !== loadGeneration) return;
      setError(e instanceof Error ? e.message : "Could not load API keys.");
    }
  }

  onSettled(() => {
    void refresh();
  });

  async function run(work: () => Promise<void>) {
    if (busy()) return;
    setBusy(true);
    setError("");
    // Invalidate any in-flight first load so it cannot overwrite a just-saved row.
    loadGeneration += 1;
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The API key action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card class="providers-section api-keys-section" role="region" aria-label="API keys">
      <div class="providers-heading">
        <Heading as="h2" size="md">
          API keys
        </Heading>
      </div>
      <Text as="p" tone="secondary">
        Optional paid keys for OpenAI and Anthropic. Keys stay in the program vault; agents only receive them as
        process environment for one run.
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
              busy={busy()}
              checking={checking() === record.provider}
              onSet={async (provider, key) => {
                await run(async () => {
                  const next = await client.set({ provider, key });
                  setRows((list) => list.map((row) => (row.provider === provider ? next : row)));
                });
              }}
              onRemove={async (provider) => {
                await run(async () => {
                  const next = await client.remove({ provider });
                  setRows((list) => list.map((row) => (row.provider === provider ? next : row)));
                });
              }}
              onCheck={async (provider) => {
                if (busy() || checking()) return;
                setChecking(provider);
                setError("");
                try {
                  const next = await client.check({ provider });
                  setRows((list) => list.map((row) => (row.provider === provider ? next : row)));
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not check the connection.");
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
