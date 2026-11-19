# KAPI-Y — i18n SkillsSettings + QueueHoldNotice + EyesIndicator

**Gałąź:** `team/kapi/w12-p`  
**Kolejka:** #15  
**Czas:** 19.11 ~00:48  
**Bez push, bez Electrona/dist:win** (brak `GO-kapi-dist.txt`)

## Wynik

| Plik | Zmiana |
|---|---|
| `SkillsSettings.tsx` | błędy + biblioteka + wersje przez `t()` |
| `QueueHoldNotice.tsx` | „Message queued” + przycisk budżetu |
| `EyesIndicator.tsx` | badge, pasek, Stop, szczegóły zgody |
| `en.ts` / `pl.ts` | +~31 kluczy |

## Testy

- `EyesIndicator` + `QueueHoldNotice` + `i18n` → **18/18**
- Biome OK
- `typecheck:renderer` OK

## Notka UI

Oczy agenta i wstrzymanie kolejki (budżet) po PL; biblioteka skilli (globalna) też.

## Luki

- #3/#7 `dist:win` na `GO-kapi-dist.txt`
- RemoteDesktop/MobileConnect — KK (ich gałąź); nie ruszane tu
- `ProviderModelPicker` nadal częściowo EN (następna pozycja)
