// COSGRAL W5-BE2: provider accounts and the pool for Storybook and the preview. Demo data only: nothing signs in.
// Codex signs in "in the browser" (success after a moment); Claude asks for a pasted code first.

import {
  type AccountsSnapshot,
  type AgentEvent,
  DEFAULT_POOL_SETTINGS,
  type PoolSettings,
  type ProviderAccount,
  type ProviderAccountProvider,
  type SubscriptionsDesktopApi,
} from "@openbot/contracts/ipc";

type AccountMethods = Pick<
  SubscriptionsDesktopApi,
  | "listAccounts"
  | "addAccount"
  | "removeAccount"
  | "loginAccount"
  | "submitLoginCode"
  | "cancelLogin"
  | "openLoginTerminal"
  | "logoutAccount"
  | "refreshAccount"
  | "setAccountPool"
  | "assignAccountToAgent"
  | "getPoolSettings"
  | "setPoolSettings"
>;

const IDLE = { phase: "idle", message: null, url: null, userCode: null } as const;

function systemAccount(provider: ProviderAccountProvider): ProviderAccount {
  return {
    id: `system-${provider}`,
    provider,
    label: provider === "codex" ? "Codex (this computer)" : "Claude (this computer)",
    stateDir: provider === "codex" ? "System (~/.codex)" : "System (~/.claude)",
    system: true,
    loggedIn: provider === "codex",
    account: provider === "codex" ? "p***@e***.com" : null,
    plan: provider === "codex" ? "ChatGPT" : null,
    isDefault: true,
    inPool: true,
    poolOrder: 1,
    enabled: true,
    limitedUntil: null,
    login: { ...IDLE },
    checkedAt: null,
  };
}

export function createMockAccounts(emit: (event: AgentEvent) => void): AccountMethods {
  let accounts: ProviderAccount[] = [systemAccount("codex"), systemAccount("claude")];
  let pool: PoolSettings = { ...DEFAULT_POOL_SETTINGS };
  let assignments: AccountsSnapshot["assignments"] = [];
  let counter = 0;

  const snapshot = (): AccountsSnapshot => structuredClone({ accounts, pool, assignments });
  const changed = () => emit({ type: "accounts-changed", ...snapshot() });
  const find = (id: string) => {
    const account = accounts.find((item) => item.id === id);
    if (!account) throw new Error("Unknown account.");
    return account;
  };
  const patch = (id: string, next: Partial<ProviderAccount>) => {
    accounts = accounts.map((item) => (item.id === id ? { ...item, ...next } : item));
    changed();
    return structuredClone(find(id));
  };
  const renumber = (provider: ProviderAccountProvider) => {
    let order = 1;
    for (const item of accounts
      .filter((entry) => entry.provider === provider)
      .sort((a, b) => a.poolOrder - b.poolOrder))
      item.poolOrder = order++;
  };

  return {
    listAccounts: async () => snapshot(),
    addAccount: async ({ provider, label }) => {
      if (accounts.filter((item) => item.provider === provider).length >= pool.maxAccountsPerProvider)
        throw new Error(
          `You have ${pool.maxAccountsPerProvider} ${provider === "codex" ? "Codex" : "Claude"} accounts, the limit. Remove one or raise the limit in the pool settings.`,
        );
      counter += 1;
      const id = `acc-demo${String(counter).padStart(4, "0")}`;
      const account: ProviderAccount = {
        ...systemAccount(provider),
        id,
        label,
        stateDir: id,
        system: false,
        loggedIn: false,
        account: null,
        plan: null,
        isDefault: false,
        poolOrder: accounts.filter((item) => item.provider === provider).length + 1,
      };
      accounts = [...accounts, account];
      changed();
      return structuredClone(account);
    },
    removeAccount: async ({ id }) => {
      const account = find(id);
      if (account.system) throw new Error("The login of this computer stays. Sign out instead.");
      accounts = accounts.filter((item) => item.id !== id);
      assignments = assignments.filter((item) => item.accountId !== id);
      if (account.isDefault) {
        const fallback = accounts.find((item) => item.provider === account.provider);
        if (fallback) fallback.isDefault = true;
      }
      renumber(account.provider);
      changed();
      return snapshot();
    },
    loginAccount: async ({ id }) => {
      const account = find(id);
      if (account.provider === "claude")
        return patch(id, {
          login: {
            phase: "code-required",
            message: "Sign in in the browser, then paste the code shown there.",
            url: "https://example.com/sign-in",
            userCode: null,
          },
        });
      setTimeout(
        () =>
          patch(id, {
            loggedIn: true,
            account: "p***@e***.com",
            plan: "ChatGPT",
            login: { ...IDLE, phase: "success", message: "Signed in." },
          }),
        1200,
      );
      return patch(id, {
        login: {
          phase: "waiting-for-browser",
          message: "Finish signing in in the browser.",
          url: "https://example.com/sign-in",
          userCode: null,
        },
      });
    },
    submitLoginCode: async ({ id }) =>
      patch(id, {
        loggedIn: true,
        account: "p***@e***.com",
        plan: "max",
        login: { ...IDLE, phase: "success", message: "Signed in." },
      }),
    cancelLogin: async ({ id }) => patch(id, { login: { ...IDLE } }),
    openLoginTerminal: async ({ id }) =>
      patch(id, {
        login: { ...IDLE, phase: "waiting-for-browser", message: "Finish signing in in the terminal window." },
      }),
    logoutAccount: async ({ id }) => patch(id, { loggedIn: false, account: null, plan: null, login: { ...IDLE } }),
    refreshAccount: async ({ id }) => patch(id, { checkedAt: new Date().toISOString() }),
    setAccountPool: async ({ id, inPool, poolOrder, enabled, isDefault }) => {
      const account = find(id);
      account.inPool = inPool;
      if (enabled !== undefined) account.enabled = enabled;
      if (isDefault)
        for (const item of accounts) if (item.provider === account.provider) item.isDefault = item.id === id;
      if (poolOrder !== undefined) {
        const others = accounts
          .filter((item) => item.provider === account.provider && item.id !== id)
          .sort((a, b) => a.poolOrder - b.poolOrder);
        others.splice(Math.min(poolOrder, others.length + 1) - 1, 0, account);
        others.forEach((item, index) => {
          item.poolOrder = index + 1;
        });
      }
      changed();
      return snapshot();
    },
    assignAccountToAgent: async ({ botId, accountId }) => {
      if (accountId) find(accountId);
      assignments = [
        ...assignments.filter((item) => item.botId !== botId),
        ...(accountId ? [{ botId, accountId }] : []),
      ];
      changed();
      return snapshot();
    },
    getPoolSettings: async () => structuredClone(pool),
    setPoolSettings: async ({ maxAccountsPerProvider, returnAfterReset }) => {
      pool = { ...pool, maxAccountsPerProvider, returnAfterReset: returnAfterReset ?? pool.returnAfterReset };
      changed();
      return structuredClone(pool);
    },
  };
}
