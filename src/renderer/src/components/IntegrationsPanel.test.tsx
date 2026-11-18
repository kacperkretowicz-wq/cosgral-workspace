import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockIntegrations, type MockIntegrations } from "../../stories/mock-integrations";
import { IntegrationsPanel } from "./IntegrationsPanel";

let mock: MockIntegrations;
let listeners: Array<(event: AgentEvent) => void> = [];

function install(withApi = true) {
  Object.assign(window, {
    openbot: {
      integrations: withApi ? mock : undefined,
      agent: {
        onEvent: (listener: (event: AgentEvent) => void) => {
          listeners.push(listener);
          return () => {
            listeners = listeners.filter((item) => item !== listener);
          };
        },
      },
    },
  });
}

beforeEach(() => {
  listeners = [];
  mock = createMockIntegrations((event) => {
    for (const listener of listeners) listener(event);
  });
  install();
});
afterEach(cleanup);

const card = (title: string) => {
  const row = screen.getByText(title, { selector: "strong" }).closest("li");
  if (!(row instanceof HTMLElement)) throw new Error("no card");
  return within(row);
};

async function saveClient(service: string, clientId: string) {
  await fireEvent.input(card(service).getByLabelText(`Client id (${service})`), { target: { value: clientId } });
  await fireEvent.click(card(service).getByRole("button", { name: "Save the app" }));
  await waitFor(() => expect(card(service).getByText("Not connected")).toBeInTheDocument());
}

it("lists the four services; none can connect before its app is set up", async () => {
  render(() => <IntegrationsPanel />);
  expect(await screen.findByText("GitHub", { selector: "strong" })).toBeInTheDocument();
  for (const name of ["Google Workspace", "Notion", "Meta"]) {
    expect(screen.getByText(name, { selector: "strong" })).toBeInTheDocument();
  }
  expect(screen.getAllByText("App not set up").length).toBe(4);
  expect(card("GitHub").getByRole("button", { name: "Connect account" })).toBeDisabled();
});

it("shows the owner's steps and the callback address, and asks for a secret only where the service needs one", async () => {
  render(() => <IntegrationsPanel />);
  await screen.findByText("GitHub", { selector: "strong" });
  expect(card("GitHub").queryByLabelText("Client secret (GitHub)")).not.toBeInTheDocument();
  expect(card("Google Workspace").getByLabelText("Client secret (Google Workspace)")).toHaveAttribute("type", "password");
  expect(card("GitHub").getByText(/Register a GitHub App/)).toBeInTheDocument();
  expect(card("GitHub").getByText(/http:\/\/127\.0\.0\.1:/)).toBeInTheDocument();
});

it("saving the client id clears the secret field and makes Connect possible; the sign-in waits for the browser", async () => {
  render(() => <IntegrationsPanel />);
  await screen.findByText("Google Workspace", { selector: "strong" });
  await fireEvent.input(card("Google Workspace").getByLabelText("Client secret (Google Workspace)"), {
    target: { value: "very-secret" },
  });
  await saveClient("Google Workspace", "google-client-1");
  expect(card("Google Workspace").getByLabelText("Client secret (Google Workspace)")).toHaveValue("");
  await waitFor(() => expect(card("Google Workspace").getByRole("button", { name: "Connect account" })).toBeEnabled());
  await fireEvent.click(card("Google Workspace").getByRole("button", { name: "Connect account" }));
  expect(await card("Google Workspace").findByText("Waiting for the browser")).toBeInTheDocument();
  expect(card("Google Workspace").getByText("https://sign-in.example/google")).toBeInTheDocument();
  await fireEvent.click(card("Google Workspace").getByRole("button", { name: "Cancel" }));
  expect(await card("Google Workspace").findByText("Not connected")).toBeInTheDocument();
});

it("follows the browser coming back: connected with the MCP name, a refusal says why, an expired sign-in asks to sign in again", async () => {
  render(() => <IntegrationsPanel />);
  await screen.findByText("GitHub", { selector: "strong" });
  await saveClient("GitHub", "gh-client");
  await fireEvent.click(card("GitHub").getByRole("button", { name: "Connect account" }));
  await card("GitHub").findByText("Waiting for the browser");
  mock.simulate.complete("github");
  expect(await card("GitHub").findByText("Connected")).toBeInTheDocument();
  expect(card("GitHub").getByText(/MCP server “github”/)).toBeInTheDocument();
  mock.simulate.expire("github");
  expect(await card("GitHub").findByText("Sign in again", { selector: "span" })).toBeInTheDocument();
  expect(card("GitHub").getByText(/no longer accepts the saved sign-in/)).toBeInTheDocument();
  mock.simulate.fail("github", "The person said no.");
  expect(await card("GitHub").findByRole("alert")).toHaveTextContent("The person said no.");
});

it("Disconnect removes the sign-in and can forget the client id too", async () => {
  const disconnect = vi.spyOn(mock, "disconnect");
  render(() => <IntegrationsPanel />);
  await screen.findByText("GitHub", { selector: "strong" });
  await saveClient("GitHub", "gh-client");
  await fireEvent.click(card("GitHub").getByRole("button", { name: "Connect account" }));
  await card("GitHub").findByText("Waiting for the browser");
  mock.simulate.complete("github");
  await card("GitHub").findByText("Connected");
  await fireEvent.click(card("GitHub").getByRole("switch", { name: /forget the app's client id/ }));
  await fireEvent.click(card("GitHub").getByRole("button", { name: "Disconnect" }));
  await waitFor(() => expect(disconnect).toHaveBeenCalledWith({ service: "github", forgetClient: true }));
  expect(await card("GitHub").findByText("App not set up")).toBeInTheDocument();
});

it("shows an error with Retry when the list cannot be read, and nothing without the API", async () => {
  vi.spyOn(mock, "list").mockRejectedValueOnce(new Error("The list is locked."));
  render(() => <IntegrationsPanel />);
  expect(await screen.findByRole("alert")).toHaveTextContent("The list is locked.");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("GitHub", { selector: "strong" })).toBeInTheDocument();
  cleanup();
  install(false);
  render(() => <IntegrationsPanel />);
  expect(screen.queryByText("Connect accounts")).not.toBeInTheDocument();
});
