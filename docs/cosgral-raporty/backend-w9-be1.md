# W9-BE1: telefon poza domem (PIN, Web Push, Tailscale) + dziura profilu przeglądarki

Gałąź `team/backend/w9-be1` (od integracji `b59e6492e`, bez push). Tylko testy jednostkowe, lint i typechecki; Electrona, `sandbox:e2e`, Storybooka i pełnego `check` nie uruchamiałem. Spec: `docs/cosgral/spec-w9.md` §1A–1C, decyzje §7 (Q1, Q2, Q4–Q7, Q11).

## Commity

| Commit | Zawartość |
|---|---|
| `731f41c2d` | **kontrakt + mock** (osobno, pierwszy): `ipc-phone-access.ts`, `window.openbot.phone?`, zdarzenie `phone-access-changed`, kanały `phone:*`, preload, mock Storybooka |
| `9cc4c8d87` | silnik po stronie komputera: PIN, VAPID i Web Push, bramka blokady, ścieżki `/v1/…`, IPC |
| `266f725af` | klient `/app`: ekran blokady, ustawienia PIN i powiadomień, service worker (push) |
| `918cf7a8d` | dziura z W8-KK3: agent nazwany przez program właścicielem strony |
| ten commit | raport, instrukcja Tailscale (`docs/cosgral/telefon-tailscale.md`), wiersz w `COSGRAL-CHANGES.md` |

## Kontrakt dla UI (`window.openbot.phone?`)

`getState()` → `PhoneAccessState` (zasięg `off | this-computer | local-network | tailscale` liczony z adresów Mobile Connect, odcisk certyfikatu, stan push, lista telefonów z `pinSet`, `locked`, `pushSubscribed`, `pushError`, `lastPushAt`) · `getTailscaleGuide()` · `setPushEnabled({enabled})` · `sendTestPush({deviceId})` → `{sent, reason}`. Zdarzenie `phone-access-changed {state}` (też po każdej zmianie Mobile Connect). Stan **nigdy** nie niesie PIN-u, skrótu ani klucza. PIN i subskrypcja push należą do telefonu i idą jego własnym uwierzytelnionym połączeniem, nie przez okno. Teksty ostrzeżenia do pokazania przy przełączniku: `PHONE_PUSH_NOTICE`; instrukcja: `PHONE_TAILSCALE_GUIDE`. **Ekranu w oknie nie zrobiłem** (to UI Designer, na kontrakcie i mocku).

## Co robi silnik

1. **Tailscale (Q1).** Bez nowego transportu: `exposure` zostaje `loopback | lan`. Adres Tailscale (100.64.0.0/10 albo `*.ts.net`) wśród adresów Mobile Connect daje zasięg `tailscale`. Instrukcja w kontrakcie i w `docs/cosgral/telefon-tailscale.md`. Certyfikat: dalej samopodpisany plus odcisk (Q2); **opcji „certyfikat sieci" nie zrobiłem** (spec mówi „albo", zostaje na później).
2. **PIN (Q6, Q7).** Opcjonalny, na telefon, 4–8 cyfr. Na komputerze tylko skrót scrypt z losową solą (nigdy PIN, nigdy w logu ani w stanie). **Komputer sam pilnuje blokady:** z ustawionym PIN-em każde wywołanie poza `session`, `pin/unlock`, `lock`, `push/key` dostaje `423`; blokada po 5 minutach bez wywołania, na żądanie klienta (strona w tle, zamknięta, świeże wczytanie), po restarcie programu; strumienie zdarzeń zablokowanego telefonu są zamykane (inaczej dalej dostawałby tytuły kart). Zmiana i usunięcie PIN-u wymagają obecnego. **5 błędnych z rzędu usuwa telefon** (licznik trwały na dysku, restart nie daje nowych prób); to też droga po zapomnianym PIN-ie.
3. **Web Push (Q4, Q5, Q11).** Domyślnie wyłączony. Włączenie robi klucze VAPID: publiczny jawny, **prywatny tylko zaszyfrowany sejfem komputera** (jak certyfikat i Vault); bez możliwości szyfrowania nie ma kluczy ani push (nie ma wersji „w jawnym pliku"). Wysyłka własnym kodem na `node:crypto` (RFC 8291 aes128gcm, RFC 8292 VAPID), **bajt w bajt zgodna z przykładem z RFC 8291** i odszyfrowywana „po stronie telefonu" w testach. Jedno powiadomienie na **nową** kartę „Needs you" (karty już czekające przy starcie nie są ogłaszane); treść to tylko nazwa agenta i id karty, w telefonie zdanie „*agent X czeka na Ciebie*" (PL/EN); do 10 na minutę na telefon; martwa subskrypcja (404/410) jest usuwana z powodem; błąd sieci nie zdradza adresu ani klucza.
4. **Klient `/app`.** Ekran blokady (z liczbą prób), ustawienia PIN (ustaw, zmień, usuń) i powiadomień (zgoda systemu pytana po stuknięciu; subskrypcja przeglądarki jest tylko odnawiana przy starcie, **nigdy tworzona bez stuknięcia**; na iPhonie komunikat „dodaj do ekranu głównego"). Service worker pokazuje powiadomienie tylko z poprawnej treści, stuknięcie otwiera kartę, nigdy adres z wiadomości.
5. **P11b.** Nowe ścieżki to jedyne, które dodałem; `settings`, `vault`, `mcp`, `permissions` i reszta `MOBILE_COMPUTER_ONLY` nadal dają 403 (test kontraktu pilnuje, że nowe ścieżki nie wchodzą w ich obszar). Telefon dalej nie widzi kont, kluczy ani logowań.
6. **Dziura z KK3 (punkt 2 zlecenia).** `BrowserHost.handleDynamicTool(params, ownerBotId)`: `agent-service.ts` przekazuje agenta, którego zna z mapy wątków (także dla tury kanałowej), a `open()` używa go zamiast szukać właściciela po zapisanej sesji CLI. Strona z wątku bez zapisanej sesji nie ląduje już we wspólnym profilu. Test z atrapą CLI (czerwony bez jednolinijkowej zmiany).
7. **`meter.preferred` (punkt 3):** zgodnie z decyzją lidera **nie podpięty**.

## Testy (wszystkie jednostkowe, zielone)

- Kontrakt `ipc-phone-access` 9, mock 6, `phone-access` (prawdziwy serwer HTTP na loopbacku, atrapa usługi push) 26, `web-push` 7 (w tym wektor RFC), klient `/app` z blokadą 6 i service worker 4, `local-only-ipc` 6 (kanały `phone:*` tylko lokalnie, błędne żądania odrzucone przed pracą).
- Powiązane razem: 16 plików, **116/116** (m.in. `mobile-connect`, `mobile-phone-api`, `mobile-tls`, `mobile-app` z testem „zasoby zbudowane ze źródeł"). `agent-service.test.ts` **81/81**.
- `typecheck:contracts`, `:node`, `:renderer`, `:storybook`, `:mobile-app` zielone; Biome na zmienionych plikach czysty (poziom błędów).

## Czego nie sprawdziłem

1. **Prawdziwego push** na Androidzie i iPhonie oraz prawdziwej usługi push (żadnego połączenia na zewnątrz w testach: `post` jest wstrzykiwane). Działanie PWA na iPhonie z ekranu głównego i to, czy Apple przyjmie ogólny adres kontaktowy w tokenie VAPID (`mailto:noreply@example.com`, stała w `web-push.ts`).
2. **Tailscale** na żywo i połączenia z LTE; czy certyfikat samopodpisany obejmuje adres 100.x (odcisk jest pinowany niezależnie, przeglądarka i tak ostrzeże).
3. **Electrona:** `safeStorage` (w testach atrapa sejfu), `fetch` do usługi push z procesu głównego, `main/index.ts` (zmiany tylko w 9 liniach, sprawdzone typecheckiem i testem lokalności kanałów, nie uruchomione).
4. **Okna programu:** ekranu `phone` w oknie nie ma (UI Designer). Do tego czasu włączenie push na komputerze wymaga ekranu.
5. **Kanały w PWA (Q8: lista, czytanie, wysyłanie, `replyTo`) nie są zrobione** w tym przebiegu (zlecenie wymieniało PIN, push i blokadę; kanały to osobna porcja BE2 po stronie `/v1/channels`). Dopisuję do listy.
6. Zachowanie przeglądarki telefonu przy `visibilitychange` i `pagehide` (jsdom je symuluje; prawdziwy iOS bywa kapryśny przy `pagehide`). Blokada w tle ma twardą kopię po stronie komputera (5 minut), więc błąd klienta nie odsłania danych, tylko opóźnia blokadę.
7. Test na prawdziwych `WebContentsView` i partycjach Electrona dla poprawki profilu (jak w raporcie KK3: tylko logika, bez Electrona).

## Do decyzji lidera

1. **PIN działa na komputerze (423), nie tylko w kliencie.** To trochę więcej niż „blokada ekranu w kliencie", ale tylko tak chroni przed skradzionym tokenem. Cena: po 5 błędnych PIN-ach telefon jest usuwany (parowanie od nowa).
2. **Blokada przy każdym wyjściu z aplikacji** (Q7 „po powrocie z tła"): na telefonie oznacza PIN po każdym przełączeniu aplikacji. Łagodniej: blokować dopiero po np. 30 s w tle (jedna stała w kliencie).
3. **Kanały w PWA** (Q8): zlecić osobno.

## Konflikty przy scalaniu

`ipc-channels.ts`, `ipc-conversation.ts`, `ipc-desktop-apis.ts`, `ipc.ts`, `preload/index.ts`, `mock-openbot.ts`, `main/index.ts`, `local-only-ipc.test.ts`, `COSGRAL-CHANGES.md`: zostaw obie strony (zmiany addytywne). `agent-service.ts` (2 linie: typ `AgentBrowserHost` i wywołanie), `agent-service.test.ts` (atrapa CLI +4 linie, jeden test), `mobile-connect.ts` (3 haki), `mobile-http.ts` (typy odpowiedzi), `mobile-ipc.ts`. **Wygenerowany `src/backend/mobile-app-assets.ts`:** przy konflikcie nie scalać ręcznie, tylko uruchomić `bun run build:mobile-app` po scaleniu (test pilnuje, że zasoby są aktualne).
