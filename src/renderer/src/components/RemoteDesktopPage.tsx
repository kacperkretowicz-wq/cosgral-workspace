import type {
  RemoteDesktopExposure,
  RemoteDesktopFrame,
  RemoteDesktopInput,
  RemoteDesktopMode,
} from "@openbot/contracts/ipc";
import {
  emptyRemoteDesktopClientState,
  emptyRemoteDesktopHostState,
  REMOTE_DESKTOP_LIMITS,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { RemoteDesktopAccessPanel } from "./RemoteDesktopAccessPanel";
import { Button, Input, NativeSelect } from "./ui";

function modeLabel(mode: string): string {
  return mode === "control" ? t("Control") : t("View");
}
function phaseLabel(phase: string): string {
  switch (phase) {
    case "connecting":
      return t("connecting");
    case "waiting-for-owner":
      return t("waiting for the owner");
    case "connected":
      return t("connected");
    case "failed":
      return t("failed");
    default:
      return t("idle");
  }
}

export function RemoteDesktopSafetyBanner(props: { count: number; onStop: () => void }) {
  return (
    <Show when={props.count > 0}>
      <aside class="remote-desktop-safety" aria-label={t("Remote desktop sharing")}>
        <span>{t("Remote viewer connected")}</span>{" "}
        <Button unstyled type="button" class="remote-desktop-stop" onClick={props.onStop}>
          {t("Stop all remote sessions")}
        </Button>
      </aside>
    </Show>
  );
}

export function RemoteDesktopSafety() {
  const [count, setCount] = createSignal(0);
  const [error, setError] = createSignal("");
  onSettled(() => {
    const api = window.openbot.remoteDesktop;
    if (!api) return;
    void api.host
      .getState()
      .then((state) => setCount(state.sessions.length))
      .catch((e) => setError(String(e)));
    return window.openbot.agent.onEvent((event) => {
      if (event.type === "remote-desktop-host-changed") setCount(event.state.sessions.length);
    });
  });
  return (
    <>
      <RemoteDesktopSafetyBanner
        count={count()}
        onStop={() =>
          void window.openbot.remoteDesktop?.host
            .stop()
            .then((state) => {
              setCount(state.sessions.length);
              setError("");
            })
            .catch((e) => setError(e instanceof Error ? e.message : t("Stop failed.")))
        }
      />
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </>
  );
}

export function RemoteDesktopToken(props: { token: string; onClose: () => void }) {
  const [message, setMessage] = createSignal("");
  return (
    <section aria-label={t("Sharing token")}>
      <h3>{t("Save this token")}</h3>
      <p>{t("This token is shown only once. Anyone with it can request access; share it privately.")}</p>
      <code>{props.token}</code>{" "}
      <Button
        unstyled
        type="button"
        onClick={() =>
          void navigator.clipboard
            .writeText(props.token)
            .then(() => setMessage(t("Copied.")))
            .catch(() => setMessage(t("Could not copy; select the token manually.")))
        }
      >
        {t("Copy token")}
      </Button>
      <Show when={message()}>
        <p role="status">{message()}</p>
      </Show>
      <Button unstyled type="button" onClick={props.onClose}>
        {t("I saved the token")}
      </Button>
    </section>
  );
}

export function RemoteDesktopPage() {
  const api = window.openbot.remoteDesktop;
  const [host, setHost] = createSignal(emptyRemoteDesktopHostState());
  const [client, setClient] = createSignal(emptyRemoteDesktopClientState());
  const [exposure, setExposure] = createSignal<RemoteDesktopExposure>("loopback");
  const [port, setPort] = createSignal(0);
  const [token, setToken] = createSignal("");
  const [address, setAddress] = createSignal("");
  const [clientToken, setClientToken] = createSignal("");
  const [mode, setMode] = createSignal<RemoteDesktopMode>("view");
  const [error, setError] = createSignal("");
  let canvas: HTMLCanvasElement | undefined;
  let lastFrameAt = 0;
  let lastSeq = -1;
  let disposed = false;
  async function hostAction(action: () => Promise<typeof host extends () => infer T ? T : never>) {
    try {
      setHost(await action());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Host action failed."));
    }
  }
  async function tokenAction(action: () => Promise<{ state: ReturnType<typeof host>; token: string }>) {
    try {
      const result = await action();
      setHost(result.state);
      setToken(result.token);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not start sharing."));
    }
  }
  async function clientAction(action: () => Promise<ReturnType<typeof client>>) {
    try {
      setClient(await action());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Connection failed."));
    }
  }
  function draw(frame: RemoteDesktopFrame) {
    const now = performance.now();
    if (frame.seq <= lastSeq || now - lastFrameAt < 1000 / REMOTE_DESKTOP_LIMITS.framesPerSecond) return;
    lastSeq = frame.seq;
    lastFrameAt = now;
    const img = new Image();
    img.onload = () => {
      if (disposed || frame.seq !== lastSeq || !canvas) return;
      canvas.width = frame.width;
      canvas.height = frame.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0, frame.width, frame.height);
    };
    img.src = `data:image/jpeg;base64,${frame.jpegBase64}`;
  }
  function send(input: RemoteDesktopInput) {
    if (client().phase !== "connected" || client().mode !== "control" || !api) return;
    void api.client.sendInput(input).catch((e) => setError(e instanceof Error ? e.message : t("Input failed.")));
  }
  function point(e: MouseEvent | WheelEvent) {
    const rect = e.currentTarget instanceof HTMLCanvasElement ? e.currentTarget.getBoundingClientRect() : null;
    if (!rect?.width || !rect.height) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }
  onSettled(() => {
    if (!api) {
      setError(t("Remote desktop is unavailable."));
      return;
    }
    void api.host
      .getState()
      .then(setHost)
      .catch((e) => setError(String(e)));
    void api.client
      .getState()
      .then(setClient)
      .catch((e) => setError(String(e)));
    const offFrame = api.onFrame(draw);
    const offEvent = window.openbot.agent.onEvent((event) => {
      if (event.type === "remote-desktop-host-changed") setHost(event.state);
      if (event.type === "remote-desktop-client-changed") {
        setClient(event.state);
        if (event.state.phase !== "connected") {
          lastSeq = -1;
          lastFrameAt = 0;
          canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    });
    return () => {
      disposed = true;
      offFrame();
      offEvent();
    };
  });
  return (
    <main class="w2-library remote-desktop-page">
      <h1>{t("Remote desktop")}</h1>
      <p role="note">
        {t(
          "Traffic is not encrypted outside a secure tunnel such as a VPN. Do not expose this service directly to the internet.",
        )}
      </p>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <RemoteDesktopAccessPanel />
      <section>
        <h2>{t("Share this computer")}</h2>
        <Show when={!host().available}>
          <p>{host().unavailableReason ?? t("Sharing is unavailable.")}</p>
        </Show>
        <div class="remote-desktop-fields">
          <label>
            {t("Exposure")}{" "}
            <NativeSelect
              unstyled
              value={exposure()}
              disabled={host().enabled}
              onChange={(e) => setExposure(e.currentTarget.value === "lan" ? "lan" : "loopback")}
            >
              <option value="loopback">{t("This computer / tunnel")}</option>
              <option value="lan">{t("Local network")}</option>
            </NativeSelect>
          </label>
          <label>
            {t("Port")}{" "}
            <Input
              unstyled
              type="number"
              min="0"
              max="65535"
              value={port()}
              disabled={host().enabled}
              onInput={(e) => setPort(Number(e.currentTarget.value))}
            />
          </label>
        </div>
        <div class="remote-desktop-actions">
          <Show
            when={!host().enabled}
            fallback={
              <>
                <Button
                  unstyled
                  type="button"
                  onClick={() => {
                    setToken("");
                    if (api) void hostAction(() => api.host.disable());
                  }}
                >
                  {t("Disable sharing")}
                </Button>{" "}
                <Button
                  unstyled
                  type="button"
                  onClick={() => {
                    if (api) void tokenAction(() => api.host.regenerateToken());
                  }}
                >
                  {t("Generate new token")}
                </Button>
              </>
            }
          >
            <Button
              unstyled
              type="button"
              disabled={!host().available}
              onClick={() => {
                if (api) void tokenAction(() => api.host.enable({ exposure: exposure(), port: port() }));
              }}
            >
              {t("Enable sharing")}
            </Button>
          </Show>
        </div>
        <Show when={token()}>{(value) => <RemoteDesktopToken token={value()} onClose={() => setToken("")} />}</Show>
        <For each={host().listening?.urls ?? []}>{(url) => <p>{url}</p>}</For>
        <p>{t("Requests awaiting approval: {count}", { count: host().consentPending })}</p>
        <Button
          unstyled
          type="button"
          class="remote-desktop-stop"
          disabled={!api}
          onClick={() => {
            if (api) void hostAction(() => api.host.stop());
          }}
        >
          {t("Stop all remote sessions")}
        </Button>
        <h3>{t("Connected viewers")}</h3>
        <Show when={host().sessions.length} fallback={<p>{t("No viewers connected.")}</p>}>
          <ul>
            <For each={host().sessions}>
              {(session) => (
                <li>
                  {session.label} · {modeLabel(session.mode)}{" "}
                  <Show when={session.paused}> · {t("paused: {reason}", { reason: session.paused ?? "" })}</Show>{" "}
                  <Show when={session.mode === "control"}>
                    <Button
                      unstyled
                      type="button"
                      onClick={() => {
                        if (api)
                          void hostAction(() => api.host.setSessionMode({ sessionId: session.id, mode: "view" }));
                      }}
                    >
                      {t("View only")}
                    </Button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <h3>{t("Known viewers")}</h3>
        <ul>
          <For each={host().peers}>
            {(peer) => (
              <li>
                {peer.label}{" "}
                <label>
                  {t("Policy")}{" "}
                  <NativeSelect
                    unstyled
                    value={peer.policy}
                    onChange={(e) => {
                      const policy = e.currentTarget.value;
                      if (api && (policy === "ask" || policy === "allow" || policy === "block"))
                        void hostAction(() => api.host.setPeerPolicy({ peerId: peer.id, policy }));
                    }}
                  >
                    <option value="ask">{t("Ask")}</option>
                    <option value="allow">{t("Allow")}</option>
                    <option value="block">{t("Block")}</option>
                  </NativeSelect>
                </label>{" "}
                <Button
                  unstyled
                  type="button"
                  onClick={() => {
                    if (api) void hostAction(() => api.host.removePeer({ peerId: peer.id }));
                  }}
                >
                  {t("Remove viewer")}
                </Button>
              </li>
            )}
          </For>
        </ul>
      </section>
      <section>
        <h2>{t("Connect to another computer")}</h2>
        <div class="remote-desktop-fields">
          <label>
            {t("Address")} <Input unstyled value={address()} onInput={(e) => setAddress(e.currentTarget.value)} />
          </label>
          <label>
            {t("Token")}{" "}
            <Input
              unstyled
              type="password"
              value={clientToken()}
              onInput={(e) => setClientToken(e.currentTarget.value)}
              autocomplete="off"
            />
          </label>
          <label>
            {t("Mode")}{" "}
            <NativeSelect
              unstyled
              value={mode()}
              onChange={(e) => setMode(e.currentTarget.value === "control" ? "control" : "view")}
            >
              <option value="view">{t("View")}</option>
              <option value="control">{t("Control")}</option>
            </NativeSelect>
          </label>
        </div>
        <div class="remote-desktop-actions">
          <Button
            unstyled
            type="button"
            disabled={!api || !address().trim() || !clientToken() || client().phase === "connecting"}
            onClick={() => {
              if (!api) return;
              const input = { address: address().trim(), token: clientToken(), mode: mode() };
              setClientToken("");
              void clientAction(() => api.client.connect(input));
            }}
          >
            {t("Connect")}
          </Button>
          <Button
            unstyled
            type="button"
            disabled={!api || client().phase === "idle"}
            onClick={() => {
              if (api) void clientAction(() => api.client.disconnect());
            }}
          >
            {t("Disconnect")}
          </Button>
        </div>
        <p role="status">
          {t("Status: {phase}", { phase: phaseLabel(client().phase) })}
          {client().mode ? ` · ${modeLabel(client().mode ?? "view")}` : ""}
        </p>
        <Show when={client().error}>
          <p role="alert">{client().error}</p>
        </Show>
        <p>{t("In control mode, focus the screen to send keys. Press F10 to leave the remote screen.")}</p>
        <canvas
          ref={canvas}
          class="remote-desktop-canvas"
          width="640"
          height="360"
          tabindex="0"
          aria-label={t("Remote screen. Focus to send keyboard input when control is granted.")}
          onContextMenu={(e) => {
            if (client().mode !== "control") return;
            e.preventDefault();
            const p = point(e);
            if (p) send({ type: "click", ...p, button: "right", count: 1 });
          }}
          onClick={(e) => {
            const p = point(e);
            if (p) send({ type: "click", ...p, button: "left", count: 1 });
          }}
          onWheel={(e) => {
            if (client().mode !== "control") return;
            e.preventDefault();
            const p = point(e);
            if (p) send({ type: "scroll", ...p, deltaX: Math.sign(e.deltaX), deltaY: Math.sign(e.deltaY) });
          }}
          onKeyDown={(e) => {
            if (client().mode !== "control" || client().phase !== "connected") return;
            if (e.key === "F10") {
              e.preventDefault();
              e.currentTarget.blur();
              return;
            }
            e.preventDefault();
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) send({ type: "text", text: e.key });
            else {
              const mods = [e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && "shift", e.metaKey && "meta"].filter(
                Boolean,
              );
              if (!["Control", "Alt", "Shift", "Meta"].includes(e.key))
                send({ type: "keys", keys: [...mods, e.key.toLowerCase()].join("+") });
            }
          }}
        />
      </section>
    </main>
  );
}
