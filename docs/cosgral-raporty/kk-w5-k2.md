# KK Fullstack: W5-K2, własne punkty końcowe (zgodne z OpenAI, Ollama, LM Studio)

Data: 16.11.2026. Gałąź `team/kk/w5-k2` (od `team/kk/w5-k1`, z scalonym `team/backend/w5-be3`).

## Wynik w jednej linii

**Osoba dodaje własny punkt końcowy (nazwa, adres http/https, opcjonalny klucz), klika „Check connection", dostaje listę modeli z `/models`, a agent wybiera model `endpoint:<id>/<model>` jak każdy inny i rozmawia przez Chat Completions. Rozmowa tylko tekstowa („chat only"): agent nie dostaje narzędzi programu. Nie uruchamiałem Electrona ani `sandbox:e2e`; żadnej prawdziwej usługi (Ollama, LM Studio) nie dotykałem.**

## Co jest zrobione

| Wymaganie | Jak |
|---|---|
| Adres: tylko http/https; localhost i sieć lokalna dozwolone | `checkEndpointUrl` w kontrakcie (`ipc-endpoints.ts`): odrzuca inne schematy, login i hasło w adresie, `?` i `#`. Backend sprawdza ponownie przy zapisie i przy każdym pobraniu. |
| Jawne ostrzeżenie przy http poza localhost | host inny niż ten komputer dostaje `warning` („Your messages go to…"); http w sieci lokalnej: „not encrypted"; **http do hosta poza siecią lokalną jest odrzucone** (wiadomości i klucz poszłyby jawnie przez internet). Decyzja moja, wykracza poza polecenie: lider może poluzować. |
| Lista modeli z `/models` na żądanie | `EndpointStore.check` i `detectLocal`: `GET <adres>/models`, bez przekierowań, limit czasu 8 s (wykrywanie 1,5 s), limit odpowiedzi 2 MB, do 200 modeli, nazwy przycięte i bez duplikatów. Zapis punktu niczego nie kontaktuje. |
| Klucz opcjonalny w magazynie z BE3 | zmerge'owałem `team/backend/w5-be3` i **rozszerzyłem `ApiKeyStore` o „sloty"** (`setSlot`, `removeSlot`, `slotKey`, `slotMask`; ta sama tabela i szyfrowanie `safeStorage`; slot `endpoint:<id>`). `values()` obejmuje też sloty, więc redakcja BE3 (`[redacted]`) chroni klucze punktów. Logika szyfrowania nie jest kopiowana. |
| Klucz należy do jednego hosta | zmiana hosta w adresie usuwa zapisany klucz (z komunikatem); usunięcie punktu kasuje klucz; klucz nigdy nie wychodzi w odpowiedzi (tylko maska `••••1234`). |
| Presety | `ENDPOINT_PRESETS`: Ollama `http://127.0.0.1:11434/v1`, LM Studio `http://127.0.0.1:1234/v1`. Wypełniają formularz i niczego nie kontaktują. |
| „Wykryj lokalne" (spec wiersz 29) | tylko 127.0.0.1:11434 i :1234; brak nasłuchu = pusta lista bez błędu; znaleziony serwer dostaje punkt `ollama` / `lmstudio` z modelami. |
| Test połączenia tylko po kliknięciu | `check` jest wołane wyłącznie z przycisku „Check connection"; nic nie działa w tle ani przy zapisie. |
| Agent wybiera model jak każdy inny | `listModels()` dokleja modele punktów (`endpoint:<id>/<model>`, nazwa „… (Label, chat only)"); `App.tsx` odświeża listę po zdarzeniu `endpoints-changed`. Model punktu może też być modelem zapasowym (`isAgentModel` go akceptuje). |
| Rozmowa | `EndpointAgentClient` (`provider: "endpoint"`): strumień SSE, wsparcie odpowiedzi bez strumienia, historia wątku w pamięci, przerwanie tury, brak przekierowań, cichy limit 2 min bez danych. Błędy jak ACP: 429 = `usage-limit` (Retry-After), brak odpowiedzi i 5xx = `unavailable` (może wejść model zapasowy), 401/403/404/400 = zwykły błąd (nie zmienia modelu). |
| Punkt usunięty | modele znikają z wyboru, a agent na takim modelu dostaje czytelny błąd „The endpoint of this model was removed…" bez wiszącej tury. |
| Baza | tabela `projection_model_endpoints` (adres, nazwa, modele, stan; **bez klucza**). `projection_provider_sessions` miała `CHECK(provider IN ('codex','claude','acp'))`: istniejąca migracja `widenProviderSessions` przebuduje ją raz (teraz z `'endpoint'`), sesje zostają. |

## Kontrakt dla UI

Plik `packages/contracts/src/ipc-endpoints.ts`, `window.openbot.endpoints?` (tylko ten komputer; inny serwer = błąd):

| Metoda | Wejście | Wynik |
|---|---|---|
| `list()` | – | `ModelEndpoint[]` |
| `save(input)` | `{ id?, label, kind, baseUrl, key?, clearKey? }` | `ModelEndpoint` (niczego nie kontaktuje; `key` pominięty = zostaje stary; `clearKey: true` = usuń) |
| `remove({ id })` | – | `void` (kasuje też klucz) |
| `check({ id })` | – | `ModelEndpoint` (odrzucony klucz i brak serwera to **stan**, nie wyjątek) |
| `detectLocal()` | – | `ModelEndpoint[]` (znalezione; pusta lista = nic nie nasłuchuje) |

`ModelEndpoint = { id, label, kind: "openai-compatible"|"ollama"|"lmstudio", baseUrl, hasKey, maskedKey|null, models: string[], state: "unchecked"|"checking"|"ok"|"rejected"|"unreachable", message|null, checkedAt|null, warning|null, chatOnly: true }`.
Zdarzenie `endpoints-changed { endpoints }` (zastąp listę i odśwież `agent.listModels()`). Pomocnicze: `checkEndpointUrl(adres)` (do ostrzeżeń na żywo), `endpointModelId(id, model)`, `parseEndpointModel`, `ENDPOINT_PRESETS`, `ENDPOINT_LIMITS` (8 punktów, klucz 4–512 znaków jedno słowo ASCII). Mock: `src/renderer/stories/mock-endpoints-api.ts` (adres z „unreachable" jest nieosiągalny, klucz od „bad" odrzucany). UI: `EndpointsSection.tsx` na stronie Dostawcy (jedna linia w `ProvidersPage.tsx`).

## Testy

| Co | Wynik |
|---|---|
| `endpoint-store.test.ts` (prawdziwe serwery HTTP na 127.0.0.1, losowe porty): lista modeli, 401 bez klucza / zły / dobry klucz, timeout, brak przekierowania (cel nie dostaje nic), serwer nie działa, 404, 500, zła treść, zbyt duża treść, zły schemat, login w adresie, http poza siecią lokalną, ostrzeżenia, limit 8, klucz w bazie/zdarzeniach (0 trafień), zmiana hosta kasuje klucz, usunięcie, wykrywanie (tylko porty sond, pusta lista), odpowiedź spóźniona po edycji | **19/19** |
| `endpoint-client.test.ts` (serwer czatu): strumień, klucz tylko gdy jest, instrukcje + notatka „chat only", historia, nieudana tura bez śladu, odpowiedź bez strumienia, klasyfikacja błędów 401/404/429/503/400 (i redakcja klucza z odpowiedzi serwera), serwer nie działa, cisza, przerwanie, przekierowanie, usunięty punkt | **10/10** |
| `agent-service-endpoints.test.ts` (prawdziwy `AgentService`): modele w wyborze dopiero po pobraniu, odpowiedź przez punkt z kluczem, usunięty punkt = czytelny błąd, odmowa klucza bez zmiany modelu | **4/4** |
| `openbot-database-endpoint-sessions.test.ts`: migracja tabeli sesji starej bazy, sesje zostają, sesja `endpoint` działa | **1/1** |
| `ipc-endpoints.test.ts` (kontrakt, adresy, id modeli, parser bez klucza w błędzie) | **5/5** |
| `endpoints-api.test.ts` (preload) + `mock-endpoints-api.test.ts` | **2/2** + **4/4** |
| `EndpointsSection.test.tsx` (preset, ostrzeżenia na żywo, pole hasła puste po zapisie, stany, usuwanie z potwierdzeniem, wykrywanie) | **7/7** |
| Regresja: `agent-service.test.ts` 70/70, router + silnik kont 43/43, `api-key-store` 24/24, `provider-registry`, `openbot-database`, `ProvidersPage`, cały `src/preload` | zielone (zbiorczy przebieg 17 plików: 151/151) |
| `bun run lint` (761 plików), `check:ui`, `typecheck:contracts`, `node`, `renderer`, `storybook` | zielone |

Razem 52 nowe testy. Uruchamiałem przez `node node_modules/vitest/vitest.mjs run <pliki>` (przy `bun run test` zod w tym worktree się wywala), jedna ciężka komenda naraz.

## Kryteria `spec-w5.md` dla K2

| Kryterium | Stan |
|---|---|
| E01 lista modeli, stan ok/nieosiągalny, loopback domyślnie, inny host z ostrzeżeniem, tylko http/https | **J tak** |
| E02 agent na `endpoint:<id>/<model>` rozmawia przez atrapę; „tylko rozmowa" | **J tak, E nie** (każdy punkt jest „chat only"; narzędzi nie ma w tej wersji) |
| E03 klucz jak K01–K04 | **J tak** (szyfrogram, 0 trafień, redakcja, usunięcie kasuje) |
| E04 wykrywanie tylko 127.0.0.1:11434 i :1234, pusta lista bez błędu | **J tak** (porty wstrzykiwane) |
| E05 gotowe ustawienia ACP (Gemini, OpenCode, Copilot, Cursor) | **NIE zrobione.** Spec sam mówi: polecenia i argumenty „brak w źródłach"; nie wymyślałem ich. Presety zrobiłem tylko dla Ollama i LM Studio (to było w poleceniu). |
| E06 usunięcie punktu: modele znikają, agent dostaje czytelny błąd | **J tak** |

## Czego nie sprawdziłem i luki

1. **Electron i `sandbox:e2e`** (do Twojego znaku): sekcji na stronie Dostawcy nie widziałem w prawdziwym oknie; testy komponentu są na mocku.
2. **Prawdziwe Ollama / LM Studio / serwer OpenAI-compatible**: tylko atrapy serwerów. Formaty `/models` i SSE są z dokumentacji OpenAI; niektóre serwery mogą się różnić (np. brak `delta.content`, inne pola błędu).
3. **Brak narzędzi.** Agent na punkcie końcowym nie ma narzędzi programu (przeglądarka, pliki, wiadomości do zespołu), nie dostaje załączników (tylko wzmianka o ich istnieniu), nie ma steerowania w trakcie tury. To decyzja z R4 po spike'u na atrapie, nie błąd.
4. **Historia wątku w pamięci procesu.** Po restarcie programu rozmowa na punkcie zaczyna się od pustego kontekstu (zwykłe przekazanie historii działa tylko przy zmianie dostawcy). Limit pamięci: 40 wiadomości i 200 tys. znaków.
5. **Limity i użycie**: strona Usage nie pokazuje punktów końcowych; limit 429 blokuje cały punkt (wszystkie jego modele) w rejestrze modeli zapasowych, ale nie jest wyświetlany na liście limitów.
6. **Klucz przy http w sieci lokalnej** jest wysyłany jawnie (z ostrzeżeniem w UI); celowo dozwolone zgodnie z poleceniem.
7. **DNS i adresy w sieci lokalnej**: nazwa jednosegmentowa (np. `my-pc`) lub `.local/.lan/.internal` jest uznawana za sieć lokalną bez rozwiązywania DNS; nazwa może wskazywać dowolny adres. Ostrzeżenie dla innych niż loopback jest zawsze.
8. **Migracja bazy**: tabela sesji zostanie przebudowana raz przy pierwszym starcie po tej zmianie (test: sesje zostają); nie sprawdzałem na dużej, prawdziwej bazie.
9. **Brak historii Storybook** dla `EndpointsSection` (jest mock i test komponentu).
10. **Przy scaleniu z gałęzią UI Designera** (W5-UI3 zmienia `ProvidersPage.tsx`, `cosgral.css`): moja zmiana tam to 2 linie (import i `<EndpointsSection />`), klasy CSS `providers-*` są istniejące.

## Commity (gałąź `team/kk/w5-k2`)

Merge BE3 (konflikty w `app-server-client.ts`, `claude-client.ts`, `COSGRAL-CHANGES.md`: zostawiłem obie strony: `env: { ...this.#env, ...apiKeyEnv(...) }` czyli folder konta z K1 plus klucz z BE3), kontrakt + magazyn, klient i okablowanie, IPC + UI, raport. Trailer `Co-authored-by: OpenBot`, bez push i bez `--force`.
