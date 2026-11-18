import type {
  MobileConnectOverview,
  MobileConnectPhone,
  PhoneReach,
  PhoneTailscaleGuide,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Badge, Button, Card, Heading, Switch, Text } from "./ui";

const REACH_LABELS: Record<PhoneReach, string> = {
  off: "Phones cannot connect: Mobile Connect is off.",
  "this-computer": "Only a browser on this computer can open the phone page.",
  "local-network": "Phones on your home network can connect.",
  tailscale: "Phones on your home network, and away from home through Tailscale.",
};

function when(value: string | null): string {
  if (!value) return t("never");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function PhoneRow(props: {
  phone: MobileConnectPhone;
  canTest: boolean;
  busy: boolean;
  testResult: string | undefined;
  onTest: () => void;
}) {
  const phone = () => props.phone;
  return (
    <li class="mobile-overview-phone">
      <div class="mobile-overview-phone-head">
        <Text as="strong">{phone().name}</Text>
        <Show when={phone().platform}>
          <Badge size="sm">{phone().platform}</Badge>
        </Show>
      </div>
      <Text as="p" tone="muted" variant="caption">
        {t("Paired {paired} · last seen {seen}", { paired: when(phone().pairedAt), seen: when(phone().lastSeenAt) })}
        {phone().lastAddress ? ` · ${phone().lastAddress}` : ""}
      </Text>
      <div class="mobile-overview-badges">
        <Badge tone={phone().pinSet ? "success" : "neutral"} size="sm">
          {phone().pinSet ? t("PIN set") : t("No PIN")}
        </Badge>
        <Show when={phone().locked}>
          <Badge tone="warning" size="sm">
            {t("Locked")}
          </Badge>
        </Show>
        <Badge tone={phone().pushSubscribed ? "success" : "neutral"} size="sm">
          {phone().pushSubscribed ? t("Notifications on") : t("Notifications off")}
        </Badge>
      </div>
      <Show when={phone().pushError}>
        {(reason) => (
          <Text as="p" tone="danger" variant="caption">
            {reason()}
          </Text>
        )}
      </Show>
      <Show when={phone().lastPushAt}>
        <Text as="p" tone="muted" variant="caption">
          {t("Last notification: {when}", { when: when(phone().lastPushAt) })}
        </Text>
      </Show>
      <Show when={props.canTest}>
        <div class="mobile-overview-badges">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-label={t("Send a test notification to {name}", { name: phone().name })}
            disabled={props.busy}
            onClick={props.onTest}
          >
            {t("Send a test notification")}
          </Button>
          <Show when={props.testResult}>
            {(result) => (
              <Text as="span" tone="muted" variant="caption" role="status">
                {result()}
              </Text>
            )}
          </Show>
        </div>
      </Show>
    </li>
  );
}

/**
 * What Mobile Connect adds to the phone page in one answer (window.openbot.mobileConnect.getOverview): how a phone reaches this
 * computer (the route in use, the ones this version does not offer), each phone with its lock and notifications, and what is not
 * available here with the reason. Read only: pairing, the route and removing a phone stay in the cards above.
 */
export function MobileOverviewPanel() {
  const api = untrack(() => window.openbot?.mobileConnect);
  const [overview, setOverview] = createSignal<MobileConnectOverview | null>(null);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const phoneApi = untrack(() => window.openbot?.phone);
  const [guide, setGuide] = createSignal<PhoneTailscaleGuide | null>(null);
  const [pushBusy, setPushBusy] = createSignal(false);
  const [testResults, setTestResults] = createSignal<Record<string, string>>({});

  // The newest read wins: an older read that finishes late is dropped.
  let serial = 0;
  async function load() {
    if (!api) return;
    const mine = ++serial;
    try {
      const next = await api.getOverview();
      if (mine !== serial) return;
      setOverview(next);
      setError("");
    } catch (cause) {
      if (mine === serial)
        setError(cause instanceof Error ? cause.message : t("Could not load the overview of your phones."));
    } finally {
      setLoaded(true);
    }
  }

  async function setPush(enabled: boolean) {
    if (!phoneApi || pushBusy()) return;
    setPushBusy(true);
    setError("");
    try {
      await phoneApi.setPushEnabled({ enabled });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change the notifications."));
    } finally {
      setPushBusy(false);
    }
  }

  async function testPush(deviceId: string) {
    if (!phoneApi || pushBusy()) return;
    setPushBusy(true);
    setError("");
    try {
      const result = await phoneApi.sendTestPush({ deviceId });
      setTestResults({
        ...testResults(),
        [deviceId]: result.sent ? t("The test notification was sent.") : t(result.reason ?? "It was not sent."),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not send the test notification."));
    } finally {
      setPushBusy(false);
    }
  }

  onSettled(() => {
    void load();
    void phoneApi
      ?.getTailscaleGuide()
      .then(setGuide)
      .catch(() => undefined);
    const off = window.openbot?.agent?.onEvent((event) => {
      if (
        event.type === "mobile-changed" ||
        event.type === "mobile-pairing-completed" ||
        event.type === "phone-access-changed"
      )
        void load();
    });
    return () => off?.();
  });

  return (
    <Show when={api}>
      <div class="mobile-overview">
        <Show when={error()}>
          <p class="updates-panel-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={loaded()} fallback={<p role="status">{t("Loading…")}</p>}>
          <Show when={overview()}>
            {(view) => (
              <>
                <Card class="mobile-section" role="region" aria-label={t("How phones reach this computer")}>
                  <Heading as="h2" size="md">
                    {t("How phones reach this computer")}
                  </Heading>
                  <Text as="p" tone="secondary" role="status">
                    {t(REACH_LABELS[view().phone.reach])}
                  </Text>
                  <ul class="mobile-overview-routes">
                    <For each={view().routes}>
                      {(route) => (
                        <li
                          class="mobile-overview-route"
                          aria-disabled={route.available ? undefined : "true"}
                          data-selected={route.selected ? "true" : undefined}
                        >
                          <div>
                            <Text as="strong">{t(route.label)}</Text>
                            <Text as="p" tone="muted" variant="caption">
                              {t(route.description)}
                            </Text>
                            <Show when={route.reason}>
                              {(reason) => (
                                <Text as="p" tone="muted" variant="caption">
                                  {t(reason())}
                                </Text>
                              )}
                            </Show>
                          </div>
                          <Show when={route.available} fallback={<Badge tone="neutral">{t("Not available")}</Badge>}>
                            <Show when={route.selected}>
                              <Badge tone="success" dot>
                                {t("In use")}
                              </Badge>
                            </Show>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={view().phone.tailscaleUrls.length > 0}>
                    <Text as="p" tone="muted" variant="caption">
                      {t("Tailscale addresses: {urls}", { urls: view().phone.tailscaleUrls.join(", ") })}
                    </Text>
                  </Show>
                  <Show when={guide()}>
                    {(steps) => (
                      <details class="messenger-steps">
                        <summary>{t(steps().title)}</summary>
                        <ol>
                          <For each={steps().steps}>{(step) => <li>{t(step)}</li>}</For>
                        </ol>
                        <For each={steps().notes}>{(note) => <p>{t(note)}</p>}</For>
                      </details>
                    )}
                  </Show>
                </Card>

                <Card class="mobile-section" role="region" aria-label={t("Your phones")}>
                  <Heading as="h2" size="md">
                    {t("Your phones")}
                  </Heading>
                  <Show
                    when={phoneApi}
                    fallback={
                      <Text as="p" tone="muted" variant="caption">
                        {view().phone.push.enabled
                          ? t("Notifications from this computer are on.")
                          : t("Notifications from this computer are off.")}
                      </Text>
                    }
                  >
                    <Switch
                      checked={view().phone.push.enabled}
                      disabled={pushBusy()}
                      onChange={(checked) => void setPush(checked)}
                      label={t("Send notifications to phones")}
                      description={t(
                        view().phone.push.unavailableReason ??
                          "A phone is told only when an agent waits for you. It says nothing else.",
                      )}
                    />
                  </Show>
                  <Show
                    when={view().phones.length > 0}
                    fallback={
                      <Text as="p" tone="muted">
                        {t("No phones yet. Use “Pair another phone” above to add one.")}
                      </Text>
                    }
                  >
                    <ul class="mobile-overview-phones">
                      <For each={view().phones}>
                        {(phone) => (
                          <PhoneRow
                            phone={phone}
                            canTest={Boolean(phoneApi) && phone.pushSubscribed}
                            busy={pushBusy()}
                            testResult={testResults()[phone.id]}
                            onTest={() => void testPush(phone.id)}
                          />
                        )}
                      </For>
                    </ul>
                  </Show>
                </Card>

                <Card class="mobile-section" role="region" aria-label={t("Not available in this version")}>
                  <Heading as="h2" size="md">
                    {t("Not available in this version")}
                  </Heading>
                  <ul class="mobile-overview-routes">
                    <For each={view().unavailable}>
                      {(feature) => (
                        <li class="mobile-overview-route" aria-disabled="true">
                          <div>
                            <Text as="strong">{t(feature.label)}</Text>
                            <Text as="p" tone="muted" variant="caption">
                              {t(feature.reason)}
                            </Text>
                          </div>
                          <Badge tone="neutral">{t("Not available")}</Badge>
                        </li>
                      )}
                    </For>
                  </ul>
                </Card>
              </>
            )}
          </Show>
        </Show>
      </div>
    </Show>
  );
}
