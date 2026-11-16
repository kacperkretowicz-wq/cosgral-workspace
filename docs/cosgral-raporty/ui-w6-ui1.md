# W6-UI1 — agent threads

Branch `team/ui/w6-ui1`. Continued checkpoint `3d820800b`, merged integration `b765a716a` without rewriting history. Merge keeps both context and thread panels; the thread mock retains its seeded history/queue wiring.

## Behavior

1. Conversation has a thread list with create, open, rename, archive/restore and permanent deletion. Deletion requires an explicit second action and sends `confirm: true`. Errors stay visible. Thread limits/title validation come from the contract.
2. Switching activeThreadId clears old live data and reloads conversation and queue. Late snapshots for another thread are ignored. ContextIndicator receives the selected bot's threadId.
3. Message menu branches from the selected message. The new thread shows its parent link. Storybook mock preserves separate histories and queues.
4. Sidebar shows current thread/activity counts and the engine's workingThread title, including background work. Combined Needs you entries include thread titles; opening one selects its thread. Actionable cards are filtered to the selected thread.
5. English text, shared controls and semantic palette tokens. Stories cover list/Needs you, rename, archive/restore, delete confirmation, background work and light preview.

## Verification

New tests: 10/10 across ThreadControls and ThreadNavigation. The latter renders App, creates/selects a new thread and returns to the original history. Biome: 11 changed files passed. Remaining final checks recorded below before commit.

- One Storybook file: 6/6 passed, including background work and light preview. Axe runs as an error gate: no violations.
- `typecheck:renderer`, `typecheck:storybook`, `check:ui`: passed; legacy composite debt 0/0.
- `git diff --check`: passed. Integration `b765a716a` is an ancestor of the branch.

Initial tests exposed an incorrect row accessor in the draft; fixed it. Another assertion expected unread counts to remain after opening a thread; the contract mock correctly marks it read, so the expectation now checks zero unread while preserving queue/card counts. The navigation test now unmounts before restoring its mock API. Storybook initially rejected linked dependencies outside its serving boundary; installed local dependencies rather than widening that boundary.

## Not checked

No Electron, sandbox:e2e, full check, real CLI/accounts or restart persistence. Engine behavior is supplied by BE1; context mapping to other threads is Backend BE3 work. Composer drafts remain per agent as in the existing UI; per-thread draft persistence is outside this change. Tests may emit existing Solid strict-reactivity diagnostics from shared controls; these are not engine failures.
