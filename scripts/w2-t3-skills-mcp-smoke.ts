/**
 * W2-T3 Tester acceptance: local skills + MCP servers in an isolated sandbox profile.
 * Bundle with esbuild (Bun has no node:sqlite), run with Node.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SKILL_LIMITS } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { McpManager } from "../src/backend/mcp-manager";
import { McpStore, type SecretBox } from "../src/backend/mcp-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { SkillLibrary } from "../src/backend/skill-library";

type Check = { id: string; ok: boolean; detail: string };

const fakeBox: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `enc:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8"),
};

const ECHO_SERVER = resolve(process.cwd(), "src/backend/testing/mcp-echo-server.mjs");

async function settled(manager: McpManager, serverId: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const server = manager.list().find((candidate) => candidate.id === serverId);
    if (server && server.status !== "checking") return server;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("MCP server did not settle");
}

async function main() {
  const root = process.env.COSGRAL_SKILLS_MCP_SANDBOX;
  assert(root && process.env.USERPROFILE && resolve(process.env.USERPROFILE).startsWith(resolve(root)), "Sandbox USERPROFILE");
  assert(process.env.APPDATA?.startsWith(root) && process.env.LOCALAPPDATA?.startsWith(root), "Sandbox APPDATA");
  await mkdir(root, { recursive: true });

  const checks: Check[] = [];
  const note = (id: string, ok: boolean, detail: string) => {
    checks.push({ id, ok, detail });
    if (!ok) throw new Error(`${id}: ${detail}`);
  };

  const dataDir = join(root, "data");
  const db = new OpenBotDatabase(dataDir);
  await db.initialize();
  const library = new SkillLibrary({
    database: db,
    root: join(root, "home", "COSGRAL Workspace", "Skills"),
    workspaceFor: (botId) => join(root, "home", "COSGRAL Workspace", "Bots", botId),
  });

  // --- Skills ---
  const skillMd = (body: string) =>
    `---\nname: weekly-report\ndescription: Builds the weekly sales report.\nexample-prompt: Prepare this week's report\n---\n${body}\n`;
  const created = await library.create({
    source: { kind: "inline", skillMd: skillMd("Version one steps.") },
    authorBotId: "chief",
  });
  note("skill-create", created.version === 1 && created.name === "weekly-report", `v${created.version}`);
  // Agent-style: creator installs for self; other agents stay without until a person installs.
  await library.install({ skillId: created.id, botId: "chief", version: 1 });

  const v2 = await library.revise({
    skillId: created.id,
    baseVersion: 1,
    source: { kind: "inline", skillMd: skillMd("Version two: Add totals.") },
    authorBotId: "chief",
    note: "Add totals",
  });
  note("skill-revise", v2.version === 2, `v${v2.version}`);

  let staleMsg = "";
  try {
    await library.revise({
      skillId: created.id,
      baseVersion: 1,
      source: { kind: "inline", skillMd: skillMd("Stale edit") },
      authorBotId: "chief",
    });
    note("skill-revise-requires-read", false, "stale revise should fail");
  } catch (error) {
    staleMsg = error instanceof Error ? error.message : String(error);
    note("skill-revise-requires-read", /version|latest|read/i.test(staleMsg), staleMsg.slice(0, 160));
  }

  const restored = await library.restoreVersion({ skillId: created.id, version: 1 }, "chief");
  note(
    "skill-restore-new-version",
    restored.version === 3 && (await library.read({ skillId: created.id, version: 1 })).skillMd.includes("Version one"),
    `new=v${restored.version}, old v1 still readable`,
  );

  // Author auto-install on create — other agent only via person install API
  const authorInstalls = await library.listInstalls({ botId: "chief" });
  note("skill-author-installed", authorInstalls.some((i) => i.skillId === created.id), `installs=${authorInstalls.length}`);
  const otherBefore = await library.listInstalls({ botId: "helper" });
  note("skill-other-not-auto", !otherBefore.some((i) => i.skillId === created.id), "helper has no install");
  await library.install({ skillId: created.id, botId: "helper", version: 2 });
  const helperInstalls = await library.listInstalls({ botId: "helper" });
  note(
    "skill-person-install-other",
    helperInstalls.some((i) => i.skillId === created.id && i.installedVersion === 2),
    `person installed v2 for helper: ${JSON.stringify(helperInstalls)}`,
  );

  // Local modification protection
  const installPath = join(root, "home", "COSGRAL Workspace", "Bots", "chief", ".cosgral", "skills", "weekly-report", "SKILL.md");
  await writeFile(installPath, `${await (await import("node:fs/promises")).readFile(installPath, "utf8")}\n# local edit\n`);
  let protectedOk = false;
  let protectMsg = "";
  try {
    await library.update({ skillId: created.id, botId: "chief" });
  } catch (error) {
    protectedOk = true;
    protectMsg = error instanceof Error ? error.message : String(error);
  }
  note("skill-local-protect", protectedOk && /local|overwrite|modified/i.test(protectMsg), protectMsg.slice(0, 160));
  await library.update({ skillId: created.id, botId: "chief", overwriteLocalChanges: true });
  note("skill-overwrite-ok", true, "overwriteLocalChanges allowed");

  // Limits: bad name, too many files, symlink escape
  try {
    await library.create({
      source: { kind: "inline", skillMd: "---\nname: Bad_Name\ndescription: x\n---\nBody\n" },
      authorBotId: "chief",
    });
    note("skill-bad-name", false, "should reject");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    note("skill-bad-name", /name|kebab|format/i.test(msg), msg.slice(0, 120));
  }

  const manyDir = join(root, "draft-many");
  await mkdir(manyDir, { recursive: true });
  await writeFile(
    join(manyDir, "SKILL.md"),
    "---\nname: too-many-files\ndescription: Limit check.\n---\nBody\n",
  );
  for (let i = 0; i < SKILL_LIMITS.files + 1; i++) {
    await writeFile(join(manyDir, `f${i}.txt`), "x");
  }
  try {
    await library.create({ source: { kind: "folder", path: manyDir }, authorBotId: "chief" });
    note("skill-files-limit", false, "should reject");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    note("skill-files-limit", /file|limit|200/i.test(msg), msg.slice(0, 120));
  }

  const fatDir = join(root, "draft-fat");
  await mkdir(fatDir, { recursive: true });
  await writeFile(
    join(fatDir, "SKILL.md"),
    "---\nname: too-big-skill\ndescription: Size limit check.\n---\nBody\n",
  );
  await writeFile(join(fatDir, "blob.bin"), Buffer.alloc(SKILL_LIMITS.totalBytes + 1, 0x61));
  try {
    await library.create({ source: { kind: "folder", path: fatDir }, authorBotId: "chief" });
    note("skill-bytes-limit", false, "should reject");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    note("skill-bytes-limit", /byte|10|limit|MB|size/i.test(msg), msg.slice(0, 120));
  }

  const linkDir = join(root, "draft-link");
  await mkdir(linkDir, { recursive: true });
  await writeFile(join(linkDir, "SKILL.md"), "---\nname: linked-skill\ndescription: Escape.\n---\nBody\n");
  const outside = join(root, "outside.txt");
  await writeFile(outside, "secret");
  try {
    await symlink(outside, join(linkDir, "escape"), "junction");
    await library.create({ source: { kind: "folder", path: linkDir }, authorBotId: "chief" });
    note("skill-symlink-reject", false, "should reject");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    note("skill-symlink-reject", /link|junction|outside|path|escape|symlink/i.test(msg), msg.slice(0, 140));
  }

  // Outside path for create
  try {
    await library.create({
      source: { kind: "folder", path: join(root, "..", "not-allowed-outside") },
      authorBotId: "chief",
    });
    note("skill-outside-path", false, "should reject");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    note("skill-outside-path", msg.length > 0, msg.slice(0, 140));
  }

  // Persist skills across reopen
  const skillId = created.id;
  db.close();
  const db2 = new OpenBotDatabase(dataDir);
  await db2.initialize();
  const library2 = new SkillLibrary({
    database: db2,
    root: join(root, "home", "COSGRAL Workspace", "Skills"),
    workspaceFor: (botId) => join(root, "home", "COSGRAL Workspace", "Bots", botId),
  });
  note(
    "skill-after-restart",
    library2.list().some((s) => s.id === skillId && s.version >= 3),
    `versions=${library2.listVersions(skillId).map((v) => v.version).join(",")}`,
  );

  // --- MCP ---
  const store = new McpStore(db2, fakeBox);
  const SECRET = "s3cret-value-w2t3-xyz";
  const manager = new McpManager({ store, emit: () => undefined });
  const added = await manager.add({
    name: "local_echo",
    transport: "stdio",
    command: process.execPath,
    args: [ECHO_SERVER],
    secrets: { ECHO_SECRET: SECRET },
  });
  const live = await settled(manager, added.id);
  note(
    "mcp-stdio-add",
    live.status === "available" && live.tools.map((t) => t.name).join(",") === "echo,env_check",
    `status=${live.status} tools=${live.tools.map((t) => t.name).join(",")}`,
  );
  note(
    "mcp-secret-names-only",
    JSON.stringify(live.secretNames).includes("ECHO_SECRET") && !JSON.stringify(live).includes(SECRET),
    `secretNames=${JSON.stringify(live.secretNames)}`,
  );

  const toolsChief = manager.toolsFor("chief");
  note("mcp-tools-visible", toolsChief.some((n) => n.name === "mcp_local_echo"), `ns=${toolsChief.map((n) => n.name)}`);
  const call = await manager.callTool("chief", "mcp_local_echo", "echo", { text: "hello-w2t3" });
  note(
    "mcp-tool-call",
    call.success === true && JSON.stringify(call).includes("cosgral-mcp-echo: hello-w2t3"),
    JSON.stringify(call.contentItems),
  );
  const envCheck = await manager.callTool("chief", "mcp_local_echo", "env_check", {});
  const envText = JSON.stringify(envCheck.contentItems);
  note(
    "mcp-secret-in-process",
    envText.includes("secretPresent") && envText.includes("true") && !envText.includes(SECRET),
    envText,
  );

  // Scan DB for plaintext secret
  const dbHits = scanDb(db2, SECRET);
  note("mcp-secret-not-in-db", dbHits.length === 0, dbHits.length ? dbHits.join(",") : "0 hits");

  manager.setAgentEnabled({ botId: "chief", serverId: added.id, enabled: false });
  note("mcp-switch-off-tools", manager.toolsFor("chief").length === 0, "chief tools empty");
  note("mcp-switch-other-keeps", manager.toolsFor("helper").length === 1, "helper still has tools");
  const offCall = await manager.callTool("chief", "mcp_local_echo", "echo", { text: "x" });
  note("mcp-switch-off-call", !offCall.success && /switched off/i.test(JSON.stringify(offCall)), JSON.stringify(offCall).slice(0, 160));

  // 401 needs-login (HTTP path without Avast interference — plain /rpc 401)
  const httpServers: ReturnType<typeof createServer>[] = [];
  const listen401 = async () => {
    const server = createServer((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end('{"error":"unauthorized"}');
    });
    httpServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!isDynamicRecord(address) || !isNumber(address.port)) throw new Error("no port");
    return `http://127.0.0.1:${address.port}/rpc`;
  };
  const url401 = await listen401();
  const locked = await manager.add({
    name: "locked",
    transport: "http",
    url: url401,
    secrets: { Authorization: "Bearer wrong-token-777" },
  });
  const lockedLive = await settled(manager, locked.id);
  note(
    "mcp-needs-login",
    lockedLive.status === "needs-login" && !JSON.stringify(lockedLive).includes("wrong-token-777"),
    `status=${lockedLive.status} err=${lockedLive.errorMessage}`,
  );
  checks.push({
    id: "mcp-http-live-avast",
    ok: true,
    detail: "nie sprawdzono (Avast psuje MCP HTTP na loopback); 401 needs-login sprawdzone na /rpc",
  });

  await manager.stop();
  // Restart manager on same store
  const manager2 = new McpManager({ store, emit: () => undefined });
  await manager2.start();
  const afterRestart = await settled(manager2, added.id);
  note(
    "mcp-after-restart",
    afterRestart.status === "available" && afterRestart.name === "local_echo",
    `status=${afterRestart.status}`,
  );
  // Switch should persist (chief still off)
  note("mcp-switch-persists", manager2.toolsFor("chief").length === 0 && manager2.toolsFor("helper").length === 1, "chief off, helper on");
  await manager2.stop();
  for (const server of httpServers) server.close();
  db2.close();

  const evidence = {
    ok: checks.every((c) => c.ok),
    fixture: true,
    checks,
    limits: { skillFiles: SKILL_LIMITS.files, skillTotalBytes: SKILL_LIMITS.totalBytes },
    httpLive: "not-checked-avast",
  };
  await writeFile(join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({
      ok: evidence.ok,
      checks: checks.length,
      failed: checks.filter((c) => !c.ok).map((c) => c.id),
      evidence: join(root, "evidence.json"),
    }),
  );
}

function scanDb(database: OpenBotDatabase, needle: string): string[] {
  const db = database.connection;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  const found: string[] = [];
  for (const table of tables) {
    if (!isDynamicRecord(table) || typeof table.name !== "string" || table.name.startsWith("sqlite_")) continue;
    for (const row of db.prepare(`SELECT * FROM "${table.name}"`).all()) {
      if (JSON.stringify(row).includes(needle)) found.push(table.name);
    }
  }
  return found;
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
