# KAPI-AR — Vault/Routine/Memory confirm

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #34

## Zakres
- `VaultPanel`: confirm zapisu kontaktu/TOTP, `Delete {name}?`, Edit / Add item
- `RoutinePanel`: confirm wymiany sekretu webhooka + Generate new secret
- `MemoryPanel`: `Delete this memory?`
- Klucze PL/EN: +4
- **Omijane:** Remote/Mobile (KK); pozostałe `confirm` już przez `t()`

## Testy
- `i18n` 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`

## Notka UI
Potwierdzenia Vault / rutyn / pamięci po PL.
