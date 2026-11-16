# W6-UI1-FIX — App event mock and Needs you compatibility

Base: `46f59a4ad`, branch `team/ui/w6-ui1-fix`. W7 preserved separately in `team/ui/w7-ui1` at `0a4f60f6f`; no W7 changes included here.

## Cause and changes

1. Reproduced exactly 25 failures across the three requested files (105 tests). The 23 App failures came from its hand-written event mock retaining only the last subscriber. ThreadPanel adds another subscriber, which displaced App's listener. The actual preload adds/removes independent IPC handlers for each subscription. Fixed the mock to multicast to a Set and remove each subscriber on cleanup; kept all existing assertions. No App production filtering relaxed and no timeouts increased.
2. The Vault test seeded a request for thread `t` while Chief's selected thread is `thread-chief`. W6 intentionally hides foreign-thread cards from the pinned Decision. Aligned the fixture with the test's intended active-conversation scenario; kept the restore/resolve assertions unchanged.
3. Sidebar now keeps the existing accessible-name prefix `Agent, Needs you. Summary` and appends `, Thread Title`. This restores the P07 selector `^Assistant, Needs you` without editing the acceptance script or dropping thread context. When there is no thread ID, its callback receives only botId; when present, it receives both arguments.
4. Extended the existing Sidebar test to assert the exact threaded accessible name and both callback forms. The added signal-update assertion uses the normal asynchronous DOM query, with no timeout override.

## Verification

- Initial three-file run: 25 failures reproduced.
- First repair run: all 25 original failures resolved; a new synchronous assertion queried before the signal update rendered. Changed that new query to `findByRole` while retaining its exact name assertion.
- Final targeted App*/Sidebar* run: 12/12 files, 179/179 tests, exit 0. This includes all 105 tests from the original three files: 25 failures to 0. No timeout increases or assertions removed.
- Biome on four changed code/test files: clean after formatting. `typecheck:renderer`: exit 0. Impeccable detector on Sidebar: `[]`.
- No push or force; OpenBot commit trailer. Logs kept outside the repository.

## Not checked

No Electron, Storybook, sandbox-acceptance, sandbox:e2e, build or full check. P07's selector compatibility is covered by the Sidebar name regression test; the actual acceptance step must be rerun by the leader. Existing Solid strict reactive-read diagnostics are not addressed by this patch. Native chrome, assets and styles unchanged.
