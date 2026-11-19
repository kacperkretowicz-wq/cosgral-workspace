# T-AL / Tester — odbiór Electron @ 978195fbd (GO)

Gałąź: `team/tester/w12-tl2`. Baza integracji `978195fbd`. Bez push.

## Wynik (Electron, build OK)

| | |
|---|---|
| e2e | **0 FAIL**, MaxListeners **0**, findings 0 |
| W5 | **33/33**, console errors **0**, MaxListeners **0** |
| Zrzuty | poza repo: `Shared\cosgral-docs\zrzuty-cosgral-17-11-k` (27 PNG) |
| GO | usunięty po przebiegu |

## Sondy

| Sonda | Wynik |
|---|---|
| ui-probes: send-shortcut, unread-first (IPC + dataset), tasks-board (5 kolumn) | ok |
| next-probes: menu-plus, clear-history, history-window, external-links, restore-thread | ok (Teach/Voice w menu+ nadal disabled) |

## Tabela P0/P1
Bez nowego przeglądu PNG: wartości jak T-AJ (4 zgodne / 3 częściowo / 0 brak). Przegląd PNG k = pozycja 12.

## Nie sprawdzone
1. Przełącznik „Unread first” **kliknięty w oknie** — sonda tylko IPC + dataset.
2. PWA kanały na żywo (telefon), Marketplace/Harmonogram/Biblioteka z danymi, odbiór PL (poz. 12–14).
3. axe / Storybook; Teach/Voice (silnik).
