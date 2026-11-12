# Raport B3 — marka COSGRAL + makiety W1

**Gałąź:** `team/ui/b3-brand`  
**Baza:** `codex/cosgral-desktop` @ `23ca29fa9`  
**Agent:** UI Designer  
**Data:** 12.11.2026

## Werdykt

Gotowe na review lidera: widoczne „OpenBot” w UI zamienione na COSGRAL / COSGRAL Workspace, własne logo C + ikony PNG/ICO, `typecheck:renderer` i `bun run build` OK, makiety W1 light/dark w `docs/cosgral/ui-w1.md`.

## Dowód

| Co | Plik |
|---|---|
| Logo produkcyjne | `docs/cosgral-raporty/ui-b3-brand-proof.png` |
| Makieta W1 dark | `docs/cosgral-raporty/ui-b3-w1-dark.png` |
| Makiety źródłowe | `docs/cosgral/ui-w1/` |
| SVG marki | `build/icon.svg` |

Zrzutu żywego Electrona w tym wątku brak (Computer Use tylko w czacie głównym). Dowód = raster logo + high-fi shell W1 + build log.

## Zrobione

1. Worktree `Shared/cosgral-wt/desktop-ui`, gałąź `team/ui/b3-brand`, `bun install`.  
2. Rebrand napisów użytkownika (renderer + komunikaty main/backend widoczne w UI). Identyfikatory `@openbot/*`, `OpenBotDesktopApi`, `createMockOpenBot`, `OpenBotDatabase`, `handleOpenBotTool` zostawione.  
3. Nowe logo: litera **C** (nie oczy OpenBot) w `AppLogo.tsx`, `build/icon.svg` → PNG/ICO, assety `cosgral-logo-*.png` (stare `openbot-logo-*.png` usunięte).  
4. `bun run typecheck:renderer` → EXIT 0.  
5. `bun run build` → EXIT 0 (main/preload/renderer).  
6. Makiety W1: szyna, stany agentów, Needs you, Chat|Zadania, karty, sticky Decyzja, panel — light i dark.

## Nie sprawdzone

- Pełny start Electron w piaskownicy USERPROFILE (brak Computer Use tutaj).  
- Storybook live screenshot.  
- `dist:win` / instalator (Backend B1).  
- Wszystkie testy jednostkowe poza typecheck/build.

## Lista zmian

Patrz wiersz B3 w `COSGRAL-CHANGES.md` i diff gałęzi.
