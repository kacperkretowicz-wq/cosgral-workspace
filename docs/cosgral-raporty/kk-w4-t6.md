# KK Fullstack: W4-T6, poprawka pobierania z biblioteki i pełne `bun run check` na zintegrowanej wersji

Data: 16.11.2026. Integracja `codex/cosgral-desktop` @ `7ea9afcfe` (scalone W4-UI4, W5-BE1 i W4-T5), gałąź robocza `team/kk/w4-t6`.

## Wynik w jednej linii

**Pełne `bun run check` jednym poleceniem: zielone, exit 0, 1066 s, kod @ `2b0f8bdaa`. Żadnej regresji po scaleniu W4-UI4, W5-BE1 i W4-T5.** Usterka 1 z raportu W4-T5 poprawiona (pobieranie z biblioteki nie pada, gdy brak folderu „Pobrane”), z testem 5/5 i potwierdzeniem w prawdziwym oknie. Parytet bez zmiany: 27 jest + 17 częściowo = 35,5 z 44 = 80,7%.

## Krok 1: poprawka pobierania z biblioteki

**Co było:** akcja `download` w `src/main/data-ipc.ts` liczyła punkt startu okna „Zapisz jako” z `app.getPath("downloads")`. Gdy system nie umie wskazać folderu „Pobrane” (profil bez niego, folder przeniesiony lub usunięty), Electron rzuca „Failed to get 'downloads' path” i pobranie kończy się błędem, zanim pojawi się okno.

**Co jest (jedyna zmiana w kodzie programu, za zgodą lidera):**

| Plik | Zmiana |
|---|---|
| `src/main/save-path.ts` (nowy) | `defaultSavePath(fileName, getPath)`: próbuje kolejno `downloads`, `documents`, `temp` (folder tymczasowy aplikacji), a gdy żaden nie odpowie, zwraca samą nazwę pliku. Wyjątek z `getPath` i pusta odpowiedź są pomijane. Nie rzuca i nie wstawia żadnej ścieżki do komunikatu |
| `src/main/data-ipc.ts` | wywołuje `defaultSavePath(file.name, (name) => app.getPath(name))` zamiast `join(app.getPath("downloads"), file.name)`; usunięty nieużywany import `join` |
| `src/main/save-path.test.ts` (nowy) | 5 testów: Downloads znany; Downloads rzuca → Documents; Downloads i Documents rzucają → temp; wszystkie rzucają → sama nazwa; pusta odpowiedź jest pomijana |

Test napisałem przed kodem: czerwony z powodu braku modułu, po implementacji 5/5. Obie ścieżki błędu (Documents i temp) są pokryte.

**Odbiór w prawdziwym oknie:** z kroku 30b w `scripts/sandbox-acceptance.ts` zdjąłem podmianę `app.getPath("downloads")`. Krok teraz zapisuje, gdzie program kazał zacząć oknu „Zapisz jako”, i sprawdza, że to nie sama nazwa pliku, tylko folder zapasowy z nazwą `accept-added.txt`. Wynik: **30b przechodzi** (1/1, 0 błędów konsoli) w profilu piaskownicy, który nie ma rozwiązywalnego folderu „Pobrane”, czyli dokładnie tam, gdzie wcześniej padało. Przebieg na zachowanych danych z poprzedniego odbioru (kopia folderu), nie pełny.

`typecheck:node` zielony, Biome czysty na zmienionych plikach, build zielony.

## Krok 2: pełne `bun run check`

Jedno polecenie, nic równolegle ciężkiego z mojej strony (inni agenci pracowali równolegle). **Exit 0, 1066 s** na `2b0f8bdaa`.

| Etap | Wynik | Czas / testy |
|---|---|---|
| `check:ui` | zielony | dług natywnych kontrolek 0/0 |
| `lint` | zielony | |
| `typecheck` | zielony | |
| `test` | zielony | 216 plików, 1372 testy, 523 s |
| `test:storybook` | zielony | 50 plików, 218 testów, 181 s |
| `test:visual` | zielony | 4 pliki, 7 testów, 14 s |
| `test:api` | zielony | 6 plików, 29 testów, 3 s |
| `test:browser` | zielony | smoke BrowserHost w Electronie |
| `api:build` | zielony | |
| `build-storybook` | zielony | |
| `build` | zielony | |

`bun run check` nie wypisuje czasów etapów; podane są czasy z podsumowań testów w logu. Całość: 1066 s. Wzrost względem W4-T4 (709 s) wynika z nowych testów (1343 → 1372, Storybook 209 → 218, visual 4 → 7) i z tego, że inni agenci pracowali na tym samym komputerze.

Regresji po scaleniu W4-UI4, W5-BE1 i W4-T5 nie ma: żaden etap nie padł, obrazy wzorcowe `test:visual` (w tym zmienione przez W4-UI3) przechodzą bez aktualizacji.

## Krok 3: plany i parytet

- `docs/cosgral/PLAN-W5.md`: W5-T1 „zrobione” (64 kryteria, `8c1fe4ef1`, scalone); W5-BE1 „zrobione” (`d7f7a3fae`, scalone w `7ea9afcfe`, `sandbox:e2e` 27/27 u lidera; odbiór kryteriów C01–C13 przez KK jeszcze nie zrobiony); W5-BE2 „w toku” (kontrakt kont `e1f60cd87`); W5-UI1a oddane (`f490cb3c8`, w chwili zapisu nie scalone). Stan z kanału z 16.11 ok. 01:30, bez sprawdzania gałęzi.
- `docs/cosgral/parytet-0.68.md`: policzyłem wiersze po scaleniu. Per fala: W1 15 jest + 4 częściowo, W2 9 + 3, W3 3 + 7, M 0 + 3; razem **27 jest, 17 częściowo, 0 brak = 35,5 z 44 = 80,7%**. Nagłówek zgadza się, więc liczb nie zmieniałem; dopisałem tylko, że sprawdzone po scaleniu. W wierszu 30 notatka o pobieraniu mówi teraz, że usterka jest poprawiona.

## Czego nie sprawdziłem

- Prawdziwego okna „Zapisz jako” i prawdziwego folderu „Pobrane”. Okno wyboru jest odpowiedziane w procesie głównym, a brak folderu „Pobrane” wynika z profilu piaskownicy, nie z celowego wywołania błędu w programie. Ścieżki błędu `documents` i `temp` sprawdza test jednostkowy, w oknie widziałem tylko, że program podał folder zapasowy.
- Który dokładnie folder (Documents czy temp) wybrał program w oknie piaskownicy: krok sprawdza „nie sama nazwa pliku”, bez zapisu ścieżki (ma nazwę profilu).
- Kroku 30b w pełnym przebiegu odbioru: sprawdzony osobno na zachowanych danych. Pełnego odbioru (45 kroków) i `sandbox:e2e` po tych zmianach nie powtarzałem (zmiana to jedna linia w głównym procesie, objęta `check`).
- Odbioru kryteriów W5-BE1 (C01–C13), nowych kroków `sandbox:e2e` od UI4 i W5 w prawdziwym oknie: poza zakresem tego zadania.
- Stanu gałęzi `team/ui/w5-ui1`, `team/backend/w5-be2` i `team/kapi/w4-k3` w `PLAN-W5.md`: wpisałem to, co podali w kanale.
- Usterek 2 i 3 z raportu W4-T5 (przyciski Download i Reveal, komunikat o modelu zapasowym): przekazane UI Designerowi, nie ruszałem.

## Pliki

`src/main/save-path.ts`, `src/main/save-path.test.ts`, `src/main/data-ipc.ts`, `scripts/sandbox-acceptance.ts`, `docs/cosgral/PLAN-W5.md`, `docs/cosgral/parytet-0.68.md`, `COSGRAL-CHANGES.md`, ten raport. Logi `check` i przebiegu 30b: poza repo, `Shared\cosgral-sandbox\acceptance`.
