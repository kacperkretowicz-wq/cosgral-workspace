// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodexCliError,
  cliCommand,
  findSystemCli,
  parseClaudeVersion,
  parseCodexVersion,
  resolveClaudeCli,
  resolveCodexCli,
  setManagedCliResolver,
  windowsFallbackPaths,
} from "./cli";

const originalAppData = process.env.APPDATA;
const originalLocalAppData = process.env.LOCALAPPDATA;
const originalPath = process.env.PATH;
const temporaryPaths: string[] = [];

afterEach(async () => {
  restoreEnvironment("APPDATA", originalAppData);
  restoreEnvironment("LOCALAPPDATA", originalLocalAppData);
  restoreEnvironment("PATH", originalPath);
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("Codex CLI version parsing", () => {
  it("reads the installed CLI version format", () => {
    expect(parseCodexVersion("codex-cli 0.144.1\n")).toBe("0.144.1");
  });

  it("fails closed on an unknown format", () => {
    expect(() => parseCodexVersion("Codex development build")).toThrow(CodexCliError);
  });
});

describe("Claude CLI version parsing", () => {
  it("reads the installed CLI version format", () => {
    expect(parseClaudeVersion("2.1.231 (Claude Code)\n")).toBe("2.1.231");
  });

  it("fails closed on an unknown format", () => {
    expect(() => parseClaudeVersion("Claude development build")).toThrow(CodexCliError);
  });
});

describe("CLI command lines", () => {
  it("quotes a Windows command shim whose path contains spaces", () => {
    expect(
      cliCommand(
        "C:\\Users\\Jane Doe\\AppData\\Roaming\\npm\\codex.cmd",
        ["app-server", "--listen", "stdio://"],
        "win32",
        "C:\\Windows\\system32\\cmd.exe",
      ),
    ).toEqual({
      command: "C:\\Windows\\system32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        '""C:\\Users\\Jane Doe\\AppData\\Roaming\\npm\\codex.cmd" app-server --listen stdio://"',
      ],
      windowsVerbatimArguments: true,
    });
  });

  it("runs native executables directly, without a shell", () => {
    expect(cliCommand("C:\\Users\\Jane Doe\\.local\\bin\\claude.exe", ["auth", "status", "--json"], "win32")).toEqual({
      command: "C:\\Users\\Jane Doe\\.local\\bin\\claude.exe",
      args: ["auth", "status", "--json"],
      windowsVerbatimArguments: false,
    });
    expect(cliCommand("/opt/homebrew/bin/codex", ["--version"], "darwin")).toEqual({
      command: "/opt/homebrew/bin/codex",
      args: ["--version"],
      windowsVerbatimArguments: false,
    });
  });

  it("refuses arguments that a command shim could reinterpret", () => {
    expect(() => cliCommand("C:\\npm\\codex.cmd", ["--version & calc"], "win32")).toThrow("Unsafe CLI argument");
  });
});

describe("Windows CLI fallback paths", () => {
  it("includes current installer paths", () => {
    const environment = {
      APPDATA: "C:\\Users\\Jane Doe\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\Jane Doe\\AppData\\Local",
    };

    expect(windowsFallbackPaths("codex", "C:\\Users\\Jane Doe", environment)).toContain(
      "C:\\Users\\Jane Doe\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe",
    );
    expect(windowsFallbackPaths("claude", "C:\\Users\\Jane Doe", environment)).toEqual(
      expect.arrayContaining([
        "C:\\Users\\Jane Doe\\AppData\\Local\\Microsoft\\WinGet\\Links\\claude.exe",
        "C:\\Users\\Jane Doe\\.local\\bin\\claude.exe",
        "C:\\Users\\Jane Doe\\AppData\\Roaming\\npm\\claude.cmd",
      ]),
    );
  });

  it.runIf(process.platform === "win32")("runs npm command shims when the user profile contains a space", async () => {
    await createWindowsNpmShims();
    await expect(resolveCodexCli()).resolves.toMatchObject({ version: "0.144.1" });
    await expect(resolveClaudeCli()).resolves.toMatchObject({ version: "2.1.231" });
  });

  it.runIf(process.platform === "win32")(
    "W5-BE1: uses the custom path alone, else the downloaded CLI before the system one",
    async () => {
      await createWindowsNpmShims();
      const root = await mkdtemp(join(tmpdir(), "openbot-cli-managed-"));
      temporaryPaths.push(root);
      const managed = join(root, "managed", "codex.cmd");
      const custom = join(root, "own folder", "codex.cmd");
      await mkdir(join(root, "managed"), { recursive: true });
      await mkdir(join(root, "own folder"), { recursive: true });
      await writeFile(managed, "@echo off\r\necho codex-cli 0.170.0\r\n");
      await writeFile(custom, "@echo off\r\necho codex-cli 0.150.0\r\n");
      let paths: { custom: string | null; managed: string | null } = { custom: null, managed };
      setManagedCliResolver(() => paths);
      try {
        await expect(resolveCodexCli()).resolves.toEqual({ executable: managed, version: "0.170.0" });
        await expect(findSystemCli("codex")).resolves.toMatchObject({ version: "0.144.1" });
        paths = { custom, managed };
        await expect(resolveCodexCli()).resolves.toEqual({ executable: custom, version: "0.150.0" });
        paths = { custom: null, managed: null };
        await expect(resolveCodexCli()).resolves.toMatchObject({ version: "0.144.1" });
        await expect(resolveClaudeCli()).resolves.toMatchObject({ version: "2.1.231" });
      } finally {
        setManagedCliResolver(null);
      }
    },
  );

  it.runIf(process.platform === "win32")(
    "the CLI card sees the environment override the program really uses (no 'none' next to 'Available')",
    async () => {
      await createWindowsNpmShims();
      const root = await mkdtemp(join(tmpdir(), "openbot-cli-override-"));
      temporaryPaths.push(root);
      const override = join(root, "codex.cmd");
      await writeFile(override, "@echo off\r\necho codex-cli 0.160.0\r\n");
      const previous = process.env.OPENBOT_CODEX_PATH;
      process.env.OPENBOT_CODEX_PATH = override;
      try {
        await expect(resolveCodexCli()).resolves.toEqual({ executable: override, version: "0.160.0" });
        await expect(findSystemCli("codex")).resolves.toEqual({ executable: override, version: "0.160.0" });
      } finally {
        restoreEnvironment("OPENBOT_CODEX_PATH", previous);
      }
    },
  );

  it.runIf(process.platform === "win32")("reports a CLI that exists but cannot start", async () => {
    const root = await mkdtemp(join(tmpdir(), "openbot-cli-test-"));
    temporaryPaths.push(root);
    const appData = join(root, "User Name", "AppData", "Roaming");
    await mkdir(join(appData, "npm"), { recursive: true });
    await writeFile(join(appData, "npm", "codex.cmd"), "@echo off\r\nexit /b 1\r\n");
    useIsolatedWindowsEnvironment(appData, join(root, "missing-local-app-data"));

    await expect(resolveCodexCli()).rejects.toMatchObject({
      code: "invalid",
      message: "Codex CLI was found but could not be started. Run `codex --version` in a new terminal.",
    });
  });
});

async function createWindowsNpmShims(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "openbot-cli-test-"));
  temporaryPaths.push(root);
  const appData = join(root, "User Name", "AppData", "Roaming");
  const npmDirectory = join(appData, "npm");
  await mkdir(npmDirectory, { recursive: true });
  await Promise.all([
    writeFile(join(npmDirectory, "codex.cmd"), "@echo off\r\necho codex-cli 0.144.1\r\n"),
    writeFile(join(npmDirectory, "claude.cmd"), "@echo off\r\necho 2.1.231 (Claude Code)\r\n"),
  ]);
  useIsolatedWindowsEnvironment(appData, join(root, "missing-local-app-data"));
}

function useIsolatedWindowsEnvironment(appData: string, localAppData: string): void {
  process.env.APPDATA = appData;
  process.env.LOCALAPPDATA = localAppData;
  process.env.PATH = "";
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
