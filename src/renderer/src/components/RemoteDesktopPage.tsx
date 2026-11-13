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

export function RemoteDesktopSafetyBanner(props: { count: number; onStop: () => void }) {
  return (
    <Show when={props.count > 0}>
      <aside class="remote-desktop-safety" aria-label="Remote desktop sharing">
        <span>Remote viewer connected</span>{" "}
        <button type="button" class="remote-desktop-stop" onClick={props.onStop}>
          Stop all remote sessions
        </button>
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
            .catch((e) => setError(e instanceof Error ? e.message : "Stop failed."))
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
    <section aria-label="Sharing token">
      <h3>Save this token</h3>
      <p>This token is shown only once. Anyone with it can request access; share it privately.</p>
      <code>{props.token}</code>{" "}
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard
            .writeText(props.token)
            .then(() => setMessage("Copied."))
            .catch(() => setMessage("Could not copy; select the token manually."))
        }
      >
        Copy token
      </button>
      <Show when={message()}>
        <p role="status">{message()}</p>
      </Show>
      <button type="button" onClick={props.onClose}>
        I saved the token
      </button>
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
      setError(e instanceof Error ? e.message : "Host action failed.");
    }
  }
  async function tokenAction(action: () => Promise<{ state: ReturnType<typeof host>; token: string }>) {
    try {
      const result = await action();
      setHost(result.state);
      setToken(result.token);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start sharing.");
    }
  }
  async function clientAction(action: () => Promise<ReturnType<typeof client>>) {
    try {
      setClient(await action());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
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
    void api.client.sendInput(input).catch((e) => setError(e instanceof Error ? e.message : "Input failed."));
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
      setError("Remote desktop is unavailable.");
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
      <h1>Remote desktop</h1>
      <p role="note">
        Traffic is not encrypted outside a secure tunnel such as a VPN. Do not expose this service directly to the
        internet.
      </p>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <section>
        <h2>Share this computer</h2>
        <Show when={!host().available}>
          <p>{host().unavailableReason ?? "Sharing is unavailable."}</p>
        </Show>
        <label>
          Exposure{" "}
          <select
            value={exposure()}
            disabled={host().enabled}
            onChange={(e) => setExposure(e.currentTarget.value === "lan" ? "lan" : "loopback")}
          >
            <option value="loopback">This computer / tunnel</option>
            <option value="lan">Local network</option>
          </select>
        </label>
        <label>
          Port{" "}
          <input
            type="number"
            min="0"
            max="65535"
            value={port()}
            disabled={host().enabled}
            onInput={(e) => setPort(Number(e.currentTarget.value))}
          />
        </label>
        <Show
          when={!host().enabled}
          fallback={
            <>
              <button
                type="button"
                onClick={() => {
                  setToken("");
                  if (api) void hostAction(() => api.host.disable());
                }}
              >
                Disable sharing
              </button>{" "}
              <button
                type="button"
                onClick={() => {
                  if (api) void tokenAction(() => api.host.regenerateToken());
                }}
              >
                Generate new token
              </button>
            </>
          }
        >
          <button
            type="button"
            disabled={!host().available}
            onClick={() => {
              if (api) void tokenAction(() => api.host.enable({ exposure: exposure(), port: port() }));
            }}
          >
            Enable sharing
          </button>
        </Show>
        <Show when={token()}>{(value) => <RemoteDesktopToken token={value()} onClose={() => setToken("")} />}</Show>
        <For each={host().listening?.urls ?? []}>{(url) => <p>{url}</p>}</For>
        <p>Requests awaiting approval: {host().consentPending}</p>
        <button
          type="button"
          class="remote-desktop-stop"
          disabled={!api}
          onClick={() => {
            if (api) void hostAction(() => api.host.stop());
          }}
        >
          Stop all remote sessions
        </button>
        <h3>Connected viewers</h3>
        <Show when={host().sessions.length} fallback={<p>No viewers connected.</p>}>
          <ul>
            <For each={host().sessions}>
              {(session) => (
                <li>
                  {session.label} · {session.mode} <Show when={session.paused}> · paused: {session.paused}</Show>{" "}
                  <Show when={session.mode === "control"}>
                    <button
                      type="button"
                      onClick={() => {
                        if (api)
                          void hostAction(() => api.host.setSessionMode({ sessionId: session.id, mode: "view" }));
                      }}
                    >
                      View only
                    </button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <h3>Known viewers</h3>
        <ul>
          <For each={host().peers}>
            {(peer) => (
              <li>
                {peer.label}{" "}
                <label>
                  Policy{" "}
                  <select
                    value={peer.policy}
                    onChange={(e) => {
                      const policy = e.currentTarget.value;
                      if (api && (policy === "ask" || policy === "allow" || policy === "block"))
                        void hostAction(() => api.host.setPeerPolicy({ peerId: peer.id, policy }));
                    }}
                  >
                    <option value="ask">Ask</option>
                    <option value="allow">Allow</option>
                    <option value="block">Block</option>
                  </select>
                </label>{" "}
                <button
                  type="button"
                  onClick={() => {
                    if (api) void hostAction(() => api.host.removePeer({ peerId: peer.id }));
                  }}
                >
                  Remove viewer
                </button>
              </li>
            )}
          </For>
        </ul>
      </section>
      <section>
        <h2>Connect to another computer</h2>
        <label>
          Address <input value={address()} onInput={(e) => setAddress(e.currentTarget.value)} />
        </label>
        <label>
          Token{" "}
          <input
            type="password"
            value={clientToken()}
            onInput={(e) => setClientToken(e.currentTarget.value)}
            autocomplete="off"
          />
        </label>
        <label>
          Mode{" "}
          <select value={mode()} onChange={(e) => setMode(e.currentTarget.value === "control" ? "control" : "view")}>
            <option value="view">View</option>
            <option value="control">Control</option>
          </select>
        </label>
        <button
          type="button"
          disabled={!api || !address().trim() || !clientToken() || client().phase === "connecting"}
          onClick={() => {
            if (!api) return;
            const input = { address: address().trim(), token: clientToken(), mode: mode() };
            setClientToken("");
            void clientAction(() => api.client.connect(input));
          }}
        >
          Connect
        </button>
        <button
          type="button"
          disabled={!api || client().phase === "idle"}
          onClick={() => {
            if (api) void clientAction(() => api.client.disconnect());
          }}
        >
          Disconnect
        </button>
        <p role="status">
          Status: {client().phase}
          {client().mode ? ` · ${client().mode}` : ""}
        </p>
        <Show when={client().error}>
          <p role="alert">{client().error}</p>
        </Show>
        <p>In control mode, focus the screen to send keys. Press F10 to leave the remote screen.</p>
        <canvas
          ref={canvas}
          class="remote-desktop-canvas"
          width="640"
          height="360"
          tabindex="0"
          aria-label="Remote screen. Focus to send keyboard input when control is granted."
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
