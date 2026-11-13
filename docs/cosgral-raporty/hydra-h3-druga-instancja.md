# Raport H3: Optymalizacja czasu wyjścia drugiej instancji (single-instance guard)

**Agent:** Hydra Nakurwiacz 1  
**Rola:** Lekkie zadania i weryfikacja  
**Gałąź:** `team/hydra/h3-second-instance` (od `codex/cosgral-desktop` @ `08e8cbbe4`)  
**Data:** 13.11.2026 CET  
**Zakres:** Diagnoza i eliminacja opóźnienia (~6,1 s) przy zamykaniu drugiej instancji COSGRAL Workspace na Windowsie, osiągnięcie czasu wyjścia poniżej 3,0 s zgodnie z wymaganiami `scripts/verify-windows-package.ts` bez ruszania progów weryfikatora.

---

## Werdykt

**Sukces pełny. Czas zamykania drugiej instancji został zredukowany z ~6,1 s do średnio 2,42 s (spadek o 60%), oficjalny skrypt `scripts/verify-windows-package.ts` przeszedł z kodem 0 bez zmian progów, a pełny zestaw testów (738/738) zaliczony bez regresji.**

1. **Czas wyjścia drugiej instancji:**
   - Poprzednio (H2 baseline): **6,13 s** (6,07 s / 6,27 s / 6,03 s).
   - Obecnie (H3 z `enforceSingleInstance`): **2,42 s** (2,41 s / 2,02 s / 2,83 s).
   - Wszystkie 3 próby w izolowanej piaskownicy poniżej limitu 3 000 ms.
2. **Weryfikacja skryptem `scripts/verify-windows-package.ts`:**
   - Status: **PASSED (exit code 0)**.
   - Pomyślnie zwalidowane wszystkie asercje: metadane, licencje, integralność ASAR, utwardzone fuses, brak spakowanego Claude CLI, start i natychmiastowe wyjście duplikatu.
3. **Zestaw testów:**
   - Nowy plik testowy `src/main/single-instance.test.ts`: **3/3 testy zdane**.
   - Cały pakiet `bun run test`: **99 plików, 738 testów zdanych (100%)**.

---

## Analiza przyczyny źródłowej (Root-Cause)

W bazowej implementacji `src/main/index.ts` występowały dwa problemy powodujące 6-sekundowe opóźnienie:

1. **Opóźniona weryfikacja i rozgałęzienie:**
   Chociaż `app.requestSingleInstanceLock()` było wywoływane w okolicach linii 170, samo sprawdzenie `if (!hasSingleInstanceLock)` i wywołanie zamknięcia znajdowało się dopiero na końcu pliku (linia 1111). W międzyczasie druga instancja bez potrzeby wykonywała rejestrację schematów (`registerCustomSchemes`), konfigurację bezpiecznych IPC, subskrypcje zdarzeń i parsowanie środowiska.

2. **Mechanizm `app.quit()` a asynchroniczny demontaż Chromium:**
   Kluczowy powód: w Electronie na Windowsie wywołanie `app.quit()` przed `app.whenReady()` nie powoduje natychmiastowego zakończenia procesu, lecz uruchamia asynchroniczny, pełny cykl zwalniania zasobów podsystemów Chromium (zarządzanie wątkami audio, GPU, siecią, pamięcią podręczną). Na maszynie Windows proces ten trwa od 5,5 do 6,5 sekundy.
   
   Natomiast w architekturze Electrona:
   - `app.requestSingleInstanceLock()` wysyła synchroniczny komunikat Win32 (`WM_COPYDATA`) do instancji nadrzędnej (przekazując argumenty wiersza poleceń oraz URL-e protokołów) **zanim** funkcja zwróci `false`.
   - Gdy `requestSingleInstanceLock()` zwróci `false`, rola drugiej instancji jest już w 100% zrealizowana (pierwsza instancja otrzymała fokus i dane).
   - Zastosowanie natychmiastowego wyjścia przez `app.exit(0)` oraz `process.exit(0)` ucina zbędne oczekiwanie na wątki Chromium, kończąc proces w czasie poniżej 10 ms od zwrócenia `false` przez blokadę (łączny czas procesu od startu .exe do zakończenia spada do ~2,0–2,8 s).

---

## Zaimplementowane zmiany

1. **Nowy moduł: `src/main/single-instance.ts`**
   - Wprowadza funkcję `enforceSingleInstance(host, onDuplicate)` z możliwością wstrzyknięcia implementacji hosta (łatwe testowanie jednostkowe).
   - Domyślnie przy braku blokady natychmiast wywołuje `host.exit(0)` i `process.exit(0)`.
   - Umożliwia przekazanie niestandardowego handlera `onDuplicate` na potrzeby testów.

2. **Integracja w `src/main/index.ts`**
   - Wywołanie `enforceSingleInstance(app)` na samym szczycie cyklu życia aplikacji (zaraz po ustawieniu `AppUserModelId`).
   - Usunięcie opóźnionego bloku `if (!hasSingleInstanceLock) app.quit() else ...` z dolnej części pliku.

3. **Test jednostkowy: `src/main/single-instance.test.ts`**
   - Test 1: Pierwsza instancja otrzymuje blokadę i kontynuuje działanie bez wywoływania `exit`.
   - Test 2: Druga instancja bez blokady wywołuje przekazany callback i nie kontynuuje.
   - Test 3: Domyślne zachowanie natychmiast wywołuje `host.exit(0)` oraz `process.exit(0)`.

---

## Wyniki pomiarów w piaskownicy (H3)

Procedura wykonana za pomocą `Shared\cosgral-data\desktop-hydra\verify-package-h3.ps1`:
- Izolowany profil: `Shared\cosgral-data\desktop-hydra\sandbox-h3`
- Unpacked build: `dist\win-unpacked\COSGRAL Workspace.exe`
- Pierwsza instancja uruchomiona w tle (potwierdzona żywa, PID aktywny).
- Druga instancja mierzona obiektem `System.Diagnostics.Stopwatch`.

| Runda | Status wyjścia | Czas [ms] | Czas [s] | Exit Code | Pierwsza instancja aktywna |
|---|---|---|---|---|---|
| **Runda 1** | Exited (`True`) | **2 408 ms** | 2,41 s | 0 | `True` |
| **Runda 2** | Exited (`True`) | **2 025 ms** | 2,02 s | 0 | `True` |
| **Runda 3** | Exited (`True`) | **2 828 ms** | 2,83 s | 0 | `True` |
| **Średnia** | - | **2 420 ms** | **2,42 s** | **0** | **100% OK** |

Wszystkie pomiary poniżej limitu 3 000 ms.

---

## Wynik `bun scripts/verify-windows-package.ts`

```text
Verified C:\Users\x1 Yoga\OpenBot\Shared\cosgral-wt\desktop-hydra\dist\win-unpacked
COSGRAL Workspace 0.2.0 · Windows x64 · metadata · licenses · ASAR integrity · hardened fuses · no bundled Claude CLI · launch
```
Kod wyjścia: **0** (Sukces).

---

## Wynik pełnego zestawu testów (`bun run test`)

```text
 Test Files  99 passed (99)
      Tests  738 passed (738)
   Duration  326.83s
```
Wszystkie testy zaliczone pomyślnie.
