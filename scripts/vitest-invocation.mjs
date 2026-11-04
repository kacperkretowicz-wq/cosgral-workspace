import path from "node:path";

// pnpm exec uses a Windows command shim and its shorter shell command limit.
// Invoke the installed Vitest CLI with Node so long shard filters stay literal.
export function vitestInvocation(args, { platform = process.platform, root = process.cwd() } = {}) {
  return platform === "win32"
    ? { command: process.execPath, args: [path.join(root, "node_modules/vitest/vitest.mjs"), ...args] }
    : { command: "pnpm", args: ["exec", "vitest", ...args] };
}
