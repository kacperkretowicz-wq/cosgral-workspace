# COSGRAL continuation — 2026-11-04

User authorized review, corrections and continued construction.

## Scope and ownership

First correct M1 tooling regressions in their owning scripts/catalog test and qualify the simulation evidence. Then complete live authenticated/private acceptance on a fresh disposable database: two-account HTTP/WebSocket prepare, application restart on the same database and secrets, verify-after-restart, two browser contexts and rendered profile image. Existing services retain authorization and audit ownership. No new orchestrator is needed.

## Verified so far

- Lifecycle boundary and agent lifecycle scripts: 9 PASS on Node 24.18.0.
- Catalog packaging: 1 PASS on Windows after conditional shell quoting fix.
- All eight existing static policy gates: PASS.
- In-memory simulation: 511 PASS on Node 24.18.0; not live acceptance.
- Linux execution not yet verified.

## Remaining work

1. Finish live acceptance and record failures, remediation and results; stop owned server/database afterward.
2. Finish monorepo test/build/typecheck with sequential memory-intensive checks.
3. Reproduce Linux bwrap P0 with CPU and independent health evidence.
4. Complete private-repository checkout to coordinator/executor and remaining runtime, memory, UX and deployment scope from COSGRAL-PROMPT-POSTEP.md.

Free hosting without a card remains unresolved. Do not create paid resources.

## Live acceptance continuation — 4 XI 2026

- Two disposable authenticated/private instances used real embedded PostgreSQL, actual HTTP/WebSocket and synthetic accounts. Prepare passed twice.
- Application restart on the same running database and secrets: PASS; fresh A/B login, same conversation ID, exact prepared history, new live message in 177 ms, agent configuration, presence and typing. This is an application-process restart, not a database restart or power-loss test.
- Two independent Chrome contexts: PASS; real UI login A/B, bidirectional messages, profile name propagation, actual PNG upload and loaded image in B, presence name update. Corrected reproducible script: scripts/cosgral-e2e-two-browsers.mjs.
- Preserved failures: bundled Playwright Chromium absent (used installed Chrome); original browser helper captured profileName incorrectly and expected decorative image alt instead of enclosing Identity title. Fixed helper. First restart comparison ran after browser added messages, so exact prepared history differed; fresh instance with documented prepare/restart/verify/browser order passed. Portable script initially had corrupted localized selectors during file conversion; escaped selectors fixed and rerun passed.
- Server logged preset agent-avatar stream warnings during browser navigation. No cause established; this is separate from the successfully loaded uploaded profile image and remains for investigation.
- Owned runtimes requested to stop. Full monorepo test:run started, result pending; full monorepo build/typecheck and Linux bwrap P0 remain open.

Private evidence remains under the chat work directory, acceptance-live-20261104 and acceptance-restart-20261104. Credentials and raw server logs are not committed.

## Subsequent review and remediation

- Reproduced the agent-avatar warning with an actual HTTP disconnect while a cold render was suspended. The baseline failed: the returned storage stream remained open and pipeline logged ERR_STREAM_UNABLE_TO_PIPE. The route now disposes/settles that stream when the response is already destroyed. Avatar suite: 11 PASS, including cache, ETag, S3, rendering failure and disconnect cases. This establishes this warning mechanism; it does not prove every possible stream warning has the same cause.
- Replaced the broad M1 lifecycle scanner exemption for every *-fixture.ts file with four explicit standalone acceptance-script paths. A filesystem test verifies production and unknown script fixture names still report violations. Lifecycle scanner tests: 7 PASS; real repository scan PASS.
- Full monorepo run remains live; no complete monorepo PASS claimed.

## Agent hierarchy UI and monorepo failure

Added report-to branch connectors and a project-coordinator marker based on real selected coordinator ID, using existing theme tokens. Browser review exposed label/name crowding; the marker now sits below the name. Conversation tests: 29 PASS; UI typecheck PASS; UI build PASS, repeated after layout correction; token gates PASS. Chrome checks of coordinator/child rows and mobile navigation PASS on real authenticated routes with synthetic non-model agents. Sidebar screenshots are visual evidence of hierarchy only (conversation was still loading at capture). Fixture setup correctly encountered Origin, paused-agent and private-project authorization denials before using normal authorized requests; no production rule was bypassed.

Full monorepo test run failed: chat shard 1 had 351 PASS; shard 2 had 323 PASS and one failure, "settles responses on different endpoints for one principal without retrying its own identity lock", expected one persisted comment but received zero. Teardown separately failed to stop its test PostgreSQL within fast/immediate deadlines and retained data. A focused reproduction is running; neither failure is resolved or classified as infrastructure yet. The runner stopped, so remaining shards and groups were not run.
