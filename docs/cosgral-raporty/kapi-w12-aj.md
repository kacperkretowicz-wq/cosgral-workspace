# KAPI-AJ — ThreadPanel / DirectConversation

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #26

## Zakres
- `ThreadPanel`: lista wątków, archiwum, rename/delete/restore, Needs you by thread — przez `t()`; daty `language()` pl-PL/en-US
- `DirectConversation`: status Online/Offline/Private, load/empty/error, composer, typing, aria who@when — przez `t()`; czas wiadomości `language()`
- Klucze PL/EN: +~31
- **Nie** ruszane: Remote / MobileConnect (KK)

## Testy
- `i18n` 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`
- Po tipie: `git merge team/kapi/w12-p` + sprawdź duplikaty kluczy (`en.ts`/`pl.ts`)

## Notka UI
Wątki agenta + rozmowa bezpośrednia (DM) po PL.
