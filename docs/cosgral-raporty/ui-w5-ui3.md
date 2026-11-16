# W5-UI3: API keys and navigation test

Branch: `team/ui/w5-ui3`. Existing work preserved in `28087d4ee`, then merged `team/backend/w5-be3` (`c5c1a3191`) and integration. No push. Backend merge `8f7b933d5`; integration merge `0e19c73e3`.

## Result
- Providers page uses `window.openbot.apiKeys` and the contract `ApiKeyEntry` / `ApiKeysDesktopApi`. Removed guessed provider IDs, types, mask helper and private mock. Stories and component tests use Backend mock (`bad` prefix rejects).
- Password input clears on save, never receives the saved secret. Only the backend mask is displayed. Checks happen only on click; empty, saved/unchecked, accepted, rejected and checking states are supported. Backend messages are announced; controls lock during checks to prevent stale responses overwriting edits.
- English copy explicitly says: one key per provider; saved key is always used, even if rejected, until removed to return to subscription login; changes apply at next provider process start. Missing API reports unavailable rather than silently saving to a demo mock.
- Existing semantic UI primitives and palette tokens retained, labeled password fields, status/alert feedback, keyboard-native buttons. No new visual system.

## Part B
The old row locator required a comma after Unread helper, but the accessible name may use a period when the role is absent. Locator now accepts either. Waits for backend unread state, visible row, scroll/actionability (Playwright click waits for stability), then visible Mark as read item before clicking. No fixed delay added. Integration hide/show click corrections retained.

Confirmation for integrator: run sandbox:e2e in the sandbox, preferably three consecutive runs; inspect the named navigation step and hide/show step. Runtime stability is not claimed without that run.

## Validation
- Component tests: 5/5 (save/clear/mask, explicit rejected/accepted check, removal, pending check lock, status label).
- Biome: targeted changed UI/script files passed.
- check:ui: passed, legacy composite debt 0/0.
- typecheck:renderer and typecheck:storybook: passed.
- Storybook: 5/5 passed including axe accessibility checks (78.87 s). First attempt lacked browser cache path; rerun uses the existing shared Playwright Chromium. Accessibility test exposed rejected-card contrast below 4.5:1; removed the tinted background and kept semantic danger border/badge.

## Not checked
Electron, sandbox:e2e, real credentials/endpoints, DPAPI, full test suite/build and visual screenshots were not run. Story interactions are the isolated verification path. No real logins or secrets accessed. No guessed IPC fields remain; process/key behavior follows the backend decision, not an independent runtime verification. No push or force commands.
