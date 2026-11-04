// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewProjectDialog } from "./NewProjectDialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemoryRouter, useLocation } from "react-router-dom";
import { act as reactAct } from "react";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function act(callback: () => void) {
  flushSync(() => {
    callback();
  });
}

vi.mock("../api/projects", () => ({ projectsApi: {
  create: vi.fn(),
  repositoryOptions: vi.fn().mockResolvedValue({ repositories: [], connectionCount: 0, failedConnectionCount: 0 }),
} }));
vi.mock("../api/goals", () => ({ goalsApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("../api/agents", () => ({ agentsApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("../api/access", () => ({ accessApi: { listUserDirectory: vi.fn().mockResolvedValue({ users: [] }) } }));
vi.mock("../api/assets", () => ({ assetsApi: { uploadImage: vi.fn() } }));
vi.mock("../api/instanceSettings", () => ({ instanceSettingsApi: { getExperimental: vi.fn().mockResolvedValue({}) } }));

vi.mock("../context/DialogContext", () => ({
  useDialog: () => ({ newProjectOpen: true, closeNewProject: vi.fn() }),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: "company-1",
    selectedCompany: { id: "company-1", name: "Paperclip", issuePrefix: "COS" },
  }),
}));

vi.mock("./MarkdownEditor", () => ({
  MarkdownEditor: () => <div data-testid="markdown-editor" />,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

/** Pass `null` for `experimentalSettings` to render with the policy unresolved. */
function LocationProbe() { return <output data-testid="location">{useLocation().pathname}</output>; }

function render(experimentalSettings: Record<string, unknown> | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (experimentalSettings) {
    client.setQueryData(queryKeys.instance.experimentalSettings, experimentalSettings);
  }
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter><NewProjectDialog /><LocationProbe /></MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );
  });
}

/** The dialog renders into a portal, so assertions read the whole document. */
function documentText() {
  return document.body.textContent ?? "";
}

function localPathInput() {
  return document.body.querySelector('input[placeholder="/absolute/path/to/workspace"]');
}

describe("NewProjectDialog — source repositories across host policies", () => {
  it("opens the created project's conversation with the company prefix", async () => {
    vi.mocked(projectsApi.create).mockResolvedValueOnce({ id: "created-project" } as never);
    render({});
    await reactAct(async () => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Project name"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "New project");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await reactAct(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(document.querySelector('[data-testid="location"]')?.textContent).toBe("/COS/projects/created-project/conversation");
  });
  it.each([
    ["policy off", {}],
    ["policy unresolved", null],
    ["managed sandbox only", { enableManagedSandboxOnly: true }],
  ] as const)("offers the simplified project form with %s", (_label, settings) => {
    render(settings);

    expect(documentText()).toContain("Source repos");
    expect(documentText()).toContain("Add GitHub repo");
    expect(documentText()).not.toContain("Repo URL");
    expect(documentText()).not.toContain("Local folder");
    expect(localPathInput()).toBeNull();
    expect(document.body.querySelector('input[placeholder="Project name"]')).not.toBeNull();
    const chooseButtons = Array.from(document.body.querySelectorAll("button")).filter(
      (button) => button.textContent?.trim() === "Choose",
    );
    expect(chooseButtons).toHaveLength(0);
  });
});
