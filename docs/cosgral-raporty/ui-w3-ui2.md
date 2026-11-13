# W3-UI2

## Agent settings

Agent profile, model, tool switches, fallback model order, saved templates and agent creation are exposed through the W3 APIs. Agent creation warnings are shown. The existing profile editor remains available.

## Program settings and onboarding

Language and the notification matrix are editable in the existing settings dialog. Available and unavailable settings sections are listed. On first setup the W3 form offers language, provider, an optional proposed agent and Computer Use availability. Older builds without the onboarding API keep the original setup.

## Verification and limitations

- Renderer typecheck: passed after connecting both steps.
- Agent creator test: 1/1; onboarding test: 1/1. These are focused component tests, not an end-to-end test.
- Biome: passed on changed renderer files.
- Storybook examples cover the creator and onboarding in light and dark themes; full settings and provider sign-in are not covered by stories. Visual inspection and a real first-run/provider sign-in were not performed.
- Provider selection follows model choice in agent settings. Fallbacks and profile use separate backend calls, so an error can leave the profile saved while fallbacks are not saved.
- Settings sections are listed with availability; this change does not create navigation for every section.
