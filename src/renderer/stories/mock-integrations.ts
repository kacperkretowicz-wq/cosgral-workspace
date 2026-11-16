// COSGRAL W10-KK1: the account integrations for Storybook and the preview. Demo data only; nothing is contacted. The same
// rules as the program: a service must have a client id before it connects; `connect` answers with the waiting phase and the
// end comes as an event; a failed try says why; disconnect removes the sign-in (and the client on request). `simulate`
// plays the browser coming back, a refused sign-in and an expired sign-in.

import {
  type AgentEvent,
  type ConfigureIntegrationInput,
  emptyIntegrationStatus,
  INTEGRATION_INFO,
  INTEGRATION_LIMITS,
  INTEGRATION_SERVICES,
  type IntegrationDescription,
  type IntegrationList,
  type IntegrationService,
  type IntegrationStatus,
  type IntegrationsDesktopApi,
  integrationCallbackExample,
  integrationServerName,
  parseConfigureIntegrationInput,
  parseDisconnectIntegrationInput,
  parseIntegrationServiceInput,
} from "@openbot/contracts/ipc";

export interface MockIntegrations extends Required<IntegrationsDesktopApi> {
  simulate: {
    /** The browser came back and the sign-in worked. */
    complete: (service: IntegrationService) => void;
    /** The sign-in did not work (the person said no, or the service refused); `reason` is shown. */
    fail: (service: IntegrationService, reason: string) => void;
    /** A connected service refused the saved sign-in (expired or revoked). */
    expire: (service: IntegrationService) => void;
  };
}

interface Saved {
  clientId: string | null;
  clientSecretSet: boolean;
  mcpUrl: string | null;
  redirectPort: number | null;
  status: IntegrationStatus;
}

export function createMockIntegrations(emit: (event: AgentEvent) => void, spaceId = "main"): MockIntegrations {
  let clock = Date.parse("2026-11-16T12:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const saved = new Map<IntegrationService, Saved>(
    INTEGRATION_SERVICES.map((service) => [
      service,
      {
        clientId: null,
        clientSecretSet: false,
        mcpUrl: null,
        redirectPort: null,
        status: emptyIntegrationStatus(service, false),
      },
    ]),
  );
  const get = (service: IntegrationService): Saved => {
    const found = saved.get(service);
    if (!found) throw new Error("This service does not exist.");
    return found;
  };
  const list = (): IntegrationList => ({
    spaceId,
    services: INTEGRATION_SERVICES.map((service) => structuredClone(get(service).status)),
  });
  const publish = (): IntegrationList => {
    const snapshot = list();
    emit({ type: "integrations-changed", ...snapshot });
    return snapshot;
  };
  const set = (service: IntegrationService, status: IntegrationStatus) => {
    get(service).status = status;
  };

  return {
    list: async () => list(),
    status: async (raw) => structuredClone(get(parseIntegrationServiceInput(raw).service).status),
    describe: async (raw): Promise<IntegrationDescription> => {
      const { service } = parseIntegrationServiceInput(raw);
      const entry = get(service);
      return {
        ...INTEGRATION_INFO[service],
        callbackExample: integrationCallbackExample(entry.redirectPort),
        tokenStorage: "encrypted-on-this-computer",
        pkce: true,
        mcpUrl: entry.mcpUrl,
        clientIdSet: entry.clientId !== null,
        clientSecretSet: entry.clientSecretSet,
        redirectPort: entry.redirectPort,
      };
    },
    configure: async (raw) => {
      const input: ConfigureIntegrationInput = parseConfigureIntegrationInput(raw);
      const entry = get(input.service);
      if (input.clientId !== undefined) entry.clientId = input.clientId;
      if (input.clientSecret !== undefined) entry.clientSecretSet = input.clientSecret !== null;
      if (input.mcpUrl !== undefined) entry.mcpUrl = input.mcpUrl;
      if (input.redirectPort !== undefined) entry.redirectPort = input.redirectPort;
      const status = entry.status;
      if (input.scopes !== undefined) status.scopes = input.scopes;
      if (input.toolAllowlist !== undefined) status.toolAllowlist = input.toolAllowlist;
      if (entry.clientId !== null && status.phase === "not-configured") {
        entry.status = {
          ...status,
          ...emptyIntegrationStatus(input.service, true),
          scopes: status.scopes,
          toolAllowlist: status.toolAllowlist,
        };
      }
      return publish();
    },
    connect: async (raw) => {
      const { service } = parseIntegrationServiceInput(raw);
      const entry = get(service);
      if (entry.clientId === null) throw new Error("Set the app's client id first: the sign-in needs it.");
      if (entry.status.phase === "waiting-for-browser") return structuredClone(entry.status);
      set(service, {
        ...entry.status,
        phase: "waiting-for-browser",
        reason: null,
        waitingUntil: new Date(clock + INTEGRATION_LIMITS.waitSeconds * 1000).toISOString(),
        signInUrl: `https://sign-in.example/${service}`,
      });
      publish();
      return structuredClone(get(service).status);
    },
    cancel: async (raw) => {
      const { service } = parseIntegrationServiceInput(raw);
      const entry = get(service);
      if (entry.status.phase === "waiting-for-browser") {
        set(service, { ...entry.status, phase: "disconnected", reason: null, waitingUntil: null, signInUrl: null });
        publish();
      }
      return structuredClone(get(service).status);
    },
    disconnect: async (raw) => {
      const input = parseDisconnectIntegrationInput(raw);
      const entry = get(input.service);
      if (input.forgetClient) {
        entry.clientId = null;
        entry.clientSecretSet = false;
      }
      set(input.service, {
        ...emptyIntegrationStatus(input.service, entry.clientId !== null),
        scopes: entry.status.scopes,
        toolAllowlist: entry.status.toolAllowlist,
      });
      return publish();
    },
    simulate: {
      complete: (service) => {
        set(service, {
          ...get(service).status,
          phase: "connected",
          reason: null,
          connectedAt: now(),
          waitingUntil: null,
          signInUrl: null,
          mcpServerName: integrationServerName(service),
        });
        publish();
      },
      fail: (service, reason) => {
        set(service, { ...get(service).status, phase: "failed", reason, waitingUntil: null, signInUrl: null });
        publish();
      },
      expire: (service) => {
        set(service, {
          ...get(service).status,
          phase: "needs-login",
          reason: "The service no longer accepts the saved sign-in. Connect again.",
        });
        publish();
      },
    },
  };
}
