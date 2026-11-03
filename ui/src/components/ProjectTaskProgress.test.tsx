import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Issue, IssueStatus } from "@paperclipai/shared";
import { ProjectTaskProgress } from "./ProjectTaskProgress";

const issue = (status: IssueStatus) => ({ status }) as Issue;

describe("ProjectTaskProgress", () => {
  it("reports recorded task statuses and excludes cancelled tasks", () => {
    const html = renderToStaticMarkup(<ProjectTaskProgress showAgentCreatedTasks={false} issues={[
      issue("done"), issue("in_progress"), issue("in_review"), issue("blocked"),
      issue("backlog"), issue("todo"), issue("cancelled"),
    ]} />);
    expect(html).toContain("1 of 6 completed");
    expect(html).toContain('value="1" max="6"');
    expect(html).toMatch(/Blocked:.*?>1</);
    expect(html).toMatch(/Waiting:.*?>2</);
    expect(html).toContain("Agent-created tasks are hidden.");
  });

  it("does not report a completion percentage for an empty or cancelled-only set", () => {
    expect(renderToStaticMarkup(<ProjectTaskProgress showAgentCreatedTasks issues={[]} />)).toBe("");
    expect(renderToStaticMarkup(<ProjectTaskProgress showAgentCreatedTasks issues={[issue("cancelled")]} />)).toBe("");
  });

  it("does not claim agent-created tasks are hidden when included", () => {
    const html = renderToStaticMarkup(<ProjectTaskProgress showAgentCreatedTasks issues={[issue("done")]} />);
    expect(html).toContain("1 of 1 completed");
    expect(html).not.toContain("Agent-created tasks are hidden.");
  });
});
