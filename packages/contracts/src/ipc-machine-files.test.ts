import { describe, expect, it } from "vitest";
import {
  isBlockedMachineName,
  isMachineFileEntry,
  isMachineFileRefusal,
  isMachineFolderGrant,
  isMachineListing,
  MACHINE_FILE_REFUSALS,
  MACHINE_FILES_LIMITS,
} from "./ipc";

const entry = {
  name: "a.txt",
  relativePath: "docs/a.txt",
  kind: "file",
  size: 3,
  modifiedAt: "2026-11-19T10:00:00.000Z",
};

describe("machine files contract", () => {
  it("blocks names that look like secrets", () => {
    for (const name of [
      ".env",
      ".env.local",
      "id_rsa",
      "id_ed25519.pub",
      "server.pem",
      "my.key",
      "x.PFX",
      "vault.kdbx",
      ".npmrc",
      "Login Data",
    ]) {
      expect(isBlockedMachineName(name), name).toBe(true);
    }
    for (const name of ["readme.txt", "environment.md", "keynote.pptx", "report.pdf", "monkey.png"]) {
      expect(isBlockedMachineName(name), name).toBe(false);
    }
  });

  it("validates grants, entries and listings", () => {
    const grant = {
      id: "g",
      label: "Docs",
      root: "D:\\work\\docs",
      botIds: ["chief"],
      grantedAt: "2026-11-19T10:00:00.000Z",
    };
    expect(isMachineFolderGrant(grant)).toBe(true);
    expect(isMachineFolderGrant({ ...grant, botIds: [1] })).toBe(false);
    expect(isMachineFileEntry(entry)).toBe(true);
    expect(isMachineFileEntry({ ...entry, kind: "link" })).toBe(false);
    expect(isMachineListing({ status: "ok", entries: [entry], truncated: false })).toBe(true);
    expect(isMachineListing({ status: "ok", entries: [entry] })).toBe(false);
    expect(isMachineListing({ status: "refused", reason: "outside-folder" })).toBe(true);
    expect(isMachineListing({ status: "refused", reason: "because" })).toBe(false);
  });

  it("knows every refusal and keeps the limits sane", () => {
    expect(MACHINE_FILE_REFUSALS.every(isMachineFileRefusal)).toBe(true);
    expect(MACHINE_FILES_LIMITS.entriesPerListing).toBeGreaterThan(0);
    expect(MACHINE_FILES_LIMITS.fileBytes).toBeGreaterThan(0);
  });
});
