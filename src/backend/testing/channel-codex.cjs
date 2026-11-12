// Deterministic Codex App Server fixture. No model, network, browser or credentials.
const { randomUUID } = require("node:crypto");
if (process.argv.includes("--version")) {
  console.log("codex-cli 0.144.1");
  process.exit(0);
}
const threads = new Map(),
  pending = new Map(),
  turns = new Map();
let buffer = "";
const out = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
const call = (threadId, turnId, tool, args, namespace = "cosgral_channels") =>
  new Promise((resolve, reject) => {
    const id = randomUUID();
    pending.set(id, { resolve, reject });
    out({ id, method: "item/tool/call", params: { threadId, turnId, callId: id, namespace, tool, arguments: args } });
  });
const complete = (threadId, turnId, text, status = "completed") => {
  if (turns.get(turnId)?.ended) return;
  turns.set(turnId, { ended: true });
  out({
    method: "item/completed",
    params: { threadId, turnId, item: { id: randomUUID(), type: "agentMessage", text } },
  });
  out({ method: "turn/completed", params: { threadId, turn: { id: turnId, status } } });
};
async function run(threadId, turnId, context) {
  const task = context.assignment,
    members = context.members;
  if (task.title.startsWith("STOP SMOKE")) return;
  if (task.title.startsWith("CARD SMOKE")) {
    // W1-BE3: a draft card in the user's name; the turn waits for Send / Edit / Keep draft.
    const response = await call(
      threadId,
      turnId,
      "confirm",
      {
        title: "Send the summary to Anna?",
        preview: "Hi Anna, the report is ready.",
        recipient: "Anna",
        channel: "email",
      },
      "cosgral_cards",
    );
    const decision = JSON.parse(response.contentItems[0].text).decision;
    complete(threadId, turnId, `Stub: card decision ${decision}`);
    return;
  }
  if (task.title.startsWith("TAKEOVER SMOKE")) {
    // W1-BE3: a person takes over the tab, returns it, and the agent continues in the same tab.
    const response = await call(
      threadId,
      turnId,
      "request_takeover",
      { tabId: "tab-1", reason: "Sign in to continue" },
      "cosgral_cards",
    );
    const outcome = JSON.parse(response.contentItems[0].text).outcome;
    if (outcome === "returned") await call(threadId, turnId, "snapshot", { tabId: "tab-1" }, "openbot_browser");
    complete(threadId, turnId, `Stub: takeover ${outcome}`);
    return;
  }
  if (task.title.startsWith("QUESTION SMOKE")) {
    await call(
      threadId,
      turnId,
      "ask_user",
      {
        questions: [
          {
            id: "format",
            header: "Format",
            question: "Use the short format?",
            options: [{ label: "Short" }, { label: "Long" }],
          },
        ],
      },
      "openbot",
    );
    complete(threadId, turnId, "Stub: human answered");
    return;
  }
  if (task.title.startsWith("LIMIT SMOKE")) {
    if (threads.get(threadId).developerInstructions.includes("FINISH LIMIT")) {
      complete(threadId, turnId, "Stub: resumed by human");
      return;
    }
    await call(threadId, turnId, "transfer", { ownerBotId: task.ownerBotId === members[0] ? members[1] : members[0] });
    complete(threadId, turnId, "Stub: transferred");
    return;
  }
  if (task.parentTaskId) {
    complete(threadId, turnId, `Stub helper result: ${task.title}`);
    return;
  }
  if (task.title.startsWith("FAST SMOKE")) {
    // The helper finishes long before this turn ends; the waiting text must never become the result.
    if (!context.history.some((m) => m.kind === "result" && m.text === "Stub helper result: Fast facts")) {
      await call(threadId, turnId, "assign", { ownerBotId: members[1], text: "Fast facts" });
      await new Promise((r) => setTimeout(r, 400));
      complete(threadId, turnId, "Stub: waiting for members");
      return;
    }
    complete(threadId, turnId, "Stub: fast combined");
    return;
  }
  const results = context.history.filter((m) => m.kind === "result" && m.text.startsWith("Stub helper result:"));
  if (!results.length) {
    await call(threadId, turnId, "remember", { text: "Sandbox channel memory only" });
    const first = await call(threadId, turnId, "assign", {
      ownerBotId: members[1],
      text: "Facts",
      resourceKey: "browser",
    });
    const child = JSON.parse(first.contentItems[0].text);
    await call(threadId, turnId, "assign", {
      ownerBotId: members[2],
      text: "Verify",
      resourceKey: "browser",
      dependencyTaskIds: [child.id],
    });
    complete(threadId, turnId, "Stub: waiting for members");
    return;
  }
  await call(threadId, turnId, "result", { text: "Stub combined result version 1" });
  await call(threadId, turnId, "result", { text: "Stub combined result version 2" });
  complete(threadId, turnId, "Stub: combined");
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line),
      { id, method, params } = m;
    if (!method) {
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
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
        reply({ rateLimits: null, rateLimitsByLimitId: null });
        break;
      case "model/list":
        reply({ data: [{ model: "gpt-5.6-luna" }] });
        break;
      case "plugin/list":
        reply({ marketplaces: [] });
        break;
      case "thread/start": {
        const tid = randomUUID();
        threads.set(tid, params);
        reply({ thread: { id: tid, turns: [] } });
        break;
      }
      case "thread/read":
        reply({ thread: { id: params.threadId, turns: [] } });
        break;
      case "turn/start": {
        const tid = params.threadId,
          turn = randomUUID();
        turns.set(turn, { ended: false });
        reply({ turn: { id: turn, status: "inProgress", items: [] } });
        out({ method: "turn/started", params: { threadId: tid, turn: { id: turn } } });
        setTimeout(
          () => run(tid, turn, JSON.parse(params.input[0].text)).catch((e) => complete(tid, turn, String(e), "failed")),
          20,
        );
        break;
      }
      case "turn/interrupt":
        reply({});
        complete(params.threadId, params.turnId, "Stub interrupted", "interrupted");
        break;
      default:
        out({ id, error: { code: -32601, message: `Fixture does not implement ${method}` } });
    }
  }
});
