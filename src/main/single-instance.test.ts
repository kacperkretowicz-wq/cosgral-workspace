import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceSingleInstance } from "./single-instance";

describe("enforceSingleInstance", () => {
  beforeEach(() => {
    vi.spyOn(process, "exit").mockImplementation((code?: string | number | null | undefined): never => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows the primary instance to continue when lock is acquired", () => {
    const host = {
      requestSingleInstanceLock: vi.fn(() => true),
      exit: vi.fn(),
    };
    const allowed = enforceSingleInstance(host);
    expect(allowed).toBe(true);
    expect(host.exit).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("terminates the second instance immediately when lock is rejected", () => {
    const host = {
      requestSingleInstanceLock: vi.fn(() => false),
      exit: vi.fn(),
    };
    const onDuplicate = vi.fn();
    const allowed = enforceSingleInstance(host, onDuplicate);
    expect(allowed).toBe(false);
    expect(onDuplicate).toHaveBeenCalled();
    expect(host.exit).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("invokes host exit and process exit with code 0 by default when duplicate", () => {
    const exitMock = vi.fn();
    const host = {
      requestSingleInstanceLock: vi.fn(() => false),
      exit: exitMock,
    };
    expect(() => enforceSingleInstance(host)).toThrow("process.exit(0)");
    expect(exitMock).toHaveBeenCalledWith(0);
  });
});
