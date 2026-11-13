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
  if (task.title.startsWith("VAULT SMOKE")) {
    // W2: sign in on a local test page with a Vault login and two-step code; the agent never sees the values.
    const use = async (namespace, tool, args) => {
      const response = await call(threadId, turnId, tool, args, namespace);
      if (!response.success) throw new Error(`${tool}: ${response.contentItems[0]?.text}`);
      return JSON.parse(response.contentItems[0].text);
    };
    const items = await use("cosgral_vault", "list_vault_items", {});
    const opened = await use("openbot_browser", "open", { url: `${process.env.COSGRAL_VAULT_SITE}/login` });
    const tabId = opened.tab.id;
    const first = await use("openbot_browser", "snapshot", { tabId });
    const refIn = (snapshot, label) => snapshot.elements.find((element) => element.name === label)?.ref;
    const filled = await use("cosgral_vault", "fill_login", {
      tabId,
      revision: first.revision,
      usernameRef: refIn(first, "User name"),
      passwordRef: refIn(first, "Password"),
    });
    const after = await use("openbot_browser", "snapshot", { tabId });
    const code = await use("cosgral_vault", "fill_totp", {
      tabId,
      revision: after.revision,
      ref: refIn(after, "One-time code"),
    });
    let welcome = null;
    for (let attempt = 0; attempt < 40 && !welcome?.text?.includes("Signed in as"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      welcome = await use("openbot_browser", "snapshot", { tabId }).catch(() => null);
    }
    complete(threadId, turnId, JSON.stringify({ items, filled, after, code, welcome: welcome?.text ?? "" }));
    return;
  }
  if (task.title.startsWith("SKILL SMOKE")) {
    // W2: the agent creates a skill, reads it, revises it from the version it read and installs the new version.
    const skill = async (tool, args) => {
      const response = await call(threadId, turnId, tool, args, "cosgral_skills");
      if (!response.success) throw new Error(`${tool}: ${response.contentItems[0]?.text}`);
      return JSON.parse(response.contentItems[0].text);
    };
    await skill("create_skill", {
      skillMd: "---\nname: weekly-report\ndescription: Builds the weekly report.\n---\n1. Read the table.\n",
    });
    const read = await skill("read_local_skill", { name: "weekly-report" });
    await skill("revise_skill", {
      name: "weekly-report",
      baseVersion: read.version,
      skillMd:
        "---\nname: weekly-report\ndescription: Builds the weekly report with totals.\n---\n1. Read the table.\n2. Add totals.\n",
      note: "Add totals",
    });
    await skill("install_local_skill", { name: "weekly-report" });
    complete(threadId, turnId, "Stub: skill created and revised");
    return;
  }
  if (task.title.startsWith("SKILL CHECK")) {
    const instructions = threads.get(threadId).developerInstructions;
    complete(
      threadId,
      turnId,
      instructions.includes("weekly-report (version 2)") ? "Stub: skill in instructions" : "Stub: skill missing",
    );
    return;
  }
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
// W2-BE3: direct turns (plain text, not a channel context). Shared tables and the file library, fixture data only.
const seenRows = new Map();
async function direct(threadId, turnId, text, cwd) {
  const use = async (namespace, tool, args) => {
    const response = await call(threadId, turnId, tool, args, namespace);
    if (!response.success) throw new Error(`${tool}: ${response.contentItems[0]?.text}`);
    return JSON.parse(response.contentItems[0].text);
  };
  if (text.includes("DATA CREATE")) {
    const created = await use("cosgral_tables", "create_table", {
      name: "Sandbox leads",
      columns: [
        { name: "company", type: "text" },
        { name: "value", type: "number" },
        { name: "won", type: "boolean" },
      ],
    });
    const inserted = await use("cosgral_tables", "insert_rows", {
      table: "Sandbox leads",
      rows: [{ company: "Test Co", value: 100, won: false }],
    });
    complete(threadId, turnId, `DATA-RESULT ${JSON.stringify({ created, inserted })}`);
    return;
  }
  if (text.includes("DATA READ")) {
    const read = await use("cosgral_tables", "query_rows", {
      table: "sandbox leads",
      filters: [{ column: "company", op: "eq", value: "Test Co" }],
    });
    const row = read.rows[0];
    seenRows.set(threadId, { rowId: row.id, version: row.version });
    complete(
      threadId,
      turnId,
      `DATA-RESULT ${JSON.stringify({ rowId: row.id, version: row.version, note: read.note })}`,
    );
    return;
  }
  const write = /DATA WRITE (\d+)/.exec(text);
  if (write) {
    const seen = seenRows.get(threadId);
    const response = await call(
      threadId,
      turnId,
      "update_row",
      { table: "Sandbox leads", rowId: seen.rowId, expectedVersion: seen.version, values: { value: Number(write[1]) } },
      "cosgral_tables",
    );
    complete(threadId, turnId, `DATA-RESULT ${response.contentItems[0].text}`);
    return;
  }
  const file = /DATA FILE to (\S+)/.exec(text);
  if (file) {
    require("node:fs").writeFileSync(
      require("node:path").join(cwd, "sandbox-report.md"),
      "# Sandbox report\nFixture data only.\n",
    );
    const saved = await use("cosgral_library", "save_file", { path: "sandbox-report.md" });
    const got = await use("cosgral_library", "get_file", { fileId: saved.file.id });
    const sent = await use("openbot", "send_message", {
      recipientBotIds: [file[1]],
      text: "Sandbox report attached",
      paths: [got.path],
    });
    complete(threadId, turnId, `DATA-RESULT ${JSON.stringify({ saved, path: got.path, sent })}`);
    return;
  }
  complete(threadId, turnId, "Stub: received");
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
        let context = null;
        try {
          context = JSON.parse(params.input[0].text);
        } catch {
          context = null;
        }
        setTimeout(
          () =>
            (context ? run(tid, turn, context) : direct(tid, turn, params.input[0]?.text ?? "", params.cwd)).catch(
              (e) => complete(tid, turn, String(e), "failed"),
            ),
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
