# Raport KAPI W2-K2: serwery MCP

**Gałąź:** `team/kapi/w2-mcp` (od integracji `4d8344e75`)
**Worktree:** `Shared\cosgral-wt\desktop-kapi`
**Agent:** KAPI
**Data:** 13.11.2026, ok. 02:50–03:30

## Werdykt

**Serwery MCP działają.** Osoba dodaje serwer (stdio albo streamable HTTP), program się z nim łączy i pokazuje stan oraz listę narzędzi. Narzędzia dostaje każdy agent, który ma serwer włączony: Codex i Claude, w rozmowach 1:1 i w turach kanału. Wyłączenie przełącznika zabiera narzędzia od następnej tury, a wywołanie wyłączonego albo usuniętego serwera kończy się jasnym błędem. Sekrety są szyfrowane `safeStorage` i nie trafiają do bazy jawnym tekstem ani do logów.

**Dowód z piaskownicy:** agent na atrapie Codex woła narzędzie lokalnego serwera MCP (stdio) i dostaje wynik. Po wyłączeniu przełącznika narzędzia nie ma. Po restarcie programu lista serwerów i ustawienie przełącznika zostają.

**Commity:**

| Commit | Co |
|---|---|
| `81218c976` | Kontrakt MCP (`ipc-mcp.ts`, IPC, zdarzenia) |
| `3af9fb4f8` | Magazyn z szyfrowanymi sekretami, przełącznik agenta, menedżer połączeń, serwer testowy |
| `5a27f3004` | Narzędzia dla Codex i Claude (także w turach kanału), `main`, IPC, preload |

Ostatni commit (raport i dziennik zmian) jest opisany w wiadomości w kanale.

## Zachowanie wobec spec-w2 §2 i decyzji lidera nr 2

| # | Zachowanie | Stan | Jak / dowód |
|---|---|---|---|
| 2.1 | Dodanie serwera (komenda / adres / transport), lista ze stanem, po restarcie nadal jest | ✓ | `McpStore` w SQLite. Stany: `checking` → `available` / `needs-login` / `error`. Dowód: `mcp-store.test.ts`, `mcp-manager.test.ts`, piaskownica `02-mcp-restart` |
| 2.2 | Logowanie: stan „wymaga logowania”, jasna odmowa, tokeny nie trafiają do logów | częściowo | Odpowiedź 401 lub 403 ustawia `needs-login` z czytelnym komunikatem. Wywołanie takiego serwera agent dostaje jako błąd „needs a login; ask the person to sign in…”. Token jako nagłówek-sekret (np. `Authorization`). **Brakuje karty logowania OAuth** (przekierowanie przeglądarki, `finishAuth`, odświeżanie tokenu); dziś osoba wpisuje token ręcznie jako sekret i robi `reconnect` |
| 2.3 | Narzędzia serwera widoczne dla agentów w kolejnej turze | ✓ | Przestrzeń `mcp_<nazwa>` w `dynamicTools`. Zmiana zestawu narzędzi agenta (dodanie, usunięcie, ponowne połączenie, przełącznik) wznawia wątek przed następną turą. Claude dostaje serwer pośredniczący, a przy zmianie `setMcpServers` |
| 2.4 | Zgoda na narzędzie (Ask first / Always allow) | **nie** | Wywołania MCP idą bez karty zgody, jak inne narzędzia dynamiczne. Do zrobienia osobno, przez istniejący mechanizm zatwierdzeń |
| 2.5 | Certyfikaty systemowe za korporacyjnym TLS | **nie** | Klient HTTP to `fetch` z Node, czyli bez magazynu certyfikatów Windows. Uwaga z tego komputera: patrz „Odkrycie: Avast” |
| 2.6 | Usunięcie lub wyłączenie zabiera narzędzia od następnej tury; wywołanie zawodzi, a nie kończy się „cichym sukcesem” | ✓ | `callTool` odrzuca serwer usunięty („no MCP server…”), wyłączony dla agenta („switched off for this agent”) i niedostępny. Usunięcie zamyka połączenie (proces stdio kończy się). Dowód: testy i piaskownica `01`, krok 07 |
| Decyzja 2 | Lista wspólna dla programu, przełącznik na agenta, nowy agent ma włączone | ✓ | Brak wiersza w `projection_agent_mcp_settings` oznacza „włączone”. Usunięcie agenta usuwa jego przełączniki |

## Sekrety

- **Wartości** (zmienne środowiska serwera stdio, nagłówki HTTP) przechowuje tylko kolumna `projection_mcp_servers.secrets_encrypted`. Szyfruje je `safeStorage` Electrona (na Windows DPAPI, przypisane do konta użytkownika).
- **Dziennik zdarzeń i każde API odczytu** (`mcp.list`, zdarzenia) mają tylko nazwy sekretów (`secretNames`). Wartości są wyłącznie do zapisu.
- **Bez szyfrowania systemowego** zapis sekretu jest odrzucany („Secrets cannot be stored safely…”). Program nigdy nie zapisuje ich jawnym tekstem. Serwer bez sekretów działa normalnie.
- **Poza zapisem:**
  - stderr serwera stdio jest pomijany (`stderr: "ignore"`), bo mógłby wypisać sekret;
  - komunikaty błędów i wyniki narzędzi mają wartości sekretów zamaskowane (`•••`);
  - komunikat `needs-login` nie zawiera nagłówka.
- **Dowody:**
  - test `mcp-store.test.ts` przeszukuje wszystkie tabele bazy (także dziennik zdarzeń) i nie znajduje sekretu;
  - w piaskownicy przeszukałem bajty wszystkich 64 plików profilu, w tym `openbot.db`: 0 trafień;
  - w logach programu z tego przebiegu też 0 trafień.
- **Dziura:** to szyfrowanie na poziomie konta Windows. Inny program uruchomiony jako ten sam użytkownik może je odszyfrować. Mocniejszą ochronę (hasło, odblokowanie) da Vault w W2.

## Kontrakt dla UI

Plik `packages/contracts/src/ipc-mcp.ts` (commit `81218c976`):

```ts
window.openbot.mcp (opcjonalne w OpenBotDesktopApi do czasu atrapy)
  list(): Promise<McpServer[]>
  add({ name, transport: "stdio"|"http", command?, args?, cwd?, url?, secrets? }): Promise<McpServer>  // status "checking"
  update({ serverId, name?, command?, args?, cwd?, url?, secrets? }): Promise<McpServer>             // secrets: podane = zastąp
  remove({ serverId }): Promise<void>
  reconnect({ serverId }): Promise<McpServer>
  listAgentSettings(botId): Promise<AgentMcpServerSetting[]>   // { botId, serverId, enabled }
  setAgentEnabled({ botId, serverId, enabled }): Promise<AgentMcpServerSetting[]>

McpServer { id, name, transport, command, args, cwd, url, secretNames, status, errorMessage, tools[{name, description}], createdAt, updatedAt }
status: "checking" | "available" | "needs-login" | "error"
Zdarzenia: mcp-servers-changed { servers } (zastąp całą listę), agent-mcp-changed { botId, settings }
Nazwa serwera: mała litera, potem małe litery, cyfry, podkreślnik (do 40). Narzędzia agenta: mcp_<nazwa>.
```

**Wskazówki dla UI:**
- Wynik `add` / `reconnect` przychodzi asynchronicznie przez `mcp-servers-changed`.
- Przy `needs-login` warto pokazać przycisk „Dodaj token” (`update` z `secrets`) oraz „Połącz ponownie”.

## Decyzje i odkrycia

1. **Jeden tor wywołań dla Codex i Claude.** Codex dostaje przestrzenie `mcp_*` w `dynamicTools`. Claude dostaje z nich serwer MCP w procesie (SDK `McpServer` z oryginalnymi schematami JSON). Każde wywołanie wraca do `AgentService` jako `item/tool/call`, a menedżer sprawdza przełącznik i stan w chwili wywołania. Claude nie łączy się sam z serwerem: sekrety zostają w programie i zgody (2.4) da się dołożyć w jednym miejscu.
2. **Zmiana narzędzi a wątek.** Codex dostaje listę narzędzi przy `thread/start` i `thread/resume`. Program pamięta, z jakim zestawem MCP wątek ruszył, i przed następną turą wznawia go, gdy zestaw agenta się zmienił. Na atrapie działa, ale **ponownego `thread/resume` na wczytanym wątku nie sprawdziłem na prawdziwym Codex**.
3. **Poprawka W1-BE2 w turach kanału:** narzędzia przeglądarki szły do `dynamicTools` jako jedna zagnieżdżona tablica, a w rozmowach 1:1 są rozwijane. Teraz są rozwijane, jak w 1:1. Atrapa kanału tego nie wykrywała.
4. **Wersja schematu bez zmian** (decyzja lidera). Nowe tabele powstają przez `CREATE TABLE IF NOT EXISTS` przy każdym starcie, więc działają bez podbijania wersji.
5. **Odkrycie: Avast na tym komputerze psuje ruch MCP przez HTTP.** Działa tu `AvastSvc`. Na loopback odpowiedź HTTP jest przepisywana (nagłówek `content-length` zastąpiony przez `transfer-encoding: chunked`, przy treści bez kawałków), gdy żądanie ma nagłówek `mcp-protocol-version` albo ścieżka to `/mcp`. Sprawdziłem na banalnym serwerze Node: ścieżka `/` z innymi nagłówkami przechodzi, a `/mcp` lub ten nagłówek daje błąd „Invalid character in chunk size”. Klient MCP wysyła ten nagłówek w każdym żądaniu po inicjalizacji, więc **serwery MCP po HTTP na tym komputerze nie działają, dopóki Avast to robi**. To nie jest błąd programu. Do decyzji właściciela: wyjątek w Avast albo wyłączenie skanowania ruchu. Dlatego test udanej sesji HTTP idzie przez wstrzyknięty `fetch` (ten sam serwer echo, bez sieci), a test 401 na prawdziwej sieci przechodzi. Ruchu przez HTTPS do zdalnych serwerów nie sprawdzałem.

## Testy

| Polecenie | Wynik |
|---|---|
| `bun run typecheck` (contracts, node, renderer, storybook, api) | exit 0 |
| Testy nowe i zmienione: `ipc-mcp` 4, `mcp-store` 7, `mcp-manager` 7, `mcp-inputs` 3, `agent-service` (MCP: narzędzia, wywołanie, wyłączenie → resume bez narzędzi), `claude-client` (serwer pośredniczący, lista, wywołanie, `setMcpServers` przy zmianie i brak przy braku zmiany), `channel-agent-runner` (narzędzia agenta w turze kanału) | zielone |
| Całe `bun run test` na końcowym kodzie (start 03:14, po `5a27f3004`) | **99 plików, 740/740**, exit 0 (log `logs\mcp-test-full.log`). Integracja miała 717 |
| Biome na zmienionych plikach | 0 błędów; poprawki automatyczne objęły tylko moje linie |

**TDD:** testy magazynu, menedżera, parserów, `AgentService` i Claude pisałem przed kodem. Testy `AgentService` i Claude były najpierw czerwone (brak `mcp_local_echo` w `thread/start`, „No MCP proxy server for Claude”).

**Serwer testowy:** `src/backend/testing/mcp-echo-server.mjs`. Narzędzia:
- `echo`: zwraca tekst z prefiksem `cosgral-mcp-echo:`;
- `env_check`: mówi, czy sekret `ECHO_SECRET` dotarł do procesu, i podaje jego długość, nigdy wartość.

## Piaskownica

Profil `Shared\cosgral-data\desktop-kapi\sandbox-mcp\home` (osobne USERPROFILE, APPDATA, LOCALAPPDATA i TEMP). Atrapa Codex: `desktop-kapi\stub-codex`, w której dodałem dwa polecenia:
- `MCP TOOLS`: wypisuje przestrzenie `mcp_*` z `dynamicTools` wątku;
- `MCP CALL <ns>.<tool> <tekst>`: wywołuje narzędzie przez `item/tool/call`, tak jak model.

Serwer MCP: `mcp-echo-server.mjs` z worktree (stdio, `node.exe`) z sekretem `ECHO_SECRET`. Prawdziwego Codex ani Claude nie używałem.

| Przebieg | Kroki | Wynik | Dowód (`evidence\mcp\…`) |
|---|---|---|---|
| `01-mcp-on-off` | Nowy agent → dodanie serwera przez `window.openbot.mcp.add` → `MCP TOOLS` → `echo` → `env_check` → przełącznik off → `MCP TOOLS` → wywołanie | ✓ Stan `available`, narzędzia `echo, env_check`, `secretNames: [ECHO_SECRET]`, wartości sekretu brak w odpowiedzi API. Agent widzi `mcp_local_echo: echo, env_check`; echo zwraca „cosgral-mcp-echo: hello from the agent”; `env_check` daje `{"secretPresent":true,"length":24}`. Po wyłączeniu: „MCP tools in this thread: none”, a wywołanie daje „success=false The MCP server local_echo is switched off for this agent.” | `01-added.png`, `07-call-off.png`, `drive.log`, `cdp-drive-log.json` |
| `02-mcp-restart` | Restart programu → stan → `MCP TOOLS` → przełącznik on → `MCP TOOLS` → wywołanie | ✓ Po restarcie serwer jest na liście i połączony (`available`), przełącznik nadal off, więc narzędzi brak. Po włączeniu narzędzia wracają, a echo zwraca „cosgral-mcp-echo: after restart” | `01-after-restart.png`, `04-call.png` |
| Skan sekretu | Bajty wszystkich plików profilu piaskownicy i logi programu | ✓ 0 trafień jawnego `ECHO_SECRET` (64 pliki, w tym `openbot.db`) | — |

**Zamykanie:** oba przebiegi zamknęły się czysto (`close: clean`, `leftoverProcesses: 0`), także proces serwera echo. Profil `COSGRAL Workspace Dev` właściciela był nietknięty.

## Nie zrobione / nie sprawdzone

- **Karta logowania OAuth** (2.2): przekierowanie, `finishAuth`, odświeżanie tokenu. Dziś działa token w nagłówku-sekrecie i `needs-login` przy 401/403.
- **Zgoda na narzędzia MCP** (2.4) i **certyfikaty systemowe** (2.5).
- **MCP przez HTTP na prawdziwej sieci** na tym komputerze: blokuje to Avast (patrz wyżej). HTTPS do zdalnego serwera: nie sprawdzono.
- **Prawdziwy Codex** przy ponownym `thread/resume` wczytanego wątku. **Claude end-to-end** nie sprawdziłem, bo nie ma Claude CLI. Sprawdzone tylko testem jednostkowym z serwerem w pamięci.
- **Serwery zdalne COSGRAL**: IPC odpowiada „only on this computer for now”.
- **Atrapa UI** (`mock-openbot.ts`) nie ma jeszcze `mcp.*`.
- **Powiadomienie serwera o zmianie listy narzędzi** (`tools/list_changed`) jest pomijane; nową listę daje `reconnect`.

## Pliki poza repo

`Shared\cosgral-data\desktop-kapi\`:
- `stub-codex\Codex Stub\codex.cjs`: dodane `MCP TOOLS` i `MCP CALL`,
- `kapi-drive.mjs`: kroki `mcpadd`, `mcpstate`, `mcpswitch`,
- `sandbox-mcp\`, `evidence\mcp\`, `logs\mcp-*.log`.

Program nie jest uruchomiony. Bez push.
