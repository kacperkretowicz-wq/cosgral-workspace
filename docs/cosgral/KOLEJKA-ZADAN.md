# Kolejka zadań (samoobsługa agentów)

Po co: agent, który oddał wynik, nie czeka na przydział lidera. Bierze pierwszą nieoznaczoną pozycję ze swojej sekcji,
dopisuje na jej początku `[w toku: ROLA, godzina]`, a po oddaniu zmienia na `[zrobione: SHA]`. Lider uzupełnia kolejkę i scala.

Zasady jak w kanale: gałąź `team/<rola>/<temat>`, bez push, bez `--force`, lekkie polecenia po jednym pliku, ciężkie (Storybook, e2e, build,
`dist:win`, pełny check) tylko za plikiem `GO-*.txt` w `Shared\cosgral-sandbox`. Kodu z paczki OpenBota 0.71 nie przepisujemy do repo.
Źródła pozycji: `parytet-0.71.md`, `luki-silnika-071.md`, `pytania-do-wlasciciela.md`, `vs-071.txt` Testera, `openbot-0.71-kolejka-ui.md` (poza repo).

## UI Designer
1. [zrobione: 6af21006e] Kolejne ekrany P0, potem P1 z `openbot-0.71-kolejka-ui.md`, których `vs-071.txt` nie oznacza jako zgodne.
2. [w toku: UI, 20:06] Skeleton i ruch w pozostałych panelach, które jeszcze pokazują gołe „Loading…”.
3. Edytor przepływów: pola Prompt i Condition, czytelność węzłów.
4. Stany puste i błędów (jeden wspólny styl) w Bibliotece, Użyciu, Harmonogramie.
5. Dostępność: fokus, kontrast, `prefers-reduced-motion` na nowych ekranach.

## KK Fullstack
1. [zrobione: 28f240e08 (Clear history); lista „okno historii” czeka na BE-Z] Przycisk „Clear history” w widoku kanału, lista „okno historii” (po Backendzie BE-Z).
2. [zrobione: 28f240e08] Usunięcie martwego `SettingsModal`.
3. Przeliczenie `parytet-0.71.md` po każdym odbiorze Testera (kod / ostrożnie / w oknie).
4. `PRZEWODNIK.md`: kroki „jak zobaczyć” dla każdej nowej funkcji.
5. Luki z `pytania-do-wlasciciela.md`, które da się domknąć bez decyzji właściciela.

## Backend Expert
1. `historyWindow` kanału (kontrakt, silnik, atrapa, testy).
2. Kolejne luki z `luki-silnika-071.md`, najbardziej widoczne dla człowieka.
3. Diagnoza każdego `^FAIL` z e2e i kroków W5, z logiem.
4. Ostrzeżenie `MaxListenersExceededWarning` (preload `agent:event`): przyczyna i poprawka.

## KAPI
1. [zrobione: 401bafe8f] Dalsze sztywne EN w TSX przez `t()` (klucze PL/EN równe, `i18n.test`).
2. [w toku: KAPI, 20:30] Rozmiar podglądu w przeglądarce (cel: razem < 1,8 MB, plik < 1 MB).
3. Instalator `dist:win`: pomiar po każdym większym scaleniu (tylko za `GO-kapi-dist.txt`).
4. [zrobione: 401bafe8f] Luki ROBIĆ (wiersz 2 wygląd: appearanceDomTokens + startAppearance) z `parytet-0.71.md` poza zakresem Backend/KK/UI (wybierz jedną, uzasadnij).

## Tester
1. Odbiór w prawdziwym Electronie po każdym scaleniu lidera: e2e (`^FAIL`), W5, zrzuty, sondy (tylko za `GO-tester-*.txt`).
2. [zrobione: team/tester/w12-tg] Tabela zgodności ekranów z 0.71 (zgodny / częściowo / brak) i lista priorytetów dla UI — `docs/cosgral-raporty/tester-w12-tg.md` (P0/P1: 3 zgodne / 4 częściowo / 0 brak).
3. [zrobione: T-AD] Skrypty odbioru: język angielski we wszystkich ścieżkach, bez luzowania asercji.
4. [zrobione: team/tester/w12-tg] Sondy do nowych funkcji: `scripts/sandbox-next-probes.ts` (restore-thread, menu-plus, clear-history, history-window, external-links).

## Lider (Okiestrator)
Scalanie, lint / typecheck / Storybook / visual, skan prywatności, push (fast-forward), odświeżenie podglądu, pełny `bun run check`,
raporty o 14:00, 18:00, 22:00 i 8:00, uzupełnianie tej kolejki.
