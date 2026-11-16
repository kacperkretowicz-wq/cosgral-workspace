// COSGRAL W8-BE1: the access levels of the agents on the engine side (spec-w8.md 1A, W8-01…08; Q2, Q3, Q4, Q9).
//
// - The level, the added and the excluded folders of each agent are kept on disk (`AccessStore`).
// - Lowering a level is done at once. Raising it is a card of "Needs you" and nothing else: no call, no tool, no template
//   and no import can raise a level, and an agent has no tool to ask for it.
// - Every request that goes further than the level allows is refused (with a reason the window shows), or asked about, or
//   left to the usual rules and cards of the approvals (`inspect*`).
// The CLI of the agent is told the sandbox of the level (`cliAccess`); the engine calls the `inspect*` methods at the places
// where the CLI or a tool asks (agent-service.ts). Computer Use and the camera are never part of a level (Q4).

import {
  type AccessDecision,
  type AccessDenialReason,
  type AccessDenied,
  type AccessLevel,
  type AgentAccess,
  type AgentApproval,
  type AgentEvent,
  accessIsRaise,
  accessRaiseCard,
  type DraftPreviewResolution,
  parseSetAccessFoldersInput,
  type SetAccessFoldersInput,
  type SetAccessLevelInput,
  type SetAccessLevelResult,
} from "@openbot/contracts/ipc";
import {
  type AgentFolders,
  accessPolicyOf,
  type CliAccess,
  claudeToolRequest,
  cliAccess,
  decideApproval,
  decideToolPaths,
  toolPaths,
} from "./access-policy";
import type { AccessStore } from "./access-store";

export interface AccessServiceOptions {
  store: AccessStore;
  /** The working folder and the shared folder of the agent; null when the agent does not exist. */
  folders: (botId: string) => AgentFolders | null;
  botName: (botId: string) => string | null;
  /** A confirm card of "Needs you" for this agent ("send" = the person allowed it). */
  confirm: (botId: string, input: { title: string; preview: string }) => Promise<DraftPreviewResolution>;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
  /**
   * COSGRAL W8-BE2 (Q2): why the file and shell tools of this agent are refused at this level because its isolation is on but
   * impossible on this computer; null when there is no objection. Left out: never an objection.
   */
  isolationRefusal?: (botId: string, level: AccessLevel) => string | null;
}

export type ToolAccess = { allowed: true } | { allowed: false; message: string };
export type ClaudeToolAccess = { behavior: "allow" } | { behavior: "deny"; message: string };

let pendingSequence = 0;

export class AccessService {
  readonly #options: AccessServiceOptions;
  /** A raise that waits for its card: the target and a number that ends when the person changes the level again. */
  readonly #pending = new Map<string, { target: AccessLevel; ticket: number }>();

  constructor(options: AccessServiceOptions) {
    this.#options = options;
  }

  get(botId: string): AgentAccess {
    return this.#options.store.get(botId);
  }

  /** The access of every agent the program knows (the stored ones and the defaults of the rest). */
  list(botIds: readonly string[]): AgentAccess[] {
    return botIds.map((botId) => this.#options.store.get(botId));
  }

  setFolders(input: SetAccessFoldersInput): AgentAccess {
    const parsed = parseSetAccessFoldersInput(input);
    this.#requireAgent(parsed.botId);
    const current = this.get(parsed.botId);
    return this.#save({
      ...current,
      additionalFolders: parsed.additionalFolders ?? current.additionalFolders,
      excludedFolders: parsed.excludedFolders ?? current.excludedFolders,
    });
  }

  async setLevel(input: SetAccessLevelInput): Promise<SetAccessLevelResult> {
    this.#requireAgent(input.botId);
    const current = this.get(input.botId);
    // Any new answer about the level ends a raise that still waits for its card: it is no longer what the person wants.
    const waiting = this.#pending.get(input.botId);
    if (input.level === current.level) {
      this.#pending.delete(input.botId);
      return { access: current, raiseRequested: false };
    }
    if (!accessIsRaise(current.level, input.level)) {
      this.#pending.delete(input.botId);
      return { access: this.#save({ ...current, level: input.level }), raiseRequested: false };
    }
    if (waiting?.target === input.level) return { access: current, raiseRequested: true };
    const ticket = ++pendingSequence;
    this.#pending.set(input.botId, { target: input.level, ticket });
    const name = this.#options.botName(input.botId) ?? "The agent";
    const card = accessRaiseCard({ agentName: name, from: current.level, to: input.level });
    void this.#options
      .confirm(input.botId, card)
      .then((answer) => {
        const still = this.#pending.get(input.botId);
        if (still?.ticket !== ticket) return;
        this.#pending.delete(input.botId);
        if (answer !== "send" || !this.#options.folders(input.botId)) return;
        const now = this.get(input.botId);
        if (!accessIsRaise(now.level, input.level)) return;
        this.#save({ ...now, level: input.level, raisedAt: this.#now() });
      })
      .catch(() => {
        // The card could not be shown (no agent row, program closing): the level stays as it is.
        if (this.#pending.get(input.botId)?.ticket === ticket) this.#pending.delete(input.botId);
      });
    return { access: current, raiseRequested: true };
  }

  /** An agent was made (also from a template or an import): it starts at the default whatever was kept for its id (Q9). */
  agentCreated(botId: string): void {
    this.#pending.delete(botId);
    this.#options.store.remove(botId);
  }

  forgetBot(botId: string): void {
    this.#pending.delete(botId);
    this.#options.store.remove(botId);
  }

  /** What the CLI of the agent is told: the sandbox of its level and the roots it may write in. */
  cliAccess(botId: string): CliAccess {
    const folders = this.#options.folders(botId);
    if (!folders) throw new Error("This agent no longer exists.");
    return cliAccess(this.get(botId), folders);
  }

  /**
   * A request of the CLI to go further (command, file change, extra permissions). "deny": refused for good, the window is
   * told. "allow"/"ask": the level has nothing against it; the usual "always allow" rules and the card decide. An agent the
   * program does not know is not judged here.
   */
  inspectApproval(approval: AgentApproval): AccessDecision {
    const policy = this.#policy(approval.botId);
    if (!policy) return { verdict: "allow" };
    const writes =
      approval.kind === "command" ||
      approval.kind === "file-change" ||
      (approval.kind === "permissions" && (approval.permissions?.fileSystem.write.length ?? 0) > 0);
    const noIsolation = writes ? this.#options.isolationRefusal?.(approval.botId, policy.level) : null;
    const decision: AccessDecision = noIsolation
      ? { verdict: "deny", reason: "isolation-unavailable", message: noIsolation }
      : decideApproval(policy, approval);
    if (decision.verdict === "deny") {
      const kind =
        approval.kind === "file-change" ? "file-change" : approval.kind === "command" ? "command" : "permissions";
      const path = approval.grantRoot ?? approval.cwd;
      this.#denied({
        botId: approval.botId,
        threadId: approval.threadId,
        kind,
        reason: decision.reason,
        path,
        message: decision.message,
      });
    }
    return decision;
  }

  /** A tool of the program that takes a path (the library, the data tools). A card is shown when the level asks first. */
  async inspectTool(botId: string, threadId: string | null, tool: string, args: unknown): Promise<ToolAccess> {
    const policy = this.#policy(botId);
    if (!policy) return { allowed: true };
    const paths = toolPaths(args, policy.workspace);
    if (paths.length === 0) return { allowed: true };
    const decision = decideToolPaths(policy, tool, paths);
    if (decision.verdict === "allow") return { allowed: true };
    if (decision.verdict === "deny") {
      this.#denied({
        botId,
        threadId,
        kind: "tool",
        reason: decision.reason,
        path: paths[0] ?? null,
        message: decision.message,
      });
      return { allowed: false, message: decision.message };
    }
    const first = paths[0] ?? "";
    const answer = await this.#ask(
      botId,
      `Allow ${this.#nameOf(botId)} to use ${first}?`,
      `The tool "${tool}" asks for ${paths.join("\n")}.`,
    );
    if (answer === "send") return { allowed: true };
    const message = "The person did not allow this folder.";
    this.#denied({ botId, threadId, kind: "tool", reason: "outside-folder", path: first, message });
    return { allowed: false, message };
  }

  /** A tool of Claude Code (a file tool or the shell). Tools that touch no folder are always allowed. */
  async inspectClaudeTool(
    botId: string,
    threadId: string | null,
    tool: string,
    input: unknown,
  ): Promise<ClaudeToolAccess> {
    const policy = this.#policy(botId);
    if (!policy) return { behavior: "allow" };
    const request = claudeToolRequest(tool, input, policy.workspace);
    if (!request) return { behavior: "allow" };
    const noIsolation = request.kind === "read" ? null : this.#options.isolationRefusal?.(botId, policy.level);
    const pseudo: AgentApproval = {
      requestId: "claude-tool",
      botId,
      threadId: threadId ?? "",
      turnId: "",
      kind: request.kind === "command" ? "command" : "file-change",
      command: request.kind === "command" ? request.command : null,
      cwd: request.kind === "command" ? request.cwd : null,
      reason: null,
      grantRoot: request.kind === "command" ? null : request.path,
      permissions: null,
    };
    // A read is judged as a read (the contract lets a read at working-folder go, the sandbox of the CLI reads widely).
    const decision: AccessDecision = noIsolation
      ? { verdict: "deny", reason: "isolation-unavailable", message: noIsolation }
      : request.kind === "read"
        ? decideToolPaths(policy, "read", [request.path])
        : decideApproval(policy, pseudo);
    if (decision.verdict === "allow") return { behavior: "allow" };
    const named = request.kind === "command" ? request.command : request.path;
    if (decision.verdict === "deny") {
      this.#denied({
        botId,
        threadId,
        kind: request.kind === "command" ? "command" : "file-change",
        reason: decision.reason,
        path: request.kind === "command" ? null : request.path,
        message: decision.message,
      });
      return { behavior: "deny", message: decision.message };
    }
    const answer = await this.#ask(botId, `Allow ${this.#nameOf(botId)} to go outside its folders?`, named);
    if (answer === "send") return { behavior: "allow" };
    const message = "The person did not allow this.";
    this.#denied({
      botId,
      threadId,
      kind: request.kind === "command" ? "command" : "file-change",
      reason: "outside-folder",
      path: request.kind === "command" ? null : request.path,
      message,
    });
    return { behavior: "deny", message };
  }

  // --- private ---

  #now(): string {
    return (this.#options.now?.() ?? new Date()).toISOString();
  }

  #nameOf(botId: string): string {
    return this.#options.botName(botId) ?? "The agent";
  }

  #requireAgent(botId: string): void {
    if (!this.#options.folders(botId)) throw new Error("This agent no longer exists.");
  }

  #policy(botId: string) {
    const folders = this.#options.folders(botId);
    return folders ? accessPolicyOf(this.get(botId), folders) : null;
  }

  #save(access: AgentAccess): AgentAccess {
    const saved = this.#options.store.put({ ...access, updatedAt: this.#now() });
    this.#options.emit({ type: "access-changed", access: saved });
    return saved;
  }

  #ask(botId: string, title: string, preview: string): Promise<DraftPreviewResolution> {
    return this.#options.confirm(botId, { title, preview }).catch(() => "expired" as const);
  }

  #denied(input: {
    botId: string;
    threadId: string | null;
    kind: AccessDenied["kind"];
    reason: AccessDenialReason;
    path: string | null;
    message: string;
  }): void {
    this.#options.emit({ type: "access-denied", ...input });
  }
}
