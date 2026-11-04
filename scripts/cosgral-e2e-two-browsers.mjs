import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { resolve, relative, isAbsolute } from 'node:path';
import { writeFile, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const repo = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
  api: { type: 'string' }, 'state-directory': { type: 'string' },
  'browser-channel': { type: 'string' },
} });
if (!values.api || !values['state-directory']) throw new Error('--api and --state-directory are required');
const origin = new URL(values.api);
if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) throw new Error('Use an origin without credentials or paths');
if (origin.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('HTTP requires loopback');
const root = await realpath(resolve(values['state-directory']));
const relativeRoot = relative(await realpath(repo), root);
if (!isAbsolute(relativeRoot) && relativeRoot !== '..' && !relativeRoot.startsWith('../') && !relativeRoot.startsWith('..\\')) throw new Error('Acceptance state must remain outside the repository');
const { chromium, expect } = createRequire(repo + '/package.json')('@playwright/test');
const { readPrivateAcceptanceJson } = await import(pathToFileURL(repo + '/scripts/private-acceptance-file.mjs'));
const state = await readPrivateAcceptanceJson(root + '/state.json');
const credentials = await readPrivateAcceptanceJson(root + '/state.json.credentials.json');
const browser = await chromium.launch({ headless: true, channel: values['browser-channel'] });
const contexts = [], stages = [];
let stage = 'initialization';
try {
  const pages = {};
  for (const key of ['A', 'B']) {
    stage = `UI sign-in ${key}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    contexts.push(context);
    const page = await context.newPage();
    pages[key] = page;
    await page.goto(`${origin.origin}/auth`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email', { exact: true }).fill(state.users[key].email);
    await page.getByLabel('Password', { exact: true }).fill(credentials.passwords[key]);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).not.toHaveURL(/\/auth(?:\?|$)/, { timeout: 30000 });
    const session = await (await page.request.get(`${origin.origin}/api/auth/get-session`)).json();
    if (session.user?.id !== state.users[key].id) throw new Error('Wrong session');
    stages.push(stage);
  }
  const company = await (await pages.A.request.get(`${origin.origin}/api/companies/${state.companyId}`)).json();
  const conversationUrl = `${origin.origin}/${company.issuePrefix}/projects/${state.projectId}/conversation`;
  for (const page of Object.values(pages)) await page.goto(conversationUrl, { waitUntil: 'domcontentloaded' });
  stage = 'separate browser contexts share messages';
  const marker = `Browser A ${randomUUID()}`;
  await pages.A.getByRole('textbox', { name: 'Wiadomo\u015b\u0107 do zespo\u0142u projektu\u2026', exact: true }).fill(marker);
  await pages.A.getByRole('button', { name: 'Wy\u015blij', exact: true }).click();
  await expect(pages.B.getByText(marker, { exact: true })).toBeVisible({ timeout: 15000 });
  const reply = `Browser B ${randomUUID()}`;
  await pages.B.getByRole('textbox', { name: 'Wiadomo\u015b\u0107 do zespo\u0142u projektu\u2026', exact: true }).fill(reply);
  await pages.B.getByRole('button', { name: 'Wy\u015blij', exact: true }).click();
  await expect(pages.A.getByText(reply, { exact: true })).toBeVisible({ timeout: 15000 });
  stages.push(stage);
  stage = 'real profile name and image upload refresh the second browser';
  await pages.A.goto(`${origin.origin}/${company.issuePrefix}/company/settings/instance/profile`);
  const profileName = `Browser profile ${Date.now()}`;
  await pages.A.getByLabel('Display name', { exact: true }).fill(profileName);
  await pages.A.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(pages.A.locator('input[type=file]')).toBeEnabled();
  await pages.A.locator('input[type=file]').setInputFiles(repo + '/ui/public/favicon-32x32.png');
  await expect.poll(async () => {
    const profile = await (await pages.A.request.get(`${origin.origin}/api/auth/profile`)).json();
    return profile.image?.startsWith('/api/assets/') ? profile.image : null;
  }, { timeout: 20000 }).toBeTruthy();
  await expect(pages.B.locator('#cosgral-messages').getByText(profileName, { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await expect.poll(() => pages.B.locator('#cosgral-messages img').evaluateAll((images, name) => images.some(image => image.closest("span[title]")?.title === name && image.complete && image.naturalWidth > 0), profileName), { timeout: 15000 }).toBe(true);
  await pages.A.goto(conversationUrl);
  await expect(pages.B.getByTestId('conversation-presence-summary')).toContainText(profileName, { timeout: 15000 });
  stages.push(stage);
  await pages.B.screenshot({ path: root + '/two-browser-conversation.png', fullPage: true });
  await writeFile(root + '/browser-result.json', JSON.stringify({ passed: true, stages }, null, 2));
  console.log('PASS two independent browser contexts: messages, profile upload, image loading and presence');
} catch (error) {
  await writeFile(root + '/browser-result.json', JSON.stringify({ passed: false, stage, stages }, null, 2));
  console.error(`FAIL browser acceptance stage: ${stage}; details withheld`);
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}





