import { describe, expect, it } from "vitest";
import { cleanEnvironment } from "./sandbox-env.ts";

describe("sandbox environment", () => {
  it("drops sign-in and token variables and keeps the rest", () => {
    const clean = cleanEnvironment({
      PATH: "C:\tools",
      CLAUDE_CONFIG_DIR: "x",
      OPENBOT_CODEX_PATH: "x",
      GIT_CONFIG_GLOBAL: "x",
      GITHUB_TOKEN: "x",
      MY_API_KEY: "x",
      SystemRoot: "C:Windows",
    });
    expect(Object.keys(clean).sort()).toEqual(["PATH", "SystemRoot"]);
  });
});
