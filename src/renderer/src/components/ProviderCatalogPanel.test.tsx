import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockProviderCatalog } from "../../stories/mock-provider-catalog";
import { ProviderCatalogPanel } from "./ProviderCatalogPanel";

let mock = createMockProviderCatalog(() => undefined);
let emit: (event: AgentEvent) => void = () => undefined;

beforeEach(() => {
  mock = createMockProviderCatalog((event) => emit(event));
  Object.assign(window, {
    openbot: {
      providerCatalog: mock,
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
  if (!(row instanceof HTMLElement)) throw new Error("no provider card");
  return within(row);
};

it("lists the providers of the catalog", async () => {
  render(() => <ProviderCatalogPanel />);
  expect(await screen.findAllByRole("listitem")).not.toHaveLength(0);
});

it("adds a key to a provider that takes keys and never shows it again", async () => {
  const add = vi.spyOn(mock, "addKey");
  render(() => <ProviderCatalogPanel />);
  const grok = await card("Grok");
  await fireEvent.input(grok.getByLabelText(/API key/), { target: { value: "sk-secret-value-123" } });
  await fireEvent.click(grok.getByRole("button", { name: "Add key" }));
  await waitFor(() => expect(add).toHaveBeenCalledOnce());
  expect(screen.queryByDisplayValue("sk-secret-value-123")).not.toBeInTheDocument();
});

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <ProviderCatalogPanel />);
  expect(screen.getByText("The catalog is not available in this version.")).toBeInTheDocument();
});
