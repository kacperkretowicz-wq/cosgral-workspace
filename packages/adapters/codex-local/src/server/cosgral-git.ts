import fs from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Private shallow Git view: own HEAD tree and index objects only.
 * Never expose common config, refs, other worktree metadata or unrelated blobs.
 */
export async function prepareCosgralGitView(cwd: string, home: string) {
  const marker = path.join(cwd, ".git");
  const stat = await fs.lstat(marker).catch(() => null);
  if (!stat) return [];
  if (!stat.isFile()) throw new Error("COSGRAL execution requires an isolated Git worktree.");
  const env = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  const git = async (...args: string[]) => (await exec("git", ["-C", cwd, ...args], {
    env, timeout: 30000, maxBuffer: 16 * 1024 * 1024,
  })).stdout.trim();
  const own = await git("rev-parse", "--absolute-git-dir");
  const head = await git("rev-parse", "--verify", "HEAD");
  if (!/^[a-f0-9]{40,64}$/.test(head)) throw new Error("Invalid worktree HEAD");
  const view = path.join(home, "git-view");
  await fs.mkdir(path.join(view, "refs"), { recursive: true });
  await fs.mkdir(path.join(view, "objects", "pack"), { recursive: true });
  if (head.length === 64) await fs.writeFile(path.join(view, "config"), "[core]\nrepositoryformatversion = 1\n[extensions]\nobjectformat = sha256\n");
  await fs.writeFile(path.join(view, "HEAD"), head + "\n");
  await fs.writeFile(path.join(view, "shallow"), head + "\n");
  // A worktree can have staged blobs that differ from HEAD. Include only those
  // referenced by its own index, with no common object-store bind or alternates.
  await fs.copyFile(path.join(own, "index"), path.join(view, "index"));
  const objects = new Set((await git("rev-list", "--objects", "--no-object-names", "--no-walk=unsorted", head)).split("\n"));
  // Read the copied index so the pack and status use the same snapshot.
  const { stdout: index } = await exec("git", ["-C", cwd, "ls-files", "--stage", "-z"], {
    env: { ...env, GIT_INDEX_FILE: path.join(view, "index") }, timeout: 10000, maxBuffer: 16 * 1024 * 1024,
  });
  for (const entry of index.split("\0")) {
    const match = /^\d+ ([a-f0-9]{40,64}) \d\t/.exec(entry);
    if (match && !/^0+$/.test(match[1]!)) objects.add(match[1]!);
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, "pack-objects", "--quiet", "--no-reuse-delta", "--no-reuse-object", path.join(view, "objects", "pack", "pack")], {
      env, stdio: ["pipe", "ignore", "ignore"], signal: AbortSignal.timeout(30000),
    });
    let failure: Error | undefined;
    child.on("error", error => { failure = error; });
    child.stdin.on("error", error => { failure = error; });
    child.on("close", code => code === 0 && !failure ? resolve() : reject(failure ?? new Error("Unable to prepare private worktree objects")));
    child.stdin.end([...objects].join("\n") + "\n");
  });
  const pointer = path.join(home, "git-pointer");
  await fs.writeFile(pointer, `gitdir: ${view}\n`);
  return [{ source: view, target: view }, { source: pointer, target: marker }];
}
