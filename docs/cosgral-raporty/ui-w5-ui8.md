# W5-UI6-FIX / W5-UI8

Branch: team/ui/w5-ui8, based on integration 836ce44bf. Part 1 is a separate commit dfbf7e6. No push.

## Root cause of five failing fallback tests
This was a UI6 identity bug, not a missing mock method or slow IPC. ProvidersPage.groups() created new objects for every group whenever ACP/endpoint discovery updated. Solid For keys by object identity, so it disposed and remounted even All providers. setup() had captured the first region; its disposed async load could no longer update that old DOM. The current region did load successfully. Increasing the wait timeout could never fix the stale reference.

The same remount could discard a real user's unsaved list edit. Groups are now cached by scope and unchanged label, preserving existing editors during unrelated discovery updates. No waits extended and original test assertions retained. Added regression first verified the replacement (red before fix) using a fresh current-region lookup, then requires the original DOM node and an unsaved draft to survive endpoint refresh.

Part 1 validation: ProvidersFallbackW5 7/7 + ProvidersPageW3 16/16 = 23/23; biome and renderer typecheck passed before committing dfbf7e6.

## UI8
- ProviderAccounts switch: Return to the first account after the limit resets. Missing returnAfterReset means enabled. Toggling calls setPoolSettings with the current saved maxAccountsPerProvider and the new boolean. Existing size-only save stays size-only, preserving the backend setting. Shared busy/error/snapshot handling remains in useAccounts.
- App now routes account-error through the account-notice reducer to the correct agent. Conversation renders AccountErrorCard with polite status, account label, connection guidance and Dismiss only. Other agents' notices remain scoped to their conversations.
- Backend's ready message contains quota wording; the UI deliberately uses neutral text from the known network-error state instead. No Continue action and no word limit in the card. Engine and IPC contract unchanged.

## Validation
- ProviderAccounts + AccountErrorCard: 13/13.
- App.test filtered account network test: 1/1 (91 skipped), checks active-agent scope and dismissal.
- Storybook PoolNetwork.stories.tsx only: 4/4 with axe (pool toggle in both themes, network dismissal and light network card), 48.99 s.
- Final biome: all changed/new TS/TSX files passed. check:ui passed (legacy composite debt 0/0). Renderer and Storybook typechecks passed. Final ProviderAccounts/AccountErrorCard rerun: 13/13, including an unsaved pool-size draft while toggling. git diff --check passed.

## Not checked
Electron, sandbox:e2e, full bun run check/test/build, remaining App tests, installed application, actual credentials/CLI/network failures and visual screenshots. No authentication files accessed, no new colors, no push or force operations. Integrator should rerun full check with the preserved fallback tests.
