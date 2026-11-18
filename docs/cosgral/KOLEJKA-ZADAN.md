# Kolejka zadań (samoobsługa agentów)

Po co: agent, który oddał wynik, nie czeka na przydział lidera. Bierze pierwszą nieoznaczoną pozycję ze swojej sekcji,
dopisuje na jej początku `[w toku: ROLA, godzina]`, a po oddaniu zmienia na `[zrobione: SHA]`. Lider uzupełnia kolejkę i scala.

Zasady jak w kanale: gałąź `team/<rola>/<temat>`, bez push, bez `--force`, lekkie polecenia po jednym pliku, ciężkie (Storybook, e2e, build,
`dist:win`, pełny check) tylko za plikiem `GO-*.txt` w `Shared\cosgral-sandbox`. Kodu z paczki OpenBota 0.71 nie przepisujemy do repo.
Źródła pozycji: `parytet-0.71.md`, `luki-silnika-071.md`, `pytania-do-wlasciciela.md`, `vs-071.txt` Testera, `openbot-0.71-kolejka-ui.md` (poza repo).

## UI Designer
1. [zrobione: 6af21006e] Kolejne ekrany P0, potem P1 z `openbot-0.71-kolejka-ui.md`, których `vs-071.txt` nie oznacza jako zgodne.
2. [zrobione: d72f80e79] Skeleton i ruch w pozostałych panelach, które jeszcze pokazują gołe „Loading…”.
3. [zrobione: 805a58a84] Edytor przepływów: pola Prompt i Condition, czytelność węzłów.
4. [zrobione: 2f27ebb57] Stany puste i błędów (jeden wspólny styl) w Bibliotece, Użyciu, Harmonogramie.
5. [zrobione: 596a49964] Dostępność: fokus, kontrast, `prefers-reduced-motion` na nowych ekranach.
6. Ustawienia agenta: podstrony Knows (instrukcje, skille) i bogatsze karty Brain, zgodnie z tabelą Testera (T-AG: „częściowo”).
7. Marketplace Apps: układ i filtry bliżej 0.71 (T-AG: „częściowo”).
8. Pasek boczny: przypinanie i „Więcej” (T-AG: „częściowo”).
9. Tablica Zadań: kolumny dla zadań nieudanych i anulowanych (UI-AI luka); wymaga kontraktu od Backendu (patrz Backend 6).
10. Kontrolki wyglądu w ustawieniach: skala interfejsu, czcionka, akcent, skrót wysyłania (silnik gotowy: KAPI-N, BE-U).
11. Zakładki i podgląd mediów w rozmowie: zamiast tekstu „Loading” szkielet; ContextIndicator.

## KK Fullstack
1. [zrobione: 28f240e08 (Clear history)] [zrobione: da3ad22fd (okno historii)] Przycisk „Clear history” w widoku kanału, lista „okno historii” (po Backendzie BE-Z).
2. [zrobione: 28f240e08] Usunięcie martwego `SettingsModal`.
3. Przeliczenie `parytet-0.71.md` po każdym odbiorze Testera (kod / ostrożnie / w oknie).
4. `PRZEWODNIK.md`: kroki „jak zobaczyć” dla każdej nowej funkcji.
5. Luki z `pytania-do-wlasciciela.md`, które da się domknąć bez decyzji właściciela.
6. Historyjka Storybook dla listy „okno historii” (Dark/Light) i sprawdzenie kontrastu.
7. Odbiór własnych paneli (Aktualizacje, Mobile Connect, Głos, Komunikatory, Integracje, Podagenci) po zrzutach Testera 17-11-i.
8. Przegląd `i18n-inwentarz.md`: co zostało po angielsku w moich panelach, tłumaczenie przez `t()`.

## Backend Expert
1. [zrobione: 41e810e1b] `historyWindow` kanału (kontrakt, silnik, atrapa, testy).
2. [zrobione: 971d371ea — skrót wysyłania i kroki agenta działają w oknie] Kolejne luki z `luki-silnika-071.md`, najbardziej widoczne dla człowieka.
3. [zrobione: T-AF, e2e 0 FAIL, W5 33/33; każdy kolejny ^FAIL biorę z raportu Testera] Diagnoza każdego `^FAIL` z e2e i kroków W5, z logiem.
4. [zrobione: 53002be2b] Ostrzeżenie `MaxListenersExceededWarning` (preload `agent:event`): przyczyna i poprawka.
5. [zrobione: a29b584f2] Kontrakt i silnik tablicy Zadań z kolumnami „nieudane” i „anulowane” (dla UI 4).
6. [w toku: Backend, 21:21 — wiersz 71: telefon, kanały w PWA (API telefonu); reszta „ROBIĆ” silnika: 0 h wg tabeli] Pozostałe wiersze „ROBIĆ” w `luki-silnika-071.md` oraz `parytet-0.71.md` po stronie silnika (wybierz najbardziej widoczne).
7. [skrót wysyłania zrobione: 971d371ea; zostaje „nieprzeczytane najpierw” = `appearance.unreadFirst`: sortowanie siedzi w układzie paska z folderami i ręczną kolejnością] Ustawienie „skrót wysyłania” i „nieprzeczytane najpierw” faktycznie używane w polu wiadomości i na liście agentów.

## KAPI
1. [zrobione: 401bafe8f] Dalsze sztywne EN w TSX przez `t()` (klucze PL/EN równe, `i18n.test`).
2. [zrobione: acc270061] Rozmiar podglądu w przeglądarce (cel: razem < 1,8 MB, plik < 1 MB).
3. Instalator `dist:win`: pomiar po każdym większym scaleniu (tylko za `GO-kapi-dist.txt`).
4. [zrobione: 401bafe8f] Luki ROBIĆ (wiersz 2 wygląd: appearanceDomTokens + startAppearance) z `parytet-0.71.md` poza zakresem Backend/KK/UI (wybierz jedną, uzasadnij).
5. Sztywne EN poza Conversation: ContextIndicator, nazwy kart, błędy, `aria-label`; skan `i18n.test`.
6. Odświeżenie `i18n-inwentarz.md` i test kompletności (klucze PL/EN równe).
7. Po `GO-kapi-dist.txt`: `dist:win` po większym scaleniu i pomiar (rozmiar, SHA-256).

## Tester
1. Odbiór w prawdziwym Electronie po każdym scaleniu lidera: e2e (`^FAIL`), W5, zrzuty, sondy (tylko za `GO-tester-*.txt`).
2. [zrobione: team/tester/w12-tg] Tabela zgodności ekranów z 0.71 (zgodny / częściowo / brak) i lista priorytetów dla UI — `docs/cosgral-raporty/tester-w12-tg.md` (P0/P1: 3 zgodne / 4 częściowo / 0 brak).
3. [zrobione: T-AD] Skrypty odbioru: język angielski we wszystkich ścieżkach, bez luzowania asercji.
4. [zrobione: team/tester/w12-tg] Sondy do nowych funkcji: `scripts/sandbox-next-probes.ts` (restore-thread, menu-plus, clear-history, history-window, external-links).
5. Zaktualizuj tabelę zgodności ekranów po zrzutach 17-11-i (po UI-AI/AJ/AK/AL, KK-AG/AI).
6. Sonda dostępności (fokus, kontrast, reduced motion) na ekranach P0/P1.
7. Sprawdź w oknie: historyWindow, Clear history, skrót wysyłania, MaxListeners (log e2e).

## Lider (Okiestrator)
Scalanie, lint / typecheck / Storybook / visual, skan prywatności, push (fast-forward), odświeżenie podglądu, pełny `bun run check`,
raporty o 14:00, 18:00, 22:00 i 8:00, uzupełnianie tej kolejki.
