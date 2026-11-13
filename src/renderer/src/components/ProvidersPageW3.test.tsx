import type { AcpAgentConfig, AgentModelId, BotSummary, ProviderUsage } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import {
  AcpAgentsSection,
  FallbackInUse,
  type FallbackModelOption,
  FallbackOrder,
  formatResetTime,
  moveItem,
  ProviderUsageList,
  validateAcpAgentDraft,
} from "./ProvidersPage";

const OPTIONS: FallbackModelOption[] = [
  { id: "gpt-5.6-luna", name: "Luna" },
  { id: "gpt-5.6-terra", name: "Terra" },
  { id: "claude-sonnet-5", name: "Sonnet" },
  { id: "claude-opus-5", name: "Opus" },
  { id: "claude-fable-5", name: "Fable" },
];

const ACP: AcpAgentConfig = {
  id: "demo-agent",
  name: "Demo agent",
  command: "demo-acp",
  args: ["--stdio"],
  createdAt: "2026-11-13T10:00:00.000Z",
  updatedAt: "2026-11-13T10:00:00.000Z",
};

describe("providers helpers", () => {
  it("moves an item and ignores impossible moves", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], -1, 0)).toEqual(["a", "b"]);
  });

  it("validates the ACP form like the contract does", () => {
    expect(validateAcpAgentDraft({ id: "", name: "", command: "", args: "" }, [])).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      command: expect.any(String),
    });
    expect(validateAcpAgentDraft({ id: "Bad Id", name: "x", command: "x", args: "" }, []).id).toMatch(/lowercase/);
    expect(validateAcpAgentDraft({ id: "taken", name: "x", command: "x", args: "" }, ["taken"]).id).toMatch(
      /already exists/,
    );
    expect(validateAcpAgentDraft({ id: "ok-1", name: "Ok", command: "run", args: "a\n\nb" }, ["other"])).toEqual({});
    expect(validateAcpAgentDraft({ id: "ok", name: "Ok", command: "run", args: "x\n".repeat(65) }, []).args).toMatch(
      /at most 64/,
    );
  });

  it("formats the reset time", () => {
    const now = new Date(2026, 10, 13, 12, 0).getTime();
    expect(formatResetTime(null, now)).toBe("");
    const sameDay = formatResetTime(new Date(2026, 10, 13, 15, 30).getTime() / 1000, now);
    expect(sameDay).not.toContain("2026");
    const later = formatResetTime(new Date(2026, 10, 15, 15, 30).getTime() / 1000, now);
    expect(later.length).toBeGreaterThan(sameDay.length);
  });
});

describe("ProviderUsageList", () => {
  const now = new Date(2026, 10, 13, 12, 0).getTime();
  const usage: ProviderUsage[] = [
    { provider: "codex", model: null, state: "ok", resetsAt: null, usedPercent: 41.6, reason: null },
    {
      provider: "claude",
      model: null,
      state: "limited",
      resetsAt: new Date(2026, 10, 13, 15, 30).getTime() / 1000,
      usedPercent: 100,
      reason: "5-hour limit reached",
    },
    {
      provider: "acp",
      model: "acp:demo-agent",
      state: "unavailable",
      resetsAt: null,
      usedPercent: null,
      reason: "Exited",
    },
  ];

  it("shows each state, the reset time and the percentage", () => {
    render(() => <ProviderUsageList usage={usage} acpAgents={[ACP]} now={now} />);
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Limit reached")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("42% used")).toBeInTheDocument();
    expect(screen.getByText(/Resets at/)).toBeInTheDocument();
    expect(screen.getByText("5-hour limit reached")).toBeInTheDocument();
    expect(screen.getByText("Demo agent (ACP)")).toBeInTheDocument();
    expect(screen.getByText("No reset time was given.")).toBeInTheDocument();
  });

  it("says when there is nothing yet and offers a refresh", async () => {
    const refresh = vi.fn();
    render(() => <ProviderUsageList usage={[]} acpAgents={[]} now={now} onRefresh={refresh} />);
    expect(screen.getByText("No usage information yet.")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("AcpAgentsSection", () => {
  it("shows the field errors only after the first try and does not save", async () => {
    const save = vi.fn(async () => undefined);
    render(() => <AcpAgentsSection agents={[]} onSave={save} onRemove={vi.fn(async () => undefined)} />);
    expect(screen.queryByText("Choose an id.")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
    expect(await screen.findByText("Choose an id.")).toBeInTheDocument();
    expect(screen.getByText("Give the agent a name.")).toBeInTheDocument();
    expect(screen.getByText("Enter the program to run.")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves a valid agent with one argument per line and clears the form", async () => {
    const save = vi.fn(async () => undefined);
    render(() => <AcpAgentsSection agents={[]} onSave={save} onRemove={vi.fn(async () => undefined)} />);
    await fireEvent.input(screen.getByLabelText(/^Id/), { target: { value: "my-agent" } });
    await fireEvent.input(screen.getByLabelText(/^Name/), { target: { value: "My agent" } });
    await fireEvent.input(screen.getByLabelText(/^Command/), { target: { value: "run-acp" } });
    await fireEvent.input(screen.getByLabelText(/^Arguments/), { target: { value: "--a\n --b \n" } });
    await fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith({ id: "my-agent", name: "My agent", command: "run-acp", args: ["--a", "--b"] }),
    );
    await vi.waitFor(() => expect(textInput(/^Id/).value).toBe(""));
  });

  it("shows the error when saving fails and keeps what was typed", async () => {
    const save = vi.fn(async () => {
      throw new Error("Command not found.");
    });
    render(() => <AcpAgentsSection agents={[]} onSave={save} onRemove={vi.fn(async () => undefined)} />);
    await fireEvent.input(screen.getByLabelText(/^Id/), { target: { value: "my-agent" } });
    await fireEvent.input(screen.getByLabelText(/^Name/), { target: { value: "My agent" } });
    await fireEvent.input(screen.getByLabelText(/^Command/), { target: { value: "nope" } });
    await fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
    expect(await screen.findByText("Command not found.")).toBeInTheDocument();
    expect(textInput(/^Id/).value).toBe("my-agent");
  });

  it("asks before removing an agent", async () => {
    const remove = vi.fn(async () => undefined);
    render(() => <AcpAgentsSection agents={[ACP]} onSave={vi.fn(async () => undefined)} onRemove={remove} />);
    expect(screen.getByText("acp:demo-agent")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Remove Demo agent" }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText(/can no longer use it/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(remove).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole("button", { name: "Remove Demo agent" }));
    await fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith("demo-agent"));
  });
});

function textInput(label: RegExp): HTMLInputElement {
  const element = screen.getByLabelText(label);
  if (!(element instanceof HTMLInputElement)) throw new Error("Not an input.");
  return element;
}

function row(index: number): HTMLElement {
  const element = screen.getAllByRole("listitem")[index];
  if (!element) throw new Error(`No row ${index}.`);
  return element;
}

function OrderHarness(props: { initial: AgentModelId[]; onChange?: (items: AgentModelId[]) => void }) {
  const [items, setItems] = createSignal<AgentModelId[]>(props.initial);
  return (
    <FallbackOrder
      botName="Chief"
      ownModel="gpt-5.6-luna"
      items={items()}
      options={OPTIONS}
      dirty
      saving={false}
      onChange={(next) => {
        setItems(next);
        props.onChange?.(next);
      }}
      onSave={vi.fn()}
    />
  );
}

describe("FallbackOrder", () => {
  const names = () =>
    screen.getAllByRole("listitem").map((item) => item.querySelector(".providers-order-name")?.textContent);

  it("reorders with the buttons", async () => {
    const changed = vi.fn();
    render(() => <OrderHarness initial={["gpt-5.6-terra", "claude-sonnet-5"]} onChange={changed} />);
    expect(names()).toEqual(["Terra", "Sonnet"]);
    expect(screen.getByRole("button", { name: "Move Terra up" })).toBeDisabled();
    await fireEvent.click(screen.getByRole("button", { name: "Move Terra down" }));
    expect(names()).toEqual(["Sonnet", "Terra"]);
    expect(changed).toHaveBeenLastCalledWith(["claude-sonnet-5", "gpt-5.6-terra"]);
  });

  it("reorders from the keyboard with Alt+Arrow and announces it", async () => {
    render(() => <OrderHarness initial={["gpt-5.6-terra", "claude-sonnet-5"]} />);
    await fireEvent.keyDown(row(0), { key: "ArrowDown", altKey: true });
    expect(names()).toEqual(["Sonnet", "Terra"]);
    expect(screen.getByRole("status")).toHaveTextContent("Terra moved to position 2 of 2.");
    await fireEvent.keyDown(row(0), { key: "ArrowDown" });
    expect(names()).toEqual(["Sonnet", "Terra"]);
  });

  it("reorders by dragging a row onto another", async () => {
    render(() => <OrderHarness initial={["gpt-5.6-terra", "claude-sonnet-5", "claude-opus-5"]} />);
    await fireEvent.dragStart(row(0));
    await fireEvent.dragOver(row(2));
    await fireEvent.drop(row(2));
    expect(names()).toEqual(["Sonnet", "Opus", "Terra"]);
  });

  it("offers every model except the agent's own and the chosen ones, up to four", async () => {
    const changed = vi.fn();
    render(() => <OrderHarness initial={["gpt-5.6-terra"]} onChange={changed} />);
    const select = screen.getByLabelText("Add fallback model");
    if (!(select instanceof HTMLSelectElement)) throw new Error("Not a select.");
    const offered = [...select.options].map((option) => option.textContent);
    expect(offered).not.toContain("Luna");
    expect(offered).not.toContain("Terra");
    expect(offered).toContain("Opus");
    await fireEvent.change(select, { target: { value: "claude-opus-5" } });
    expect(changed).toHaveBeenLastCalledWith(["gpt-5.6-terra", "claude-opus-5"]);
  });

  it("stops at four fallback models", () => {
    render(() => <OrderHarness initial={["gpt-5.6-terra", "claude-sonnet-5", "claude-opus-5", "claude-fable-5"]} />);
    expect(screen.getByLabelText("Add fallback model")).toBeDisabled();
    expect(screen.getByText("At most 4 models")).toBeInTheDocument();
  });

  it("says what happens without any fallback", () => {
    render(() => <OrderHarness initial={[]} />);
    expect(screen.getByText(/stops when its own provider does/)).toBeInTheDocument();
  });
});

describe("FallbackInUse", () => {
  const bot = (over: Partial<BotSummary>): BotSummary => ({
    id: "b1",
    name: "Chief",
    role: "",
    description: "",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: null,
    workspacePath: "",
    preview: "",
    updatedAt: null,
    avatarSeed: "s",
    avatarHue: null,
    avatarUrl: null,
    ...over,
  });

  it("names only agents that run on a fallback model", () => {
    render(() => (
      <FallbackInUse
        options={OPTIONS}
        bots={[bot({ activeModel: "claude-sonnet-5" }), bot({ id: "b2", name: "Steady", activeModel: "gpt-5.6-luna" })]}
      />
    ));
    expect(screen.getByText(/is using Sonnet instead of Luna/)).toBeInTheDocument();
    expect(screen.queryByText(/Steady/)).toBeNull();
  });
});
