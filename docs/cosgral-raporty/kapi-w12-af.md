# KAPI-AF — AcpPresetCard / AcpPresets i18n

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #22

## Zakres
- `AcpPresetCard`: brak komendy, instrukcja instalacji, label polecenia, błąd, Dodaj/Dodano przez `t()`
- `AcpPresets`: nagłówek „Quick add ACP agents” przez `t()`
- Klucze PL/EN: +7

## Testy
- `i18n` — oczekiwane 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `AccountLogin` / OTP nadal częściowo EN (następna porcja)
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`

## Notka UI
Szybkie dodawanie presetów ACP (karty Quick add) po PL.
