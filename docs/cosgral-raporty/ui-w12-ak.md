# UI-AK — Prompt / Condition czytelność w edytorze przepływów

**Gałąź:** `team/ui/w12-ai`  
**Kolejka:** pozycja 3 (UI Designer)  
**Data:** 18.11.2026

## Wynik

1. **Prompt:** własne pole „Prompt text” (nie wspólne „Text”), podpowiedź że to stały tekst bez modelu, podgląd treści na karcie.
2. **Condition:** etykiety Subject / Operator / Compare with, przełącznik Match case, notka Yes/No, podgląd `describeWorkflowCondition` na karcie.
3. **Czytelność węzłów:** szersza karta (260px), kolorowy pasek typu dla prompt/condition, mono w polach tekstu.

## Testy

| Co | Stan |
|---|---|
| `WorkflowsPage.test` | 4/4 (nowy: pola + podgląd) |
| `i18n.test` | 9/9 |
| Biome | OK |
| `typecheck:renderer` | OK |

## Luki

1. Cofnij/ponów i plakietki błędów na węźle (parytet wiersz 60) — nie ten ticket.
2. Nie oglądane w Electronie / Storybooku.
3. Stany puste Library/Usage/Schedule = kolejka #4.

## Następne

Kolejka UI #4: stany puste i błędów (jeden styl) w Bibliotece, Użyciu, Harmonogramie.
