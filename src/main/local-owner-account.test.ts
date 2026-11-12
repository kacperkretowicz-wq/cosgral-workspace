import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import { isUuidV4, normalizeEmailAddress } from "@openbot/contracts/validation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CentralAuthManager } from "./central-auth-manager";
import { createAccountManager, LocalOwnerAccount } from "./local-owner-account";

const roots: string[] = [];
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SERVER_ID = "00000000-0000-4000-8000-000000000000";

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createProfilePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cosgral-local-owner-"));
  roots.push(root);
  return join(root, "owner.json");
}

describe("LocalOwnerAccount", () => {
  it("signs in a persistent local owner without any account service", async () => {
    const profilePath = await createProfilePath();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const account = new LocalOwnerAccount({ profilePath, defaultName: "Ada" });
    const changes: unknown[] = [];
    account.on("changed", (state) => changes.push(state));
    expect(account.getState()).toEqual({ status: "loading" });
    expect(() => account.getSignedInUser()).toThrow(/not ready/i);

    const state = await account.initialize();

    expect(state).toMatchObject({
      status: "signed_in",
      localProfile: true,
      user: { name: "Ada", avatarUrl: null },
    });
    const user = account.getSignedInUser();
    expect(isUuidV4(user.id)).toBe(true);
    expect(normalizeEmailAddress(user.email)).toBe(user.email);
    expect(changes.at(-1)).toEqual(state);
    expect(fetchSpy).not.toHaveBeenCalled();

    const restarted = new LocalOwnerAccount({ profilePath, defaultName: "Someone else" });
    expect(await restarted.initialize()).toEqual(state);
  });

  it("gives each installation its own owner identity", async () => {
    const first = new LocalOwnerAccount({ profilePath: await createProfilePath(), defaultName: "Ada" });
    const second = new LocalOwnerAccount({ profilePath: await createProfilePath(), defaultName: "Ada" });
    await first.initialize();
    await second.initialize();

    expect(first.getSignedInUser().id).not.toBe(second.getSignedInUser().id);
    expect(first.getSignedInUser().email).not.toBe(second.getSignedInUser().email);
  });

  it("keeps a corrupt profile as a backup and starts a fresh owner", async () => {
    const profilePath = await createProfilePath();
    await writeFile(profilePath, "{not json");
    const account = new LocalOwnerAccount({ profilePath, defaultName: "Ada" });

    expect(await account.initialize()).toMatchObject({ status: "signed_in" });

    const files = await readdir(join(profilePath, ".."));
    expect(files.some((name) => name.startsWith("owner.json.corrupt-"))).toBe(true);
    expect(JSON.parse(await readFile(profilePath, "utf8"))).toMatchObject({ id: account.getSignedInUser().id });
  });

  it("uses a safe display name", async () => {
    const long = new LocalOwnerAccount({
      profilePath: await createProfilePath(),
      defaultName: `  ${"x".repeat(200)}  `,
    });
    const empty = new LocalOwnerAccount({ profilePath: await createProfilePath(), defaultName: "   " });
    await long.initialize();
    await empty.initialize();

    expect(long.getSignedInUser().name).toBe("x".repeat(INPUT_LIMITS.accountName));
    expect(empty.getSignedInUser().name).toBe("Owner");
  });

  it("keeps the local owner signed in after logout and email sign-in calls", async () => {
    const account = new LocalOwnerAccount({ profilePath: await createProfilePath(), defaultName: "Ada" });
    const signedIn = await account.initialize();

    expect(await account.logout()).toEqual(signedIn);
    expect(await account.requestEmailCode("someone@example.com")).toEqual(signedIn);
    expect(await account.verifyEmailCode("challenge-1", "ABCD2345")).toEqual(signedIn);
    expect(await account.retry()).toEqual(signedIn);
  });

  it("stores the owner avatar locally and restores it after restart", async () => {
    const profilePath = await createProfilePath();
    const account = new LocalOwnerAccount({ profilePath, defaultName: "Ada" });
    await account.initialize();
    const expectedUrl = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`;

    expect(await account.updateAvatar({ mimeType: "image/png", bytes: PNG_BYTES })).toMatchObject({
      status: "signed_in",
      user: { avatarUrl: expectedUrl },
    });

    const restarted = new LocalOwnerAccount({ profilePath, defaultName: "Ada" });
    expect(await restarted.initialize()).toMatchObject({ user: { avatarUrl: expectedUrl } });
    expect(await restarted.updateAvatar(null)).toMatchObject({ user: { avatarUrl: null } });
    expect(await new LocalOwnerAccount({ profilePath, defaultName: "Ada" }).initialize()).toMatchObject({
      user: { avatarUrl: null },
    });
  });

  it("explains that team features which need a central service are unavailable", async () => {
    const account = new LocalOwnerAccount({ profilePath: await createProfilePath(), defaultName: "Ada" });
    await account.initialize();

    await expect(account.createTeamAuthTicket(SERVER_ID)).rejects.toThrow(/local profile/i);
    await expect(account.provisionTeamTunnel({ serverId: SERVER_ID, serverName: "Studio PC" })).rejects.toThrow(
      /local profile/i,
    );
    await expect(
      account.sendTeamInviteEmail({
        email: "alice@example.com",
        serverName: "Studio PC",
        inviteUrl: "cosgral://join?invite=token",
        role: "member",
      }),
    ).rejects.toThrow(/local profile/i);
    expect(await account.redeemTeamAuthTicket("ticket", SERVER_ID)).toBeNull();
  });
});

describe("createAccountManager", () => {
  it("uses the local owner profile unless an account service URL is configured", async () => {
    const root = join(await createProfilePath(), "..");
    const options = {
      localProfilePath: join(root, "owner.json"),
      centralStoragePath: join(root, "session.bin"),
      defaultName: "Ada",
      encrypt: (value: string) => Buffer.from(value),
      decrypt: (value: Buffer) => value.toString(),
    };

    expect(createAccountManager({ ...options, accountServiceUrl: undefined })).toBeInstanceOf(LocalOwnerAccount);
    expect(createAccountManager({ ...options, accountServiceUrl: "  " })).toBeInstanceOf(LocalOwnerAccount);
    expect(createAccountManager({ ...options, accountServiceUrl: "http://127.0.0.1:3100" })).toBeInstanceOf(
      CentralAuthManager,
    );
  });
});
