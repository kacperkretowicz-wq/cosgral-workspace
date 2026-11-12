// Backend bootstrap used by the Electron shell.
// Usage: node [tsx/cli.mjs] backend-entry.mjs <server entry (src/index.ts or dist/index.js)>
//
// Windows cannot deliver SIGTERM to another process, so the shell asks for an
// ordered shutdown over IPC. Emitting SIGTERM locally runs the server's own
// shutdown handler (stops services, then embedded Postgres) instead of a
// hard kill that leaves postmaster.pid behind.
import { pathToFileURL } from "node:url";
import path from "node:path";

const entry = process.argv[2];
if (!entry) {
  console.error("[cosgral-backend-entry] missing server entry argument");
  process.exit(2);
}

let shutdownRequested = false;
function requestShutdown(reason) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  console.log(`[cosgral-backend-entry] ordered shutdown (${reason})`);
  process.emit("SIGTERM", "SIGTERM");
}

if (typeof process.send === "function") {
  process.on("message", (message) => {
    if (message && message.type === "cosgral:shutdown") requestShutdown("shell request");
  });
  // The shell exited or crashed: do not leave an orphan server + Postgres.
  process.on("disconnect", () => requestShutdown("shell disconnected"));
}

// Keep argv shaped like `node <entry> ...` for code that inspects it.
process.argv.splice(1, 2, path.resolve(entry));
await import(pathToFileURL(path.resolve(entry)).href);
