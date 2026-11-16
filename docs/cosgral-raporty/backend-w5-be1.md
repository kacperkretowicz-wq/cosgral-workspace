# W5-BE1: pobierane CLI agentów (Codex, Claude Code)

Gałąź `team/backend/w5-be1`, bez push. Zachowanie według `luki-070.txt` (W5/Subskrypcje); bez kodu OpenBota nowszego niż 0.1.11.

## Co działa

- **Kontrakt** `packages/contracts/src/ipc-subscriptions.ts`: stan CLI (`source` custom/managed/system/none, wersje, `autoUpdate` domyślnie true, `customPath`, faza, postęp, błąd), 7 kanałów `subscriptions:*`, zdarzenie `managed-cli-changed`, `window.openbot.subscriptions` (opcjonalne), atrapa w `mock-openbot.ts`.
- **Oficjalne źródła** (`src/backend/cli-catalog.ts`). Adresy są wpisane w kod, tylko HTTPS do listy hostów, a każde przekierowanie jest sprawdzane osobno:
  - **Codex**: `api.github.com/repos/openai/codex/releases`, plik `codex-x86_64|aarch64-pc-windows-msvc.exe`, SHA-256 z pola `digest` wydania.
  - **Claude Code**: `downloads.claude.ai/claude-code-releases` (`latest` → `<wersja>/manifest.json` → `checksum` i `size` dla `win32-x64`). Z tego źródła korzysta oficjalny `install.ps1`.
  - Bez SHA-256 w metadanych nic nie jest pobierane: błąd, nie pobranie po cichu.
- **Silnik** (`src/backend/managed-cli.ts`):
  - jeden folder na wersję: `<userData>/cli/<id>/<wersja>/`. Bez praw administratora. „Usuń moje dane” też to usuwa;
  - plik płynie do `.part`, a rozmiar i SHA-256 są liczone w trakcie. Potem CLI startuje raz (`--version` przez `runCliWithRetry`). Dopiero wtedy folder zmienia nazwę na docelową;
  - **karta przed pierwszym pobraniem** w Needs you. Bez agenta zamiast karty pokazuje się okno systemowe. Po „tak” aktualizacje idą bez karty, ale zawsze z SHA-256;
  - **auto-aktualizacja**: przy starcie i co 6 h, gdy jest pobrane CLI, włączone `autoUpdate`, brak przypięcia i brak własnej ścieżki. Nieudana aktualizacja zostawia działającą wersję i pokazuje błąd;
  - **jedna ponowna próba**, gdy pobieranie się urwie. Bez ponownej próby, gdy nie zgadza się SHA-256 albo rozmiar, adres jest niedozwolony albo CLI nie startuje;
  - **przypięcie wersji**, **usuwanie tylko pobranego** (`<root>/<id>`; własne i systemowe CLI zostają nietknięte), jedna operacja naraz na CLI;
  - przy starcie usuwa stare foldery wersji i niedokończone pobrania.
- **Kolejność w `cli.ts`**:
  1. `OPENBOT_*_PATH` (testy/dev);
  2. własna ścieżka (sama, bez szukania dalej);
  3. pobrane CLI;
  4. PATH i znane foldery.
  
  `findSystemCli` podaje stan „system” bez własnych i pobranych. Ustawienia czytane są synchronicznie przed pierwszym startem agentów. ProviderRegistry dalej dostaje stan z `AgentService.#setStatus` (jedno źródło prawdy).
- **Main** (`src/main/subscriptions-ipc.ts`): IPC tylko dla tego komputera. Po zmianie CLI restart CLI następuje tylko wtedy, gdy ten dostawca nie działa, więc pracujący agent nie jest przerywany.
- **Atrapa serwera do testów**: tylko gdy aplikacja nie jest spakowana i `COSGRAL_CLI_TEST_BASE` wskazuje loopback. Paczka zawsze używa oficjalnych hostów.

## Testy (pojedyncze pliki, `--maxWorkers=1`)

- `src/backend/managed-cli.test.ts`: 10/10 na atrapie loopback.
  - Pokrywa: lista hostów, odczyt metadanych, karta odrzucona, instalacja i aktualizacja bez karty, sprzątanie przy starcie, zły SHA (1 żądanie, nic nie zostaje), urwane pobranie i ponowna próba, dwa urwania (wersja zostaje), przypięcie, kolejność custom > managed > system, usuwanie tylko pobranego, brak automatu przed pierwszym „tak”.
  - Mutacje sprawdzone: wyłączona ponowna próba i wyłączona karta dają 3 czerwone testy.
- `src/backend/cli.test.ts`: 11/11, w tym nowy test kolejności na prawdziwych `.cmd`.
- `src/backend/voice-download.test.ts`: 5/5. `packages/contracts/src/ipc-subscriptions.test.ts`: 2/2.
- `tsc` node i web: 0 błędów. Biome na zmienionych plikach: czysto.
- **`sandbox:e2e`**: 25/25 kroków, 0 uwag z konsoli, 152 s, osobny `COSGRAL_SANDBOX_ROOT` (`Shared\cosgral-sandbox\w5-be1-e2e`).
  - Nowy krok „cli”: karta w Needs you → „Send” → pobranie z atrapy → plik ma SHA-256 z metadanych.
  - Aktualizacja bez karty usuwa stary folder. Zepsuty plik jest odrzucony bez drugiej próby, a wersja zostaje. Usunięcie kasuje tylko pobrane.
  - Atrapa podaje kopię Node skryptu, bez internetu.
- **Jedno prawdziwe pobranie**: tylko w piaskownicy, z osobnymi USERPROFILE, APPDATA, LOCALAPPDATA i TEMP; pliku nie uruchomiono.
  - Claude Code 2.1.325 z `downloads.claude.ai`, 372 461 728 B, SHA-256 `87e0cb6a…f57a30` zgodny z manifestem.
  - `Get-FileHash` policzył osobno ten sam wynik. Plik usunięty po sprawdzeniu.

## Ryzyka

- **R1 (Windows):** nie da się usunąć działającego `.exe`.
  - „Usuń” zwraca błąd, gdy agent używa pobranego CLI.
  - Po aktualizacji stary folder zostaje do następnego startu i wtedy jest sprzątany.
  - Nowa wersja działa od następnego startu CLI.
- **R2:** pobrania są duże (Codex około 382 MB, Claude około 372 MB). Na dysku trzymamy tylko bieżącą wersję.
- **R3 (podpis):** żadnego źródła nie weryfikujemy podpisem.
  - Codex: `digest` liczy GitHub.
  - Claude: manifest ma `manifestSignatureEnforcement: "flag"`, a `manifest.json.sig` istnieje, ale bez publicznego klucza go nie sprawdzamy.
  - Sumie ufamy przez TLS do oficjalnego hosta. Łagodzi to lista hostów, karta przed pierwszym pobraniem i twardy wymóg SHA-256.
- **R4:** „latest” może kiedyś wskazać wydanie bez pliku dla Windows albo z innym tagiem. Wtedy pojawia się czytelny błąd i nic nie jest pobierane.
- **R5:** przypięcie Codex starszego niż 0.144.1 przejdzie instalację, a przy starcie pokaże „outdated” (minimum sprawdza `resolveCodexCli`).

## Czego nie sprawdziłem

- Program nie uruchomił prawdziwego pobranego CLI jako agenta: pobranego pliku nie startowałem.
- Prawdziwego pobrania Codex nie robiłem (limit: jedno prawdziwe pobranie). Z prawdziwego źródła sprawdziłem tylko metadane i przekierowanie `github.com` → `release-assets.githubusercontent.com`.
- Spakowanej aplikacji nie sprawdziłem (`isPackaged`, oficjalne hosty w działającym programie). Paczki nie budowałem.
- Okno systemowe zamiast karty, gdy nie ma agenta: kod jest, ale e2e ma już agenta, więc ta ścieżka nie zadziałała w testach.
- Timera 6 h nie sprawdziłem: `autoUpdate()` mają tylko testy jednostkowe.
- Nie sprawdziłem arm64 ani macOS/Linux (katalog podaje tylko pliki Windows).
- Pełnego `bun run test` nie uruchamiałem (zasada zespołu); były tylko pojedyncze pliki.
- Nie ma UI (strona Subskrypcje i przycisk „Download” w onboardingu to zadanie UI). Nie ma też automatycznej propozycji pobrania przy pierwszym starcie, gdy brakuje CLI: propozycja to wywołanie `installCli` z onboardingu (pokaże kartę albo okno).
