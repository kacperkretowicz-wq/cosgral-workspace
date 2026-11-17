// COSGRAL W12-KK (1): the MCP sign-in (OAuth) for Storybook and the preview. DEMO servers only; no browser opens and nothing is
// contacted. The same rules as the program: `signIn` answers `waiting-browser` at once and the end comes as an event, a new attempt
// replaces one that waits, cancelling and signing out leave a clean state, a failure is a fixed sentence with a code, and nothing of a
// token or a code is in any answer. `simulate` plays what the browser and the service do.

import {
  type AgentEvent,
  emptyMcpOAuthStatus,
  MCP_OAUTH_ERROR_SENTENCES,
  type McpOAuthDesktopApi,
  type McpOAuthErrorCode,
  type McpOAuthList,
  type McpOAuthStatus,
  parseMcpOAuthServerInput,
} from "@openbot/contracts/ipc";

export interface MockMcpOAuth extends Required<McpOAuthDesktopApi> {
  simulate: {
    /** The person approved on the service's page: the program trades the code and the server connects. */
    approved: (serverId: string) => void;
    /** The person refused on the service's page. */
    denied: (serverId: string) => void;
    /** An answer came back that did not belong to the attempt. */
    wrongState: (serverId: string) => void;
    /** Nothing came back in time. */
    timedOut: (serverId: string) => void;
    /** The service no longer accepts the saved tokens: signed out again, quietly. */
    tokensRevoked: (serverId: string) => void;
  };
}

/** Demo servers over http. */
const DEMO_SERVERS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "demo-docs", name: "p_demo_docs" },
  { id: "demo-board", name: "p_demo_board" },
];

export function createMockMcpOAuth(emit: (event: AgentEvent) => void): MockMcpOAuth {
  let clock = Date.parse("2026-11-17T08:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const statuses = new Map<string, McpOAuthStatus>(
    DEMO_SERVERS.map((server) => [server.id, emptyMcpOAuthStatus(server.id, server.name)]),
  );
  const current = (serverId: string): McpOAuthStatus => {
    const status = statuses.get(serverId);
    if (status === undefined) throw new Error("That server is not known.");
    return status;
  };
  const snapshot = (): McpOAuthList => ({ statuses: [...statuses.values()].map((status) => structuredClone(status)) });
  const set = (serverId: string, change: Partial<McpOAuthStatus>): McpOAuthStatus => {
    statuses.set(serverId, { ...current(serverId), since: now(), ...change });
    emit({ type: "mcp-oauth-changed", ...snapshot() });
    return structuredClone(current(serverId));
  };
  const fail = (serverId: string, code: McpOAuthErrorCode) =>
    set(serverId, { state: "failed", error: MCP_OAUTH_ERROR_SENTENCES[code], errorCode: code });
  const waiting = (serverId: string) => current(serverId).state === "waiting-browser";
  const clean = { tokenExpiresAt: null, error: null, errorCode: null } as const;

  return {
    list: async () => snapshot(),
    status: async (input) => structuredClone(current(parseMcpOAuthServerInput(input).serverId)),
    signIn: async (input) => {
      const { serverId } = parseMcpOAuthServerInput(input);
      current(serverId);
      return set(serverId, { state: "waiting-browser", ...clean });
    },
    cancel: async (input) => {
      const { serverId } = parseMcpOAuthServerInput(input);
      if (!waiting(serverId)) return structuredClone(current(serverId));
      return set(serverId, { state: "signed-out", ...clean });
    },
    signOut: async (input) => {
      const { serverId } = parseMcpOAuthServerInput(input);
      return set(serverId, { state: "signed-out", ...clean });
    },
    simulate: {
      approved: (serverId) => {
        if (!waiting(serverId)) return;
        set(serverId, { state: "exchanging" });
        set(serverId, { state: "signed-in", tokenExpiresAt: new Date(clock + 3_600_000).toISOString() });
      },
      denied: (serverId) => {
        if (waiting(serverId)) fail(serverId, "denied");
      },
      wrongState: (serverId) => {
        if (waiting(serverId)) fail(serverId, "state-mismatch");
      },
      timedOut: (serverId) => {
        if (waiting(serverId)) fail(serverId, "timeout");
      },
      tokensRevoked: (serverId) => {
        if (current(serverId).state === "signed-in") set(serverId, { state: "signed-out", ...clean });
      },
    },
  };
}
