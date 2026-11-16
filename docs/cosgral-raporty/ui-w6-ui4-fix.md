# W6-UI4-FIX — SettingsModal interaction stability

Base: integration `3589a40df`. Branch: `team/ui/w6-ui4-fix`. No production component changes and no timeout increases.

## Cause and change

The story asserted `data-motion="closing"` immediately after a click or Escape. Closing is not synchronous: `requestOpenChange(false)` changes the parent signal, a Solid effect sets closing, then the CSS-token timer (normally 120 ms, zero for reduced motion) removes the portal. The immediate assertion can observe the previous open render; a slow observer can also miss the closing interval completely. This assertion tests a transient scheduler/animation frame rather than the user's outcome.

The story now waits for removal of the exact captured dialog element, including nodes hidden from accessibility queries, then checks focus returned to Open settings. It still tests all three close paths: close button, Escape, backdrop. Each path opens the modal anew. Reopening proves the prior close was not merely a title or visibility change.

The Appearance interaction waits until the theme field is enabled again after save before leaving the section; switching sections and toggling the launch switch also wait for observable state. The persisted theme value remains checked against the mock backend. No arbitrary sleeps or disabled assertions were added.

## Verification

Three consecutive runs of only `src/renderer/stories/SettingsModal.stories.tsx`, with existing shared Playwright browsers:

1. 17:15:58 ? 2/2 passed, exit 0, 36.96 s.
2. 17:17:13 ? 2/2 passed, exit 0, 46.41 s.
3. 17:18:29 ? 2/2 passed, exit 0, 39.69 s.

Biome on the story: passed. Storybook typecheck: passed. All three runs used the same final story source; no changes between them. The final-state close checks passed for each close path, supporting a test timing race rather than a modal that remains open.

## Not checked

No Electron, full check, full Storybook suite, real OS startup setting, or real account data. This fixes the interaction test's timing contract; it does not claim a full integration acceptance. No temporary scripts or screenshots created; test tools may update ignored caches.
