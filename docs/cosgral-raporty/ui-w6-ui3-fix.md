# W6-UI3-FIX — SettingsModal story

Base: `61799a63c`, branch `team/ui/w6-ui3-fix`.

The Interactive story still expected Appearance to be disabled. W7-UI1 intentionally enabled this section and added persisted theme selection. The production behavior is correct; disabling it again would regress W7.

Replaced that obsolete assertion with stronger checks: Appearance enabled, its dialog and Theme control visible, selecting Light persists through the settings API, and returning to General restores the General surface. Notifications and Advanced remain explicitly checked as disabled. All existing switch, close animation, Escape, backdrop and focus-restoration assertions remain. No timeout changes. The story now owns and disposes the existing OpenBot mock, so its settings persistence check is isolated.

Verification: initial story run reproduced 1 failed / 1 passed on the exact disabled assertion. Final targeted checks: SettingsModal stories 2/2 with axe, related AppSettings/Appearance tests 4/4, Biome clean, typecheck:storybook exit 0.

Not run: Electron, full check, sandbox:e2e, sandbox-acceptance, build, visual baselines. Logs remain outside the repository. No production code changed.
