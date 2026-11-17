# W7-UI2 — PL/EN (w toku)

Projekt zatwierdzony w spec-w7 §8 i zleceniu W7-UI2. Start nocny właściciela wznawia zadanie.

## Plan
1. Wspólny słownik PL/EN, język systemu przed wyborem osoby, synchronizacja ustawień przez istniejące zdarzenie bez restartu; testy braków i wyścigu inicjalizacji.
2. Podłączyć istniejące ustawienia i główne elementy powłoki; nie zmieniać identyfikatorów stron ani treści rozmów.
3. Dopisać W8 i Integrations do inwentarza; kontrola jednego pliku testów i formatowania. Storybook/Electron dopiero po nowym znaku lidera.

## Zakres
Obecny SettingsModal ma cztery zakładki, dwie nieaktywne. Sześć etykiet z T1 w katalogu; rozbudowa faktycznych zakładek W7-UI3 wymaga osobnego etapu. Nie udajemy, że tłumaczenie dodaje funkcje.

## Ograniczenia
Bez Computer Use w kanale, bez alternatywnego sterowania pulpitem. Bez kopiowania kodu lub zasobów OpenBota do repo. Wyniki testów i dalsze luki zostaną dopisane po kontroli.

## Etap 1 — implementacja
- Niezależne katalogi `locales/en.ts` i `locales/pl.ts`; wspólna reaktywna funkcja `t`. EN jest fallbackiem, brak klucza logowany raz. Test wykrywa różnicę kluczy i brak tłumaczenia literałów w migrowanych komponentach.
- `startI18n` w punkcie startowym renderera: przed wyborem osoby używa podstawowego języka systemu (PL lub EN), potem zapisanej preferencji. Zdarzenie `app-settings-changed` przełącza etykiety i `html.lang` bez restartu. Spóźniony odczyt początkowy nie nadpisuje nowszego zdarzenia.
- `LanguageSettings` wewnątrz istniejącego modala: zapis przed zastosowaniem, blokada podczas zapisu, lokalizowany błąd. Dotychczasowe AppSettingsW3 też stosuje język po udanym zapisie.
- Tłumaczenia: istniejące karty modala i wyglądu, macierz powiadomień i onboarding w AppSettingsW3, etykiety stron, menu przypinania, główne grupy i akcje Sidebar. Tryb EN ma teraz Show hidden/Hide/Show zamiast polskich wysp. Testy i dwa play scripts historii dopasowane do EN.
- W8 oraz W10 Integrations dopisane do inwentarza jako osobna migracja.

## Dowód jednostkowy (kolejno, po jednym pliku)
| Plik | Wynik |
|---|---|
| i18n.test.tsx | 7/7 |
| PageRail.pins.test.tsx | 4/4 |
| PageRail.test.tsx | 5/5 |
| Sidebar.folders.test.tsx | 25/25 |
| AppSettingsW3.test.tsx | 2/2 |

Pierwszy przebieg ujawnił: aktualizacja sygnału wymaga oczekiwania w teście, pole Language miało też etykietowany region (test teraz wybiera rolę combobox), skaner źródeł potrzebował ścieżki względem repo zamiast URL przekształconego przez Vite. Testy po poprawkach zielone. Istniejące testy menu oczekiwały polskich napisów w trybie EN — oczekiwania zmienione na tekst z katalogu EN.

## Do dokończenia / odbioru
- W7-UI2 pozostaje w toku: pełny interfejs nie jest jeszcze przetłumaczony. Zostały dynamiczne opisy agentów i błędy, okna potwierdzeń, reszta stron oraz Context W6. W8/W10 celowo poza migracją.
- Sześć faktycznie działających sekcji ustawień (W7-UI3) i nieaktywne kontrolki starego modala wymagają osobnej implementacji; etykiety w słowniku nie dodają działania.
- Storybook z axe w PL/EN, w obu motywach, oraz test:visual po świeżym GO lidera. Wzorców nie zmieniano. Polskie napisy mogą wymagać korekty szerokości po oglądzie.
- Nie uruchamiano Electrona, pełnego check/build, działającego OpenBota ani ekstraktora. Brak dowodu pixel UI OpenBota 0.71.

## Kolejka UI na podstawie analizy Testera
Źródło: Shared/cosgral-docs/openbot-0.71-funkcje.md, porcja 1–2 (odczyt raportu, bez otwierania kodu OpenBota).
1. P0: odbiór listy wątków/new/archive/delete/branch w naszej piaskownicy, po GO na okno. Sam raport Testera nie dowodzi obecnego wyglądu.
2. P1: stany wstrzymania przy wątku; sprawdzić kontrakt dla usage/server-busy/restart/thread-limit przed implementacją. Brakujący kontrakt przekazać liderowi.
3. P1: ustawienia w jednym miejscu oraz Dostawcy w ustawieniach przestrzeni; porównać z naszym zatwierdzonym układem T1 przed zmianą nawigacji.

## Ciągłość
Rutyna UI: co godzinę o :10, Europe/Warsaw. Strażnik lidera i raport zbiorczy 17.11 8:00 już istniały. Rutyna wznawia tylko zakres UI, nie steruje cudzymi zadaniami. Pomocnicze skrypty edycji są we własnym workspace poza repo; ignorowane logi w7-*.log i cache runnera zostały lokalnie.

## Kontrole końcowe etapu 1
- 43/43 testy w pięciu plikach (kolejno, nie równolegle).
- typecheck:renderer: EXIT=0.
- typecheck:storybook: EXIT=0 (to sprawdzenie typów, nie uruchomienie Storybooka).
- check:ui: EXIT=0, Legacy composite debt 0/0.
- Biome 15 plików: EXIT=0. git diff --check bez błędów.
- Bez push; gałąź team/ui/w7-ui2 od 417dcb000. W7-UI2 nie oznaczono jako pełne/gotowe do odbioru G4.

## Kontrola godzinowa — etap 2, przygotowany do weryfikacji
- Scalono integrację b59e6492e do własnej gałęzi bez konfliktów (zmiana integracji: sandbox-e2e). Czysty stan przed rozpoczęciem tego etapu.
- Dodano do kodu lokalizację karty ContextSettingsSection i potwierdzenia usunięcia agenta; W8 i Integrations pozostają poza migracją. Tłumaczenie nie zmienia wywołań usuwania ani zakresu zgody.
- Funkcja t obsługuje nazwane parametry, np. imię agenta i progi procentowe. Dane są wstawiane jako tekst, bez HTML i bez specjalnej interpretacji znaków zastępowania.
- Przygotowano dodatkowe testy zgodności nazw parametrów PL/EN i interpolacji znaków specjalnych oraz rozszerzono skan literalnych kluczy o kartę kontekstu.
- NOWE ZMIANY NIE SĄ JESZCZE SPRAWDZONE testami, Biome ani typecheckiem. Wynik 43/43 wyżej dotyczy wyłącznie etapu 1. Etap 2 czeka na wolne okno na pojedyncze pliki testów; Backend ma aktywne zadanie B1 z kopią OpenBota. Nie uruchamiano równoległych testów ani aplikacji.
- Przygotowano własny plan ekranów oraz szczegółową specyfikację kolejnego ekranu Wątki w Shared/cosgral-docs/openbot-0.71-plan-ui.md. Źródło funkcjonalne: raport Testera; brak dowodu kompletnego wizualnego ekstraktu. Osiem ekranów z zależnościami i szacunkami; kryteria klawiatury, błędów, zmiany agenta podczas operacji oraz PL/EN dark/light.
- Po weryfikacji etapu 2: dalsze dynamiczne opisy powłoki i pozostałe karty, potem odbiór wizualny po odrębnym GO. Nie oznaczono całego W7 jako gotowego.

## Wznowienie 17.11 — dowód etapu 2
- Sprawdzono historię: brak nowego stopu; GO lidera z wiadomości 6843 obejmuje pojedyncze testy i kontrole statyczne.
- Stan bazowy gałęzi team/ui/w7-ui2: 80941fd49; integracja została już scalona przed wznowieniem, bez ponownego merge.
- i18n.test.tsx: uruchomienie lokalnym Node, maxWorkers=1, pool=threads oraz pool=forks — oba EXIT=1, timeout startu workera po 60 s, zero wykonanych testów. Nie jest to wynik testów aplikacji. Poprzednie 43/43 dotyczy tylko etapu 1.
- ContextControls.test.tsx i Sidebar.folders.test.tsx nie ponawiano po błędzie startu runnera; nie ma nowego dowodu ich poprawności.
- Odczytano porcje 1–3 funkcje.md i kolejkę UI Testera. Istniejąca specyfikacja Wątków pozostaje w Shared/cosgral-docs/openbot-0.71-plan-ui.md. Następny priorytet zgodnie z kolejką: sidebar, nowy agent, pasek czatu (osobne zadanie S1).
- Cały W7-UI2 nadal nie jest ukończony: dynamiczne błędy, pozostałe ekrany i odbiór PL/EN w oknie czekają. W8 i integracje wyłącznie w inwentarzu.
- Bez Electrona, Storybooka, build, pełnego check i push. Materiały 0.71 pozostają poza repo.
- Kontrole tej próby: git diff --check EXIT=0. Biome check --write sześciu zmienionych plików oraz typecheck:renderer (node tsc --noEmit -p tsconfig.web.json) nie zwróciły wyniku przez kilka minut i zostały przerwane; bez oceny pass/fail kodu. typecheck:storybook oraz check:ui nie uruchomiono. Zmiany zachowano jako WIP, nie jako gotowe do scalenia.
- Poza repo dopisano aktualizację kolejności S1 do istniejącej specyfikacji. Nie kopiowano materiałów OpenBota.

## Etap 2 — dowód (17.11)
- Przyczyna czerwonego testu: Solid odkłada zapis sygnału; test czytał język przed flush. Poprawka: `await waitFor(language())`.
- Sprawdzono kolejno: i18n.test.tsx 9/9, ContextControls.test.tsx 9/9, Sidebar.folders.test.tsx 25/25, typecheck:renderer EXIT=0, Biome (6 plików) po `--write`.
- Scalono codex/cosgral-desktop @ 46f428dfe bez konfliktów. Storybook/test:visual/Electron nie uruchamiano.
