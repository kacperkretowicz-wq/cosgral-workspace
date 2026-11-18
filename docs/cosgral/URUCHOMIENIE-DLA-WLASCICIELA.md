# COSGRAL Workspace — uruchomienie (dla Ciebie)

Źródła: `README_URUCHOMIENIE.md`, `start-cosgral*.cmd`, `electron-builder.yml` (v0.2.0). Bez wymyślania.

## A. Bezpieczna próba (piaskownica)

1. Otwórz folder programu: `<Shared>\cosgral-desktop` (albo worktree od lidera).
2. Raz: `bun install` (Bun na PATH: `<Shared>\tools\bun`).
3. Dwuklik: **`start-cosgral-sandbox.cmd`**.
4. Program dostaje **osobny, pusty** profil Windows (`USERPROFILE` / `APPDATA` / `LOCALAPPDATA` w `%LOCALAPPDATA%\COSGRAL-Sandbox`). **Nie czyta i nie zapisuje** Twojego zwykłego profilu ani `%APPDATA%\OpenBot`.
5. Dostawca = atrapa Codex („Stub: received”). Bez modelu, konta i sieci.
6. Od zera: `start-cosgral-sandbox.cmd --reset` (kasuje tylko folder ze znacznikiem `.cosgral-sandbox`).
7. Prawdziwy Claude/Codex w piaskownicy wymaga osobnego logowania w niej — prościej użyć B.

## B. Instalator Windows

1. W folderze programu: `bun run dist:win` (= `bun run build` + electron-builder NSIS x64).
2. Plik: **`dist\COSGRAL Workspace-0.2.0-x64.exe`**. Obok: `dist\win-unpacked\` (ten sam program bez instalatora).
3. Instalacja: per użytkownik, **bez UAC**; skrót na pulpicie i w Menu Start; po instalacji program może się sam uruchomić (`nsis.runAfterFinish`).
4. Odinstalowanie **nie kasuje danych** (`deleteAppDataOnUninstall: false`).

## C. SmartScreen

Instalator jest **niepodpisany** (`signExecutable: false`). Windows może pokazać „Nieznany wydawca” / SmartScreen. To oczekiwane. Wybierz „Więcej informacji” → „Uruchom mimo to” (tylko jeśli ufasz temu plikowi od zespołu). Antywirus też może pytać.

## D. Gdzie są dane i jak je usunąć

| Skąd start | Baza / ustawienia / sejf | Foldery agentów i pliki |
|---|---|---|
| `start-cosgral.cmd` (z folderu) | `%APPDATA%\COSGRAL Workspace Dev` | `%USERPROFILE%\COSGRAL Workspace` |
| Instalator | `%APPDATA%\COSGRAL Workspace` | `%USERPROFILE%\COSGRAL Workspace` |
| Piaskownica | wewnątrz folderu sandboxa | wewnątrz sandboxa |

OpenBot (`%APPDATA%\OpenBot`) = **nietknięty**.  
Usunięcie: zamknij program → skasuj oba foldery z tabeli (albo `--reset` w piaskownicy). Odinstalowanie samego `.exe` danych **nie** usuwa.

## E. Pierwsze logowanie Claude i Codex

Program **nie loguje się za Ciebie** i nie kopiuje tokenów.

**Najprościej w programie (strona Dostawcy):** Konta i pula → Dodaj konto → Zaloguj → dokończ w przeglądarce / wklej kod **tylko w polu w programie**. Albo: Narzędzia CLI → Pobierz → zgoda w „Needs you”.

**Albo w terminalu (na Twoim profilu, przed `start-cosgral.cmd`):**
1. Codex: zainstaluj CLI → `codex login` → wróć do programu.
2. Claude: zainstaluj Claude CLI (+ Git for Windows) → `claude auth login` → wróć.

Hasła, kody i klucze API: **nigdy do czatu ani do repo**.

## Szybki wybór

| Cel | Co kliknąć |
|---|---|
| Bezpiecznie zobaczyć okno | `start-cosgral-sandbox.cmd` |
| Używać na co dzień z folderu | `bun install` → `start-cosgral.cmd` |
| Jak zwykły program | `bun run dist:win` → instalator z `dist\` |
