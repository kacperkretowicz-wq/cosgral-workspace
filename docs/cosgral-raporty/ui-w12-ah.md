# UI-AH — wątek w Restore + menu „+”

**Gałąź:** `team/ui/w12-ah`  
**Baza:** `4ddcbb5d3` (integracja: UI-AG + KK-AE + BE-X)  
**Data:** 18.11.2026

## Wynik

1. **Restore wątku:** `useRestoreWorkspace` zapisuje i odtwarza `workspace.last.threadId` (debounce 500 ms). Brakujący agent/wątek pomijany; gdy lista wątków jeszcze się ładuje — próba `threads.select`. Nie dubluje zapisu w Conversation/ThreadPanel.
2. **Menu „+”:** lista jak 0.71 (`046`): Attach files, Use a skill, Teach a task, Side question, Voice. Teach a task i Voice **wyłączone** z powodem w `title` (brak silnika teach / panelu głosu w composerze).

## Testy

| Co | Stan |
|---|---|
| `useRestoreWorkspace.test` | po jednym pliku |
| `App.test` (nowy: menu +) | po jednym pliku |
| `i18n.test` | po jednym pliku (klucze PL/EN) |
| Biome (zmienione) | OK |
| `typecheck:renderer` | OK (Tester Electron — lekkie typecheck dozwolone) |

## Luki

- Teach a task / Voice w menu „+” bez działania do kontraktu silnika.
- Miganie przywrócenia (strona → agent → wątek) i prawdziwy restart — sonda Testera.
- Separator wizualny przed Side question jak w 0.71 — opcjonalnie później.
