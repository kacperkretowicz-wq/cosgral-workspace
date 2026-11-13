# Backend W3-BE5: Mobile Connect — parowanie telefonu przez QR

Gałąź `team/backend/w3-be5` od integracji `7ea68369f`, bez push. Opis zachowania: `docs/cosgral/parytet-0.68.md` wiersz 42 (test odbioru: „zeskanować QR → sesja sparowana, widać listę agentów”). Kodu OpenBota nowszego niż `a6fe240` nie czytałem. Klient na telefon, czat i odpowiedzi z telefonu (wiersze 43–44) to osobne zadanie.

## Wynik

| Zachowanie | Stan | Gdzie |
|---|---|---|
| Bilet jednorazowy, 5 min, w QR razem z adresem | ✓ | `MobileConnect.startPairing`, `buildMobilePairingPayload` |
| QR jako tekst, SVG i data URL | ✓ (`qrcode-generator` 2.0.4, MIT) | `mobile-qr.ts` |
| Zgoda na sparowanie: karta confirm w Needs you | ✓ (`confirmForPerson`) | `MobileConnect.#pair` |
| Token urządzenia: pokazany telefonowi raz, w magazynie tylko SHA-256 | ✓ | `mobile-store.ts` |
| Telefon czyta listę agentów i Needs you (skrót) | ✓ | `GET /v1/agents`, `GET /v1/needs-you`, `GET /v1/me` |
| Odwołanie urządzenia działa od razu | ✓ (następne żądanie dostaje 401) | `revokeDevice` |
| Limit prób: 5 złych biletów zamyka parowanie; 10 błędów na adres na minutę daje 429 | ✓ | `MOBILE_LIMITS` |
| Loopback domyślnie, sieć lokalna tylko po jawnym `exposure: "lan"` | ✓ | `startPairing({ exposure })` |
| Po restarcie programu sparowane telefony działają dalej (serwer wraca, jeśli działał) | ✓ | `resume()` |
| Ekran Mobile Connect | — praca UI według kontraktu niżej | — |
| Aplikacja na telefon | — wiersze 43–44, osobne zadanie | — |

## Biblioteka QR

- **`qrcode-generator` 2.0.4** (Kazuhiko Arase): licencja MIT, zero zależności, CommonJS i ESM, typy w paczce. Dane z rejestru npm odczytałem 13.11.
- Dodana do `dependencies` z przypiętą wersją (`bun add --exact`); zmiana to 1 linia w `package.json` i 3 w `bun.lock`.
- Proces główny bierze zależności z `node_modules` (`externalizeDepsPlugin`), dlatego wybrałem bibliotekę z wersją CommonJS.
- Własnego kodera QR nie pisałem: bez dekodera nie dałoby się go uczciwie sprawdzić.
- **Do zrobienia przy scaleniu:** w worktree integracji trzeba uruchomić `bun install`.

## Jak to działa i decyzje do oceny

1. **Serwer:** zwykły `node:http`. Nasłuchuje na `127.0.0.1` (domyślnie), a na `0.0.0.0` tylko po `exposure: "lan"`.
   - Port 47930, albo wolny port, gdy ten jest zajęty. Port 0 = dowolny wolny.
   - Adresy dla telefonu: zawsze `http://127.0.0.1:<port>`, przy LAN także własne adresy IPv4 komputera.
   - **Na loopbacku telefon dojdzie tylko przez tunel** (np. VPN albo przekierowanie USB); do zwykłej sieci domowej trzeba włączyć LAN.
2. **Szyfrowania nie ma** (HTTP). Stan zawsze ma `unencrypted: true`, a kontrakt podaje gotowy tekst ostrzeżenia `MOBILE_TRANSPORT_WARNING`; ten sam tekst jest na karcie zgody.
3. **Kod QR:** `cosgral://pair?v=1&t=<bilet>&u=<adres>&u=<adres>…`. Bilet to 16 losowych bajtów (22 znaki base64url). Telefon czyta kod przez `parseMobilePairingPayload` z kontraktu.
4. **Parowanie** (`POST /v1/pair` z `{ticket, deviceName, platform?}`), krok po kroku:
   1. Bilet porównuję po SHA-256 w stałym czasie.
   2. Zły bilet → 401 i jedna próba mniej; po 5 parowanie się zamyka.
   3. Dobry bilet zużywa się od razu i otwiera kartę confirm. Karta podaje nazwę i adres telefonu, co telefon zobaczy, jak go usunąć i ostrzeżenie o szyfrowaniu.
   4. „Approve” → 200 z `{protocol, deviceId, token}`. Odmowa → 403. Brak odpowiedzi do końca ważności biletu → 410.
   5. Drugi raz ten sam bilet → 410, także po odmowie.
   6. Gdy telefon rozłączy się w trakcie, urządzenie nie powstaje.
5. **Token urządzenia:** 32 losowe bajty base64url, wysłane telefonowi tylko w odpowiedzi na parowanie. W `mobile.json` jest tylko `tokenHash` (SHA-256), porównywany w stałym czasie. Kopia pliku nikogo nie wpuści.
6. **API telefonu** (`Authorization: Bearer <token>`):
   - `GET /v1/me` → `{protocol, device}`;
   - `GET /v1/agents` → `{agents: [{id, name, role, avatarHue, model}]}`;
   - `GET /v1/needs-you` → `{items: [{id, botId, kind, title, createdAt}]}`.
   - Opisów, ścieżek workspace i treści szkiców telefon nie dostaje. Tytuł Needs you ma najwyżej 160 znaków: pytanie z nagłówkiem, powód przejęcia lub Vault, tytuł karty szkicu, rodzaj zatwierdzenia z powodem.
7. **Ochrona:**
   - limit ciała żądania 4 KB (413), tylko JSON (400);
   - nieznana ścieżka → 404, zła metoda → 405;
   - odpowiedzi z `cache-control: no-store` i `nosniff`, bez nagłówków CORS, więc obca strona w przeglądarce nie przeczyta odpowiedzi;
   - błędy wewnętrzne nie zdradzają szczegółów;
   - nic nie trafia do logów: ani bilety, ani tokeny.
8. **Odwołanie:** `revokeDevice` usuwa urządzenie z magazynu w pamięci i pliku, więc następne żądanie z tym tokenem dostaje 401. Połączeń na żywo (WebSocket) jeszcze nie ma, więc nie ma czego zamykać.
9. **Stan i trwałość:** `mobile.json` w danych programu zapisuje się przez plik tymczasowy.
   - Trzyma: czy serwer działał, `exposure`, port i urządzenia (nazwa, platforma, data sparowania, ostatnio widziany i adres).
   - „Ostatnio widziany” zapisuje się na dysk najwyżej raz na minutę albo przy zmianie adresu.
   - `disable` zatrzymuje serwer, a urządzenia zostają. `close` przy wyjściu z programu nie zmienia zapisanego wyboru.
10. **Zgoda wymaga agenta:** karta pojawia się w wierszu agenta (`confirmForPerson`), więc bez agenta `startPairing` zwraca błąd „Create an agent first…”, tak jak zdalny pulpit.
11. **Małe zmiany we wspólnych plikach** (same dodatki):

    | Plik | Zmiana |
    |---|---|
    | `main/index.ts` | +14 (import typu i funkcji, `let mobileConnect`, utworzenie w bloku startu, rejestracja IPC, zamknięcie przy wyjściu) |
    | `preload/index.ts` | +2 |
    | `ipc-channels.ts` / `ipc-conversation.ts` / `ipc-desktop-apis.ts` / `ipc.ts` | +6 / +9 / +3 / +1 |
    | `package.json` / `bun.lock` | +1 / +3 (biblioteka QR) |
    | `agent-service.ts` | bez zmian |

## Kontrakt dla UI

Plik `packages/contracts/src/ipc-mobile.ts`. Mobile Connect działa zawsze na tym komputerze.

`window.openbot.mobile?`:

| Metoda | Wejście | Wynik |
|---|---|---|
| `getState` | — | `MobileState` |
| `startPairing` | `{ exposure?: "loopback" \| "lan", port? }` | `MobilePairingTicket`: `ticket`, `qrPayload`, `qrSvg`, `qrDataUrl`, `urls`, `expiresAt`, `state` |
| `cancelPairing` | — | `MobileState` |
| `disable` | — | `MobileState` (serwer stop, urządzenia zostają) |
| `listDevices` | — | `MobileDevice[]` |
| `revokeDevice` | `{ deviceId }` | `MobileState` |

`MobileState`:
- `enabled`, `exposure`, `port`, `urls`;
- `unencrypted: true` — zawsze pokaż `MOBILE_TRANSPORT_WARNING`;
- `pairing` (`expiresAt`, `attemptsLeft`, `consentPending`) albo `null`;
- `devices[]` (`id`, `name`, `platform`, `pairedAt`, `lastSeenAt`, `lastAddress`);
- `unavailableReason`.

Zdarzenia:
- `mobile-changed { state }` — zastąp cały stan;
- `mobile-pairing-completed { device }` — np. komunikat „Telefon … sparowany”.

Wskazówki dla ekranu (zakładka Mobile Connect):
1. Przełącznik „Telefony w tej sieci (LAN)” = `startPairing({ exposure: "lan" })`, z ostrzeżeniem o braku szyfrowania. Domyślnie tylko ten komputer (do tunelu).
2. QR: `<img src={qrDataUrl}>`. Pod nim bilet (`ticket`) do wklejenia ręcznie i odliczanie do `expiresAt`. Po wygaśnięciu przycisk „Nowy kod”.
3. `pairing.consentPending = true` → „Potwierdź w Needs you”. Karta to zwykła karta confirm, już obsługiwana.
4. Lista urządzeń z „Usuń” (`revokeDevice`), z datą ostatniego połączenia i adresem.
5. Przycisk „Wyłącz Mobile Connect” = `disable`.

Dla przyszłego klienta na telefon: `MOBILE_API_PATHS`, `MobilePairRequest`, `MobilePairResponse`, `MobileAgentSummary`, `MobileNeedsYouItem`, `parseMobilePairingPayload`, `MOBILE_PROTOCOL_VERSION`.

## Testy i dowód

Polecenia uruchamiane bezpośrednio, po jednym (bez `heavy.ps1`, bez pełnego `bun run test`):

| Polecenie | Wynik |
|---|---|
| `vitest run packages/contracts/src/ipc-mobile.test.ts` | 4/4 (stan, urządzenie, bilet, kod QR tam i z powrotem, odrzucanie złych kodów, limity, zdarzenia) |
| `vitest run src/backend/mobile-connect.test.ts` | 10/10 — **prawdziwy serwer HTTP na `127.0.0.1`** i `fetch`, opis niżej |
| `vitest run src/main/ipc/mobile-inputs.test.ts` | 1/1 |
| `bun run typecheck:node` | kod 0 |
| `bun run typecheck:renderer` | kod 0 |
| `biome check` na 17 dotkniętych plikach (z `package.json`) | 0 błędów |

Co sprawdza test silnika:
1. Bez agenta nie da się zacząć parowania.
2. Pełne parowanie po zgodzie: karta zawiera nazwę i adres telefonu oraz ostrzeżenie. Telefon dostaje token, a potem listę agentów, Needs you i `/v1/me`. W pliku jest tylko hash tokenu.
3. Bilet działa raz, także gdy parowanie odrzucono.
4. 5 złych biletów zamyka parowanie.
5. Wygasły bilet daje 410.
6. Usunięty telefon od razu dostaje 401.
7. Po restarcie serwer wraca, a token działa dalej.
8. `disable` zamyka serwer.
9. Odpowiedzi 404 / 400 / 413, a po 10 błędach 429.
10. Adresy LAN oraz QR jako SVG i data URL.
11. Tytuły Needs you nie przenoszą treści szkicu.

TDD: testy kontraktu i silnika najpierw padały (brak modułu lub funkcji), potem przeszły. Test wejść IPC napisałem razem z parserem.

## Czego nie sprawdziłem

- **Prawdziwego telefonu:** nie skanowałem QR i nie łączyłem telefonu. Nie wiem więc, czy aparat telefonu czyta ten kod. Biblioteka jest szeroko używana, ale żadnego kodu tu nie odczytałem.
- **Trybu LAN na prawdziwej sieci:** nie otwierałem portu na `0.0.0.0`, żeby nie wywołać okna Zapory Windows. Przy pierwszym włączeniu LAN Windows zapewne zapyta o zgodę (to okno systemu, nie programu). Adresy LAN sprawdzone tylko funkcją na danych testowych.
- **Tunelu** (VPN, przekierowanie USB) dla trybu loopback.
- **Programu w piaskownicy** (Electron): IPC i preload sprawdził tylko typecheck. Budowy paczki z nową zależnością też nie robiłem.
- **Karty zgody w oknie:** sprawdzona na atrapie `confirm`. Gdy telefon czeka dłużej niż ważność biletu, karta zostaje w Needs you, a jej późniejsze „Approve” niczego nie robi. Karta dzieli wątek „remote-desktop” (`confirmForPerson`), więc jak przy głosie może się zamknąć razem z kartami zdalnego pulpitu. Nie sprawdzałem tego.
- **Wydajności i wielu telefonów naraz**, ochrony przed DNS rebinding poza wymaganiem tokenu lub biletu, pełnego `bun run test`.

## Pliki

- Nowe:
  - kontrakt: `packages/contracts/src/ipc-mobile.ts` (+ test);
  - silnik: `src/backend/mobile-connect.ts` (+ test), `src/backend/mobile-store.ts`, `src/backend/mobile-qr.ts`;
  - IPC i okno: `src/main/mobile-ipc.ts`, `src/main/ipc/mobile-inputs.ts` (+ test), `src/preload/mobile-api.ts`.
- Zmienione: `packages/contracts/src/{ipc,ipc-channels,ipc-conversation,ipc-desktop-apis}.ts`, `src/main/index.ts`, `src/preload/index.ts`, `package.json`, `bun.lock`, `COSGRAL-CHANGES.md`.
