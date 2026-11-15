// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// W4-BE4 (W4-H2 preparation): the Windows installer keeps the person's data on uninstall (lead decision) and stays a
// per-user, one-click install with the same shortcuts. A plain text check, so no YAML library is needed.

function nsisBlock(): Map<string, string> {
  const text = readFileSync(join(__dirname, "..", "electron-builder.yml"), "utf8");
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf("nsis:");
  expect(start).toBeGreaterThan(-1);
  const block = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    const match = /^ {2}([A-Za-z]+): (.+)$/.exec(line);
    if (!match?.[1] || match[2] === undefined) break;
    block.set(match[1], match[2]);
  }
  return block;
}

describe("Windows installer settings", () => {
  it("keeps the person's data when the program is uninstalled", () => {
    expect(nsisBlock().get("deleteAppDataOnUninstall")).toBe("false");
  });

  it("stays a per-user one-click install with the usual shortcuts and name", () => {
    const nsis = nsisBlock();
    expect(nsis.get("oneClick")).toBe("true");
    expect(nsis.get("perMachine")).toBe("false");
    expect(nsis.get("createDesktopShortcut")).toBe("true");
    expect(nsis.get("createStartMenuShortcut")).toBe("true");
    // electron-builder fills in the product name ("$" + "{productName}"), so the shortcut keeps the program name.
    expect(nsis.get("shortcutName")).toBe(["$", "{productName}"].join(""));
  });
});
