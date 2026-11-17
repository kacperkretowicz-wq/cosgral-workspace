# W11-KK: `scripts/live-dev.ts` (kopia robocza dla botów)

**Gotowe: skrypt przygotowuje osobną kopię programu dla bota (własny worktree, własne dane, własny dom agentów) i drukuje komendę startu. Nie uruchamia Electrona, nie łączy się z siecią.**

## Użycie
- `bun scripts/live-dev.ts plan <nazwa>` – pokazuje układ, środowisko i komendę startu (nic nie tworzy).
- `bun scripts/live-dev.ts create <nazwa> [--port N] [--base REF] [--root DIR]` – `git worktree add -b live/<nazwa>` + puste foldery danych.
- `bun scripts/live-dev.ts remove <nazwa> [--root DIR]` – usuwa worktree i foldery danych; gałąź `live/<nazwa>` zostaje.
- Domyślny korzeń: `Shared\cosgral-live\<nazwa>\{checkout,appdata,home}`.

## Jak jest odizolowane
1. `APPDATA`, `XDG_CONFIG_HOME` → `appdata` kopii, więc `userData` Electrona (baza, Vault, profil przeglądarki) leży pod kopią.
2. `USERPROFILE`, `HOME` → `home` kopii, więc folder agentów `COSGRAL Workspace` też.
3. Port rendera ze stabilnego skrótu nazwy (5200–5999), katalog wyjściowy `out-dev-live`.
4. Do kopii trafia tylko krótka lista zmiennych (PATH, TEMP itp.); tokeny i klucze właściciela nie.
5. Nazwa tylko `[a-z0-9-]`, ścieżki sprawdzone, że leżą pod korzeniem.

## Sprawdzono
`vitest run scripts/live-dev.test.ts` 9/9; `biome check` obu plików czysto; `tsc --noEmit -p tsconfig.node.json` kod 0; `bun scripts/live-dev.ts plan demo` wypisuje układ.

## Nie sprawdzono
`create` i `remove` na prawdziwym repo (tylko testy z atrapą gita), start Electrona w kopii, `bun install` w kopii, czy `index.ts` wszędzie czyta `APPDATA`/`homedir()` (nie czytałem całego kodu).
