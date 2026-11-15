# Backend W4-BE4: domknięcie W4 (where.exe, instalator) i projekt W5

Gałąź `team/backend/w4-be4` od `codex/cosgral-desktop` @ `93c862bd1`, bez push. Instalatora nie budowałem i niczego nie instalowałem.

## Wynik w skrócie

| Krok | Wynik | Commit |
|---|---|---|
| 1. `where.exe` 5 s → wspólny `runCliWithRetry` (20 s + ponowienie) | ✓ test 3/3 | `c756c7b28` |
| 2a. Sekcja `nsis:` w `electron-builder.yml`, dane zostają po odinstalowaniu | ✓ walidator electron-buildera OK, test 2/2 | `24eb979a3` |
| 2b. „Usuń moje dane” w Ustawieniach | ✗ nie zrobione: więcej niż 40 min, plan niżej | — |
| 3. Projekt W5 `docs/cosgral/spec-w5-subskrypcje.md` | ✓ bez kodu | `3be1ab585` |

**`sandbox:e2e`: 23/23, 0 wpisów w konsoli.**

## 1. `where.exe`

`collectCandidates` w `src/backend/cli.ts` pytał `where.exe` z limitem 5 s. Na obciążonym komputerze zapytanie przekraczało czas, wpisy z `PATH` przepadały, a CLI zainstalowane tylko w `PATH` dostawało fałszywe „Not installed”.

Nowa funkcja `windowsPathCandidates` używa `runCliWithRetry`, tak jak `codex --version` i `claude auth status`. Każdy błąd zostawia znane foldery instalacji, jak dotąd.

Test `cli-where.test.ts` sprawdza trzy rzeczy:
1. Długi limit i parsowanie linii.
2. Dwa przekroczenia czasu nie dają błędu (zostają znane foldery).
3. Brak w `PATH` (kod 1).

Sprawdzanie na macOS (`zsh -lic`, 5 s) zostało bez zmian, bo jest poza zakresem Windows.

## 2a. Instalator: sekcja `nsis:`

W `electron-builder.yml` nie było sekcji `nsis:`, więc instalator działał na wartościach domyślnych. Dodałem ją z tymi samymi wartościami, co dziś (sprawdzone ze schematem `app-builder-lib` 26.15.3):

| Opcja | Wartość | Domyślnie |
|---|---|---|
| `oneClick` | `true` | `true` |
| `perMachine` | `false` (per-użytkownik) | `false` |
| `deleteAppDataOnUninstall` | `false` (dane zostają, decyzja lidera) | `false` |
| `createDesktopShortcut` / `createStartMenuShortcut` | `true` | `true` |
| `shortcutName` | `${productName}` | nazwa produktu |
| `runAfterFinish` | `true` | `true` |

Zachowanie instalatora się nie zmienia. Decyzja „dane zostają” jest teraz zapisana wprost i pilnowana testem (`scripts/electron-builder-config.test.ts`). Cała konfiguracja przechodzi `validateConfiguration` z electron-buildera, bez budowania.

Po odinstalowaniu zostają:
- `%APPDATA%\COSGRAL Workspace` (baza, ustawienia, Vault zaszyfrowany `safeStorage`, przeglądarka agentów);
- folder agentów `%USERPROFILE%\COSGRAL Workspace`.

Lider zdecydował, że dane zostają, ale dokument źródłowy przy W4-H2 mówi „po odinstalowaniu nic nie zostaje w profilu”. Wpisałem to do decyzji właściciela w specyfikacji W5 (§6, punkt 1).

## 2b. „Usuń moje dane”: plan (nie zrobione)

Nie zrobiłem tego, bo bezpieczna wersja to więcej niż 40 min. Na Windows nie da się pewnie usunąć danych z działającego programu: baza SQLite z WAL, profil przeglądarki Chromium i logi są otwarte przez sam program, a próba usuwania w locie zostawi pół danych.

Plan (ok. 2 h z testami i krokiem e2e):
1. **Kontrakt:** `appData.requestDeleteMyData()` → okno potwierdzenia w procesie głównym (`dialog.showMessageBox`, nie w rendererze) z listą folderów i polem „wpisz USUŃ”. Tylko ten komputer, nigdy telefon ani zdalny serwer.
2. **Po potwierdzeniu:**
   - zatrzymanie agentów (`AgentService.stop()`, kanały, rutyny, serwer telefonu, zdalny pulpit);
   - zapis znacznika `delete-on-next-start` z listą folderów do usunięcia, w folderze tymczasowym poza danymi;
   - `app.relaunch()` + `app.quit()`.
3. **Na starcie,** przed otwarciem bazy i przeglądarki: jeśli jest znacznik, program usuwa foldery z listy z ponowieniami (jak `openWithRetry`), kasuje znacznik i startuje pusty jak po instalacji. Gdy coś zostanie (blokada), okno mówi, co i gdzie.
4. **Zakres usuwania do decyzji właściciela:** `%APPDATA%\COSGRAL Workspace` na pewno; folder agentów z plikami roboczymi tylko po zaznaczeniu osobnego pola, bo zawiera pracę.
5. **Testy:** jednostkowy logiki znacznika i listy folderów (folder tymczasowy) oraz krok e2e w piaskownicy: dane są, „Usuń”, restart, pusty start.

## 3. Projekt W5

`docs/cosgral/spec-w5-subskrypcje.md` zawiera:
- podział na zadania z kolejnością i zależnościami (T1 → BE1 → BE2 → K1, BE3 → K2, BE4 → UI1, UI2 → T2);
- kontrakty `ipc-subscriptions.ts`: CLI zarządzane, konta i logowanie w aplikacji, klucze API w `safeStorage`, endpointy (OpenAI-compatible, Ollama, LM Studio), 8 modeli zapasowych;
- 8 ryzyk;
- 6 decyzji właściciela;
- zasady testów bez czytania plików logowania.

Implementacji nie zaczynałem, bo bramka G1 nie jest potwierdzona.

## Weryfikacja

| Sprawdzenie | Wynik |
|---|---|
| `cli-where` (nowy) | 3/3 |
| `electron-builder-config` (nowy) | 2/2 |
| `cli`, `cli-timeout`, `claude-auth-status` | 10/10, 3/3, 3/3 |
| Walidator konfiguracji electron-buildera | OK |
| `typecheck:node`, `typecheck:renderer` | kod 0 |
| `biome` na zmienionych plikach | 0 błędów |
| `bun run build` | kod 0 |
| `sandbox:e2e` | **23/23**, 0 wpisów w konsoli |

## Czego nie sprawdziłem

- **Instalator:** nie budowałem go, nie instalowałem ani nie odinstalowywałem. To, że dane zostają po odinstalowaniu, opieram na opcji `deleteAppDataOnUninstall: false` i dokumentacji electron-buildera. Prawdziwy test to W4-H2 na czystym koncie Windows.
- **Prawdziwe `where.exe` pod obciążeniem:** test logiki z podstawionym uruchamiaczem; samo ponawianie jest już przetestowane w `cli-timeout`.
- **Specyfikacja W5:** polecenia logowania obu CLI w trybie bez terminala nie są sprawdzone (ryzyko R2). Poza tym specyfikacja nie przeszła przeglądu Testera ani lidera.
- **„Usuń moje dane”:** nie zrobione, tylko plan.
- **Pełne `bun run test` i `bun run check`:** robi je KK.
- **Kolejność pisania testu:** test `cli-where` napisałem razem z poprawką, bez osobnego przebiegu „na czerwono”.
