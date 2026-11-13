import type { AgentApproval, ApprovalRule } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { alwaysAllowChoice, commandPrefixes, commandWords } from "../always-allow";
import { AlwaysAllowPanel } from "./AlwaysAllowPanel";
import { ApprovalRulesList } from "./ApprovalRulesSettings";
import { ApprovalCard } from "./ConversationPrompts";

function approval(overrides: Partial<AgentApproval> = {}): AgentApproval {
  return {
    requestId: 1,
    botId: "chief",
    threadId: "t",
    turnId: "u",
    kind: "command",
    command: "git status --short",
    cwd: null,
    reason: null,
    grantRoot: null,
    permissions: null,
    ...overrides,
  };
}

describe("always-allow choices", () => {
  it("splits a command into words and keeps a quoted part together", () => {
    expect(commandWords('"C:\\Program Files\\Git\\bin\\git.exe" status')).toEqual([
      '"C:\\Program Files\\Git\\bin\\git.exe"',
      "status",
    ]);
    expect(commandWords('git commit -m "a b')).toBeNull();
  });

  it("offers two words and up, ending with the whole command", () => {
    expect(commandPrefixes("git status --short")).toEqual(["git status", "git status --short"]);
    expect(commandPrefixes("ls")).toEqual(["ls"]);
    expect(commandPrefixes('git commit -m "a b')).toEqual([]);
  });

  it("offers a rule for a plain command, a named folder and read-only permissions", () => {
    expect(alwaysAllowChoice(approval())).toMatchObject({ available: true, kind: "command" });
    expect(alwaysAllowChoice(approval({ kind: "file-change", command: null, grantRoot: "C:\\work" }))).toEqual({
      available: true,
      kind: "file-change",
      folder: "C:\\work",
    });
    expect(
      alwaysAllowChoice(
        approval({
          kind: "permissions",
          command: null,
          permissions: { fileSystem: { read: ["C:\\work"], write: [] }, network: false },
        }),
      ),
    ).toEqual({ available: true, kind: "permissions", writes: false });
  });

  it("says why it cannot for a chained command, an unnamed folder, network and agent eyes", () => {
    expect(alwaysAllowChoice(approval({ command: "git status; rm x" }))).toMatchObject({
      available: false,
      reason: expect.stringMatching(/chains or redirects/),
    });
    expect(alwaysAllowChoice(approval({ kind: "file-change", command: null }))).toMatchObject({ available: false });
    expect(
      alwaysAllowChoice(
        approval({
          kind: "permissions",
          command: null,
          permissions: { fileSystem: { read: ["C:\\work"], write: [] }, network: true },
        }),
      ),
    ).toMatchObject({ available: false, reason: expect.stringMatching(/Network/) });
    expect(alwaysAllowChoice(approval({ kind: "screen" }))).toMatchObject({ available: false });
    expect(alwaysAllowChoice(approval({ kind: "camera" }))).toMatchObject({ available: false });
  });
});

describe("AlwaysAllowPanel", () => {
  it("opens, lets the person pick the words and confirms with that scope", async () => {
    const onConfirm = vi.fn();
    render(() => <AlwaysAllowPanel approval={approval()} busy={false} onConfirm={onConfirm} />);
    await fireEvent.click(screen.getByRole("button", { name: "Always allow…" }));
    expect(screen.getByText(/never covers Computer Use, the Vault, payments/)).toBeInTheDocument();
    await fireEvent.change(screen.getByRole("combobox"), { target: { value: "git status" } });
    await fireEvent.click(screen.getByRole("button", { name: "Always allow" }));
    expect(onConfirm).toHaveBeenCalledWith({ prefix: "git status" });
  });

  it("defaults to the whole command and can be cancelled", async () => {
    const onConfirm = vi.fn();
    render(() => <AlwaysAllowPanel approval={approval()} busy={false} onConfirm={onConfirm} />);
    await fireEvent.click(screen.getByRole("button", { name: "Always allow…" }));
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Always allow…" })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Always allow…" }));
    await fireEvent.click(screen.getByRole("button", { name: "Always allow" }));
    expect(onConfirm).toHaveBeenCalledWith({ prefix: "git status --short" });
  });

  it("shows the folder for a file change and sends an empty scope", async () => {
    const onConfirm = vi.fn();
    render(() => (
      <AlwaysAllowPanel
        approval={approval({ kind: "file-change", command: null, grantRoot: "C:\\work\\app" })}
        busy={false}
        onConfirm={onConfirm}
      />
    ));
    await fireEvent.click(screen.getByRole("button", { name: "Always allow…" }));
    expect(screen.getByText("C:\\work\\app")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Always allow" }));
    expect(onConfirm).toHaveBeenCalledWith({});
  });

  it("shows only the reason, with no button, when it cannot be remembered", () => {
    render(() => <AlwaysAllowPanel approval={approval({ command: "a | b" })} busy={false} onConfirm={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Always allow…" })).toBeNull();
    expect(screen.getByText(/Only once: A command that chains/)).toBeInTheDocument();
  });
});

describe("ApprovalCard with Always allow", () => {
  it("offers it only when the caller handles it, and sends the scope with Allow", async () => {
    const onAlways = vi.fn(async () => true);
    const { unmount } = render(() => (
      <ApprovalCard
        variant="approval"
        approval={approval()}
        onApprove={vi.fn(async () => true)}
        onReject={vi.fn(async () => true)}
      />
    ));
    expect(screen.queryByRole("button", { name: "Always allow…" })).toBeNull();
    unmount();

    render(() => (
      <ApprovalCard
        variant="approval"
        approval={approval()}
        onApprove={vi.fn(async () => true)}
        onReject={vi.fn(async () => true)}
        onAlways={onAlways}
      />
    ));
    await fireEvent.click(screen.getByRole("button", { name: "Always allow…" }));
    await fireEvent.click(screen.getByRole("button", { name: "Always allow" }));
    expect(onAlways).toHaveBeenCalledWith({ prefix: "git status --short" });
  });

  it("never offers it for agent eyes (screen, camera)", () => {
    render(() => (
      <ApprovalCard
        variant="approval"
        approval={approval({ kind: "camera", command: null })}
        onApprove={vi.fn(async () => true)}
        onReject={vi.fn(async () => true)}
        onAlways={vi.fn(async () => true)}
      />
    ));
    expect(screen.queryByRole("button", { name: "Always allow…" })).toBeNull();
    expect(screen.queryByText(/Only once/)).toBeNull();
  });
});

describe("ApprovalRulesList", () => {
  const rule: ApprovalRule = {
    id: "r1",
    botId: "chief",
    createdAt: "2026-11-13T10:00:00.000Z",
    lastUsedAt: "2026-11-13T11:00:00.000Z",
    uses: 3,
    kind: "command",
    prefix: "git status",
  };

  it("says when nothing is allowed for good and what rules never cover", () => {
    render(() => <ApprovalRulesList rules={[]} error="" busy={false} onRevoke={vi.fn()} />);
    expect(screen.getByText(/Nothing is allowed for good/)).toBeInTheDocument();
    expect(screen.getByText(/never cover Computer Use, the Vault/)).toBeInTheDocument();
  });

  it("lists a rule with its use and removes it", async () => {
    const onRevoke = vi.fn();
    render(() => <ApprovalRulesList rules={[rule]} error="" busy={false} onRevoke={onRevoke} />);
    expect(screen.getByText("Commands that start with “git status”")).toBeInTheDocument();
    expect(screen.getByText(/Used 3 times/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: /Remove rule: Commands that start with/ }));
    expect(onRevoke).toHaveBeenCalledWith("r1");
  });

  it("shows an error", () => {
    render(() => <ApprovalRulesList rules={[]} error="Could not remove the rule." busy={false} onRevoke={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not remove the rule.");
  });
});
