# W8-UI1 — Access levels and budgets

Branch: `team/ui/w8-ui1`, based on `team/ui/w6-ui4-fix` @ `879b2a38e` (integration base `3589a40df`). No push.

## Completed prerequisite: SettingsModal stability

FIX `879b2a38e`: three consecutive runs of SettingsModal.stories.tsx, 2/2 + 2/2 + 2/2, all exit 0. Details and timing diagnosis: `ui-w6-ui4-fix.md`. Only the story and report changed in that commit; no production animation or timeout changes.

## UI design and implementation

Uses existing UI primitives and settings layout. Access and agent budgets are in advanced agent settings; the current space budget is in General settings. No new color literals or visual system.

### Access

- Three contract levels, initially Working folder only. Current level and last approved increase remain visible.
- Selecting a higher level requests the backend's existing confirm card in Needs you. The select is reset to the actual level immediately; it changes only when the backend approves it. No local bypass or new permission API.
- Additional and excluded folders use one absolute path per line, validated with the shared contract. Exclusions explicitly apply at Full. Computer Use and camera explicitly retain separate permissions.
- `access-changed` refreshes settings. `access-denied` shows the backend reason in agent settings and through the application's existing per-agent UI error display.
- Changing the selected agent remounts its access/budget panels, preventing pending drafts from moving between agents.

### Budgets

- Agent and current-space scope; day/calendar month labeled UTC; tokens, optional USD, warning percent and hard-stop control. Existing cheaper-model policy is preserved when saving.
- Usage counters and ok/warning/exhausted reflect backend status. Prices are labeled provider estimates, not a bill. Missing and partially missing prices are explicit; a price-only limit without prices says it is not enforceable. No invented cost.
- A hard-stop message distinguishes blocked new turns from a running turn, which is allowed to finish.
- CSV export has UTC date fields and explicitly covers daily usage of every agent in this space. The backend supplies CSV; the renderer creates a Blob download only on the person's export action and revokes its object URL afterwards.
- Budget events refresh usage; unchanged policy does not wipe an unsaved edit when a usage update arrives.

## Verification so far

- New access tests 3/3; budget tests 4/4. Plus existing AgentSettingsW3 tests: total 12/12 across three files.
- Renderer and Storybook typechecks passed. UI foundation check passed. Biome on changed files passed (final pass pending before commit).
- Impeccable detector over both new production components: no findings.
- `AccessBudgets.stories.tsx` contains 18 scenes: three access levels, raise confirmation, denial, budget ok/warning/exhausted/no price, each dark and light. Typechecked; **not run yet** because Storybook remains reserved for the leader's full check. Axe results are therefore pending, not claimed clean.

## Remaining and limits

Wait for the leader's next free-window signal, run only the new story file and SettingsModal story affected by the new General section, fix any findings, update this report and commit the W8 UI. No Electron, full check, full suite, manual visual review, real OS permissions, real paid turns, actual budget stop in the engine, or real downloaded CSV file checked. CSV callback was tested with backend mock output. On this base, the real meter/gate hooks are a separate Backend task; UI tests cannot prove enforcement.

No credentials, real authorization codes, login files or user data read. No temporary scripts created; test runners may update ignored caches.
