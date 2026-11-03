# Uruchomienie na Linux — sesja 3 XI 2026

Sprawdzone środowisko: Linux x64, Node **24.22.2**, pnpm **9.15.4**, Codex CLI **0.162.1**. Zależności były już zainstalowane. Poniżej potwierdzono start **samego API**, nie całego interfejsu ani wykonania zadania przez model.

## Potwierdzony start API

Z katalogu repozytorium, po instalacji zależności:

```sh
pnpm --filter @paperclipai/plugin-sdk build
env -u DATABASE_URL PAPERCLIP_HOME=/tmp/cosgral-linux-codex-1 pnpm db:migrate
env -u DATABASE_URL PAPERCLIP_HOME=/tmp/cosgral-linux-codex-1 HOST=127.0.0.1 PORT=3100 PAPERCLIP_MIGRATION_AUTO_APPLY=true pnpm --filter @paperclipai/server dev
```

Migracje w tej sesji uruchomił wcześniej `pnpm dev:once --data-dir /tmp/cosgral-linux-codex-1`; wykorzystał ten sam mechanizm `db:migrate` i zastosował 422 migracje. Samodzielnego wywołania drugiej komendy powyżej nie powtarzano. Serwer działał na tej przygotowanej bazie. Bez `DATABASE_URL` bieżący kod używa **embedded PostgreSQL**, nie PGlite. Port bazy w tej instancji: **54329**.

W drugim terminalu:

```sh
curl --max-time 5 -fsS http://127.0.0.1:3100/api/health
curl --max-time 5 -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3100/api/agents/me
```

Wyniki: health HTTP 200, `status: ok`, `startupRecovery.phase: ready`; `/agents/me` bez klucza — HTTP 401. W logu startu: `UI dist not found; running in API-only mode`. `authReady: true` w health nie oznacza gotowości JWT agentów: banner osobno zgłosił `Agent JWT missing`.

Zatrzymanie: Ctrl+C w terminalu serwera. Po zatrzymaniu sprawdzono odmowę połączenia na obu portach 3100 i 54329. Dane testowe pozostały w `/tmp/cosgral-linux-codex-1`; to katalog tymczasowy, nie miejsce trwałej instalacji. Tryb `local_trusted` służy jednemu lokalnemu operatorowi; konfiguracja dwóch kont wymaga osobnej weryfikacji `authenticated`.

## Pułapki

- `pnpm dev:once --data-dir /tmp/cosgral-linux-codex-1` nie zakończył startu. Najpierw brakowało `@paperclipai/plugin-sdk/dist/index.js`. Następnie budowa natywnego runnera nie mogła utworzyć cache w `/home/box/.cargo/registry/cache` (system plików tylko do odczytu). Budowa SDK i start bezpośredni umożliwiły test API; **nie potwierdzają działania natywnego runnera**. Nie zmieniano uprawnień sandboxa.
- Produkcyjny onboarding powinien utworzyć trwały sekret JWT poza repozytorium. W tej sesji go nie skonfigurowano. `runtime-execution.ts` przy jego braku tylko ostrzega, a `execute.ts` nie dostaje tokenu do `PAPERCLIP_API_KEY`. Nie drukować `.env`, `auth.json`, tokenów ani pełnego środowiska procesu. Przed pełnym testem potwierdzić wyłącznie obecność zmiennych, bez ich wartości.
- Domyślny Codex local ma teraz bypass wyłączony. Ścieżka CLI już wcześniej ustawiała `workspace-write` z `sandbox_workspace_write.network_access=true`; jawny profil/sandbox w `extraArgs` zachowuje własną politykę. `network_access=true` umożliwia ogólny dostęp sieciowy, nie wyłącznie loopback. Nie rozszerzono tej polityki. Opcjonalne istniejące `networkScope=allowlist` wymaga Bubblewrap, jawnego `engine=cli` i osobnego sprawdzenia proxy oraz połączenia do API.
- Korzystać z wstrzykniętego `PAPERCLIP_API_URL` (bez dopisywania drugiego `/api`) i `PAPERCLIP_API_KEY`, a dla mutacji z `X-Paperclip-Run-Id`. Nie zakładać na sztywno portu hosta dla SSH/kontenera. Adapter instaluje skill Paperclip w efektywnym `CODEX_HOME/skills`; dostęp do API przez curl nie wymaga globalnego `paperclipai`. Globalnej binarki nie znaleziono w PATH tej maszyny.

## Ograniczenie próby Codexa i następny test

Prosty serwer Node na `127.0.0.1` z losowym portem zwrócił z hosta `cosgral-loopback-ok`. Próby `codex exec -s workspace-write` z `-c sandbox_workspace_write.network_access=false` oraz `true` nie dostarczyły wyniku curl. Powtórzenie z `--json` również nie zwróciło zdarzeń wykonania; proces kończył się kodem 0, wypisując ostrzeżenie `Read-only file system`. Nie uznano kodu 0 za zaliczenie eksperymentu. Używano bieżącego `CODEX_HOME`, bez odczytu i przenoszenia jego poświadczeń.

Bezpośredni `codex sandbox -c 'sandbox_mode="workspace-write"' -- true` oraz warianty z curl i obiema politykami sieci zakończyły się kodem 1: `error building bubblewrap command: app-server socket directory must be a user-owned directory with mode 0700`. Ten problem środowiska uniemożliwił porównanie dostępu z wnętrza sandboxa.

Na maszynie z działającym sandboxem i zapisowalnym bieżącym `CODEX_HOME` powtórzyć porównanie false/true na prostym HTTP. Następnie skonfigurować JWT standardowym onboardingiem i uruchomić pojedynczego agenta z `engine=cli`, `dangerouslyBypassApprovalsAndSandbox=false`, bez dodatkowych flag omijających zabezpieczenia. Sprawdzić z jego narzędzia shell kolejno health, `/api/agents/me`, checkout przypisanego zadania, komentarz i zapis statusu `done`, a potem niezależnym odczytem API potwierdzić zmianę oraz brak kolejnego retry. **Żadnego z tych kroków pełnego cyklu nie uznano tutaj za zaliczony.**
