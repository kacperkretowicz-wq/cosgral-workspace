import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPrivateAcceptanceFile, readPrivateAcceptanceJson } from '../private-acceptance-file.mjs';

test('reads owned private JSON, withholds invalid contents, and rejects public access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cosgral-private-'));
  const file = join(dir, 'test state.json');
  try {
    await createPrivateAcceptanceFile(file, '{"value":1}');
    assert.deepEqual(await readPrivateAcceptanceJson(file), { value: 1 });
    await assert.rejects(createPrivateAcceptanceFile(file, 'must not overwrite'), { code: 'EEXIST' });
    await writeFile(file, '{"synthetic-secret": invalid}');
    await assert.rejects(readPrivateAcceptanceJson(file), error => {
      assert.equal(error.message, 'invalid private JSON file (contents withheld)');
      return true;
    });
    await writeFile(file, '{}');
    if (process.platform === 'win32') {
      await promisify(execFile)(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/icacls.exe'),
        [file, '/grant', '*S-1-1-0:(R)'], { windowsHide: true });
    } else await chmod(file, 0o644);
    await assert.rejects(readPrivateAcceptanceJson(file), /private.*(ACL|0600)/);
    await assert.rejects(readPrivateAcceptanceJson(dir), /regular file/);
  } finally {
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
    await rm(dir, { recursive: true, force: true });
  }
});
