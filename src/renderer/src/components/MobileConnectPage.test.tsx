import type { MobilePairingTicket, MobileState } from "@openbot/contracts/ipc";
import { MOBILE_PLAIN_TRANSPORT_WARNING, MOBILE_TRANSPORT_WARNING } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { formatMobileCountdown, MobileConnectView, type MobileConnectViewProps } from "./MobileConnectPage";

const FINGERPRINT = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89";

function state(overrides: Partial<MobileState> = {}): MobileState {
  return {
    enabled: true,
    exposure: "loopback",
    port: 47_930,
    urls: ["https://127.0.0.1:47930"],
    transport: "tls",
    fingerprint: FINGERPRINT,
    unencrypted: false,
    pairing: null,
    devices: [],
    unavailableReason: null,
    ...overrides,
  };
}

function ticket(next: MobileState): MobilePairingTicket {
  return {
    ticket: "t".repeat(24),
    qrPayload: "https://127.0.0.1:47930/app/#v=1&t=demo",
    qrSvg: "<svg/>",
    qrDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
    urls: ["https://127.0.0.1:47930"],
    appUrl: "https://127.0.0.1:47930/app/",
    fingerprint: "ab".repeat(32),
    expiresAt: new Date(10_000 + 125_000).toISOString(),
    state: next,
  };
}

function props(overrides: Partial<MobileConnectViewProps> = {}): MobileConnectViewProps {
  return {
    state: state(),
    ticket: null,
    exposure: "loopback",
    now: 10_000,
    busy: false,
    error: "",
    notice: "",
    onExposure: vi.fn(),
    onStartPairing: vi.fn(),
    onCancelPairing: vi.fn(),
    onDisable: vi.fn(),
    onRevoke: vi.fn(),
    onRotate: vi.fn(),
    onCopy: vi.fn(),
    ...overrides,
  };
}

describe("MobileConnectView", () => {
  it("counts down in minutes and seconds and never goes negative", () => {
    expect(formatMobileCountdown(125_000)).toBe("2:05");
    expect(formatMobileCountdown(-5)).toBe("0:00");
  });

  it("always shows the transport warning that matches the transport", () => {
    const tls = render(() => <MobileConnectView {...props({ state: state({ enabled: false }) })} />);
    expect(screen.getByText(MOBILE_TRANSPORT_WARNING)).toBeInTheDocument();
    tls.unmount();
    render(() => (
      <MobileConnectView
        {...props({ state: state({ transport: "plain", fingerprint: null, unencrypted: true, enabled: false }) })}
      />
    ));
    expect(screen.getByText(MOBILE_PLAIN_TRANSPORT_WARNING)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rotate certificate/ })).toBeNull();
  });

  it("shows the QR code, link, app address, fingerprint and countdown while pairing", () => {
    const pairing = state({ pairing: { expiresAt: "x", attemptsLeft: 5, consentPending: false } });
    render(() => <MobileConnectView {...props({ state: pairing, ticket: ticket(pairing) })} />);
    expect(screen.getByAltText("Pairing QR code")).toHaveAttribute("src", "data:image/svg+xml;base64,PHN2Zy8+");
    expect(screen.getByTestId("pairing-link")).toHaveTextContent("#v=1&t=demo");
    expect(screen.getByTestId("app-url")).toHaveTextContent("https://127.0.0.1:47930/app/");
    expect(screen.getByTestId("fingerprint")).toHaveTextContent(FINGERPRINT);
    expect(screen.getByText(/Code valid for 2:05/)).toBeInTheDocument();
  });

  it("says when a phone waits for the person's decision in Needs you", () => {
    const pairing = state({ pairing: { expiresAt: "x", attemptsLeft: 4, consentPending: true } });
    render(() => <MobileConnectView {...props({ state: pairing, ticket: ticket(pairing) })} />);
    expect(screen.getByText(/confirm card in Needs you/)).toBeInTheDocument();
  });

  it("starts, cancels and turns off through the handlers", async () => {
    const pairing = state({ pairing: { expiresAt: "x", attemptsLeft: 5, consentPending: false } });
    const p = props({ state: pairing, ticket: ticket(pairing) });
    render(() => <MobileConnectView {...p} />);
    await fireEvent.click(screen.getByRole("button", { name: "Pair another phone" }));
    await fireEvent.click(screen.getByRole("button", { name: "Cancel pairing" }));
    await fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(p.onStartPairing).toHaveBeenCalledOnce();
    expect(p.onCancelPairing).toHaveBeenCalledOnce();
    expect(p.onDisable).toHaveBeenCalledOnce();
    expect(p.onCopy).toHaveBeenCalledWith("https://127.0.0.1:47930/app/#v=1&t=demo");
  });

  it("describes LAN and reports the chosen exposure", async () => {
    const p = props({ exposure: "lan" });
    render(() => <MobileConnectView {...p} />);
    expect(screen.getByText(/needs encryption \(TLS\)/)).toBeInTheDocument();
    await fireEvent.change(screen.getByRole("combobox"), { target: { value: "loopback" } });
    expect(p.onExposure).toHaveBeenCalledWith("loopback");
  });

  it("lists devices and removes one", async () => {
    const devices = [
      {
        id: "d1",
        name: "Pixel",
        platform: "android",
        pairedAt: "2026-11-13T10:00:00.000Z",
        lastSeenAt: null,
        lastAddress: "192.168.0.5",
      },
    ];
    const p = props({ state: state({ devices }) });
    render(() => <MobileConnectView {...p} />);
    expect(screen.getByText("Pixel")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Remove Pixel" }));
    expect(p.onRevoke).toHaveBeenCalledWith("d1");
  });

  it("asks before rotating the certificate and says all phones are removed", async () => {
    const devices = [
      { id: "d1", name: "A", platform: null, pairedAt: "x", lastSeenAt: null, lastAddress: null },
      { id: "d2", name: "B", platform: null, pairedAt: "x", lastSeenAt: null, lastAddress: null },
    ];
    const p = props({ state: state({ devices }) });
    render(() => <MobileConnectView {...p} />);
    await fireEvent.click(screen.getByRole("button", { name: /Rotate certificate/ }));
    expect(p.onRotate).not.toHaveBeenCalled();
    expect(screen.getByText(/removes 2 paired phones at once/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Keep the current certificate" }));
    expect(p.onRotate).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole("button", { name: /Rotate certificate/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Rotate and remove all phones" }));
    expect(p.onRotate).toHaveBeenCalledOnce();
  });

  it("shows errors and the pairing notice", () => {
    render(() => <MobileConnectView {...props({ error: "Port in use.", notice: "Pixel is paired." })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Port in use.");
    expect(screen.getByText("Pixel is paired.")).toBeInTheDocument();
  });
});
