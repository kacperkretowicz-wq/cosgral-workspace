# Tester T-O — diagnoza @/ + checklisty zrzutów

Gałąź: `team/tester/w12-to` (baza integracja `b1e28ab8f`, seed T-N już scalamy). Bez Electrona do GO.

## 1. Diagnoza `@` / `/` (T-N pkt 2)

| Objaw | Plik:linia | Rola | Naprawione? |
|---|---|---|---|
| złe locatory `.mention-menu` / `.slash-menu` | `sandbox-shots-w12.ts` → `.mention-picker` / `Commands` | **Tester** | tak (`af8a74c7e`) |
| 1 agent → puste `matchingOptions` | `ComposerEditor.tsx:465` + filtr botów | **Tester** (dane) | seed ≥3 |
| UI Composer | `ComposerEditor.tsx:245`, `:436–465` | UI OK | nic do UI |

Wystarczy na GO — potwierdzenie wizualne dopiero po przebiegu `zrzuty-cosgral-17-11-d`.

## 2. Checklisty w `sandbox-shots-w12.ts`

Każdy nowy widok dostaje miękką listę `OK:`/`MISS:` w `notes.tsv` (bez rzucania):

1. **09-tasks** — Search tasks, Open as chat, Steps, badge stanu, seed.
2. **09b-usage** — Usage report, 7 days, By model, wiersz modelu.
3. **09c-schedule** — Schedule overview, okno dni, status przebiegu, seed.
4. **09d-message-menu** — More message actions → Copy/Pin/Branch/Retry/Edit/Delete.
5. **12-marketplace** — Agents/Skills + tytuł z katalogu (Meeting notes / Daily brief…).
6. **13-library-vault** — plik seed-*, Vault, Password managers, 1Password/Bitwarden/Proton Pass.

## 3. Po GO

build → e2e (^FAIL) → W5 → `zrzuty-cosgral-17-11-d` + jedno zdanie vs 0.71 i lista `MISS:`.
