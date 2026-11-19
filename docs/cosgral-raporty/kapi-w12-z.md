# KAPI-Z — i18n ProviderModelPicker

**Gałąź:** `team/kapi/w12-p`  
**Kolejka:** #16  
**Czas:** 19.11 ~01:18  
**Bez push, bez Electrona/dist:win** (brak `GO-kapi-dist.txt`)

## Wynik

| Plik | Zmiana |
|---|---|
| `ProviderModelPicker.tsx` | aria, Choose model, statusy dostawcy, default, ready |
| `en.ts` / `pl.ts` | +~14 kluczy |

## Testy

- `i18n.test` ✅
- Biome OK
- `typecheck:renderer` OK
- Brak dedykowanego testu pickera

## Notka UI

Wybór modelu agenta (Claude/Codex + statusy) po PL.

## Luki

- #3/#7 `dist:win` na `GO-kapi-dist.txt`
- Nazwy własne Claude/Codex Code/CLI bez tłumaczenia sensownego (zostawione)
- Tip KK `merge-preview` nie zawiera jeszcze tego SHA (starszy tip KAPI)
