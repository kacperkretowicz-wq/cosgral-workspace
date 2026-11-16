// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMockAccounts } from "./mock-accounts";

describe("mock accounts: pool settings (W5-BE8)", () => {
  it("starts with the return to the first account on, and a call with only the limit leaves it as it is", async () => {
    const api = createMockAccounts(() => undefined);
    expect(await api.getPoolSettings()).toEqual({
      maxAccountsPerProvider: 3,
      switchBeforeFirstAction: true,
      returnAfterReset: true,
    });
    await api.setPoolSettings({ maxAccountsPerProvider: 3, returnAfterReset: false });
    expect(await api.getPoolSettings()).toMatchObject({ returnAfterReset: false });
    await api.setPoolSettings({ maxAccountsPerProvider: 4 });
    expect(await api.getPoolSettings()).toMatchObject({ maxAccountsPerProvider: 4, returnAfterReset: false });
    expect((await api.listAccounts()).pool.returnAfterReset).toBe(false);
  });
});
