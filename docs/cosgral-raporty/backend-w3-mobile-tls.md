# Backend W3-BE7: szyfrowanie ruchu telefonu (TLS z odciskiem) i klient telefonu pod `/app`

Gałąź `team/backend/w3-be7` od integracji `912f107e9`, bez push, trzy commity (jeden na krok). Rozszerzenie serwera Mobile Connect z W3-BE5 i API telefonu z W3-BE6: ten sam token urządzenia, te same limity prób, ta sama polityka 403. Decyzja lidera: TAK dla TLS z odciskiem certyfikatu w kodzie QR. Kodu OpenBota nowszego niż `a6fe240` nie czytałem. Wygląd klienta to własny system COSGRAL (wartości z programu na komputerze, własne ikony i znak „C”), bez zasobów z 0.68.

## Wynik

| Zachowanie | Stan | Gdzie |
|---|---|---|
| Certyfikat samopodpisany, tworzony lokalnie przy pierwszym włączeniu Mobile Connect | ✓ EC P-256, ważny 730 dni, bez nowej zależności | `mobile-certificate.ts` |
| Klucz prywatny tylko w magazynie programu, szyfrowany jak sekrety Vault i MCP | ✓ `SecretBox` (w programie `electronSecretBox()` = Windows DPAPI przez `safeStorage`) | `mobile-store.ts` |
| Serwer telefonu przez HTTPS | ✓ TLS 1.2+ | `mobile-connect.ts` |
| Odcisk SHA-256 w kodzie QR i w stanie Mobile Connect | ✓ `f=<64 znaki>` w linku, `state.fingerprint` jako „AB:CD:…” | `ipc-mobile.ts` |
| Sieć lokalna tylko z TLS; zwykły HTTP tylko na loopbacku i oznaczony w stanie | ✓ `transport: "tls" \| "plain"`, `unencrypted` | `mobile-connect.ts` |
| Rotacja certyfikatu z odwołaniem wszystkich urządzeń | ✓ `window.openbot.mobile.rotateCertificate()` | `mobile-connect.ts` |
| `MOBILE_TRANSPORT_WARNING`: co chroni, a co nie | ✓ nowy tekst + osobny `MOBILE_PLAIN_TRANSPORT_WARNING` | `ipc-mobile.ts` |
| Strumień SSE z numerami zdarzeń i `Last-Event-ID` (wznowienie bez gubienia kart Needs you, bufor ograniczony) | ✓ | `mobile-phone-api.ts` |
| Strona wiadomości z magazynu zapytaniem `LIMIT`, bez czytania całej rozmowy | ✓ `readThreadMessagesPage` | `openbot-database.ts` |
| Klient telefonu jako statyczna aplikacja webowa (PWA) pod `/app` tego samego serwera | ✓ HTML + CSS + TypeScript bez frameworka i bez zależności | `src/mobile-app/` |
| Parowanie z linku z QR albo z wklejonego linku, kodu `cosgral://pair` lub samego biletu | ✓ | `app.ts` |
| Lista agentów, czat z wysyłaniem, starsze wiadomości, strumień na żywo | ✓ | `app.ts` |
| Needs you: odpowiedzi tam, gdzie polityka 403 pozwala, ostrzeżenie dla reszty | ✓ pytanie (opcja lub własne słowa), Approve/Deny, Send / Ask for changes / Keep draft; reszta „na komputerze” z powodem | `app.ts` |
| Jasny i ciemny motyw (system lub wybór), polski i angielski | ✓ | `app.css`, `app.ts` |
| Powiadomienia systemowe i web push | — poza zakresem (osobne zadanie) | — |
| Tworzenie i edycja agenta z ekranu telefonu | — API jest (W3-BE6), ekranu nie ma | — |

## Krok 1: TLS z przypiętym odciskiem

**Wybór biblioteki certyfikatu: żadnej.** `node:crypto` wystarczy do klucza (`generateKeyPairSync("ec", prime256v1)`) i do podpisu (`sign("sha256", …)`), a certyfikat X.509 v3 koduje mały własny pisarz DER (~135 linii w `mobile-certificate.ts`: nazwa, ważność, SAN, `basicConstraints`, `keyUsage`, `extKeyUsage serverAuth`). Poprawność sprawdza parser Node `X509Certificate` w teście (podpis, SAN, ważność) oraz prawdziwy uścisk TLS z przypięciem odcisku. Dzięki temu nie dochodzi żadna zależność, licencja ani paczka do budowy.

**Jak to działa:**
- Pierwsze włączenie (albo brak certyfikatu, albo kończy się za mniej niż dobę): powstaje klucz i certyfikat. Certyfikat (PEM) i odcisk leżą w `mobile.json`, klucz jako szyfrogram z `SecretBox`. Odcisk można odczytać bez odszyfrowywania klucza.
- Serwer: `https.createServer({key, cert, minVersion: "TLSv1.2"})`. Gdy klucza nie da się bezpiecznie trzymać (brak `safeStorage`), serwer pracuje tylko jako zwykły HTTP na loopbacku, a tryb sieci lokalnej odmawia z jasnym komunikatem.
- Kod QR to dziś link do aplikacji webowej: `https://<adres>/app/#v=1&t=<bilet>&f=<odcisk>&u=<adres>`. Fragment (`#…`) nigdy nie trafia do serwera. Natywny odczyt `cosgral://pair?v=1&t=…&f=…&u=…` zostaje (`parseMobilePairingPayload` czyta oba).
- Karta zgody na parowanie w Needs you pokazuje ostrzeżenie zgodne z trybem (`MOBILE_TRANSPORT_WARNING` albo `MOBILE_PLAIN_TRANSPORT_WARNING`).
- **Rotacja:** `rotateCertificate()` robi nowy certyfikat (nowy odcisk) i **odwołuje wszystkie urządzenia** (tokeny przestają działać, otwarte strumienie zamykają się od razu). Powód: każdy sparowany telefon przypiął stary odcisk, więc paruje się od nowa nowym kodem QR. To samo dzieje się, gdy certyfikat trzeba zastąpić z powodu wygaśnięcia (zdarza się raz na ~2 lata).

**Co TLS z odciskiem chroni:**
- Podsłuch i zmianę ruchu w sieci lokalnej: token urządzenia, czaty, decyzje i szkice nie idą otwartym tekstem.
- Podszycie się pod komputer przed aplikacją, która przypina odcisk z QR (aplikacja natywna). Odcisk przyszedł kanałem poza siecią (obraz na ekranie komputera).

**Czego nie chroni (ważne):**
- **Przeglądarka nie może przypiąć certyfikatu.** Klient webowy pod `/app` zobaczy ostrzeżenie „certyfikat niezaufany”. Osoba przyjmuje wyjątek i powinna porównać odcisk SHA-256 w szczegółach certyfikatu z tym, który pokazuje strona parowania (z QR). Gdy ktoś w sieci podstawi inny certyfikat, a osoba kliknie dalej bez porównania, parowanie może trafić do napastnika (zgoda na karcie na komputerze go nie rozpozna, bo karta pokazuje nazwę telefonu i adres, a nie certyfikat widziany przez telefon). Dlatego ostrzeżenie jest w stanie, na karcie i na stronie parowania. Pełne przypięcie da dopiero klient natywny.
- Telefon albo komputer w cudzych rękach: szyfrowanie nie pomaga. Zgubiony telefon odwołaj na komputerze od razu.
- Zmiana adresu IP komputera (DHCP): certyfikat ma w SAN adresy z chwili tworzenia (`localhost`, `127.0.0.1` i adresy sieci lokalnej), więc przeglądarka zgłosi dodatkowo niezgodność nazwy. Natywne przypięcie odcisku tego nie sprawdza. Rozwiązanie na dziś: rotacja (ale ona odwołuje urządzenia). Nie robię tego automatycznie, żeby nie wylogowywać telefonów po każdej zmianie sieci.

## Krok 2: wznowienie strumienia i strony z magazynu

**Strumień SSE (`GET /v1/events`):**
- Każde zdarzenie ma numer (`id: …`). Numery rosną od zegara z chwili startu programu, więc numer z poprzedniego uruchomienia nigdy nie trafia w bufor nowego.
- Bufor trzyma **najnowsze zdarzenie każdego rodzaju** (lista Needs you, lista agentów, jedno „zmieniło się” na agenta). To nic nie gubi, bo każde zdarzenie jest pełnym stanem albo sygnałem „pobierz ponownie”, więc nowe zastępuje stare. Bufor ma najwyżej **200 wpisów**.
- Telefon, który wraca z `Last-Event-ID`, dostaje tylko to, co przyszło po tym numerze (najstarsze najpierw). Gdy numer jest sprzed wypchniętego wpisu, z poprzedniego uruchomienia programu albo z czasu, gdy bufor był zrzucony, telefon dostaje od razu świeżą listę Needs you (zwykły start).
- Program śledzi swoje zdarzenia jeszcze **10 minut** po zamknięciu ostatniego strumienia, żeby telefon, który tylko stracił zasięg, niczego nie stracił. Potem bufor jest zrzucany, a numer „przed zrzutem” nie wznawia już niczego. Zatrzymanie serwera (wyłączenie, rotacja certyfikatu, zamknięcie programu) kończy śledzenie od razu.
- Strumień, który nie czyta (ponad 256 KB zaległości), jest zamykany; telefon wraca z numerem.
- Strumień zaczyna się od `retry: 3000`.

**Strony wiadomości:** `GET /v1/agents/:botId/messages` czyta stronę z bazy (`OpenBotDatabase.readThreadMessagesPage`, zapytanie z `LIMIT`, kursor po `(created_at, ordinal, message_id)`), a nie całą rozmowę. Limit i kursor działają jak wcześniej (`limit` 1–100, domyślnie 30, `before`). **Granica:** baza ma zapisaną migawkę rozmowy, którą program zapisuje także w trakcie odpowiedzi agenta (`response.delta-flushed`), więc strona może być o jedno odświeżenie wsteczna względem tekstu widocznego w oknie; telefon i tak dostaje zdarzenie `conversation` i pobiera stronę ponownie. Wiadomości puste (bez tekstu i bez załączników) są pomijane w stronie, ale kursor je liczy.

## Krok 3: klient telefonu pod `/app`

**Skąd się bierze plik:** `src/mobile-app/` zawiera `index.html`, `app.css`, `app.ts`, `sw.js`, `manifest.webmanifest`, `icon.svg`. Skrypt `scripts/build-mobile-app.ts` (`bun run build:mobile-app`) zamienia TypeScript na JavaScript kompilatorem, który już jest w zależnościach deweloperskich (`typescript`), wkleja w miejsce importu małe sprawdzenia z `@openbot/contracts/runtime-values` (plik bez własnych importów; reguły repozytorium każą parsować dane z sieci tymi sprawdzeniami) i zapisuje wszystko jako `src/backend/mobile-app-assets.ts` (plik generowany, w repozytorium). Dzięki temu serwer podaje pliki z pamięci także w spakowanym programie, bez plików obok programu i bez dodatkowej zależności. Test sprawdza, że wygenerowany plik zgadza się ze źródłami (jak zapomnisz uruchomić budowę, test pada).

**Serwer (`mobile-app.ts`):** `GET/HEAD /app/…` bez tokenu (pliki nie zawierają sekretu), `/` i `/app` przekierowują na `/app/`, nieznana ścieżka to 404, inna metoda to 405, `ETag` i 304. Nagłówki: `Content-Security-Policy` (`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, bez `unsafe-*`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` bez kamery, mikrofonu i lokalizacji, `Cache-Control: no-cache`. Strona może rozmawiać tylko z własnym serwerem; test pilnuje, że w plikach nie ma adresów zewnętrznych (poza przestrzenią nazw SVG), skryptów w HTML ani stylów w HTML.

**Ekrany:**

| Ekran | Co robi |
|---|---|
| Parowanie | link z QR (też wklejony link, kod `cosgral://pair` lub sam bilet), nazwa telefonu, adres komputera, odcisk certyfikatu do porównania, ostrzeżenie przy zwykłym HTTP poza loopbackiem, oczekiwanie na zgodę na komputerze, komunikaty po polsku i angielsku dla 401, 403, 410, 429 i braku odpowiedzi |
| Agenci | lista z podglądem ostatniej wiadomości, godziną i kropką nowej aktywności |
| Czat | strona 30 ostatnich wiadomości, „Wczytaj wcześniejsze” (kursor `nextBefore`), pole wiadomości z wysyłaniem, stan „pisze…” i błędy, separator dnia, przewijanie tylko wiadomości (pole pisania zawsze na ekranie) |
| Needs you | najpierw „Możesz odpowiedzieć tutaj”, potem „Odpowiedz na komputerze” z banerem ostrzegawczym; karta pytania (opcje lub własne słowa, wymagana odpowiedź na każde pytanie), zatwierdzenia (polecenie w polu monospace, Approve/Deny), szkicu (podgląd, Keep draft, Ask for changes z polem, Send); karta, która wymaga komputera, pokazuje powód z serwera |
| Telefon | nazwa, adres, czy połączenie jest szyfrowane, zapisany odcisk, wybór motywu (system / jasny / ciemny), „Zapomnij ten telefon” (dwa dotknięcia) |

**Strumień:** `fetch` ze strumieniem (nagłówek `Authorization` nie działa w `EventSource`), `Last-Event-ID` przekazywany przy każdym wznowieniu, ponawianie co 0,5 s rosnąco do 15 s, natychmiastowe wznowienie po powrocie na kartę lub po odzyskaniu sieci. Odpowiedź 401 (telefon usunięty na komputerze albo nowy certyfikat) czyści klucz i wraca do parowania z komunikatem. Tytuł karty przeglądarki pokazuje liczbę kart („(3) COSGRAL”).

**Bezpieczeństwo klienta:** wszystkie teksty od serwera trafiają do strony przez `textContent`, nigdy przez `innerHTML`; każda odpowiedź serwera przechodzi przez sprawdzenie kształtu, zanim zostanie użyta (zła odpowiedź to czytelny błąd „zaktualizuj COSGRAL na komputerze”); token siedzi w `localStorage` pod adresem komputera (inny adres = osobne sparowanie); bilet jest w fragmencie linku i po sparowaniu zostaje zastąpiony przez `#/agents`. „Zapomnij ten telefon” usuwa klucz tylko z przeglądarki: **na komputerze urządzenie nadal jest na liście, dopóki osoba go tam nie usunie** (telefon nie może odwoływać urządzeń; to jest 403 z W3-BE6).

**PWA:** manifest (`standalone`, zakres `/app/`) i mały service worker (`sw.js`), który pamięta tylko pliki aplikacji, nigdy `/v1/` (żadna wiadomość, karta ani token nie trafia do pamięci podręcznej). Nowa wersja budowy zmienia nazwę pamięci i usuwa starą. Service worker działa tylko w kontekście bezpiecznym. Przeglądarki zwykle nie rejestrują go na certyfikacie, który osoba przyjęła ręcznie jako wyjątek (to wiedza o przeglądarkach, nie sprawdziłem), więc przy sieci lokalnej z samopodpisanym certyfikatem aplikacja prawdopodobnie działa jak zwykła strona, bez trybu offline. Na loopbacku przeglądarka traktuje adres jako bezpieczny. Ikona to SVG (iOS przy „Dodaj do ekranu początkowego” użyje własnego obrazka strony, bo nie ma ikony PNG).

**Wygląd (impeccable, tryb Operate):** wartości z programu na komputerze (fiolet `#6960f1`, ciche neutralne powierzchnie), motywy przez `light-dark()` (bez powielania tokenów), kontrast policzony ręcznie dla głównych par kolorów w obu motywach (cel ≥ 4,5:1; bez narzędzia do pomiaru), pola min. 16 px (bez przybliżania w Safari), cele dotyku 48 px, jeden ruch autorski (wejście ekranu), `prefers-reduced-motion`, własne zaznaczenie, kursor, pasek przewijania i focus. Bez kart w kartach, bez dekoracyjnego gradientu i bez emoji w roli ikon (ikony rysowane, jedna grubość linii).

## Zmiany w modelu zagrożeń (względem W3-BE6)

1. **Ruch jest szyfrowany** (gdy klucz da się trzymać szyfrowany), a tryb sieci lokalnej bez TLS jest niemożliwy. Podsłuch w LAN nie wystarcza już do przejęcia tokenu.
2. **Pozostaje ryzyko podstawienia certyfikatu przy parowaniu przez przeglądarkę** (opis wyżej). Zmniejszają je: bilet jednorazowy na 5 minut, zgoda na karcie z nazwą telefonu i adresem, ostrzeżenie z odciskiem, limit 5 złych biletów.
3. **Nowa powierzchnia: pliki aplikacji bez tokenu.** Zawierają wyłącznie kod i style; nie ma w nich sekretu ani danych użytkownika. Polityka CSP ogranicza je do własnego serwera.
4. **Token w przeglądarce telefonu** (`localStorage`). Kto ma odblokowany telefon z otwartą przeglądarką, ma dostęp do czatów i decyzji, jak przy każdej aplikacji z zalogowanym kontem. Odwołanie na komputerze działa od razu.
5. **Bufor zdarzeń** trzyma tylko krótkie tytuły kart i sygnały „zmieniło się” (bez tekstu wiadomości), najwyżej 10 minut po ostatnim strumieniu, w pamięci programu.

## Zmiany we wspólnych plikach

| Plik | Zmiana |
|---|---|
| `src/main/index.ts` | +2/−1 (`secretBox: electronSecretBox()` dla Mobile Connect i `mobilePhoneHost(service, store.database)`) |
| `package.json` | +3/−1 (`typecheck:mobile-app`, `build:mobile-app` i dopisanie `typecheck:mobile-app` do `typecheck`) |
| `packages/contracts/src/ipc-channels.ts` | +1 (`mobile:rotate-certificate`) |
| `src/preload/mobile-api.ts` | +1 (`rotateCertificate`) |
| `src/backend/openbot-database.ts` | +38 (`readThreadMessagesPage`, tylko dodatek) |
| `agent-service.ts`, okno, biblioteki UI | bez zmian |
| Moje z W3-BE5/6: `ipc-mobile.ts`, `mobile-connect.ts`, `mobile-store.ts`, `mobile-phone-api.ts`, `mobile-ipc.ts` | TLS, numery zdarzeń, strona z bazy, trasy `/app` |

Nowa tsconfig: `src/mobile-app/tsconfig.json` (biblioteki DOM dla klienta; `tsconfig.node.json` zostaje bez DOM, żeby nie mieszać typów).

## Testy i dowód

Polecenia uruchamiane bezpośrednio, po jednym (bez `heavy.ps1`, bez pełnego `bun run test`):

| Polecenie | Wynik |
|---|---|
| `vitest run src/backend/mobile-certificate.test.ts` (nowy) | 3/3: ważny certyfikat samopodpisany (parser Node go czyta i weryfikuje), nowy klucz i numer za każdym razem, prawdziwy uścisk TLS, w którym klient przypina odcisk |
| `vitest run src/backend/mobile-tls.test.ts` (nowy) | 5/5, prawdziwy serwer HTTPS na `127.0.0.1`: odcisk w QR i w stanie, klucz zaszyfrowany i ten sam certyfikat po restarcie, rotacja odwołuje telefony, wygasły certyfikat jest wymieniany, bez bezpiecznego klucza tylko zwykły loopback i odmowa dla sieci lokalnej |
| `vitest run packages/contracts/src/ipc-mobile-tls.test.ts` (nowy) | 4/4 |
| `vitest run packages/contracts/src/ipc-mobile.test.ts` / `ipc-mobile-phone.test.ts` | 4/4 / 4/4 |
| `vitest run src/backend/openbot-database-paging.test.ts` (nowy) | 2/2, prawdziwa baza SQLite |
| `vitest run src/backend/mobile-phone-api.test.ts` | 10/10, w tym wznowienie po `Last-Event-ID` bez gubienia i bez powtórzeń oraz świeży start po przepełnieniu bufora |
| `vitest run src/backend/mobile-connect.test.ts` | 10/10 |
| `vitest run src/main/ipc/mobile-inputs.test.ts` | 1/1 |
| `vitest run src/backend/mobile-app.test.ts` (nowy) | 4/4: pliki zgodne ze źródłami, brak adresów zewnętrznych i skryptów/stylów w HTML, nagłówki i CSP, 304, przekierowania, 405, 404 |
| `vitest run src/mobile-app/app.test.ts` (nowy, jsdom) | 8/8, 3 przebiegi z rzędu bez błędu: skrypt aplikacji działa na **prawdziwym** serwerze Mobile Connect z atrapą programu (parowanie z linku, link otwarty na już otwartej stronie, lista agentów, czat ze stronicowaniem 45 wiadomości i wysyłaniem, wiadomość ze strumienia, odpowiedzi na pytanie, zatwierdzenie i szkic, karty „na komputerze”, licznik ze strumienia, usunięcie telefonu na komputerze, „Zapomnij”, odcisk, wklejony kod) |
| `bun run typecheck:node`, `typecheck:renderer`, `typecheck:contracts`, `typecheck:mobile-app` | wszystkie kod 0 |
| `biome check` na plikach kroków 1–3 | 0 błędów, 0 ostrzeżeń (reguły repozytorium, w tym własne reguły pluginowe) |

Sprawdzenie wizualne w prawdziwej przeglądarce (prywatna przeglądarka OpenBota): serwer telefonu z danymi demo na loopbacku (poza repozytorium, usunięty po sprawdzeniu), okno 1270×600 i emulowany ekran 375×720 przy skali 2: parowanie, lista agentów, czat, Needs you, szczegół pytania i zatwierdzenia, ekran Telefon, jasny i ciemny motyw. Poprawki z tego przeglądu:
- czat wychodził poza ekran (pole pisania pod krawędzią): poprawiony i obejrzany ponownie;
- link parowania otwarty w już otwartej aplikacji nie przechodził do parowania: poprawiony i objęty testem;
- tytuły kart Needs you były ucinane do jednej linii: zmieniłem na dwie linie, ale **nie obejrzałem tego po zmianie**;
- wybrany motyw w przełączniku wyglądał jak „wciśnięty”: zmieniłem na kolor akcentu, także **nie obejrzałem po zmianie**.

Po ostatniej zmianie kodu (wynik lint) sprawdziłem w przeglądarce jeszcze raz przebieg parowanie → czat z wysłaniem wiadomości → zatwierdzenie karty na prawdziwym serwerze: działa jako skrypt modułowy (testy jsdom uruchamiają ten sam kod jako funkcję).

## Czego nie sprawdziłem

- **Prawdziwego telefonu** (Android, iOS), kamery czytającej ten QR, klawiatury ekranowej, paska przeglądarki i gestów. Układ sprawdziłem tylko w emulowanym oknie przeglądarki komputerowej (375×720).
- **TLS w prawdziwej sieci lokalnej:** nie otwierałem `0.0.0.0`, nie widziałem okna Zapory Windows ani ostrzeżenia certyfikatu w telefonie. Uścisk TLS z przypięciem sprawdza test na loopbacku z Node. Zachowanie przeglądarek wobec certyfikatu samopodpisanego (komunikaty, rejestracja service workera, tryb offline) opisuję z wiedzy o przeglądarkach, nie z próby.
- **Programu uruchomionego** (Electron, `safeStorage` w praktyce), budowy paczki z nowym generowanym plikiem i pełnego `bun run test`. `electron-vite build` powinien dołączyć `mobile-app-assets.ts` przez łańcuch importów, ale tego nie uruchamiałem.
- **Wyglądu stanu „czekam na zgodę na komputerze” (spinner)** w przeglądarce: sprawdziłem tylko w teście, że się pojawia i znika.
- **Rotacji certyfikatu przez okno** (UI Mobile Connect jeszcze nie istnieje; sprawdziłem silnik i kanał IPC testem).
- **Wydajności długich rozmów i dużych rozmów z wieloma agentami** (strona z bazy ma limit, ale nie mierzyłem czasu), oraz zachowania strumienia przy wielu telefonach naraz.
- **Aplikacji w innych przeglądarkach niż Chromium** (sprawdzona wizualnie i testem tylko w Chromium i jsdom). `light-dark()` wymaga Chrome 123+, Safari 17.5+, Firefox 120+; w starszych przeglądarkach kolory będą nieprawidłowe.
- **Tłumaczeń:** polskie teksty napisałem sam, bez korekty; teksty kart, ich tytuły i powody 403 przychodzą z serwera po angielsku.
- Czego klient **nie** ma: tworzenia i edycji agenta z ekranu, wątków kanałów, załączników (są tylko licznikiem), awatarów-obrazów, formatowania Markdown w wiadomościach (tekst zwykły), powiadomień systemowych i web push, zapisu szkicu pola pisania między ekranami, ikony PNG dla iOS.
- **Zmiany adresu IP komputera** po wydaniu certyfikatu (opis w kroku 1): przeglądarka zgłosi niezgodność nazwy; natywne przypięcie nie.
- **Skutek uboczny:** dwa razy zatrzymałem demo poleceniem `Get-Process bun | Stop-Process`, które kończy **wszystkie** procesy `bun`, nie tylko mój. To mogło przerwać cudzy przebieg `bun` (testy, budowa) około 18:27–18:29 czasu komputera. Jeśli ktoś z zespołu zobaczył wtedy nagły koniec polecenia, wystarczy je powtórzyć. Później zatrzymywałem demo tylko po identyfikatorze procesu.
