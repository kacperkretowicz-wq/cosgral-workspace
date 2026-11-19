# KAPI-AL — App.tsx Library/Schedule/Loading + HostPanel

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #28

## Zakres
- `App.tsx`: aria Loading COSGRAL Workspace, Resize left sidebar, nagłówki Library / Schedule przez `t()` (klucze Library/Schedule już były)
- `HostPanel`: placeholder e-mail; daty przez `language()` pl-PL/en-US
- Klucze PL/EN: +3
- Minimum linii w App.tsx

## Testy
- `i18n` 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`
- Resztki EN poza Remote/Mobile (KK): m.in. AccountLogin placeholder

## Notka UI
Biblioteka / Harmonogram / loading i HostPanel (daty + przykład e-mail) po PL.
