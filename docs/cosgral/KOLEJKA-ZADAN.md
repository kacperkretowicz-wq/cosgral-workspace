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
12. [zrobione: 0e4685b6f] Przełącznik „Unread first” obok „Send message with” w ustawieniach wyglądu (silnik gotowy: Backend BE-AC).
13. [zrobione: 1682b267a] Klient telefonu (PWA): ekran kanałów, wiadomości i zadań na API z `ipc-mobile-channels.ts` (Backend BE-AB); współpraca z KK.
14. [zrobione: 9a5a7ed95] Pasek boczny: animacja przesunięcia wiersza przy „unread first” (tylko transform, z reduced-motion).
15. [zrobione: b27b2b107] Poprawki dostępności z sondy Testera (fokus, kontrast, reduced motion), gdy wynik będzie.
16. Ekran „Komunikatory” (Telegram/Slack): podepnij `window.openbot.messengers` w rendererze (lista, połączenie, token tylko do zapisu, stan, test połączenia); `luki-silnika-071.md` §1.4; testy jednego pliku + historyjka.
17. Agent settings pełny 059–074 (P1 „częściowo”): uzupełnij brakujące sekcje ekranu agenta wg `vs-071-p0p1.txt` i `openbot-0.71-kolejka-ui.md` (poza repo); własny kod, bez przepisywania.
18. Tasks↔chat: hero zadania jak 078–086 (nagłówek, status, akcje Stop/Continue/Reassign) — wiersz „częściowo” z P0/P1.
19. Chat chrome: Teach/Voice (przyciski w polu wiadomości, stany wyłączone z powodem), `@` i `/` złapane w teście komponentu (wiersz 16).
20. Pasek boczny: „Więcej”/przypinanie stron (wiersz 36) + skróty klawiszowe Ctrl+K/Ctrl+F/Alt+↑ (wiersz 72), test jednego pliku.
21. Marketplace: strona używa `ipc-marketplace-screen` (Featured, kategorie, Verified/Public) — wiersz 48.

## KK Fullstack
1. [zrobione: 28f240e08 (Clear history)] [zrobione: da3ad22fd (okno historii)] Przycisk „Clear history” w widoku kanału, lista „okno historii” (po Backendzie BE-Z).
2. [zrobione: 28f240e08] Usunięcie martwego `SettingsModal`.
3. [zrobione: 13433a337 (po scaleniu 7d5fd871c; powtórz po następnym odbiorze Testera)] Przeliczenie `parytet-0.71.md` po każdym odbiorze Testera (kod / ostrożnie / w oknie).
4. [zrobione: 13433a337 (po 7d5fd871c; powtarzaj po scaleniach)] `PRZEWODNIK.md`: kroki „jak zobaczyć” dla każdej nowej funkcji.
5. [zrobione: b136b22a2] Luki z `pytania-do-wlasciciela.md`, które da się domknąć bez decyzji właściciela.
6. [zrobione: 78f6ebbb9] Historyjka Storybook dla listy „okno historii” (Dark/Light) i sprawdzenie kontrastu.
7. [zrobione: 3cb782b80] Odbiór własnych paneli (Aktualizacje, Mobile Connect, Głos, Komunikatory, Integracje, Podagenci) po zrzutach Testera 17-11-i.
8. [zrobione: 2c034c134] Przegląd `i18n-inwentarz.md`: co zostało po angielsku w moich panelach, tłumaczenie przez `t()`.
9. [zamknięte bez kodu KK: kontrakt i test BE-AB e0b9d2e3c, ekran PWA UI-13 1682b267a na team/ui/w12-ai, czeka na scalenie] Ekran kanałów w kliencie telefonu (PWA) razem z UI: kontrakt `ipc-mobile-channels.ts`, test na atrapie.
10. [zrobione: 13433a337 (UI-AT i UI-13 w integracji)] Przelicz parytet po następnym odbiorze Testera (wiersze 71, 73–77) i dopisz do PRZEWODNIKA.
11. [zrobione: 3cb782b80, razem z 7] Odbiór paneli Aktualizacje, Mobile Connect, Głos, Komunikatory, Integracje po zrzutach 17-11-i (jeśli jeszcze nie zrobiony).
13. [zrobione: 13433a337] Parytet i PRZEWODNIK po scaleniu `7d5fd871c` (wiersze 2 i 71 → „jest”, liczby ze skryptu z tabeli, „Unread first” i kanały w PWA opisane).
12. [zrobione: 38566682e] `ChannelWorkspace`: lista kanałów, przyciski i komunikaty dostępności przez `t()` (luka wskazana przez KAPI), klucze wstawione w środku katalogów, żeby nie kolidowały z dopiskami KAPI.
13. Parytet: przelicz `parytet-0.71.md` na tipie po scaleniu lidera (wiersze 2, 71, 36, 72) i zaktualizuj procenty z dowodem.
14. Ustawienia kanału (wiersz 27): kompakt, kasowanie historii, przeglądarka w kanale — kontrakt + atrapa + ekran, lekkie.
15. Onboarding (wiersz 11): wybór hosta lokalny/zdalny w kontrakcie i ekranie (bez darmowych modeli), testy jednego pliku.
16. Computer Use: ekran uprawnień jak 0.71 (wiersz 8), tylko kontrakt + ekran + test na atrapie.
17. Ustawienia serwera: Członkowie i Strony „niedostępne” (wiersz 66) — ekran i kontrakt z jasnym powodem, bez udawania danych.

## Backend Expert
1. [zrobione: 41e810e1b] `historyWindow` kanału (kontrakt, silnik, atrapa, testy).
2. [zrobione: 971d371ea — skrót wysyłania i kroki agenta działają w oknie] Kolejne luki z `luki-silnika-071.md`, najbardziej widoczne dla człowieka.
3. [zrobione: T-AF, e2e 0 FAIL, W5 33/33; każdy kolejny ^FAIL biorę z raportu Testera] Diagnoza każdego `^FAIL` z e2e i kroków W5, z logiem.
4. [zrobione: 53002be2b] Ostrzeżenie `MaxListenersExceededWarning` (preload `agent:event`): przyczyna i poprawka.
5. [zrobione: a29b584f2] Kontrakt i silnik tablicy Zadań z kolumnami „nieudane” i „anulowane” (dla UI 4).
6. [zrobione: e0b9d2e3c — wiersz 71, kanały w API telefonu; reszta silnika: 0 h] Pozostałe wiersze „ROBIĆ” w `luki-silnika-071.md` oraz `parytet-0.71.md` po stronie silnika (wybierz najbardziej widoczne).
7. [zrobione: 4e750b4a7; skrót wysyłania zrobione: 971d371ea; zostaje „nieprzeczytane najpierw” = `appearance.unreadFirst`: sortowanie siedzi w układzie paska z folderami i ręczną kolejnością] Ustawienie „skrót wysyłania” i „nieprzeczytane najpierw” faktycznie używane w polu wiadomości i na liście agentów.
8. [zrobione: 2a2ae3772] Strumień `/v1/events` niesie też zmiany kanałów (luka BE-AB: telefon dziś pyta ponownie).
9. [zrobione: 9d79bedfc] Przywracanie miejsca osobno na serwer (luka BE-X: dziś jedno miejsce).
10. [zrobione: 9d766313a — szczegół zadania kanału w API telefonu; push dla zadań kanału: luka] Wiersz 71 parytetu (telefon): kolejne brakujące funkcje klienta telefonu po stronie API.
11. Kolejne luki z `parytet-0.71.md`, jeśli tabela „ROBIĆ” znów się wypełni po odbiorze Testera.
12. Biblioteka: „pliki maszyny” (wiersz 45): bezpieczny odczyt wybranego folderu, limit rozmiaru, tylko za zgodą; kontrakt + testy jednego pliku.
13. Rutyny kanału: edycja nazwy/instrukcji/harmonogramu + dni tygodnia (wiersz 58) — kontrakt, silnik, testy.
14. Discord: deskryptor + atrapa sterownika na interfejsie komunikatorów (`luki-silnika-071.md` §1.4), testy na fałszywej bramce, bez prawdziwego tokenu.
15. Marketplace: instalacja skilla z linku GitHub z kartą zgody (limit 200 plików/10 MB, bez uruchamiania skryptów), silnik + testy na fałszywym serwerze.
16. Przeglądarka agenta: kontrakt podglądu na żywo i „teach” (wiersz 46), atrapa + testy.

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
10. [zrobione: 8d8d139cb] Test `AgentSettingsW3` pod `setLanguage("pl")` (notka KAPI-S: szuka „Konto”).
11. [zrobione: 31f84fa5c] Skan pozostałych `aria-label` i tekstów PL/EN w TSX po KAPI-S; klucze równe, `i18n.test`.
12. [zrobione: af0c21e79] Aria/i18n P1 paneli: McpPanel, MemoryPanel, VaultPanel, RoutinePanel, SkillsPanel (aria + etykiety przez `t()`).
13. [zrobione: 5bb977653] Aria/i18n: `McpSettings` (błędy) + `AgentSettingsW3` (Create agent / Model / Save settings / fallback).
14. [zrobione: 0841f2992] Aria/i18n: `FallbackOrder` + `ProviderFallbackLists` (kolejka modeli zapasowych).
15. [zrobione: dba28510c] Aria/i18n: `SkillsSettings` + `QueueHoldNotice` + `EyesIndicator` (błędy/aria/Stop).
16. [zrobione: ab2c7394d] Aria/i18n: `ProviderModelPicker` (wybór modelu / statusy dostawcy).
17. [zrobione: a192f6f8f] Aria/i18n: rozdziel `View`→`Show` (kolizja z KK) + `TablesPanel` / `VaultRequestCard`.
18. [zrobione: da0d5edac] Aria/i18n: `ActionCard` + `ApiKeysSection` + `ComingSoon` + `ChatTasksSwitch`.
19. [zrobione: ab5cd9549] Aria/i18n: `ChannelEditor` + `JoinServerDialog` + `MemorySettings`.
20. [zrobione: c6a9d1cd5] Aria/i18n: `VoicePlayback` + `VoiceRecorder` + `VoiceSettings`.
21. [zrobione: 6f522b834] Aria/i18n: `ProviderPicker` + `DataWipeSection` + `AcpLogin` (karta).
22. [zrobione: 531a936] Aria/i18n: `AcpPresetCard` + `AcpPresets`.
23. [zrobione: 980f578] Aria/i18n: `AccountLogin` + `OtpInput`.
24. [zrobione: f6cfbdd] Aria/i18n: `SidebarFolders` + `Spaces`.
25. [zrobione: 18cf33d] Aria/i18n: `ConversationPrompts` + `StickyDecision` + aria tabel/obrazów.
26. [zrobione: fa9ca434c] Aria/i18n: `ThreadPanel` + `DirectConversation`.
27. [zrobione: 79a742675] Aria/i18n: `MessageHistoryActions` + `AlwaysAllowPanel` + resztki rozmowy (`MessageRendering`, `QueuePanel`, `SelectionActions`).
28. [zrobione: 91e02bee2] Aria/i18n: `App.tsx` Library / Schedule / Loading + `HostPanel` / resztki aria.
29. [zrobione: 5cb0d5c46] Aria/i18n: `AccountLogin` placeholder + skan pozostałych TSX poza Remote/Mobile.
30. [zrobione: 316fe2e1d] Aria/i18n: Sidebar SVG titles Limit/Error/Responded + drobne resztki poza Remote/Mobile.
31. [zrobione: bccd741a4] Aria/i18n: TasksViewScreen status labels (Done/Failed/…) + resztki statusów w App.tsx.
32. [zrobione: 06268e5f4] Aria/i18n: AppSettingsW3 powiadomienia + AgentCard* Working folder + fallbacki ApprovalRules/Memory.
33. [zrobione: bf525199f] Aria/i18n: RoutinePanel create/load fallbacki + skan pozostałych setError EN.
34. [zrobione: 8ddab6ca4] Aria/i18n: VaultPanel confirm Delete + skan window.confirm / resztki EN.
35. [zrobione: e160e1366] Aria/i18n: App.tsx publish fallback + skan throw/Error EN w UI (poza Remote).
36. [zrobione: 0c9d7f356] Lekkie: odśwież `i18n-inwentarz.md` + sprawdzenie równości kluczy PL/EN (`i18n.test`).
37. Skan prywatności całego repo (nazwa profilu, e-mail, ścieżki użytkownika, klucze) + raport; popraw znaleziska w dokumentach.
38. Wersje przepływów: przywracanie/różnice — test jednego pliku na atrapie i luki do raportu (wiersz 61).
39. Skróty klawiszowe: pełna mapa 0.71 (wiersz 72) w kontrakcie `ipc-shortcuts` + testy; ekran zostawia UI.

## Tester
1. [zrobione: 5d86c5b60] T-AJ GO Electron @ `2dfb55f09` — e2e 0 FAIL, W5 33/33, zrzuty 17-11-j, sondy; raport `tester-w12-tj.md`.
2. [zrobione: team/tester/w12-tg] Tabela zgodności ekranów z 0.71 (zgodny / częściowo / brak) i lista priorytetów dla UI — `docs/cosgral-raporty/tester-w12-tg.md` (P0/P1: 3 zgodne / 4 częściowo / 0 brak).
3. [zrobione: T-AD] Skrypty odbioru: język angielski we wszystkich ścieżkach, bez luzowania asercji.
4. [zrobione: team/tester/w12-tg + T-AI GO + T-AJ] Sondy: next 5/5, rename, behavior, a11y, ui-probes (sendShortcut/unreadFirst/tasks-board).
5. [zrobione: T-AI GO + PNG 17-11-i] Tabela P0/P1: **4 zgodne / 3 częściowo / 0 brak** — `tester-w12-ti.md` + `vs-071-p0p1.txt`.
6. [zrobione: 5d86c5b60] `sandbox-a11y-probe.ts` — ok (focus, reduced-motion, css) w T-AJ GO.
7. [zrobione: T-AJ GO] historyWindow OK, Clear history OK, MaxListeners 0; **sendShortcut** dataset OK (`sandbox-ui-probes`).
8. [zrobione: 5d86c5b60] Sonda w oknie: sendShortcut + unreadFirst (IPC/dataset) + Tasks board 5 kolumn — `sandbox-ui-probes.ts`.
9. [zrobione: a9f93e728] Odbiór kanałów PWA — docs/skrypty (API unit 7+1, checklista GO, fix zrzutów 16/19); żywy telefon **czeka na GO** + tip z UI-13. Raport `tester-w12-tak.md`.
10. [zrobione: 5d86c5b60] P0/P1 po 17-11-j: **4 zgodne / 3 częściowo / 0 brak** — `tester-w12-tj.md` + `vs-071-p0p1.txt` (poza repo).
11. T-AL GO Electron @ tip po scaleniu lidera (`be82091cb`+): e2e 0 FAIL, W5 33/33, PWA kanały (UI-13), przełącznik „Unread first” kliknięty w oknie; zrzuty 17-11-k; raport `tester-w12-tl.md`.
12. Przelicz tabelę P0/P1 (7 pozycji) po T-AL i podaj, co UI ma jeszcze zrobić.
13. Sonda w oknie: Marketplace, Harmonogram, Biblioteka z danymi testowymi (wiersze 45, 48, 57) — kliknięcia, nie tylko zrzuty.
14. Odbiór PL: cały program po polsku w oknie (wiersz 1), lista brakujących napisów dla KAPI/UI.

## Lider (Okiestrator)
Scalanie, lint / typecheck / Storybook / visual, skan prywatności, push (fast-forward), odświeżenie podglądu, pełny `bun run check`,
raporty o 14:00, 18:00, 22:00 i 8:00, uzupełnianie tej kolejki.

## Zasada pustej kolejki (od 19.11)
Gdy Twoja sekcja nie ma nieoznaczonej pozycji: NIE pisz „Cisza” ani „brak pozycji”. Weź pierwszą nieoznaczoną pozycję ze źródeł
(`parytet-0.71.md`: wiersze „częściowo” i „brak” ze swojego obszaru), dopisz ją na końcu swojej sekcji z `[w toku]` i rób.
Lider i tak uzupełnia kolejkę po każdym scaleniu; nic nie czeka na lidera.
