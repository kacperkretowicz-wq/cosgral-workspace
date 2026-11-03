import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./dev-both.mjs", import.meta.url));

test("dev-both runs a pnpm shim and propagates its failure", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "paperclip-dev-both-"));
  try {
    const shim = path.join(dir, process.platform === "win32" ? "pnpm.cmd" : "pnpm");
    writeFileSync(shim, process.platform === "win32" ? "@echo shim-ran\r\n@exit /b 7\r\n" : "#!/bin/sh\necho shim-ran\nexit 7\n");
    if (process.platform !== "win32") chmodSync(shim, 0o755);
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}` },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.error, undefined);
    assert.match(result.stdout, /shim-ran/);
    assert.equal(result.status, 7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
