import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './cosgral-profile-server.mjs';

for (const block of [false, true]) {
  test(`captures real inspector evidence with ${block ? 'blocked' : 'healthy'} target`, { timeout: 15000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cosgral-profiler-test-'));
    const child = spawn(process.execPath, ['--inspect=127.0.0.1:0', '-e', `
      const http = require('node:http');
      function busyLoopCpu() { const until = Date.now() + 350; while (Date.now() < until) {} }
      const server = http.createServer((req, res) => {
        if (${block}) busyLoopCpu();
        res.writeHead(200); res.end('ok');
      });
      server.listen(0, '127.0.0.1', () => process.send({
        inspector: new URL(require('node:inspector').url()).port,
        health: server.address().port,
      }));
    `], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    child.stderr.resume();
    try {
      const [ports] = await once(child, 'message', { signal: AbortSignal.timeout(5000) });
      const result = await main(['--inspector', `http://127.0.0.1:${ports.inspector}`,
        '--health', `http://127.0.0.1:${ports.health}/api/health`, '--out', directory,
        '--duration-sec', '1', '--stall-ms', block ? '100' : '1000', '--interval-ms', '50'], { log() {} });
      assert.equal(result, block ? 1 : 0);
      const [run] = await readdir(directory);
      const health = (await readFile(join(directory, run, 'health.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
      const profile = JSON.parse(await readFile(join(directory, run, 'server.cpuprofile'), 'utf8'));
      assert.ok(profile.nodes.length > 0);
      assert.ok(profile.endTime > profile.startTime);
      if (block) {
        assert.equal(health[0].error, 'timeout');
        assert.ok(profile.nodes.some(node => node.callFrame.functionName === 'busyLoopCpu'));
      } else assert.ok(health.every(sample => sample.status === 200 && sample.error === null));
      assert.equal(child.exitCode, null, 'profiling must not terminate the target');
    } finally {
      const exit = once(child, 'exit');
      child.kill();
      await exit;
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('rejects nonlocal endpoints and invalid bounds before connecting', async () => {
  for (const args of [['--inspector', 'http://example.com'], ['--health', 'http://127.0.0.1/health?token=x'], ['--duration-sec', '0']]) {
    await assert.rejects(main(args, { log() {} }));
  }
});
