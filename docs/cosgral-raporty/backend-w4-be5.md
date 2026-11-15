# Backend W4-BE5: „Usuń moje dane” w Ustawieniach

Gałąź `team/backend/w4-be5` od `codex/cosgral-desktop` @ `17f787bd7`, bez push. Decyzja lidera: po odinstalowaniu dane zostają (`deleteAppDataOnUninstall: false`), a usunięcie danych to osobna, świadoma akcja w programie. Zrobiłem wersję bezpieczną z planu w `backend-w4-be4.md`.

## Jak to działa

1. **Ustawienia → „Delete my data…”** (sekcja `DataWipeSection`, tylko `components/ui`). Okno pokazuje:
   - **Will be deleted:**
     - dane programu: baza, rozmowy, ustawienia, sekrety Vault i MCP (szyfrowane Windows `safeStorage`), profil przeglądarki agentów, logi;
     - folder agentów: obszary robocze agentów i pliki wspólne.

     Przy obu jest ścieżka na tym komputerze.
   - **Never touched:** logowania Codex i Claude CLI (ich własne foldery), dane zwykłego OpenBota (`%APPDATA%\OpenBot`), wszystko inne na komputerze.
   - Pole „Type DELETE to confirm”. Przycisk „Delete and restart” jest wyłączony, dopóki nie wpiszesz dokładnie `DELETE`.
2. **Kontrakt** (`packages/contracts/src/ipc-app-data.ts`, tylko ten komputer):
   - `appData.describeWipe()` zwraca plan;
   - `appData.requestWipe({ confirmation })`: proces główny sam sprawdza słowo (`parseRequestDataWipe`);
   - kanały `app-data:describe-wipe` i `app-data:request-wipe`. Zdalny serwer i telefon dostają błąd.
3. **Po potwierdzeniu** (proces główny):
   1. bezpiecznik sprawdza oba foldery, zanim cokolwiek zapisze;
   2. znacznik `<katalog danych>.wipe-pending` trafia **obok** katalogu danych, nie do środka, i nie zawiera ścieżek;
   3. `prepareForShutdown()` zatrzymuje agentów, kanały, rutyny, przepływy, MCP, serwery telefonu i zdalnego pulpitu;
   4. `app.relaunch()` i `app.quit()`.
4. **Przy następnym starcie** usuwanie rusza zaraz po blokadzie jednej instancji, a **przed** `ready`, czyli zanim Chromium otworzy swój profil i zanim program otworzy bazę.
   - Usuwanie jest synchroniczne, z krótkimi ponowieniami dla plików jeszcze trzymanych przez zamykany proces.
   - Potem program startuje jak pierwszy raz (onboarding).
   - Jeśli coś zostało (blokada), po starcie okno mówi, co.
   - Plik `lockfile` Chromium bieżącego startu jest pomijany: jest pusty i trzymany przez samą blokadę.

## Bezpiecznik (`src/main/data-wipe.ts`)

- Dozwolone są **dokładnie dwa** foldery:
  - katalog danych programu: folder o nazwie `COSGRAL Workspace…` **bezpośrednio** w AppData;
  - folder agentów: `COSGRAL Workspace` **bezpośrednio** w katalogu domowym.
- Odrzuca: katalog domowy, AppData, `%APPDATA%\OpenBot` (i wszystko w nim), ścieżki względne, foldery o innej nazwie lub w innym miejscu, a także folder, który sam jest dowiązaniem lub junction (porównanie ścieżki kanonicznej `realpath`).
- **Nigdy nie wchodzi w dowiązania.** Dowiązanie lub junction w środku jest usuwane jako ono samo (`unlink`, dla junction `rmdir`), więc jego cel zostaje nietknięty.
- **Test `data-wipe.test.ts` (6/6), z prawdziwymi junction w folderze tymczasowym:**
  - lista dozwolonych folderów;
  - 10 prób ucieczki odrzuconych (dom, AppData, OpenBot, `..`, `.codex`, `Documents\COSGRAL Workspace`, ścieżka względna…);
  - folder danych będący junction odrzucony;
  - pełne usunięcie z dwoma junction w środku (do „outside” i do `%APPDATA%\OpenBot`): oba cele i plik w `.codex` zostają;
  - znacznik leży poza usuwanym folderem.

## Krok `sandbox:e2e`

Czwarte i piąte uruchomienie w piaskownicy:
1. Agent istnieje. Otwieram Ustawienia → „Delete my data…”, wpisuję `DELETE`, klikam „Delete and restart”.
2. Program się zamyka. Zmienna `COSGRAL_WIPE_NO_RELAUNCH=1` wyłącza w teście samodzielny restart, żeby skrypt mógł sam podłączyć się do nowego procesu. Znacznik leży obok katalogu danych.
3. Kolejny start:
   - pokazuje ekrany pierwszego uruchomienia i nie ma żadnego agenta;
   - znacznik i folder wspólny agentów zniknęły;
   - pliki-wartownicy zostały: folder zwykłego OpenBota, folder logowania Codex, plik poza piaskownicą COSGRAL i cel junction, który założyłem wewnątrz katalogu danych.

**Wynik przebiegu:** krok przeszedł w prawdziwym oknie; po starcie ekrany pierwszego uruchomienia „where → local”, brak agenta, wartownicy na miejscu. Zrzut okna potwierdzenia oglądałem (lista z ścieżkami, pole DELETE, czerwony przycisk); zrzuty poza repo.

## Weryfikacja

| Sprawdzenie | Wynik |
|---|---|
| `data-wipe.test.ts` (nowy) | 6/6 |
| `DataWipeSection.test.tsx` (nowy) | 3/3 |
| `typecheck:node`, `typecheck:renderer` | kod 0 |
| `biome` na zmienionych plikach | 0 błędów |
| `bun run check:ui` | zielony („UI foundation check passed”) |
| `bun run build` | kod 0 |
| `sandbox:e2e` (osobna piaskownica) | **24/24** (23 + krok „data wipe”), 0 wpisów w konsoli; dwa ostatnie przebiegi zielone |

## Przebieg

Pierwszy przebieg kroku padł na mojej asercji „folder Shared zniknął”: start programu zakłada ten folder od nowa (pusty). Zmieniłem dowód na pliki-wskaźniki „do usunięcia” w obu folderach. KK w tym czasie uruchamiał odbiór w Electronie; zgodnie z poleceniem użyłem osobnego `COSGRAL_SANDBOX_ROOT` (wolne ok. 2,6 GB RAM).

## Czego nie sprawdziłem

- **Prawdziwego `app.relaunch()`:** w e2e restart robi skrypt (`COSGRAL_WIPE_NO_RELAUNCH=1`). Samodzielny restart programu po potwierdzeniu nie był oglądany w oknie.
- **Instalatora ani zwykłego profilu:** niczego nie usuwałem poza piaskownicą i folderami tymczasowymi testów.
- **Danych Chromium poza userData:** Electron może trzymać część pamięci podręcznej w `%LOCALAPPDATA%`. Nie zmierzyłem, co tam zostaje. Bezpiecznik i tak nie pozwala usunąć niczego poza dwoma folderami.
- **Usuwania przy ciężkim obciążeniu** (np. antywirus trzymający plik dłużej niż kilka sekund): wtedy zostaje okno z listą pozostałości, a ponowne „Delete my data” je dokończy.
- **Wyglądu sekcji** w jasnym motywie (nie ma go w programie) i z czytnikiem ekranu.
- **Pełnych `bun run test` i `bun run check`:** robi je KK.
- **Kolejności pisania testów:** testy bezpiecznika i okna napisałem razem z kodem, bez osobnego przebiegu „na czerwono”.
