// COSGRAL W6-BE5: signing in to an ACP agent (Gemini CLI, Antigravity `agy`, ...) from the program, with a link and a code.
//
// How it works (checked against Gemini CLI 0.68.0 and Antigravity agy 1.5.9):
// - The program starts the agent over ACP and reads the sign-in methods it reports in `initialize`.
// - "link-code" (Gemini): `authenticate` with NO_BROWSER set makes the agent print a link and ask for a code on stdin. A wrong code
//   makes it print an error and a NEW link. The right code answers `authenticate`.
// - "terminal" (agy): the method names extra arguments (`--login`). The program runs the agent's own command with them: it prints a
//   link and reads a code; exit 0 is signed in, anything else is the reason. `SSH_CONNECTION` is set so that the agent does not open
//   a browser by itself: the window opens the link when the person clicks.
// The program never reads the files in which the agent keeps its login, passes the code only to the running sign-in, and keeps it
// nowhere (not in the state, the events or messages: it is cut out of anything the agent says back).

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import {
  ACP_LOGIN_LIMITS,
  type AcpAgentConfig,
  type AcpLoginAgentInput,
  type AcpLoginMethod,
  type AcpLoginState,
  type AgentEvent,
  acpLoginIsRunning,
  acpLoginMethods,
  chooseAcpLoginMethod,
  isSafeAcpLoginUrl,
  normalizeAcpLoginCode,
  type StartAcpLoginInput,
  type SubmitAcpLoginCodeInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { spawnAcpAgent } from "./acp-spawn";

export interface AcpLoginOptions {
  agents: () => AcpAgentConfig[];
  emit: (event: AgentEvent) => void;
  /** The most a whole sign-in may take (default 10 minutes). */
  timeoutMs?: number;
  /** The most the agent may take to start and say how it signs in (default 90 seconds: the first start of Gemini CLI is slow). */
  startTimeoutMs?: number;
}

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI_CSI = new RegExp(`${ESC}\\[[0-9;?<>=]*[ -/]*[@-~]`, "g");
const ANSI_OSC = new RegExp(`${ESC}\\][^${BEL}]*${BEL}`, "g");
const ANSI_OTHER = new RegExp(`${ESC}[()][A-Z0-9]`, "g");

/** The sign-in link and whether a code is asked for, from what an agent printed (colours and cursor handling removed). */
export function readAcpLoginOutput(text: string): { url: string | null; codeRequired: boolean } {
  const clean = stripTerminalCodes(text);
  const url = clean.match(/https:\/\/[^\s"'<>]+/)?.[0]?.replace(/[).,;]+$/, "") ?? null;
  return { url, codeRequired: /\bcode\b/i.test(clean) };
}

function stripTerminalCodes(text: string): string {
  return text.replace(ANSI_OSC, "").replace(ANSI_CSI, "").replace(ANSI_OTHER, "").replace(/\r/g, "");
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | null;
}

interface Run {
  config: AcpAgentConfig;
  child: ChildProcessWithoutNullStreams | null;
  kind: "link-code" | "terminal" | null;
  /** The codes the person pasted, only to cut them out of what the agent says back. */
  codes: string[];
  ended: boolean;
  timer: NodeJS.Timeout | null;
  buffer: string;
  nextId: number;
  pending: Map<number, Pending>;
  lastLine: string | null;
}

const IDLE_MESSAGE = null;

export class AcpLogin {
  readonly #options: AcpLoginOptions;
  readonly #states = new Map<string, AcpLoginState>();
  readonly #runs = new Map<string, Run>();

  constructor(options: AcpLoginOptions) {
    this.#options = options;
  }

  /** The sign-in state of every configured ACP agent. */
  list(): AcpLoginState[] {
    const configured = this.#options.agents();
    const known = new Set(configured.map((config) => config.id));
    for (const agentId of [...this.#states.keys()]) {
      if (known.has(agentId)) continue;
      const run = this.#runs.get(agentId);
      if (run) this.#finish(run, { phase: "cancelled", message: "The agent was removed.", url: null }, false);
      this.#states.delete(agentId);
    }
    return configured.map((config) => structuredClone(this.#stateOf(config.id)));
  }

  /** Starts the sign-in; the rest comes as `acp-login-changed`. */
  async start(input: StartAcpLoginInput): Promise<AcpLoginState> {
    const config = this.#config(input.agentId);
    const state = this.#stateOf(config.id);
    if (acpLoginIsRunning(state)) throw new Error("A sign-in is already running for this agent.");
    const run: Run = {
      config,
      child: null,
      kind: null,
      codes: [],
      ended: false,
      timer: null,
      buffer: "",
      nextId: 1,
      pending: new Map(),
      lastLine: null,
    };
    this.#runs.set(config.id, run);
    run.timer = setTimeout(
      () => this.#finish(run, { phase: "error", message: "The sign-in took too long. Start again.", url: null }),
      this.#options.timeoutMs ?? 600_000,
    );
    this.#set(config.id, {
      phase: "starting",
      message: "Starting the sign-in. The first time can take half a minute.",
      url: null,
      methodId: null,
    });
    void this.#run(run, input.methodId ?? null);
    return structuredClone(this.#stateOf(config.id));
  }

  /** Passes the code the sign-in page showed to the running sign-in. */
  async submitCode(input: SubmitAcpLoginCodeInput): Promise<AcpLoginState> {
    const config = this.#config(input.agentId);
    const run = this.#runs.get(config.id);
    if (!run || run.ended || this.#stateOf(config.id).phase !== "code-required" || !run.child) {
      throw new Error("No sign-in waits for a code.");
    }
    const code = normalizeAcpLoginCode(input.code);
    run.codes.push(code);
    run.child.stdin.write(`${code}\n`);
    this.#set(config.id, { phase: "starting", message: "Checking the code…", url: null });
    return structuredClone(this.#stateOf(config.id));
  }

  async cancel(input: AcpLoginAgentInput): Promise<AcpLoginState> {
    const config = this.#config(input.agentId);
    const run = this.#runs.get(config.id);
    if (run && !run.ended) {
      this.#finish(run, { phase: "cancelled", message: "The sign-in was cancelled.", url: null });
    }
    return structuredClone(this.#stateOf(config.id));
  }

  /** The agent said "Authentication required" on a turn: the sign-in card shows (nothing runs; a running sign-in is left alone). */
  markNeedsLogin(agentId: string): void {
    if (!this.#options.agents().some((config) => config.id === agentId)) return;
    if (acpLoginIsRunning(this.#stateOf(agentId))) return;
    this.#set(agentId, {
      phase: "idle",
      message: "Authentication required. Sign in to use this agent.",
      url: null,
      signedIn: false,
    });
  }

  /** The program closes: every running sign-in ends and its process stops. */
  stopAll(): void {
    for (const run of [...this.#runs.values()]) {
      this.#finish(run, { phase: "cancelled", message: "The sign-in was cancelled.", url: null }, false);
    }
  }

  // --- internals ---

  #config(agentId: string): AcpAgentConfig {
    const config = this.#options.agents().find((candidate) => candidate.id === agentId);
    if (!config) throw new Error("Unknown ACP agent.");
    return config;
  }

  #stateOf(agentId: string): AcpLoginState {
    let state = this.#states.get(agentId);
    if (!state) {
      state = { agentId, phase: "idle", message: IDLE_MESSAGE, url: null, methodId: null, methods: [], signedIn: null };
      this.#states.set(agentId, state);
    }
    return state;
  }

  /** Changes the state and tells the window (nothing is said when nothing changed). */
  #set(agentId: string, patch: Partial<AcpLoginState>, emit = true): void {
    const state = this.#stateOf(agentId);
    const before = JSON.stringify(state);
    Object.assign(state, patch);
    if (emit && JSON.stringify(state) !== before) {
      this.#options.emit({ type: "acp-login-changed", state: structuredClone(state) });
    }
  }

  async #run(run: Run, methodId: string | null): Promise<void> {
    const { config } = run;
    try {
      this.#launch(run, config.args, {});
      const init = await this.#rpc(
        run,
        "initialize",
        {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
            auth: { terminal: true },
          },
          clientInfo: { name: "cosgral-workspace", version: "0.2.0" },
        },
        this.#options.startTimeoutMs ?? 90_000,
        `${config.name} did not answer. Is it installed and up to date?`,
      );
      if (run.ended) return;
      const reported = isDynamicRecord(init) ? init.authMethods : undefined;
      const methods = acpLoginMethods(reported);
      this.#set(config.id, { methods });
      const chosen = chooseAcpLoginMethod(methods, methodId);
      if (!chosen.method) {
        this.#finish(run, { phase: "error", message: chosen.problem, url: null });
        return;
      }
      this.#set(config.id, { methodId: chosen.method.id });
      if (chosen.method.kind === "terminal") {
        this.#startTerminal(run, chosen.method, reported);
        return;
      }
      run.kind = "link-code";
      this.#set(config.id, { message: "Waiting for the agent's sign-in link…" });
      await this.#rpc(run, "authenticate", { methodId: chosen.method.id }, null, "");
      this.#finish(run, { phase: "success", message: "Signed in.", url: null, signedIn: true });
    } catch (error) {
      this.#finish(run, {
        phase: "error",
        message: this.#safe(run, error instanceof Error ? error.message : String(error)),
        url: null,
      });
    }
  }

  /** The agent's own terminal sign-in: its command with the extra arguments the method names. */
  #startTerminal(run: Run, method: AcpLoginMethod, reported: unknown): void {
    const raw = Array.isArray(reported)
      ? reported.find((item) => isDynamicRecord(item) && item.id === method.id)
      : null;
    const extra = isDynamicRecord(raw) && Array.isArray(raw.args) ? raw.args.filter(isString) : [];
    this.#stop(run);
    run.kind = "terminal";
    run.buffer = "";
    this.#launch(run, [...run.config.args, ...extra], {
      SSH_CONNECTION: process.env.SSH_CONNECTION ?? "127.0.0.1 0 127.0.0.1 22",
    });
    this.#set(run.config.id, { message: "Waiting for the agent's sign-in link…" });
  }

  #launch(run: Run, args: string[], env: Record<string, string>): void {
    const { config } = run;
    const child = spawnAcpAgent(config.command, args, { ...process.env, NO_BROWSER: "true", ...env });
    run.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.#onStdout(run, chunk));
    child.stderr.on("data", (chunk: string) => this.#onText(run, chunk, true));
    child.stdin.on("error", () => undefined);
    child.on("error", (error) => {
      if (run.child === child) {
        this.#finish(run, {
          phase: "error",
          message: this.#safe(run, `${config.name} could not start: ${error.message}`),
          url: null,
        });
      }
    });
    child.on("exit", (code) => {
      if (run.ended || run.child !== child) return;
      if (run.kind === "terminal" && code === 0) {
        this.#finish(run, { phase: "success", message: "Signed in.", url: null, signedIn: true });
        return;
      }
      const reason =
        run.kind === "terminal" && run.lastLine
          ? run.lastLine
          : `${config.name} stopped (exit code ${code ?? "none"}).`;
      this.#finish(run, { phase: "error", message: this.#safe(run, reason), url: null });
    });
  }

  /** JSON-RPC lines answer a request; every other line is what the agent printed for the person. */
  #onStdout(run: Run, chunk: string): void {
    run.buffer += chunk;
    let index = run.buffer.indexOf("\n");
    while (index >= 0) {
      const line = run.buffer.slice(0, index).trim();
      run.buffer = run.buffer.slice(index + 1);
      index = run.buffer.indexOf("\n");
      if (line) this.#onLine(run, line);
    }
    // A prompt without an end of line ("Enter the authorization code: ") is read as it comes.
    const tail = run.buffer.trim();
    if (tail && !tail.startsWith("{")) this.#onText(run, tail, false);
  }

  #onLine(run: Run, line: string): void {
    // A prompt without an end of line ("Enter the authorization code: ") runs into the next JSON-RPC answer: split them.
    const start = line.indexOf('{"jsonrpc"');
    if (start >= 0) {
      try {
        const message = JSON.parse(line.slice(start));
        if (isDynamicRecord(message) && message.jsonrpc === "2.0") {
          if (start > 0) this.#onText(run, line.slice(0, start), false);
          this.#onRpc(run, message);
          return;
        }
      } catch {
        // Not JSON: it is text.
      }
    }
    this.#onText(run, line, false);
  }

  #onRpc(run: Run, message: DynamicRecord): void {
    if (!isNumber(message.id) || message.method !== undefined) return;
    const pending = run.pending.get(message.id);
    if (!pending) return;
    run.pending.delete(message.id);
    if (pending.timer) clearTimeout(pending.timer);
    if (isDynamicRecord(message.error)) {
      pending.reject(new Error(isString(message.error.message) ? message.error.message : "The agent refused."));
    } else {
      pending.resolve(message.result);
    }
  }

  #onText(run: Run, raw: string, fromStderr: boolean): void {
    if (run.ended) return;
    const text = stripTerminalCodes(raw);
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) run.lastLine = trimmed;
    }
    const { url } = readAcpLoginOutput(raw);
    const state = this.#stateOf(run.config.id);
    const retried = run.codes.length > 0;
    if (url && isSafeAcpLoginUrl(url)) {
      if (url !== state.url || state.phase !== "code-required") {
        this.#set(run.config.id, {
          phase: "code-required",
          url,
          message: retried
            ? "The sign-in page did not accept the code. Open the new link and try again."
            : "Open the link, sign in, and paste the code the page shows.",
        });
      }
      return;
    }
    if (fromStderr && retried && state.phase === "starting" && /invalid|failed|retry/i.test(text)) {
      this.#set(run.config.id, {
        phase: "code-required",
        message: "The sign-in page did not accept the code. Open the new link and try again.",
      });
    }
  }

  #rpc(run: Run, method: string, params: unknown, timeoutMs: number | null, timeoutMessage: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = run.child;
      if (!child || run.ended) {
        reject(new Error("The agent is not running."));
        return;
      }
      const id = run.nextId;
      run.nextId += 1;
      const timer = timeoutMs
        ? setTimeout(() => {
            run.pending.delete(id);
            reject(new Error(timeoutMessage));
          }, timeoutMs)
        : null;
      run.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  /** Ends the sign-in: stops the process, and tells the window how it ended (unless the program is closing). */
  #finish(run: Run, patch: Partial<AcpLoginState>, emit = true): void {
    if (run.ended) return;
    run.ended = true;
    if (run.timer) clearTimeout(run.timer);
    for (const pending of run.pending.values()) if (pending.timer) clearTimeout(pending.timer);
    run.pending.clear();
    this.#stop(run);
    if (this.#runs.get(run.config.id) === run) this.#runs.delete(run.config.id);
    this.#set(run.config.id, patch, emit);
  }

  #stop(run: Run): void {
    const child = run.child;
    run.child = null;
    if (!child) return;
    child.stdin.end();
    child.kill();
  }

  /** What the agent said, made fit to show: the codes the person pasted and links are cut out, and it is kept short. */
  #safe(run: Run, text: string): string {
    let result = stripTerminalCodes(text);
    for (const code of run.codes) if (code.length >= 3) result = result.split(code).join("[code]");
    result = result
      .replace(/https:\/\/[^\s"'<>]+/g, "[link]")
      .replace(/\s+/g, " ")
      .trim();
    return result.slice(0, ACP_LOGIN_LIMITS.message) || "The sign-in failed.";
  }
}
