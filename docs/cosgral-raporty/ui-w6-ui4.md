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

A commit: `7873bcbc0`.

The rail now has a separate Client space control, independent from the server/team selector. It shows the running space, not the selected next space; compact rail keeps the full name in its accessible label and title.

- Opens an accessible dialog with list/create/rename/archive/restore/delete/switch/describe.
- Main cannot be renamed, archived or deleted. Running spaces cannot be archived/deleted. Archived spaces can be restored; switching to them is hidden until restored.
- Names use the contract's validation, including reserved Main and case-insensitive duplicates; field errors explain refused names.
- Switching explicitly warns that the app restarts and running turns stop. Only confirmation sends `confirm: true`. Deletion separately warns of permanent data loss and also needs confirmation. API refusal keeps the confirmation open with the reason.
- Details show the per-space data description, saved data presence and size when known. Create/rename/archive/restore do not switch. Errors remain visible.
- Shared files: Sidebar gains one import and one component call; styles add only scoped sizing/wrapping rules. Existing text/encoding preserved.

### Verification (B)

New Spaces unit tests: 7/7. Covers Main protection, cancel/confirm deletion, restart confirmation, CRUD/archive/restore, reserved/duplicate names, description, refusal recovery, and running-vs-selected rail name through a simulated restart. ACP tests: 4/4. Typechecks and check:ui passed; Biome on changed files passed.

The same Storybook file has two additional client-space scenes (dark/light), avoiding a full Storybook suite. Final Storybook run: 15/15 passed, including both space scenes, with axe configured as an error.

### Integration acceptance still required

In the sandbox app: add a preset, start login, click the generated link, paste a real code directly into the app, check retry/cancel/success. For spaces: create two clients, rename/archive/restore one, switch with confirmation and verify actual restart/name, inspect isolated content, delete the inactive client only after confirmation. These real actions were not run here.
