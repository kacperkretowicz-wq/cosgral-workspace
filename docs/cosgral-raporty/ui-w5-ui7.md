# W5-UI7: provider errors and account notifications

Branch: team/ui/w5-ui7, based on codex/cosgral-desktop 934fd5c6a. No push.

## Changes
- Extracted safeCliError to provider-error.ts; ManagedCliSection re-exports it for compatibility. ProvidersPage (including ACP actions) and ProviderFallbackLists now use providerError. Account error handling uses the same shared function, preserving its existing account masking. Removes Electron IPC wrappers without losing the meaningful refusal; retains path redaction with English [CLI path] marker.
- Renderer-only account notice coalescing: when the latest switch for the same agent is a return to the first account, followed by usage-limit switching away from exactly that account/provider, replace the return notice with one combined switch notice. Text retains original origin, returned account, repeated usage limit and new destination. A separate limit card remains, including its reset time/assumed-time information. Other agents/providers/accounts and unrelated newer switches are not merged. No engine or event changes.

## F03 requires Backend
The checked PoolSettings has maxAccountsPerProvider and switchBeforeFirstAction only; no returnAfterReset. No fake switch or IPC method added.

Backend needs PoolSettings.returnAfterReset: boolean, default true, plus optional PoolSettingsInput.returnAfterReset for setPoolSettings, input validation, persisted default/migration, snapshot/mock/preload compatibility and router behavior. false should keep the current account after reset until a manual choice or its next limit; true preserves today's automatic return. After the contract and engine are ready UI can bind the English switch Return to the first account after the limit resets to subscriptions.setPoolSettings. This is a requested contract proposal, not implemented IPC.

## Validation
- Unit tests: 3 files, 24/24 (provider-error, AccountLimitCards, ManagedCliSection). Covers clean visible save refusal, account limit reason, path redaction, merged sequence with intervening limit, identity/provider/agent isolation, unrelated-switch preservation.
- One Storybook file only: ProviderFeedback.stories.tsx, 4/4 (merged notice, light theme, dismiss, clean error with axe; final run 61.97 s).
- Biome: nine changed/new TS/TSX files passed. check:ui passed (legacy composite debt 0/0). Renderer and Storybook typechecks passed; final renderer and 24-test rerun passed. git diff --check passed.

## Not checked
Electron, sandbox:e2e, full test suite/build, real accounts/services, screenshots and BE8 runtime behavior. No login files or real credentials used. No new colors, no provider or engine behavior changes.
