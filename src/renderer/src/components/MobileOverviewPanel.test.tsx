import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockMobileConnect, type MockMobileConnect } from "../../stories/mock-mobile-connect";
import { MobileOverviewPanel } from "./MobileOverviewPanel";

let mock: MockMobileConnect;
let listeners: Array<(event: AgentEvent) => void> = [];

function install(withApi = true) {
  Object.assign(window, {
    openbot: {
      mobileConnect: withApi ? mock : undefined,
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
  mock = createMockMobileConnect((event) => {
    for (const listener of listeners) listener(event);
  });
  install();
});
afterEach(cleanup);

const region = (name: string) => within(screen.getByRole("region", { name }));

it("shows the routes: the one in use, and the cloud one as not available with its reason", async () => {
  render(() => <MobileOverviewPanel />);
  const routes = await screen.findByRole("region", { name: "How phones reach this computer" });
  const list = within(routes);
  expect(list.getByText("Local network")).toBeInTheDocument();
  expect(list.getByText("In use")).toBeInTheDocument();
  expect(list.getByText("This computer only")).toBeInTheDocument();
  expect(list.getByText("Through the cloud")).toBeInTheDocument();
  expect(list.getByText("Not available")).toBeInTheDocument();
  expect(list.getByText(/It would route the conversation through a server\./)).toBeInTheDocument();
});

it("lists each phone with its PIN, lock and notifications", async () => {
  mock.simulate.pair("phone-2", "Galaxy (demo)");
  mock.phone.simulate.setPin("phone-2");
  mock.phone.simulate.allowNotifications("phone-2");
  render(() => <MobileOverviewPanel />);
  await screen.findByRole("region", { name: "Your phones" });
  const phones = region("Your phones");
  const galaxy = (await phones.findByText("Galaxy (demo)")).closest("li");
  if (!(galaxy instanceof HTMLElement)) throw new Error("no phone row");
  expect(within(galaxy).getByText("PIN set")).toBeInTheDocument();
  expect(within(galaxy).getByText("Locked")).toBeInTheDocument();
  expect(within(galaxy).getByText("Notifications on")).toBeInTheDocument();
  const pixel = phones.getByText("Pixel (demo)").closest("li");
  if (!(pixel instanceof HTMLElement)) throw new Error("no phone row");
  expect(within(pixel).getByText("No PIN")).toBeInTheDocument();
  expect(within(pixel).getByText("Notifications off")).toBeInTheDocument();
});

it("lists what this version does not offer, each with its reason", async () => {
  render(() => <MobileOverviewPanel />);
  await screen.findByRole("region", { name: "Not available in this version" });
  const list = region("Not available in this version");
  expect(list.getByText("Permanent link")).toBeInTheDocument();
  expect(list.getByText(/A link that never expires would let anyone who finds it into your agents\./)).toBeInTheDocument();
  expect(list.getAllByText("Not available").length).toBe(2);
});

it("reads the page again when a phone pairs or the route changes", async () => {
  const getOverview = vi.spyOn(mock, "getOverview");
  render(() => <MobileOverviewPanel />);
  await screen.findByRole("region", { name: "Your phones" });
  const before = getOverview.mock.calls.length;
  mock.simulate.pair("phone-3", "Moto (demo)");
  expect(await region("Your phones").findByText("Moto (demo)")).toBeInTheDocument();
  expect(getOverview.mock.calls.length).toBeGreaterThan(before);
  mock.simulate.setRoute("loopback");
  const routes = await screen.findByRole("region", { name: "How phones reach this computer" });
  expect(await within(routes).findByText("Only a browser on this computer can open the phone page.")).toBeInTheDocument();
});

it("shows an error with Retry when the page cannot be read, and nothing without the API", async () => {
  vi.spyOn(mock, "getOverview").mockRejectedValueOnce(new Error("The phone page is locked."));
  render(() => <MobileOverviewPanel />);
  expect(await screen.findByRole("alert")).toHaveTextContent("The phone page is locked.");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("region", { name: "Your phones" })).toBeInTheDocument();
  cleanup();
  install(false);
  render(() => <MobileOverviewPanel />);
  expect(screen.queryByRole("region", { name: "Your phones" })).not.toBeInTheDocument();
});

it("says there are no phones when none is paired", async () => {
  const getOverview = vi.spyOn(mock, "getOverview");
  const real = await mock.getOverview();
  getOverview.mockResolvedValue({ ...real, phones: [] });
  render(() => <MobileOverviewPanel />);
  expect(await screen.findByText(/No phones yet\./)).toBeInTheDocument();
});
