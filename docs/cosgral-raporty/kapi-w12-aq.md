# KAPI-AQ — RoutinePanel + setError EN

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #33

## Zakres
- `RoutinePanel`: create / unavailable / load / action / history
- `AppearanceSettings`, `AppSettingsW3` (Computer Use), `TasksPage` load
- `Conversation`: attach limit, queued gone, open link
- `VaultPanel`: save / unavailable / load / delete (+ Delete)
- Klucze PL/EN: +10
- **Omijane:** `App.tsx` publish Error (nie setError UI); Remote/Mobile (KK)

## Testy
- `i18n` 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`
- `window.confirm` Delete w Vault jeszcze EN (następna porcja)

## Notka UI
Błędy rutyn, wyglądu, zadań, załączników, Vault po PL.
