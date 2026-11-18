import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockEndpointsApi } from "../../stories/mock-endpoints-api";
import { EndpointsSection } from "./EndpointsSection";

// Test data only: no real key.
const KEY = "test-key-ui-endpoint-5678";

afterEach(() => vi.unstubAllGlobals());

function stub(api = createMockEndpointsApi(0)) {
  vi.stubGlobal("openbot", { endpoints: api, agent: { onEvent: () => () => {} } });
  return api;
}

async function openForm() {
  await fireEvent.click(await screen.findByRole("button", { name: "Add an endpoint" }));
  return screen.findByRole("form", { name: "Endpoint" });
}

describe("EndpointsSection", () => {
  it("renders nothing when this version has no endpoints API", () => {
    vi.stubGlobal("openbot", { agent: { onEvent: () => () => {} } });
    render(() => <EndpointsSection />);
    expect(screen.queryByRole("region", { name: "Own model endpoints" })).toBeNull();
  });

  it("offers hosted services (xAI, OpenRouter) that only fill the form", async () => {
    const api = stub();
    const check = vi.spyOn(api, "check");
    render(() => <EndpointsSection />);
    const form = await openForm();
    await fireEvent.click(within(form).getByRole("button", { name: "Use xAI (Grok)" }));
    expect(within(form).getByLabelText(/^Address/)).toHaveValue("https://api.x.ai/v1");
    expect(within(form).getByLabelText(/^Name/)).toHaveValue("xAI (Grok)");
    await fireEvent.click(within(form).getByRole("button", { name: "Use OpenRouter" }));
    expect(within(form).getByLabelText(/^Address/)).toHaveValue("https://openrouter.ai/api/v1");
    expect(within(form).getByText(/your messages go to another computer/)).toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();
  });

  it("fills the form from a preset and saves without contacting the server", async () => {
    const api = stub();
    const check = vi.spyOn(api, "check");
    render(() => <EndpointsSection />);
    expect(await screen.findByText("No endpoint is added.")).toBeInTheDocument();
    const form = await openForm();
    await fireEvent.click(within(form).getByRole("button", { name: "Use Ollama" }));
    expect(within(form).getByLabelText(/^Address/)).toHaveValue("http://127.0.0.1:11434/v1");
    expect(within(form).getByLabelText(/^Name/)).toHaveValue("Ollama");
    await fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    const list = await screen.findByRole("list", { name: "Endpoints" });
    expect(within(list).getByText("Not checked")).toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();
    // The model list comes only when the person asks.
    await fireEvent.click(within(list).getByRole("button", { name: "Check connection to Ollama" }));
    expect(await within(list).findByText("Reachable")).toBeInTheDocument();
    expect(within(list).getByText(/llama3:8b, qwen2\.5-coder:7b/)).toBeInTheDocument();
  });

  it("warns about a server on another computer while typing and refuses another scheme", async () => {
    stub();
    render(() => <EndpointsSection />);
    const form = await openForm();
    const address = within(form).getByLabelText(/^Address/);
    await fireEvent.input(address, { target: { value: "http://192.168.1.20:8080/v1" } });
    expect(await screen.findByText(/another computer.*not encrypted/)).toBeInTheDocument();
    await fireEvent.input(address, { target: { value: "ftp://192.168.1.20/v1" } });
    expect(await screen.findByText("Only http:// and https:// addresses are accepted.")).toBeInTheDocument();
    await fireEvent.input(address, { target: { value: "http://example.com/v1" } });
    expect(
      await screen.findByText(/Plain http:\/\/ is allowed only on this computer or a local network/),
    ).toBeInTheDocument();
  });

  it("takes the key in a password field, empties it after saving and never shows it", async () => {
    stub();
    render(() => <EndpointsSection />);
    const form = await openForm();
    await fireEvent.input(within(form).getByLabelText(/^Name/), { target: { value: "Guarded" } });
    await fireEvent.input(within(form).getByLabelText(/^Address/), { target: { value: "http://127.0.0.1:8080/v1" } });
    const key = within(form).getByLabelText(/^Key/);
    expect(key).toHaveAttribute("type", "password");
    await fireEvent.input(key, { target: { value: KEY } });
    await fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    const list = await screen.findByRole("list", { name: "Endpoints" });
    expect(within(list).getByText(/Key ••••5678/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(KEY);
    // Editing starts with an empty key field.
    await fireEvent.click(within(list).getByRole("button", { name: "Edit Guarded" }));
    const again = await screen.findByRole("form", { name: "Endpoint" });
    expect(within(again).getByLabelText(/^Key/)).toHaveValue("");
    expect(within(again).getByRole("switch", { name: "Remove the saved key" })).toBeInTheDocument();
  });

  it("shows a refused key and an unreachable server as states, with the reason", async () => {
    const api = stub();
    await api.save({
      label: "Keyed",
      kind: "openai-compatible",
      baseUrl: "http://127.0.0.1:1/v1",
      key: "bad-key-1234",
    });
    await api.save({ label: "Down", kind: "openai-compatible", baseUrl: "http://127.0.0.1:2/unreachable" });
    render(() => <EndpointsSection />);
    const list = await screen.findByRole("list", { name: "Endpoints" });
    await fireEvent.click(within(list).getByRole("button", { name: "Check connection to Keyed" }));
    expect(await within(list).findByText("Key refused")).toBeInTheDocument();
    await fireEvent.click(within(list).getByRole("button", { name: "Check connection to Down" }));
    expect(await within(list).findByText("Unreachable")).toBeInTheDocument();
    expect(within(list).getByText(/Could not reach the server/)).toBeInTheDocument();
  });

  it("asks before removing and says what happens to agents", async () => {
    const api = stub();
    await api.save({ label: "Gone", kind: "openai-compatible", baseUrl: "http://127.0.0.1:3/v1" });
    render(() => <EndpointsSection />);
    const list = await screen.findByRole("list", { name: "Endpoints" });
    await fireEvent.click(within(list).getByRole("button", { name: "Remove Gone" }));
    const confirm = await screen.findByRole("group", { name: "Confirm removing Gone" });
    expect(within(confirm).getByText(/agents set to one of its models get an error/)).toBeInTheDocument();
    await fireEvent.click(within(confirm).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("group", { name: "Confirm removing Gone" })).toBeNull();
    await fireEvent.click(within(list).getByRole("button", { name: "Remove Gone" }));
    await fireEvent.click(await screen.findByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(screen.getByText("No endpoint is added.")).toBeInTheDocument());
  });

  it("detects local servers and says so when nothing is found", async () => {
    const api = stub();
    render(() => <EndpointsSection />);
    await fireEvent.click(await screen.findByRole("button", { name: "Detect local servers" }));
    expect(await screen.findByText("Found: Ollama.")).toBeInTheDocument();
    vi.spyOn(api, "detectLocal").mockResolvedValue([]);
    await fireEvent.click(screen.getByRole("button", { name: "Detect local servers" }));
    expect(await screen.findByText(/Nothing found on this computer/)).toBeInTheDocument();
  });
});
