# KK-AH (godzinowa): parytet 0.71 z dowodami z okna (T-AC, T-AF)

Stan: 18.11.2026, gałąź `team/kk/w12-ah` z integracji `206fdc9b0`. Tylko dokumenty (kod funkcji bez zmian), więc bez testów.

| Miara | Było (`4ddcbb5d3`) | Jest |
|---|---|---|
| Kod | 79,2% (61 z 77) | 79,2% (bez zmian) |
| W oknie sprawdzone | 44,2% | **51,3%** (39,5 z 77) |
| Ostrożnie | 58,4% | **59,7%** (46 z 77) |

Źródła: `docs/cosgral-raporty/tester-w12-te.md` (T-AF: e2e 0 FAIL, W5 33/33, zrzuty 17-11-h, sondy Rename, tray, Restore, Launch at login) i `tester-w12-tac.md` (T-AC: W12 threadUndo, tasksView, messageMenu, heldKind). Dziesięć wierszy dostało dopisek o dowodzie; tabela „kolumna O: było → jest” jest w sekcji zmian pliku `docs/cosgral/parytet-0.71.md`.

Zasady uczciwości: „tak” w kolumnie O tylko tam, gdzie Tester sprawdził całość (21 Cofnij, 77 zmiana nazwy). Gdy brakuje części (np. fizyczny klik ikony przy zegarze, autostart po restarcie Windows, wątek w Restore), zostawiam „część”. Wiersz 75 (miejsce linków) nie ma dowodu z okna.

Poza tym: zadanie KK-AG (czyszczenie historii kanału w `ChannelView`, usunięcie `SettingsModal`, lista „okno historii”) jest **wstrzymane** w systemie i nie ruszałem go bez zgody właściciela; z tego zadania zrobiłem tylko przeliczenie parytetu, które jest też pozycją (c) mojej rutyny.
