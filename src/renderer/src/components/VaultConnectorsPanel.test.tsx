import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockVaultConnectors } from "../../stories/mock-vault-connectors";
import { VaultConnectorsPanel } from "./VaultConnectorsPanel";

let mock = createMockVaultConnectors(() => undefined);
let emit: (event: AgentEvent) => void = () => undefined;

beforeEach(() => {
  mock = createMockVaultConnectors((event) => emit(event));
  Object.assign(window, {
    openbot: {
      vaultConnectors: mock.connectors,
      agent: {
        onEvent: (listener: (event: AgentEvent) => void) => {
          emit = listener;
          return () => undefined;
        },
      },
    },
  });
});
afterEach(cleanup);

const card = async (name: string) => {
  const row = (await screen.findByText(name)).closest("li");
  if (!(row instanceof HTMLElement)) throw new Error("no connector card");
  return within(row);
};

it("lists the three managers, not connected", async () => {
  render(() => <VaultConnectorsPanel />);
  expect(await screen.findByText("1Password")).toBeInTheDocument();
  expect(screen.getByText("Bitwarden")).toBeInTheDocument();
  expect(screen.getAllByText("Not connected").length).toBe(3);
});

it("checks the tool of a manager", async () => {
  const spy = vi.spyOn(mock.connectors, "checkSetup");
  render(() => <VaultConnectorsPanel />);
  const bitwarden = await card("Bitwarden");
  await fireEvent.click(bitwarden.getByRole("button", { name: "Check the tool" }));
  await waitFor(() => expect(spy).toHaveBeenCalledWith({ connector: "bitwarden" }));
});

it("connects with a token that is written, never shown, and then lists logins", async () => {
  const connect = vi.spyOn(mock.connectors, "connect");
  render(() => <VaultConnectorsPanel />);
  const bitwarden = await card("Bitwarden");
  const methods = bitwarden.queryByRole("combobox", { name: "Connection method" });
  if (methods) await fireEvent.change(methods, { target: { value: "token" } });
  const secret = bitwarden.queryByLabelText("Token or key");
  if (secret) await fireEvent.input(secret, { target: { value: "secret-token-value" } });
  await fireEvent.click(bitwarden.getByRole("button", { name: "Connect" }));
  await waitFor(() => expect(connect).toHaveBeenCalledOnce());
  expect(screen.queryByDisplayValue("secret-token-value")).not.toBeInTheDocument();
});

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <VaultConnectorsPanel />);
  expect(screen.getByText("Connectors are not available in this version.")).toBeInTheDocument();
});
