# W7-UI1 — production light theme

Branch: `team/ui/w7-ui1`. Base: integration `42c975985`. No push, force or visual baseline updates.

## Delivered

- `AppSettings.theme`: `dark | light | system`, default `system`. Strict response guard; unknown persisted or input values normalize to `system`. Same `projection_app_settings` record, no schema migration. Saving unrelated settings preserves theme. `agent-service.ts` untouched.
- Production light palette in `styles/theme-light.css`, using existing COSGRAL roles and neutral surfaces. Storybook uses the same palette rather than a preview-only copy. Root attribute `data-theme` switches all inherited aliases. Shared entry also covers dock/island renderers.
- Synchronous external bootstrap script selects cached/OS appearance before the app module; compatible with existing `script-src 'self'`. Cache is optional, the existing settings store is authoritative. Live OS media-query listener applies only in system mode. Settings events update the renderer and cache. Late initial reads cannot overwrite a newer event; teardown removes listeners.
- Settings → Appearance is enabled. First control: Theme (System, Light, Dark), automatically saved; load/save errors shown. Existing General content stays in its section. English copy, no new assets.
- One Storybook file renders the same App/SettingsModal in both themes: conversation with agent list, Appearance, Needs you plus Decision. axe enabled as an error in both themes.
- `check:ui` recognizes only the new palette's `--openbot-*` definitions as a palette boundary; ordinary CSS declarations remain checked, zero debt budget unchanged.

## Verification

- New focused tests: settings persistence/reopen and unknown stored theme; contract/input guard; OS changes and explicit selection; late-read race; optional cache bootstrap; appearance selection/save error; palette contrast.
- Light text primary/secondary/muted/readable/dim/placeholder ≥4.5:1 across canvas, sidebar, surface, control/hover/active. Focus and control borders ≥3:1 across those surfaces; white labels on accent, danger, success and unread fills ≥4.5:1. Initial dim/placeholder contrast on the active surface was 4.30:1; darkened before completion.
- Storybook: 6/6 stories passed axe in the final post-format run, including explicit waits for populated Needs you and Decision. An earlier fixture used an unrelated thread ID; corrected to the real mock threads and reran.
- Final checks: 8/8 new tests (5 files); Biome 23 files clean; typecheck:renderer and typecheck:storybook exit 0; check:ui 0/0 debt; Impeccable detector returned [] for changed UI surfaces. Final post-format Storybook run: 6/6, exit 0.

## Not checked / acceptance still required

- Existing fixture-only tests were adjusted for the required field but not rerun (assignment limits testing to new files). No typecheck:node run.
- No Electron launch, build, sandbox:e2e, full check, real account/CLI, native OS change, packaged startup or restart in a real window. W7-08 and G4 require later integrated/window acceptance; unit bootstrap proof does not prove absence of every native startup flash.
- No light screenshots or baseline creation/update, per assignment. Existing dark baselines untouched. No visual approval claimed.
- axe covers the named stories, not every page/state/viewport. Disabled controls and arbitrary user/provider imagery are not covered by the palette contrast calculation. Existing dark palette unchanged.
- Native chrome: BrowserWindow still has dark `backgroundColor: #0b0d0e`; renderer theme does not set Windows native title bar appearance. Title bar remains under OS/Electron control; actual colors unverified. Tray/icon assets unchanged, no light/dark variant switching added; tray behavior unverified.
- Dock/island receive the shared entry/tokens, but were not run. Separate conversation window from KK is not in this base; integration must retain its entry routing alongside theme initialization.
- No code/assets from OpenBot newer than the permitted base read or copied. Impeccable used the incumbent COSGRAL styles; missing PRODUCT.md/DESIGN.md reported by context loader, no redesign performed.

## Local environment

`bun install --frozen-lockfile --ignore-scripts` repaired stale junctions pointing into the earlier UI worktree. Lockfile unchanged. Storybook uses the existing shared Playwright installation. Initial missing browser/default-path and Vite allow-list failures occurred before any story ran; no safety allow-list was widened. Temporary editing scripts were removed; the Storybook troubleshooting log remains outside the repository; no secrets or user profile paths added to tracked content.
