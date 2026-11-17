// COSGRAL W12-KK (1): our `OAuthClientProvider` for the MCP SDK. Two modes of the same class:
//  - interactive (a sign-in the person started): it knows the one-time loopback address and the `state`, and opens the system browser;
//  - connecting (a normal connection of the server): it only gives the saved tokens and renews them; it NEVER opens a browser by
//    itself (a program that starts must not throw sign-in pages at the person), so a refused refresh ends as `needs-login`.
// Tokens and the registration live in the encrypted store; the PKCE verifier lives in memory for the attempt only.

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { MCP_OAUTH_LIMITS } from "@openbot/contracts/ipc";
import type { McpOAuthStore } from "./oauth-store";

/** Used only as the registered address when no sign-in runs; no server listens there. */
const IDLE_REDIRECT = `http://127.0.0.1${MCP_OAUTH_LIMITS.callbackPath}`;

export interface McpOAuthProviderOptions {
  serverId: string;
  store: McpOAuthStore;
  /** Interactive mode: the one-time loopback address. */
  redirectUrl?: string;
  /** Interactive mode: the `state` the callback server expects. */
  state?: string;
  /** Interactive mode: opens an address in the system browser. */
  openBrowser?: (url: string) => Promise<void>;
}

export class McpOAuthProvider implements OAuthClientProvider {
  readonly #options: McpOAuthProviderOptions;
  #verifier = "";

  constructor(options: McpOAuthProviderOptions) {
    this.#options = options;
  }

  get redirectUrl(): string {
    return this.#options.redirectUrl ?? IDLE_REDIRECT;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "COSGRAL Workspace",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    return this.#options.state ?? "";
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.#options.store.read(this.#options.serverId).client ?? undefined;
  }

  saveClientInformation(information: OAuthClientInformationMixed): void {
    this.#options.store.writeClient(this.#options.serverId, information);
  }

  tokens(): OAuthTokens | undefined {
    const stored = this.#options.store.read(this.#options.serverId);
    return stored.tokens ?? undefined;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.#options.store.writeTokens(this.#options.serverId, tokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const open = this.#options.openBrowser;
    if (!open || this.#options.redirectUrl === undefined) return;
    // Only the service's own secure page (or one on this computer) goes to the system browser; never another kind of address.
    const local = authorizationUrl.protocol === "http:" && authorizationUrl.hostname === "127.0.0.1";
    if ((authorizationUrl.protocol !== "https:" && !local) || authorizationUrl.username || authorizationUrl.password) {
      throw new Error("Only a secure sign-in address can be opened.");
    }
    await open(authorizationUrl.toString());
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.#verifier = codeVerifier;
  }

  codeVerifier(): string {
    if (this.#verifier.length === 0) throw new Error("No sign-in is in progress.");
    return this.#verifier;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    const { store, serverId } = this.#options;
    if (scope === "all") store.clear(serverId);
    else if (scope === "client") store.clearClient(serverId);
    else if (scope === "tokens") store.clearTokens(serverId);
    else if (scope === "verifier") this.#verifier = "";
  }
}
