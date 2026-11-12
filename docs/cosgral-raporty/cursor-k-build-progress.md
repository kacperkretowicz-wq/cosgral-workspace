# COSGRAL Workspace — Cursor K progress (build + shell)

11.11.2026 · Cursor K

## Werdykt

**Backend żyje na tym PC.** Nie jest jeszcze pełny OpenBot 1:1 (kanały/Vault/karty/phone = dalej), ale silnik COSGRAL startuje i Electron się odpala.

| Check | Wynik |
|---|---|
| `pnpm install` (klon staging, Node 24.22.1, pnpm 9.15.4) | **PASS** (~4m46s) |
| build `shared` + `plugin-sdk` | **PASS** |
| build `db` | **PASS** po fix Windows (`copy-migrations.mjs` zamiast `rm`/`cp`) |
| `GET http://127.0.0.1:3100/api/health` | **200 ok** · embedded postgres :54329 · 425 migracji · `local_trusted` |
| Vite `127.0.0.1:5173` | start OK (optimizer długo skanuje deps) |
| Electron shell smoke | **PASS** (`electron.exe` start+kill; waiting/UI load path) |

## Co dorobiłem

- Electron: waiting screen + probe loopback (`app-shell/src/static/waiting.html`)
- Motion: `ui/src/cosgral-shell-motion.css` + page-enter w `Layout.tsx`
- Skrypty: `scripts/install-deps.ps1`, `start-windows.ps1`, `start-windows.md` (z żywą procedurą)
- Fix Windows: `packages/db/scripts/copy-migrations.mjs` + `package.json` build

## Dane / procesy

- `PAPERCLIP_HOME` = `Shared\cosgral-monarchia\work\cosgral-data`
- API nadal może działać w tle na **3100** (nie zabijałem po smoke)
- Agent JWT: missing (onboard później) — nie blokuje health
- Backup warning: brak `.sql.gz` jeszcze

## Nie gotowe (uczciwie)

Pełny look+flow jak OpenBot „jeszcze lepszy” (kanały N, karty akcji, Vault, phone, animacje wszędzie, OpenCode/OpenRouter, auth 2 właścicieli live). To tor zespołu / następne tury.

## Zakazy

Uszko / Cursor USZKO / kopiowanie OpenBot — nietknięte.
