# COSGRAL Workspace: jak uruchomić

**Następny krok (ok. 1 min):** w folderze programu kliknij dwukrotnie `start-cosgral.cmd`. Po pierwszym uruchomieniu pokaże się ekran powitalny, a po nim okno z listą agentów.

## 1. Trzy sposoby uruchomienia

| Co chcesz | Jak | Gdzie są dane |
|---|---|---|
| Używać programu na swoim profilu Windows | `start-cosgral.cmd` | `%APPDATA%\COSGRAL Workspace Dev` i `%USERPROFILE%\COSGRAL Workspace` |
| Spróbować bez ryzyka (bez modelu, konta i sieci) | `start-cosgral-sandbox.cmd` | osobny folder `%LOCALAPPDATA%\COSGRAL-Sandbox` |
| Zainstalować jak zwykły program | `bun run dist:win`, potem instalator z `dist\` | `%APPDATA%\COSGRAL Workspace` i `%USERPROFILE%\COSGRAL Workspace` |

Wymagania do uruchomienia z folderu: Bun (do `bun install` i budowania) i Windows 10 lub nowszy. Node.js nie jest potrzebny do samego programu (tylko do testu z punktu 6).

**Pierwszy raz z folderu (kroki 1 z 3, ok. 5 min):**
1. `bun install` (raz).
2. `start-cosgral.cmd`. Skrypt sam zbuduje program (`bun run build`, ok. 30 s), jeśli jeszcze go nie zbudowano.
3. Po zmianie lub aktualizacji kodu: `start-cosgral.cmd --rebuild`.

Skrypt czyta opcjonalny plik `cosgral-local.cmd` obok siebie (nie trafia do repozytorium). Użyj go, gdy `codex` lub `claude` nie jest na `PATH`:

```bat
set "COSGRAL_CODEX_PATH=C:\sciezka\do\codex.cmd"
set "COSGRAL_CLAUDE_PATH=C:\sciezka\do\claude.exe"
```

## 2. Wersja piaskownicowa

`start-cosgral-sandbox.cmd` uruchamia program z własnym, pustym profilem Windows (osobne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`) i atrapą Codex. Atrapa odpowiada „Stub: received” na zwykłą wiadomość. Nie używa modelu, konta ani sieci i nie czyta ani nie zapisuje niczego z Twojego profilu.

- Inny folder: `start-cosgral-sandbox.cmd "D:\moj folder"`.
- Zacząć od zera: `start-cosgral-sandbox.cmd --reset` (kasuje tylko folder, który ten skrypt sam utworzył).
- Żeby w piaskownicy użyć prawdziwego dostawcy, trzeba się zalogować wewnątrz niej, bo ma osobny profil. Prościej użyć zwykłego `start-cosgral.cmd`.

## 3. Gdzie są dane

| Co | Gdzie |
|---|---|
| Baza (agenci, rozmowy, kanały, Vault, tabele, rutyny), ustawienia, Mobile Connect, certyfikat telefonu | `%APPDATA%\COSGRAL Workspace Dev\` (z folderu) lub `%APPDATA%\COSGRAL Workspace\` (z instalatora) |
| Przestrzenie robocze agentów, pliki wspólne, pobrane pliki | `%USERPROFILE%\COSGRAL Workspace\Bots`, `\Shared`, `\Downloads` |

Dane zwykłego OpenBota (`%APPDATA%\OpenBot`) nie są używane ani zmieniane. Wersja z folderu i wersja z instalatora mają **osobne bazy**, ale wspólny folder `%USERPROFILE%\COSGRAL Workspace`.

Kopia zapasowa: zamknij program i skopiuj oba foldery. Usunięcie danych: zamknij program i skasuj oba foldery.

## 4. Logowanie dostawcy (Codex lub Claude)

Program nie loguje się sam i nie kopiuje tokenów: używa logowania istniejącego narzędzia wiersza poleceń.

**Codex (ChatGPT):**
1. Zainstaluj Codex CLI i upewnij się, że polecenie `codex` działa w PowerShell (albo wskaż je w `cosgral-local.cmd`).
2. W PowerShell: `codex login` i zaloguj się kontem ChatGPT w przeglądarce.
3. Uruchom program ponownie. Na ekranie „Set up this computer” przy Codex powinno być „Available” i Twój e-mail.

**Claude:**
1. Zainstaluj Claude CLI (wymaga Git for Windows).
2. W PowerShell: `claude auth login`.
3. Uruchom program ponownie. Przy Claude powinno być „Available”.

Program szuka poleceń w `PATH`, a potem w: `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`, `%LOCALAPPDATA%\Microsoft\WinGet\Links\claude.exe`, `%APPDATA%\npm\`, `%USERPROFILE%\.local\bin\` i `%USERPROFILE%\.bun\bin\`. Zmienne `OPENBOT_CODEX_PATH` i `OPENBOT_CLAUDE_PATH` mają pierwszeństwo.

Sprawdzenie bez uruchamiania modelu (z folderu): `bun run codex:doctor`.

## 5. Instalator Windows

`bun run dist:win` buduje program i instalator w `dist\`:
- `COSGRAL Workspace-0.2.0-x64.exe` (instalator NSIS, niepodpisany: Windows SmartScreen pokaże ostrzeżenie „nieznany wydawca”),
- `dist\win-unpacked\` (ten sam program bez instalatora, można go uruchomić bezpośrednio).

Przy pierwszym budowaniu potrzebne są pliki, które electron-builder pobiera z internetu (Electron, NSIS, winCodeSign). Zespół trzyma je w pamięci podręcznej; ustaw `ELECTRON_CACHE` i `ELECTRON_BUILDER_CACHE` na jej foldery, żeby budować bez sieci.

Zainstalowany program sprawdza aktualizacje w publicznych wydaniach repozytorium wskazanym w `electron-builder.yml` (`publish`). Jeśli ma ich nie sprawdzać, usuń sekcję `publish` przed budowaniem.

## 6. Test automatyczny całej aplikacji

Wymaga Node.js 24 (uruchamia skrypt TypeScript bezpośrednio) i zbudowanego programu. Najpierw `bun run build`, a potem:

```bat
set COSGRAL_SANDBOX_ROOT=C:\temp\cosgral-sandbox
bun run sandbox:e2e
```

Skrypt uruchamia prawdziwy program w piaskownicy z atrapą Codex i przechodzi ścieżkę użytkownika: ekrany pierwszego uruchomienia, nowy agent, wiadomość z odpowiedzią, restart z zachowaną historią, każda strona szyny stron (z zebraną konsolą), odczyty całego `window.openbot`, parowanie telefonu przez TLS z przypiętym odciskiem, narzędzie agenta. Dowody (zrzuty ekranu, `run.json`) trafiają do `%COSGRAL_SANDBOX_ROOT%\evidence`.

## 7. Czego jeszcze nie ma w oknie programu

- Strony „Tasks” i „Usage” pokazują „Coming soon”.
- Ekran Mobile Connect (kod QR, urządzenia) i ekran dostawców z limitami są w trakcie budowy. Silnik telefonu działa i jest sprawdzony testem; aplikacja telefonu jest pod adresem pokazanym w parowaniu (`…/app/`).
- Ekran powitalny i część Ustawień mają surowy wygląd (jeszcze bez stylów).

## 8. Gdy coś nie działa

- **Okno się nie otwiera:** uruchom `node_modules\electron\dist\electron.exe .` w wierszu poleceń i odczytaj komunikat.
- **„Complete agent CLI setup to start” w polu wiadomości:** program nie widzi Codex ani Claude albo nie jesteś zalogowany (punkt 4).
- **Chcesz zacząć od zera:** zamknij program i skasuj foldery z punktu 3 (albo użyj `--reset` w piaskownicy).
