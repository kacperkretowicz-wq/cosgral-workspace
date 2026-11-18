import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockMcpOAuth } from "../../stories/mock-mcp-oauth";
import { McpSignInPanel } from "./McpSignInPanel";

let mock = createMockMcpOAuth(() => undefined);
let emit: (event: AgentEvent) => void = () => undefined;

function install(withApi = true) {
  Object.assign(window, {
    openbot: {
      mcpOAuth: withApi ? mock : undefined,
      agent: {
        onEvent: (listener: (event: AgentEvent) => void) => {
          emit = listener;
          return () => undefined;
        },
      },
    },
  });
}

beforeEach(() => {
  mock = createMockMcpOAuth((event) => emit(event));
  install();
});
afterEach(cleanup);

/** The card is drawn again when its status changes, so look it up each time. */
const card = (name: string) => {
  const row = screen.getByText(name).closest("li");
  if (!(row instanceof HTMLElement)) throw new Error("no server card");
  return within(row);
};
const button = (name: string, label: string) => card(name).getByRole("button", { name: label });
const ready = (name: string, label: string) => waitFor(() => expect(button(name, label)).toBeEnabled());

it("lists the servers that sign in over the web, signed out", async () => {
  render(() => <McpSignInPanel />);
  expect(await screen.findByText("p_demo_docs")).toBeInTheDocument();
  expect(screen.getByText("p_demo_board")).toBeInTheDocument();
  expect(screen.getAllByText("Signed out")).toHaveLength(2);
});

it("signs in: waits for the browser, can be cancelled, and ends signed in by itself", async () => {
  render(() => <McpSignInPanel />);
  await screen.findByText("p_demo_docs");
  fireEvent.click(button("p_demo_docs", "Sign in"));
  await waitFor(() => expect(card("p_demo_docs").getByText("Waiting for the browser")).toBeInTheDocument());
  expect(
    card("p_demo_docs").getByText("Finish the sign-in in the browser. The program waits 5 minutes."),
  ).toBeInTheDocument();

  await ready("p_demo_docs", "Cancel");
  fireEvent.click(button("p_demo_docs", "Cancel"));
  await waitFor(() => expect(card("p_demo_docs").getByText("Signed out")).toBeInTheDocument());

  await ready("p_demo_docs", "Sign in");
  fireEvent.click(button("p_demo_docs", "Sign in"));
  await waitFor(() => expect(card("p_demo_docs").getByText("Waiting for the browser")).toBeInTheDocument());
  mock.simulate.approved("demo-docs");
  await waitFor(() => expect(card("p_demo_docs").getByText("Signed in")).toBeInTheDocument());
  expect(button("p_demo_docs", "Sign out")).toBeInTheDocument();
  expect(button("p_demo_docs", "Sign in again")).toBeInTheDocument();
  expect(card("p_demo_docs").getByText(/renewed by itself/)).toBeInTheDocument();
});

it("a refused sign-in shows the fixed sentence, not the server's text, and offers Try again", async () => {
  render(() => <McpSignInPanel />);
  await screen.findByText("p_demo_board");
  fireEvent.click(button("p_demo_board", "Sign in"));
  await waitFor(() => expect(card("p_demo_board").getByText("Waiting for the browser")).toBeInTheDocument());
  mock.simulate.denied("demo-board");
  await waitFor(() => expect(card("p_demo_board").getByText("Sign-in failed")).toBeInTheDocument());
  expect(card("p_demo_board").getByRole("alert")).toHaveTextContent("The sign-in was refused on the service's page.");
  expect(button("p_demo_board", "Try again")).toBeInTheDocument();
});

it("signs out of a signed-in server", async () => {
  render(() => <McpSignInPanel />);
  await screen.findByText("p_demo_docs");
  fireEvent.click(button("p_demo_docs", "Sign in"));
  await waitFor(() => expect(card("p_demo_docs").getByText("Waiting for the browser")).toBeInTheDocument());
  mock.simulate.approved("demo-docs");
  await waitFor(() => expect(card("p_demo_docs").getByText("Signed in")).toBeInTheDocument());
  const spy = vi.spyOn(mock, "signOut");
  await ready("p_demo_docs", "Sign out");
  fireEvent.click(button("p_demo_docs", "Sign out"));
  await waitFor(() => expect(spy).toHaveBeenCalledWith({ serverId: "demo-docs" }));
  await waitFor(() => expect(card("p_demo_docs").getByText("Signed out")).toBeInTheDocument());
});

it("shows an error with Retry when the sign-ins cannot be read", async () => {
  const spy = vi.spyOn(mock, "list").mockRejectedValueOnce(new Error("The sign-ins are locked."));
  render(() => <McpSignInPanel />);
  expect(await screen.findByRole("alert")).toHaveTextContent("The sign-ins are locked.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("p_demo_docs")).toBeInTheDocument();
  expect(spy).toHaveBeenCalledTimes(2);
});

it("shows nothing when this build has no MCP sign-in", () => {
  install(false);
  const { container } = render(() => <McpSignInPanel />);
  expect(container).toBeEmptyDOMElement();
});
