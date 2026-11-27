// @vitest-environment node

import type { SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { buildNgrokArgs, explainNgrokFailure, NGROK_MESSAGES, NgrokPublisher } from "./ngrok-publisher";

function fakeProcess() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const events = new EventEmitter();
  const child: {
    exitCode: number | null;
    killed: boolean;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: () => boolean;
    once: (event: string, listener: (...args: unknown[]) => unknown) => unknown;
  } = {
    exitCode: null,
    killed: false,
    stdout,
    stderr,
    kill: () => {
      child.killed = true;
      child.exitCode = 0;
      events.emit("exit", 0);
      return true;
    },
    once: (event, listener) => events.once(event, listener),
  };
  return { child, stdout, events };
}

/** A stand-in for `spawn`: the same three parameters, so the calls it records are typed. */
function fakeSpawn<Child>(make: () => Child) {
  return vi.fn((_executable: string, _args: readonly string[], _options: SpawnOptions) => make());
}

const SETTINGS = { authtoken: "2abcDEFghiJKLmnoPQRstuVWXyz_0123456789ab", domain: "nazwa-test.ngrok-free.app" };

describe("explainNgrokFailure", () => {
  it("says in plain words what is wrong with the token, the domain, a busy domain and the limit", () => {
    expect(explainNgrokFailure("ERROR: authentication failed ... ERR_NGROK_105")).toBe(NGROK_MESSAGES.badToken);
    expect(explainNgrokFailure("ERR_NGROK_334")).toBe(NGROK_MESSAGES.domainBusy);
    expect(explainNgrokFailure("ERR_NGROK_314")).toBe(NGROK_MESSAGES.badDomain);
    expect(explainNgrokFailure("something unknown")).toBeNull();
  });
});

describe("NgrokPublisher", () => {
  it("starts ngrok for the local port and the saved domain, without the token on the command line", async () => {
    const { child, stdout } = fakeProcess();
    const spawnProcess = fakeSpawn(() => child);
    const publisher = new NgrokPublisher({
      binDirectory: "/unused",
      getSettings: () => SETTINGS,
      resolveExecutable: async () => "/bin/ngrok",
      spawnProcess,
    });
    const published = publisher.publish(4321);
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalled());
    stdout.write(`{"lvl":"info","msg":"started tunnel","url":"https://${SETTINGS.domain}"}\n`);
    await expect(published).resolves.toBe(`https://${SETTINGS.domain}`);
    const [executable, args, options] = spawnProcess.mock.calls[0] ?? [];
    expect(executable).toBe("/bin/ngrok");
    expect(args).toEqual(buildNgrokArgs(4321, SETTINGS.domain));
    expect(JSON.stringify(args)).not.toContain(SETTINGS.authtoken);
    expect(options?.env?.NGROK_AUTHTOKEN).toBe(SETTINGS.authtoken);
    await publisher.unpublish();
    expect(child.killed).toBe(true);
  });

  it("asks for the token and the domain first, and explains a refused token", async () => {
    const empty = new NgrokPublisher({ binDirectory: "/unused", getSettings: () => null });
    await expect(empty.publish(1)).rejects.toThrow(NGROK_MESSAGES.notConfigured);

    const { child, stdout, events } = fakeProcess();
    const spawnProcess = fakeSpawn(() => child);
    const publisher = new NgrokPublisher({
      binDirectory: "/unused",
      getSettings: () => SETTINGS,
      resolveExecutable: async () => "/bin/ngrok",
      spawnProcess,
    });
    const published = publisher.publish(1);
    await vi.waitFor(() => expect(events.listenerCount("exit")).toBeGreaterThan(0));
    stdout.write("ERROR:  authentication failed: ... ERR_NGROK_105\n");
    events.emit("exit", 1);
    await expect(published).rejects.toThrow(NGROK_MESSAGES.badToken);
  });

  it("tries the older option name when the program does not know the new one", async () => {
    const first = fakeProcess();
    const second = fakeProcess();
    const processes = [first.child, second.child];
    const spawnProcess = fakeSpawn(() => {
      const next = processes.shift();
      if (!next) throw new Error("no more");
      return next;
    });
    const publisher = new NgrokPublisher({
      binDirectory: "/unused",
      getSettings: () => SETTINGS,
      resolveExecutable: async () => "/bin/ngrok",
      spawnProcess,
    });
    const published = publisher.publish(7);
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));
    first.stdout.write("Error: unknown flag: --url\n");
    first.events.emit("exit", 1);
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(2));
    expect(spawnProcess.mock.calls[1]?.[1]).toEqual(buildNgrokArgs(7, SETTINGS.domain, "domain"));
    second.stdout.write(`{"msg":"started tunnel","url":"https://${SETTINGS.domain}"}\n`);
    await expect(published).resolves.toBe(`https://${SETTINGS.domain}`);
  });
});
