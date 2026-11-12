# COSGRAL Electron — Sol contract fix (CC, 11.11.2026 ~21:00)

Cursor K stuck → CC naprawił `app-shell/src/main.js`.

## Zmiany
1. `probeUrl` — tylko HTTP **2xx** = gotowe UI (404/500 = false)
2. `openSafeExternal` — tylko `http:` / `https:`
3. `will-navigate` — blokuje obcy origin względem `UI_URL`
4. `app.whenReady` — tylko wewnątrz `gotLock` (brak drugiego okna po deny)

## Test
```
node24 --test scripts/sol-electron-contract.test.cjs
→ 7/7 PASS (log: raporty/sol-electron-contract-after-cc-fix.log)
```

Rzeczywiste `npm start` okna Electron: NOT RUN w tym torze (Sol może potwierdzić).
OmniRoute: nie. Cursor USZKO: nie.
