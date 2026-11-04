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
