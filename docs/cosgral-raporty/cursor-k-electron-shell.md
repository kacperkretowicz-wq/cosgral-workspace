# COSGRAL Workspace P0.4 — Electron shell skeleton

Autor: Cursor K · 11.11.2026 (rename: produkt = **COSGRAL Workspace**, nie Monarchia)  
Ścieżka dysku (staging): `Shared\cosgral-monarchia\app-shell\`

## Werdykt

Minimalny pakiet **COSGRAL Workspace** gotowy: Electron 37 ładuje UI z `http://127.0.0.1:5173` (`COSGRAL_UI_URL`). **Bez NSIS.** Uszko / Cursor USZKO / OpenBot nietknięte.

## Pliki

| Plik | Rola |
|---|---|
| `package.json` | `cosgral-workspace-app-shell` · `productName: COSGRAL Workspace` |
| `src/main.js` | title + AppUserModelId `pl.cosgral.workspace` · `loadURL` |
| `src/preload.js` | `window.cosgralShell` |
| `README.md` | start + `%APPDATA%\COSGRAL Workspace\` |

## Smoke

- `npm install` — Electron **37.10.3** (wcześniejszy P0.4).
- Rename stringów wykonany po korekcie właściciela / CC.

## Start

```powershell
cd Shared\cosgral-monarchia\app-shell
npm start
$env:COSGRAL_UI_URL = "http://127.0.0.1:3100"
```
