import { describe, expect, it } from "vitest";
import { cleanIpcError, invokeClean } from "./ipc-errors";

describe("IPC errors in the window", () => {
  it("keeps only the program's sentence", () => {
    const raw = new Error(
      "Error invoking remote method 'channel-routines:run-now': Error: The previous run is still going.",
    );
    const clean = cleanIpcError(raw);
    expect(clean).toBeInstanceOf(Error);
    expect(clean instanceof Error ? clean.message : "").toBe("The previous run is still going.");
  });

  it("passes other errors and values through unchanged", () => {
    const plain = new Error("Something else.");
    expect(cleanIpcError(plain)).toBe(plain);
    expect(cleanIpcError("text")).toBe("text");
  });

  it("rejects with the clean sentence and resolves as before", async () => {
    await expect(
      invokeClean(() => Promise.reject(new Error("Error invoking remote method 'x:y': Error: No such agent."))),
    ).rejects.toThrow(/^No such agent\.$/);
    await expect(invokeClean(() => Promise.resolve(42))).resolves.toBe(42);
  });
});
