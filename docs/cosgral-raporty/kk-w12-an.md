# KK-AN: parytet i PRZEWODNIK po scaleniu `7d5fd871c`

Stan: 19.11.2026, gałąź `team/kk/w12-ai` (przewinięta do integracji `7d5fd871c`). Tylko dokumenty; bez Electrona i Storybooka.

## Wynik

**Parytet kodowy 81,8% (63,0 z 77), w oknie 52,6% (bez zmiany, brak nowego odbioru), ostrożnie 61,0%.** Wiersze 2 (Wygląd) i 71 (telefon: kanały w PWA) są teraz „jest”.

| Miara | Było | Jest |
|---|---|---|
| Kod | 79,9% | **81,8%** (53 jest, 20 częściowo, 4 brak) |
| Skontraktowane / Silnik / Ekran | ~92,9 / ~92,2 / ~86,4% | **~94,2 / ~93,5 / ~88,3%** |
| W oknie | 52,6% | 52,6% |
| Ostrożnie | 60,4% | 61,0% |

1. **Wiersz 2:** `AppearanceSettings.tsx` ma wszystkie 7 kontrolek, w tym „Unread first” (UI-AT). O zostaje „część”.
2. **Wiersz 71:** `src/mobile-app/app.ts` ma zakładkę „Channels” (UI-13), API kanałów i szczegół zadania (BE-AB/AD). O zostaje „nie”. Luki: brak odświeżania z `/v1/events`, tworzenie kanału tylko na komputerze.
3. **Poprawka nagłówka:** stary nagłówek miał 5 „brak”, a tabela 4. Backend zmienił wiersz 71 z „brak” na „częściowo” (BE-AB) i nagłówek nie nadążył. Od teraz liczę skryptem wprost z tabeli (reguły jak w nagłówku).
4. **PRZEWODNIK:** „Wygląd i pisanie” ma siedem kontrolek (z „Unread first”), wiersz „Telefon” opisuje zakładkę „Channels” w aplikacji telefonu, sekcja „Wygląd” pkt 6 uzupełniona.
5. **Testy:** brak (dokumenty). Liczby sprawdzone skryptem na tabeli; zgodność z kodem sprawdzona przez `grep` w `AppearanceSettings.tsx` i `mobile-app/app.ts`.

## Luki

1. Kliknięcie „Unread first” i ekran PWA na telefonie nie były widziane w oknie ani na telefonie (brak GO).
2. Teach i Voice w menu „+” nadal wyłączone (bez kontraktu silnika).
3. Po scaleniu zostają do zrobienia przez UI: `useRestoreWorkspace` + `workspace.byServer`.
