// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@paperclipai/shared";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/queryKeys";
import { projectsApi } from "@/api/projects";
import { ProjectGitAuthorization } from "./ProjectGitAuthorization";

vi.mock("@/api/projects", () => ({
  projectsApi: {
    gitAuthorization: vi.fn(),
    setGitAuthorization: vi.fn(),
  },
}));
vi.mock("@/features/connections/ConnectionSetupFlow", () => ({
  ConnectionSetupFlow: ({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) =>
    <div><button onClick={onComplete}>Finish connection</button><button onClick={onCancel}>Cancel connection</button></div>,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ProjectGitAuthorization", () => {
  it("explains standing credential consent and revokes without retaining task context", async () => {
    const saved = {
      grantId: "grant-a",
      authorizedByUserId: "user-a",
      options: [
        {
          grantId: "grant-a",
          connectionName: "Work GitHub",
          login: "fixture-login",
        },
      ],
    };
    vi.mocked(projectsApi.gitAuthorization).mockResolvedValue(saved);
    vi.mocked(projectsApi.setGitAuthorization).mockResolvedValue({
      ...saved,
      grantId: null,
      authorizedByUserId: null,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(queryKeys.projects.gitAuthorization("project-a"), saved);
    const container = document.createElement("div"),
      root = createRoot(container);
    document.body.appendChild(container);
    try {
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <ProjectGitAuthorization project={{ id: "project-a", companyId: "company-a" } as Project} />
          </QueryClientProvider>,
        ),
      );
      expect(container.textContent).toContain("existing GitHub permissions");
      expect(container.textContent).toContain("Project repository editors can add repositories covered by this connection");
      expect(container.textContent).toContain("Manage repository access in the GitHub connection");
      expect(container.textContent).toContain("Task runs continue to use their own identity");
      expect(container.textContent).toContain("fixture-login");
      const authorize = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Authorize project",
      )!;
      expect(authorize.disabled).toBe(true);
      const revoke = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Revoke authorization",
      )!;
      await act(async () => {
        revoke.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(projectsApi.setGitAuthorization).toHaveBeenCalledWith("project-a", null);
      expect(client.getQueryData(queryKeys.projects.gitAuthorization("project-a"))).toMatchObject({
        grantId: null,
      });
      expect(container.textContent).not.toContain("Revoke authorization");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      client.clear();
    }
  });
});


it("connects GitHub from an empty account list and refreshes authorization choices", async () => {
  const empty = { grantId: null, authorizedByUserId: null, options: [] };
  vi.mocked(projectsApi.gitAuthorization).mockResolvedValue(empty);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const container = document.createElement("div"), root = createRoot(container);
  document.body.appendChild(container);
  const settle = () => new Promise(resolve => setTimeout(resolve, 20));
  try {
    await act(async () => { root.render(<QueryClientProvider client={client}><ProjectGitAuthorization project={{ id: "p", companyId: "c" } as Project} /></QueryClientProvider>); });
    await act(async () => { await settle(); });
    const connect = [...container.querySelectorAll("button")].find(b => b.textContent === "Connect GitHub")!;
    expect(connect).toBeDefined();
    await act(async () => { connect.click(); });
    expect(container.textContent).toContain("Finish connection");
    const added = { ...empty, options: [{ grantId: "new", login: "my-account", connectionName: "Personal" }] };
    vi.mocked(projectsApi.gitAuthorization).mockResolvedValue(added);
    await act(async () => {
      [...container.querySelectorAll("button")].find(b => b.textContent === "Finish connection")!.click();
      await settle();
    });
    await act(async () => { await settle(); });
    expect(container.textContent).toContain("Connect another GitHub account");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.projects.gitAuthorization("p") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["project-repositories", "c"] });
    expect(client.getQueryData(queryKeys.projects.gitAuthorization("p"))).toEqual(added);
  } finally { await act(async () => root.unmount()); container.remove(); client.clear(); }
});

it("offers retry when authorization lookup fails", async () => {
  vi.mocked(projectsApi.gitAuthorization).mockRejectedValueOnce(new Error("Temporary connection failure"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div"), root = createRoot(container);
  document.body.appendChild(container);
  try {
    await act(async () => { root.render(<QueryClientProvider client={client}><ProjectGitAuthorization project={{ id: "retry", companyId: "c" } as Project} /></QueryClientProvider>); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Temporary connection failure");
    vi.mocked(projectsApi.gitAuthorization).mockResolvedValue({ grantId: null, authorizedByUserId: null, options: [] });
    await act(async () => {
      [...container.querySelectorAll("button")].find(b => b.textContent === "Try again")!.click();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Connect GitHub");
  } finally { await act(async () => root.unmount()); container.remove(); client.clear(); }
});
