# Raport H4: Kontrola paczki Windows i skryptów piaskownicy po scaleniu W2

**Agent:** Hydra Nakurwiacz 1  
**Rola:** Lekkie zadania i weryfikacja  
**Gałąź:** `team/hydra/h4-package-w2` (od `codex/cosgral-desktop` @ `8de3a8380` zawierający `6e5db03e2`)  
**Data:** 13.11.2026 CET  
**Zakres:** Kontrola paczki Windows po scaleniu W2, pomiar czasu wyjścia drugiej instancji w wersji minimalnej (6e5db03e2), start i pełna tura na atrapie Codex w piaskownicy, czyste zamknięcie bez procesów resztkowych, uruchomienie gotowych skryptów piaskownicy kanałów i pamięci. Żadnych zmian kodu programu.

---

## Werdykt

**Paczka Windows i środowisko piaskownicy po integracji W2 w pełni sprawne. Kontrola `scripts/verify-windows-package.ts` przechodzi bezbłędnie z progiem 3 s, minimalna wersja strażnika drugiej instancji (6e5db03e2) utrzymuje czas wyjścia na poziomie ~2,5 s (poprzednio 6,1 s), tura na atrapie Codex w paczce kończy się sukcesem bez wycieku procesów, a oba gotowe skrypty piaskownicy (`channel-sandbox-smoke.ts` i `w2-t2-memory-smoke.ts`) zwracają status OK (`ok: true`).**

1. **Rozmiar instalatora NSIS:** **102,74 MB** (107 725 537 bajtów).
2. **Katalog `win-unpacked`:** **447,66 MB** (469 406 424 bajtów).
3. **Brak dołączonego `claude.exe`:** Potwierdzony testem `expectNoBundledClaude` oraz rekursywnym skanem katalogu paczki.
4. **Weryfikacja skryptem `scripts/verify-windows-package.ts`:** **PASSED (exit code 0)** — metadane, licencje, ASAR integrity, hardened fuses, brak bundled CLI, launch i wyjście drugiej instancji < 3 s.
5. **Czas wyjścia drugiej instancji (single-instance guard minimal 6e5db03e2):**
   - Pomiar 1: **2 191 ms** (2,19 s), exit code `0`, pierwsza instancja nienaruszona.
   - Pomiar 2: **2 885 ms** (2,88 s), exit code `0`, pierwsza instancja nienaruszona.
   - Pomiar 3: **2 483 ms** (2,48 s), exit code `0`, pierwsza instancja nienaruszona.
   - *Średnia:* **2 519,7 ms (~2,52 s)**. Wersja minimalna daje dokładnie taki sam efekt jak prototyp H3 (~2,4–2,5 s).
6. **Paczka w piaskownicy (start + tura na atrapie Codex):**
   - Start z flagą `--remote-debugging-port=0`, sterowanie przez CDP loopback.
   - Inicjalizacja `setup:codex`, utworzenie agenta, wybór modelu `gpt-5.6-luna`.
   - Wysłanie wiadomości: *"Hello from Hydra H4"*.
   - Odpowiedź atrapy: *"COSGRAL stub (not a model): received 'Hello from Hydra H4' on Windows."* (czas odpowiedzi 1 514 ms).
   - Zamknięcie okna głównego: `clean` w **222 ms**.
   - Procesy resztkowe: **0** (`leftoverProcesses: 0`).
7. **Skrypty piaskownicy na integracji:**
   - `scripts/w2-t2-memory-smoke.ts`: **OK** (`ok: true`, 17/17 checks, 0 failed).
   - `scripts/channel-sandbox-smoke.ts`: **OK** (`ok: true`, 3 agents, resultVersions: 2, keptDrafts: 1, skills restored after restart).

---

## Tabela wyników

| Punkt zadania | Wymaganie | Procedura testowa | Wynik | Dowód |
|---|---|---|---|---|
| **1. Gałąź i instalacja** | Czysty start na `codex/cosgral-desktop` | `git switch -c team/hydra/h4-package-w2 codex/cosgral-desktop && bun install` | **Sukces** | Gałąź utworzona, zależności zainstalowane (726 installs) |
| **2. Rozmiar instalatora** | Zmniejszony instalator NSIS | `bun run dist:win` (z `--use-system-ca`) | **102,74 MB** (107 725 537 B) | `dist/COSGRAL Workspace-0.2.0-x64.exe` |
| **2. Rozmiar unpacked** | Zweryfikowany rozmiar rozpakowany | Suma rozmiarów plików `dist/win-unpacked` | **447,66 MB** (469 406 424 B) | `dist/win-unpacked/` |
| **2. Brak `claude.exe`** | Wykluczenie zbędnego binarnego CLI | Test weryfikacyjny paczki + skan rekursywny | **Brak** (0 plików) | `scripts/verify-windows-package.ts` |
| **2. Kontrola paczki** | `scripts/verify-windows-package.ts` z progiem 3 s | Uruchomienie skryptu weryfikatora | **PASSED (exit 0)** | Log `scripts/verify-windows-package.ts` |
| **3. Druga instancja** | 3 pomiary wyjścia duplikatu w piaskownicy | 3 kolejne uruchomienia drugiej instancji (`sandbox-h4`), pomiar `Stopwatch` | **3/3 wyjścia z kodem 0**:<br>R1: 2,19 s (2 191 ms)<br>R2: 2,88 s (2 885 ms)<br>R3: 2,48 s (2 483 ms)<br>Średnia: **2,52 s** | `Shared/cosgral-data/desktop-hydra/verify-package-h4.ps1` |
| **4. Paczka w piaskownicy** | Start, tura na atrapie Codex, zamknięcie, 0 procesów | Uruchomienie paczki z `sandbox-h4-turn` + atrapa `stub-codex\Codex Stub\codex.cmd` sterowane przez CDP | **Sukces** (`clean` w 222 ms, odpowiedź atrapy w 1 514 ms, **0 procesów resztkowych**) | `Shared/cosgral-data/desktop-hydra/evidence/h4/packaged-turn/summary.json`, `drive.log`, zrzuty `00-first-start.png`, `01-chat.png`, `02-final.png` |
| **5. Smoke pamięci** | `scripts/w2-t2-memory-smoke.ts` na integracji | Bundle Node ESM przez esbuild ze stubem Electrona, wykonanie Node w piaskownicy | **OK** (`ok: true`, 17/17 zaliczonych) | `Shared/cosgral-data/desktop-hydra/sandbox-h4-memory/evidence.json` |
| **5. Smoke kanałów** | `scripts/channel-sandbox-smoke.ts` na integracji | Bundle Node ESM przez esbuild ze stubem Electrona, wykonanie Node w piaskownicy | **OK** (`ok: true`, fixture: true, 3 agenci, 2 wersje wyniku) | `Shared/cosgral-data/desktop-hydra/sandbox-h4-channels/evidence.json` |
| **6. Czystość środowiska** | Brak zmian w profilu użytkownika | Porównanie `COSGRAL Workspace Dev` w `%APPDATA%` przed i po testach | **Nienaruszone** (`absent` przed i po) | `summary.json` |

---

## Środowisko testowe i izolacja

- **Worktree:** `C:\Users\x1 Yoga\OpenBot\Shared\cosgral-wt\desktop-hydra`
- **Piaskownice testowe:** `C:\Users\x1 Yoga\OpenBot\Shared\cosgral-data\desktop-hydra\`
  - `sandbox-h4` — pomiary czasu drugiej instancji
  - `sandbox-h4-turn` — pełny start paczki i tura na atrapie Codex
  - `sandbox-h4-memory` — test odbioru pamięci agentów
  - `sandbox-h4-channels` — test odbioru silnika kanałów i kart
- **Zmienne środowiskowe:** Izolowane `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`/`TMP`. Wyczyszczone zmienne `CLAUDE*`, `ANTHROPIC*`, `OPENAI*`, `CODEX*`, `OPENBOT*`, `COSGRAL*`.
- **Atrapy:**
  - `OPENBOT_CODEX_PATH` wskazywał na atrapę `Shared\cosgral-data\desktop-backend\stub-codex\Codex Stub\codex.cmd`.
  - Prawdziwe modele ani sieć nie były używane.
- **Bezpieczeństwo profilu:**
  - Instalator NSIS nie był uruchamiany (brak wpisów w rejestrze i profilu systemowym).
  - Testy uruchomiono bezpośrednio na katalogu `dist/win-unpacked`.

---

## Pliki dowodowe poza repozytorium

Wszystkie artefakty testowe i logi znajdują się w:  
`C:\Users\x1 Yoga\OpenBot\Shared\cosgral-data\desktop-hydra\`
- `run-sandbox-h4.ps1` — sterownik uruchomienia paczki i tury CDP
- `verify-package-h4.ps1` — procedura 3 pomiarów wyjścia duplikatu
- `run-smoke-tests-h4.ps1` — sterownik testów smoke pamięci i kanałów
- `smoke-dist\` — skompilowane skrypty smoke dla Node
- `evidence\h4\packaged-turn\` — zrzuty ekranu (`00-first-start.png`, `01-chat.png`, `02-final.png`), `drive.log`, `summary.json`
- `sandbox-h4-memory\evidence.json` — dowód wykonania smoke pamięci
- `sandbox-h4-channels\evidence.json` — dowód wykonania smoke kanałów
- `dist\` (w worktree) — zbudowana paczka NSIS oraz katalog `win-unpacked` (ignorowane przez git)
