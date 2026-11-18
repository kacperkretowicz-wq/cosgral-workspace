# T-AI / Tester — odbiór Electron @ 4f21fbfe7 (GO)

Gałąź: `team/tester/w12-ti`. Baza integracji `4f21fbfe7`. Bez push.

## Wynik (Electron)

| | |
|---|---|
| e2e | **0 FAIL**, findings **0**, MaxListeners **0** (`tai-e2e`) |
| W5 | **33/33**, console errors **0**, MaxListeners **0** (`tai-w5`) |
| Zrzuty | poza repo: `Shared\cosgral-docs\zrzuty-cosgral-17-11-i` (27 PNG + `vs-071.txt` + `vs-071-p0p1.txt`) |
| GO | usunięty po przebiegu |

## Sondy

| Sonda | Wynik |
|---|---|
| next-probes menu-plus | **ok** — attach/skill/side ON; Teach/Voice disabled |
| next-probes clear-history | **ok** — stop task → clear → remaining 0 |
| next-probes history-window | **ok** — `historyWindow: 20` |
| next-probes external-links | **ok** — ustawienie app↔browser; `browser.open` DNS fail na example.invalid (oczekiwane) |
| next-probes restore-thread | **ok** — last+thread po relaunch, pasek wątku widoczny |
| rename | **ok** |
| behavior tray (keepBackground) | **ok** — close→hide, open→show |
| behavior restore workspace | **ok** — on/off |
| behavior launchAtLogin | **ok** — true→false, registry przywrócony |
| a11y (`sandbox-a11y-probe`) | **nie odpalana** w tym GO |

Skrypt `sandbox-next-probes.ts` poprawiony w tym przebiegu (model/onboarding, role=button, nazwy kanałów, stop przed clear, lokator wątku). `sandbox-behavior-probe.ts` wrócił do repo.

## Tabela P0/P1 (7) — po PNG 17-11-i + sondach

| Priorytet | Ekran | Stan | Jedno zdanie |
|---|---|---|---|
| P0 | Sidebar + rail | **zgodny** | 01/02 densify 68 px + maskotki; pin/Więcej poza zakresem. |
| P0 | New agent | **zgodny** | 03 formularz + sugestie. |
| P0 | Chat chrome | **częściowo** | steps/@/slash OK; menu+ sonda OK (Teach/Voice disabled); launcher na tipie, nie pełny parytet 0.71. |
| P1 | Agent settings | **częściowo** | 10 karty Brain/Knows; pełne 12 kart 059–074 nie pikselowo. |
| P1 | Server settings | **zgodny** | 11 sekcje. |
| P1 | Marketplace | **zgodny** | 12 Agents/Skills; Apps głębiej nie. |
| P1 | Tasks ↔ chat | **częściowo** | 09 open-as-chat/steps; hero/board ≠ pełny 078–086. |

**Licznik:** zgodny **4** / częściowo **3** / brak **0**.

## Luki / nie sprawdzone

1. `sendShortcut` (Enter vs Ctrl+Enter) — nie sonda w oknie (BE-Z2 unity).
2. a11y probe — nie odpalana.
3. axe / Storybook — lider.
4. `browser.open` na martwy host → ERR_NAME_NOT_RESOLVED (ustawienie externalLinks i tak OK).
