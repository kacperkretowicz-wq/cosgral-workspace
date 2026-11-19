# KAPI-AN — Sidebar SVG titles + fallbacki błędów

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #30

## Zakres
- `Sidebar` SVG `<title>`: Limit / Error / Responded przez `t()`
- Fallbacki błędów konta i wiersza: usage, link, update, logout, avatar, mark-read, change agent
- Klucze PL/EN: +9 (Error już było)
- **Omijane:** RemoteMacPanel / Mobile / ChannelWorkspace (KK); brand; English/Polski; HTTP

## Testy
- `i18n` 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`
- Skan atrybutów TSX (poza Remote/Mobile): czysty po #30

## Notka UI
Ikony statusu agenta w bocznym pasku (Limit/Error/Responded) + komunikaty błędów konta/wiersza po PL.
