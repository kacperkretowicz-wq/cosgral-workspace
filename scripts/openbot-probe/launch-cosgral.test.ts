// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installCliFixture } from "./launch-cosgral.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("our own app for the probe", () => {
  it("writes the stand-in CLI next to the sandbox, never into the repository", async () => {
    const base = await mkdtemp(join(tmpdir(), "probe-cosgral-"));
    roots.push(base);
    const repo = join(base, "repo");
    await mkdir(join(repo, "scripts"), { recursive: true });
    await writeFile(join(repo, "scripts", "acceptance-codex.cjs"), "// stand-in");
    const root = join(base, "sandbox");
    const command = await installCliFixture(root, repo);
    expect(command).toBe(join(root, "fixture", "codex.cmd"));
    expect(await readFile(command, "utf8")).toContain("ELECTRON_RUN_AS_NODE=1");
    expect(await readFile(join(root, "fixture", "codex.cjs"), "utf8")).toBe("// stand-in");
  });
});
