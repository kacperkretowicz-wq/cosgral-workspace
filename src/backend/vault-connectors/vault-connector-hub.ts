// COSGRAL W11-KK (d): one place for the three Vault connectors. It answers the window API (`vaultConnectors:*`), publishes the whole
// list as the event `vault-connectors-changed` whenever any connector changes, and gives the agent tools the logins of every
// connected manager as `ConnectorLoginSource`s.
//
// Proton Pass: the contract lists it, but THIS build has no driver for it yet. Connecting answers a fixed failure (never a crash,
// never a half connection); it is the next connector to write, with the same shape as 1Password and Bitwarden.

import {
  type AgentEvent,
  type ConnectVaultConnectorInput,
  emptyVaultConnectorStatus,
  VAULT_CONNECTOR_IDS,
  type VaultConnectorId,
  type VaultConnectorList,
  type VaultConnectorStatus,
} from "@openbot/contracts/ipc";
import { BitwardenConnector, type BitwardenOptions } from "./bitwarden-connector";
import type { ConnectorLoginSource, ConnectorStore } from "./common";
import { OnePasswordConnector, type OnePasswordOptions } from "./onepassword-connector";

export interface VaultConnectorHubOptions {
  store: ConnectorStore;
  emit: (event: AgentEvent) => void;
  onePassword: Omit<OnePasswordOptions, "store" | "emit">;
  bitwarden: Omit<BitwardenOptions, "emit">;
}

export class VaultConnectorHub {
  readonly #options: VaultConnectorHubOptions;
  readonly #onePassword: OnePasswordConnector;
  readonly #bitwarden: BitwardenConnector;
  /** Proton Pass has no driver in this build: its status is kept here. */
  #proton: VaultConnectorStatus = emptyVaultConnectorStatus("protonpass");

  constructor(options: VaultConnectorHubOptions) {
    this.#options = options;
    this.#onePassword = new OnePasswordConnector({
      ...options.onePassword,
      store: options.store,
      emit: () => this.#publish(),
    });
    this.#bitwarden = new BitwardenConnector({ ...options.bitwarden, emit: () => this.#publish() });
  }

  /** Reads the saved connections (1Password) in the background. Call after the Vault is open. */
  load(): void {
    this.#onePassword.load();
  }

  dispose(): void {
    this.#onePassword.dispose();
    this.#bitwarden.dispose();
  }

  list(): VaultConnectorList {
    return { connectors: VAULT_CONNECTOR_IDS.map((connector) => this.status(connector)) };
  }

  status(connector: VaultConnectorId): VaultConnectorStatus {
    if (connector === "onepassword") return this.#onePassword.status();
    if (connector === "bitwarden") return this.#bitwarden.status();
    return structuredClone(this.#proton);
  }

  async checkSetup(connector: VaultConnectorId): Promise<VaultConnectorStatus> {
    if (connector === "onepassword") return this.#onePassword.checkSetup();
    if (connector === "bitwarden") return this.#bitwarden.checkSetup();
    return this.status(connector);
  }

  async installCli(connector: VaultConnectorId): Promise<VaultConnectorStatus> {
    if (connector === "onepassword") return this.#onePassword.installCli();
    return this.status(connector);
  }

  async openApp(connector: VaultConnectorId): Promise<void> {
    if (connector === "onepassword") await this.#onePassword.openApp();
  }

  async connect(input: ConnectVaultConnectorInput): Promise<VaultConnectorStatus> {
    if (input.connector === "onepassword") {
      return input.method === "token" && input.secret !== undefined
        ? this.#onePassword.connectWithToken(input.secret)
        : this.#onePassword.connectWithApp(input.accountId);
    }
    if (input.connector === "bitwarden") return this.#bitwarden.connect(input.secret ?? "", input.serverUrl);
    this.#proton = {
      ...emptyVaultConnectorStatus("protonpass"),
      state: "failed",
      error: "Proton Pass is not available in this version yet.",
      errorCode: "unknown",
    };
    this.#publish();
    return this.status("protonpass");
  }

  cancel(connector: VaultConnectorId): VaultConnectorStatus {
    if (connector === "onepassword") return this.#onePassword.cancel();
    if (connector === "bitwarden") return this.#bitwarden.cancel();
    return this.status(connector);
  }

  disconnect(connector: VaultConnectorId): VaultConnectorStatus {
    if (connector === "onepassword") return this.#onePassword.disconnect();
    if (connector === "bitwarden") return this.#bitwarden.disconnect();
    this.#proton = emptyVaultConnectorStatus("protonpass");
    this.#publish();
    return this.status("protonpass");
  }

  /** The managers an agent may read logins from now (connected ones only). */
  sources(): ConnectorLoginSource[] {
    return [this.#onePassword, this.#bitwarden].filter((source) => source.connected());
  }

  #publish(): void {
    this.#options.emit({ type: "vault-connectors-changed", ...this.list() });
  }
}
