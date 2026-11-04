# COSGRAL in-memory simulation suite

Run on Node >=24.11.0: `node tests/cosgral-e2e/run-all.mjs`.

These tests exercise an independent state model and selected shared schemas. They do not run the application server, PostgreSQL, browser, WebSocket transport, real agents or OS sandbox. Passing results cannot establish production authorization, restart durability, browser rendering or sandbox isolation. Keep these results separate from live acceptance.

Live HTTP/WebSocket and application-restart checks use `scripts/cosgral-e2e-two-accounts.mjs` with private state files outside the repository. Browser acceptance and Linux bwrap verification remain separate requirements.

## Live acceptance order

On a fresh authenticated/private instance with a disposable PostgreSQL database:

1. Run `node scripts/cosgral-e2e-two-accounts.mjs --api http://127.0.0.1:3198 --phase prepare --state-file <outside-repo>/state.json`.
2. Restart the application on the same database and secrets.
3. Run the same command with `--phase verify-after-restart`.
4. Run `node scripts/cosgral-e2e-two-browsers.mjs --api http://127.0.0.1:3198 --state-directory <outside-repo> --browser-channel chrome`. Omit browser-channel to use installed Playwright Chromium.
5. Shut down the owned application and database and verify the listener is gone.

The browser test appends messages. Run it after restart verification, which intentionally compares exact prepared history. Its screenshot and result stay in the private state directory. Do not publish credentials, cookies or unreviewed server logs.
