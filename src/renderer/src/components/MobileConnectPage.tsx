import type { MobileExposure, MobilePairingTicket, MobileState } from "@openbot/contracts/ipc";
import { MOBILE_PLAIN_TRANSPORT_WARNING, MOBILE_TRANSPORT_WARNING } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { MobileOverviewPanel } from "./MobileOverviewPanel";
import { PageIcon } from "./PageRail";
import { PanelHeading } from "./PanelHeading";
import { Badge, Button, Card, Field, NativeSelect, Text } from "./ui";
import { QrCode, ShieldCheck, Smartphone, Wifi } from "./ui/icons";

/** "4:59" from milliseconds; never negative. */
export function formatMobileCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatWhen(value: string | null): string {
  if (!value) return t("never");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export interface MobileConnectViewProps {
  state: MobileState;
  /** The pairing ticket while its QR code is shown. */
  ticket: MobilePairingTicket | null;
  exposure: MobileExposure;
  /** The current time in ms, for the countdown. */
  now: number;
  busy: boolean;
  error: string;
  /** Last event: a phone paired. */
  notice: string;
  onExposure: (exposure: MobileExposure) => void;
  onStartPairing: () => void;
  onCancelPairing: () => void;
  onDisable: () => void;
  onRevoke: (deviceId: string) => void;
  onRotate: () => void;
  onCopy: (text: string) => void;
}

/** Mobile Connect (parity row 42): turn the phone server on or off, pair a phone, manage devices. */
export function MobileConnectView(props: MobileConnectViewProps) {
  const [confirmRotate, setConfirmRotate] = createSignal(false);
  const transportWarning = () =>
    props.state.transport === "tls" ? MOBILE_TRANSPORT_WARNING : MOBILE_PLAIN_TRANSPORT_WARNING;
  const remaining = () => (props.ticket ? new Date(props.ticket.expiresAt).getTime() - props.now : 0);
  return (
    <>
      <header class="work-page-header">
        <span class="work-page-icon" aria-hidden="true">
          <PageIcon page="phone" />
        </span>
        <div class="work-page-heading">
          <h1>{t("Phone")}</h1>
          <p>
            {t(
              "Pair a phone to read and answer your agents from it. Everything a phone may not do stays on this computer.",
            )}
          </p>
        </div>
      </header>

      <aside
        class="mobile-warning"
        data-transport={props.state.transport}
        role="note"
        aria-label={t("Phone connection security")}
      >
        <Badge tone={props.state.transport === "tls" ? "success" : "warning"} dot>
          {props.state.transport === "tls" ? t("Encrypted (TLS)") : t("Not encrypted")}
        </Badge>
        <Text as="p">{t(transportWarning())}</Text>
      </aside>

      <Show when={props.state.unavailableReason}>
        {(reason) => (
          <Text as="p" tone="warning" role="status">
            {reason()}
          </Text>
        )}
      </Show>
      <Show when={props.error}>
        <Text as="p" tone="danger" role="alert">
          {props.error}
        </Text>
      </Show>
      <Show when={props.notice}>
        <Text as="p" tone="success" role="status">
          {props.notice}
        </Text>
      </Show>

      <Card class="mobile-section">
        <PanelHeading icon={Wifi} tint="blue">
          {t("Connection")}
        </PanelHeading>
        <Field
          label={t("Who can reach this computer")}
          description={
            props.exposure === "lan"
              ? t(
                  "Phones on your local network can connect. This needs encryption (TLS); without it the program refuses.",
                )
              : t("Only this computer. A phone reaches it through a tunnel you trust (VPN or USB forwarding).")
          }
        >
          <NativeSelect
            value={props.exposure}
            disabled={props.busy}
            onChange={(event) => props.onExposure(event.currentTarget.value === "lan" ? "lan" : "loopback")}
          >
            <option value="loopback">{t("This computer only (tunnel)")}</option>
            <option value="lan">{t("Local network (LAN)")}</option>
          </NativeSelect>
        </Field>
        <Text as="p" tone="secondary" role="status">
          {props.state.enabled
            ? t("Listening on {addresses}.", { addresses: props.state.urls.join(", ") || t("this computer") })
            : t("The phone server is off.")}
        </Text>
        <div class="mobile-actions">
          <Button type="button" variant="primary" disabled={props.busy} onClick={props.onStartPairing}>
            {props.state.enabled ? t("Pair another phone") : t("Turn on and pair a phone")}
          </Button>
          <Show when={props.state.enabled}>
            <Button type="button" disabled={props.busy} onClick={props.onDisable}>
              {t("Turn off")}
            </Button>
          </Show>
        </div>
      </Card>

      <Show when={props.ticket}>
        {(ticket) => (
          <Card class="mobile-section" role="region" aria-label={t("Pair a phone")}>
            <PanelHeading icon={QrCode} tint="green">
              {t("Pair a phone")}
            </PanelHeading>
            <Text as="p" tone="secondary">
              {t("Scan this code with the phone camera, or open the link on the phone.")}
            </Text>
            <img class="mobile-qr" src={ticket().qrDataUrl} alt={t("Pairing QR code")} width="220" height="220" />
            <Text as="p" role="timer" aria-live="off">
              {remaining() > 0
                ? t("Code valid for {time}", { time: formatMobileCountdown(remaining()) })
                : t("This code has expired.")}
            </Text>
            <Show when={props.state.pairing?.consentPending}>
              <Text as="p" tone="warning" role="status">
                {t("A phone is asking to pair. Approve or decline on the confirm card in Needs you.")}
              </Text>
            </Show>
            <Show when={props.state.pairing && !props.state.pairing.consentPending}>
              <Text as="p" tone="muted">
                {t("Waiting for a phone. Wrong tries left: {count}.", {
                  count: props.state.pairing?.attemptsLeft ?? 0,
                })}
              </Text>
            </Show>
            <Field label={t("Pairing link")} description={t("Valid for one phone and a few minutes. Do not share it.")}>
              <code class="mobile-code" data-testid="pairing-link">
                {ticket().qrPayload}
              </code>
            </Field>
            <Button type="button" size="sm" onClick={() => props.onCopy(ticket().qrPayload)}>
              {t("Copy link")}
            </Button>
            <Field label={t("Phone app address")}>
              <code class="mobile-code" data-testid="app-url">
                {ticket().appUrl}
              </code>
            </Field>
            <Show when={props.state.fingerprint}>
              {(fingerprint) => (
                <Field
                  label={t("Certificate fingerprint (SHA-256)")}
                  description={t(
                    "A web browser cannot check this by itself: when it warns about the certificate, compare the fingerprint it shows with this one.",
                  )}
                >
                  <code class="mobile-code" data-testid="fingerprint">
                    {fingerprint()}
                  </code>
                </Field>
              )}
            </Show>
            <Button type="button" disabled={props.busy} onClick={props.onCancelPairing}>
              {t("Cancel pairing")}
            </Button>
          </Card>
        )}
      </Show>

      <Card class="mobile-section">
        <PanelHeading icon={Smartphone} tint="cyan">
          {t("Paired phones")}
        </PanelHeading>
        <Show
          when={props.state.devices.length}
          fallback={
            <Text as="p" tone="muted">
              {t("No phone is paired.")}
            </Text>
          }
        >
          <ul class="mobile-devices">
            <For each={props.state.devices}>
              {(device) => (
                <li class="mobile-device">
                  <div>
                    <Text as="strong">{device.name}</Text>{" "}
                    <Show when={device.platform}>
                      <Badge size="sm">{device.platform}</Badge>
                    </Show>
                    <Text as="p" tone="muted">
                      {t("Paired {paired} · last seen {seen}", {
                        paired: formatWhen(device.pairedAt),
                        seen: formatWhen(device.lastSeenAt),
                      })}
                      {device.lastAddress ? ` · ${device.lastAddress}` : ""}
                    </Text>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={props.busy}
                    aria-label={t("Remove {name}", { name: device.name })}
                    onClick={() => props.onRevoke(device.id)}
                  >
                    {t("Remove")}
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Card>

      <Show when={props.state.transport === "tls"}>
        <Card class="mobile-section">
          <PanelHeading icon={ShieldCheck} tint="orange">
            {t("Certificate")}
          </PanelHeading>
          <Text as="p" tone="secondary">
            {t(
              "A new certificate has a new fingerprint. Every phone pinned the old one, so rotating removes all paired phones and each must pair again.",
            )}
          </Text>
          <Show
            when={confirmRotate()}
            fallback={
              <Button type="button" disabled={props.busy} onClick={() => setConfirmRotate(true)}>
                {t("Rotate certificate…")}
              </Button>
            }
          >
            <fieldset class="mobile-confirm" aria-label={t("Confirm certificate rotation")}>
              <Text as="p" tone="danger">
                {props.state.devices.length === 1
                  ? t("This removes {count} paired phone at once. They stop working until paired again.", { count: 1 })
                  : t("This removes {count} paired phones at once. They stop working until paired again.", {
                      count: props.state.devices.length,
                    })}
              </Text>
              <div class="mobile-actions">
                <Button
                  type="button"
                  variant="danger"
                  disabled={props.busy}
                  onClick={() => {
                    setConfirmRotate(false);
                    props.onRotate();
                  }}
                >
                  {t("Rotate and remove all phones")}
                </Button>
                <Button type="button" onClick={() => setConfirmRotate(false)}>
                  {t("Keep the current certificate")}
                </Button>
              </div>
            </fieldset>
          </Show>
        </Card>
      </Show>
    </>
  );
}

const EMPTY_STATE: MobileState = {
  enabled: false,
  exposure: "loopback",
  port: null,
  urls: [],
  transport: "tls",
  fingerprint: null,
  unencrypted: false,
  pairing: null,
  devices: [],
  unavailableReason: null,
};

/** The page: `window.openbot.mobile` and its events (`mobile-changed`, `mobile-pairing-completed`). */
export function MobileConnectPage() {
  const api = window.openbot.mobile;
  const [state, setState] = createSignal<MobileState>(EMPTY_STATE);
  const [ticket, setTicket] = createSignal<MobilePairingTicket | null>(null);
  const [exposure, setExposure] = createSignal<MobileExposure>("loopback");
  const [now, setNow] = createSignal(Date.now());
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");

  function apply(next: MobileState) {
    setState(next);
    if (!next.enabled || !next.pairing) setTicket(null);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Something went wrong."));
    } finally {
      setBusy(false);
    }
  }
  onSettled(() => {
    if (!api) {
      setError(t("Mobile Connect is unavailable."));
      return;
    }
    void api
      .getState()
      .then((next) => {
        apply(next);
        setExposure(next.exposure);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "mobile-changed") apply(event.state);
      if (event.type === "mobile-pairing-completed") {
        setTicket(null);
        setNotice(t("{name} is paired.", { name: event.device.name }));
      }
    });
    return () => {
      clearInterval(timer);
      off();
    };
  });
  return (
    <main class="w2-library work-page mobile-connect-page" data-page="phone">
      <MobileConnectView
        state={state()}
        ticket={ticket()}
        exposure={exposure()}
        now={now()}
        busy={busy() || !api}
        error={error()}
        notice={notice()}
        onExposure={setExposure}
        onStartPairing={() =>
          void run(async () => {
            if (!api) return;
            setNotice("");
            const next = await api.startPairing({ exposure: exposure() });
            setTicket(next);
            setState(next.state);
          })
        }
        onCancelPairing={() =>
          void run(async () => {
            if (!api) return;
            apply(await api.cancelPairing());
            setTicket(null);
          })
        }
        onDisable={() =>
          void run(async () => {
            if (!api) return;
            setTicket(null);
            apply(await api.disable());
          })
        }
        onRevoke={(deviceId) =>
          void run(async () => {
            if (api) apply(await api.revokeDevice({ deviceId }));
          })
        }
        onRotate={() =>
          void run(async () => {
            if (!api) return;
            setTicket(null);
            apply(await api.rotateCertificate());
            setNotice(t("The certificate was replaced. Every phone must pair again."));
          })
        }
        onCopy={(text) =>
          void navigator.clipboard
            .writeText(text)
            .then(() => setNotice(t("Copied.")))
            .catch(() => setError(t("Could not copy; select the text manually.")))
        }
      />
      <MobileOverviewPanel />
    </main>
  );
}
