import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vitestInvocation } from "../vitest-invocation.mjs";

test("Windows invocation preserves long shard arguments without a command shell", async () => {
  const root = await mkdtemp(join(tmpdir(), "vitest invocation "));
  try {
    await mkdir(join(root, "node_modules/vitest"), { recursive: true });
    await writeFile(join(root, "node_modules/vitest/vitest.mjs"), "process.stdout.write(JSON.stringify(process.argv.slice(2)))");
    const args = ["list", ...Array.from({ length: 200 }, (_, index) => `a long path/chat.test.ts:${index}`), 'literal&$(quote)"'];
    args.push("x".repeat(9000));
    const invocation = vitestInvocation(args, { platform: "win32", root });
    const result = spawnSync(invocation.command, invocation.args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), args);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("Unix invocation retains pnpm PATH behavior", () => {
  assert.deepEqual(vitestInvocation(["run"], { platform: "linux" }), { command: "pnpm", args: ["exec", "vitest", "run"] });
});
