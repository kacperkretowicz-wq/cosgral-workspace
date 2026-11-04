#!/usr/bin/env node
import { access, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// This is the deployment profile's admission check, not a second runtime policy.
// Errors name fields only: populated environment values must not reach logs.
export function validateDeployment(env) {
  const errors = [];
  for (const [name, value] of Object.entries({
    PAPERCLIP_HOME: '/var/lib/cosgral', HOST: '127.0.0.1', PAPERCLIP_BIND: 'loopback',
    PAPERCLIP_DEPLOYMENT_MODE: 'authenticated', PAPERCLIP_DEPLOYMENT_EXPOSURE: 'public',
    PAPERCLIP_AUTH_BASE_URL_MODE: 'explicit', PAPERCLIP_SECRETS_PROVIDER: 'local_encrypted',
    PAPERCLIP_SECRETS_STRICT_MODE: 'true', SERVE_UI: 'true',
    PAPERCLIP_SECRETS_MASTER_KEY_FILE: '/var/lib/cosgral/secrets/master.key',
  })) if (env[name] !== value) errors.push(`Configure ${name} for the COSGRAL service profile`);
  for (const name of ['BETTER_AUTH_SECRET', 'PAPERCLIP_AGENT_JWT_SECRET', 'PAPERCLIP_TOOL_ACTION_SIGNING_SECRET']) {
    if (!env[name] || env[name].length < 32 || env[name].includes('CHANGE_ME')) errors.push(`Set a persistent random ${name}`);
  }
  try {
    const db = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.username || !db.password || db.password.includes('CHANGE_ME') || db.pathname.length < 2) throw new Error();
  } catch { errors.push('Configure DATABASE_URL for persistent PostgreSQL'); }
  try {
    const url = new URL(env.PAPERCLIP_PUBLIC_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.hostname.toUpperCase().includes('CHANGE_ME')) throw new Error();
  } catch { errors.push('Configure PAPERCLIP_PUBLIC_URL as the public HTTPS origin'); }
  return errors;
}

export async function main() {
  const errors = validateDeployment(process.env);
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 11)) errors.push('Node >=24.11 is required');
  if (process.platform !== 'linux') errors.push('The COSGRAL execution host must run Linux');
  if (process.getuid?.() === 0) errors.push('Run the service as the cosgral user, not root');
  if (errors.length) { errors.forEach(error => console.error(error)); return 1; }
  try {
    const path = process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
    const metadata = await stat(path);
    const raw = (await readFile(path, 'utf8')).trim();
    if (!metadata.isFile() || (metadata.mode & 0o077) !== 0 || !(/^[a-fA-F0-9]{64}$/.test(raw) || Buffer.from(raw, 'base64').length === 32 || raw.length === 32)) throw new Error();
    await access('server/dist/index.js');
    await access('server/ui-dist/index.html');
  } catch { console.error('Check private master key permissions/content and compiled server/UI artifacts'); return 1; }
  try {
    execFileSync('/usr/bin/bwrap', ['--die-with-parent', '--new-session', '--unshare-pid', '--unshare-ipc', '--unshare-uts',
      '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '/usr/bin/true'], { timeout: 10000, stdio: 'ignore' });
    execFileSync('git', ['--version'], { timeout: 5000, stdio: 'ignore' });
    execFileSync('codex', ['--version'], { timeout: 5000, stdio: 'ignore' });
  } catch { console.error('Git, Codex CLI or the Bubblewrap namespace probe failed; qualify the host before starting agents'); return 1; }
  console.log('COSGRAL host preflight passed; database connectivity, model login and full agent isolation still require acceptance.');
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
