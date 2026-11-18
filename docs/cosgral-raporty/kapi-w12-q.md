# KAPI-Q — odświeżenie i18n-inwentarz + test kompletności (kolejka #6)

Gałąź: `team/kapi/w12-p` (baza `4f21fbfe7`). Bez push, bez Electrona.

## Wynik

1. `docs/cosgral/i18n-inwentarz.md` — nowa sekcja **Stan aktualny (18.11)** na górze; W7-T2 oznaczone jako archiwum.
2. Metryki: **1530/1530** kluczy; ~63 pliki z `t()`; ~91 sztywnych `aria-label="…"`.
3. Test: `i18n.test` — parytet + niepuste + **≥ 1500** kluczy; skan `t()` obejmuje KAPI-P.

## Priorytet dalej (z inwentarza)

P0 rozmowa (ChatSearch, MessageRendering, SelectionActions…); P1 pełne Access/Budget/…; wyspa PL `AgentAccountPicker`.

## Testy

| Co | Wynik |
|---|---|
| `i18n.test` | ✅ 8/8 |
| Biome | na zmienionych |

## Luki

1. Inwentarz nie jest AST (template literals / dynamiczne klucze).  
2. `#3/#7 dist:win` bez `GO-kapi-dist.txt`.
