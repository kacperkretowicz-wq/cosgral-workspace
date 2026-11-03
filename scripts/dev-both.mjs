import { spawn } from "node:child_process";

const jobs = [
  { name: "dev", script: "dev" },
  { name: "mobile", script: "dev:mobile" },
];
const nameWidth = Math.max(...jobs.map((j) => j.name.length));
const children = [];
let stopping = false;

function prefix(name, data) {
  const label = `[${name.padEnd(nameWidth)}] `;
  return label + String(data).replace(/\n(?!$)/g, `\n${label}`);
}

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  // The unref'ed fallback timer need not keep Node alive after children exit.
  // Preserve the failure even if the event loop drains before that timer fires.
  process.exitCode = code;
  for (const { child } of children) {
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

for (const job of jobs) {
  // Windows package-manager shims are .cmd files and cannot be executed
  // directly by spawn. The job names above are fixed, not user input.
  const windows = process.platform === "win32";
  const child = spawn(windows ? (process.env.ComSpec || "cmd.exe") : "pnpm", windows
    ? ["/d", "/s", "/c", "pnpm.cmd", "run", job.script]
    : ["run", job.script], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  child.stdout.on("data", (d) => process.stdout.write(prefix(job.name, d)));
  child.stderr.on("data", (d) => process.stderr.write(prefix(job.name, d)));
  child.on("error", (error) => {
    process.stderr.write(prefix(job.name, `failed to start: ${error.message}\n`));
    stopAll(1);
  });
  child.on("exit", (code, signal) => {
    process.stderr.write(prefix(job.name, `exited (code=${code} signal=${signal})\n`));
    stopAll(code ?? 1);
  });
  children.push({ name: job.name, child });
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => stopAll(0));
}
