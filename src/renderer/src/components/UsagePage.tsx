import type { AcpAgentConfig, ProviderUsage } from "@openbot/contracts/ipc";
import { createSignal, onSettled, Show } from "solid-js";
import type { BotProfile } from "../data";
import { t } from "../i18n";
import { ProviderUsageList } from "./ProvidersPage";
import { UsageReportView } from "./UsageReportView";
import { Text } from "./ui";
import { WorkPage } from "./WorkPage";

/**
 * COSGRAL W3-BE9: the Usage page of the page rail. It reads the providers contract only
 * (`providers.listUsage`, `provider-usage-changed`): state ok | limited | unavailable, used percent, reason and
 * reset time per provider and per ACP agent. Per-agent token counts are not in any contract yet.
 */
export function UsagePage(props: { bots?: ReadonlyArray<BotProfile> } = {}) {
  const [usage, setUsage] = createSignal<ProviderUsage[]>([]);
  const [acpAgents, setAcpAgents] = createSignal<AcpAgentConfig[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  const [error, setError] = createSignal("");

  async function refresh() {
    const api = window.openbot.providers;
    if (!api) return;
    setRefreshing(true);
    try {
      setUsage(await api.listUsage());
      setNow(Date.now());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not load usage."));
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }

  onSettled(() => {
    const api = window.openbot.providers;
    if (!api) {
      setError(t("Usage is not available in this build."));
      return;
    }
    void refresh();
    void api
      .listAcpAgents()
      .then(setAcpAgents)
      .catch(() => undefined);
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "provider-usage-changed") {
        setUsage(event.usage);
        setLoaded(true);
      }
      if (event.type === "acp-agents-changed") setAcpAgents(event.agents);
    });
    return () => {
      clearInterval(timer);
      off();
    };
  });

  return (
    <WorkPage
      page="usage"
      title={t("Usage")}
      description={t("How much of each provider's limit is used, and when a limit resets.")}
      class="usage-page"
    >
      <Show when={error()}>
        <Text as="p" tone="danger" role="alert">
          {error()}
        </Text>
      </Show>
      <Show when={window.openbot?.usageReport}>
        <UsageReportView bots={props.bots} />
      </Show>
      <Show when={window.openbot.providers && loaded()}>
        <ProviderUsageList
          usage={usage()}
          acpAgents={acpAgents()}
          now={now()}
          refreshing={refreshing()}
          onRefresh={() => void refresh()}
        />
      </Show>
    </WorkPage>
  );
}
