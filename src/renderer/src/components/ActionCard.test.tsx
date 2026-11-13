import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { ActionCard } from "./ActionCard";

describe("ActionCard", () => {
  it("shows the exact draft and submits an edited version without sending it", async () => {
    const respond = vi.fn().mockResolvedValue(undefined);
    render(() => (
      <ActionCard
        card={{
          kind: "draft-preview",
          requestId: "d",
          botId: "b",
          createdAt: "now",
          card: {
            requestId: "d",
            botId: "b",
            threadId: "t",
            turnId: "1",
            variant: "draft",
            title: "Send?",
            recipient: "Alex",
            channel: "email",
            preview: "Hello",
            draftId: null,
            createdAt: "now",
          },
        }}
        onDraft={respond}
        onTakeover={vi.fn()}
      />
    ));
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await fireEvent.input(screen.getByLabelText("Draft text"), { target: { value: "Hello again" } });
    await fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
    expect(respond).toHaveBeenCalledWith({ requestId: "d", decision: "edit", text: "Hello again" });
  });
  it("uses the confirm labels and keeps the draft when cancelled", async () => {
    const respond = vi.fn().mockResolvedValue(undefined);
    render(() => (
      <ActionCard
        card={{
          kind: "draft-preview",
          requestId: "d",
          botId: "b",
          createdAt: "now",
          card: {
            requestId: "d",
            botId: "b",
            threadId: "t",
            turnId: "1",
            variant: "confirm",
            title: "Confirm?",
            recipient: null,
            channel: null,
            preview: "Pay",
            draftId: null,
            createdAt: "now",
          },
        }}
        onDraft={respond}
        onTakeover={vi.fn()}
      />
    ));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(respond).toHaveBeenCalledWith({ requestId: "d", decision: "keep-draft" });
  });
  it("returns an already taken over browser tab", async () => {
    const respond = vi.fn().mockResolvedValue(undefined);
    render(() => (
      <ActionCard
        card={{
          kind: "browser-takeover",
          requestId: "b",
          botId: "b",
          createdAt: "now",
          phase: "taken-over",
          request: {
            requestId: "b",
            botId: "b",
            threadId: "t",
            turnId: "1",
            tabId: "tab",
            reason: "Sign in",
            url: "https://example.com",
            createdAt: "now",
          },
        }}
        onDraft={vi.fn()}
        onTakeover={respond}
      />
    ));
    await fireEvent.click(screen.getByRole("button", { name: "Return to agent" }));
    expect(respond).toHaveBeenCalledWith({ requestId: "b", action: "return" });
  });
});
