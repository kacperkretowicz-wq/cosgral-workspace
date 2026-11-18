import type { AgentModelId, FallbackModelsInfo, ProvidersDesktopApi } from "@openbot/contracts/ipc";
import { fallbackModelsProblem, PROVIDER_LIMITS } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { type FallbackModelOption, FallbackOrder } from "./fallback-order";
import { providerError } from "./provider-error";
import { Badge, Button, Heading, Text } from "./ui";
export interface FallbackGroup {
  scope: string;
  label: string;
}
export function FallbackChainView(props: { info: FallbackModelsInfo | null; options: FallbackModelOption[] }) {
  const label = (id: AgentModelId) => props.options.find((model) => model.id === id)?.name ?? id;
  return (
    <section aria-label={t("Effective fallback chain")}>
      <Heading as="h4" size="sm">
        {t("Saved fallback chain")}
      </Heading>
      <Text as="p" tone="secondary">
        {t(
          "After the main model: Agent, then Provider, then All. Each model is tried once. Save edits to update this chain.",
        )}
      </Text>
      <ol>
        <For each={props.info?.chain ?? []}>
          {(entry) => (
            <li>
              {label(entry.model)}{" "}
              <Badge>
                {entry.source === "own" ? t("Agent") : entry.source === "provider" ? t("Provider") : t("All")}
              </Badge>{" "}
              <Show when={!entry.available}>
                <Badge tone="warning">{t("Unavailable")}</Badge>
              </Show>
            </li>
          )}
        </For>
      </ol>
      <Show when={props.info && !props.info.chain.length}>
        <Text as="p" tone="secondary">
          {t("No fallback models in the saved chain.")}
        </Text>
      </Show>
    </section>
  );
}
function ProviderList(props: {
  group: FallbackGroup;
  options: FallbackModelOption[];
  api: ProvidersDesktopApi;
  onSaved?: () => void;
}) {
  const [info, setInfo] = createSignal<FallbackModelsInfo | null>(null);
  const [items, setItems] = createSignal<AgentModelId[]>([]);
  const [saved, setSaved] = createSignal<AgentModelId[]>([]);
  const [ready, setReady] = createSignal(false);
  const [busy, setBusy] = createSignal(true);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  async function load() {
    try {
      const detail = await props.api.getFallbackInfo?.(props.group.scope);
      const list = detail?.own ?? (await props.api.getFallbackModels(props.group.scope));
      setInfo(detail ?? null);
      setItems(list);
      setSaved(list);
      setError("");
      setReady(true);
      return true;
    } catch (e) {
      setError(providerError(e, t("Could not load the list.")));
      return false;
    } finally {
      setBusy(false);
    }
  }
  onSettled(() => {
    void load();
  });
  async function save() {
    if (busy()) return;
    const problem = fallbackModelsProblem(items());
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await props.api.setFallbackModels({ botId: props.group.scope, fallbackModels: items() });
      if (await load()) {
        setNotice(t("Fallback order saved."));
        props.onSaved?.();
      }
    } catch (e) {
      setError(providerError(e, t("Could not save the list.")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label={t("{label} fallback list", { label: props.group.label })}>
      <Heading as="h3" size="sm">
        {props.group.label}
      </Heading>
      <Show when={error()}>
        <Text as="p" role="alert" tone="danger">
          {error()}
        </Text>
      </Show>
      <Show when={error()}>
        <Button
          disabled={busy()}
          onClick={() => {
            setBusy(true);
            void load();
          }}
        >
          {t("Reload list")}
        </Button>
      </Show>
      <FallbackOrder
        botName={props.group.label}
        items={items()}
        options={props.options}
        unavailable={info()?.unavailable}
        dirty={JSON.stringify(items()) !== JSON.stringify(saved())}
        saving={busy() || !ready()}
        onChange={(next) => {
          const problem = fallbackModelsProblem(next);
          if (problem) setError(problem);
          else {
            setItems(next);
            setError("");
          }
        }}
        onSave={() => void save()}
      />
      <Show when={notice()}>
        <Text as="p" role="status">
          {notice()}
        </Text>
      </Show>
    </section>
  );
}
export function ProviderFallbackLists(props: {
  groups: FallbackGroup[];
  options: FallbackModelOption[];
  api?: ProvidersDesktopApi;
  onSaved?: () => void;
}) {
  const api = props.api ?? window.openbot.providers;
  return (
    <Show when={api}>
      {(client) => (
        <div class="providers-form">
          <Text as="p" tone="secondary">
            {t("Each list allows up to {n} models from any provider. Provider lists run before All providers.", {
              n: PROVIDER_LIMITS.fallbackModels,
            })}
          </Text>
          <For each={props.groups}>
            {(group) => <ProviderList group={group} options={props.options} api={client()} onSaved={props.onSaved} />}
          </For>
        </div>
      )}
    </Show>
  );
}
