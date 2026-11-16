# W8-BE2: budżety w silniku (krok 1) i izolacja procesów (krok 2)

## Krok 1: budżety KK W8-KK2 podpięte w `agent-service.ts`

**Stan:** gotowe. Tylko testy jednostkowe na prawdziwym `AgentService` z atrapą Codex (`agent-service-budgets.test.ts`, 10 testów).

1. **Liczenie (Q6).** Przy `thread/tokenUsage/updated` silnik czyta `tokenUsage.total.totalTokens`, liczy przyrost od ostatniego raportu wątku i dopisuje go do tury. Przy końcu tury (zakończona, nieudana albo zatrzymana; także tura subagenta, na koncie agenta-rodzica) jedno `meter.record({ botId, tokens, costUsd: null })`. Cena jest zawsze `null`: Codex jej nie podaje, a adapter Claude nie przekazuje `total_cost_usd`, więc dolarów nie zgaduję.
2. **Restart.** Ostatnia suma każdego wątku leży w bazie (`projection_budget_thread_totals`, nowy plik `budget-thread-totals.ts`), więc wątek wznowiony po restarcie liczy tylko przyrost, nie całość od zera. Licznik i budżet leżą w bazie przestrzeni (KK2).
3. **Bramka.** W `#drainBot` przed nową turą `meter.gate(botId)`. Przy `allowed: false` wiadomość zostaje w kolejce (status `queued`), a kolejka dostaje `heldReason` (nowe opcjonalne pole `QueueSnapshot.heldReason`, jedno zdanie z budżetu: agenta albo przestrzeni). Tura w toku nie jest przerywana (test: brak `turn/interrupt`, odpowiedź dochodzi).
4. **Odblokowanie.** Po zmianie limitu (`budgets-changed` → `service.budgetsChanged()` w `main/index.ts`) oraz co minutę, gdy ktoś czeka (nowy dzień lub miesiąc UTC nie wysyła zdarzenia). Timer jest `unref` i kończy się, gdy nikt nie czeka.
5. **Nie podpięte (celowo):** `meter.preferred(...)` (tańszy model). Reguły „prosta praca" nie ma i nie będę jej zgadywać, a wariant „przy ostrzeżeniu" musi współgrać z dostępnością modeli i listą zapasowych W5. Propozycja: osobne małe zadanie po decyzji, co jest „prostą pracą". Cena Claude: adapter jej nie ma; wymaga zmiany w `claude-client.ts` (propozycja poza tym krokiem).

**Czego nie sprawdziłem (krok 1):** prawdziwego Codex (co dokładnie jest w `tokenUsage.total` po kompakcie i wznowieniu; zabezpieczenie: spadek sumy liczy się jako nowy start), Claude (nie podaje tokenów w tym zdarzeniu, więc jego tury dziś nie zwiększają licznika), interfejsu (UI musi pokazać `heldReason`), Electrona.

---

## Krok 2: izolacja procesów (spec §1B, W8-09…14, G5)

**Następny krok (lider):** scalić `team/backend/w8-be2`. UI bierze `window.openbot.isolation` z kontraktu (commit `9ae78b9be`). Właściciel (G5, W8-12/14) uruchamia `bun scripts/isolation-escape-check.ts --root <nowy pusty folder>` i prawdziwe CLI w izolacji.

### 1. Co faktycznie jest na tym Windows (sprawdzone, bez admina, bez UAC, bez włączania funkcji)

| Sprawdzenie | Wynik |
|---|---|
| System | Windows 10 Pro 10.0.19045, Windows PowerShell 5.1, konto bez uprawnień administratora |
| `csc.exe` (.NET Framework 4, jest w każdym Windows 10/11) | jest: kompilator C# 5, bez pobierania |
| Job Object (utworzenie, limit liczby procesów, kill-on-close, przypisanie dziecka) | **działa bez admina**: limit zatrzymuje drzewo ponad limit, zamknięcie joba kończy procesy |
| AppContainer: wyprowadzenie SID z nazwy | działa bez admina |
| AppContainer: start procesu w kontenerze | **działa bez admina**, ale wymaga profilu kontenera (wpis na użytkownika, bez admina); bez profilu start kończy się błędem 2 |
| AppContainer: dostęp do folderów | proces w kontenerze **nie czyta** niczego, czego nie dostał; po nadaniu uprawnienia SID kontenera na folderze (`icacls`-owy odpowiednik, właściciel folderu robi to bez admina) czyta albo pisze zgodnie z nadaniem |
| Node/Electron bez natywnego modułu | **nie umieją** ani Job Object, ani AppContainer: stąd jeden mały host w C#, kompilowany na tym komputerze przez `csc` do folderu programu (bez zależności natywnych w repo) |

Zmiany systemu przy sprawdzaniu: do próby startu w kontenerze utworzyłem testowe profile AppContainer (`cosgral.dbg`, potem `cosgral.test.*`, `cosgral.escape.*`) i **usunąłem je**; po wszystkim w `%LOCALAPPDATA%\Packages` i w rejestrze nie zostało nic `cosgral*`. Foldery testowe w `Shared\cosgral-sandbox\be2-dbg` i `be2-escape` usunięte.

### 2. Co jest zrobione

| Commit | Zawartość |
|---|---|
| `9ae78b9be` | **kontrakt + mock** (osobno, pierwszy): `ipc-isolation.ts`, `window.openbot.isolation` (`getAvailability`, `list`, `get`, `setEnabled`, `recheck`), zdarzenie `isolation-changed`, powód odmowy `isolation-unavailable`, mock Storybooka, testy |
| silnik | `isolation-host-source.ts` + `isolation-host.ts` (host Job Object / AppContainer), `isolation-service.ts` (sprawdzenie komputera, przełącznik na agenta, karta, odmowa Q2), `isolation-ipc.ts`, wpięcie w `agent-service.ts`, `claude-client.ts`, `access-service.ts`, `main/index.ts`, `scripts/isolation-escape-check.ts` |

**Stany w kontrakcie (uczciwie):**
1. `active`: agent ma własne procesy (Claude Code, jeden na rozmowę) i uruchamiają się w Job Object (limit 512 procesów, kill-on-close). **Tylko to jest dziś zastosowane.**
2. `shared-process`: Codex ma jeden program dla wszystkich agentów, więc nie da się go odizolować dla jednego agenta. Program tego nie nazywa izolacją: trzymają poziom dostępu, sandbox CLI i odmowy z W8-BE1.
3. `unavailable`: izolacja włączona, ale komputer jej nie potrafi (nie Windows, brak `csc`, host się nie zbudował). **Q2:** narzędzia plikowe i powłoka agenta poniżej Full są odmawiane z powodem (`access-denied`, `isolation-unavailable`), bez karty, bez cichego przejścia na szeroki dysk. Na Full nie odmawiam: to wybór osoby kartą.
4. `off`: osoba wyłączyła. Wyłączenie to karta w Needs you (jak podniesienie poziomu), włączenie od razu.

### 3. Jak to działa

1. **Host** (`cosgral-job-host.exe`, źródło C# w `isolation-host-source.ts`, budowany `csc` do `<dane programu>\isolation`, przebudowa tylko po zmianie źródła): tworzy Job Object (kill-on-close, limit procesów, bez przełączania pulpitu/wylogowania), uruchamia program zawieszony, wkłada go do joba, wznawia. Uchwyty stdin/stdout/stderr dziedziczy proces docelowy, więc rurki z Node idą bezpośrednio (bez kopiowania i zmian kodowania). Kod wyjścia przechodzi 1:1. **Gdy izolacja była zażądana i się nie udała, program się nie uruchamia** (kod 125), nic nie startuje bez ochrony.
2. **AppContainer w hoście:** `--appcontainer NAZWA --grant ŚCIEŻKA[:r|:rw]`: tworzy lub znajduje profil, nadaje uprawnienia przed startem, zdejmuje po wyjściu (`--revoke`, `--delete-profile` do sprzątania po zabitym hoście). Przetestowane na atrapach (`cmd.exe`); **program nie uruchamia jeszcze procesów agentów w kontenerze** (patrz §5).
3. **Claude:** `ClaudeAgentClient.useProcessWrap`: na starcie każdej rozmowy program pyta, czy dla folderu tego agenta jest host. Jeśli tak (`active`), SDK dostaje własny starter procesu (`spawnClaudeCodeProcess`) przez host. Skrypty i shimy (`.cmd`, `.js`) startują po staremu.
4. **Pierwsza tura czeka na pierwsze sprawdzenie komputera** (kilka sekund przy pierwszym starcie, bo host się buduje); przed sprawdzeniem nic nie jest odmawiane.
5. **IPC tylko lokalnie** (`isolation:*`, test w `local-only-ipc.test.ts`).

### 4. Skrypt ucieczki G5 (`scripts/isolation-escape-check.ts`)

`bun scripts/isolation-escape-check.ts --root <nowy lub pusty folder> [--keep]`. Pracuje **wyłącznie w `--root`** (odmawia dysku, folderu domowego i niepustego folderu): robi własne dwa foldery z atrapami tekstowymi, własny AppContainer, na końcu wszystko usuwa. Linie `PASS`/`FAIL`, kod wyjścia 0 tylko przy samych PASS (liczyć linie `^FAIL`).

Próby (wszystkie muszą być odmowami, plus kontrole pozytywne, bo test, w którym nic nie działa, nic nie dowodzi): odczyt niewydanego folderu, odczyt przez `..`, inna wielkość liter, listing, zapis poza folderem (względną ścieżką), zapis do folderu tylko do odczytu, **odczyt przez junction wskazujący na zewnątrz**, limit procesów, kill-on-close, „nie startuje, gdy izolacja się nie udała”, sprzątanie. Kontrole: odczyt wydanego folderu, zapis do folderu z prawem zapisu, **widoczność wycieku** (ten sam odczyt z celowo wydanym folderem musi pokazać atrapę).

**Wynik na tym komputerze (tylko atrapy w folderze piaskowni, 16.11): `G5 ESCAPE TEST: PASS (15 checks)`.** To dowód dla hosta i kontenera na `cmd.exe`, **nie** dla prawdziwego CLI (W8-14).

### 5. Granice (uczciwie)

1. **Nie ma jeszcze muru AppContainer wokół prawdziwych agentów.** Host go potrafi i jest przetestowany, ale uruchomienie CLI w kontenerze wymaga nadania mu: folderu programu CLI i jego środowiska (Node), folderu stanu logowania (`~/.codex`, `~/.claude`), folderów agenta, sieci. To wymaga próby z prawdziwymi CLI (W8-14) i nie da się tego zgadnąć. Zrobione: host, grants, test ucieczki. Nie zrobione: lista nadań dla Codex/Claude i włączenie kontenera w startach.
2. **Codex jest jednym procesem dla wszystkich agentów** (`codex app-server`): izolacja per agent wymagałaby osobnego procesu na agenta albo na poziom (zmiana architektury). Dziś tylko Claude ma proces na rozmowę.
3. **Job Object nie jest ścianą plików**: to limit liczby procesów i sprzątanie po zamknięciu. Ścianą plików jest dopiero AppContainer.
4. **Limit 512 procesów** to wartość z głowy (ma nie ruszać zwykłych buildów); do potwierdzenia na prawdziwej pracy.
5. **`csc.exe` jest wymagany do zbudowania hosta.** Jeśli go nie ma, stan to `unavailable` z powodem, a narzędzia dyskowe poniżej Full są odmawiane (Q2). Inne systemy niż Windows: tak samo `unavailable`; odmowa dotyczy zatem też maszyn deweloperskich nie-Windows, jeśli ktoś tam uruchomi program z agentem Claude (w produkcji Windows).
6. Ślad na dysku: host zostaje w folderze programu (plik .exe i .cs); profil AppContainer powstaje dopiero przy starcie w kontenerze (dziś tylko w testach i skrypcie ucieczki, które go usuwają).
7. **Pułapka dotycząca helpera komputerowego** (nie moja zmiana): `computer-driver-windows.ts` uruchamia `powershell -ExecutionPolicy Bypass -File skrypt.ps1`; na komputerze z zablokowanymi skryptami `.ps1` to się nie uda. Mój host nie używa skryptów, tylko skompilowanego programu.

### 6. Weryfikacja i czego nie sprawdziłem

**Zrobione:** testy jednostkowe zielone: kontrakt (9 nowych), mock (4), `isolation-host` (11, na prawdziwym Windows: build, kod wyjścia, spacje w argumentach, limit procesów, kill-on-close, AppContainer odczyt/zapis, cofnięcie nadań, nie-start przy błędzie, starter Claude), `isolation-service` (18 + 1 prawdziwe sprawdzenie), `access-service` (+4, Q2), `agent-service-isolation` (6), `claude-client` (+1), `local-only-ipc`. Powiązane 66 plików: 546/547 (pojedyncza porażka: `agent-service.test.ts` „waits for active queue drains before shutdown completes”, test z 2-sekundowym opóźnieniem; sam plik: 80/80, więc to chwiejność pod obciążeniem równoległym, nie błąd tej zmiany; do potwierdzenia przy pełnym `check`). Biome na repo i `typecheck:node`, `typecheck:renderer` zielone.

**Nie sprawdziłem:**
1. Prawdziwego Claude Code i Codex w hoście: czy SDK przyjmuje własny starter procesu tak, jak opisuje `sdk.d.ts` (sprawdzone na atrapie i na `cmd.exe`), czy `claude.exe` startuje w Job Object bez efektów ubocznych.
2. Prawdziwego CLI w AppContainer (W8-14) i listy nadań dla niego.
3. Limitu 512 na dużym buildzie.
4. Windows 11, Windows Home i innych edycji (tylko ta maszyna: 10 Pro 19045).
5. Interfejsu, Electrona, `sandbox:e2e`, pełnego `check`/`test`.
6. Zachowania programu, gdy host zostanie zablokowany przez antywirus (kompilacja `csc` i uruchomienie nowego `.exe`); wtedy stan to `unavailable` z powodem z kompilatora lub z błędu uruchomienia.

### 7. Decyzje do potwierdzenia

1. **Przełącznik izolacji domyślnie WŁĄCZONY** dla każdego agenta (nie „odmowa startu wszystkiego”): stan `unavailable` odmawia tylko narzędzi dyskowych poniżej Full i tylko gdy komputer naprawdę nie potrafi. Propozycja T1 mówiła o odmowie startu CLI; moja wersja jest łagodniejsza, bo CLI działa w sandboxie z W8-BE1.
2. Czy robić osobny proces Codex na agenta (albo poziom), żeby izolacja per agent była możliwa także dla Codex? Zmiana architektury, osobne zadanie.
3. Następne zadanie dla izolacji: lista nadań dla Claude/Codex i włączenie AppContainer w startach, razem z próbą G5 na prawdziwych CLI na maszynie właściciela.
