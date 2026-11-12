import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type AvatarMimeType, isAvatarMimeType, isValidAvatarImage } from "@openbot/contracts/avatar-images";
import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import type { AvatarImageInput, CentralAuthState, CentralAuthUser } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { isUuidV4, normalizeEmailAddress } from "@openbot/contracts/validation";
import { CentralAuthManager, type ProvisionedTeamTunnel, readCentralAuthApiUrl } from "./central-auth-manager";

/**
 * COSGRAL: the account surface the desktop main process uses. The OpenBot 0.1.11
 * {@link CentralAuthManager} talks to a hosted account service; {@link LocalOwnerAccount}
 * keeps the owner on this computer so the app works without any external service.
 */
export interface AccountManager {
  on(event: "changed", listener: (state: CentralAuthState) => void): unknown;
  initialize(): Promise<CentralAuthState>;
  retry(): Promise<CentralAuthState>;
  getState(): CentralAuthState;
  getSignedInUser(): CentralAuthUser;
  requestEmailCode(email: string): Promise<CentralAuthState>;
  verifyEmailCode(challengeId: string, code: string): Promise<CentralAuthState>;
  updateAvatar(image: AvatarImageInput | null): Promise<CentralAuthState>;
  logout(): Promise<CentralAuthState>;
  createTeamAuthTicket(serverId: string): Promise<string>;
  redeemTeamAuthTicket(ticket: string, serverId: string): Promise<CentralAuthUser | null>;
  sendTeamInviteEmail(input: {
    email: string;
    serverName: string;
    inviteUrl: string;
    role: "admin" | "member";
  }): Promise<void>;
  provisionTeamTunnel(input: {
    serverId: string;
    serverName: string;
    apiPort?: number | null;
    vncEnabled?: boolean;
  }): Promise<ProvisionedTeamTunnel>;
}

interface LocalOwnerAccountOptions {
  profilePath: string;
  defaultName: string;
}

interface StoredOwnerProfile {
  version: 1;
  id: string;
  email: string;
  name: string;
  avatar: { mimeType: AvatarMimeType; data: string } | null;
  createdAt: string;
}

const PROFILE_VERSION = 1;
const FALLBACK_OWNER_NAME = "Owner";
const LOCAL_EMAIL_DOMAIN = "cosgral.local";
const TEAM_SIGN_IN_UNAVAILABLE =
  "Joining another COSGRAL server needs team sign-in, which the local profile does not support yet.";
const PUBLIC_ADDRESS_UNAVAILABLE =
  "Publishing this COSGRAL Workspace on a public address is not available with the local profile yet.";
const INVITE_EMAIL_UNAVAILABLE = "The local profile cannot send invite emails. Share the invite link instead.";

export class LocalOwnerAccount extends EventEmitter<{ changed: [state: CentralAuthState] }> implements AccountManager {
  readonly #options: LocalOwnerAccountOptions;
  #profile: StoredOwnerProfile | null = null;
  #state: CentralAuthState = { status: "loading" };

  constructor(options: LocalOwnerAccountOptions) {
    super();
    this.#options = options;
  }

  getState(): CentralAuthState {
    return structuredClone(this.#state);
  }

  getSignedInUser(): CentralAuthUser {
    if (this.#state.status !== "signed_in") {
      throw new Error("The local COSGRAL profile is not ready yet.");
    }
    return structuredClone(this.#state.user);
  }

  async initialize(): Promise<CentralAuthState> {
    if (this.#profile) return this.getState();
    this.#profile = (await this.#readProfile()) ?? (await this.#createProfile());
    return this.#publish();
  }

  retry(): Promise<CentralAuthState> {
    return this.initialize();
  }

  requestEmailCode(_email: string): Promise<CentralAuthState> {
    return this.initialize();
  }

  verifyEmailCode(_challengeId: string, _code: string): Promise<CentralAuthState> {
    return this.initialize();
  }

  logout(): Promise<CentralAuthState> {
    return this.initialize();
  }

  async updateAvatar(image: AvatarImageInput | null): Promise<CentralAuthState> {
    await this.initialize();
    const profile = this.#requireProfile();
    if (image && !isValidAvatarImage(image.mimeType, image.bytes)) {
      throw new Error("Choose a valid PNG, JPEG, or WebP image up to 512 KB.");
    }
    const next: StoredOwnerProfile = {
      ...profile,
      avatar: image ? { mimeType: image.mimeType, data: Buffer.from(image.bytes).toString("base64") } : null,
    };
    await this.#writeProfile(next);
    this.#profile = next;
    return this.#publish();
  }

  async createTeamAuthTicket(_serverId: string): Promise<string> {
    throw new Error(TEAM_SIGN_IN_UNAVAILABLE);
  }

  async redeemTeamAuthTicket(_ticket: string, _serverId: string): Promise<CentralAuthUser | null> {
    return null;
  }

  async sendTeamInviteEmail(_input: {
    email: string;
    serverName: string;
    inviteUrl: string;
    role: "admin" | "member";
  }): Promise<void> {
    throw new Error(INVITE_EMAIL_UNAVAILABLE);
  }

  async provisionTeamTunnel(_input: {
    serverId: string;
    serverName: string;
    apiPort?: number | null;
    vncEnabled?: boolean;
  }): Promise<ProvisionedTeamTunnel> {
    throw new Error(PUBLIC_ADDRESS_UNAVAILABLE);
  }

  #publish(): CentralAuthState {
    const profile = this.#requireProfile();
    this.#state = {
      status: "signed_in",
      localProfile: true,
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatar ? `data:${profile.avatar.mimeType};base64,${profile.avatar.data}` : null,
      },
    };
    const copy = this.getState();
    this.emit("changed", copy);
    return copy;
  }

  #requireProfile(): StoredOwnerProfile {
    if (!this.#profile) throw new Error("The local COSGRAL profile is not ready yet.");
    return this.#profile;
  }

  async #readProfile(): Promise<StoredOwnerProfile | null> {
    let raw: string;
    try {
      raw = await readFile(this.#options.profilePath, "utf8");
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    const profile = decodeProfile(raw);
    if (profile) return profile;
    await rename(this.#options.profilePath, `${this.#options.profilePath}.corrupt-${Date.now()}`);
    return null;
  }

  async #createProfile(): Promise<StoredOwnerProfile> {
    const id = randomUUID();
    const profile: StoredOwnerProfile = {
      version: PROFILE_VERSION,
      id,
      email: `owner-${id.slice(0, 8)}@${LOCAL_EMAIL_DOMAIN}`,
      name: displayName(this.#options.defaultName),
      avatar: null,
      createdAt: new Date().toISOString(),
    };
    await this.#writeProfile(profile);
    return profile;
  }

  async #writeProfile(profile: StoredOwnerProfile): Promise<void> {
    const temporaryPath = `${this.#options.profilePath}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.#options.profilePath), { recursive: true });
    try {
      await writeFile(temporaryPath, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
      await rename(temporaryPath, this.#options.profilePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}

export interface AccountManagerOptions {
  /** OPENBOT_AUTH_API_URL. Unset or blank keeps the owner profile on this computer. */
  accountServiceUrl: string | undefined;
  localProfilePath: string;
  centralStoragePath: string;
  defaultName: string;
  encrypt: (value: string) => Buffer;
  decrypt: (value: Buffer) => string;
}

export function createAccountManager(options: AccountManagerOptions): AccountManager {
  const accountServiceUrl = options.accountServiceUrl?.trim();
  if (!accountServiceUrl) {
    return new LocalOwnerAccount({ profilePath: options.localProfilePath, defaultName: options.defaultName });
  }
  return new CentralAuthManager({
    apiUrl: readCentralAuthApiUrl(accountServiceUrl),
    storagePath: options.centralStoragePath,
    encrypt: options.encrypt,
    decrypt: options.decrypt,
  });
}

function displayName(value: string): string {
  const normalized = value.trim().slice(0, INPUT_LIMITS.accountName).trim();
  return normalized || FALLBACK_OWNER_NAME;
}

function decodeProfile(raw: string): StoredOwnerProfile | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isDynamicRecord(value) ||
    value.version !== PROFILE_VERSION ||
    !isString(value.id) ||
    !isUuidV4(value.id) ||
    !isString(value.email) ||
    normalizeEmailAddress(value.email) !== value.email ||
    !isString(value.name) ||
    !isString(value.createdAt)
  ) {
    return null;
  }
  const avatar = decodeAvatar(value.avatar);
  if (avatar === undefined) return null;
  return {
    version: PROFILE_VERSION,
    id: value.id,
    email: value.email,
    name: displayName(value.name),
    avatar,
    createdAt: value.createdAt,
  };
}

function decodeAvatar(value: unknown): StoredOwnerProfile["avatar"] | undefined {
  if (value === null) return null;
  if (!isDynamicRecord(value) || !isString(value.mimeType) || !isString(value.data)) return undefined;
  if (!isAvatarMimeType(value.mimeType)) return undefined;
  if (!isValidAvatarImage(value.mimeType, Buffer.from(value.data, "base64"))) return undefined;
  return { mimeType: value.mimeType, data: value.data };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
