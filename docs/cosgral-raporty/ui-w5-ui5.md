# W5-UI5

Branch: team/ui/w5-ui5, based on team/ui/w5-ui4 (9130af511). No push.

## Changes
- AgentSettingsW3 reuses FallbackOrder from ProvidersPage, including the contract limit PROVIDER_LIMITS.fallbackModels (8), limit copy, unavailable badges, up/down and keyboard reordering. Optional explicit Add fallback action preserves the panel flow. No duplicate editor or hardcoded four-item limit remains.
- Panel loads FallbackModelsInfo: inherited own:null uses the general list including unavailable entries, and reset calls resetFallbackModels. Saving a profile without fallback changes preserves inheritance. Editing and saving the list creates an override. Own empty lists still stay own lists.
- Fixed two actual UI mojibake occurrences in ProvidersPage.tsx: loadingLabel Adding... (original line 319) and picker placeholder Add a fallback model... (original line 456). Used plain three dots. Scanned all UTF-8 text files under src/renderer for U+00E2/U+20AC sequences, U+00C3 and U+00C2; no remaining hits. Binary files excluded from decoding.

## Validation
- AgentSettingsW3.test.tsx: 5/5 (3 added: seven permits eighth then blocks ninth, eight starts blocked, inherited/unavailable/profile save/override/reset).
- ProvidersPageW3.test.tsx: 16/16; total 21/21.
- Biome: three changed TSX files passed after formatting.
- check:ui: passed (legacy composite debt 0/0).
- typecheck:renderer: passed.

## Not checked
Electron, sandbox:e2e, Storybook/axe, full test suite/build and screenshots. No new colors or styles. No real services, keys or authentication files used.
