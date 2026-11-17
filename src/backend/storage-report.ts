// COSGRAL W12 (BE-D): what the program keeps on the disk of this computer, for the Storage section of the server settings.
// The folder of the program's data is sorted by name: the database files are the chat history, the folders of provider accounts and
// environments are the provider environments, `logs` is what cleaning frees, everything else is app data. A missing folder is empty.

import { readdir, rm, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import type { StorageItemId, StorageReport } from "@openbot/contracts/ipc";

const CHAT_HISTORY = /^openbot\.db(-wal|-shm|-journal)?$/i;
const PROVIDER_ENVIRONMENT = /^(provider|accounts?|cli|managed|isolation)/i;

async function sizeOf(path: string): Promise<number> {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch {
    return 0;
  }
  if (!info.isDirectory()) return info.size;
  let total = 0;
  for (const name of await readdir(path).catch(() => [])) total += await sizeOf(join(path, name));
  return total;
}

export async function measureUserData(root: string, now: () => Date = () => new Date()): Promise<StorageReport> {
  const bytes: Record<StorageItemId, number> = { "chat-history": 0, "provider-environments": 0, "app-data": 0 };
  let logs = 0;
  for (const name of await readdir(root).catch(() => [])) {
    const size = await sizeOf(join(root, name));
    if (name.toLowerCase() === "logs") logs = size;
    else if (CHAT_HISTORY.test(name)) bytes["chat-history"] += size;
    else if (PROVIDER_ENVIRONMENT.test(name)) bytes["provider-environments"] += size;
    else bytes["app-data"] += size;
  }
  // The logs are part of app data (they are on the disk), and are the part that cleaning frees.
  bytes["app-data"] += logs;
  const freeBytes = await statfs(root)
    .then((info) => Number(info.bavail) * Number(info.bsize))
    .catch(() => null);
  return {
    totalBytes: bytes["chat-history"] + bytes["provider-environments"] + bytes["app-data"],
    freeBytes,
    items: [
      { id: "chat-history", bytes: bytes["chat-history"] },
      { id: "provider-environments", bytes: bytes["provider-environments"] },
      { id: "app-data", bytes: bytes["app-data"] },
    ],
    reclaimableBytes: logs,
    measuredAt: now().toISOString(),
  };
}

/** Deletes the contents of the `logs` folder (the folder stays, new logs start at once). A file in use is skipped. */
export async function clearLogs(root: string): Promise<void> {
  const logs = join(root, "logs");
  for (const name of await readdir(logs).catch(() => [])) {
    await rm(join(logs, name), { recursive: true, force: true }).catch(() => undefined);
  }
}
