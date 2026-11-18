# T-AJ / Tester — odbiór Electron @ 2dfb55f09 (GO)

Gałąź: `team/tester/w12-tj`. Baza integracji `2dfb55f09`. Bez push.

## Wynik (Electron)

| | |
|---|---|
| e2e | **0 FAIL**, MaxListeners **0** (`taj-e2e3`; lokator overflow: „More pages” → „More” w `sandbox-e2e.ts`) |
| W5 | **33/33**, console errors **0**, MaxListeners **0** (`taj-w5b`, `COSGRAL_MODE=w5`) |
| Zrzuty | poza repo: `Shared\cosgral-docs\zrzuty-cosgral-17-11-j` (29 PNG + notes/hashes; `vs-071*.txt` dopisane) |
| GO | usunięty po przebiegu |

## Sondy

| Sonda | Wynik |
|---|---|
| ui-probes send-shortcut | **ok** — dataset `enter` / `mod-enter`, zapis w `appSettings.appearance` |
| ui-probes unread-first | **ok** — dataset `false`→`true`, zapis `unreadFirst: true` |
| ui-probes tasks-board | **ok** — 5 kolumn (Needs you / Working / Paused / Failed / Stopped); nagłówki z licznikiem |
| next-probes (5) | **ok** — menu-plus, clear-history, history-window, external-links, restore-thread |
| behavior | **ok** — launchAtLogin, tray keepBackground, restore workspace |
| a11y | **ok** — focus outline, reduced-motion media, css focusVisible 65 |

Nowy skrypt: `scripts/sandbox-ui-probes.ts`.

## Tabela P0/P1 (7) — po PNG 17-11-j + sondach

| Priorytet | Ekran | Stan | Jedno zdanie |
|---|---|---|---|
| P0 | Sidebar + rail | **zgodny** | 01/02 densify; overflow „More” działa w e2e. |
| P0 | New agent | **zgodny** | 03 formularz + sugestie. |
| P0 | Chat chrome | **częściowo** | steps/@/slash OK; sendShortcut w dataset OK; Teach/Voice w menu+ nadal disabled. |
| P1 | Agent settings | **częściowo** | 10 karty Brain/Knows; nie pełny parytet 059–074. |
| P1 | Server settings | **zgodny** | 11 sekcje (W5 krok 39 zapisuje język/powiadomienia). |
| P1 | Marketplace | **zgodny** | 12 Agents/Skills. |
| P1 | Tasks ↔ chat | **częściowo** | 09 + board 5 kolumn (Failed/Stopped); hero ≠ pełny 078–086. |

**Licznik:** zgodny **4** / częściowo **3** / brak **0**.

## Luki / nie sprawdzone

1. **KK #7:** PNG 16 (`updates`) i 19 (`voice`) — `notes.tsv` ma OK, ale KK na PNG widzi inne ekrany (false-OK lokatorów). Następny GO: `openPage("Settings")` + widoczność sekcji przed zrzutem; dodać Connect accounts / MCP login panel / Podagenci.
2. Menu+ Teach/Voice disabled (jak T-AI).
3. axe / Storybook / telefon PWA — nie w tym GO.
4. Przełącznik UI „Unread first” w Appearance — sonda tylko IPC+dataset (UI-AT nie w tipie).
5. `browser.open` na martwy host → ERR_NAME_NOT_RESOLVED (ustawienie externalLinks OK).
