# UI-AJ — skeleton zamiast gołego „Loading…”

**Gałąź:** `team/ui/w12-ai`  
**Baza:** `78d908540` (merge na gałęzi po UI-AI)  
**Kolejka:** pozycja 2 (UI Designer)  
**Data:** 18.11.2026

## Wynik

W panelach, które jeszcze pokazywały goły tekst „Loading…”, jest `CosgralLoadingSkeleton` (paski + `role="status"` + `aria-label`, klasa `cosgral-arrive`; ruch wyłączany przez istniejący `prefers-reduced-motion`).

**Zmienione m.in.:** Usage, Schedule, Tasks, Agent card detail, Vault connectors, Server settings, Skill quick pick, Provider accounts, Channel workspace (tylko stan ładowania), Direct conversation, Managed CLI, Context / Isolation / Access / Browser profile / Budget settings.

**i18n:** klucze `Loading channel…`, `Loading messages…` (PL/EN równe).

Bez zmian w `SettingsModal` / `ChannelView` (KK). Bez Storybooka / Electrona.

## Testy

| Co | Stan |
|---|---|
| `CosgralLoadingSkeleton.test` | 1/1 |
| `UsageReportView.test` | 7/7 (nowy: skeleton podczas ładowania) |
| `ScheduleOverview.test` | 4/4 |
| `TasksViewScreen.test` | 4/4 |
| `i18n.test` | 9/9 |
| Biome (zmienione) | OK |
| `typecheck:renderer` | OK |

## Luki

1. W `Conversation` podgląd mediów i tytuł zakładki nadal używają słowa „Loading…” jako treści (to nie osobny ekran ładowania).
2. `ContextIndicator` ma tekst „Loading context information...” w treści wskaźnika.
3. Stany puste Library/Usage/Schedule = kolejka UI #4 (nie ten ticket).
4. Edytor przepływów Prompt/Condition = kolejka UI #3.
5. Nie oglądane w Electronie.

## Następne

Kolejka UI #3: edytor przepływów — pola Prompt i Condition, czytelność węzłów.
