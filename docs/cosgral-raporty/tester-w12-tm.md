# Tester T-M — diagnoza 2 FAIL + zrzuty

Gałąź: `team/tester/w12-tm` (baza `79567cdf9`). GO: `GO-tester-tk.txt`.

## 1. Diagnoza (T-L evidence `e2e-tl`)

| FAIL | Plik:linia | Przyczyna | Rola |
|---|---|---|---|
| overflow | `sandbox-e2e.ts` ~663 | `fail-11`: pełna wysokość, **wszystkie** przyciski szyny, **brak** „More pages”. Komunikat `evaluate: browser has been closed` najpewniej z `finally` po nieudanym kliknięciu (maskował prawdziwy brak More). `setContentSize` + pierwsze okno (mogło być island) nie dawały wiarygodnego 400 px. UI-L już poprawił `PageRail.measure` (`.page-rail-button` + logo 42 px). | **Tester** (skrypt: main window + `setBounds` + dump `navigation-overflow-short` + bezpieczny finally). Jeśli po tym `hasMore=false` przy `innerHeight≈400` → **UI**. |
| usageReport.get | `sandbox-e2e.ts` ~943 | Błąd: `The period is 7, 30, 90, 365 days.` — getter ma `length` 0, więc smoke go woła bez `{period}`. To walidacja kontraktu, nie crash. | **Tester** (`needsInput` += `period is 7`). Nie Backend. |

## 2. Naprawy skryptu

1. Overflow: wybór okna bez `#island`/`#dock`, `setBounds(1100×400)`, log `inner/rail/buttons/more`, dump short, finally w try/catch.
2. IPC: `needsInput` obejmuje komunikat period.

## 3. Przebieg (po build)

(uzupełnione po e2e/W5/zrzutach)
