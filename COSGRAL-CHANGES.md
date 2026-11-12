# COSGRAL Workspace: pochodzenie i zmiany

COSGRAL Workspace to prywatny program zespołu COSGRAL. Bazą jest **OpenBot 0.1.11** z repozytorium `nightly-labs/openbot`, commit `a6fe240209e58ffe5a5fc749d61f306a7218c326` (20.08.2026). To ostatnia wersja wydana na licencji **Apache-2.0**.

- Kod bazowy pozostaje na Apache-2.0. Pliki `LICENSE` i `NOTICE` zachowujemy.
- Pierwszy commit tej gałęzi (`Import OpenBot 0.1.11…`) zawiera kod źródłowy bez zmian. Każda późniejsza zmiana jest widoczna w historii git, a pliki zmienione względem bazy wymienia poniższa lista (Apache-2.0, §4b).
- Nazwa „OpenBot” i logo OpenBot nie należą do nas. Program nazywa się COSGRAL Workspace.
- Funkcje z nowszych wersji OpenBota (od 0.2) odtwarzamy na podstawie opisu zachowania, bez kodu źródłowego tych wersji. Osoby, które implementują, nie otwierają kodu nowszego niż `a6fe240`.

## Zmienione pliki

| Data | Pliki | Zmiana |
|---|---|---|
| 12.11.2026 | `package.json`, `electron-builder.yml` | Własna nazwa, `appId` `pl.cosgral.workspace`, protokół `cosgral://`, aktualizacje z naszego repo |
| 12.11.2026 | `src/main/index.ts`, `src/main/development-profile.ts`, `src/main/host-service.ts`, `src/main/remote-server-manager.ts`, `src/renderer/src/components/InitialSetup.tsx`, `scripts/team-connection-smoke.ts`, `scripts/verify-macos-package.ts`, stories i testy | Linki `cosgral://` zamiast `openbot://`, własny identyfikator aplikacji, własne foldery danych trybu dev |
| 12.11.2026 | `src/backend/bot-store.ts` (+ test) | Dane agentów w `~/COSGRAL Workspace` zamiast `~/OpenBot`, żeby nie kolidować z zainstalowanym OpenBotem |
| 12.11.2026 | `src/renderer/index.html`, `src/main/index.ts`, `src/backend/agent-service.ts`, `NOTICE`, `COSGRAL-CHANGES.md` | Tytuł okna i nazwa klienta „COSGRAL Workspace”, informacja o zmianach |
| 12.11.2026 | `src/renderer/**` (UI copy, `AppLogo`, `styles.css`, `auth.css`, stories, testy), `src/main/**` (komunikaty użytkownika), `src/backend/**` (komunikaty użytkownika), `build/icon*`, `src/renderer/src/assets/cosgral-logo-*.png` (zamiast `openbot-logo-*.png`), `scripts/verify-windows-package.ts`, `scripts/cosgral-*.mjs`, `docs/cosgral/ui-w1*`, `docs/cosgral-raporty/ui-b3-*`, `package.json` (devDeps raster) | B3: marka COSGRAL w UI, własne logo/ikony, makiety W1 light/dark |
| 12.11.2026 | `src/main/index.ts`, `packages/contracts/src/ipc-app-auth.ts`, nowe `src/main/local-owner-account.ts` (+ test) | B1: lokalny profil właściciela zamiast zewnętrznej usługi kont; stara usługa tylko przy ustawionym `OPENBOT_AUTH_API_URL`; flaga `localProfile` w stanie konta dla UI |
| 12.11.2026 | `src/backend/cli.ts`, `src/backend/app-server-client.ts`, `src/backend/claude-client.ts` (+ testy) | B1: CLI Codex i Claude startują bez `shell: true`; na Windows ścieżka ze spacją (np. `C:\Users\Imię Nazwisko\…`) psuła start Codex i odczyt logowania Claude. Zatrzymany klient Codex nie przekazuje już spóźnionego wyjścia (proces Node za `codex.cmd` żyje chwilę dłużej niż `cmd.exe`) |
| 12.11.2026 | `src/backend/agent-service.ts` (+ test) | B1: po `stop()` serwis nie buforuje już fragmentów strumienia od zamykanego klienta (zapis do zamkniętej bazy) |
| 12.11.2026 | `src/backend/agent-service.ts`, `src/backend/mailbox-store.ts` (+ test) | B1: „przeczytane” po wysłaniu wiadomości: renderer podaje ID wiadomości z potwierdzenia, a rozmowa zna ją pod ID dostawy; backend przyjmuje oba (wcześniej po każdym wysłaniu w czacie pojawiał się błąd „Read state failed”) |
| 12.11.2026 | `scripts/reset-dev-state.ts` (+ test) | B1: ścieżki macOS/Linux jako POSIX niezależnie od systemu |
| 12.11.2026 | testy: `src/backend/{agent-service,app-server-client,bot-store,claude-client,cli,mailbox-store,openbot-database}.test.ts`, `src/main/{app-icon,central-auth-manager,remote-desktop-credential-store}.test.ts`, `scripts/dev-services.test.ts`, `src/renderer/src/App.test.tsx`, nowe `src/backend/testing/{fake-cli,databases}.ts` | B1: testy na Windows — atrapy CLI jako `.cmd` + skrypt Node, zamykanie bazy SQLite przed sprzątaniem (EBUSY), ścieżki i prawa plików zależne od systemu, junction zamiast symlinku, limit czasu dla wolnego startu procesów, dwie nieaktualne asercje UI z 0.1.11 |
| 12.11.2026 | `packages/contracts/src/{ipc,ipc-conversation,ipc-channels,ipc-desktop-apis}.ts`, nowe `packages/contracts/src/ipc-eyes.ts` (+ test) | A1: kontrakt „oczu agenta”: rodzaje zatwierdzeń `screen` i `camera`, pole `eyes` w zatwierdzeniu, zdarzenie `eyes-changed`, kanały `agent:get-eyes-state` i `agent:stop-eyes` |
| 12.11.2026 | `src/backend/agent-service.ts`, `src/backend/claude-client.ts` (+ testy), nowe `src/backend/eyes-service.ts` (+ test) | A1: narzędzia `cosgral_eyes` dla Codex (dynamic tools) i Claude (wbudowany serwer MCP); zgoda przez kartę zatwierdzenia z bazy, ekran raz na rozmowę, kamera za każdym razem; podgląd na żywo z limitem; obrazy tylko w `userData/eyes`, z czyszczeniem |
| 12.11.2026 | `src/main/index.ts`, `src/preload/index.ts`, nowe `src/main/eyes-capture.ts` | A1: przechwytywanie okien i ekranów (`desktopCapturer`) i zdjęcie z kamery (`getUserMedia` w ukrytym oknie na własnym schemacie `cosgral-eyes`), IPC stanu i stopu, tymczasowy wskaźnik w tytule okna; wirtualna kamera tylko w buildzie dev (`COSGRAL_FAKE_CAMERA=1`) |
