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
