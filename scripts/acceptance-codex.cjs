// COSGRAL W3-T3: a Codex App Server stand-in for the acceptance run (no model, no network, no credentials).
// Direct turns understand a few words at the start of the message:
//   SLOW <ms>          waits, then answers "Stub: slow done" (a turn that stays open: working state, queue, Stop)
//   ASK                asks one question with two options and reports the answer it got
//   RUN <command>      asks to run the command (approval card) and reports the decision
//   FILES <folder>     asks to change files in a folder (approval card, grant root)
//   PERMS <folder>     asks for read and write permission in a folder
//   DRAFT              shows a draft/confirm card ("Send the summary to Anna?") and reports the decision
//   FAIL               ends the turn as failed
//   LIMITON / LIMITOFF the Codex usage window is full until its reset / not full
//   TOOLS              lists the tools the program gave this thread
//   TOOL <ns> <tool> <json>   calls one tool of the program and reports its answer
//   INSTRHAS <text>    reports whether the thread's instructions contain the text
//   INSTR              reports the instructions the thread was started with (first 4000 characters)
//   MODEL              reports the model and effort of the last turn/start
// Anything else gets "Stub: received". Messages that are JSON are channel turns: this stand-in does not run those
// (the acceptance run uses src/backend/testing/channel-codex.cjs for channels).
const { randomUUID } = require("node:crypto");

if (process.argv.includes("--version")) {
  console.log("codex-cli 0.144.1");
  process.exit(0);
}

const threads = new Map();
const turns = new Map();
const waiting = new Map();
let buffer = "";
let lastTurnStart = {};
let limitResetsAt = null;

const out = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const ask = (method, params) =>
  new Promise((resolve, reject) => {
    const id = randomUUID();
    waiting.set(id, { resolve, reject });
    out({ id, method, params });
  });
const complete = (threadId, turnId, text, status = "completed", error = null) => {
  if (turns.get(turnId)?.ended) return;
  turns.set(turnId, { ended: true });
  if (text) {
    out({
      method: "item/completed",
      params: { threadId, turnId, item: { id: randomUUID(), type: "agentMessage", text } },
    });
  }
  out({
    method: "turn/completed",
    params: { threadId, turn: { id: turnId, status, ...(error ? { error: { message: error } } : {}) } },
  });
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function direct(threadId, turnId, text) {
  const tool = async (namespace, name, args) => {
    const response = await ask("item/tool/call", { threadId, turnId, callId: randomUUID(), namespace, tool: name, arguments: args });
    return { success: response.success, text: response.contentItems?.[0]?.text ?? "" };
  };
  if (text.startsWith("SLOW")) {
    const ms = Number(text.split(/\s+/)[1]) || 5000;
    const until = Date.now() + ms;
    while (Date.now() < until && !turns.get(turnId)?.ended) await sleep(100);
    return complete(threadId, turnId, "Stub: slow done");
  }
  if (text.startsWith("ASK")) {
    const result = await ask("item/tool/requestUserInput", {
      threadId,
      turnId,
      itemId: randomUUID(),
      questions: [
        {
          id: "format",
          header: "Format",
          question: "Use the short format?",
          options: [
            { label: "Short", description: "A few lines" },
            { label: "Long", description: "Everything" },
          ],
        },
      ],
    });
    return complete(threadId, turnId, `Stub: answered ${JSON.stringify(result)}`);
  }
  if (text.startsWith("RUN ")) {
    const result = await ask("item/commandExecution/requestApproval", {
      threadId,
      turnId,
      itemId: randomUUID(),
      command: text.slice(4).trim(),
      cwd: process.cwd(),
      reason: "Acceptance run",
    });
    return complete(threadId, turnId, `Stub: command decision ${result.decision}`);
  }
  if (text.startsWith("FILES ")) {
    const result = await ask("item/fileChange/requestApproval", {
      threadId,
      turnId,
      itemId: randomUUID(),
      grantRoot: text.slice(6).trim(),
      reason: "Acceptance run",
    });
    return complete(threadId, turnId, `Stub: files decision ${result.decision}`);
  }
  if (text.startsWith("PERMS ")) {
    const folder = text.slice(6).trim();
    const result = await ask("item/permissions/requestApproval", {
      threadId,
      turnId,
      itemId: randomUUID(),
      reason: "Acceptance run",
      permissions: { fileSystem: { read: [folder], write: [folder] }, network: { enabled: false } },
    });
    return complete(threadId, turnId, `Stub: permissions ${Object.keys(result.permissions ?? {}).length ? "granted" : "denied"}`);
  }
  if (text.startsWith("DRAFT")) {
    const result = await tool("cosgral_cards", "confirm", {
      title: "Send the summary to Anna?",
      preview: "Hi Anna, the report is ready.",
      recipient: "Anna",
      channel: "email",
    });
    return complete(threadId, turnId, `Stub: draft ${result.text}`);
  }
  if (text.startsWith("FAIL")) return complete(threadId, turnId, null, "failed", "Sandbox failure: the provider said no.");
  if (text.startsWith("LIMITON")) {
    limitResetsAt = Math.floor(Date.now() / 1000) + 3 * 3600;
    out({ method: "account/rateLimits/updated", params: { rateLimits: limits() } });
    return complete(threadId, turnId, "Stub: limit on");
  }
  if (text.startsWith("LIMITOFF")) {
    limitResetsAt = null;
    out({ method: "account/rateLimits/updated", params: { rateLimits: limits() } });
    return complete(threadId, turnId, "Stub: limit off");
  }
  if (text.startsWith("TOOLS")) {
    const names = [];
    for (const item of threads.get(threadId)?.dynamicTools ?? []) {
      names.push(item.name);
      for (const inner of item.tools ?? []) names.push(`${item.name}.${inner.name}`);
    }
    return complete(threadId, turnId, `Stub: tools ${JSON.stringify(names)}`);
  }
  if (text.startsWith("TOOL ")) {
    const match = /^TOOL (\S+) (\S+) ([\s\S]*)$/.exec(text);
    if (!match) return complete(threadId, turnId, "Stub: TOOL needs a namespace, a tool and JSON");
    const result = await tool(match[1], match[2], JSON.parse(match[3]));
    return complete(threadId, turnId, `Stub: tool ${JSON.stringify(result)}`);
  }
  if (text.startsWith("INSTRHAS ")) {
    const needle = text.slice(9).trim();
    const all = threads.get(threadId)?.developerInstructions ?? "";
    return complete(threadId, turnId, `Stub: instructions ${all.includes(needle) ? "have" : "lack"} "${needle}" (length ${all.length})`);
  }
  if (text.startsWith("INSTR")) {
    return complete(threadId, turnId, `Stub: instructions ${(threads.get(threadId)?.developerInstructions ?? "").slice(0, 4000)}`);
  }
  if (text.startsWith("MODEL")) {
    return complete(threadId, turnId, `Stub: model ${JSON.stringify({ model: lastTurnStart.model ?? null, effort: lastTurnStart.effort ?? null })}`);
  }
  return complete(threadId, turnId, "Stub: received");
}

function limits() {
  return limitResetsAt
    ? { limitId: "codex", primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: limitResetsAt }, secondary: null }
    : { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: null }, secondary: null };
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    const { id, method, params } = message;
    if (!method) {
      const pending = waiting.get(id);
      if (pending) {
        waiting.delete(id);
        message.error ? pending.reject(Error(message.error.message)) : pending.resolve(message.result);
      }
      continue;
    }
    if (id === undefined) continue;
    const reply = (result) => out({ id, result });
    switch (method) {
      case "initialize":
        reply({});
        break;
      case "account/read":
        reply({ account: { type: "chatgpt", email: "fixture@cosgral.local" }, requiresOpenaiAuth: false });
        break;
      case "account/rateLimits/read":
        reply({ rateLimits: limits(), rateLimitsByLimitId: null });
        break;
      case "model/list":
        reply({ data: [{ model: "gpt-5.6-luna" }, { model: "gpt-5.6-terra" }, { model: "gpt-5.6-sol" }] });
        break;
      case "plugin/list":
        reply({ marketplaces: [] });
        break;
      case "thread/start": {
        const threadId = randomUUID();
        threads.set(threadId, params);
        reply({ thread: { id: threadId, turns: [] } });
        break;
      }
      case "thread/read":
        reply({ thread: { id: params.threadId, turns: [] } });
        break;
      case "thread/resume":
        threads.set(params.threadId, params);
        reply({ thread: { id: params.threadId, turns: [] } });
        break;
      case "turn/start": {
        const threadId = params.threadId;
        const turnId = randomUUID();
        lastTurnStart = params;
        turns.set(turnId, { ended: false });
        reply({ turn: { id: turnId, status: "inProgress", items: [] } });
        out({ method: "turn/started", params: { threadId, turn: { id: turnId } } });
        const text = params.input?.[0]?.text ?? "";
        setTimeout(() => direct(threadId, turnId, text).catch((error) => complete(threadId, turnId, null, "failed", String(error))), 20);
        break;
      }
      case "turn/steer":
        reply({ turnId: params.expectedTurnId });
        break;
      case "turn/interrupt":
        reply({});
        complete(params.threadId, params.turnId, "Stub interrupted", "interrupted");
        break;
      default:
        out({ id, error: { code: -32601, message: `Fixture does not implement ${method}` } });
    }
  }
});
