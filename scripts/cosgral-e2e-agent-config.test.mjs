import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTemplate, localOrigin } from './cosgral-e2e-agent-config.mjs';
test('never accepts secrets or arbitrary keys in portable template', () => {
 assert.throws(() => validateTemplate({ version: 1, env: { KEY: 'SECRET' } }));
 assert.throws(() => validateTemplate({ version: 1, adapterConfig: {} }));
});
test('only disposable fixture on 3197 is allowed', () => {
 assert.equal(localOrigin('http://127.0.0.1:3197'), 'http://127.0.0.1:3197');
 for (const url of ['http://localhost:3199', 'https://example.org', 'http://user:pass@localhost:3197']) assert.throws(() => localOrigin(url));
});
