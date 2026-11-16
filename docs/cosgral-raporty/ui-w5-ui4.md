# W5-UI4

Branch: team/ui/w5-ui4, based on local codex/cosgral-desktop `8a4a03330`. No push.

## Integration inspection
ProvidersPage renders both ApiKeysSection and EndpointsSection. cosgral.css retains both .account-notices and .api-key-* rules. No conflict markers found in the edited surfaces.

## Fallback lists
The existing order editor now selects General list (`*`) or an agent. It reads FallbackModelsInfo, displays own or inherited status, preserves unavailable entries from own/general (not only effective), and marks them Unavailable. Editing an inherited list creates an override on save; reset calls resetFallbackModels and reloads the general list. Empty own lists remain overrides. No separate provider-wide scope is invented.

Limits and validation come from PROVIDER_LIMITS.fallbackModels and fallbackModelsProblem. The select excludes duplicates and disables adding at eight with explanatory copy; invalid whole-list saves show the contract message. Reordering uses existing up/down buttons, Alt+Arrow keys and drag; save sends the entire list. Storybook's providers object now includes createMockFallbackModelsApi.

## Endpoints stories
Isolated stories inject the shared endpoint mock; only demo keys/URLs, no network access to providers. Nine cases: unchecked, checking, ok, rejected, unreachable, remote host warning, Ollama/LM Studio presets, masked key with empty password on edit, light theme. Each interaction is checked by Storybook and axe. Added optional API injection and guarded absent event API for isolated rendering.

## Validation
- New component tests: 6/6 (general/unavailable, buttons, Alt+Arrow, inheritance/reset, invalid lists, ninth-entry guard).
- Storybook: 11/11 with axe (9 endpoint scenarios, 2 fallback list scenarios); 2 files, 50.44 seconds.
- Biome: six changed TS/TSX files passed after formatting.
- check:ui: passed (legacy composite debt 0/0).
- typecheck:renderer and typecheck:storybook: passed. Test fixtures explicitly use AgentModelId for generated ACP IDs.
- Final component rerun: 6/6; git diff --check passed.

The first endpoint story run exposed an unguarded global event subscription; API injection now works without the desktop bridge. Preset field lookup accounts for the required-field marker. Palette/contrast checks pass without color changes. Loading and saving lock list edits to avoid sending an old scope's list after a quick selection change.

## Not checked
Electron, sandbox:e2e, full tests/build, actual servers, real credentials and visual screenshots. Integrator owns runtime acceptance. No authentication files accessed. Existing UI primitives and semantic palette retained; no new colors or visual system.
