import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createLiveCopy,
  liveDevEnvironment,
  livePortForName,
  livePortRange,
  liveStartCommand,
  parseLiveDevArgs,
  removeLiveCopy,
  resolveLiveLayout,
  validateLiveName,
} from "./live-dev";

const root = resolve("live-root-for-tests");

describe("live copy for bots", () => {
  it("accepts safe names and rejects path tricks", () => {
    expect(validateLiveName("bot-1")).toBe("bot-1");
    for (const bad of ["", "..", "a/b", "a\\b", "A", "-x", "x".repeat(33), "bot 1"]) {
      expect(() => validateLiveName(bad)).toThrow("copy name");
    }
    expect(() => validateLiveName(undefined)).toThrow("copy name");
  });

  it("gives every copy its own worktree, data folder and home below the root", () => {
    const a = resolveLiveLayout(root, "alpha");
    const b = resolveLiveLayout(root, "beta");
    expect(a.worktree).toBe(join(root, "alpha", "checkout"));
    expect(a.appData).toBe(join(root, "alpha", "appdata"));
    expect(a.home).toBe(join(root, "alpha", "home"));
    expect(a.branch).toBe("live/alpha");
    expect(new Set([a.worktree, a.appData, a.home, b.worktree, b.appData, b.home]).size).toBe(6);
  });

  it("derives a stable port in the live range", () => {
    expect(livePortForName("alpha")).toBe(livePortForName("alpha"));
    for (const name of ["a", "alpha", "beta", "x".repeat(32)]) {
      const port = livePortForName(name);
      expect(port).toBeGreaterThanOrEqual(livePortRange.first);
      expect(port).toBeLessThanOrEqual(livePortRange.last);
    }
  });

  it("moves data and home of the copy and passes no tokens of the owner", () => {
    const layout = resolveLiveLayout(root, "alpha");
    const env = liveDevEnvironment(layout, 5300, {
      PATH: "p",
      GITHUB_TOKEN: "secret-1",
      OPENAI_API_KEY: "secret-2",
      APPDATA: "C:\\real\\appdata",
      USERPROFILE: "C:\\real\\home",
    });
    expect(env.APPDATA).toBe(layout.appData);
    expect(env.USERPROFILE).toBe(layout.home);
    expect(env.HOME).toBe(layout.home);
    expect(env.OPENBOT_DEV_PROFILE).toBe("app");
    expect(env.OPENBOT_APP_VARIANT).toBe("dev");
    expect(env.OPENBOT_DEV_RENDERER_PORT).toBe("5300");
    expect(env.PATH).toBe("p");
    expect(JSON.stringify(env)).not.toContain("secret");
    expect(JSON.stringify(env)).not.toContain("real");
  });

  it("builds a start command in the copy's own checkout and output folder", () => {
    const layout = resolveLiveLayout(root, "alpha");
    const command = liveStartCommand(layout);
    expect(command[0]?.startsWith(layout.worktree)).toBe(true);
    expect(command).toContain("out-dev-live");
    expect(command[1]).toBe("dev");
  });

  it("parses commands, options and rejects bad input", () => {
    expect(parseLiveDevArgs(["alpha"], root)).toMatchObject({ command: "plan", name: "alpha", root, base: "HEAD" });
    const created = parseLiveDevArgs(["create", "alpha", "--port", "5400", "--base", "main"], root);
    expect(created).toMatchObject({ command: "create", port: 5400, base: "main" });
    expect(parseLiveDevArgs(["remove", "alpha", "--root", "other"], root).root).toBe(resolve("other"));
    expect(() => parseLiveDevArgs(["create"], root)).toThrow("copy name");
    expect(() => parseLiveDevArgs(["create", "a", "b"], root)).toThrow("exactly one");
    expect(() => parseLiveDevArgs(["alpha", "--port", "80"], root)).toThrow("--port");
    expect(() => parseLiveDevArgs(["alpha", "--port"], root)).toThrow("needs a value");
    expect(() => parseLiveDevArgs(["alpha", "--base", "--force"], root)).toThrow("needs a value");
    expect(() => parseLiveDevArgs(["alpha", "--start"], root)).toThrow("Unknown option");
  });

  it("creates the worktree on its own branch and the empty data folders, nothing else", () => {
    const calls: string[][] = [];
    const made: string[] = [];
    const layout = createLiveCopy(
      parseLiveDevArgs(["create", "alpha", "--base", "main"], root),
      (args) => {
        calls.push(args);
        return { ok: true, output: "" };
      },
      { exists: () => false, mkdir: (path) => made.push(path) },
    );
    expect(calls).toEqual([["worktree", "add", "-b", "live/alpha", layout.worktree, "main"]]);
    expect(made).toContain(layout.appData);
    expect(made).toContain(layout.home);
  });

  it("refuses to overwrite an existing copy and reports a failed git call", () => {
    const options = parseLiveDevArgs(["create", "alpha"], root);
    expect(() =>
      createLiveCopy(options, () => ({ ok: true, output: "" }), { exists: () => true, mkdir: () => {} }),
    ).toThrow("already exists");
    expect(() =>
      createLiveCopy(options, () => ({ ok: false, output: "fatal: bad" }), { exists: () => false, mkdir: () => {} }),
    ).toThrow("git worktree add failed: fatal: bad");
  });

  it("removes only the copy's own folders and keeps the branch", () => {
    const removed: string[] = [];
    const calls: string[][] = [];
    const layout = removeLiveCopy(
      parseLiveDevArgs(["remove", "alpha"], root),
      (args) => {
        calls.push(args);
        return { ok: true, output: "" };
      },
      (path) => removed.push(path),
    );
    expect(calls).toEqual([["worktree", "remove", "--force", layout.worktree]]);
    expect(removed).toEqual([layout.appData, layout.home]);
    expect(calls.flat()).not.toContain("branch");
  });
});
