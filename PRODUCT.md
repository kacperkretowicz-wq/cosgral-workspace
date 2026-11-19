# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Electron desktop app for Windows, renderer in SolidJS; a phone PWA client exists separately in `src/mobile-app`.)

## Users

The owner and one colleague. They run teams of AI agents (coding, offers, analyses, research) from one desktop window, daily and for long sessions. Both currently use OpenBot for this and know its layout well.

## Product Purpose

COSGRAL Workspace is a private, local-first multi-agent workspace: every OpenBot capability (agents, channels, tasks, flows, schedule, library, usage, marketplace, providers, phone), working better, and usable by a person, by an agent and through the API. Success: the owner switches from OpenBot to COSGRAL for daily work.

## Positioning

Built on OpenBot 0.1.11 (Apache-2.0) and brought to OpenBot 0.71 feature parity with its own code; it keeps the familiar OpenBot structure but is meant to be more polished and more reliable than the original, in Polish.

## Operating Context

- Windows 10/11 desktop; this machine has "reduce animations" switched on, so every state must work without motion.
- Codex CLI and Claude CLI are the agent providers; logins happen through those CLIs.
- Development and testing always run in a sandbox profile, never on the owner's OpenBot data.
- OpenBot itself stays installed on the same computer and is the reference to compare against.

## Capabilities and Constraints

- Feature list and parity status: `docs/cosgral/parytet-0.71.md`; work queue: `docs/cosgral/KOLEJKA-ZADAN.md`.
- Code and assets from the OpenBot 0.71 package must never enter this repository (PolyForm Noncommercial; the repo is public). Compare by looking, write our own.
- The window must work fully in Polish (PL/EN dictionaries with equal keys, `i18n.test`).
- No profile names, e-mails or private paths in commits (public repo).

## Brand Commitments

- Name: COSGRAL Workspace. Logo: the blue "C" mark stays.
- Dark theme is the default; light is an option.
- The agent avatars ("stworki", the colored creature characters) are part of the identity and should be refined further: finish, animation, expression.
- Layout follows OpenBot (page rail, agent list, conversation); quality of every section should be at least OpenBot's, preferably better.

## Evidence on Hand

- The running OpenBot app on this computer (reference only, look but do not copy assets).
- Previous owner decisions: `docs/cosgral/DECYZJE-WLASCICIELA.md`.
- No testimonials, customers or metrics exist; none may be invented.

## Product Principles

1. Familiar first: someone fluent in OpenBot finds everything where they expect it.
2. Finished, not prototyped: no raw "Loading…", no English leftovers, no clipped labels, no dead controls.
3. Works without motion and on a busy computer; motion only adds, never carries meaning.
4. Agents feel alive: avatars and status are the emotional center of the product.

## Accessibility & Inclusion

Respect `prefers-reduced-motion` (on for the owner), WCAG AA contrast in both themes (checked by Storybook a11y), full keyboard use.
