# app-shell — Electron pod UI COSGRAL Workspace

Prywatna powłoka desktop **COSGRAL Workspace**. **Nie** kopiujemy OpenBot.exe / `app.asar`.  
„Monarchia” = odrzucona nazwa; folder staging `Shared\cosgral-monarchia\` zostaje tylko jako ścieżka bootu.

## Status

Electron + **autostart backendu** (Node API + embedded DB na loopback) + waiting screen gdy UI nie stoi. Instalator: **NSIS** przez `electron-builder`.

```
app-shell/
  package.json             ← scripts dist/dist:nsis + build.nsis
  src/main.js              ← ensureBackend() → probe UI albo waiting.html
  src/backend.js           ← spawn pnpm/node server, health poll, stop on quit
  src/preload.js           ← window.cosgralShell
  src/static/waiting.html  ← animowany ekran oczekiwania + soft poll
  README.md
```

Dane: `Shared\cosgral-monarchia\work\cosgral-data` (albo `PAPERCLIP_HOME` / `COSGRAL_DATA`).

## Odpalenie

Po `install-deps.ps1` w klonie — **bez** ręcznego `start-windows.ps1`:

```powershell
cd C:\Users\kretowicz_k\OpenBot\Shared\cosgral-monarchia\app-shell
npm start
```

Shell sam podnosi `@paperclipai/server` na `127.0.0.1:3100` (jeśli health jeszcze nie żyje). Skip: `$env:COSGRAL_SKIP_BACKEND=1`.

Domyślny UI: `http://127.0.0.1:3100`. Vite: `$env:COSGRAL_UI_URL = "http://127.0.0.1:5173"`.

## Instalator NSIS

```powershell
npm run dist:nsis
# → dist-installer\COSGRAL-Workspace-Setup-0.0.1.exe
```

## Bezpieczeństwo

`contextIsolation` + `sandbox` + bez `nodeIntegration` · single-instance · AppUserModelId `pl.cosgral.workspace`

## Roadmap

utilityProcess + postgres home · Credential Manager · deep-linki · NSIS · przeglądarka agenta
