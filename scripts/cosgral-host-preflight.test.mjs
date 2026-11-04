import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDeployment } from './cosgral-host-preflight.mjs';

const template = await readFile(new URL('../deploy/cosgral/workspace.env.example', import.meta.url), 'utf8');
const example = Object.fromEntries(template.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
}));
const configured = { ...example, DATABASE_URL: 'postgresql://cosgral:test-password@127.0.0.1:5432/cosgral',
  PAPERCLIP_PUBLIC_URL: 'https://workspace.example.org', BETTER_AUTH_SECRET: 'a'.repeat(64),
  PAPERCLIP_AGENT_JWT_SECRET: 'b'.repeat(64), PAPERCLIP_TOOL_ACTION_SIGNING_SECRET: 'c'.repeat(64) };

test('unpopulated deployment template cannot start the public service', () => {
  assert.ok(validateDeployment(example).length >= 5);
  assert.deepEqual(validateDeployment(configured), []);
});
test('rejects auth bypass, temporary state and insecure public origins', () => {
  for (const override of [{ PAPERCLIP_DEPLOYMENT_MODE: 'local_trusted' }, { HOST: '0.0.0.0' },
    { PAPERCLIP_HOME: '/tmp/cosgral' }, { PAPERCLIP_PUBLIC_URL: 'http://workspace.example.org' },
    { DATABASE_URL: '' }, { PAPERCLIP_SECRETS_STRICT_MODE: 'false' }]) {
    assert.ok(validateDeployment({ ...configured, ...override }).length > 0);
  }
});
test('configuration errors do not reveal supplied credentials or URLs', () => {
  const sensitive = 'not-for-logs';
  const errors = validateDeployment({ ...configured, BETTER_AUTH_SECRET: sensitive,
    DATABASE_URL: `https://person:${sensitive}@private.example.org`, PAPERCLIP_PUBLIC_URL: `https://person:${sensitive}@private.example.org` });
  assert.ok(errors.length >= 3);
  assert.ok(errors.every(error => !error.includes(sensitive) && !error.includes('private.example.org')));
});
