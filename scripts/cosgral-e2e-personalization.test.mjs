import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePreference } from './cosgral-e2e-personalization.mjs';
import { localOrigin } from './cosgral-e2e-agent-config.mjs';
test('validates saved geometry, accents and views', () => {
 const value = { theme: 'system', accent: 'violet', sidebarWidth: 280, conversationWidth: 320, detailsOpen: false, views: { p: 'table' } };
 assert.equal(validatePreference(value), value);
 for (const patch of [{ theme: 'wrong' }, { sidebarWidth: -1 }, { conversationWidth: 9000 }, { accent: 'red' }, { views: { p: 'wrong' } }]) assert.throws(() => validatePreference({ ...value, ...patch }));
});
test('acceptance fixture only permits its dedicated local port', () => {
 assert.equal(localOrigin('http://127.0.0.1:3197'), 'http://127.0.0.1:3197');
 for (const origin of ['http://127.0.0.1:3199', 'https://example.com:3197', 'http://x:y@localhost:3197']) assert.throws(() => localOrigin(origin));
});
