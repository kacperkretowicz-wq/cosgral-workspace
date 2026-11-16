# W5-BE3: klucze API dostawców w bezpiecznym magazynie

Gałąź `team/backend/w5-be3` (baza: `codex/cosgral-desktop` @ `f10e0ce89`), bez push. Wszystko w piaskownicy, tylko fałszywe klucze (`test-key-0000…`), bez Electrona i bez `sandbox:e2e`.

## Co działa

- **Magazyn** `src/backend/api-key-store.ts`: jeden klucz na dostawcę (Codex = OpenAI, Claude = Anthropic) w tabeli `projection_provider_api_keys` (`CREATE TABLE IF NOT EXISTS`, schemat bazy bez zmian). Klucz jest szyfrowany przez `electronSecretBox()` (ta sama co Vault i MCP, `safeStorage`/DPAPI). Bez szyfrowania systemu klucz **nie jest zapisywany** (jasny błąd). Nic o kluczu nie trafia do dziennika zdarzeń (zapis zwykłym SQL, bez `dispatch`).
- **Odpowiedzi** (`ApiKeyEntry`): tylko `maskedKey` ("••••" + ostatnie 4 znaki; klucz krótszy niż 12 znaków nie pokazuje żadnego), `status` (`ok` | `rejected` | `unchecked`), `message`, `checkedAt`, `updatedAt`. Klucz jest tylko wejściem `set`.
- **Sprawdzenie połączenia** (`check`, tylko po kliknięciu): `GET https://api.openai.com/v1/models` (nagłówek `Authorization: Bearer`) albo `GET https://api.anthropic.com/v1/models` (`x-api-key`, `anthropic-version: 2023-06-01`). Adresy są stałe w kodzie. `401`/`403` = `rejected`; `2xx` = `ok`; `429`, `5xx`, brak sieci = `unchecked` z powodem (to nie jest odrzucenie klucza). Przekierowania wyłączone (`redirect: "error"`), limit 15 s. Odpowiedź starego klucza nie oznacza nowego (wersja zapisu).
- **Do procesu dostawcy** (`src/backend/api-key-env.ts`): `apiKeyEnv(provider)` daje `{ OPENAI_API_KEY }` albo `{ ANTHROPIC_API_KEY }` i jest dopisywane **tylko** do `env` startu jednego procesu: Codex app-server (`app-server-client.ts`, `spawn`) i Claude (`claude-client.ts`, opcja `env` zapytania). Nigdy do `process.env` programu, argumentów, zdarzeń ani rendererza.
- **Redakcja** (`redactApiKeys`): każdy zapisany klucz jest zamieniany na `[redacted]` w diagnostyce CLI (`redactDiagnostic`) i w komunikacie zdarzenia `error` (`AgentService.#emitError`).

## Kontrakt dla UI (`packages/contracts/src/ipc-api-keys.ts`)

`window.openbot.apiKeys?` (opcjonalne, jak `subscriptions?`):

| Metoda | Wejście | Odpowiedź | Uwagi |
|---|---|---|---|
| `list()` | — | `ApiKeyEntry[]` (zawsze 2: `codex`, `claude`) | `maskedKey: null` = brak klucza |
| `set({provider, key})` | klucz 8–512 znaków, jedno słowo, ASCII | `ApiKeyEntry` | stan po zapisie: `unchecked`; nie sprawdza sam; zastępuje poprzedni klucz |
| `remove({provider})` | — | `ApiKeyEntry` (bez klucza) | nic nie robi, gdy klucza nie było |
| `check({provider})` | — | `ApiKeyEntry` | czeka na sieć (do 15 s); odrzucony klucz to `status: "rejected"`, nie wyjątek; wyjątek tylko, gdy nie ma klucza |

`ApiKeyEntry = { provider: "codex"|"claude"; maskedKey: string|null; status: "ok"|"rejected"|"unchecked"; message: string|null; checkedAt: string|null; updatedAt: string|null }` (zgodne z polami, na których UI3 buduje mock).

- **Brak zdarzenia** (`api-keys-changed` nie istnieje): odpowiedź każdej metody wystarcza; po `set`/`remove`/`check` UI podmienia wiersz.
- **Stan „sprawdzanie”** UI trzyma sam (od kliknięcia do odpowiedzi `check`).
- **Pole klucza**: `type="password"`, po `set` czyścić. Błędy `set` (zły format, brak szyfrowania w systemie) mają czytelny angielski tekst bez klucza.
- **Mock**: `src/renderer/stories/mock-api-keys-api.ts` (`createMockApiKeysApi(delayMs)`), podpięty w `mock-openbot.ts` jako `apiKeys`. Reguła dema: klucz zaczynający się od `bad` jest odrzucany przy `check`, inne są ok.
- **Kanały IPC**: `api-keys:list|set|remove|check` (`IPC_CHANNELS.apiKeys*`), tylko lokalny komputer.

Skutek dla agentów: klucz zapisany dla dostawcy jest wstrzykiwany do każdego nowego procesu tego dostawcy (zmienna środowiska ma pierwszeństwo przed logowaniem subskrypcją w CLI). Zmiana klucza działa przy **następnym starcie procesu** dostawcy (działający proces ma stare środowisko).

## Dowód

| Co | Wynik |
|---|---|
| `src/backend/api-key-store.test.ts` | 24/24: lista, zapis i maska, krótki klucz, przycięcie i zastąpienie, odczyt tylko jako zmienna, trwałość po restarcie, usunięcie, **brak jawnego tekstu i zwykłego base64 w plikach `openbot.db`/WAL**, brak w `orchestration_events`, brak szyfrowania = brak zapisu, błąd boxa nie cytuje klucza, nieczytelny szyfrogram = brak zmiennej, `check` (OpenAI, Anthropic, 401/403 = rejected, brak sieci, 429/500, brak klucza = brak połączenia, wymiana klucza w trakcie, `redirect: "error"`), **brak klucza w `console.*`**, rejestr i redakcja |
| `src/backend/app-server-client-api-key.test.ts` | 5/5, na prawdziwym procesie atrapy CLI: klucz jest w `OPENAI_API_KEY` procesu, nie w argumentach, nie w `process.env` programu; klucz Claude nie trafia do Codex; redakcja diagnostyki. Mutacja (cofnięcie wstrzyknięcia) → czerwony |
| `src/backend/claude-client.test.ts` (+1) | klucz tylko w `options.env` procesu Claude |
| `src/backend/agent-service.test.ts` (+1) | ostrzeżenie CLI z kluczem nie trafia do zdarzenia `error`. Mutacja (cofnięcie redakcji) → czerwony |
| `packages/contracts/src/ipc-api-keys.test.ts` | 10/10 (strażnicy, parser klucza, błąd bez klucza) |
| `src/preload/api-keys-api.test.ts` | 2/2; `src/renderer/stories/mock-api-keys-api.test.ts` 2/2 |
| Zbiorczy przebieg (`packages/contracts`, `src/preload`, `src/main`, klienci CLI, cały `agent-service.test.ts`, `api-key*`, `src/renderer/stories`) | **71 plików, 406/406 testów zielone** (315 s) |
| `biome check .` | zielone (743 plików) |
| `typecheck:node`, `typecheck:renderer`, `typecheck` kontraktów | zielone |

## Czego NIE sprawdziłem

- **Electrona i `sandbox:e2e`** (zakaz do znaku lidera). Rejestracja IPC (`src/main/api-keys-ipc.ts`, `registerApiKeysIpc`) i tworzenie `ApiKeyStore` w `src/main/index.ts` są sprawdzone tylko typami i testem preload, nie w działającym oknie. **Prawdziwy `safeStorage` (DPAPI)** nie był użyty: testy mają odwracalną atrapę boxa.
- **Prawdziwych kluczy i prawdziwych endpointów OpenAI/Anthropic**: `check` jest testowany na atrapie `fetch`. Nie wiem, czy `/v1/models` zwraca 401 (a nie np. 403/404) dla każdego typu klucza (np. klucz projektu bez uprawnień do listy modeli mógłby dać 403 i zostać oznaczony `rejected`).
- **Czy prawdziwy Codex CLI używa `OPENAI_API_KEY`** (może preferować zapisane logowanie ChatGPT albo oczekiwać `CODEX_API_KEY`/`codex login --with-api-key`) i **czy Claude Code z `ANTHROPIC_API_KEY` omija logowanie subskrypcją** (zakładam, że tak, jak w dokumentacji CLI). Wstrzyknięcie zmiennej jest sprawdzone na atrapie procesu, nie na prawdziwym CLI.
- **Ścieżki ACP i inne procesy** (np. kolejne `spawn` pomocnicze CLI w `provider-accounts.ts`, test `codex login status`): nie dostają klucza (celowo), ale nie sprawdzałem, czy któraś z nich powinna.
- **Redakcja w pozostałych miejscach**: pokryte diagnostyka CLI i zdarzenie `error`; nie przeszedłem wszystkich innych ścieżek logowania (np. błędy rzucane z silnika tury w innej formie niż `#emitError`).
- **Wiele kluczy na dostawcę** i klucze na konto z puli (spec 4.3 mówi o kluczu per konto; tu jest jeden klucz na dostawcę, zgodnie z poleceniem „dostawca z kluczem zamiast konta”). Do rozstrzygnięcia z K1, jeśli klucz ma wchodzić do puli.
- Pełnego `bun run check` i `bun run test`.

## Decyzje i uwagi do scalenia

- **Jeden klucz na dostawcę, nie na konto.** Kontrakt `ProviderAccount` z BE2 nie ma pola `kind`, więc nie dopisywałem `save-api-key` na koncie; to osobny `apiKeys`. Jeśli K1 zechce klucze w puli, trzeba rozszerzyć.
- **Pierwszeństwo klucza**: zapisany klucz jest wstrzykiwany zawsze (także `rejected`); żeby wrócić do subskrypcji, trzeba go usunąć. Można dodać przełącznik „używaj klucza” później.
- **Konflikty przy scaleniu z W5-K1 (KK)**: K1 zmienia te same dwa klienty (`app-server-client.ts`, `claude-client.ts`) i `agent-service.ts`, żeby dodać zmienną środowiskową konta. Moja zmiana to jedna linia `env` w każdym kliencie (`{ ...process.env, ...apiKeyEnv(...) }`), jedna linia importu i jedna linia w `#emitError`. Przy konflikcie zostawić obie zmienne (konto + klucz).
- **Użycie `npx biome`**: raz uruchomiłem `npx biome`, które nie znalazło lokalnego pliku i pobrało obcy pakiet `biome@0.3.3` z npm do pamięci podręcznej npx (poza repozytorium; repo bez zmian, dalej używałem `node_modules/.bin/biome.exe`). Warto wyczyścić pamięć podręczną npx.
