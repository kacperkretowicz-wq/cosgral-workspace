import type { AgentEvent } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { createMockBrowserProfiles } from "../../stories/mock-browser-profiles";
import { createMockIsolation, demoAvailability } from "../../stories/mock-isolation";
import { setLanguage } from "../i18n";
import { BrowserProfileSettings } from "./BrowserProfileSettings";
import { IsolationSettings } from "./IsolationSettings";

describe("W8 isolation and browser settings", () => {
  it("updates the switch only after the approval event", async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const api = createMockIsolation((event) => listener?.(event), { demo: { name: "Demo", ownProcesses: true } });
    render(() => (
      <IsolationSettings
        botId="demo"
        api={api}
        onEvent={(handler) => {
          listener = handler;
          return () => {
            listener = undefined;
          };
        }}
      />
    ));
    const toggle = await screen.findByRole("switch");
    fireEvent.click(toggle);
    await screen.findByText(/Approval requested in Needs you/);
    const request = api.pendingOffs()[0];
    if (!request) throw new Error("Expected isolation approval");
    api.allowOff(request.requestId);
    await waitFor(() => expect(toggle).not.toBeChecked());
    await screen.findByText("Isolation: off");
  });
  it("shows unavailable isolation and the reason without widening access", async () => {
    const api = createMockIsolation(() => {});
    api.setAvailability({ ...demoAvailability(), jobObject: { ok: false, reason: "Host blocked." } });
    render(() => <IsolationSettings botId="demo" api={api} onEvent={() => () => {}} />);
    await screen.findByText(/Host blocked/);
    await screen.findByText(/Process isolation is unavailable: file and shell tools below Full access are refused/);
  });
  it("names the isolation state in Polish instead of printing the raw state (seen in the real window)", async () => {
    setLanguage("pl");
    flush();
    try {
      const api = createMockIsolation(() => {});
      api.setAvailability({ ...demoAvailability(), jobObject: { ok: false, reason: "Host blocked." } });
      render(() => <IsolationSettings botId="demo" api={api} onEvent={() => () => {}} />);
      await screen.findByText("Izolacja: niedostępna");
      await screen.findByText(/Izolacja procesów jest niedostępna/);
      expect(screen.queryByText(/unavailable|izolacja-niedostępna/)).not.toBeInTheDocument();
    } finally {
      setLanguage("en");
      flush();
    }
  });
  it("requests approval without switching isolation off", async () => {
    const api = createMockIsolation(() => {}, { demo: { name: "Demo", ownProcesses: true } });
    render(() => <IsolationSettings botId="demo" api={api} onEvent={() => () => {}} />);
    const toggle = await screen.findByRole("switch");
    fireEvent.click(toggle);
    await screen.findByText(/Approval requested in Needs you/);
    expect(toggle).toBeChecked();
    expect(api.pendingOffs()).toHaveLength(1);
  });
  it("describes the shared Codex process honestly", async () => {
    const api = createMockIsolation(() => {}, { demo: { name: "Demo", ownProcesses: false } });
    render(() => <IsolationSettings botId="demo" api={api} onEvent={() => () => {}} />);
    await screen.findByText("Codex: one shared process, not isolated per agent");
  });
  it("requires a second action before clearing and keeps domain rules", async () => {
    const api = createMockBrowserProfiles(() => {});
    await api.setDomains({ botId: "demo", allow: ["example.com"], block: [] });
    render(() => <BrowserProfileSettings botId="demo" api={api} onEvent={() => () => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear browser data" }));
    expect((await api.describe({ botId: "demo" })).clearedAt).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm clear browser data" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Clear browser data" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm clear browser data" }));
    await screen.findByText(/Browser data cleared for this agent/);
    expect((await api.describe({ botId: "demo" })).domains.allow).toEqual(["example.com"]);
  });
  it("validates domains before saving", async () => {
    const api = createMockBrowserProfiles(() => {});
    render(() => <BrowserProfileSettings botId="demo" api={api} onEvent={() => () => {}} />);
    const input = await screen.findByLabelText("Blocked domains");
    fireEvent.input(input, { target: { value: "not a domain" } });
    await waitFor(() => expect(input).toHaveValue("not a domain"));
    const form = screen.getByRole("button", { name: "Save domain rules" }).closest("form");
    if (!form) throw new Error("Expected domain rules form");
    fireEvent.submit(form);
    await screen.findByRole("alert");
    expect((await api.describe({ botId: "demo" })).domains.block).toEqual([]);
  });
});
