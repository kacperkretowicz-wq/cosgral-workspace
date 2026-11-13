# H5 — ekrany UI w prawdziwym Electronie z silnikiem (dokończenie testów 4–5)

**Wykonał:** Okiestrator (zadanie Testera W3-T1 wróciło do lidera). **Data:** 13.11.2026.
**Zakres:** karty (szkic, potwierdzenie), przejęcie przeglądarki, widok kanału, przełącznik Chat | Zadania w spakowanym programie `COSGRAL Workspace.exe`, z atrapą Codexa, w piaskownicy (osobne USERPROFILE, APPDATA, LOCALAPPDATA). Dane `COSGRAL Workspace Dev` nietknięte (przed i po: brak folderu). Po zamknięciu 0 procesów.

## Wynik w skrócie

| # | Kontrola | Stary pakiet (04:37) | Nowy pakiet (integracja `5368cc9a5`) |
|---|---|---|---|
| 1 | Szkic: karta, przyciski Send / Edit / Keep draft | przyciski OK | przyciski OK |
| 1b | Keep draft przetrwa przeładowanie | OK | OK |
| 2 | Karta potwierdzenia: Confirm / Edit / Cancel | OK | OK |
| 3 | Prośba o przejęcie → Take over → Return to agent | OK | OK |
| 4 | Widok kanału (tytuł, lider, członkowie, instrukcje, 7 wiadomości) | **brak** | **OK** |
| 5 | Przełącznik Chat \| Zadania, lista zadań, stan Paused | **brak** | zadania i Paused widać; **Resume nie ma** |

**Przyczyna, że testy 4–5 wcześniej nie szły:** pakiet w worktree Hydry zbudowano o 04:37, przed scaleniem widoku kanałów. Nie zawierał przycisku „Browse channels”. Zbudowałem nowy pakiet z integracji (`bun run package:win`, exit 0) i puściłem skrypt jeszcze raz (124 s, exit 0, zamknięcie czyste).

## Znalezione problemy (dla UI)

1. **Brak Resume dla zadania wstrzymanego (Paused).** Karta zadania po limicie przydziałów mówi „A human can resume or reassign this”, ale `ChannelTasksPanel.tsx` pokazuje Resume tylko dla `cancelled` i `failed`. Dla `paused` jest tylko lista Reassign. Poprawka: dodać `paused` do warunku Resume (i sprawdzić, że `actOnTask` obsługuje wznowienie). Test, który to pilnuje: kontrola `tasksSwitchAndResume`.
2. **Brak przycisku odpowiedzi na wiadomość kanału** w ChannelView (`hasReplyLink: false`). Backend ma `replyToMessageId`, UI robi to w W2-UI2 (za flagą atrapy).
3. **Kontrola `draftCard` na `false` to zbyt ścisły selektor**, nie brak funkcji: karta jest w przypiętej Decyzji, nie w liście wiadomości; przyciski i Keep draft działają.
4. **Skrypt zapisuje `verdict: PASS` mimo kontroli na `false`.** Verdict bierze się z kodu wyjścia, nie z `checks`. Nie należy go brać jako dowodu; liczy się tabela wyżej.
5. W logu aplikacji przy zamykaniu: `UnhandledPromiseRejectionWarning: Object has been destroyed` w `BrowserHost.destroy` (zamykanie przeglądarki agenta). Nie przeszkadza w zamknięciu, ale warto naprawić (Backend).

## Dowody

Zrzuty i logi: `Shared\cosgral-data\desktop-tester\evidence\h5b` (zrzuty 01–09, `drive.log`, `summary.json`, `run-summary.json`). Skrypty: `run-h5b.ps1` i `h5-drive.mjs` w `Shared\cosgral-data\desktop-tester` (kopia ze skryptu Hydry, zmienione tylko ścieżki). Zrzuty pokazują nazwę konta Windows, więc **nie wchodzą do repo** (publiczne).

## Czego nie sprawdziłem

Odpowiedź na wiadomość kanału (brak UI), wielu monitorów, macOS, pracy z prawdziwym Codexem (tylko atrapa).
