# Backend W12 – Biblioteka / Użycie / Harmonogram (BE-H, krok 1)

Gałąź `team/backend/w12-library` (z integracji 65eb4de06). Wszystko oparte na danych, które już są; nie powstał żaden nowy magazyn.

## Kontrakt i atrapa (osobny commit `04281d975`)
`window.openbot.libraryView`, `usageReport`, `schedule` (plik `ipc-insights.ts`). Reguły wspólne dla silnika i atrapy (filtrowanie, sortowanie i strona biblioteki; składanie raportu użycia) są w kontrakcie, więc ekran widzi to samo w Storybooku i w programie.

| Ekran | Wywołanie | Co daje |
| --- | --- | --- |
| Biblioteka (004) | `libraryView.page({query, origin, kind, botId, sort, offset, limit})` | strona plików z nazwą agenta, `total`, liczniki całej biblioteki wg pochodzenia, bajty; filtry: nazwa, pochodzenie, rodzaj (obraz/dokument/inne), agent; sortowanie: najnowsze, najstarsze, nazwa, rozmiar |
|  | `deleteMany({fileIds})` | zaznaczanie wielu: usunięte, pominięte (załącznik czatu zostaje przy wiadomości; plik już nieistniejący to nie błąd), zwolnione bajty; do 200 naraz |
|  | `cleanup({origin: upload|agent, olderThanDays, dryRun?})` | sprzątanie starych plików z podglądem (ile plików i bajtów) przed usunięciem |
| Użycie (005) | `usageReport.get({period: 7|30|90|365, botId?})` | każdy dzień okresu (także zerowe), sumy (tokeny, tury, dolary zgłoszone przez dostawców, `costComplete`), tabela wg agenta (udział w tokenach i w koszcie), pierścienie dostawców (limity i reset, jak `providers.listUsage`), obciążenie komputera (procesor i pamięć), od kiedy liczone, i lista tego, czego nie ma |
| Harmonogram (008) | `schedule.view({from, to, botId?})` | w oknie do 62 dni: przebiegi, które się odbyły (status, przyczyna) i zaplanowane starty (po „teraz”, tymi samymi regułami co rutyny), do 500 wpisów z informacją o ucięciu; osobno rutyny wstrzymane i uruchamiane z zewnątrz |
|  | `schedule.feed({limit, botId?, before?})` | najnowsze przebiegi wszystkich rutyn, ze stroną „wcześniejsze” |

## Silnik
- `LibraryViewService`: czyta `LibraryStore.listAll` (nowa metoda), usuwa tym samym `delete` co pojedynczy plik (zdarzenie `library-changed` leci jak dotąd).
- `UsageReportService`: wiersze z `BudgetMeter.dailyRows` i `firstDay` (nowe, tylko odczyt tabeli dzień×agent), limity z `providers.listUsage`, obciążenie z `MachineLoadSampler` (procesor liczony między dwoma odczytami, pamięć na teraz; błąd czujnika daje `null`, raport się nie wywraca).
- `ScheduleViewService`: rutyny i przebiegi ze `RoutineStore`, starty przez `nextRunAfter` (jeden mechanizm z menedżerem rutyn).
- IPC: 6 kanałów lokalnych (`library-view:*`, `usage-report:*`, `schedule:*`), w `local-only-ipc.test.ts`.

## Czego licznik NIE ma (jest w raporcie jako „niedostępne” z powodem)
Podziału na model, umiejętność oraz odczytów z pamięci podręcznej / wejście / wyjście: licznik budżetów trzyma sumę tokenów i tur na dzień i agenta. Dodanie tego wymagałoby zmiany zapisu w `agent-service.ts` (rejestr po modelu i po rodzaju tokenów); to osobna decyzja.

## Testy (jeden plik naraz)
`ipc-insights` 11, `mock-insights` 3, `library-view` 4, `usage-report` 5 (na prawdziwym `BudgetMeter`), `schedule-view` 5, `local-only-ipc` 6/6; typecheck contracts, node, renderer, storybook; Biome.
`local-only-ipc.test.ts` pod obciążeniem maszyny przekracza limit 10 s hooka `beforeAll` (importuje kilkadziesiąt modułów); z `--hookTimeout=60000` zielony.

## Nie sprawdzone / luki
- Okno aplikacji (UI rysuje ekrany); wydajność `listAll` przy tysiącach plików (limit biblioteki 5000 plików + załączniki czatu).
- „Pliki maszyny” z opisu luk (przeglądanie folderów komputera) nie są częścią tej biblioteki; miejsce na dysku daje `serverSettings.measureStorage`.
- Wykresy: dane dzienne są (365 dni); rysunek to zadanie UI.
