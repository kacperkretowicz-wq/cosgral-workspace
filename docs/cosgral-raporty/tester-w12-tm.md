# Tester T-M — diagnoza 2 FAIL + zrzuty

Gałąź: `team/tester/w12-tm` (baza `79567cdf9`). GO: `GO-tester-tk.txt`.

## 1. Diagnoza (T-L evidence `e2e-tl`)

| FAIL | Plik:linia | Przyczyna | Rola |
|---|---|---|---|
| overflow | `sandbox-e2e.ts` ~663 | T-L `fail-11`: pełna wysokość / brak More (viewport nie kurczy Electron). T-M po `setBounds`: błąd `evaluate: browser closed` w **2 ms** — krok wołał `first.app` **po** `first.app.close()` (restart); żywe jest `second.app`. Dump `fail-11` = pełne okno Agents, nie short. UI-L measure w integracji. | **Tester** (`second.app` + setBounds + dump short). Jeśli po tym `hasMore=false` przy ~400 px → **UI**. |
| usageReport.get | `sandbox-e2e.ts` ~943 | Błąd: `The period is 7, 30, 90, 365 days.` — getter ma `length` 0, więc smoke go woła bez `{period}`. To walidacja kontraktu, nie crash. | **Tester** (`needsInput` += `period is 7`). Nie Backend. |

## 2. Naprawy skryptu

1. Overflow: wybór okna bez `#island`/`#dock`, `setBounds(1100×400)`, log `inner/rail/buttons/more`, dump short, finally w try/catch.
2. IPC: `needsInput` obejmuje komunikat period.

## 3. Przebieg (po build)

(uzupełnione po e2e/W5/zrzutach)
