#!/usr/bin/env node
// An independent process observes health while the target event loop is blocked.
import { parseArgs } from 'node:util';
import { mkdir, mkdtemp, appendFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

function localUrl(value, originOnly = false) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || (originOnly && url.pathname !== '/')) {
    throw new Error('Use a loopback HTTP URL without credentials, query or fragment');
  }
  return url;
}

async function inspectorConnection(endpoint, timeoutMs) {
  const socket = new WebSocket(endpoint);
  const pending = new Map();
  let nextId = 0;
  const failAll = () => {
    for (const { reject } of pending.values()) reject(new Error('Inspector connection closed'));
    pending.clear();
  };
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(`Inspector command failed: ${message.error.code}`));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', failAll);
  socket.addEventListener('error', failAll);
  try {
    await new Promise((resolveOpen, reject) => {
      const timer = setTimeout(() => reject(new Error('Inspector connection timeout')), timeoutMs);
      socket.addEventListener('open', () => { clearTimeout(timer); resolveOpen(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Inspector connection failed')); }, { once: true });
    });
  } catch (error) { socket.close(); throw error; }
  return {
    command(method) {
      return new Promise((resolveCommand, rejectCommand) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          rejectCommand(new Error(`Inspector timeout: ${method}`));
        }, timeoutMs);
        pending.set(id, {
          resolve: result => { clearTimeout(timer); resolveCommand(result); },
          reject: error => { clearTimeout(timer); rejectCommand(error); },
        });
        socket.send(JSON.stringify({ id, method }));
      });
    },
    close() { socket.close(); failAll(); },
  };
}

export async function main(args = process.argv.slice(2), { log = console.log } = {}) {
  const { values } = parseArgs({ args, options: {
    inspector: { type: 'string', default: 'http://127.0.0.1:9229' },
    health: { type: 'string', default: 'http://127.0.0.1:3199/api/health' },
    out: { type: 'string', default: 'test-results/cosgral-profile' },
    'duration-sec': { type: 'string', default: '900' },
    'stall-ms': { type: 'string', default: '2000' },
    'interval-ms': { type: 'string', default: '500' },
    'profile-timeout-sec': { type: 'string', default: '180' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    log('node scripts/cosgral-profile-server.mjs --inspector http://127.0.0.1:9229 --health http://127.0.0.1:3199/api/health [--duration-sec 900] [--out test-results/cosgral-profile]');
    return 0;
  }
  const inspector = localUrl(values.inspector, true);
  const health = localUrl(values.health);
  const numeric = name => {
    const number = Number(values[name]);
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`Invalid --${name}`);
    return number;
  };
  const duration = numeric('duration-sec') * 1000;
  const stallMs = numeric('stall-ms'), intervalMs = numeric('interval-ms');
  const profileTimeout = numeric('profile-timeout-sec') * 1000;
  const response = await fetch(new URL('/json/list', inspector), { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Inspector discovery HTTP ${response.status}`);
  const targets = (await response.json()).filter(target => target.type === 'node');
  if (targets.length !== 1) throw new Error('Expected exactly one Node inspector target');
  const endpoint = new URL(targets[0].webSocketDebuggerUrl);
  if (endpoint.protocol !== 'ws:' || endpoint.hostname !== inspector.hostname || endpoint.port !== inspector.port
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Inspector advertised a nonlocal or mismatched endpoint');
  await mkdir(resolve(values.out), { recursive: true });
  const directory = await mkdtemp(join(resolve(values.out), 'run-'));
  const samples = join(directory, 'health.jsonl');
  const connection = await inspectorConnection(endpoint.href, profileTimeout);
  let interrupted = false, failed = false, profiling = false;
  const abort = () => { interrupted = true; };
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try {
    await connection.command('Profiler.enable');
    await connection.command('Profiler.start');
    profiling = true;
    log(`CPU profiling active; evidence directory: ${directory}`);
    const deadline = performance.now() + duration;
    while (!interrupted && performance.now() < deadline) {
      const started = performance.now();
      let status = null, error = null;
      try {
        const result = await fetch(health, { redirect: 'error', signal: AbortSignal.timeout(stallMs) });
        status = result.status;
        await result.body?.cancel();
      } catch (failure) { error = failure.name === 'TimeoutError' ? 'timeout' : 'transport'; }
      const elapsedMs = Math.round(performance.now() - started);
      failed = Boolean(error) || status !== 200 || elapsedMs >= stallMs;
      // Persist before requesting Profiler.stop: the inspector may also be blocked.
      await appendFile(samples, JSON.stringify({ time: new Date().toISOString(), elapsedMs, status, error }) + '\n', { mode: 0o600 });
      if (failed) { log('Health failure recorded; collecting CPU profile without stopping the server.'); break; }
      await sleep(Math.min(intervalMs, Math.max(0, deadline - performance.now())));
    }
  } finally {
    try {
      if (profiling) {
        const { profile } = await connection.command('Profiler.stop');
        await writeFile(join(directory, 'server.cpuprofile'), JSON.stringify(profile), { mode: 0o600 });
        log('CPU profile saved.');
      }
    } finally {
      connection.close();
      process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
    }
  }
  return failed || interrupted ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
