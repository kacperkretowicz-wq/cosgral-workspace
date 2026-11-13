// COSGRAL W3: the Computer Use driver for Windows. One long-lived Windows PowerShell 5.1 process (present on every
// Windows 10 and 11) runs a small C# helper, compiled once with Add-Type, and answers JSON lines on stdin and stdout.
// Mouse and keyboard go through SendInput (absolute virtual-desktop coordinates, Unicode typing, virtual-key
// combinations); windows through EnumWindows, WindowFromPoint and SetForegroundWindow; screenshots through GDI
// CopyFromScreen of the virtual screen. The helper is DPI aware, so coordinates are physical pixels. It also reports
// the input desktop (a locked screen or the secure UAC desktop), an open UAC consent prompt and windows that run as
// administrator. In dry-run mode it sends nothing and returns the input it would send, for a self-test that does not
// touch the desktop. Stop kills the helper, so a step in progress ends at once; the next step starts a new helper.

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMPUTER_USE_LIMITS } from "@openbot/contracts/ipc";
import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type {
  ComputerDriver,
  DesktopRect,
  DesktopScreenshot,
  DesktopState,
  DesktopWindow,
  MouseButton,
} from "./computer-driver";

export interface WindowsDriverOptions {
  /** Folder for the helper script; default: the temp folder. */
  workDir?: string;
  /** Send nothing: steps return the input they would send (self-test). */
  dryRun?: boolean;
  /** Tests: start another helper instead of PowerShell. */
  spawnHelper?: (scriptPath: string) => ChildProcessWithoutNullStreams;
  stepTimeoutMs?: number;
  /** The helper exits after this long without steps. */
  idleMs?: number;
  platform?: NodeJS.Platform;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const START_TIMEOUT_MS = 30_000;

export class WindowsComputerDriver implements ComputerDriver {
  readonly #options: WindowsDriverOptions;
  #child: ChildProcessWithoutNullStreams | null = null;
  #ready: Promise<ChildProcessWithoutNullStreams> | null = null;
  readonly #pending = new Map<number, Pending>();
  #nextId = 1;
  #buffer = "";
  #stderr = "";
  #idleTimer: NodeJS.Timeout | null = null;
  /** The input the last dry-run step would have sent. */
  lastDryRun: unknown[] = [];

  constructor(options: WindowsDriverOptions = {}) {
    this.#options = options;
  }

  unavailableReason(): string | null {
    return (this.#options.platform ?? process.platform) === "win32"
      ? null
      : "Computer Use works on Windows in this version.";
  }

  async state(): Promise<DesktopState> {
    const value = record(await this.request("state", {}), "state");
    return {
      inputDesktop: isString(value.inputDesktop) ? value.inputDesktop : null,
      locked: value.locked === true,
      uacPrompt: value.uacPrompt === true,
      screen: rect(value.screen),
      foreground: value.foreground === null ? null : desktopWindow(value.foreground),
    };
  }

  async screenshot(maxDimension: number): Promise<DesktopScreenshot> {
    const value = record(await this.request("screenshot", { maxDimension }), "screenshot");
    if (!isString(value.png) || !isNumber(value.width) || !isNumber(value.height)) {
      throw new Error("The Computer Use helper returned no screenshot.");
    }
    return { png: Buffer.from(value.png, "base64"), width: value.width, height: value.height };
  }

  async listWindows(): Promise<DesktopWindow[]> {
    const value = await this.request("windows", {});
    if (!Array.isArray(value)) throw new Error("The Computer Use helper returned no window list.");
    return value.map(desktopWindow);
  }

  async windowAt(x: number, y: number): Promise<DesktopWindow | null> {
    const value = await this.request("windowAt", { x, y });
    return value === null ? null : desktopWindow(value);
  }

  async focusWindow(handle: string): Promise<boolean> {
    const value = record(await this.request("focus", { handle }), "focus");
    return value.foreground === true;
  }

  async click(x: number, y: number, button: MouseButton, count: 1 | 2): Promise<void> {
    await this.request("click", { x, y, button, count });
  }

  async scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
    await this.request("scroll", { x, y, deltaX, deltaY });
  }

  async typeText(text: string): Promise<void> {
    await this.request("type", { text });
  }

  async pressKeys(keys: string[]): Promise<void> {
    await this.request("keys", { keys });
  }

  cancel(): void {
    if (this.#pending.size === 0) return;
    // Killing the helper ends a step in progress at once; the next step starts a new one.
    this.#stop(new Error("Stopped."));
  }

  async close(): Promise<void> {
    this.#stop(new Error("The Computer Use helper was closed."));
  }

  /** One request to the helper (diagnostics and the self-test use it directly). */
  async request(op: string, args: DynamicRecord): Promise<unknown> {
    const child = await this.#start();
    const id = this.#nextId++;
    const timeoutMs = this.#options.stepTimeoutMs ?? COMPUTER_USE_LIMITS.stepTimeoutMs;
    this.#touch();
    const response = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#stop(new Error(`The Computer Use step "${op}" took longer than ${timeoutMs / 1000} s and was stopped.`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, op, dryRun: this.#options.dryRun === true, ...args })}\n`);
    });
    this.#touch();
    const reply = record(response, op);
    if (reply.ok !== true)
      throw new Error(isString(reply.error) ? reply.error : `The Computer Use step "${op}" failed.`);
    const result = reply.result;
    if (this.#options.dryRun && isDynamicRecord(result) && Array.isArray(result.inputs))
      this.lastDryRun = result.inputs;
    return result;
  }

  #start(): Promise<ChildProcessWithoutNullStreams> {
    if (this.#ready) return this.#ready;
    const unavailable = this.unavailableReason();
    if (unavailable) return Promise.reject(new Error(unavailable));
    this.#ready = (async () => {
      const scriptPath = await writeHelperScript(this.#options.workDir ?? join(tmpdir(), "cosgral-computer-use"));
      const child =
        this.#options.spawnHelper?.(scriptPath) ??
        spawn(
          "powershell.exe",
          ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
          { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
        );
      this.#child = child;
      this.#buffer = "";
      this.#stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        this.#stderr = (this.#stderr + chunk).slice(-4_000);
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("The Computer Use helper did not start in time."));
        }, START_TIMEOUT_MS);
        const ready = () => {
          clearTimeout(timer);
          resolve();
        };
        child.stdout.on("data", (chunk: string) => this.#read(chunk, ready));
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(new Error(`The Computer Use helper did not start: ${error.message}`));
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          const detail = this.#stderr.trim().split(/\r?\n/).slice(-3).join(" ");
          const error = new Error(`The Computer Use helper stopped (code ${code ?? "none"}). ${detail}`.trim());
          reject(error);
          if (this.#child === child) this.#stop(error);
        });
      });
      return child;
    })();
    this.#ready.catch(() => {
      this.#ready = null;
      this.#child = null;
    });
    return this.#ready;
  }

  #read(chunk: string, ready: () => void): void {
    this.#buffer += chunk;
    for (let end = this.#buffer.indexOf("\n"); end >= 0; end = this.#buffer.indexOf("\n")) {
      const line = this.#buffer.slice(0, end).trim();
      this.#buffer = this.#buffer.slice(end + 1);
      if (!line) continue;
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isDynamicRecord(message)) continue;
      if (message.ready === true) {
        ready();
        continue;
      }
      if (!isNumber(message.id)) continue;
      const pending = this.#pending.get(message.id);
      if (!pending) continue;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      pending.resolve(message);
    }
  }

  #touch(): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(
      () => {
        if (this.#pending.size === 0) this.#stop(new Error("The Computer Use helper was idle."));
      },
      this.#options.idleMs ?? 5 * 60_000,
    );
    this.#idleTimer.unref();
  }

  #stop(error: Error): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = null;
    const child = this.#child;
    this.#child = null;
    this.#ready = null;
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.#pending.delete(id);
    }
    if (child && child.exitCode === null) {
      child.stdin.end();
      child.kill();
    }
  }
}

function record(value: unknown, label: string): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error(`The Computer Use helper returned an invalid ${label} answer.`);
  return value;
}

function rect(value: unknown): DesktopRect {
  const item = record(value, "rectangle");
  if (!isNumber(item.x) || !isNumber(item.y) || !isNumber(item.width) || !isNumber(item.height)) {
    throw new Error("The Computer Use helper returned an invalid rectangle.");
  }
  return { x: item.x, y: item.y, width: item.width, height: item.height };
}

function desktopWindow(value: unknown): DesktopWindow {
  const item = record(value, "window");
  if (!isString(item.handle) || !isNumber(item.processId))
    throw new Error("The Computer Use helper returned an invalid window.");
  return {
    handle: item.handle,
    title: isString(item.title) ? item.title : "",
    processId: item.processId,
    processName: isString(item.processName) ? item.processName : "",
    bounds: rect(item.bounds),
    minimized: isBoolean(item.minimized) ? item.minimized : false,
    foreground: isBoolean(item.foreground) ? item.foreground : false,
    elevated: isBoolean(item.elevated) ? item.elevated : true,
  };
}

async function writeHelperScript(folder: string): Promise<string> {
  const hash = createHash("sha256").update(WINDOWS_HELPER_SCRIPT).digest("hex").slice(0, 12);
  const path = join(folder, `cosgral-computer-use-${hash}.ps1`);
  await mkdir(folder, { recursive: true });
  // UTF-8 with BOM so Windows PowerShell 5.1 reads the script as UTF-8.
  await writeFile(path, `﻿${WINDOWS_HELPER_SCRIPT}`, "utf8");
  return path;
}

/** The helper: Windows PowerShell 5.1 with C# 5 (no newer syntax: Add-Type uses the .NET Framework compiler). */
export const WINDOWS_HELPER_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

public static class CosgralDesktop
{
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }
    [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public HARDWAREINPUT hi; }
    [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion u; }
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hWnd, uint command);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder info, int length, out int needed);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int infoClass, out int info, int length, out int returned);

    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static List<object> dryInputs;
    static string dpiMode = "none";

    public static void Init()
    {
        Json.MaxJsonLength = int.MaxValue;
        try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) dpiMode = "per-monitor-v2"; } catch (EntryPointNotFoundException) { }
        if (dpiMode == "none" && SetProcessDPIAware()) dpiMode = "system";
    }

    public static string Handle(string line)
    {
        object id = null;
        try
        {
            Dictionary<string, object> request = (Dictionary<string, object>)Json.DeserializeObject(line);
            if (request.ContainsKey("id")) id = request["id"];
            bool dry = request.ContainsKey("dryRun") && Convert.ToBoolean(request["dryRun"]);
            dryInputs = dry ? new List<object>() : null;
            object result = Dispatch(Text(request, "op"), request, dry);
            Dictionary<string, object> reply = new Dictionary<string, object>();
            reply["id"] = id; reply["ok"] = true; reply["result"] = result;
            return Json.Serialize(reply);
        }
        catch (Exception error)
        {
            Dictionary<string, object> reply = new Dictionary<string, object>();
            reply["id"] = id; reply["ok"] = false; reply["error"] = error.Message;
            return Json.Serialize(reply);
        }
    }

    static object Dispatch(string op, Dictionary<string, object> request, bool dry)
    {
        switch (op)
        {
            case "ping":
                Dictionary<string, object> pong = new Dictionary<string, object>();
                pong["pong"] = true; pong["pid"] = Process.GetCurrentProcess().Id; pong["dpi"] = dpiMode;
                return pong;
            case "state": return State();
            case "screenshot": return Screenshot(Whole(request, "maxDimension"));
            case "windows": return Windows();
            case "windowAt": return WindowAt(Whole(request, "x"), Whole(request, "y"));
            case "focus": return Focus(Text(request, "handle"), dry);
            case "click": return Click(Whole(request, "x"), Whole(request, "y"), Text(request, "button"), Whole(request, "count"), dry);
            case "scroll": return Scroll(Whole(request, "x"), Whole(request, "y"), Whole(request, "deltaX"), Whole(request, "deltaY"), dry);
            case "type": return Type(Text(request, "text"), dry);
            case "keys": return Keys((object[])request["keys"], dry);
            default: throw new Exception("Unknown step: " + op);
        }
    }

    static string Text(Dictionary<string, object> request, string key)
    {
        if (!request.ContainsKey(key) || request[key] == null) throw new Exception(key + " is required.");
        return Convert.ToString(request[key]);
    }

    static int Whole(Dictionary<string, object> request, string key)
    {
        if (!request.ContainsKey(key) || request[key] == null) throw new Exception(key + " is required.");
        return Convert.ToInt32(request[key]);
    }

    static Dictionary<string, object> Screen()
    {
        Dictionary<string, object> screen = new Dictionary<string, object>();
        screen["x"] = GetSystemMetrics(76); screen["y"] = GetSystemMetrics(77);
        screen["width"] = GetSystemMetrics(78); screen["height"] = GetSystemMetrics(79);
        return screen;
    }

    static string InputDesktopName()
    {
        IntPtr desktop = OpenInputDesktop(0, false, 0x0001);
        if (desktop == IntPtr.Zero) return null;
        try
        {
            StringBuilder name = new StringBuilder(256);
            int needed;
            return GetUserObjectInformation(desktop, 2, name, name.Capacity * 2, out needed) ? name.ToString() : null;
        }
        finally { CloseDesktop(desktop); }
    }

    static bool Running(string name)
    {
        Process[] processes = Process.GetProcessesByName(name);
        bool running = processes.Length > 0;
        foreach (Process process in processes) process.Dispose();
        return running;
    }

    static object State()
    {
        string desktop = InputDesktopName();
        Dictionary<string, object> state = new Dictionary<string, object>();
        state["inputDesktop"] = desktop;
        state["locked"] = desktop == null || !string.Equals(desktop, "Default", StringComparison.OrdinalIgnoreCase);
        state["uacPrompt"] = Running("consent");
        state["screen"] = Screen();
        IntPtr foreground = GetForegroundWindow();
        state["foreground"] = foreground == IntPtr.Zero ? null : (object)Window(foreground);
        state["dpi"] = dpiMode;
        return state;
    }

    static bool Elevated(uint processId)
    {
        IntPtr process = OpenProcess(0x1000, false, processId);
        if (process == IntPtr.Zero) return true;
        try
        {
            IntPtr token;
            if (!OpenProcessToken(process, 0x0008, out token)) return true;
            try
            {
                int elevation, returned;
                if (!GetTokenInformation(token, 20, out elevation, 4, out returned)) return true;
                return elevation != 0;
            }
            finally { CloseHandle(token); }
        }
        finally { CloseHandle(process); }
    }

    static Dictionary<string, object> Window(IntPtr handle)
    {
        uint processId;
        GetWindowThreadProcessId(handle, out processId);
        int length = GetWindowTextLength(handle);
        StringBuilder title = new StringBuilder(Math.Max(1, length + 1));
        GetWindowText(handle, title, title.Capacity);
        RECT rect;
        GetWindowRect(handle, out rect);
        string processName = "";
        try { using (Process process = Process.GetProcessById((int)processId)) processName = process.ProcessName; } catch (Exception) { }
        Dictionary<string, object> bounds = new Dictionary<string, object>();
        bounds["x"] = rect.Left; bounds["y"] = rect.Top; bounds["width"] = rect.Right - rect.Left; bounds["height"] = rect.Bottom - rect.Top;
        Dictionary<string, object> window = new Dictionary<string, object>();
        window["handle"] = handle.ToInt64().ToString();
        window["title"] = title.ToString();
        window["processId"] = (long)processId;
        window["processName"] = processName;
        window["bounds"] = bounds;
        window["minimized"] = IsIconic(handle);
        window["foreground"] = handle == GetForegroundWindow();
        window["elevated"] = Elevated(processId);
        return window;
    }

    static object Windows()
    {
        List<object> windows = new List<object>();
        EnumWindows(delegate (IntPtr handle, IntPtr unused)
        {
            if (!IsWindowVisible(handle) || GetWindowTextLength(handle) == 0) return true;
            if (GetWindow(handle, 4) != IntPtr.Zero) return true;
            if ((GetWindowLong(handle, -20) & 0x00000080) != 0) return true;
            int cloaked = 0;
            if (DwmGetWindowAttribute(handle, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
            windows.Add(Window(handle));
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    static object WindowAt(int x, int y)
    {
        POINT point = new POINT(); point.X = x; point.Y = y;
        IntPtr handle = WindowFromPoint(point);
        if (handle == IntPtr.Zero) return null;
        IntPtr root = GetAncestor(handle, 2);
        return Window(root == IntPtr.Zero ? handle : root);
    }

    static object Screenshot(int maxDimension)
    {
        int x = GetSystemMetrics(76), y = GetSystemMetrics(77), width = GetSystemMetrics(78), height = GetSystemMetrics(79);
        double scale = Math.Min(1.0, (double)maxDimension / Math.Max(width, height));
        int outWidth = Math.Max(1, (int)Math.Round(width * scale)), outHeight = Math.Max(1, (int)Math.Round(height * scale));
        using (Bitmap screen = new Bitmap(width, height, PixelFormat.Format24bppRgb))
        {
            try
            {
                using (Graphics graphics = Graphics.FromImage(screen))
                    graphics.CopyFromScreen(x, y, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
            }
            catch (Exception) { throw new Exception("The screen cannot be read; it may be locked."); }
            using (Bitmap scaled = new Bitmap(outWidth, outHeight, PixelFormat.Format24bppRgb))
            using (MemoryStream stream = new MemoryStream())
            {
                using (Graphics graphics = Graphics.FromImage(scaled))
                {
                    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    graphics.DrawImage(screen, 0, 0, outWidth, outHeight);
                }
                scaled.Save(stream, ImageFormat.Png);
                Dictionary<string, object> shot = new Dictionary<string, object>();
                shot["png"] = Convert.ToBase64String(stream.ToArray());
                shot["width"] = outWidth; shot["height"] = outHeight;
                return shot;
            }
        }
    }

    static INPUT Mouse(int dx, int dy, uint data, uint flags)
    {
        INPUT input = new INPUT(); input.type = 0;
        input.u.mi.dx = dx; input.u.mi.dy = dy; input.u.mi.mouseData = data; input.u.mi.dwFlags = flags;
        return input;
    }

    static INPUT Key(ushort virtualKey, ushort scan, uint flags)
    {
        INPUT input = new INPUT(); input.type = 1;
        input.u.ki.wVk = virtualKey; input.u.ki.wScan = scan; input.u.ki.dwFlags = flags;
        return input;
    }

    static INPUT MoveTo(int x, int y)
    {
        int left = GetSystemMetrics(76), top = GetSystemMetrics(77), width = GetSystemMetrics(78), height = GetSystemMetrics(79);
        if (x < left || y < top || x >= left + width || y >= top + height) throw new Exception("The point is outside the screen.");
        int dx = (int)Math.Round((x - left) * 65535.0 / Math.Max(1, width - 1));
        int dy = (int)Math.Round((y - top) * 65535.0 / Math.Max(1, height - 1));
        return Mouse(dx, dy, 0, 0x0001 | 0x4000 | 0x8000);
    }

    static object Send(List<INPUT> inputs, bool dry)
    {
        if (dry)
        {
            foreach (INPUT input in inputs)
            {
                Dictionary<string, object> item = new Dictionary<string, object>();
                if (input.type == 0)
                {
                    item["type"] = "mouse"; item["dx"] = input.u.mi.dx; item["dy"] = input.u.mi.dy;
                    item["data"] = unchecked((int)input.u.mi.mouseData); item["flags"] = (long)input.u.mi.dwFlags;
                }
                else
                {
                    item["type"] = "key"; item["vk"] = (int)input.u.ki.wVk; item["scan"] = (int)input.u.ki.wScan; item["flags"] = (long)input.u.ki.dwFlags;
                }
                dryInputs.Add(item);
            }
            Dictionary<string, object> plan = new Dictionary<string, object>();
            plan["dryRun"] = true; plan["inputs"] = dryInputs;
            return plan;
        }
        INPUT[] array = inputs.ToArray();
        uint sent = SendInput((uint)array.Length, array, Marshal.SizeOf(typeof(INPUT)));
        if (sent != array.Length) throw new Exception("Windows did not accept the input (error " + Marshal.GetLastWin32Error() + "). The window may run as administrator or the screen may be locked.");
        Dictionary<string, object> done = new Dictionary<string, object>();
        done["sent"] = (long)sent;
        return done;
    }

    static object Click(int x, int y, string button, int count, bool dry)
    {
        uint down = 0x0002, up = 0x0004;
        if (button == "right") { down = 0x0008; up = 0x0010; }
        else if (button == "middle") { down = 0x0020; up = 0x0040; }
        else if (button != "left") throw new Exception("button must be left, right or middle.");
        if (count < 1 || count > 2) throw new Exception("count must be 1 or 2.");
        List<INPUT> inputs = new List<INPUT>();
        inputs.Add(MoveTo(x, y));
        for (int index = 0; index < count; index++) { inputs.Add(Mouse(0, 0, 0, down)); inputs.Add(Mouse(0, 0, 0, up)); }
        return Send(inputs, dry);
    }

    static object Scroll(int x, int y, int deltaX, int deltaY, bool dry)
    {
        List<INPUT> inputs = new List<INPUT>();
        inputs.Add(MoveTo(x, y));
        if (deltaY != 0) inputs.Add(Mouse(0, 0, unchecked((uint)(deltaY * 120)), 0x0800));
        if (deltaX != 0) inputs.Add(Mouse(0, 0, unchecked((uint)(deltaX * 120)), 0x1000));
        return Send(inputs, dry);
    }

    static ushort Scan(ushort virtualKey) { return (ushort)MapVirtualKey(virtualKey, 0); }

    static object Type(string text, bool dry)
    {
        List<INPUT> inputs = new List<INPUT>();
        foreach (char character in text)
        {
            if (character == '\r') continue;
            if (character == '\n' || character == '\t')
            {
                ushort key = character == '\n' ? (ushort)0x0D : (ushort)0x09;
                inputs.Add(Key(key, Scan(key), 0)); inputs.Add(Key(key, Scan(key), 0x0002));
                continue;
            }
            inputs.Add(Key(0, character, 0x0004)); inputs.Add(Key(0, character, 0x0004 | 0x0002));
        }
        return Send(inputs, dry);
    }

    static ushort VirtualKey(string name)
    {
        switch (name)
        {
            case "ctrl": return 0x11; case "shift": return 0x10; case "alt": return 0x12; case "win": return 0x5B;
            case "enter": return 0x0D; case "tab": return 0x09; case "escape": return 0x1B; case "backspace": return 0x08;
            case "delete": return 0x2E; case "insert": return 0x2D; case "home": return 0x24; case "end": return 0x23;
            case "pageup": return 0x21; case "pagedown": return 0x22; case "up": return 0x26; case "down": return 0x28;
            case "left": return 0x25; case "right": return 0x27; case "space": return 0x20;
        }
        if (name.Length >= 2 && name.Length <= 3 && name[0] == 'f')
        {
            int number;
            if (int.TryParse(name.Substring(1), out number) && number >= 1 && number <= 12) return (ushort)(0x70 + number - 1);
        }
        if (name.Length == 1 && name[0] >= 'a' && name[0] <= 'z') return (ushort)(0x41 + name[0] - 'a');
        if (name.Length == 1 && name[0] >= '0' && name[0] <= '9') return (ushort)(0x30 + name[0] - '0');
        throw new Exception("Unknown key: " + name);
    }

    static bool Extended(ushort virtualKey)
    {
        return virtualKey == 0x2E || virtualKey == 0x2D || virtualKey == 0x24 || virtualKey == 0x23 || virtualKey == 0x21 ||
            virtualKey == 0x22 || virtualKey == 0x26 || virtualKey == 0x28 || virtualKey == 0x25 || virtualKey == 0x27 || virtualKey == 0x5B;
    }

    static object Keys(object[] names, bool dry)
    {
        List<ushort> keys = new List<ushort>();
        foreach (object name in names) keys.Add(VirtualKey(Convert.ToString(name)));
        List<INPUT> inputs = new List<INPUT>();
        foreach (ushort key in keys) inputs.Add(Key(key, Scan(key), Extended(key) ? 0x0001u : 0u));
        for (int index = keys.Count - 1; index >= 0; index--)
            inputs.Add(Key(keys[index], Scan(keys[index]), (Extended(keys[index]) ? 0x0001u : 0u) | 0x0002u));
        return Send(inputs, dry);
    }

    static object Focus(string handleText, bool dry)
    {
        IntPtr handle = new IntPtr(long.Parse(handleText));
        if (!IsWindow(handle)) throw new Exception("This window no longer exists.");
        Dictionary<string, object> result = new Dictionary<string, object>();
        if (dry) { result["foreground"] = false; result["dryRun"] = true; return result; }
        if (IsIconic(handle)) ShowWindow(handle, 9);
        // A short Alt press lets this process bring another window to the front.
        List<INPUT> alt = new List<INPUT>();
        alt.Add(Key(0x12, Scan(0x12), 0)); alt.Add(Key(0x12, Scan(0x12), 0x0002));
        Send(alt, false);
        SetForegroundWindow(handle);
        BringWindowToTop(handle);
        result["foreground"] = GetForegroundWindow() == handle;
        return result;
    }
}
'@
Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing, System.Web.Extensions
[CosgralDesktop]::Init()
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$writer = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$writer.AutoFlush = $true
$writer.WriteLine('{"ready":true}')
while ($true) {
  $line = $reader.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim().Length -eq 0) { continue }
  $writer.WriteLine([CosgralDesktop]::Handle($line))
}
`;
