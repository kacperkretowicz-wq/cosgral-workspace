# T-AF / Tester — odbiór Electron @ 4ddcbb5d3

Gałąź: `team/tester/w12-te` (z integracji `4ddcbb5d3`). Bez push. GO `GO-tester-e2e.txt` usunięty po przebiegu.

## Wyniki

| Co | Wynik |
|---|---|
| Build | `bun run build` OK |
| Zrzuty | `Shared\cosgral-docs\zrzuty-cosgral-17-11-h` — 27 PNG + `vs-071.txt` |
| e2e `^FAIL` | **0** (30 ok; findings = MaxListenersExceededWarning) |
| W5 | **33/33**, console errors 0 |
| Rename | OK (`taf-rename` / `rename-probe.json`) |
| Tray / keepBackground | OK: close → okno ukryte, proces żywy; `show()` przywraca; Pages rail OK |
| Restore workspace | OK: ON → `last.page=library` + Agent B; OFF → start bez Library |
| Launch at login | zapis `true→false` w ustawieniach; OS `openAtLogin` wrócił do stanu sprzed (false) |

## vs-071 vs 17-11-g

| MISS g | Stan h |
|---|---|
| menu wiadomości Copy/Pin/… | **OK** (09d) |
| Updates heading+track | **OK** (16) |
| Voice + mic | **OK** (19) |
| kafle / 12 maskotek | PNG: kafle densify + **12** maskotek na Nowy agent (03) |

Pozostałe: menu „+” nadal uboższe niż 0.71 (05, 3 pozycje na tipie).

## FAIL / skrypt vs produkt

Brak FAIL e2e i W5. Ostrzeżenie preload `MaxListenersExceededWarning` (11× `agent:event`) — nie liczone jako FAIL odbioru.

## Sandboxy (poza repo)

- `cosgral-sandbox\taf-shots-h`, `taf-e2e`, `taf-w5`, `taf-rename`, `taf-behavior`
- logi `*-run.log`; evidence sond w `taf-*/evidence/`

## Nie sprawdzone

1. Fizyczny klik pozycji tray „Open…” w obszarze powiadomień Windows (Playwright: `close`→hide + `show()` = ta sama ścieżka co menu Open).
2. UI-AH (wątek w Restore, menu „+” Teach/Voice) — poza tipem `4ddcbb5d3`.
3. Autostart systemu poza chwilowym `setLoginItemSettings` (cofnięty do false).
4. Pełny `bun run test` / Storybook.
