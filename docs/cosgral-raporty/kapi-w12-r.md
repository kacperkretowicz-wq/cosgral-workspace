# KAPI-R — pełne t() Access / Isolation / Browser / Budget (kolejka #8)

Gałąź: `team/kapi/w12-p` (baza `4f21fbfe7`). Bez push, bez Electrona/dist:win.

## Wynik

| Co | Stan |
|---|---|
| Nowe klucze | **+75** PL/EN (**1605**/1605) |
| AccessSettings | nagłówki, opisy, formularz folderów, notice |
| IsolationSettings | cały panel |
| BrowserProfileSettings | cały panel |
| BudgetSettings | licznik + formularz + eksport |
| Nazwy poziomów dostępu | nadal z kontraktu `ACCESS_LEVEL_INFO` (EN) |

## Notka dla UI / KK

Panele Access…Budget mówią po PL przy `language=pl` (oprócz nazw poziomów z silnika). KK #8 (przegląd inwentarza) może odhaczyć tę lukę.

## Testy

| Co | Wynik |
|---|---|
| `i18n.test` | ✅ 8/8 |
| Biome | ✅ |
| `typecheck:renderer` | EXIT 0 |

## Luki

1. `ACCESS_LEVEL_INFO.name/summary` z contracts — bez tłumaczenia.  
2. `#3/#7 dist:win` bez `GO-kapi-dist.txt`.  
3. P0 rozmowa (ChatSearch…) nadal sztywne aria.
