import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const script = new URL('./cosgral-e2e-two-accounts.mjs', import.meta.url);
async function run(args) {
  const child = spawn(process.execPath, [script.pathname, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const [code] = await once(child, 'close');
  return { code, output };
}

test('rejects repository state paths before creating credentials', async () => {
  const result = await run(['--api', 'http://127.0.0.1:3198', '--state-file', new URL('../forbidden-state.json', import.meta.url).pathname]);
  assert.equal(result.code, 1);
  assert.match(result.output, /outside repository/);
});

test('requires authenticated health rather than silently testing local_trusted', async () => {
  const server = createServer((_req, res) => res.end(JSON.stringify({ status: 'ok', deploymentMode: 'local_trusted' })));
  const dir = await mkdtemp(join(tmpdir(), 'cosgral-script-'));
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const result = await run(['--api', `http://127.0.0.1:${server.address().port}`, '--state-file', join(dir, 'state.json')]);
    assert.equal(result.code, 1);
    assert.match(result.output, /requires healthy authenticated instance/);
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
});

test('never echoes malformed credential JSON, even when parsing errors contain secret text', async () => {
  const secret = randomBytes(32).toString('hex');
  const server = createServer((_req, res) => res.end(JSON.stringify({ status: 'ok', deploymentMode: 'authenticated' })));
  const dir = await mkdtemp(join(tmpdir(), 'cosgral-script-'));
  try {
    const state = join(dir, 'state.json');
    await writeFile(state, '{}', { mode: 0o600 });
    await writeFile(`${state}.credentials.json`, `{"password": "${secret}", BROKEN}`, { mode: 0o600 });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const result = await run(['--api', `http://127.0.0.1:${server.address().port}`, '--phase', 'verify-after-restart', '--state-file', state]);
    assert.equal(result.code, 1);
    assert.equal(result.output.includes(secret), false, 'secret must never appear in output');
    assert.match(result.output, /invalid private JSON file \(contents withheld\)/);
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
});
