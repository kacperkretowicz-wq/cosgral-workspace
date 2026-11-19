# KAPI-AG — AccountLogin / OtpInput i18n

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #23

## Zakres
- `AccountLogin`: tytuły, opisy, błędy walidacji, przyciski, timery, Development code przez `t()`
- `OtpInput`: aria-label, Verifying…, domyślne error/success przez `t()`
- Klucze PL/EN: +~36

## Testy
- `i18n` — oczekiwane 8/8
- `AccountLogin` / `OtpInput` — lekkie
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`
- komunikaty `issue.message` z silnika nadal EN (nie UI)

## Notka UI
Ekran logowania konta i pole OTP po PL.
