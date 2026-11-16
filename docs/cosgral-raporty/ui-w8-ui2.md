# W8-UI2 — isolation, held queue and browser profiles

Branch: `team/ui/w8-ui2`, based on W8-UI1 merge `eda60a7ca` (integration `64027856a`). No push.

## W8-UI1 prerequisite

W8-UI1 code and working report committed as `9d9faaf24`; integration merged without conflicts as `eda60a7ca` on `team/ui/w8-ui1`. The reported 12/12 unit tests belong to the earlier pre-merge run recorded in `ui-w8-ui1.md`. They were not rerun on `eda60a7ca`; this report does not claim otherwise.

## Implementation

- Advanced agent settings reuse the existing layout, Field, Textarea, Heading and Switch primitives. Panels remount when the selected agent changes.
- Isolation reads `window.openbot.isolation.get`, shows active/shared-process/unavailable/off and the backend reason. Active explicitly describes process limits without claiming an AppContainer disk boundary. Codex says: “Codex: one shared process, not isolated per agent”. Unavailable explicitly names `isolation-unavailable` and the refusal of file/shell tools below Full.
- The controlled switch calls `setEnabled`. Disabling requests the backend Needs you card; the switch retains the returned actual state until an isolation-changed event reports approval. No local permission bypass.
- Conversation shows `QueueSnapshot.heldReason` beside the queued-message controls, with Review budget settings opening the current agent settings containing its budget. The backend reason is displayed as supplied; the renderer does not invent usage or release a held turn.
- Browser profile explains the initial signed-out state and separate cookies/storage/cache/history. Two domain lists use the shared parser; blank allow, subdomains and block precedence are explained. Backend-normalized rules are shown after save.
- Clear browser data requires a separate inline confirmation and names what is removed. Cancel makes no API call; only the confirmation sends `confirm: true` for this agent. Rules and other profiles remain. Backend errors stay visible; draft domain edits are kept on external profile events.
- Eight dark/light Storybook scenes written for the four isolation states, each with browser settings. Axe is configured as an error. Stories have NOT been run: waiting for the leader's explicit signal.

## Verification

- Single unit file `IsolationBrowserSettings.test.tsx`: 6/6 after using the shared Switch. Covers approval gating and approval event, Codex shared-process, unavailable reason, cancel/confirm clearing with rules retained, invalid domain refusal.
- Final verification: typecheck:renderer PASS; typecheck:storybook PASS; check:ui PASS (legacy composite debt 0/0); Biome PASS on all seven changed renderer/story files. git diff --check PASS.
- During development, check:ui rejected a hand-built switch; replaced with components/ui/Switch. The first clear confirmation tests asserted before Solid updated the DOM; now await the observed state, without fixed sleeps or larger timeouts.

## Not checked

No Storybook execution, axe results, screenshots, visual review, Electron, build, full check, full unit suite, real agent processes, OS isolation, real sign-ins, real browser data clearing, real hard-stop turns or queue restart behavior. The browser mock tests do not prove session isolation. The existing backend issue with agentless threads reaching the shared browser profile is outside this UI change.

No real credentials or user data accessed. No temporary scripts created; runners may update ignored caches. Existing shared-file text was preserved byte-for-byte outside the intended edits after correcting a local PowerShell encoding conversion before commit.
