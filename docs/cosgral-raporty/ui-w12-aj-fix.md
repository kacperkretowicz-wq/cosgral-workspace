# UI-AJ-FIX — tokeny COSGRAL pod `check:ui`

**Gałąź:** `team/ui/w12-ai`  
**Baza merge:** `codex/cosgral-desktop` @ `961ac2c3f`  
**Data:** 18.11.2026

## Wynik

`bun run check:ui` → **0/0** (było: 3 kolory, 7 font-size, 2 radius).

| Plik | Zamiana |
|---|---|
| `chat-side-panel-launcher.css` | `#000` → `var(--cosgral-bg-frame)`; `13px` → `--cosgral-text-md` (×3); radius `12/8` → `--cosgral-radius-lg/md` |
| `tasks-detail.css` | `#7ec8ff/#42a0ff` → `--cosgral-accent-hover/--cosgral-accent-text`; `22/14px` → `--cosgral-text-2xl/--cosgral-text-lg` |
| `agent-cards-grid.css` | `12px` → `--cosgral-text-sm` |
| `base.css` | `calc(16px * scale)` → `--cosgral-root-type` = `calc(var(--cosgral-text-xl) * scale)`, `font-size: var(--cosgral-root-type)` |

## Testy

| Co | Stan |
|---|---|
| `bun run check:ui` | OK |
| Biome (CSS) | OK |
| `typecheck:renderer` | OK |

## Luki

Wygląd cienia launchera i gradientu hero lekko przez tokeny (frame zamiast czystego `#000`, accent zamiast `#7ec8ff`). Nie oglądane w oknie.
