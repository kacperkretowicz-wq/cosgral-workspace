# Raport KAPI W3-K1: więcej dostawców, modele zapasowe, użycie i limity

**Gałąź:** `team/kapi/w3-providers` (od integracji `105089d1a`)
**Worktree:** `Shared\cosgral-wt\desktop-kapi`
**Agent:** KAPI
**Data:** 13.11.2026, commity 05:22–06:03

## Werdykt

**Działa (backend, IPC i preload).** UI tylko dostaje kontrakt (niżej).
- **Nowy rodzaj dostawcy `acp`.** Każdy program mówiący Agent Client Protocol przez stdio (Gemini CLI, OpenCode, …) jest dostawcą. Osoba dodaje go poleceniem, argumentami i nazwą, a agent widzi go jako model `acp:<id>` obok modeli Codex i Claude.
- **Te same narzędzia programu co Codex i Claude, tym samym mechanizmem.** Narzędzia z tych samych `dynamicTools`, a wywołania wracają jako `item/tool/call`.
- **Modele zapasowe:** agent ma uporządkowaną listę, najwyżej 4.
  - Przy limicie użycia albo niedostępności dostawcy wiadomość idzie na następny model z listy.
  - Agent i osoba widzą, który model odpowiada: dopisek dla agenta, `BotSummary.activeModel` i zdarzenie `model-fallback`.
  - Każdy model jest próbowany najwyżej raz na wiadomość, więc nie ma pętli.
  - Błąd użytkownika nie zmienia modelu.
- **Użycie i limity dla każdego dostawcy:**
  - stan `ok` / `limited` / `unavailable` z godziną resetu (`providers.listUsage`, zdarzenie `provider-usage-changed`);
  - wiersz agenta pokazuje „Limit · resumes HH:MM” także dla Claude i ACP (wcześniej tylko Codex).

**Dowód z piaskownicy** (atrapa ACP, bez prawdziwego Gemini / OpenCode, bo ich tu nie ma):
- Agent na `acp:stub` odpowiedział i wywołał narzędzie programu `openbot__list_agents`, z prawdziwym wynikiem z programu.
- Agent na `acp:limited` (atrapa zawsze z limitem) z zapasowym `acp:stub`:
  - tura przeszła na `acp:stub`;
  - agent dostał dopisek „this turn runs on the fallback model acp:stub because acp:limited is not available now”;
  - `activeModel = acp:stub`, zdarzenie `model-fallback`;
  - limit `acp:limited` z godziną resetu jest w `listUsage`.
- Po restarcie zostały agenci ACP, model agenta i lista zapasowych.
- Bez zapasowych przy limicie: wiadomość `failed` bez pętli, a wiersz agenta pokazuje „Limit · resumes 06:14”.
- Zamknięcie czyste, 0 pozostałych procesów (także procesów atrapy ACP i mostka).

**Commity:**

| Commit | Co |
|---|---|
| `bad84c1a5` | Kontrakt: `ipc-providers.ts`, `AgentProviderId` + `"acp"`, model `acp:<id>`, `BotSummary.activeModel`, zdarzenia, IPC `providers:*`. Notka do UI (niżej) |
| `7c9c4b9fe` | `AcpAgentClient` (ACP przez stdio), mostek narzędzi programu (serwer MCP stdio), atrapa ACP `src/backend/testing/acp-stub.mjs` |
| `84613e191` | `ProviderRegistry`: agenci ACP, modele zapasowe, stan limitów i niedostępności, użycie Codex |
| `edc4d23f7` | `AgentService`: tura na ACP, wybór modelu zapasowego, ponowienie w kolejce, limit w wierszu agenta; `provider_sessions` przyjmuje `'acp'` (przebudowa tabeli, bez podbicia wersji) |
| `7fcd325a1` | `main`: rejestr, IPC `providers:*` (tylko ten komputer), zatrzymanie przy wyjściu; preload `window.openbot.providers` |
| `13175d4a1` | Poprawka z piaskownicy: nieudana próba bez tekstu nie zostawia pustej odpowiedzi w czacie |

Ostatni commit (raport i dziennik zmian) jest opisany w wiadomości w kanale.

## Zachowanie wobec zadania i parytetu (wiersz 35, część wiersza 21)

| Wymaganie | Stan | Jak / dowód |
|---|---|---|
| Rodzaj dostawcy „acp” (polecenie, argumenty, nazwa) obok codex i claude | ✓ | Typ `AcpAgentConfig`, do 16 agentów. Id: małe litery, cyfry i myślniki, model `acp:<id>`. Przechowywane w tabeli `projection_acp_agents` (ta sama baza) |
| Adapter: start procesu, sesja, tura ze strumieniem tekstu | ✓ | Jeden proces na agenta ACP, uruchamiany przy pierwszej turze: `initialize`, `session/new` (cwd + mostek MCP), `session/prompt`. Kawałki `agent_message_chunk` idą jako `item/agentMessage/delta`. Instrukcje agenta trafiają do pierwszej wiadomości sesji w `<cosgral_instructions>` |
| Narzędzia programu, ten sam mechanizm | ✓ | Mostek: mały serwer MCP stdio bez zależności (plik tymczasowy, `process.execPath` z `ELECTRON_RUN_AS_NODE=1`). Wystawia narzędzia z `dynamicTools` jako `<namespace>__<tool>`, a wywołanie idzie przez loopback HTTP z jednorazowym tokenem sesji na `item/tool/call`, czyli tę samą obsługę co u Codex. Ścieżka nie zawiera `/mcp` ani nagłówka `mcp-protocol-version`, bo Avast przepisuje takie odpowiedzi |
| Anulowanie | ✓ | `turn/interrupt` → `session/cancel`, tura `interrupted` (test) |
| Błędy | ✓ | Limit użycia (429, `data.kind: usage_limit` albo tekst „usage/rate limit, quota, too many requests”) → `usage-limit` z `resetsAt`. Niedostępność (502/503, „unavailable, overloaded, not running, could not start”, proces padł) → `unavailable`. Reszta (np. -32602 zły prompt) to błąd użytkownika, bez zmiany modelu. Nieznany agent ACP → czytelny błąd |
| Modele zapasowe: następny model przy limicie / niedostępności | ✓ | `ProviderRegistry.chooseModel`: pierwszy model z [własny, …zapasowe], który jest dostępny i nie był próbowany dla tej wiadomości. Nieudana tura z limitem albo niedostępnością wraca do kolejki (`restoreQueued(["running"])`) i startuje na następnym modelu. Działa dla każdego dostawcy: rodzaj błędu bierze się z `errorKind` (ACP) albo z tekstu błędu (Codex, Claude) |
| Kto odpowiedział | ✓ | Agent: dopisek na początku wiadomości `[COSGRAL: this turn runs on the fallback model X because Y is not available now.]`. Osoba: `BotSummary.activeModel`, zdarzenie `model-fallback { botId, fromModel, toModel, reason }` oraz `bots-changed`. Gdy własny model wróci, następna wiadomość idzie znów na niego (`model-fallback` z powrotem) |
| Bez pętli, bez zmiany przy błędzie użytkownika | ✓ | Zbiór wypróbowanych modeli na wiadomość. Gdy żaden nie został, wiadomość kończy się `failed`. Testy „never loops…” i „never switches the model on a user error” |
| Użycie i limity z godziną resetu, dla każdego dostawcy | ✓ | Codex: okna użycia, które program już czyta (`account/rateLimits/read`; 100 % blokuje do resetu), oraz zgłoszone błędy. Claude i każdy agent ACP osobno: zgłoszone błędy. Limit bez godziny resetu trwa 60 min, niedostępność 5 min. Zegar zdejmuje blokady po czasie i wysyła `provider-usage-changed`. Wiersz agenta: `AgentActivity.limit` dla dostawcy modelu, na którym agent teraz pracuje |
| Ustawienia po restarcie | ✓ (z wyjątkiem niżej) | Agenci ACP, model agenta i lista zapasowych są w bazie. **Stan limitów i `activeModel` jest tylko w pamięci:** po restarcie pierwsza wiadomość próbuje znów własnego modelu, dostaje limit i przechodzi na zapasowy. To widać w piaskownicy, przebieg 02 |
| Schemat bez podbicia wersji | ✓ | `SCHEMA_VERSION` bez zmian. Nowe tabele przez `CREATE TABLE IF NOT EXISTS`. CHECK `provider IN ('codex','claude','acp')` w `projection_provider_sessions`: idempotentna przebudowa tabeli w `migrateOpenBotDatabase` (FK wyłączone, kopia, `foreign_key_check`, indeks), test na starej tabeli z sesją i turą |

## Jak to działa

- **`AcpAgentClient`** udaje dla `AgentService` serwer aplikacji jak Codex i Claude: `thread/start|resume`, `turn/start|interrupt`, `thread/read`, `model/list`, `account/read`. Dzięki temu `AgentService` zmienia się tylko w kilku liniach: wybór klienta w `#connect`, model z `activeModel` i obsługa nieudanej tury.
- **`ProviderRegistry`** trzyma agentów ACP i listy zapasowe w bazie, a blokady w pamięci. Limit Codex i Claude dotyczy całego konta, a każdego agenta ACP osobno.
- **Sesje dostawcy idą za modelem.** Gdy agent przechodzi na model innego dostawcy, `BotStore` wiąże sesję tego dostawcy. Rozmowa w programie zostaje jedna, ale nowy dostawca nie zna historii poprzedniego (patrz „Nie zrobione”).

## Kontrakt dla UI

Plik `packages/contracts/src/ipc-providers.ts` (commit `bad84c1a5`), API w `ipc-desktop-apis.ts`:

```ts
window.openbot.providers   // opcjonalne w OpenBotDesktopApi do czasu atrapy
  listAcpAgents(): Promise<AcpAgentConfig[]>
  saveAcpAgent({ id, name, command, args? }): Promise<AcpAgentConfig>   // dodaj albo edytuj; model = `acp:${id}`
  removeAcpAgent({ id }): Promise<void>
  listUsage(): Promise<ProviderUsage[]>                // codex, claude i po jednym wpisie na agenta ACP
  getFallbackModels(botId): Promise<AgentModelId[]>
  setFallbackModels({ botId, fallbackModels }): Promise<AgentModelId[]>   // ≤ 4, bez powtórzeń

AcpAgentConfig { id, name, command, args, createdAt, updatedAt }
ProviderUsage  { provider: "codex"|"claude"|"acp", model: AgentModelId|null, state: "ok"|"limited"|"unavailable",
                 resetsAt: number|null /* sekundy Unix */, usedPercent: number|null, reason: string|null }
AgentModelId   = model Codex | model Claude | `acp:${string}`
BotSummary.activeModel?: AgentModelId          // jest, gdy agent pracuje teraz na modelu zapasowym
PROVIDER_LIMITS { acpId 40, acpName 80, command 1000, arg 2000, args 64, acpAgents 16, fallbackModels 4, … }

Zdarzenia (agent.onEvent):
  acp-agents-changed     { agents }              // zastąp listę
  provider-usage-changed { usage }               // zastąp listę
  model-fallback         { botId, fromModel, toModel, reason }
  activity-changed       // jak dotąd; activity.limit { provider, limitId, resetsAt } teraz też dla claude i acp
```

**Wskazówki dla UI:**
- **Wybór modelu** (`ProviderModelPicker`) nie zna modeli ACP. Dziś składnik pisze „Choose a model to continue” i nie pozwala wysłać wiadomości agentowi na `acp:*`. W piaskownicy wysyłałem przez `agent.sendMessage`, czyli to samo IPC co pole wiadomości. Modele ACP trzeba zbudować z `providers.listAcpAgents()` → `acp:<id>` (nazwa = `name`), bo `agent.listModels()` ich nie zwraca. `DEFAULT_MODELS` jest teraz `Partial<…>` i nie ma domyślnego modelu dla `acp`.
- **Ustawienia agenta:** lista zapasowych (do 4, kolejność ma znaczenie). Gdy jest `activeModel`, pokaż przy nazwie modelu np. „na zapasowym: X”.
- **Ustawienia programu:** lista agentów ACP z poleceniem i argumentami oraz pierścienie użycia z `listUsage()` (`usedPercent` jest tylko dla Codex).
- **Błąd nieudanej próby** („Usage limit reached…”) zostaje w czacie jako zwykły dymek błędu, także gdy tura przeszła na zapasowy model. Można go przyciszyć po zdarzeniu `model-fallback`.
- **Atrapa UI** (`mock-openbot.ts`) nie ma jeszcze `providers.*`.

## Testy

| Polecenie | Wynik |
|---|---|
| `bun run typecheck` (contracts, node, renderer, storybook, api) | exit 0 |
| Nowe testy: `ipc-providers` 3, `acp-client` 5, `provider-registry` 5, `provider-sessions-migration` 2, `provider-inputs` 3, `agent-service` (W3) 5 | zielone |
| Całe `bun run test` na końcowym kodzie (start 06:05, po `13175d4a1`) | **123 pliki, 872/872**, exit 0 (log `logs\w3-providers-test-full.log`). Integracja miała 849 |
| Biome na zmienionych plikach | 0 błędów; poprawki automatyczne tylko w moich liniach |

**TDD:**
- Kontrakt, klient ACP, rejestr, migracja i parsery zaczynały od testu.
- Testy `AgentService` były najpierw czerwone na kilka sposobów:
  - zapis sesji padał na CHECK `provider IN ('codex','claude')`;
  - potem na odczycie sesji „Invalid provider column.”;
  - potem limit nie trafiał do wiersza agenta.
- Pusta odpowiedź z nieudanej próby wyszła w piaskownicy. Dostała dwa czerwone testy (`acp-client`, `agent-service`), potem poprawkę `13175d4a1`.

## Piaskownica

Profil `Shared\cosgral-data\desktop-kapi\sandbox-w3\home` (osobne USERPROFILE, APPDATA, LOCALAPPDATA i TEMP, bez zmiennych `CLAUDE*` i `OPENBOT*`). Codex to atrapa z K1.

Atrapa ACP to `src/backend/testing/acp-stub.mjs`, uruchamiana przez `Shared\tools\node\node.exe`. Ma dwóch agentów ACP: `stub` i `limited` (`--always-limit`). Steruje `kapi-drive.mjs` z nowymi krokami `w3agents`, `w3model`, `w3send`, `w3record`, `w3state`. Prawdziwego Codex, Claude, Gemini ani OpenCode nie używałem.

| Przebieg | Kroki | Wynik | Dowód (`evidence\w3\…`) |
|---|---|---|---|
| `01-acp-tool-fallback` (świeży profil) | Nowy agent → dwóch agentów ACP → model `acp:stub` → „TOOL openbot__list_agents” → model `acp:limited` + zapasowy `acp:stub` → „hello after the limit” | ✓ Odpowiedź po ok. 1 s: `[instructions received] ACP stub (not a model): openbot__list_agents -> ok: {"agents":[{"id":"bot-…","name":"New agent",…}]}`. Druga wiadomość: `provider-usage-changed` (`acp:limited` `limited`, reset +10 min), `turn-completed failed`, `model-fallback acp:limited → acp:stub`, odpowiedź atrapy z dopiskiem o modelu zapasowym, `activeModel = acp:stub`. W czacie jest jedna odpowiedź, bez pustej | `w3-01-tool.png`, `w3-02-fallback.png`, `drive.log` |
| `02-restart-all-limited` (ten sam profil) | Restart → stan → „hello again” → model `acp:limited` bez zapasowych → „nobody can answer” | ✓ Po restarcie zostali agenci `stub` i `limited`, model `acp:limited` i zapasowy `acp:stub`. „hello again” przeszło znów na zapasowy (limit jest w pamięci). Bez zapasowych: wiadomość `failed` po ok. 70 ms, bez pętli i bez `model-fallback`. Wiersz agenta: **„Limit · resumes 06:14”** (`data-activity="limited"`) | `w3-03-after-restart.png`, `w3-05-row.png`, `drive.log` |

**Zamykanie:** oba przebiegi zamknęły się czysto (`close: clean`, `leftoverProcesses: 0`), także procesy atrapy ACP i mostka. Profil `COSGRAL Workspace Dev` właściciela był nietknięty (`absent` przed i po).

## Nie zrobione / nie sprawdzone

- **UI:** wybór modeli ACP, lista zapasowych, ustawienia agentów ACP, pierścienie użycia, atrapa `providers.*` (patrz kontrakt).
- **Prawdziwy agent ACP** (Gemini CLI `--experimental-acp`, OpenCode `acp`): nie ma ich na tym komputerze, więc tylko atrapa.
  - Możliwe różnice: logowanie agenta (`authenticate`), inne pola `session/update` (myśli, plany, wywołania narzędzi agenta są pomijane, liczy się tylko tekst), wersja protokołu.
- **Historia ACP po restarcie:** nie ma `session/load`. Po restarcie programu agent ACP zaczyna nową sesję, a rozmowa w programie zostaje.
  - To samo przy przejściu na model innego dostawcy: nowy dostawca nie zna wcześniejszej rozmowy.
- **Steer** (dopisanie do trwającej tury) dla ACP: nie ma. Wiadomość czeka w kolejce.
- **Zatwierdzenia ACP** (`session/request_permission`): program zgadza się automatycznie, bez karty zatwierdzenia. Agent ACP działa z uprawnieniami swojego procesu w folderze agenta.
- **Stan limitów po restarcie:** tylko w pamięci (wyżej).
- **Prawdziwe limity Claude:** fallback z Claude działa po tekście błędu („usage limit”, „rate limit” …). Nie sprawdzony na prawdziwym koncie.
- **Spakowany program:** mostek narzędzi uruchamia `process.execPath` w trybie Node (`ELECTRON_RUN_AS_NODE=1`). Działa w trybie dev; w paczce NSIS nie sprawdzone (instalatora nie uruchamiałem).
- **Konta wielu dostawców** (`ProviderAccountList` z 0.68), Grok i Cursor jako osobni dostawcy: tylko przez ACP, jeśli mają tryb ACP.

## Pliki poza repo

`Shared\cosgral-data\desktop-kapi\`:
- `kapi-drive.mjs`: kroki W3,
- `sandbox-w3\`, `evidence\w3\`, `logs\w3-providers-test-full.log`, `w3-full-test.log`.

Program nie jest uruchomiony. Bez push.
