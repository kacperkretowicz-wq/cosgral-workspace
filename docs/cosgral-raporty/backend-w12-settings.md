# Backend W12 – ustawienia serwera (BE-D, krok 3) i start naszej aplikacji dla probe (krok 5)

## Kontrakt `window.openbot.serverSettings` (commit osobny, d711e36e3)
- `sections()`: 14 sekcji w kolejności okna 0.71 (General, Personality, Agents, Vault, Members, Remote desktop, MCP, Storage, Sites, Providers, Import, Transfer, Routines, Browser profiles); każda ma źródło: własne ustawienia, istniejące API (`vault`, `remoteDesktop`, `mcp`, `providers`, `routines`, `browserProfiles`, `transfer` dla Import i Przeniesienia: API KK) albo "niedostępne" z powodem (Members i Sites wymagają usługi online).
- `get/update`: Ogólne (nazwa 1–60, logo jako obraz data URL do 256 KB, strefa czasowa IANA albo systemowa, wątki naraz 1–64 albo bez limitu, wątki na agenta 1–16, wspomnienia na agenta 16–4096, przegląd wspomnień co 0/5/10/20/50 tur, uczenie się umiejętności auto/ask/off, uczenie z przeglądania), Osobowość (naturalny/klasyczny), Agenci (domyślne: lokalne skrypty, nowe czaty, plan przed długimi zadaniami, kolejka/sterowanie, współautor w commitach). Jedno zdarzenie `server-settings-changed` z całością.
- `measureStorage/clearLogs`: Pamięć dyskowa (historia czatów, środowiska dostawców, dane aplikacji, możliwe do zwolnienia, wolne miejsce).

## Silnik (commit osobny)
- `ServerSettingsService`: plik `server-settings.json`, zapis atomowy, uszkodzony plik lub zła wartość = domyślne pole, brak zdarzenia przy braku zmiany.
- `storage-report.ts`: folder danych programu sortowany po nazwie (pliki bazy = historia czatów; foldery dostawców/kont/CLI/izolacji = środowiska dostawców; `logs` = do zwolnienia; reszta = dane aplikacji); brak folderu = pusty raport; czyszczenie usuwa tylko zawartość `logs`.
- Skutek: `busyMessageDefault()` jest domyślnym trybem kolejki wiadomości dla agentów ustawionych na "domyślne aplikacji" (połączone z kartami agenta, krok 1).
- IPC: 5 kanałów `server-settings:*`, tylko ten komputer, w `local-only-ipc.test.ts`.

## Krok 5: start naszej aplikacji z atrapą CLI (nie uruchomiony)
`scripts/openbot-probe/launch-cosgral.ts` (opis w README probe): atrapa Codex z e2e, czyste środowisko (`cleanEnvironment()`), profil w piaskownicy, nowy folder danych na start, port debugowania tylko na 127.0.0.1. Po GO lidera: start, `probe.ts --target cosgral --create-agent`, `compare.ts`, zatrzymanie aplikacji.

## Testy
`ipc-server-settings.test.ts` 7, `server-settings.test.ts` 6, `storage-report.test.ts` 3, `launch.test.ts` 4, `launch-cosgral.test.ts` 1, `local-only-ipc.test.ts` zielony; typecheck contracts, node, renderer, storybook; Biome.

## Nie sprawdzone / ograniczenia
- Wartości Ogólne (limity wątków, limit wspomnień, przegląd wspomnień, uczenie umiejętności i z przeglądania, strefa czasowa dla rutyn) są zapisywane i pokazywane, ale agent-service i rutyny jeszcze ich nie czytają; działa tylko domyślny tryb kolejki.
- Logo i nazwa serwera nie trafiają jeszcze do zaproszeń (Members niedostępne).
- Podział "środowiska dostawców" w pomiarze opiera się na nazwach folderów; nieznane foldery wpadają do "danych aplikacji".
- Import i Przeniesienie: API robi KK (g2); tu tylko wskazanie źródła.
- Nie uruchomiono Electrona, Storybooka ani e2e.
