# BE-W: „Działaj w tle” naprawdę działa (Windows) (18.11.2026)

Gałąź `team/backend/w12-w` z integracji `1e5f2bd70` (+ BE-V). Przełącznik „Keep COSGRAL Workspace running in the background” w Ustawieniach był atrapą: nic nie zapisywał ani nie robił. Na Windows zamknięcie okna kończyło program, więc zadania agentów też.

## Co robi teraz
- Ustawienie `behavior.keepBackground` (domyślnie wyłączone) w `AppSettings`, zapisywane razem z `launchAtLogin`; odczyt i zapis jak dotąd (`window.openbot.appSettings.get/update`, zdarzenie `app-settings-changed`).
- Włączone: zamknięcie okna chowa je do **ikony w obszarze powiadomień**; zadania agentów idą dalej. Menu ikony: „Otwórz COSGRAL Workspace” / „Zakończ” (po polsku przy języku PL). Klik i dwuklik w ikonę otwierają okno. Ponowne uruchomienie programu też pokazuje okno (istniejący `second-instance`).
- **Zasada bezpieczeństwa:** okno chowa się tylko, gdy ikona istnieje. Jeśli ikony nie da się zrobić, ustawienie nie działa i zamknięcie kończy program jak dotąd (nikt nie zostaje z ukrytym oknem bez drogi powrotnej).
- macOS bez zmian (ma własną regułę ukrywania okna).
- Wyłączenie ustawienia usuwa ikonę. „Zakończ” z menu i zamknięcie programu usuwają ikonę.

## Pliki
`packages/contracts/src/ipc-agent-settings.ts` (pole, parser, normalizacja), `src/main/background-mode.ts` (logika bez Electrona, testowana), `src/main/background-mode-electron.ts` (adapter Tray, nietestowany jednostkowo), `src/main/agent-settings-ipc.ts` (+3 linie), `src/main/index.ts` (+14 linii: instalacja, jedno pytanie w obsłudze zamknięcia, sprzątanie przy wyjściu).

## Notka dla UI
`SettingsModal.tsx`: przełącznik „Keep … running in the background” jest dalej bez zapisu (jak `launchAtLogin` przed KAPI-J). Podpiąć: odczyt `settings.behavior.keepBackground`, zapis `appSettings.update({ behavior: { keepBackground: checked } })`. Dobrze dopisać pod przełącznikiem zdanie, że program zostaje w ikonie obok zegara.

## Testy (po jednym pliku)
`background-mode.test` 9/9 (reguła zamknięcia, jedna ikona, menu i akcje, wyłączenie, brak ikony = brak ukrywania, zmiana języka, macOS, dispose, funkcje globalne), `ipc-agent-settings.test` 9/9, `ipc-theme.test` 1/1, `agent-settings.test` 13/13 (zapis, restart, odmowa złej wartości), `agent-settings-inputs.test` 3/3, `onboarding.test` 5/5. Biome czysty, `typecheck:contracts/node/renderer` EXIT 0.

## Luki
- **Nie sprawdzone w oknie:** ikona w obszarze powiadomień, ukrycie okna i powrót z menu to prawdziwy Electron (do sondy Testera po GO).
- Dwie pozostałe atrapy w tym samym ekranie: „Restore the last workspace on launch” (stan okna do zapamiętania po stronie UI) i „Open external links in” (COSGRAL = własna przeglądarka). Wymagają decyzji, jak je rozumieć w 0.71.
- Ikona to ta sama grafika co okno (`appIconPath`); osobna, mała ikona zasobnika byłaby ładniejsza.
