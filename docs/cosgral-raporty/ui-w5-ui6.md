# W5-UI6: provider fallback lists

Branch: team/ui/w5-ui6, based on integration 0e01c0019. Consumed BE7 contract/mock commit a3d3c28ce by fast-forward. Full BE7 engine commit eba767653 remains for integration to merge. No push.

## Behavior
- Providers page shows separate editors for Codex, Claude, each configured ACP agent and each configured endpoint, including endpoints without checked/published models. All providers is the last group. Endpoint groups update on endpoints-changed. Models from any provider can be added; endpoint model IDs use endpointModelId.
- Each editor saves its exact own scope, limits from PROVIDER_LIMITS (8), excludes duplicates and gives the limit explanation. Uses the existing up/down buttons, drag and Alt+Arrow navigation. Removed models remain visible as Unavailable. Failed load locks editing and offers Reload list.
- Shared FallbackOrder extracted to fallback-order.tsx, re-exported from ProvidersPage to preserve existing imports. No duplicate editor and no circular imports.
- Providers page and AgentSettingsW3 show the saved chain with Agent / Provider / All source labels and availability. Reset to provider list removes only the agent override. Agent editor shows only its own layer, not a copy of inherited models. Empty own list still permits later layers. Saved chain is explicitly labeled; unsaved edits do not claim to be effective.
- Saving a provider list refreshes the selected agent's chain without replacing its unsaved own-layer edits. Saving a profile without fallback changes preserves inheritance.

## Contract versus assumptions
No guessed IPC types or fields remain. Scopes, chain sources, availability, deduplication and ordering follow BE7. effective remains IDs; chain carries sources. Reset is resetFallbackModels(agentId). Provider grouping labels come from existing ACP/endpoint records; Codex/Claude and All are UI labels. Semantics are BE7's layering decision, not independently verified against OpenBot.

## Validation
- New ProviderFallbackW6.test.tsx: 7/7 (groups, keyboard order/save isolation, eight limit/duplicates, chain sources/availability, agent reset, ACP/endpoint discovery without models, failed-load lock/reload).
- One Storybook file only, ProviderFallbacks.stories.tsx: 4/4 with axe (provider groups/reorder/save, agent chain/reset, empty provider, light theme), final rerun 34.00 s.
- Biome: 10 changed/new TS/TSX files passed. check:ui passed (legacy composite debt 0/0). Renderer and Storybook typechecks passed. git diff --check passed.
- Older AgentSettingsW3/ProvidersFallbackW5 tests and FallbackLists stories updated to new labels and own-layer editing; not executed under the new-file-only restriction.

## Not checked
Electron, sandbox:e2e, full tests/build, old test suites/stories, real servers/accounts, screenshots, installed application and live BE7 engine integration. No real credentials or authentication files accessed. Existing UI primitives and semantic tokens retained, no palette additions. No push or force operations.
