import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localOrigin } from './cosgral-e2e-agent-config.mjs';
import { main } from './cosgral-e2e-instructions.mjs';
test('import nie uruchamia fixture; odbiór dostępny jawnie', () => assert.equal(typeof main, 'function'));
test('odbiór używa wyłącznie lokalnego adresu 3197', () => {
 assert.equal(localOrigin('http://127.0.0.1:3197'), 'http://127.0.0.1:3197');
 for (const value of ['http://example.com:3197', 'http://127.0.0.1:3199', 'https://127.0.0.1:3197']) assert.throws(() => localOrigin(value));
});
