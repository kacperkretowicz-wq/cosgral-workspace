// @vitest-environment node
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  asciiJson,
  type HelperSpawnOptions,
  type SpawnProcess,
  sapiRate,
  WhisperCliRunner,
  WindowsSpeechDriver,
} from "./voice-windows";

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    setTimeout(() => this.emit("exit", null, "SIGTERM"), 1);
    return true;
  }
}

interface SpawnCall {
  command: string;
  args: string[];
  options: HelperSpawnOptions;
  stdin: string;
}

function fakeSpawn(script: (child: FakeChild, stdin: string) => void) {
  const calls: SpawnCall[] = [];
  const spawn: SpawnProcess = (command, args, options) => {
    const child = new FakeChild();
    const call: SpawnCall = { command, args, options, stdin: "" };
    calls.push(call);
    let input = "";
    child.stdin.on("data", (chunk: Buffer) => {
      input += chunk.toString("utf8");
    });
    child.stdin.on("finish", () => {
      call.stdin = input;
      script(child, input);
    });
    if (options.stdio[0] === "ignore") setTimeout(() => script(child, ""), 1);
    return child;
  };
  return { spawn, calls };
}

function decodeScript(args: string[]): string {
  const index = args.indexOf("-EncodedCommand");
  return Buffer.from(args[index + 1] ?? "", "base64").toString("utf16le");
}

describe("Windows voices (System.Speech through PowerShell 5.1)", () => {
  it("maps the speed 0.5–2 to the SAPI rate and keeps the stdin JSON plain ASCII", () => {
    expect([0.5, 1, 1.5, 2].map(sapiRate)).toEqual([-6, 0, 4, 6]);
    expect(asciiJson({ text: "Zażółć gęślą jaźń" })).toBe(
      '{"text":"Za\\u017c\\u00f3\\u0142\\u0107 g\\u0119\\u015bl\\u0105 ja\\u017a\\u0144"}',
    );
    expect(JSON.parse(asciiJson({ text: "Zażółć" })).text).toBe("Zażółć");
  });

  it("reads text with a fixed encoded script and the text on stdin, never as a script file or argument", async () => {
    const { spawn, calls } = fakeSpawn((child) => {
      child.stdout.end("ok");
      child.emit("exit", 0, null);
    });
    const driver = new WindowsSpeechDriver({ platform: "win32", spawn });
    await driver.speak(
      { text: "Cześć; $(Remove-Item C:\\)", voiceId: "Microsoft Paulina Desktop", rate: 1.5 },
      new AbortController().signal,
    );
    const call = calls[0];
    expect(call?.command).toBe("powershell.exe");
    expect(call?.args).toEqual(expect.arrayContaining(["-NoProfile", "-NonInteractive", "-EncodedCommand"]));
    expect(call?.args).not.toContain("-File");
    expect(call?.args).not.toContain("-ExecutionPolicy");
    expect(call?.args.join(" ")).not.toContain("Remove-Item");
    expect(decodeScript(call?.args ?? [])).toContain("System.Speech");
    expect(JSON.parse(call?.stdin ?? "{}")).toEqual({
      text: "Cześć; $(Remove-Item C:\\)",
      voice: "Microsoft Paulina Desktop",
      rate: 4,
      file: null,
    });
    expect(call?.options).toMatchObject({ windowsHide: true, shell: false });
  });

  it("stops at once by ending the helper", async () => {
    const { spawn, calls } = fakeSpawn(() => undefined);
    const driver = new WindowsSpeechDriver({ platform: "win32", spawn });
    const controller = new AbortController();
    const running = driver.speak({ text: "Long text", voiceId: null, rate: 1 }, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await expect(running).rejects.toThrow("stopped");
    expect(calls).toHaveLength(1);
  });

  it("lists enabled voices and explains a missing voice", async () => {
    const list = fakeSpawn((child) => {
      child.stdout.end(
        JSON.stringify([
          { id: "Microsoft Zira Desktop", name: "Microsoft Zira Desktop", culture: "en-US", gender: "Female" },
        ]),
      );
      child.emit("exit", 0, null);
    });
    expect(await new WindowsSpeechDriver({ platform: "win32", spawn: list.spawn }).listVoices()).toEqual([
      { id: "Microsoft Zira Desktop", name: "Microsoft Zira Desktop", culture: "en-US", gender: "Female" },
    ]);
    const missing = fakeSpawn((child) => {
      child.stderr.end('Exception calling "SelectVoice" with "1" argument(s): "Cannot set voice."');
      child.emit("exit", 1, null);
    });
    await expect(
      new WindowsSpeechDriver({ platform: "win32", spawn: missing.spawn }).speak(
        { text: "Hi", voiceId: "Nope", rate: 1 },
        new AbortController().signal,
      ),
    ).rejects.toThrow('The voice "Nope" is not installed');
    expect(new WindowsSpeechDriver({ platform: "linux" }).unavailableReason()).toContain("Windows");
  });
});

describe("whisper.cpp runner", () => {
  const executable = join("C:", "voice", "runtime", "1.9.2", "Release", "whisper-cli.exe");
  const input = {
    executable,
    model: join("C:", "voice", "models", "ggml-base-q5_1.bin"),
    audioPath: join("C:", "voice", "tmp", "a.wav"),
    language: "pl" as const,
    threads: 2,
  };

  it("runs whisper-cli without a shell, from its folder, and returns its text", async () => {
    const { spawn, calls } = fakeSpawn((child) => {
      child.stdout.end(" Dzień dobry.\n");
      child.emit("exit", 0, null);
    });
    const text = await new WhisperCliRunner({ spawn }).run(input, new AbortController().signal);
    expect(text).toBe(" Dzień dobry.\n");
    expect(calls[0]?.command).toBe(executable);
    expect(calls[0]?.args).toEqual(["-m", input.model, "-f", input.audioPath, "-l", "pl", "-t", "2", "-nt", "-np"]);
    expect(calls[0]?.options).toMatchObject({
      cwd: join("C:", "voice", "runtime", "1.9.2", "Release"),
      shell: false,
      windowsHide: true,
    });
  });

  it("reports a failure with the end of its error output, and stops when cancelled", async () => {
    const failing = fakeSpawn((child) => {
      child.stderr.end("error: failed to read WAV file\n");
      child.emit("exit", 2, null);
    });
    await expect(
      new WhisperCliRunner({ spawn: failing.spawn }).run(input, new AbortController().signal),
    ).rejects.toThrow("failed to read WAV file");
    const hanging = fakeSpawn(() => undefined);
    const controller = new AbortController();
    const running = new WhisperCliRunner({ spawn: hanging.spawn }).run(input, controller.signal);
    controller.abort();
    await expect(running).rejects.toThrow("stopped");
  });
});
