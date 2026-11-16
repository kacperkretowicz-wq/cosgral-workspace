// COSGRAL W6-BE5: a fake ACP agent for the sign-in tests. It behaves like the two real agents the sign-in was checked against:
// - mode "link-code" (Gemini CLI): `initialize` lists the sign-in methods; `authenticate` with NO_BROWSER set prints a link and
//   asks for a code on stdin; a wrong code prints an error on stderr and a NEW link (retry); the right code answers `authenticate`.
// - mode "terminal" (Antigravity agy): `initialize` lists a terminal method with args ["--login"]; started with `--login` it prints
//   a link, reads a code, and exits 0 on the right code or 1 with a readable message.
// - mode "no-methods": only an API key method. "silent": never answers initialize. "crash": exits at once.
// The right code is "good-code". Usage: node acp-login-stub.mjs <mode> [--login]
import { createInterface } from "node:readline";

const mode = process.argv[2] ?? "link-code";
const login = process.argv.includes("--login");
const GOOD = "good-code";
let attempt = 0;
const link = () => {
  attempt += 1;
  return `https://accounts.example.test/auth?attempt=${attempt}`;
};
const say = (text) => process.stdout.write(text);
const rpc = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

if (mode === "crash") process.exit(3);
if (mode === "silent") setInterval(() => {}, 1000);

const METHODS = {
  "link-code": [
    { id: "oauth-personal", name: "Log in with Google", description: "Log in with your Google account" },
    { id: "gemini-api-key", name: "Gemini API key", description: "Use an API key" },
  ],
  terminal: [
    { id: "oauth-personal", name: "Log in with Google", description: "Log in with your Google account" },
    {
      id: "terminal-login",
      name: "Log in from the terminal",
      description: "Paste a code in a terminal",
      type: "terminal",
      args: ["--login"],
    },
  ],
  "no-methods": [{ id: "gemini-api-key", name: "Gemini API key", description: "Use an API key" }],
};

const lines = createInterface({ input: process.stdin });
let authenticateId = null;
let waitingForCode = false;

if (login) {
  // `agy acp --login`: a link, then a code.
  say(`Open this link in a browser to log in with Google:\n\n  ${link()}\n\n`);
  waitingForCode = true;
}

lines.on("line", (line) => {
  if (mode === "silent") return;
  const text = line.trim();
  if (waitingForCode && !text.startsWith("{")) {
    if (text === GOOD) {
      if (login) process.exit(0);
      waitingForCode = false;
      rpc({ jsonrpc: "2.0", id: authenticateId, result: {} });
      return;
    }
    if (login) {
      say(`couldn't log in: token exchange failed: oauth2: "invalid_grant" "Malformed auth code."\n`);
      process.exit(1);
    }
    process.stderr.write("Failed to authenticate with authorization code:invalid_grant\n");
    say(`Please visit the following URL to authorize the application:\n\n${link()}\n\nEnter the authorization code: `);
    return;
  }
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  if (message.method === "initialize") {
    rpc({
      jsonrpc: "2.0",
      id: message.id,
      result: { protocolVersion: 1, agentInfo: { name: "stub", version: "0" }, authMethods: METHODS[mode] ?? [] },
    });
  } else if (message.method === "authenticate") {
    authenticateId = message.id;
    if (process.env.NO_BROWSER !== "true") {
      rpc({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32603, message: "A browser is needed (NO_BROWSER is not set)." },
      });
      return;
    }
    waitingForCode = true;
    say(`Please visit the following URL to authorize the application:\n\n${link()}\n\nEnter the authorization code: `);
  } else if (message.method === "session/new") {
    rpc({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "Authentication required" } });
  }
});
