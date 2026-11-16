# W6-UI4 — ACP sign-in and client spaces

Branch: `team/ui/w6-ui4`, based on integration `7fe84704e`. No push.

## A — ACP sign-in

Providers now has a sign-in card beside each ACP agent and quick-add presets for Gemini CLI and Antigravity. Reuses the existing UI primitives and provider layout; no new visual system or installer.

- Log in starts the backend flow. Open sign-in page calls `openUrl` only after a click and only for a safe HTTPS URL.
- Authorization code uses an uncontrolled password field, no signal/cache/storage. The field is cleared before submit/cancel and when the phase/link changes. Only the running backend login receives it. Tests use fake input and assert booleans, never print a code.
- Starting, code required, signed in, cancelled and error states are presented. `invalid_grant` maps to “Code rejected, a new link was issued”. Backend state provides other reasons.
- Preset Add is disabled without a detected/supplied command. Official installation instructions open only on click. Nothing is installed automatically. Presets refresh after ACP configuration changes.
- Storybook: starting, waiting for code, success, rejected code, error, cancelled and missing command, with light variants of every required state.

## Verification (A)

- New ACP unit tests: 4/4 (masked/cleared code forwarding, cancellation/rejected-code copy, unsafe URL disabled, missing command gating).
- Biome on changed files, `typecheck:renderer`, `typecheck:storybook`, `check:ui`: passed.
- Impeccable detector over new A/B components: no findings.
- Storybook: 13/13 passed with axe configured as an error, required states in both themes. First attempt could not locate Chromium in the default cache; retry used the already installed shared Playwright browsers via PLAYWRIGHT_BROWSERS_PATH. No download.

## Limits

No Electron, sandbox e2e, full check, full test suite, real OAuth/account login, CLI installation, real restart/deletion or OS isolation checked. No manual visual review yet. Unit tests use backend mocks and cannot prove real Google sign-in. No credentials, browser login files or real authorization codes read. No temporary scripts created; test runners may update their local caches.

## B — Client spaces

Implementation and component tests prepared; final result follows after A.
