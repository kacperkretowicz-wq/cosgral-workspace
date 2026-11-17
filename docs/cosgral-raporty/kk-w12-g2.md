# KK W12 (g2): Transfer i Import agentów jednym plikiem .zip, preferencje aktualizacji

Data: 17.11.2026. Gałąź `team/kk/w12-g2` (od integracji `9b571a8ab`). Tylko testy jednostkowe na atrapach (atrapa programu: agenci, biblioteka, pamięci, rutyny, ustawienia; atrapa okien plików). **Żadnych prawdziwych danych.** `agent-service.ts` nietknięty. Materiały 0.71 (zrzuty 031–032, opis kontraktu) tylko do odczytu, nic z nich w repo.

## Wynik w jednej linii

**Gotowe: kontrakt + atrapa (osobny commit `0f9886267`), własny czytnik i zapis ZIP (z ochroną przed zip-slip i bombą), silnik Transferu/Importu (podgląd przed zmianą, tylko nowi agenci, rutyny wstrzymane), wpięcie w program i preferencje aktualizacji (sprawdzanie, pobieranie, instalacja przy zamknięciu, wersje wstępne, co ile godzin). Rozliczenia/licencja: celowo nie budowane (patrz §5).**

## 1. Transfer (po ludzku)

1. **Eksport:** wybierasz agentów (i opcjonalnie ustawienia serwera). Program otwiera okno „Zapisz”, zapisuje jeden `.zip`: manifest `cosgral-transfer.json` plus foldery umiejętności. Okno nigdy nie dostaje ścieżki ani bajtów pliku.
2. **Co jedzie:** profil agenta (nazwa, rola, instrukcje, kolor awatara), jego **pamięci**, **rutyny**, **umiejętności** (pliki tekstowe), opcjonalnie przenośne ustawienia serwera (Ogólne, Osobowość, domyślne agentów).
3. **Co NIE jedzie (nigdy):** klucze API, logowania, tokeny konektorów, Vault, wartości zmiennych i nagłówków MCP, historia czatów, pliki Biblioteki (w tej wersji), preferencje programu. Silnik nie dostaje żadnej drogi, żeby to przeczytać.
4. **Import:** „Wybierz plik” otwiera okno, program **tylko wczytuje i sprawdza** plik i pokazuje każdego agenta (nazwa, rola, umiejętności, liczba pamięci, rutyny, czy nazwa jest zajęta). **Nic nie powstaje**, dopóki nie klikniesz „Importuj”.
5. **Import tworzy tylko NOWYCH agentów.** Nic nie jest nadpisywane; zajęta nazwa dostaje numer („Chief (imported 2)”). **Rutyny z pliku powstają WSTRZYMANE** (włączasz sam). Umiejętność o nazwie, którą już masz w Bibliotece, zachowuje Twoją wersję (ostrzeżenie). Błąd jednej części to ostrzeżenie, nie wyrzucenie reszty; błąd utworzenia agenta pomija tylko tego agenta.
6. Podgląd żyje w pamięci pod losowym tokenem jednorazowym przez 10 minut (najwyżej 3 naraz), `apply` zużywa token (dwa szybkie kliknięcia nie zaimportują dwa razy).
7. Ten sam silnik czyta **eksport agentów z innego programu** (`openbot-import.json`: agenci, umiejętności jako foldery, pamięci jako teksty). Rutyny z innego programu **nie są czytane** (ich format harmonogramu jest inny; ostrzeżenie w podglądzie). Źródło „Hermes” (folder) jest w oknie Import jako niedostępne z powodem; „inny komputer” odsyła do Transferu.

## 2. Bezpieczeństwo pliku (sprawdzone testami)

- Czytnik ZIP to kod własny, **dla plików nieufnych**: nie wierzy rozmiarom z katalogu (rozpakowuje z limitem wyjścia i sprawdza rozmiar i CRC-32), odrzuca nazwy z `..`, ścieżki bezwzględne, litery dysków, ukośniki wsteczne, znaki sterujące i powtórzone nazwy, limity: 20 000 plików, 32 MiB na plik, 1 GiB razem, 512 MiB archiwum. Nic nie zapisuje na dysk. Szyfrowane i wieloczęściowe archiwa są odrzucane.
- Klucz agenta w manifeście musi pasować do `[A-Za-z0-9._-]{1,64}` (nie może być ścieżką); folder umiejętności musi leżeć w `agents/<klucz>/`.
- Limity treści: 200 agentów, 100 umiejętności, 1000 pamięci, 100 rutyn na agenta; pola do 20 000 znaków.
- Sygnał „czy plik nie ma sekretu”: testy eksportu sprawdzają, że w archiwum są tylko manifest i pliki umiejętności.

## 3. Aktualizacje (preferencje)

Sam silnik aktualizacji (sprawdź, pobierz, zainstaluj) jest z bazy (`update:*`). Nowe: `window.openbot.updatePreferences` (`get`, `set`), zdarzenie `update-preferences-changed`. Pola: `automaticChecks`, `automaticDownload` (wymaga sprawdzania), `installOnQuit`, `includePrereleases`, `checkEveryHours` (1–168). **Z wyłączonym automatycznym sprawdzaniem program sam nie wysyła żadnego zapytania o aktualizacje** (tylko „Sprawdź teraz”). Zapytanie o aktualizację idzie pod adres aktualizacji zbudowanej wersji i nie niesie danych o osobie ani komputerze poza tym, co każde pobranie pliku opisu wersji. Zapis: plik `update-preferences.json` w danych programu (bez sekretów); zły plik daje wartości domyślne. `UpdateService.applyPreferences` (kilka linii, testy `update-service` bez zmian).

## 4. Nazwy i pliki

| Co | Wartości |
|---|---|
| Okno | `window.openbot.instanceTransfer?` (`summary`, `exportAgents`, `choose`, `apply`, `discard`, `importSources`), `window.openbot.updatePreferences?` (`get`, `set`) |
| Kanały | `instance-transfer:{summary,export,choose,apply,discard,import-sources}`, `update-preferences:{get,set}` |
| Zdarzenie | `update-preferences-changed` |

- Kontrakt: `packages/contracts/src/ipc-instance-transfer.ts`; atrapa: `src/renderer/stories/mock-instance-transfer.ts` (+ test, 8).
- Silnik: `src/backend/zip.ts` (+ test, 6), `src/backend/instance-transfer/transfer-service.ts` (+ test, 14), `src/backend/update-preferences.ts` (+ test, 3).
- Program: `src/main/{instance-transfer-host,instance-transfer-ipc,update-preferences-ipc}.ts`, `src/main/update-service.ts` (+ `applyPreferences`), `src/main/index.ts` (~45 linii: dialogi plików, powołanie, zastosowanie preferencji przed pierwszym sprawdzeniem), `local-only-ipc.test.ts`.

## 5. Rozliczenia i licencja: nie budowane (świadomie)

W 0.71 „Billing” to portal płatności za hostowane serwery i licencje komercyjne (`billing:*`, `license:*`). Wg analizy (`openbot-0.71-funkcje.md` §18) to **nie cel** programu własnego; zostaje poza zakresem, żeby nie mylić luk produktu z lukami parytetu. „Rozliczenia lokalnie” w sensie kosztów zużycia dostawców i budżetów to osobny tor (Biblioteka/Użycie, budżety W8-KK2, KAPI).

## 6. Czego NIE sprawdzono i ograniczenia (uczciwie)

1. **Prawdziwych agentów, umiejętności, rutyn i ustawień:** adaptery w `instance-transfer-host.ts` testowane tylko typecheckiem; silnik na atrapie programu. Pierwszy test na żywo: eksport i import własnego agenta w piaskownicy (po GO).
2. Okien wyboru pliku w Electronie (czekam na GO).
3. **Pliki Biblioteki, historia czatów, kanały i ich wiadomości, ustawienia agentów (model, narzędzia), wyspa/dok:** nie jadą (flagi `capabilities.files` i `history` = false). Kanały/członkostwo nie są przenoszone (agent po imporcie nie należy do żadnego kanału).
4. Umiejętności nietekstowe (obrazy w folderze) są pomijane z ostrzeżeniem.
5. Import z Hermesa (folder) i z innych programów poza manifestem `openbot-import.json`: nie obsługiwane. Format harmonogramu rutyn innego programu nie jest znany (ostrzeżenie zamiast zgadywania).
6. Wartość „awatar” innego programu (obraz) nie jest czytana: agent dostaje awatar z imienia.
7. Aktualizacje: nie sprawdzałem prawdziwego sprawdzania/pobierania (build instalacyjny); testy `update-service` (istniejące) bez zmian, preferencje testowane osobno. Interwał zmieniony w trakcie liczy się od chwili zmiany.
