// COSGRAL W3: the Windows helpers of voice. Reading aloud: Windows PowerShell 5.1 with System.Speech (the voices
// installed in Windows), a fixed script passed with -EncodedCommand (no script file, no execution-policy change) and
// the text on stdin as JSON, so text is never part of a command line. Speech to text: whisper-cli.exe from the voice
// folder, started without a shell. Both run as their own processes; Stop ends them at once.

import { spawn as nodeSpawn } from "node:child_process";
import { dirname, join } from "node:path";
import type { Readable, Writable } from "node:stream";
import type { VoiceInfo } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { SpeechDriver, TranscriptionRunner } from "./voice-service";

/** What the helpers use of a child process. */
export interface HelperProcess {
  stdin: Writable | null;
  stdout: Readable | null;
  stderr: Readable | null;
  kill: () => boolean;
  once(event: "exit", listener: (code: number | null) => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
}

export interface HelperSpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  windowsHide: true;
  shell: false;
  stdio: ["ignore" | "pipe", "pipe", "pipe"];
}

export type SpawnProcess = (command: string, args: string[], options: HelperSpawnOptions) => HelperProcess;

const spawnHelper: SpawnProcess = (command, args, options) => nodeSpawn(command, args, options);

const LIST_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
    $info = $_.VoiceInfo
    [pscustomobject]@{ id = $info.Name; name = $info.Name; culture = $info.Culture.Name; gender = [string]$info.Gender }
  })
} finally { $synth.Dispose() }
[Console]::Out.Write((ConvertTo-Json -InputObject $voices -Compress))
`;

const SPEAK_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  if ($request.voice) { $synth.SelectVoice([string]$request.voice) }
  $synth.Rate = [int]$request.rate
  if ($request.file) { $synth.SetOutputToWaveFile([string]$request.file) } else { $synth.SetOutputToDefaultAudioDevice() }
  $synth.Speak([string]$request.text)
} finally { $synth.Dispose() }
[Console]::Out.Write('ok')
`;

/** Speed 0.5–2 (1 = normal) to the SAPI rate -10..10 (about 3x slower or faster at the ends). */
export function sapiRate(rate: number): number {
  return Math.max(-10, Math.min(10, Math.round((10 * Math.log(rate)) / Math.log(3))));
}

/** JSON with every non-ASCII character escaped, so the console code page never changes the text. */
export function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function encoded(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs one process; the signal or the timeout ends it. */
function runProcess(
  spawn: SpawnProcess,
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdin?: string;
    timeoutMs: number;
    signal: AbortSignal;
    maxOutput: number;
  },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let stopped: Error | null = null;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: false,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const stop = (reason: Error) => {
      stopped ??= reason;
      child.kill();
    };
    const timer = setTimeout(
      () => stop(new Error("The voice helper took too long and was stopped.")),
      options.timeoutMs,
    );
    const onAbort = () => stop(new Error("stopped"));
    if (options.signal.aborted) onAbort();
    else options.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > options.maxOutput) stop(new Error("The voice helper wrote too much output."));
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4_000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", onAbort);
      if (stopped) reject(stopped);
      else resolve({ code, stdout, stderr });
    });
    if (options.stdin !== undefined) child.stdin?.end(options.stdin);
  });
}

function lastLines(text: string): string {
  return text.trim().split(/\r?\n/).slice(-3).join(" ").trim();
}

export class WindowsSpeechDriver implements SpeechDriver {
  readonly #platform: NodeJS.Platform;
  readonly #spawn: SpawnProcess;

  constructor(options: { platform?: NodeJS.Platform; spawn?: SpawnProcess } = {}) {
    this.#platform = options.platform ?? process.platform;
    this.#spawn = options.spawn ?? spawnHelper;
  }

  unavailableReason(): string | null {
    return this.#platform === "win32"
      ? null
      : "Reading aloud uses Windows voices; it works on Windows in this version.";
  }

  async listVoices(): Promise<VoiceInfo[]> {
    const result = await this.#powershell(LIST_SCRIPT, undefined, new AbortController().signal, 30_000);
    if (result.code !== 0) throw new Error(`Windows voices could not be listed. ${lastLines(result.stderr)}`.trim());
    const parsed = JSON.parse(result.stdout.trim() || "[]");
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.flatMap((voice): VoiceInfo[] =>
      isDynamicRecord(voice) && isString(voice.id) && isString(voice.name)
        ? [
            {
              id: voice.id,
              name: voice.name,
              culture: isString(voice.culture) ? voice.culture : "",
              gender: isString(voice.gender) ? voice.gender : "",
            },
          ]
        : [],
    );
  }

  speak(input: { text: string; voiceId: string | null; rate: number }, signal: AbortSignal): Promise<void> {
    return this.#say(input, null, signal);
  }

  /** Writes the speech to a WAV file instead of the speakers (self-test without sound). */
  synthesizeToFile(input: { text: string; voiceId: string | null; rate: number }, file: string): Promise<void> {
    return this.#say(input, file, new AbortController().signal);
  }

  async #say(
    input: { text: string; voiceId: string | null; rate: number },
    file: string | null,
    signal: AbortSignal,
  ): Promise<void> {
    const request = asciiJson({ text: input.text, voice: input.voiceId, rate: sapiRate(input.rate), file });
    let result: RunResult;
    try {
      result = await this.#powershell(SPEAK_SCRIPT, request, signal, 15 * 60_000);
    } catch (error) {
      if (signal.aborted) throw new Error("Reading aloud was stopped.");
      throw error;
    }
    if (result.code === 0) return;
    if (result.stderr.includes("SelectVoice")) {
      throw new Error(`The voice "${input.voiceId}" is not installed; choose another in Settings → Voice.`);
    }
    throw new Error(`Reading aloud failed. ${lastLines(result.stderr)}`.trim());
  }

  #powershell(script: string, stdin: string | undefined, signal: AbortSignal, timeoutMs: number): Promise<RunResult> {
    return runProcess(
      this.#spawn,
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded(script)],
      { stdin, signal, timeoutMs, maxOutput: 1_000_000 },
    );
  }
}

export class WhisperCliRunner implements TranscriptionRunner {
  readonly #spawn: SpawnProcess;

  constructor(options: { spawn?: SpawnProcess } = {}) {
    this.#spawn = options.spawn ?? spawnHelper;
  }

  async run(
    input: { executable: string; model: string; audioPath: string; language: string; threads: number },
    signal: AbortSignal,
  ): Promise<string> {
    const folder = dirname(input.executable);
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    let result: RunResult;
    try {
      result = await runProcess(
        this.#spawn,
        input.executable,
        ["-m", input.model, "-f", input.audioPath, "-l", input.language, "-t", String(input.threads), "-nt", "-np"],
        {
          cwd: folder,
          // Only what whisper.cpp needs: its own folder and Windows.
          env: { SystemRoot: systemRoot, PATH: `${folder};${join(systemRoot, "System32")}` },
          signal,
          timeoutMs: 10 * 60_000,
          maxOutput: 1_000_000,
        },
      );
    } catch (error) {
      if (signal.aborted) throw new Error("whisper.cpp was stopped.");
      throw error;
    }
    if (result.code !== 0) {
      throw new Error(`whisper.cpp stopped (code ${result.code ?? "none"}). ${lastLines(result.stderr)}`.trim());
    }
    return result.stdout;
  }
}
