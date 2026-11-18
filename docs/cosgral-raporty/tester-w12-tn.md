# Tester T-N — seed zrzutów + diagnoza menu @ /

Gałąź: `team/tester/w12-tn` (baza integracja `297d4c29a`, zawiera `24625e40e`). Bez Electrona w tym etapie.

## 1. Seed (`scripts/sandbox-seed.ts`)

Wywołanie z `sandbox-shots-w12` po first-run:

1. **3 agenci** z różnymi `avatarSeed` / `avatarHue` (Shot agent, Seed Researcher, Seed Writer).
2. **Library:** 3 pliki przez `library.addFiles` (File/Blob → data[]).
3. **2 kanały** + wiadomości → zadania; pause/archive gdy możliwe; podzadania jeśli stub zrobi fan-out.
4. **Usage live:** 2 tury stub na dwóch modelach (gdy lista modeli ≥2).
5. **Usage 7 dni:** `seedUsageHistory` → `node:sqlite` INSERT do `projection_budget_usage` + `_detail` (2 modele: luna/codex).
6. **2 rutyny** + `runNow` → Harmonogram ma przebiegi.

## 2. Diagnoza 06-menu-at / 07-slash (bez uruchamiania)

| Objaw | Plik:linia | Przyczyna | Rola |
|---|---|---|---|
| Skrypt: „po @ brak menu” | `sandbox-shots-w12.ts` ~520 (stare selektory `.mention-menu`) | UI ma `.mention-picker` + `aria-label="Insert mention"` (`ComposerEditor.tsx` ~465). Stary locator nie trafiał. | **Tester** (skrypt) |
| @ bez pozycji mimo UI | `ComposerEditor.tsx` ~88–117, `Show` ~465 | Menu tylko gdy `matchingOptions.length > 0`. Przy **1 agencie** `matchingBots` puste (filtr `bot.id !== props.botId`), remote też bez innych. Seed daje ≥3 agentów. | **Tester** (dane) + UI OK |
| Skrypt: „po / brak menu” | `sandbox-shots-w12.ts` ~536 (stare `.slash-menu` / role=menu) | Picker to `<section aria-label="Commands" class="mention-picker slash-picker">` (`ComposerEditor.tsx` ~436–444), nie `role="menu"`. | **Tester** (skrypt) |
| / wymaga komend | `ComposerEditor.tsx` ~245 + `composer-service.ts` ~24–28 | Slash pokazuje się tylko gdy `slashCommands().length > 0`; program ma `compact` / `new-thread` / `side` — UI ma menu. | **UI** działa; Backend OK |

**Nie brak produktu Composer** — kod menu jest. Zrzuty 17-11-c kłamały przez selektor + 1 agent.

### Co pokazuje 0.71 (dla UI)

- **111** `openbot-0.71-screens/.../111-B-chat-slash-menu.png`: po `/` lista komend nad composerem (nazwa + krótki hint).
- **112** `.../112-B-chat-at-mention.png`: po `@` picker z sekcjami (m.in. Browser tabs / Threads; u nas Agents / Files / Channels and files). Napisy EN sens: Commands, Insert mention, Agents, Files.

## 3. Po GO

build → e2e → W5 → `zrzuty-cosgral-17-11-d` z seedem.
