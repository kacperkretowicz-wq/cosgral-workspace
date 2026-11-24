import { render } from "@solidjs/testing-library";
import { expect, it } from "vitest";
import type { SidebarAgentState } from "../../row-activity";
import { SidebarAgentIndicator } from "./SidebarAgentIndicator";

function mark(state: SidebarAgentState): HTMLElement {
  const view = render(() => <SidebarAgentIndicator state={state} />);
  const element = view.container.querySelector<HTMLElement>(".bot-row-agent-status");
  if (!element) throw new Error("The status mark did not render.");
  return element;
}

it("names the kind of state in the class, so the row styles it", () => {
  expect(mark({ kind: "responded" })).toHaveClass("bot-row-agent-status-responded");
});

it("shows the unread count and nothing else for unread", () => {
  const element = mark({ kind: "unread", count: 7 });
  expect(element).toHaveTextContent("7");
  expect(element.querySelector("svg")).toBeNull();
});

it("draws a titled icon for limit, error and responded", () => {
  expect(mark({ kind: "limited", resetsAt: null }).querySelector("title")?.textContent).toBe("Limit");
  expect(mark({ kind: "error", message: "boom" }).querySelector("title")?.textContent).toBe("Error");
  expect(mark({ kind: "responded" }).querySelector("title")?.textContent).toBe("Responded");
});

it("shows a dot for needs-you and hides the whole mark from assistive tech", () => {
  const element = mark({ kind: "needs-you" });
  expect(element.querySelector(".bot-row-needs-you-dot")).not.toBeNull();
  expect(element).toHaveAttribute("aria-hidden", "true");
});
