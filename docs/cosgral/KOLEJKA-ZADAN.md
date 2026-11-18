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
6. [zrobione: 21e626b24] Ustawienia agenta: podstrony Knows (instrukcje, skille) i bogatsze karty Brain, zgodnie z tabelą Testera (T-AG: „częściowo”).
7. [zrobione: 6f92e6b44] Marketplace Apps: układ i filtry bliżej 0.71 (T-AG: „częściowo”).
8. [zrobione: 034a7ef5a] Pasek boczny: przypinanie i „Więcej” (T-AG: „częściowo”).
9. [zrobione: 309b45407] Tablica Zadań: kolumny dla zadań nieudanych i anulowanych (UI-AI luka); wymaga kontraktu od Backendu (patrz Backend 6).
10. [zrobione: 21ae5669d] Kontrolki wyglądu w ustawieniach: skala interfejsu, czcionka, akcent, skrót wysyłania (silnik gotowy: KAPI-N, BE-U).
11. [zrobione: edbd5db1e] Zakładki i podgląd mediów w rozmowie: zamiast tekstu „Loading” szkielet; ContextIndicator.
12. Przełącznik „Unread first” obok „Send message with” w ustawieniach wyglądu (silnik gotowy: Backend BE-AC), jeśli go jeszcze nie ma.
13. Klient telefonu (PWA): ekran kanałów, wiadomości i zadań na API z `ipc-mobile-channels.ts` (Backend BE-AB); współpraca z KK.
14. Pasek boczny: animacja przesunięcia wiersza przy „unread first” (tylko transform, z reduced-motion).
15. Poprawki dostępności z sondy Testera (fokus, kontrast, reduced motion), gdy wynik będzie.

## KK Fullstack
1. [zrobione: 28f240e08 (Clear history)] [zrobione: da3ad22fd (okno historii)] Przycisk „Clear history” w widoku kanału, lista „okno historii” (po Backendzie BE-Z).
2. [zrobione: 28f240e08] Usunięcie martwego `SettingsModal`.
3. [zrobione: 8e6600948 (po T-AI; powtórz po następnym odbiorze)] Przeliczenie `parytet-0.71.md` po każdym odbiorze Testera (kod / ostrożnie / w oknie).
4. `PRZEWODNIK.md`: kroki „jak zobaczyć” dla każdej nowej funkcji.
5. [zrobione: b136b22a2] Luki z `pytania-do-wlasciciela.md`, które da się domknąć bez decyzji właściciela.
6. [zrobione: 78f6ebbb9] Historyjka Storybook dla listy „okno historii” (Dark/Light) i sprawdzenie kontrastu.
7. Odbiór własnych paneli (Aktualizacje, Mobile Connect, Głos, Komunikatory, Integracje, Podagenci) po zrzutach Testera 17-11-i.
8. Przegląd `i18n-inwentarz.md`: co zostało po angielsku w moich panelach, tłumaczenie przez `t()`.
9. Ekran kanałów w kliencie telefonu (PWA) razem z UI: kontrakt `ipc-mobile-channels.ts`, test na atrapie.
10. Przelicz parytet po następnym odbiorze Testera (wiersze 71, 73–77) i dopisz do PRZEWODNIKA.
11. Odbiór paneli Aktualizacje, Mobile Connect, Głos, Komunikatory, Integracje po zrzutach 17-11-i (jeśli jeszcze nie zrobiony).

## Backend Expert
1. [zrobione: 41e810e1b] `historyWindow` kanału (kontrakt, silnik, atrapa, testy).
2. [zrobione: 971d371ea — skrót wysyłania i kroki agenta działają w oknie] Kolejne luki z `luki-silnika-071.md`, najbardziej widoczne dla człowieka.
3. [zrobione: T-AF, e2e 0 FAIL, W5 33/33; każdy kolejny ^FAIL biorę z raportu Testera] Diagnoza każdego `^FAIL` z e2e i kroków W5, z logiem.
4. [zrobione: 53002be2b] Ostrzeżenie `MaxListenersExceededWarning` (preload `agent:event`): przyczyna i poprawka.
5. [zrobione: a29b584f2] Kontrakt i silnik tablicy Zadań z kolumnami „nieudane” i „anulowane” (dla UI 4).
6. [zrobione: e0b9d2e3c — wiersz 71, kanały w API telefonu; reszta silnika: 0 h] Pozostałe wiersze „ROBIĆ” w `luki-silnika-071.md` oraz `parytet-0.71.md` po stronie silnika (wybierz najbardziej widoczne).
7. [zrobione: 4e750b4a7; skrót wysyłania zrobione: 971d371ea; zostaje „nieprzeczytane najpierw” = `appearance.unreadFirst`: sortowanie siedzi w układzie paska z folderami i ręczną kolejnością] Ustawienie „skrót wysyłania” i „nieprzeczytane najpierw” faktycznie używane w polu wiadomości i na liście agentów.
8. Strumień `/v1/events` niesie też zmiany kanałów (luka BE-AB: telefon dziś pyta ponownie).
9. Przywracanie miejsca osobno na serwer (luka BE-X: dziś jedno miejsce).
10. Wiersz 71 parytetu (telefon): kolejne brakujące funkcje klienta telefonu po stronie API.
11. Kolejne luki z `parytet-0.71.md`, jeśli tabela „ROBIĆ” znów się wypełni po odbiorze Testera.

## KAPI
1. [zrobione: 401bafe8f] Dalsze sztywne EN w TSX przez `t()` (klucze PL/EN równe, `i18n.test`).
2. [zrobione: acc270061] Rozmiar podglądu w przeglądarce (cel: razem < 1,8 MB, plik < 1 MB).
3. Instalator `dist:win`: pomiar po każdym większym scaleniu (tylko za `GO-kapi-dist.txt`).
4. [zrobione: 401bafe8f] Luki ROBIĆ (wiersz 2 wygląd: appearanceDomTokens + startAppearance) z `parytet-0.71.md` poza zakresem Backend/KK/UI (wybierz jedną, uzasadnij).
5. [zrobione: a023a2b88] Sztywne EN poza Conversation: ContextIndicator, nazwy kart, błędy, `aria-label`; skan `i18n.test`.
6. [zrobione: fee1b34c4] Odświeżenie `i18n-inwentarz.md` i test kompletności (klucze PL/EN równe).
8. [zrobione: f7ce4d240] Pełne `t()` nagłówków i opisów Access / Isolation / Browser / Budget (luka po KAPI-P).
9. [zrobione: e0a774760] Aria/i18n P0 rozmowy: ChatSearch, MessageRendering, SelectionActions, QueuePanel, ComposerEditor (Insert mention); wyspa PL AgentAccountPicker.
7. Po `GO-kapi-dist.txt`: `dist:win` po większym scaleniu i pomiar (rozmiar, SHA-256).
10. Test `AgentSettingsW3` pod `setLanguage("pl")` (notka KAPI-S: szuka „Konto”).
11. Skan pozostałych `aria-label` i tekstów PL/EN w TSX po KAPI-S; klucze równe, `i18n.test`.

## Tester
1. [zrobione: team/tester/w12-ti T-AI GO] Odbiór Electron @ `4f21fbfe7`: e2e 0 FAIL, W5 33/33, zrzuty 17-11-i, sondy next/rename/behavior; MaxListeners 0. Raport `docs/cosgral-raporty/tester-w12-ti.md`.
2. [zrobione: team/tester/w12-tg] Tabela zgodności ekranów z 0.71 (zgodny / częściowo / brak) i lista priorytetów dla UI — `docs/cosgral-raporty/tester-w12-tg.md` (P0/P1: 3 zgodne / 4 częściowo / 0 brak).
3. [zrobione: T-AD] Skrypty odbioru: język angielski we wszystkich ścieżkach, bez luzowania asercji.
4. [zrobione: team/tester/w12-tg + T-AI GO] Sondy: `sandbox-next-probes.ts` (5/5), `sandbox-rename-probe.ts`, `sandbox-behavior-probe.ts` (tray/restore/launchAtLogin).
5. [zrobione: T-AI GO + PNG 17-11-i] Tabela P0/P1: **4 zgodne / 3 częściowo / 0 brak** — `tester-w12-ti.md` + `vs-071-p0p1.txt`.
6. [zrobione: skrypt; uruchomienie nadal otwarte] `sandbox-a11y-probe.ts` gotowy; **nie odpalany** w T-AI GO.
7. [zrobione: T-AI GO poza sendShortcut] historyWindow OK, Clear history OK, MaxListeners 0 w e2e/W5; **sendShortcut nie w oknie** (tylko BE-Z2).
8. Sonda w oknie: „skrót wysyłania” (Enter vs Ctrl+Enter) i „Unread first” w pasku bocznym.
9. Odbiór kanałów w kliencie telefonu (PWA) po UI/KK (tylko za GO).
10. Aktualizacja tabeli zgodności P0/P1 po kolejnych zrzutach (po 17-11-i: 4 zgodne / 3 częściowo).

## Lider (Okiestrator)
Scalanie, lint / typecheck / Storybook / visual, skan prywatności, push (fast-forward), odświeżenie podglądu, pełny `bun run check`,
raporty o 14:00, 18:00, 22:00 i 8:00, uzupełnianie tej kolejki.
