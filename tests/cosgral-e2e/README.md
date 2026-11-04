# COSGRAL in-memory simulation suite

Run on Node >=24.11.0: `node tests/cosgral-e2e/run-all.mjs`.

These tests exercise an independent state model and selected shared schemas. They do not run the application server, PostgreSQL, browser, WebSocket transport, real agents or OS sandbox. Passing results cannot establish production authorization, restart durability, browser rendering or sandbox isolation. Keep these results separate from live acceptance.

Live HTTP/WebSocket and application-restart checks use `scripts/cosgral-e2e-two-accounts.mjs` with private state files outside the repository. Browser acceptance and Linux bwrap verification remain separate requirements.
