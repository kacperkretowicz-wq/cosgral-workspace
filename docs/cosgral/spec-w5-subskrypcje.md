# W5: subskrypcje bez terminala. Projekt techniczny

Status: **projekt, bez kodu.** Implementacja zaczyna się dopiero po potwierdzeniu bramki G1 przez właściciela. Źródło: dokument „luki wobec OpenBot 0.70” (`Shared\cosgral-docs\luki-070.txt`, krok 2 · W5 i bramka G2) oraz obecny kod COSGRAL. Kodu OpenBota nowszego niż 0.1.11 (`a6fe240`) nie czytałem. Zachowanie 0.70 opisze Tester w `docs/cosgral/spec-w5.md` (W5-T1); ten plik mówi, **jak** to zbudować u nas.

Autor: Backend Expert (W4-BE4), 16.11.2026.

## 1. Cel i bramka

**Bramka G2:** obaj wspólnicy podpinają swoje subskrypcje bez terminala, agent działa na każdym koncie, przejście przy limicie jest potwierdzone.

Co trzeba mieć, żeby G2 przeszło:
1. **CLI zarządzane:** na czystym Windows bez Codex i Claude jedno kliknięcie pobiera oficjalne CLI, sprawdza je i agent rusza.
2. **Logowanie w aplikacji:** konto ChatGPT dla Codex i konto Claude, wylogowanie, stan konta w UI.
3. **Klucze API** OpenAI i Anthropic w `safeStorage`, przekazywane tylko procesowi CLI.
4. **Wiele kont na dostawcę:** osobny folder stanu CLI dla każdego konta, wybór konta per agent, pula z przejściem przy limicie.
5. **Własne endpointy** zgodne z OpenAI oraz wykrywanie Ollama i LM Studio.
6. **Do 8 modeli zapasowych** (dziś 4).
7. **UI:** strona Dostawcy, krok „połącz” w onboardingu, użycie (okna 5 h i tygodniowe), karta limitu w czacie.

## 2. Stan dziś (punkt wyjścia)

- **Wykrywanie CLI:** `src/backend/cli.ts` szuka `codex` i `claude` w `PATH` i w znanych folderach, wersję sprawdza przez `runCliWithRetry` (20 s + ponowienie). Logowania nie robi; jest tylko podpowiedź „run `codex login`”.
- **Stan konta:**
  - Codex: `account/read` App Servera;
  - Claude: `claude auth status --json` (`readClaudeAuthStatus`).
- **Jedno źródło stanu dostawcy:** `AgentStatus.providers` (silnik), które silnik przekazuje do `ProviderRegistry` (W4-BE1).
- **Kontrakt dostawców** (`ipc-providers.ts`):
  - agenci ACP: lista, zapis, usunięcie;
  - `listUsage`;
  - modele zapasowe (do 4, `PROVIDER_LIMITS.fallbackModels`).
- **Sekrety:** `electronSecretBox()` w `src/main/index.ts` (`safeStorage`), dziś dla Vault i MCP.
- **CLI czytają logowanie** z domyślnego folderu (`~\.codex`, `~\.claude`) albo z `CODEX_HOME` i `CLAUDE_CONFIG_DIR`. Te zmienne są kluczem do wielu kont bez kopiowania danych logowania.

## 3. Podział na zadania (kto, co, kolejność)

Limit sprzętu: najwyżej 2 agentów naraz. Kolejność uwzględnia zależności.

| Kolejność | ID | Kto | Zadanie | Zależy od | Gotowe, gdy |
|---|---|---|---|---|---|
| 0 | W5-T1 | Tester (albo KK, jeśli Tester milczy) | Spec zachowania 0.70 własnymi słowami, kryteria odbioru | — | `docs/cosgral/spec-w5.md` |
| 1 | W5-BE1 | Backend | CLI zarządzane: katalog wersji, pobranie, SHA-256, przypięcie wersji, aktualizacja, usunięcie | T1 (kryteria) | czysty profil bez CLI: „Pobierz” → agent rusza |
| 2 | W5-BE2 | Backend | Logowanie i wylogowanie w aplikacji (Codex: ChatGPT; Claude: konto Claude), stan konta | BE1 | logowanie i wylogowanie bez terminala |
| 3 | W5-K1 | KAPI | Konta: folder stanu na konto (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`), wybór konta per agent, pula z przejściem przy limicie | BE2 | dwa konta Claude na jednym komputerze, przejście przy limicie |
| 3 | W5-BE3 | Backend | Klucze API w `safeStorage`, tylko w zmiennych środowiska procesu CLI | BE2 (wzór konta) | klucz nigdy jawnym tekstem w logach ani bazie; test |
| 4 | W5-K2 | KAPI | Endpointy OpenAI-compatible, Ollama, LM Studio, lista modeli, gotowe ustawienia ACP | K1 (model konta) | agent działa na atrapie serwera; Ollama, gdy jest |
| 4 | W5-BE4 | Backend | Do 8 modeli zapasowych, przejście przed pierwszą akcją, powrót po resecie | K1 (pula) | testy błędu limitu i sieci |
| 5 | W5-UI1 | UI Designer | Strona Dostawcy (pobierz, połącz, rozłącz, konta, modele), krok „połącz” w onboardingu | BE1, BE2, K1 (kontrakty) | obaj wspólnicy podpinają sami |
| 5 | W5-UI2 | UI Designer | Użycie: okna 5 h i tygodniowe, pierścienie na szynie, limit przy wyborze modelu, karta limitu | BE4 | test UI i zrzut |
| 6 | W5-T2 | KK + właściciel | Odbiór na czystym Windows i prawdziwych kontach | wszystko | raport z dowodami, bramka G2 |

Zasada dla UI: Backend oddaje kontrakt (§4) **przed** implementacją silnika, żeby UI mogło ruszyć na atrapach równolegle.

## 4. Kontrakty IPC do dodania (nazwy i kształty)

Wszystko w `packages/contracts/src/ipc-subscriptions.ts`. Metody opcjonalne w `window.openbot` (`subscriptions?`), dopóki wszystkie atrapy ich nie mają. Tylko ten komputer; zdalny serwer i telefon dostają błąd, jak przy `agent:retry-start`.

### 4.1 CLI zarządzane (W5-BE1)

```ts
type ManagedCliId = "codex" | "claude";
type ManagedCliSource = "managed" | "system" | "none"; // pobrane przez COSGRAL, znalezione w systemie, brak

interface ManagedCliState {
  id: ManagedCliId;
  source: ManagedCliSource;
  version: string | null;        // zainstalowana wersja
  pinnedVersion: string | null;  // przypięta w COSGRAL (null = najnowsza z katalogu)
  latestVersion: string | null;  // z katalogu wersji, gdy znany
  phase: "idle" | "downloading" | "verifying" | "installing" | "removing" | "error";
  progress: { receivedBytes: number; totalBytes: number } | null;
  error: string | null;          // czytelny powód, bez ścieżek z nazwą profilu w logach
}

// kanały
"subscriptions:list-cli"     () => ManagedCliState[]
"subscriptions:install-cli"  ({ id, version? }) => ManagedCliState   // pobranie + SHA-256 + rozpakowanie
"subscriptions:update-cli"   ({ id }) => ManagedCliState
"subscriptions:remove-cli"   ({ id }) => ManagedCliState              // tylko "managed"; nigdy systemowe
"subscriptions:pin-cli"      ({ id, version: string | null }) => ManagedCliState
// zdarzenie
{ type: "managed-cli-changed"; state: ManagedCliState }
```

**Zasady:**
- Pobieranie tylko z oficjalnych źródeł zapisanych w kodzie (katalog wersji z sumami SHA-256 w repo, aktualizowany commitem). Nigdy z adresu podanego przez agenta.
- Pobranie wymaga karty potwierdzenia w Needs you (jak model głosu w W3).
- Folder: `%LOCALAPPDATA%\COSGRAL Workspace\cli\<id>\<version>\`. Nie dotyka systemowego CLI.
- Kolejność wykrywania (rozszerzenie `cli.ts`): `OPENBOT_*_PATH` → zarządzane (przypięte) → `PATH` → znane foldery.

### 4.2 Konta i logowanie (W5-BE2, W5-K1)

```ts
type ProviderAccountKind = "subscription" | "api-key";
interface ProviderAccount {
  id: string;                    // "acc-…", stały
  provider: "codex" | "claude";
  kind: ProviderAccountKind;
  label: string;                 // nadany przez osobę, np. „Praca”
  email: string | null;          // z CLI po zalogowaniu; nigdy z pliku logowania
  plan: string | null;
  state: "signed-in" | "signed-out" | "signing-in" | "checking" | "error";
  message: string | null;
  isDefault: boolean;
  inPool: boolean;               // bierze udział w przechodzeniu przy limicie
}

"subscriptions:list-accounts"   () => ProviderAccount[]
"subscriptions:add-account"     ({ provider, kind, label }) => ProviderAccount   // tworzy folder stanu
"subscriptions:sign-in"         ({ accountId }) => { state: "opened" | "signed-in" | "failed"; message: string | null }
"subscriptions:sign-out"        ({ accountId }) => ProviderAccount
"subscriptions:remove-account"  ({ accountId }) => void   // potwierdzenie w oknie; usuwa folder stanu konta
"subscriptions:update-account"  ({ accountId, label?, isDefault?, inPool? }) => ProviderAccount
"subscriptions:set-agent-account" ({ botId, accountId: string | null }) => BotSummary  // null = domyślne
{ type: "provider-accounts-changed"; accounts: ProviderAccount[] }
```

**Logowanie bez terminala.** Uruchamiamy oficjalne polecenie logowania CLI jako proces potomny z `CODEX_HOME` albo `CLAUDE_CONFIG_DIR` ustawionym na folder konta. Przeglądarkę systemową otwiera samo CLI (OAuth). Program śledzi tylko wynik (kod wyjścia, potem `account/read` lub `auth status`).
- **Nigdy nie czytamy plików logowania** i ich nie kopiujemy.
- Gdzie CLI wymaga wklejenia kodu, pole w oknie przekazuje go do stdin procesu i nie zapisuje go.
- Dokładne polecenia i flagi trzeba sprawdzić na aktualnych CLI (ryzyko R2).

**Folder konta:** `%APPDATA%\COSGRAL Workspace\accounts\<accountId>\` (w nim stan CLI). Konto „systemowe” (istniejące `~\.codex`, `~\.claude`) można dodać jako odwołanie bez kopiowania: `kind: "subscription"`, folder wskazany na istniejący, z flagą „nie usuwaj przy usuwaniu konta”.

### 4.3 Klucze API (W5-BE3)

```ts
"subscriptions:save-api-key"   ({ accountId, key: string }) => ProviderAccount   // key tylko wejście, nigdy wyjście
"subscriptions:clear-api-key"  ({ accountId }) => ProviderAccount
```

- Zapis: `electronSecretBox()` (`safeStorage`, DPAPI na Windows), szyfrogram w bazie (`projection_provider_accounts`, kolumna `secret_ciphertext`).
- Odszyfrowanie tylko w procesie głównym, tuż przed startem CLI, jako zmienna środowiska procesu (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`). Nigdy w argumentach polecenia, w zdarzeniach, logach ani rendererze.
- Test: przechwycone zdarzenia, logi diagnostyczne i baza nie zawierają klucza (szukanie ciągu).

### 4.4 Endpointy i modele lokalne (W5-K2)

```ts
interface ModelEndpoint {
  id: string;
  label: string;
  kind: "openai-compatible" | "ollama" | "lmstudio";
  baseUrl: string;               // tylko http(s); loopback domyślnie; inny host z ostrzeżeniem
  hasKey: boolean;               // klucz w safeStorage jak w 4.3
  models: string[];              // z /v1/models albo /api/tags
  state: "ok" | "unreachable" | "checking";
}
"subscriptions:list-endpoints"   () => ModelEndpoint[]
"subscriptions:save-endpoint"    ({ id?, label, kind, baseUrl, key? }) => ModelEndpoint
"subscriptions:remove-endpoint"  ({ id }) => void
"subscriptions:detect-local"     () => ModelEndpoint[]   // sprawdza 127.0.0.1:11434 (Ollama) i :1234 (LM Studio)
```

Model endpointu ma identyfikator `endpoint:<id>/<model>` (wzór jak `acp:<id>`). Wykonanie przez adapter ACP albo przez prosty klient Chat Completions; decyzja w W5-K2 po spike'u (R4).

### 4.5 Modele zapasowe (W5-BE4)

- `PROVIDER_LIMITS.fallbackModels`: 4 → 8. Kontrakt bez zmian kształtu.
- Nowe: `FallbackPolicy { switchBeforeFirstAction: true; returnAfterReset: boolean }` w `providers:get/set-fallback-models` jako pole opcjonalne.
- Pula kont (K1) i modele zapasowe to dwie warstwy. Najpierw inne konto tego samego modelu z puli, potem następny model zapasowy.

## 5. Ryzyka

| # | Ryzyko | Skutek | Jak ograniczyć |
|---|---|---|---|
| R1 | Warunki planów (ChatGPT, Claude) mogą zabraniać automatyzacji lub współdzielenia kont | utrata konta | właściciel sprawdza warunki przed W5-K1; pula tylko z kont właściciela; bez dzielenia konta między osoby |
| R2 | Polecenia logowania CLI zmieniają się między wersjami | logowanie przestaje działać | przypięta wersja CLI (BE1), test dymny po każdej aktualizacji, czytelny błąd i obejście „zaloguj w terminalu” |
| R3 | Pobieranie plików wykonywalnych | podmiana, złośliwy plik | tylko oficjalne źródła w kodzie, SHA-256 z repo, karta potwierdzenia, folder per wersja, brak uprawnień administratora |
| R4 | Endpointy OpenAI-compatible różnią się (narzędzia, strumień) | agent bez narzędzi | najpierw spike na atrapie serwera; endpoint bez narzędzi oznaczony „tylko rozmowa” |
| R5 | Klucz API wycieka do logów lub zdarzeń | wyciek sekretu | klucz tylko w env procesu; test szukania ciągu; maskowanie w `emitError` |
| R6 | Wiele folderów stanu CLI zajmuje miejsce i RAM (procesy na konto) | wolny komputer (1,3 GB wolnego) | jeden proces CLI na aktywne konto, wyłączanie bezczynnych, limit kont w puli (np. 3) |
| R7 | Przejście przy limicie powtarza pracę z efektami ubocznymi | podwójne akcje | przejście tylko przed pierwszą akcją tury (jak w BE4); po akcji karta „limit, kontynuować na…?” |
| R8 | Odinstalowanie zostawia dane, a dokument W4-H2 mówi „nic nie zostaje” | niespójność z planem | decyzja właściciela (§6, punkt 1) |

## 6. Decyzje właściciela (przed startem W5)

1. **Dane po odinstalowaniu.** Lider zdecydował, że zostają (`deleteAppDataOnUninstall: false`, W4-BE4). Dokument przy W4-H2 mówi „po odinstalowaniu nic nie zostaje w profilu”. Do potwierdzenia, plus czy chcemy akcji „Usuń moje dane” w programie.
2. **Pula kont.** Czy dozwolona i ile kont (R1). Czy oba wspólniki mają osobne konta, czy jedno wspólne.
3. **Klucze API.** Czy używamy płatnych kluczy obok subskrypcji, kto płaci, jaki limit w panelu dostawcy.
4. **Konta testowe.** Osobne konta subskrypcyjne do testów i kto loguje (dokument: osobny profil Windows, loguje człowiek).
5. **Źródła CLI.** Zgoda na pobieranie oficjalnych CLI przez program i przypinanie wersji (aktualizacja tylko po kliknięciu, czy automatycznie).
6. **Ollama i LM Studio.** Czy instalujemy Ollamę na komputerze testowym (dziś jej nie ma) do tanich testów dymnych.

## 7. Jak testować bez przeglądania logowań

- **Atrapy CLI w testach jednostkowych** (`writeFakeCli`): logowanie zwraca kod wyjścia i JSON stanu. Test sprawdza tylko zachowanie programu.
- **Folder konta jako czarna skrzynka:** testy tworzą folder w katalogu tymczasowym i sprawdzają, że program przekazał `CODEX_HOME`/`CLAUDE_CONFIG_DIR` do procesu. Nigdy nie otwierają plików wewnątrz.
- **Stan logowania prawdziwego CLI** sprawdzamy wyłącznie poleceniami, które wypisują stan bez sekretów: `codex login status`, `claude auth status --json` (tylko `loggedIn`). Wynik filtrujemy: e-mail maskowany, w raportach repo bez e-maili.
- **Klucze API:** testy na sztucznym kluczu (`sk-test-…`) i szukanie tego ciągu w bazie, logach, zdarzeniach i rendererze (musi być 0 trafień). Prawdziwego klucza nikt z agentów nie wpisuje.
- **Endpointy:** lokalna atrapa serwera Chat Completions w teście (loopback, losowy port). Ollama tylko jako opcjonalny test dymny, gdy jest zainstalowana.
- **Prawdziwe konta (W5-T2):** piaskownica (osobne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`), logowanie robi człowiek w oknie programu, agenci tylko odczytują stan. Zużycie: najwyżej 4–5 krótkich tur na konto, jak w W4-T2.
- **Czysty Windows (BE1, T2):** osobne konto Windows albo maszyna wirtualna. Instalator i pobranie CLI tylko tam, nigdy na zwykłym profilu właściciela.

## 8. Poza zakresem W5

Komunikatory, katalog 200+ aplikacji, serwer na Linuksie, klient webowy, SSO (decyzja lidera 1 w PLAN-W4). Pierścienie użycia na szynie i karta limitu w czacie są w W5-UI2. Router wielu subskrypcji per klient agencji (przestrzenie klientów, budżety) to W8.
