import type { MobilePairingTicket, MobileState } from "@openbot/contracts/ipc";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { MobileConnectView, type MobileConnectViewProps } from "../src/components/MobileConnectPage";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

// Demo data only: the address, fingerprint and phones below are made up.
const FINGERPRINT = "3A:7F:C2:19:8E:04:B5:D1:6C:92:E7:58:0B:A4:F3:2D:71:9C:E0:86:15:4A:BD:63:F8:27:90:CE:5B:12:D4:A9";

const base: MobileState = {
  enabled: false,
  exposure: "loopback",
  port: null,
  urls: [],
  transport: "tls",
  fingerprint: FINGERPRINT,
  unencrypted: false,
  pairing: null,
  devices: [],
  unavailableReason: null,
};

const demoQr =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><path fill="#14141c" d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0zM9 1h2v2H9zM9 5h3v1H9zM8 9h2v2H8zM12 9h3v2h-3zM16 9h2v2h-2zM9 13h2v3H9zM13 14h2v2h-2zM17 14h3v3h-3zM12 18h3v2h-3z"/></svg>',
  );

const pairingState: MobileState = {
  ...base,
  enabled: true,
  port: 47930,
  urls: ["https://127.0.0.1:47930"],
  pairing: { expiresAt: "2099-01-01T00:00:00.000Z", attemptsLeft: 5, consentPending: false },
};

const ticket: MobilePairingTicket = {
  ticket: "demo-ticket-0000000000000",
  qrPayload: "https://127.0.0.1:47930/app/#v=1&t=demo-ticket-0000000000000&f=3a7f…&u=https%3A%2F%2F127.0.0.1%3A47930",
  qrSvg: "",
  qrDataUrl: demoQr,
  urls: ["https://127.0.0.1:47930"],
  appUrl: "https://127.0.0.1:47930/app/",
  fingerprint: FINGERPRINT.replaceAll(":", "").toLowerCase(),
  expiresAt: new Date(Date.now() + 4 * 60_000 + 20_000).toISOString(),
  state: pairingState,
};

const pairedState: MobileState = {
  ...base,
  enabled: true,
  exposure: "lan",
  port: 47930,
  urls: ["https://127.0.0.1:47930", "https://192.168.1.20:47930"],
  devices: [
    {
      id: "demo-1",
      name: "Demo phone",
      platform: "android",
      pairedAt: "2026-11-12T18:30:00.000Z",
      lastSeenAt: "2026-11-13T17:05:00.000Z",
      lastAddress: "192.168.1.31",
    },
    {
      id: "demo-2",
      name: "Demo tablet",
      platform: "ios",
      pairedAt: "2026-11-13T09:10:00.000Z",
      lastSeenAt: null,
      lastAddress: null,
    },
  ],
};

function view(overrides: Partial<MobileConnectViewProps>): MobileConnectViewProps {
  return {
    state: base,
    ticket: null,
    exposure: "loopback",
    now: Date.now(),
    busy: false,
    error: "",
    notice: "",
    onExposure: () => undefined,
    onStartPairing: () => undefined,
    onCancelPairing: () => undefined,
    onDisable: () => undefined,
    onRevoke: () => undefined,
    onRotate: () => undefined,
    onCopy: () => undefined,
    ...overrides,
  };
}

function Scene(props: { theme: StoryTheme; kind: "off" | "pairing" | "paired" | "plain" }) {
  const p = () => {
    if (props.kind === "pairing") return view({ state: pairingState, ticket });
    if (props.kind === "paired") return view({ state: pairedState, exposure: "lan", notice: "Demo phone is paired." });
    if (props.kind === "plain")
      return view({
        state: { ...pairedState, transport: "plain", fingerprint: null, unencrypted: true, exposure: "loopback" },
      });
    return view({});
  };
  return (
    <ThemeFrame
      theme={props.theme}
      style="padding: 24px; width: 720px; max-width: 100%; min-height: 100vh; display: grid; align-content: start; gap: 16px;"
    >
      <MobileConnectView {...p()} />
    </ThemeFrame>
  );
}

const meta = { title: "COSGRAL/W3 phone (Mobile Connect)", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OffDark: Story = { args: { theme: "dark", kind: "off" } };
export const OffLight: Story = { args: { theme: "light", kind: "off" } };
export const PairingDark: Story = { args: { theme: "dark", kind: "pairing" } };
export const PairingLight: Story = { args: { theme: "light", kind: "pairing" } };
export const PairedDark: Story = { args: { theme: "dark", kind: "paired" } };
export const PairedLight: Story = { args: { theme: "light", kind: "paired" } };
export const PlainWarningDark: Story = { args: { theme: "dark", kind: "plain" } };
