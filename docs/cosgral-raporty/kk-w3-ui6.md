# W3-UI6: ekran Mobile Connect i ekran dostawców (wiersze 42 i 35)

Gałąź `team/kk/w3-ui6` (z `codex/cosgral-desktop` @ `64d69b414`), worktree `Shared\cosgral-wt\desktop-kk`. Przejęte od UI Designera. Zero zmian w kontraktach i silniku: ekrany używają gotowych `window.openbot.mobile` i `window.openbot.providers`.

**Stan: oba ekrany gotowe jako strony w szynie stron (Phone, Providers), z testami, historiami Storybooka i zielonym typecheckiem. Nie oglądane w uruchomionym programie ani w Storybooku (zob. „Czego nie sprawdzono”).**

## Co jest

| Krok | Pliki | Commit |
|---|---|---|
| 1. Mobile Connect | `MobileConnectPage.tsx` (+ test), `stories/W3Phone.stories.tsx` | `ff65e0d1a` |
| 2. Dostawcy i limity | `ProvidersPage.tsx`, `ProvidersPageW3.test.tsx`, `stories/W3Providers.stories.tsx` | `7274fa4d2` |

Wspólne pliki (tylko dodatki): `PageRail.tsx` (+2 pozycje: Phone, Providers, ikony), `App.tsx` (2 importy, 2 bloki `Show`, 2 warunki w liście ComingSoon), `cosgral.css` (blok `.mobile-*` i `.providers-*`, tokeny istniejące), `PageRail.test.tsx` (lista pozycji; test był już nieaktualny, brakowało „Remote desktop”).

## Mobile Connect (strona „Phone”)

- **Włącz/wyłącz.** „Turn on and pair a phone” = `startPairing({exposure})` (kontrakt nie ma osobnego `enable`); „Turn off” = `disable()`.
- **Loopback | LAN** z opisem pod listą. LAN: „needs encryption (TLS); without it the program refuses”. Odmowę silnika pokazuje jako błąd.
- **Parowanie:** kod QR (`qrDataUrl` w `<img>`, bez wstrzykiwania SVG), link parowania z kopiowaniem, adres aplikacji telefonu (`appUrl`), odcisk certyfikatu SHA-256 do porównania z tym, co pokaże przeglądarka, licznik do `expiresAt`, „Cancel pairing”.
- **Zgoda:** gdy `pairing.consentPending`, komunikat „Approve or decline on the confirm card in Needs you”. Sama karta to zwykła karta confirm (bez zmian).
- **Urządzenia:** lista (nazwa, platforma, sparowano, ostatnio widziany, adres) i „Remove” (`revokeDevice`).
- **Rotacja certyfikatu:** dwustopniowa, w widoku (nie `window.confirm`): „Rotate certificate…” pokazuje ostrzeżenie „removes N paired phones at once”, potwierdzenie „Rotate and remove all phones” albo „Keep the current certificate”. Sekcja tylko przy `transport: "tls"`.
- **Ostrzeżenia transportu zawsze widoczne:** `MOBILE_TRANSPORT_WARNING` (tls) albo `MOBILE_PLAIN_TRANSPORT_WARNING` (plain, czerwona ramka), plus plakietka „Encrypted (TLS)” / „Not encrypted”.
- **Zdarzenia:** `mobile-changed` odświeża stan (i chowa QR, gdy parowanie się skończyło), `mobile-pairing-completed` pokazuje „<nazwa> is paired.”.

## Dostawcy i limity (strona „Providers”)

- **Użycie** (`listUsage`, `provider-usage-changed`): wiersz na dostawcę/agenta ACP, stan ok / limit / niedostępny, godzina resetu (`resetsAt`, dziś sama godzina, inaczej z datą), % użycia, powód. Przycisk „Refresh”. Gdy brak godziny: „No reset time was given.”.
- **Agenci ACP** (`listAcpAgents`, `saveAcpAgent`, `removeAcpAgent`, `acp-agents-changed`): formularz id / nazwa / komenda / argumenty (jeden w linii) z walidacją po pierwszej próbie zapisu, zgodną z limitami kontraktu (id `isAcpAgentId` i unikalne, nazwa ≤ 80, komenda ≤ 1000, do 64 argumentów po ≤ 2000, do 16 agentów). Usuwanie ze zwijanym potwierdzeniem („Agents set to acp:<id> can no longer use it”). Błąd silnika zostaje widoczny, a wpisane dane też.
- **Kolejność modeli zapasowych** (`getFallbackModels`, `setFallbackModels`, do 4): przeciąganie wiersza, **klawiatura: Alt+↑/↓ na zaznaczonym wierszu**, przyciski Up/Down/Remove (dla osób bez myszy i czytników ekranu), komunikat `aria-live` po przesunięciu. Lista „dodaj model” nie zawiera własnego modelu agenta ani już wybranych. „Save order” aktywny tylko po zmianie.
- **Aktywny model zapasowy** (`BotSummary.activeModel`, `bots-changed`): „<Agent> is using X instead of Y.” z plakietką Fallback; ostatnie 5 przełączeń z `model-fallback` (z powodem).
- **Nie dubluję** wiersza agenta z limitem w pasku bocznym. Stara edycja kolejności w ustawieniach agenta (`AgentSettingsW3`) zostaje i używa tego samego `setFallbackModels`; dwa miejsca edytują ten sam stan, ostatni zapis wygrywa.

## Sprawdzone

- Testy tylko nowych plików, po jednym: `MobileConnectPage.test.tsx` 9/9, `ProvidersPageW3.test.tsx` 16/16, `PageRail.test.tsx` 4/4.
- `typecheck:renderer` kod 0 (w tym historie Storybooka, bo `tsconfig.web.json` je obejmuje) po obu krokach.
- `biome check` na 9 własnych plikach: 0 błędów, 0 uwag (po poprawce 13 uwag reguły `noUnsafeTypeAssertion`; w kodzie nie ma rzutowań typów).
- Skan prywatności nowych i zmienionych plików (nazwa profilu, e-mail, `C:\Users`, `AppData`): czysto. Dane w historiach to wymyślone dane demo.

## Czego nie sprawdzono

1. **Nie uruchomiłem programu ani Storybooka.** Wygląd (jasny i ciemny motyw), układ, kontrast i proporcje QR nie były oglądane. Nie wiem też, jak `Card`, `Field`, `Badge` wyglądają w tych układach. Historie `W3Phone` i `W3Providers` przechodzą typecheck, ale ich nie renderowałem.
2. **Strony nie były otwarte z prawdziwym silnikiem.** Testy używają samych widoków z atrapami uchwytów. Zawiązania `window.openbot.mobile` / `providers` w komponentach strony (`MobileConnectPage`, `ProvidersPage`) nie ma testu; sprawdził je tylko typecheck.
3. **Prawdziwe parowanie telefonu**, czytanie QR aparatem, zmiana adresu IP, Zapora Windows przy LAN: nie sprawdzano (to już było poza zasięgiem silnika, zob. raporty Backendu).
4. **Przeciąganie myszą** sprawdzone tylko zdarzeniami `dragstart/dragover/drop` w jsdom, nie prawdziwą myszą ani ekranem dotykowym. Klawiatura i przyciski mają testy.
5. **Czytniki ekranu** (komunikaty `aria-live`, etykiety) nie były sprawdzane narzędziem ani ręcznie. Kontrast kolorów nie był mierzony.
6. **Pełnego `bun run test`, budowy i Playwrighta** nie uruchamiałem (polecenie lidera). Jeden z trzech przebiegów testu Mobile Connect padł raz przy dużym obciążeniu komputera (przyczyny nie ustaliłem, w dwóch kolejnych przebiegach przeszedł 9/9). Możliwe, że to limit czasu testu przy wolnej maszynie.
7. Pozycja „Usage” w szynie nadal jest „Coming soon”; nowa pozycja „Providers” jest osobna. Czy je scalić, to decyzja lidera.
8. Mobile Connect jest stroną w szynie, nie sekcją w Ustawieniach: okno Ustawień w tym kodzie to statyczne „General” z pozycjami „Soon”, bez miejsca na prawdziwe sekcje. Zachowałem wzór strony jak w zdalnym pulpicie.
9. Nie zrobiono: zespół i serwery (krok 3 UI Designera), ekran klienta zdalnego pulpitu poza istniejącym, ekran Marketplace.
