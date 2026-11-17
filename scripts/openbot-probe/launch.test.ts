import { describe, expect, it } from "vitest";
import { probeLaunch } from "./launch.ts";

describe("probe launch", () => {
  const source = {
    PATH: "C:\\tools",
    SystemRoot: "C:\\Windows",
    CLAUDE_CONFIG_DIR: "owner",
    OPENBOT_CODEX_PATH: "owner",
    ANTHROPIC_API_KEY: "owner",
    GITHUB_TOKEN: "owner",
    USERPROFILE: "C:\\Users\\owner",
    APPDATA: "C:\\Users\\owner\\AppData\\Roaming",
  };

  it("removes sign-in variables and points the profile folders into the sandbox", () => {
    const { env } = probeLaunch({ exe: "x.exe", root: "D:\\sb", port: 9341, source });
    expect(Object.keys(env)).not.toContain("CLAUDE_CONFIG_DIR");
    expect(Object.keys(env)).not.toContain("OPENBOT_CODEX_PATH");
    expect(Object.keys(env)).not.toContain("GITHUB_TOKEN");
    expect(env.PATH).toBe("C:\\tools");
    for (const key of ["USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"]) {
      expect(env[key]?.startsWith("D:\\sb") || env[key]?.startsWith("D:/sb"), key).toBe(true);
    }
  });

  it("gives the copy its own data folder per start and a debug port on this computer only", () => {
    const first = probeLaunch({ exe: "x.exe", root: "D:\\sb", port: 9341, source, stamp: "a" });
    const second = probeLaunch({ exe: "x.exe", root: "D:\\sb", port: 9342, source, stamp: "b" });
    expect(first.args).toContain("--remote-debugging-port=9341");
    expect(first.args).toContain("--remote-debugging-address=127.0.0.1");
    expect(first.args.find((arg) => arg.startsWith("--user-data-dir="))).not.toBe(
      second.args.find((arg) => arg.startsWith("--user-data-dir=")),
    );
    expect(first.args).toContain("--lang=en-US");
  });

  it("puts extra arguments last and extra variables after the clean ones (our own app with a stand-in CLI)", () => {
    const { args, env } = probeLaunch({
      exe: "electron.exe",
      root: "D:/sb",
      port: 9343,
      source,
      extraArgs: ["D:/repo"],
      extraEnv: { OPENBOT_CODEX_PATH: "D:/sb/fixture/codex.cmd" },
    });
    expect(args.at(-1)).toBe("D:/repo");
    expect(env.OPENBOT_CODEX_PATH).toBe("D:/sb/fixture/codex.cmd");
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it("refuses a port that is not a plain unprivileged number", () => {
    for (const port of [0, 80, 70_000, 9341.5]) {
      expect(() => probeLaunch({ exe: "x.exe", root: "D:\\sb", port, source })).toThrow();
    }
  });
});
