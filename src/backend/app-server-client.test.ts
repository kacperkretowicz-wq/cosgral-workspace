// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { CodexAppServerClient } from "./app-server-client";
import { decodeRecordResponse, isRecord } from "./protocol";
import { writeFakeCli } from "./testing/fake-cli";

const temporaryRoots: string[] = [];
const clients: CodexAppServerClient[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.stop()));
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("CodexAppServerClient", () => {
  it("matches responses and receives notifications over stdio", async () => {
    const executable = await createFakeCodex();
    const client = createClient(executable, 5_000);
    const notifications: string[] = [];
    client.on("notification", (notification) => notifications.push(notification.method));
    client.start();

    const result = await client.request("test/echo", { text: "hello" }, decodeEchoResponse);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result).toEqual({ echoed: "hello" });
    expect(notifications).toContain("test/notification");
  });

  it("rejects timed out requests", async () => {
    const executable = await createFakeCodex();
    const client = createClient(executable, 30);
    client.start();

    await expect(client.request("test/timeout", {}, decodeRecordResponse)).rejects.toThrow("timed out");
  });

  it("surfaces RPC errors with their code", async () => {
    const client = createClient(await createFakeCodex(), 5_000);
    client.start();

    await expect(client.request("test/error", {}, decodeRecordResponse)).rejects.toMatchObject({
      name: "AppServerError",
      code: 412,
      message: "Fake RPC failure",
    });
  });

  it("does not surface output that arrives after stop", async () => {
    const client = createClient(await createFakeCodex(), 5_000);
    const notifications: string[] = [];
    client.on("notification", (notification) => notifications.push(notification.method));
    client.start();
    await client.request("test/echo", { text: "ready" }, decodeEchoResponse);

    await client.stop();
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(notifications).not.toContain("test/late");
  });

  it("resets fragmented JSON state when restarted after a process crash", async () => {
    const client = createClient(await createFakeCodex(), 5_000);
    client.start();
    await expect(client.request("test/partial-exit", {}, decodeRecordResponse)).rejects.toThrow("exited");

    client.start();
    await expect(client.request("test/echo", { text: "after restart" }, decodeEchoResponse)).resolves.toEqual({
      echoed: "after restart",
    });
  });
});

function decodeEchoResponse(value: unknown): { echoed: string } {
  if (!isRecord(value)) throw new Error("Invalid echo response.");
  const echoed = value.echoed;
  if (!isString(echoed)) throw new Error("Invalid echo response.");
  return { echoed };
}

function createClient(executable: string, timeout: number): CodexAppServerClient {
  const client = new CodexAppServerClient(executable, timeout);
  clients.push(client);
  return client;
}

async function createFakeCodex(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "openbot-fake-codex-"));
  temporaryRoots.push(root);
  // COSGRAL: a folder with a space, like "C:\Users\First Last\AppData\Roaming\npm".
  return writeFakeCli(
    join(root, "Codex CLI"),
    "codex",
    `let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ method: "test/late", params: {} }) + "\\n");
});
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\\n");
  while (newline >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (line) {
      const message = JSON.parse(line);
      if (message.method === "test/echo") {
        const response = JSON.stringify({ id: message.id, result: { echoed: message.params.text } }) + "\\n";
        const middle = Math.floor(response.length / 2);
        process.stdout.write(response.slice(0, middle));
        process.stdout.write(response.slice(middle));
        process.stdout.write(JSON.stringify({ method: "test/notification", params: {} }) + "\\n");
      } else if (message.method === "test/error") {
        process.stdout.write(JSON.stringify({ id: message.id, error: { code: 412, message: "Fake RPC failure" } }) + "\\n");
      } else if (message.method === "test/partial-exit") {
        process.stdout.write('{"id":');
        process.exit(9);
      }
    }
    newline = buffer.indexOf("\\n");
  }
});
`,
  );
}
