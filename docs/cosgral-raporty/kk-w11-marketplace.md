# KK W11 (e): Marketplace, karta Aplikacje (katalog wtyczek, instalacja, własne)

Data: 17.11.2026. Gałąź `team/kk/w11-marketplace` (nałożona na `team/kk/w11-vault-connectors`; wspólne pliki dotykają obie, konflikty rozwiązuje się zostawiając obie strony). Tylko testy jednostkowe: atrapa MCP, tymczasowy folder katalogu z **wymyślonymi** wtyczkami, baza w pliku tymczasowym. Żadnej sieci, żadnego prawdziwego serwera MCP. `agent-service.ts` nietknięty.

## Wynik w jednej linii

**Gotowe: kontrakt + atrapa (osobny commit `29f2623a3`), ładowarka katalogu z folderu z sumami kontrolnymi, silnik instalacji jako serwery MCP (aktualizacja, odinstalowanie, własne wtyczki), IPC tylko lokalne. Skille i agenci Marketplace (karty „Umiejętności” i „Agenci”) już są z W3/W4; ta praca dodaje kartę „Aplikacje”. Dane katalogu (251 wtyczek) zostają poza repo.**

## 1. Co robi (po ludzku)

1. **Skąd katalog.** Opisy wtyczek to cudze dane, więc nie ma ich w repo. Właściciel wskazuje folder (ten z paczki 0.71: `catalog.json` + `<wtyczka>/<wersja>.json`); program czyta go tylko w czasie działania. Każdy plik jest sprawdzany sumą SHA-256 z indeksu; plik brakujący, za duży, uszkodzony, niezgodny z sumą albo o złym kształcie jest **pomijany i policzony** (`skipped`). Teksty są przycinane, adresy muszą być `https` (serwer może też być `http` na tym komputerze, np. aplikacja lokalna), nic z plików nie jest uruchamiane.
2. **Instalacja = serwery MCP.** „Zainstaluj” dodaje serwery MCP programu (silnik MCP z W2 łączy, szyfruje wartości i ma przełącznik per agent). Zanim dodany zostanie pierwszy serwer, sprawdzane są klucze: brak klucza nie zostawia nic na pół. Gdy drugi serwer wtyczki zawiedzie, pierwszy jest cofany.
3. **Trzy rodzaje logowania** (z opisu 0.71): `link` (logowanie na stronie usługi), `key` (osoba wpisuje wartości raz: zmienna środowiskowa albo nagłówek z przedrostkiem „Bearer ”; zaszyfrowane, nigdy nie wracają), `local` (nic do logowania).
4. **Stany:** `available`, `installed`, `needs-sign-in`, `update-available`, `error`; błąd to stałe zdanie, nigdy tekst serwera. Serwer usunięty ręcznie w ustawieniach MCP pokazuje wtyczkę jako `error`, nie jako zainstalowaną.
5. **Aktualizacja:** nowa wersja z katalogu zmienia adres/polecenie serwerów, zapisane wartości zostają (aktualizacja nie przesyła sekretów).
6. **Własna wtyczka:** dowolny serwer MCP dodany ręcznie (`custom-<nazwa>`), w tej samej liście; nie zależy od katalogu.
7. **Wtyczki na macOS** (np. aplikacje Apple) są oznaczone `unavailableHere` i odmawiają instalacji na Windows.
8. Dwa szybkie kliknięcia „Zainstaluj” dodają jeden serwer (kolejka).

## 2. Nazwy

| Co | Wartości |
|---|---|
| Kategorie | `coding`, `productivity`, `data-analytics`, `automation`, `research`, `design`, `documents`, `other` |
| Logowanie | `link`, `key`, `local` |
| Źródło katalogu | `none`, `folder`, `demo` |
| Kanały | `plugin-catalog:{info,list,get,install,uninstall,update,add-custom,set-folder}` |
| Zdarzenie | `plugin-catalog-changed` (info + zainstalowane) |
| Okno | `window.openbot.pluginCatalog?` |

## 3. Sprawdzone na prawdziwych danych (tylko odczyt)

Ładowarka uruchomiona na folderze `plugin-catalog` z paczki 0.71 (poza repo): **251 wtyczek wczytanych, 0 pominiętych, wszystkie sumy zgodne, 4 wyróżnione**, kategorie 40/74/39/18/27/20/25/8/… zgodne z opisem Testera. Jedna wtyczka (lokalny serwer `http://127.0.0.1`) wymagała dopuszczenia `http` dla adresu tego komputera. Wynik nie jest zapisany w repo.

## 4. Pliki

- Kontrakt: `packages/contracts/src/ipc-plugin-catalog.ts`; kanały w `ipc-channels.ts`, zdarzenie w `ipc-conversation.ts`, pole w `ipc-desktop-apis.ts`, `ipc.ts` (po 1–3 linie).
- Atrapa: `src/renderer/stories/mock-plugin-catalog.ts` (+ test, 11); 8 wymyślonych wtyczek; `simulate.signedIn/serverFailed/newVersion`; `mock-openbot.ts` (3 linie).
- Silnik: `src/backend/plugin-catalog/{catalog-loader,plugin-catalog-service}.ts` (+ `plugin-catalog.test.ts`, 16).
- IPC: `src/main/plugin-catalog-ipc.ts`; `src/main/index.ts` (~15 linii; plus jedna linia w `emit` MCP, która odświeża stan wtyczek); `local-only-ipc.test.ts`.
- `src/preload/{index,plugin-catalog-api}.ts`.

## 5. Szwy

- **Wybór folderu katalogu:** IPC przyjmuje pełną ścieżkę; okno dialogu wyboru folderu musi dać UI (np. istniejący dialog plików) albo Backend. Do czasu ekranu folder można ustawić z UI przez `setCatalogFolder`.
- **Logowanie `link` (OAuth dowolnego serwera MCP):** wtyczka instaluje się i pokazuje `needs-sign-in`, ale **dokończenie logowania w przeglądarce dla dowolnego serwera MCP nie jest zaimplementowane** (nasz silnik MCP zna status `needs-login`, nie ma przepływu OAuth poza usługami z W10-KK1). To największa luka tej karty: 226 z 251 wtyczek to `link`. Szew: `McpManager` potrzebuje przepływu OAuth (wykrycie nagłówka WWW-Authenticate, rejestracja klienta, token w sejfie, ponowne połączenie); to praca dla Backendu albo osobne zadanie dla mnie, jeśli lider zdecyduje.
- **Sugestia wtyczki w czacie** (`marketplace:open-listing`): nie robiłem; wymaga narzędzia agenta (`agent-service.ts`).

## 6. Czego NIE sprawdzono (uczciwie)

1. Prawdziwego serwera MCP ani prawdziwej instalacji `npx`: tylko atrapa; uruchomienia w Electronie nie było (czeka na GO).
2. Logowania `link` do końca (patrz wyżej).
3. Okna wyboru folderu i ekranu karty Aplikacje (UI).
4. Zgodności z nazwami serwerów MCP, które osoba już ma: nazwa wtyczki to `p_<slug>` (z kolejnym numerem, gdy zajęta).
5. Skilli dołączanych do wtyczek (`skills[]` w plikach katalogu): w paczce wszystkie puste, nie obsługuję.
