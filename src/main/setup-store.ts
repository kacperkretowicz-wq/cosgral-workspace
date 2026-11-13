import { readFile, writeFile } from "node:fs/promises";
import type { AgentProviderId, AppSetupState } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";

interface StoredSetup {
  version: 2;
  preferredProvider: AgentProviderId;
  completedAt: string;
  /** COSGRAL W3: the agent created at the end of onboarding. */
  firstAgentId?: string;
}

/** COSGRAL W3: the whole setup record (onboarding reads the first agent too). */
export interface SetupRecord extends AppSetupState {
  firstAgentId: string | null;
}

const EMPTY_SETUP: AppSetupState = { completed: false, preferredProvider: null };

export async function readSetupState(path: string): Promise<AppSetupState> {
  const record = await readSetupRecord(path);
  return { completed: record.completed, preferredProvider: record.preferredProvider };
}

export async function readSetupRecord(path: string): Promise<SetupRecord> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (
      !isDynamicRecord(parsed) ||
      !isNumber(parsed.version) ||
      parsed.version !== 2 ||
      !isOneOf(["codex", "claude"] as const, parsed.preferredProvider) ||
      !isString(parsed.completedAt)
    ) {
      return { ...EMPTY_SETUP, firstAgentId: null };
    }
    return {
      completed: true,
      preferredProvider: parsed.preferredProvider,
      firstAgentId: isString(parsed.firstAgentId) ? parsed.firstAgentId : null,
    };
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return { ...EMPTY_SETUP, firstAgentId: null };
    throw error;
  }
}

/** Saves the provider and keeps the first agent of an earlier onboarding unless `firstAgentId` is given. */
export async function writeSetupState(
  path: string,
  preferredProvider: AgentProviderId,
  firstAgentId?: string | null,
): Promise<AppSetupState> {
  const previous = await readSetupRecord(path);
  const keptAgent = firstAgentId === undefined ? previous.firstAgentId : firstAgentId;
  const stored: StoredSetup = {
    version: 2,
    preferredProvider,
    completedAt: new Date().toISOString(),
    ...(keptAgent ? { firstAgentId: keptAgent } : {}),
  };
  await writeFile(path, `${JSON.stringify(stored)}\n`, { encoding: "utf8", mode: 0o600 });
  return { completed: true, preferredProvider };
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
