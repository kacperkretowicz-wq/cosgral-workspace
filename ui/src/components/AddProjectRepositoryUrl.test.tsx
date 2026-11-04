// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@paperclipai/shared";
import { expect, it, vi } from "vitest";
import { projectsApi } from "@/api/projects";
import { AddProjectRepositoryUrl } from "./AddProjectRepositoryUrl";

vi.mock("@/api/projects", () => ({ projectsApi: { createWorkspace: vi.fn() } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps a rejected URL for correction and refreshes the project after adding it", async () => {
  vi.mocked(projectsApi.createWorkspace).mockRejectedValueOnce(new Error("Access denied"))
    .mockResolvedValueOnce({ id: "workspace" } as never);
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}>
      <AddProjectRepositoryUrl project={{ id: "project", urlKey: "project-key", companyId: "company" } as Project} />
    </QueryClientProvider>));
    const input = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "https://github.com/example/repo");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = async () => {
      await act(async () => {
        host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 20));
      });
    };
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Access denied");
    expect(input.value).toBe("https://github.com/example/repo");
    await submit();
    expect(projectsApi.createWorkspace).toHaveBeenLastCalledWith("project", {
      sourceType: "git_repo", repoUrl: "https://github.com/example/repo",
    }, "company");
    expect(input.value).toBe("");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Repository added");
    expect(invalidate).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
  }
});
