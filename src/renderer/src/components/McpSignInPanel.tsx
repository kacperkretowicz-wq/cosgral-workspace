import { MCP_OAUTH_LIMITS, type McpOAuthState, type McpOAuthStatus } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Badge, type BadgeTone, Button } from "./ui";

const STATE_VIEW: Record<McpOAuthState, { label: string; tone: BadgeTone }> = {
  "signed-out": { label: "Signed out", tone: "neutral" },
  "waiting-browser": { label: "Waiting for the browser", tone: "accent" },
  exchanging: { label: "Finishing the sign-in…", tone: "accent" },
  "signed-in": { label: "Signed in", tone: "success" },
  failed: { label: "Sign-in failed", tone: "danger" },
};

function expiry(status: McpOAuthStatus): string {
  if (status.state !== "signed-in") return "";
  if (!status.tokenExpiresAt) return t("The program renews the sign-in by itself.");
  const date = new Date(status.tokenExpiresAt);
  return Number.isNaN(date.getTime())
    ? ""
    : t("The sign-in is renewed by itself; it runs out {date}.", { date: date.toLocaleString() });
}

/**
 * Sign-in (OAuth) to MCP servers reached over the web (window.openbot.mcpOAuth). "Sign in" opens the system browser at the service's page;
 * the answer comes back by itself (`mcp-oauth-changed`). The page never sees a token or a code. A failure is a fixed sentence from the
 * program, never the server's own text.
 */
export function McpSignInPanel() {
  const api = untrack(() => window.openbot?.mcpOAuth);
  const [statuses, setStatuses] = createSignal<McpOAuthStatus[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal<string | null>(null);

  // An event is newer than any read that started before it, so such a read is dropped.
  let serial = 0;
  async function load() {
    if (!api) return;
    const mine = ++serial;
    try {
      const list = await api.list();
      if (mine !== serial) return;
      setStatuses(list.statuses);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not load the sign-ins."));
    } finally {
      setLoaded(true);
    }
  }

  onSettled(() => {
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "mcp-oauth-changed") {
        serial += 1;
        setStatuses(event.statuses);
      }
    });
    return () => off?.();
  });

  async function act(serverId: string, work: () => Promise<unknown>, failure: string) {
    if (busy()) return;
    setBusy(serverId);
    setError("");
    try {
      await work();
      // The answer of the call can be older than an event that arrived meanwhile, so read the list again.
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Show when={api}>
      <section class="vault-connectors mcp-signin" aria-label={t("Sign in to MCP servers")}>
        <h2>{t("Sign in to MCP servers")}</h2>
        <p class="vault-connectors-note">
          {t(
            "Some servers need you to sign in on the service's own page. The program opens your browser and keeps the sign-in; agents never see it.",
          )}
        </p>
        <Show when={error()}>
          <p class="vault-connectors-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={loaded()} fallback={<CosgralLoadingSkeleton label={t("Loading…")} />}>
          <Show
            when={statuses().length > 0}
            fallback={
              <p class="vault-connectors-note cosgral-empty">
                {t("No server here needs a sign-in. Add a server over the web first.")}
              </p>
            }
          >
            <ul class="vault-connector-list">
              <For each={statuses()}>
                {(status) => (
                  <li class="vault-connector-card" data-state={status.state}>
                    <header>
                      <strong>{status.serverName}</strong>
                      <Badge tone={STATE_VIEW[status.state].tone} dot>
                        {t(STATE_VIEW[status.state].label)}
                      </Badge>
                    </header>
                    <Show when={status.state === "waiting-browser"}>
                      <p class="vault-connectors-note" role="status">
                        {t("Finish the sign-in in the browser. The program waits {minutes} minutes.", {
                          minutes: Math.round(MCP_OAUTH_LIMITS.waitSeconds / 60),
                        })}
                      </p>
                    </Show>
                    <Show when={expiry(status)}>
                      <p class="vault-connectors-note">{expiry(status)}</p>
                    </Show>
                    <Show when={status.state === "failed" && status.error}>
                      <p class="vault-connectors-error" role="alert">
                        {t(status.error ?? "")}
                      </p>
                    </Show>
                    <div class="vault-connector-actions">
                      <Show
                        when={status.state === "waiting-browser" || status.state === "exchanging"}
                        fallback={
                          <>
                            <Button
                              type="button"
                              disabled={busy() !== null}
                              onClick={() =>
                                void act(
                                  status.serverId,
                                  async () => api?.signIn({ serverId: status.serverId }),
                                  t("Could not start the sign-in."),
                                )
                              }
                            >
                              {status.state === "signed-in"
                                ? t("Sign in again")
                                : status.state === "failed"
                                  ? t("Try again")
                                  : t("Sign in")}
                            </Button>
                            <Show when={status.state === "signed-in"}>
                              <Button
                                type="button"
                                variant="danger"
                                disabled={busy() !== null}
                                onClick={() =>
                                  void act(
                                    status.serverId,
                                    async () => api?.signOut({ serverId: status.serverId }),
                                    t("Could not sign out."),
                                  )
                                }
                              >
                                {t("Sign out")}
                              </Button>
                            </Show>
                          </>
                        }
                      >
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy() !== null || status.state === "exchanging"}
                          onClick={() =>
                            void act(
                              status.serverId,
                              async () => api?.cancel({ serverId: status.serverId }),
                              t("Could not cancel the sign-in."),
                            )
                          }
                        >
                          {t("Cancel")}
                        </Button>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </section>
    </Show>
  );
}
