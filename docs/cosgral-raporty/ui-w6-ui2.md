# W6-UI2 — context and compaction

Branch: `team/ui/w6-ui2`, based on integration `b516ac19f`.

1. Conversation context uses `window.openbot.context` and its events. Only `source: reported` shows counts, percentages and a progress bar. Unavailable or estimated data shows a reason without a percentage. Reports for another agent or thread are ignored; switching clears the previous numbers while loading.
2. Warning starts at 80%. Compact is shown only when `canCompact`; pending/compacting disables repeated clicks. The panel shows compaction count, last compaction time and stale-report information.
3. General settings include automatic compaction and an integer threshold from 50 to 95, default 90. Saving uses the contract validator; errors are readable and settings can be reloaded.
4. Shared COSGRAL controls and palette tokens; English labels. One Storybook file covers reported, unavailable, warning, compacting, settings interaction and light preview.

## Verification

- New component tests: 9/9 passed.
- Storybook: 6/6 passed in one file, accessibility checks enabled as errors; no axe violations (dark and light preview).
- `typecheck:renderer`, `typecheck:storybook`: passed. Typecheck caught a boolean `aria-busy`; changed to the supported string values before the final successful checks.
- Biome: 7 changed source/style/story files passed. `check:ui`: passed, legacy composite debt 0/0.

## Not checked

Electron, sandbox:e2e, full check, real Codex compaction, real accounts and provider endpoints. No engine changes. Thread support is a separate branch; cross-thread engine mapping remains Backend work.
