# Cursor K — autostart backend + NSIS (12.11.2026)

## Werdykt

**Zrobione w kodzie:** `app-shell` przy starcie Electrona sam podnosi lokalny backend (Node + embedded DB przez serwer) na loopback; `package.json` ma skrypt i konfigurację instalatora NSIS.

## Pliki

| Plik | Zmiana |
|---|---|
| `app-shell/src/backend.js` | **NOWY** — resolve repo/data, probe `/api/health`, spawn `node server/dist` lub `pnpm --filter @paperclipai/server dev`, stop na quit |
| `app-shell/src/main.js` | `ensureBackend()` przed oknem; default UI `http://127.0.0.1:3100`; `stopBackend` na `before-quit` |
| `app-shell/package.json` | `electron-builder`, skrypty `dist` / `dist:nsis`, sekcja `build.nsis` → `COSGRAL-Workspace-Setup-${version}.exe` |
| `app-shell/README.md` | procedura bez `start-windows.ps1` |

## Env

- `COSGRAL_REPO` — nadpisanie ścieżki monorepo
- `PAPERCLIP_HOME` / `COSGRAL_DATA` — katalog danych (domyślnie `../work/cosgral-data`)
- `COSGRAL_SKIP_BACKEND=1` — nie spawnuj (gdy serwer już stoi)
- `COSGRAL_UI_URL` — np. Vite `:5173`

## Nie uruchomiono w tej turze

Pełny smoke `npm start` → health 200 (start Postgres + migracje ~minuty) oraz `npm run dist:nsis` (ciężki download builder tools). Konfiguracja i kod są na miejscu.
