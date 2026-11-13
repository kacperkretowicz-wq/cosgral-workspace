# Raport H2: Sprawdzenie paczki Windows po scaleniu (b026feb9f)

**Agent:** Hydra Nakurwiacz 1  
**Rola:** Lekkie zadania i weryfikacja  
**Gałąź:** `team/hydra/h2-package-check` (od `codex/cosgral-desktop` @ `b026feb9f`)  
**Data:** 13.11.2026, 01:45–01:58 CET  
**Zakres:** Budowa paczki produkcyjnej Windows, kontrola skryptem `scripts/verify-windows-package.ts` oraz testy w izolowanej piaskownicy. Żadnych zmian kodu programu ani progów.

---

## Werdykt

**Paczka Windows zbudowana pomyślnie, rozmiar zredukowany o ~40%, brak dołączonego `claude.exe`, czysty start i zamknięcie w piaskownicy.**

1. **Rozmiar instalatora NSIS:** **102,71 MB** (107 697 742 bajtów; w wersji bazowej 0.1.11 było 169 MB).
2. **Katalog `win-unpacked`:** **447,44 MB** (wcześniej ok. 751 MB).
3. **Brak `claude.exe` w paczce:** Potwierdzone testem `expectNoBundledClaude` oraz skanem rekursywnym `win-unpacked` (0 wystąpień).
4. **Start i zamknięcie w piaskownicy:** Program startuje w pełni (`alive=True` po 8 s), procesy potomne Electrona i atrapy działają, zamknięcie przez zakończenie drzewa procesów pozostawia **0 procesów resztkowych**.
5. **Czas wyjścia drugiej instancji (single-instance lock):** Zmierzony trzykrotnie w piaskownicy:
   - Pomiar 1: **6,07 s** (6 073 ms), exit code `0`, pierwsza instancja nienaruszona.
   - Pomiar 2: **6,27 s** (6 271 ms), exit code `0`, pierwsza instancja nienaruszona.
   - Pomiar 3: **6,03 s** (6 034 ms), exit code `0`, pierwsza instancja nienaruszona.
   - *Średnia:* **6,13 s**.
   - *Wyjaśnienie błędu w `verify-windows-package.ts`:* Skrypt weryfikacyjny posiada sztywny próg 3 000 ms (`Promise.race` z timeoutem 3 s). Na maszynie Windows z Electronem przekazanie fokusu i wyjście drugiej instancji zajmuje ok. 6,1 s (w zadaniu B1 wynosiło to 7,8–8,0 s, Backend w W1-BE3 odnotował 5,1 s). Zgodnie z instrukcją progów nie zmieniano.
6. **Claude CLI:** Brak zainstalowanego Claude CLI na maszynie hosta (`Get-Command claude` zwraca brak). Zgodnie z wytycznymi odnotowano: **„nie sprawdzono”**.

---

## Tabela wyników

| Punkt | Wymaganie | Kroki testowe | Wynik | Dowód |
|---|---|---|---|---|
| **(a) Rozmiar instalatora** | Zmniejszony instalator po wykluczeniu SDK CLI | `bun run dist:win` (z `$env:NODE_OPTIONS = "--use-system-ca"`) | **102,71 MB** (107 697 742 B) | `dist/COSGRAL Workspace-0.2.0-x64.exe` |
| **(a) Rozmiar unpacked** | Mniejszy rozmiar aplikacji rozpakowanej | Pomiar sumy bajtów `dist/win-unpacked` | **447,44 MB** | `dist/win-unpacked/` |
| **(a) Brak `claude.exe`** | Brak zbędnego pliku binarnego CLI w paczce | 1. Test `scripts/verify-windows-package.ts` (`expectNoBundledClaude`)<br>2. Skan `Get-ChildItem -Recurse -Filter "*claude*"` | **Brak** (0 plików) | Log `verify-package-h2.ps1` |
| **(b) Start w piaskownicy** | Program z paczki startuje poprawnie w izolacji | Start `dist/win-unpacked/COSGRAL Workspace.exe` z `--user-data-dir` w piaskownicy, oczekiwanie 8 s | **Sukces** (`alive=True`, PID 10128, 4 procesy potomne) | Sekcja B skryptu `verify-package-h2.ps1` |
| **(b) Czyste zamknięcie** | Brak wiszących procesów po zamknięciu programu | Zamknięcie drzewa procesów, kontrola procesów `COSGRAL Workspace` oraz `electron` | **Sukces** (0 procesów resztkowych) | `Get-Process` = 0 procesów |
| **(c) Druga instancja (single-instance)** | Druga instancja przekazuje fokus i zamyka się z kodem 0 | 3 kolejne uruchomienia drugiej instancji z tym samym profilem: pomiar czasu przez `[Diagnostics.Stopwatch]` | **3/3 wyjścia z kodem 0**: R1: 6,07 s, R2: 6,27 s, R3: 6,03 s | Tabela pomiarów w logu `verify-package-h2.ps1` |
| **(d) Claude CLI** | Start z zainstalowanego Claude CLI | Sprawdzenie obecności Claude CLI w systemie (`Get-Command claude`) | **Nie sprawdzono** (brak CLI na komputerze) | `Get-Command claude` exited with code 1 |

---

## Środowisko testowe i izolacja

- **Worktree:** `Shared\cosgral-wt\desktop-hydra`
- **Profil piaskownicy:** `Shared\cosgral-data\desktop-hydra\sandbox-h2`
  - `USERPROFILE`: `...\sandbox-h2\home`
  - `APPDATA`: `...\sandbox-h2\home\AppData\Roaming`
  - `LOCALAPPDATA`: `...\sandbox-h2\home\AppData\Local`
  - `TEMP` / `TMP`: `...\sandbox-h2\home\AppData\Local\Temp`
  - Wyczyszczone zmienne środowiskowe: `CLAUDE*`, `CLAUDECODE*`, `ANTHROPIC*`, `OPENAI*`, `CODEX*`, `OPENBOT*`, `COSGRAL*`.
- **Atrapy:**
  - `OPENBOT_CODEX_PATH` wskazywał na atrapę `Shared\cosgral-data\desktop-backend\stub-codex\Codex Stub\codex.cmd`.
  - Prawdziwe modele (Codex / Claude) ani sieć nie były używane.
- **Bezpieczeństwo profilu:**
  - Instalator NSIS nie był uruchamiany (brak wpisów do rejestru systemowego).
  - Testy uruchomiono bezpośrednio na `dist/win-unpacked`.

---

## Pliki dowodowe poza repozytorium

Wszystkie artefakty testowe i logi znajdują się w:  
`Shared\cosgral-data\desktop-hydra\`
- `verify-package-h2.ps1` – skrypt weryfikujący z procedurą pomiarową
- `sandbox-h2\` – izolowane katalogi użytkownika i profil danych
- `dist\` (w worktree) – zbudowana paczka NSIS oraz katalog `win-unpacked` (ignorowane przez git)
