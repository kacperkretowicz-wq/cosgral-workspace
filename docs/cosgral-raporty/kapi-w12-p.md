# KAPI-P — i18n poza Conversation (kolejka #5)

Gałąź: `team/kapi/w12-p` (baza `4f21fbfe7`). Bez push, bez Electrona, bez `dist:win`.

## Wynik

| Co | Stan |
|---|---|
| Nowe klucze | **+43** PL/EN (katalogi równe, **1530**/1530) |
| `ContextIndicator` | pełne `t()` (panel, aria, błędy, Compact) |
| Karty agenta | już na `t()` (Brain/Knows/More + etykiety) — bez zmian kodu |
| `AgentActivity` | `aria-label` „Show thinking details” |
| Błędy / aria | Access, Isolation, Browser, Budget, ChannelWorkspace |

## Notka dla UI

1. Kontekst w rozmowie mówi po PL gdy język = pl (wcześniej sztywny EN).
2. Nagłówki Access/Isolation/Browser/Budget (opisy pól) nadal EN — tylko błędy i `aria-label` sekcji.
3. Karty: `t("Brain")` / `t("Knows")` / `t("More")` już były w katalogu.

## Testy

| Plik | Wynik |
|---|---|
| `i18n.test` | ✅ 8/8 |
| `AgentActivity` | ✅ 4/4 |
| Biome (zmienione) | ✅ |
| `typecheck:contracts` / `:renderer` / `:node` | EXIT 0 |

## Luki

1. Pełne teksty Access/Isolation/Browser/Budget (nagłówki, opisy) nadal EN → kolejka **#6** inwentarz.
2. Inne `aria-label` (Sidebar, PageRail, Remote…) nietknięte.
3. Kolejka **#3/#7** `dist:win` czeka na `GO-kapi-dist.txt` (w sandbox tylko `GO-tester-e2e.txt`).
