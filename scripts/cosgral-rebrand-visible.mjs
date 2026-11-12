/**
 * Replace user-visible "OpenBot" product copy with COSGRAL Workspace / COSGRAL.
 * Leaves identifiers: @openbot/*, OpenBotDesktopApi, window.openbot, createMockOpenBot,
 * OpenBotDatabase, isOpenBot*, exportOpenBotData, MockOpenBot*.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [join(root, "src", "renderer"), join(root, "src", "main"), join(root, "src", "backend"), join(root, "tests")];

const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".md", ".json"]);

const PHRASES = [
  ["Verified. Opening OpenBot…", "Verified. Opening COSGRAL Workspace…"],
  [
    "OpenBot could not reach the account service. Check that the API is running, then try again.",
    "COSGRAL Workspace could not reach the account service. Check that the API is running, then try again.",
  ],
  [
    "OpenBot could not reach the account service. Check your connection and try again.",
    "COSGRAL Workspace could not reach the account service. Check your connection and try again.",
  ],
  ["OpenBot still can’t reach the account service.", "COSGRAL Workspace still can’t reach the account service."],
  ["OpenBot can’t reach the account service right now.", "COSGRAL Workspace can’t reach the account service right now."],
  ["OpenBot couldn’t restart sign in. Try again.", "COSGRAL Workspace couldn’t restart sign in. Try again."],
  ["OpenBot could not start the local remote desktop bridge.", "COSGRAL Workspace could not start the local remote desktop bridge."],
  ["OpenBot could not authorize Remote Desktop access.", "COSGRAL Workspace could not authorize Remote Desktop access."],
  ["OpenBot could not read macOS permissions.", "COSGRAL Workspace could not read macOS permissions."],
  ["OpenBot could not open this macOS permission.", "COSGRAL Workspace could not open this macOS permission."],
  ["OpenBot could not save your local setup.", "COSGRAL Workspace could not save your local setup."],
  ["OpenBot could not connect to this host.", "COSGRAL Workspace could not connect to this host."],
  ["OpenBot could not send the sign-in code.", "COSGRAL Workspace could not send the sign-in code."],
  ["OpenBot could not make this image small enough. Choose a simpler image.", "COSGRAL Workspace could not make this image small enough. Choose a simpler image."],
  [
    "Install and sign in to Codex CLI or Claude CLI, then restart OpenBot.",
    "Install and sign in to Codex CLI or Claude CLI, then restart COSGRAL Workspace.",
  ],
  ["Keep OpenBot running in the background", "Keep COSGRAL Workspace running in the background"],
  ["Launch OpenBot at login", "Launch COSGRAL Workspace at login"],
  ["Control how OpenBot behaves on this computer.", "Control how COSGRAL Workspace behaves on this computer."],
  [
    "Paste the one-time invitation link. You will join with your signed-in OpenBot account.",
    "Paste the one-time invitation link. You will join with your signed-in COSGRAL account.",
  ],
  ["Use an invitation from the person who runs your OpenBot host.", "Use an invitation from the person who runs your COSGRAL host."],
  [
    "Use this computer, or connect to an OpenBot host that runs somewhere else.",
    "Use this computer, or connect to a COSGRAL host that runs somewhere else.",
  ],
  ["Use Codex or Claude locally. Keep all OpenBot data here.", "Use Codex or Claude locally. Keep all COSGRAL data here."],
  ["Run Codex or Claude locally. Keep all OpenBot data here.", "Run Codex or Claude locally. Keep all COSGRAL data here."],
  ["Use agents and conversations from an existing OpenBot host.", "Use agents and conversations from an existing COSGRAL host."],
  [
    "This removes the agent, its OpenBot queue, and managed files used only by that conversation. Its",
    "This removes the agent, its COSGRAL queue, and managed files used only by that conversation. Its",
  ],
  [
    "Configure publishing, access, people, and remote desktop settings for this OpenBot.",
    "Configure publishing, access, people, and remote desktop settings for this COSGRAL Workspace.",
  ],
  [
    "Control the secure public address for this local OpenBot instance.",
    "Control the secure public address for this local COSGRAL Workspace instance.",
  ],
  [
    "Publish the agents, conversations, files, and browser from this local OpenBot instance through a secure public",
    "Publish the agents, conversations, files, and browser from this local COSGRAL Workspace instance through a secure public",
  ],
  ["Make this OpenBot public before inviting people.", "Make this COSGRAL Workspace public before inviting people."],
  ["Make this OpenBot public before creating an invite.", "Make this COSGRAL Workspace public before creating an invite."],
  ["Make this OpenBot public first.", "Make this COSGRAL Workspace public first."],
  ["Name this OpenBot before publishing it.", "Name this COSGRAL Workspace before publishing it."],
  ["Publishing this OpenBot through its secure address…", "Publishing this COSGRAL Workspace through its secure address…"],
  ["This OpenBot and Remote Desktop are publicly reachable.", "This COSGRAL Workspace and Remote Desktop are publicly reachable."],
  ["This OpenBot is public. Only invited people can sign in.", "This COSGRAL Workspace is public. Only invited people can sign in."],
  [
    "This OpenBot is public. Add the dedicated VNC password to enable Remote Desktop.",
    "This COSGRAL Workspace is public. Add the dedicated VNC password to enable Remote Desktop.",
  ],
  ["This OpenBot could not be published.", "This COSGRAL Workspace could not be published."],
  ["Making this OpenBot private…", "Making this COSGRAL Workspace private…"],
  ["This OpenBot is private.", "This COSGRAL Workspace is private."],
  ["This host is not linked to an OpenBot owner account.", "This host is not linked to a COSGRAL owner account."],
  ["Sign in with the OpenBot email that created this host.", "Sign in with the COSGRAL email that created this host."],
  ["This OpenBot account is not a member of the team.", "This COSGRAL account is not a member of the team."],
  ["OpenBot sign-in is required.", "COSGRAL sign-in is required."],
  ["Enter a valid OpenBot invitation link.", "Enter a valid COSGRAL invitation link."],
  ["The OpenBot invitation link is invalid.", "The COSGRAL invitation link is invalid."],
  ["Enter a valid OpenBot address update link.", "Enter a valid COSGRAL address update link."],
  ["The OpenBot address update link is invalid.", "The COSGRAL address update link is invalid."],
  ["Enter a valid OpenBot Remote Mac hostname.", "Enter a valid COSGRAL Remote Mac hostname."],
  ["Sign in to OpenBot first.", "Sign in to COSGRAL Workspace first."],
  ["Unable to republish this OpenBot:", "Unable to republish this COSGRAL Workspace:"],
  ["OpenBot server update failed", "COSGRAL Workspace server update failed"],
  ["OpenBot failed to start:", "COSGRAL Workspace failed to start:"],
  ["OpenBot couldn’t start", "COSGRAL Workspace couldn’t start"],
  ["OpenBot update available", "COSGRAL Workspace update available"],
  ["Join an OpenBot team", "Join a COSGRAL team"],
  ["Where will OpenBot run?", "Where will COSGRAL Workspace run?"],
  ["OpenBot setup", "COSGRAL setup"],
  ["OpenBot documentation", "COSGRAL documentation"],
  ["OpenBot version", "COSGRAL Workspace version"],
  ["OpenBot team", "COSGRAL team"],
  ["OpenBot server", "COSGRAL server"],
  ["OpenBot Backup", "COSGRAL Backup"],
  ["Search OpenBot", "Search COSGRAL"],
  ["Publish this OpenBot", "Publish this COSGRAL Workspace"],
  ["This OpenBot", "This COSGRAL Workspace"],
  ["Connecting to OpenBot", "Connecting to COSGRAL Workspace"],
  ["Sign in to OpenBot", "Sign in to COSGRAL Workspace"],
  ["Animate OpenBot logo", "Animate COSGRAL logo"],
  ["Could not update OpenBot.", "Could not update COSGRAL Workspace."],
  ["OpenBot UI foundation", "COSGRAL UI foundation"],
  ["Feedback%20for%20OpenBot%20%40norbertbodziony%3A%20", "Feedback%20for%20COSGRAL%20Workspace%3A%20"],
  ["/mock/OpenBot/Bots/", "/mock/COSGRAL/Bots/"],
  ["OpenBot-backup-", "COSGRAL-backup-"],
  ["OpenBot-diagnostics-", "COSGRAL-diagnostics-"],
  ["filters paste through the OpenBot alphabet", "filters paste through the COSGRAL alphabet"],
  ["uses the verified OpenBot email as the team identity", "uses the verified COSGRAL email as the team identity"],
  ["allows only the OpenBot email that created the host to own it", "allows only the COSGRAL email that created the host to own it"],
  [
    "joins an email-bound invitation with a verified OpenBot account",
    "joins an email-bound invitation with a verified COSGRAL account",
  ],
  ["parses an OpenBot invitation", "parses a COSGRAL invitation"],
  ["accepts only the packaged OpenBot application origin", "accepts only the packaged COSGRAL Workspace application origin"],
  ["openbot-logo-production.png", "cosgral-logo-production.png"],
  ["openbot-logo-dev.png", "cosgral-logo-dev.png"],
  ["openbot-logo-preview.png", "cosgral-logo-preview.png"],
  ['application: { name: "OpenBot"', 'application: { name: "COSGRAL Workspace"'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "out") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (TEXT_EXT.has(extname(name))) out.push(p);
  }
  return out;
}

function shouldSkipIdentifierLine(line) {
  return (
    /@openbot\//.test(line) ||
    /OpenBotDesktopApi/.test(line) ||
    /createMockOpenBot/.test(line) ||
    /MockOpenBot/.test(line) ||
    /OpenBotDatabase/.test(line) ||
    /isOpenBot/.test(line) ||
    /exportOpenBotData/.test(line) ||
    /window\.openbot/.test(line) ||
    /\bopenbot:/.test(line) ||
    /from ["'].*openbot/.test(line) ||
    /OpenBot\.app/.test(line)
  );
}

let changedFiles = 0;
const files = roots.flatMap((r) => (statSync(r, { throwIfNoEntry: false }) ? walk(r) : []));

for (const file of files) {
  let text = readFileSync(file, "utf8");
  const original = text;

  for (const [from, to] of PHRASES) {
    if (text.includes(from)) text = text.split(from).join(to);
  }

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("OpenBot")) continue;
    if (shouldSkipIdentifierLine(line)) continue;
    lines[i] = line.replaceAll("OpenBot Workspace", "COSGRAL Workspace").replaceAll("an OpenBot", "a COSGRAL Workspace").replaceAll("OpenBot", "COSGRAL Workspace");
  }
  text = lines.join("\n");

  text = text
    .replaceAll("COSGRAL Workspace Workspace", "COSGRAL Workspace")
    .replaceAll("a COSGRAL Workspace host", "a COSGRAL host")
    .replaceAll("COSGRAL Workspace team", "COSGRAL team")
    .replaceAll("COSGRAL Workspace account", "COSGRAL account")
    .replaceAll("COSGRAL Workspace email", "COSGRAL email")
    .replaceAll("COSGRAL Workspace alphabet", "COSGRAL alphabet")
    .replaceAll("COSGRAL Workspace UI foundation", "COSGRAL UI foundation")
    .replaceAll("Animate COSGRAL Workspace logo", "Animate COSGRAL logo")
    .replaceAll("Search COSGRAL Workspace", "Search COSGRAL")
    .replaceAll("COSGRAL Workspace setup", "COSGRAL setup")
    .replaceAll("COSGRAL Workspace documentation", "COSGRAL documentation")
    .replaceAll("COSGRAL Workspace server", "COSGRAL server")
    .replaceAll('value="openbot">COSGRAL Workspace</option>', 'value="openbot">COSGRAL</option>')
    .replaceAll('name: "COSGRAL Workspace"', 'name: "COSGRAL"')
    .replaceAll('account-login-wordmark">COSGRAL Workspace</span>', 'account-login-wordmark">COSGRAL</span>')
    .replaceAll("?? \"COSGRAL Workspace\"", '?? "COSGRAL"')
    .replaceAll("?? 'COSGRAL Workspace'", "?? 'COSGRAL'");

  if (text !== original) {
    writeFileSync(file, text);
    changedFiles++;
    console.log("updated", file.slice(root.length + 1));
  }
}

console.log("changed files:", changedFiles);
