# Parytet z OpenBotem 0.71 (funkcje)

Stan: 18.11.2026, integracja `codex/cosgral-desktop` @ `4f21fbfe7` plus odbiór Testera T-AI i T-AJ (procenty po T-AJ bez zmian) (Electron, GO; raport `tester-w12-ti.md`, w momencie liczenia jeszcze niezacommitowany w jego worktree: liczby z jego tekstu). Poprzednia wersja tabeli: `206fdc9b0`, 79,2% kod / 51,3% w oknie / 59,7% ostrożnie (77 funkcji). **Ta wersja zmienia dwa wiersze: 76 (przywracanie miejsca: wątek wraca, w oknie potwierdzone) i 75 (linki: ustawienie sprawdzone w oknie).** „Ekran w kodzie” nie znaczy „w oknie sprawdzone”.

**Wynik w jednej linii: 61,5 z 77 funkcji = 79,9% (jest = 1, częściowo = ½). Z tego skontraktowane ~92,9%, ale w prawdziwym oknie sprawdzone tylko 52,6%. Ostrożnie (jest liczy się za 1 tylko z dowodem w oknie, jak reguła 0.68): 60,4%.**

| Miara | Wynik | Jak liczona |
|---|---|---|
| Parytet (kod) | **79,9%** (61,5 z 77) | 51 jest, 21 częściowo, 5 brak |
| Skontraktowane | **~92,9%** | wiersz ma kontrakt w `packages/contracts` (tak = 1, część = ½) |
| Silnik | **~92,2%** | kod w `src/backend` albo `src/main` (tak = 1, część = ½) |
| Ekran w kodzie | **~86,4%** | komponent w `src/renderer` czyta to API (tak = 1, część = ½) |
| W oknie sprawdzone | **52,6%** | 22 wiersze w pełni (tak), 37 częściowo, 18 nie; liczone z 77 funkcji, dowody: odbiór Testera T-AC, T-AF i T-AI |
| Ostrożny parytet | **60,4%** | jest bez dowodu w oknie liczy się ½, częściowo ½, brak 0 |

Poza zakresem (nie wchodzą do mianownika): 6 pozycji, lista na końcu. Gdyby je policzyć jako brak, parytet kodowy = 61,5 z 83 = 74,1%.

## Czym to różni się od parytet-0.68.md

1. Tam „jest” wymagało dowodu w prawdziwym oknie (27 jest + 17 częściowo z 44 = 80,7%). Tu „jest” znaczy: kontrakt + silnik + test + ekran w kodzie, a dowód w oknie to osobna kolumna i osobny procent. Dlatego porównuj z „ostrożnym” wynikiem, nie z głównym.
2. Wiersze są pogrupowane według 0.71 (nie według fal), więc liczby 44 i 72 to inne zbiory funkcji.
3. Dowody „w oknie” biorę tylko z raportów, które je zawierają: odbiór W3-T3/W4/W5 (programy w piaskownicy, atrapa Codex, W5 29/29, e2e), zrzuty T-H z 17.11 (13 PNG, poza repo). Zrzut ekranu liczę jako „część” (ekran się rysuje), nie jako „tak”.

## Legenda

- **K** kontrakt (`packages/contracts/src/ipc-*.ts`), **S** silnik, **T** test automatyczny, **E** ekran w kodzie podpięty do `window.openbot.*`, **O** sprawdzone w prawdziwym oknie.
- Wartości: tak / część / nie. „jest” tylko gdy K, S i E = tak; „brak” tylko gdy nie ma silnika ani ekranu.

## Podsumowanie według obszaru

| Obszar | Wierszy | Jest | Częściowo | Brak | Parytet |
|---|---|---|---|---|---|
| A. Ustawienia aplikacji i powłoka | 15 | 10 | 4 | 1 | 80% |
| B. Czat, Needs you, wątki | 12 | 10 | 2 | 0 | 92% |
| C. Kanały | 4 | 3 | 1 | 0 | 88% |
| D. Agenci | 11 | 10 | 1 | 0 | 95% |
| E. Narzędzia i dane (MCP, Vault, tabele, pliki, przeglądarka) | 9 | 6 | 2 | 1 | 78% |
| F. Marketplace | 3 | 1 | 2 | 0 | 67% |
| G. Dostawcy i użycie | 6 | 5 | 1 | 0 | 92% |
| H. Automatyzacje (rutyny, przepływy) | 6 | 3 | 3 | 0 | 75% |
| I. Komunikatory | 4 | 2 | 0 | 2 | 50% |
| J. Serwer, zespół, zdalny pulpit, telefon | 7 | 1 | 5 | 1 | 50% |

## Tabela funkcji

### A. Ustawienia aplikacji i powłoka

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Język PL/EN i napisy | **częściowo** | tak | tak | tak | tak | część | Wybór języka działa bez restartu; panel Narzędzia CLI jest już przez słownik (scalone po W5 29/29 w oknie, krok CLI zielony); w oknie po polsku nie sprawdzono całego programu. | kk-w3-acceptance, ui-w7-ui2, tester-w12-w5 |
| 2 | Wygląd i ustawienia ogólne (motyw, czcionki, kolory czatu, skrót wysyłania, kolejność nieprzeczytanych, kroki agenta) | **częściowo** | tak | tak | tak | część | część | Kontrakt i silnik mają motyw, rozmiar UI (90–140%), czcionkę, skrót wysyłania, akcent czatu, kroki agenta i kolejność nieprzeczytanych (BE-U, zapis i restart w testach). **Ekran ma 6 z 7 kontrolek** (na tipie `2dfb55f09`, sekcja „Appearance” ekranu „Settings”): Theme, Interface scale, Font, Accent, „Send message with” i „Agent steps”. **Brakuje przełącznika „Unread first”** (UI-AT jest na `team/ui/w12-ai`, nie w integracji; silnik i pasek są, BE-AC). Skrót wysyłania i kroki agenta działają w polu i w rozmowie (BE-Z2, testy jednego pliku). W oknie (T-AJ, sondy `ui-probes`): skrót wysyłania zapisuje się i zmienia zachowanie pola (`enter` / `mod-enter`), „unread first” zapisuje się (przez IPC i dataset, nie kliknięciem przełącznika). Samo kliknięcie kontrolek na ekranie w oknie nie było oglądane. | backend-w12-uwygląd (BE-U), kk-w12-ac, ui-w7-ui1 |
| 3 | Powiadomienia (macierz zdarzeń, dźwięk, test) | **jest** | tak | tak | tak | tak | część | Macierz 6 zdarzeń zapisuje się w oknie; toast systemowy nie sprawdzony. | kk-w3-acceptance |
| 4 | Głos: modele dyktowania, czytanie na głos, głosy Windows | **jest** | tak | tak | tak | tak | część | whisper.cpp (3 modele, pobranie za zgodą), głosy Windows; dział „Voice” w oknie ustawień czyta `voice.getOverview`: uprawnienie mikrofonu z przyciskiem do ustawień systemu i lista „niedostępne w tej wersji” z powodem. **Do KK-AC panel był nieosiągalny** (siedział w oknie ustawień, którego nic w programie nie otwierało); od KK-AC jest na ekranie „Settings” (zębatka). W oknie nie oglądany; nagrywanie nie sprawdzone. 17-11-h: nagłówek Voice i uprawnienie mikrofonu widoczne w oknie na ekranie „Settings” (T-AF). Nagrywanie nadal nie sprawdzone. | ipc-voice, voice-overview.test, kk-w12-vault-voice, kk-w12-ac, tester-w12-te |
| 5 | Głos: model Parakeet, neuronowe czytanie, tryb na żywo | **brak** | część | nie | nie | nie | nie | W kontrakcie tylko lista „niedostępne w tej wersji” z powodem. | kk-w12-vault-voice |
| 6 | Dok agentów (przypięcie, kolejność, rozmiar, mini-czat) | **jest** | tak | tak | tak | tak | tak | Podstawy w oknie (W3-T3); ustawienia położenia i ekranów jak w 0.71 nie sprawdzone. | kk-w3-acceptance, ipc-dock |
| 7 | Dynamic Island (stan, nazwa agenta, klik otwiera kartę) | **jest** | tak | tak | tak | tak | tak | Sprawdzone w oknie (W3-T3); haptyka i wybór ekranów poza zakresem. | kk-w3-acceptance, ipc-dock |
| 8 | Computer Use na Windows (stan, zgoda, Stop) | **częściowo** | tak | tak | tak | część | część | Sterownik i zgody są; ekran ustawień uprawnień jak w 0.71 i sterowanie prawdziwym pulpitem w oknie nie sprawdzone. | ipc-computer-use, computer-driver-windows, kk-w3-acceptance |
| 9 | Mobile Connect: telefony, parowanie QR/TLS, trasa (ten komputer / sieć lokalna) | **jest** | tak | tak | tak | tak | część | Parowanie na pętli zwrotnej w oknie (W3-T3), bez prawdziwego telefonu; pod kartami strony panel czyta `mobileConnect.getOverview`: trasy (w użyciu, chmura niedostępna z powodem), telefony z PIN-em, blokadą i powiadomieniami, lista niedostępnych. Panel nie oglądany w oknie. | ipc-mobile-connect, mobile-connect.test, kk-w12-vault-voice |
| 10 | Aktualizacje: tor Stable/Preview, auto pobieranie/instalacja, restart gdy bezczynny | **jest** | tak | tak | tak | tak | część | Panel „Updates” w oknie ustawień czyta `updatePreferences` i `update`: wersja i stan, tor, sprawdzanie, pobieranie, instalacja, „Restart when idle” z oczekiwaniem i anulowaniem, lista niedostępnych z powodem (zastąpił atrapę z wpisaną na sztywno wersją). **Do KK-AC panel był nieosiągalny** (to samo okno bez wejścia); od KK-AC jest na ekranie „Settings”. Nie oglądany w oknie. 17-11-h: nagłówek Updates i tor wersji widoczne w oknie na ekranie „Settings” (T-AF). Pobranie i instalacja aktualizacji nie sprawdzone. | ipc-instance-transfer, kk-w12-screens, kk-w12-ac, tester-w12-te |
| 11 | Onboarding (język, dostawca, pierwszy agent, Computer Use) | **częściowo** | tak | tak | tak | tak | tak | Przepływ w oknie jest, ale inny niż w 0.71 (bez wyboru hosta lokalny/zdalny, bez darmowych modeli). | kk-w3-acceptance |
| 73 | Autostart z Windowsem („Launch at login”) | **jest** | tak | tak | tak | tak | część | `behavior.launchAtLogin` zapisuje się i woła `app.setLoginItemSettings` (KAPI, `w12-login`); przełącznik w `AppBehaviorSection` na ekranie „Settings” i w oknie ustawień (KK-AD). W oknie: nie potwierdzone (Tester sprawdza tylko zapis ustawienia; start po restarcie Windows nie sprawdzany). T-AF w oknie: przełącznik zapisuje `launchAtLogin` (true → false), a system wrócił do stanu sprzed (autostart nie zmieniony na stałe). Start po restarcie Windows nie sprawdzony. | kapi-w12-login, kk-w12-ac, tester-w12-te |
| 74 | Praca w tle: zamknięcie okna chowa program do ikony przy zegarze | **jest** | tak | tak | tak | tak | część | `behavior.keepBackground` (BE-W): zamknięcie okna chowa program do zasobnika, menu ikony „Otwórz” / „Zakończ”, zadania trwają; zabezpieczenie: bez ikony program kończy się jak dotąd. Przełącznik w `AppBehaviorSection` (KK-AD). Ikona i powrót to prawdziwy Electron: sonda Testera w toku (T-AF). T-AF w oknie: po zamknięciu okno jest ukryte, proces żyje, `show()` przywraca okno i pasek stron. **Nie sprawdzono** fizycznego kliku w ikonę w obszarze powiadomień (ta sama ścieżka `showMainWindow`). | backend-w12-w, kk-w12-ac, tester-w12-te |
| 75 | Gdzie otwierają się linki z rozmów (przeglądarka systemowa albo przeglądarka programu) | **jest** | tak | tak | tak | tak | część | `behavior.externalLinks` (BE-X); wybór w `AppBehaviorSection`, a `Conversation.openMessageLink` otwiera panel przeglądarki programu albo domyślną przeglądarkę (KK-AE). Test w `App.test`; W oknie (T-AI, sonda `external-links`): ustawienie przełącza się aplikacja↔przeglądarka i zapisuje; samo otwarcie linku nie sprawdzone (`browser.open` na martwy host kończy się oczekiwanym błędem DNS). | backend-w12-x, kk-w12-ae |
| 76 | Przywracanie ostatniego miejsca przy starcie (strona, agent, wątek) | **jest** | tak | tak | tak | tak | tak | `workspace.restore` i `workspace.last` (BE-X); hook `useRestoreWorkspace` otwiera zapamiętaną **stronę i agenta** i zapisuje zmiany po 0,5 s (KK-AE). Wątek też jest zapamiętywany (UI-AH `e6523c20a`: `hasThread` sprawdza, czy wątek jeszcze istnieje; inaczej otwiera się sam agent). W oknie: T-AF włączone → wraca Library i Agent B, wyłączone → start od początku; T-AI sonda `restore-thread`: po restarcie wracają ostatni agent i wątek, pasek wątku widoczny. | backend-w12-x, kk-w12-ae, tester-w12-te |

### B. Czat, Needs you, wątki

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 12 | Rozmowa (wiadomości, załączniki, historia po restarcie) | **jest** | tak | tak | tak | tak | tak | Z atrapą Codex i z prawdziwym Claude/Codex (W4-T1). | kk-w3-acceptance, kk-w4-verify |
| 13 | Karty Needs you (pytanie, zatwierdzenie, szkic, przejęcie przeglądarki) i przyklejona Decyzja | **jest** | tak | tak | tak | tak | tak | Wszystkie cztery karty w oknie. | kk-w3-acceptance |
| 14 | Kolejka wiadomości (FIFO, edycja, Steer, wznowienie po awarii) | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 15 | Wyszukiwanie w rozmowie i globalne (Ctrl+F, Ctrl+K) | **jest** | tak | tak | tak | tak | tak | W oknie, także zrzut T-H. | kk-w3-acceptance |
| 16 | Pole wiadomości: menu +, skille, `/`, `@`, wysiłek modelu, pytanie poboczne | **częściowo** | tak | tak | tak | część | część | Menu + i wysiłek w nagłówku sprawdzone statycznie; `@` i `/` nie złapane na zrzucie. | tester-w12-odbior2, ipc-composer |
| 17 | Akcje na wiadomościach (kopiuj, przypnij, ponów, wróć do punktu) | **jest** | tak | tak | tak | tak | część | Silnik i ekran w kodzie, bez odbioru okna (W6). W oknie: menu wiadomości otwiera się z Copy, Pin, Branch, Retry, Edit, Delete (17-11-h, 09d), a kroki W5 `W12-messageMenu` przeszły (T-AC, T-AF). Pojedyncze akcje (np. Edit z potwierdzeniem) nie oglądane ręcznie. | ipc-message-actions, odbior-w6, tester-w12-te, tester-w12-tac |
| 18 | Wątki: nowy, lista, archiwum, nazwa, usuń, gałąź | **jest** | tak | tak | tak | tak | nie | Bez odbioru okna W6. | ipc-threads, odbior-w6 |
| 19 | Zakładki wątków (zamknij inne, obok czatu) | **jest** | tak | tak | tak | tak | część | Chat z wątkami na zrzucie T-H; akcje zakładek nie sprawdzone. | ipc-thread-tabs |
| 20 | Wstrzymania wątku (limit użycia, restart agenta, serwer zajęty, limit wątków) | **jest** | tak | tak | tak | tak | część | `heldKind` (budget / agent-restart / server-busy / thread-limit) + `QueueHoldNotice` w czacie; w oknie nie sprawdzone. W5 `W12-heldKind`: kroki A1–A2 twarde zielone w oknie (T-AC); pozostałe przypadki tylko testy jednostkowe. | ipc-queue-holds, backend-w12-holds, tester-w12-tac |
| 21 | Cofnij usunięcie wątku, etykieta „zaczął agent” | **jest** | tak | tak | tak | tak | tak | `window.openbot.threadUndo` + `ThreadUndoBar`; w oknie nie sprawdzone. W oknie: pasek „Cofnij” z odliczaniem (zrzut 22) i kroki W5 `W12-threadUndo` A1–A7 zielone (T-AC, T-AF). | ipc-thread-undo, backend-w12-undo, tester-w12-tac, tester-w12-te |
| 22 | Kontekst (wskaźnik, kompaktowanie) i plan (karty planu) | **jest** | tak | tak | tak | tak | nie | Bez odbioru okna. | ipc-context, ipc-plan |
| 23 | Panel boczny czatu (przeglądarka, pliki, ustawienia agenta, głos) | **częściowo** | tak | tak | tak | część | część | Przeglądarka i ustawienia agenta w oknie; panel podagentów jest w kodzie, panel głosu w czacie nie. | kk-w3-acceptance |

### C. Kanały

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 24 | Kanały: tworzenie, lider, członkowie, edycja | **jest** | tak | tak | tak | tak | tak | Odbiór W4-T2 38/38. | kk-w4-g1 |
| 25 | Zadania w kanale (Chat|Zadania, Stop/Wznów/Przydziel, archiwum, otwórz jako czat, kroki) | **jest** | tak | tak | tak | tak | tak | W oknie (W4-T2). Od UI-M: szukanie, „Otwórz jako czat”, rozwijane kroki podzadań (bez zrzutu); Ekran Zadań czyta teraz `tasksView.board` (BE-AA, UI-AS): pięć kolumn Needs you / Working / Paused / Failed / Stopped z licznikami; w oknie T-AJ sonda `tasks-board` potwierdziła pięć kolumn z nagłówkami i licznikiem. Od UI-AA (20833c573): pasek postępu kroków, tekst „Zrobione kroki: X z Y” i oś kroków ze stanami (zrobiony, w toku, czeka, błąd); bez zrzutu. | kk-w4-g1, ui-w12-ui2, backend-w12-actions |
| 26 | Odpowiedź na wiadomość kanału | **jest** | tak | tak | tak | tak | tak | Krok e2e. | ipc-workspace-channels, ui-w4-ui1 |
| 27 | Ustawienia kanału (izolowana pamięć, kompakt, kasowanie historii, przeglądarka w kanale, rutyny kanału) | **częściowo** | część | część | część | część | część | Jest pamięć kanału i lider; reszta jak w 0.71 brak. | ipc-memory, ipc-isolation |

### D. Agenci

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 28 | Tworzenie agenta (kreator, awatar 17 kolorów, sugestie, szablony) | **jest** | tak | tak | tak | tak | tak | W oknie (zrzut T-H); od UI-J 12 kształtów maskotek × 17 kolorów (nowych dwóch kształtów nie oglądano w oknie). | kk-w3-acceptance, ui-w12-ui2 |
| 29 | Karty ustawień agenta (jedna lista kart: pliki, foldery, użycie, publikacja, zaawansowane, powiadomienia) | **jest** | tak | tak | tak | tak | część | Od UI-Y (e4ed946a4, 612460cbb, 0f96fdccf): 14 kart jako siatka kafli z własnymi ikonami, klik w dostępny kafel otwiera szczegóły (`agentCards.details`: pliki, foldery, użycie z budżetem, publikacja, zaawansowane, powiadomienia). Niedostępne kafle przygaszone z powodem. W oknie: tylko stary układ listy (zrzut T-H); siatki i szczegółów nie oglądano. | backend-w12-cards2, ipc-agent-card-details, ui-y |
| 30 | Pamięć agenta i kanału (zawsze / w razie potrzeby, szukanie) | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 31 | Skille (biblioteka, wersje, naprawa, per agent) | **jest** | tak | tak | tak | tak | tak | W oknie (W4-T5). | kk-w4-rows |
| 32 | Szablony agenta (zapis jako szablon na tym komputerze) | **jest** | tak | tak | tak | tak | nie | Silnik BE-G; od UI-Y przyciski „Zapisz jako szablon” / „Usuń szablon” i licznik szablonów w szczegółach karty „Publikacja” (`publishTemplate`, `unpublishTemplate`; test `AgentCardDetail`). Bez okna. | backend-w12-cards2, ui-y |
| 33 | Import agenta z paczki i transfer instancji (zip, podgląd, nowi agenci, rutyny wstrzymane) | **jest** | tak | tak | tak | tak | nie | Działy „Import” i „Transfer” ustawień serwera: trzy karty importu, trzy kroki transferu, eksport wybranych agentów, wybór pliku z podglądem (nic się nie zmienia do potwierdzenia, zajęte imię = kopia z numerem), wynik z ostrzeżeniami, lista „czego nie przenosimy”. Nie oglądane w oknie. | kk-w12-g2, kk-w12-screens |
| 34 | Subagenci i pytanie poboczne | **jest** | tak | tak | tak | tak | nie | Wykonawca pytania pobocznego podpięty; panel podagentów w panelu wątków (stan, podgląd, odpowiedź, Stop, wskazanie karty w Needs you). Nie oglądany w oknie. | backend-w12-side-question |
| 35 | Foldery agentów w pasku bocznym | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 36 | Pasek boczny, szyna stron i szyna serwerów | **częściowo** | tak | tak | tak | tak | część | Brak „Więcej”/przypinania stron, serwera zdalnego nie dało się sprawdzić. | kk-w3-acceptance, ui-w4-ui4 |
| 37 | Uprawnienia, reguły „zawsze zezwalaj”, budżety | **jest** | tak | tak | tak | tak | część | „Zawsze zezwalaj” w oknie; budżety i poziom dostępu bez odbioru okna. | ipc-access, ipc-budgets, ipc-approval-rules |
| 77 | Zmiana nazwy agenta (ustawienia agenta, menu „Rename”, pole na wierszu paska) | **jest** | tak | tak | tak | tak | tak | Pole „Agent name” w ustawieniach agenta, pozycja „Rename” w menu agenta i edycja na wierszu (UI-AD, UI-AF); nazwa zmienia się na pasku bocznym i w nagłówku (testy `App.test`). W oknie: nie potwierdzone (probe Rename Testera czeka na odbiór T-AF). T-AF w oknie: probe Rename (menu → pole na wierszu → pasek boczny i nagłówek) OK. | ui-w12-ad, ui-w12-af, tester-w12-te |

### E. Narzędzia i dane (MCP, Vault, tabele, pliki, przeglądarka)

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 38 | MCP: lista, dodawanie (stdio/HTTP), narzędzia, dostęp per agent | **jest** | tak | tak | tak | tak | tak | W oknie (serwer stdio). | kk-w3-acceptance |
| 39 | MCP: logowanie OAuth w przeglądarce | **jest** | tak | tak | tak | tak | część | Sekcja „Sign in to MCP servers” pod listą serwerów MCP: stan (wylogowany, czeka na przeglądarkę, kończenie, zalogowany, błąd), Zaloguj / Anuluj / Wyloguj, stałe zdania błędów. Nie oglądana w oknie; prawdziwego logowania nie sprawdzano. W prawdziwym oknie: panel widoczny na zrzucie 17-11-f (dane testowe, bez prawdziwego konta). | kk-w12-oauth, kk-w12-screens |
| 40 | Vault lokalny (login, karta, kontakt, klucz, TOTP; agent bierze bez ujawnienia) | **jest** | tak | tak | tak | tak | część | Login z wypełnieniem w oknie (hasła nie ma w wyniku, czacie ani plikach); karta, kontakt, klucz, TOTP tylko silnik i testy. | kk-w4-rows, ipc-vault |
| 41 | Vault: pokaż/skopiuj sekret osobie, import CSV | **brak** | nie | nie | nie | nie | nie | Świadomie: wartości są tylko do zapisu. | ipc-vault |
| 42 | Vault: konektory 1Password, Bitwarden, Proton Pass | **jest** | tak | tak | tak | tak | nie | Panel konektorów (stan, wybór metody, pola tylko do zapisu, lista dozwolonych logowań bez haseł, rozłączanie) jest w integracji (UI-M). W oknie nie oglądany; prawdziwe menedżery wymagają kont właściciela. | kk-w11-vault, ui-w12-ui2 |
| 43 | Vault-request w Needs you (agent prosi o login) | **jest** | tak | tak | tak | tak | część | Wypełnienie logowania w oknie; karta wyboru/dodania nie osobno. | ipc-vault, kk-w4-rows |
| 44 | Tabele wspólne agentów | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 45 | Biblioteka plików: dodaj, otwórz, pobierz, załącz; strona z filtrami, zaznaczanie wielu, sprzątanie; pliki maszyny | **częściowo** | tak | tak | tak | tak | część | Nowy widok plików (zakładki pochodzenia, szukanie, filtry, sortowanie, zaznaczanie do 200, sprzątanie z podglądem) jest w integracji. W oknie: zrzut T-M z pustą listą (bez danych testowych); dowód dodawania/otwierania z W4-T5 dotyczył starego panelu. Brak: przeglądania folderów komputera („pliki maszyny”) i miniatur. | backend-w12-library, tester-w12-tm, kk-w4-rows |
| 46 | Przeglądarka agenta (karty, przejęcie, profile); nauka, podgląd na żywo, PiP | **częściowo** | tak | tak | tak | tak | część | Karty i przejęcie w oknie; nauka, podgląd na żywo, PiP brak. | kk-w3-acceptance, ipc-browser |

### F. Marketplace

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 47 | Marketplace: katalog lokalny agentów i skilli (szczegóły, instalacja, sugestie) | **jest** | tak | tak | tak | tak | tak | Instalacja skilla w oknie (W3-T3); katalog ma 14 skilli i 9 agentów z własnymi tekstami (nie 251). | kk-w3-acceptance, ipc-marketplace, kk-w12-flows |
| 48 | Marketplace: układ jak 0.71 (Featured, kategorie, Verified/Public, link GitHub) | **częściowo** | tak | tak | część | część | część | Kontrakt i atrapa (`ipc-marketplace-screen`) są, ale strona ich jeszcze nie używa. Od UI-R (847b02e7b) `MarketplaceGallery` ma szukanie, chipy kategorii, rząd „Featured” i kafle własnym układem; nie oglądana w oknie (zrzut T-H pokazuje starą stronę). | kk-w12-workflows-marketplace, ui-r |
| 49 | Marketplace Apps: wtyczki jako serwery MCP, własne wtyczki | **częściowo** | tak | tak | tak | tak | nie | Dane katalogu (251) są poza repo, logowanie „link” zależy od OAuth MCP (bez ekranu). | kk-w11-marketplace |

### G. Dostawcy i użycie

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 50 | Codex i Claude: logowanie, CLI zarządzane, pula kont, limity, zapasowe modele | **jest** | tak | tak | tak | tak | tak | W5 29/29 w oknie, instalator. | kk-w5-g2, kk-w5-g3 |
| 51 | Własne endpointy (Ollama / styl LM) | **jest** | tak | tak | tak | tak | tak | W5 na atrapie. | kk-w5-g3 |
| 52 | ACP (Antigravity, Gemini preset, własny agent) z logowaniem | **jest** | tak | tak | tak | tak | nie | Tura z prawdziwym agentem nieodebrana w oknie. | ipc-acp-presets, ipc-acp-login |
| 53 | Katalog 18 dostawców (opisy, klucze maskowane, presety ACP oznaczone „niezweryfikowane”) | **jest** | tak | tak | tak | tak | nie | Strona Dostawcy ma sekcję „Katalog dostawców” (UI-P): 18 kart ze stanem wsparcia, pula kluczy tylko do zapisu (maska, włącz/wyłącz, limit). Nie oglądany w oknie; polecenia ACP nadal niezweryfikowane, brak sterowników natywnych. | backend-w12-providers, backend-w12-accounts, ui-w12-ui2 |
| 54 | Sterowniki innych dostawców (Grok, Cursor, OpenRouter, DeepSeek, Kimi, Copilot…) | **częściowo** | tak | tak | tak | część | nie | Grok (xAI) i OpenRouter działają bez CLI jako własne punkty końcowe z kluczem API (czat bez narzędzi programu); gotowe adresy w `ENDPOINT_CLOUD_PRESETS` (BE-Q, BE-T) tylko wypełniają formularz: 7 presetów (OpenRouter, xAI **niezweryfikowane**; DeepSeek, Mistral, Groq, Together AI, Moonshot z adresami z dokumentacji dostawców, BE-T). Drugi rząd przycisków „Use xAI (Grok)” i „Use OpenRouter” w formularzu punktów końcowych jest w integracji (UI-AA, d160de596; test przycisków zielony u UI); tylko wypełniają formularz. Połączenia z tymi usługami nie sprawdzano. Cursor, DeepSeek, Kimi, Copilot: tylko opisy w katalogu, polecenia ACP niezweryfikowane. | backend-w12-providers, backend-w12-q (pytania-do-wlasciciela) |
| 55 | Użycie: liczniki i pierścienie limitów, wykresy 7–365 dni, podział wg modelu i rodzaju tokenów | **jest** | tak | tak | tak | tak | część | Ekran Użycie: zakładki okresów, kafle, wykres dzienny, obciążenie komputera, tabela agentów i modeli, podział tokenów z pokryciem, limity dostawców. W oknie: zrzut T-M (pusta strona bez danych). Nie ma podziału na umiejętność. | backend-w12-library, backend-w12-accounts, tester-w12-tm |

### H. Automatyzacje (rutyny, przepływy)

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 56 | Rutyny agenta (harmonogram, webhook, historia, uruchom teraz) | **jest** | tak | tak | tak | tak | część | W oknie: tworzenie, następny start, Run now, minutowa sama; daily/cron/webhook nie. | kk-w3-acceptance, ipc-routines |
| 57 | Harmonogram: zaplanowane i wykonane przebiegi rutyn, feed ostatnich uruchomień | **jest** | tak | tak | tak | tak | część | Ekran Harmonogram: najbliższe dni po dniach (status, godzina), rutyny z zewnątrz i wstrzymane, feed. W oknie: zrzut T-M (pusta strona bez danych). Brak siatki miesięcznego kalendarza i notatek przy przebiegu. | backend-w12-library, tester-w12-tm |
| 58 | Rutyny kanału | **częściowo** | tak | tak | tak | część | nie | Od BE-R (08a06ba56, e09dcb177): kontrakt, sklep SQLite, silnik (o planowanej porze wiadomość „Scheduled: <nazwa>” do kanału, lider dostaje zadanie; jeden bieg naraz, pominięcia z powodem, bez nadrabiania), IPC `window.openbot.channelRoutines` (lista, tworzenie, edycja, usuwanie, „Run now”, historia z żywym stanem zadania), atrapa i testy (9 + 11 + 3 + 6). Ekran: `ChannelRoutinesPanel` w widoku kanału, w sekcji „Routines” (KK-Y): lista, tworzenie (interwał, codziennie, cron, strefa czasu), wstrzymaj/wznów, „Run now”, historia z żywym stanem zadania, usuwanie z potwierdzeniem, zdania błędów silnika bez zmian; test `ChannelRoutinesPanel` 9/9. Luki: bez edycji nazwy, instrukcji i harmonogramu istniejącej rutyny, bez wyboru dni tygodnia, bez webhooka, bez skoku do zadania. Nie oglądane w oknie. | backend-w12-channel-routines, kk-w12-channel-routines-ui |
| 59 | Przepływy: graf, wyzwalacz, agent, zgoda, wyjście, uruchomienia | **jest** | tak | tak | tak | tak | część | Wyzwalacz + agent w oknie; krok zgody nie. | kk-w3-acceptance, workflow-manager.test |
| 60 | Edytor przepływów jak 0.71 (paleta węzłów z Prompt i Condition, karta triggera, cofnij/ponów, plakietki błędów) | **częściowo** | tak | tak | tak | część | nie | Kontrakt, atrapa i silnik mają Prompt i Condition oraz funkcje edytora; stary edytor dostał tylko most (przyciski „Add prompt/condition”), od UI-V (92709aa62) jest nowy edytor w kartach kroków z portami i zakrzywionymi połączeniami; w oknie go nie oglądano, więc cofnij/ponów i plakietki błędów nie sprawdzone. | kk-w12-flows, kk-w12-workflows-marketplace, ui-v |
| 61 | Przepływy: wersje i przywracanie; katalog GitHub, kredyty mediów | **częściowo** | tak | tak | tak | część | część | Wersje (lista, podgląd, przywracanie, różnice) mają kontrakt, silnik i testy (KK-L) oraz panel `WorkflowVersionsPanel` na stronie przepływów (36c3f1e06; nie oglądany w oknie). Katalog GitHub i kredyty mediów: brak. W oknie: sekcja „Versions” z listą wersji po wyborze przepływu (zrzut 15, T-AC/T-AF); przywracanie i różnice nie oglądane ręcznie. | kk-w12-flows, ui-w12, tester-w12-te |

### I. Komunikatory

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 62 | Telegram (long polling, tylko dozwoleni, tylko rozmowy prywatne) | **jest** | tak | tak | tak | tak | część | Panel „Messengers” na stronie Library: stan, token tylko do zapisu (pole czyszczone), lista dopuszczonych i nieznanych rozmów (bez treści), dopuszczanie z agentem, kroki konfiguracji. Nie oglądany w oknie; prawdziwego bota nie sprawdzano. W prawdziwym oknie: panel widoczny na zrzucie 17-11-f (dane testowe, bez prawdziwego konta). | kk-w10-kk2, kk-w12-screens |
| 63 | Slack (Socket Mode, tylko DM) | **jest** | tak | tak | tak | tak | część | Ten sam panel: dwa tokeny (bota i aplikacji), tylko wiadomości prywatne (numer D…). Nie oglądany w oknie; prawdziwego Slacka nie sprawdzano. W prawdziwym oknie: panel widoczny na zrzucie 17-11-f (dane testowe, bez prawdziwego konta). | kk-w12-komunikatory, kk-w12-screens |
| 64 | Discord | **brak** | nie | nie | nie | nie | nie | Wstrzymany decyzją lidera. | - |
| 65 | Łącznik GitHub (repozytoria, kod urządzenia) | **brak** | nie | nie | nie | nie | nie | Brak. | - |

### J. Serwer, zespół, zdalny pulpit, telefon

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 66 | Ustawienia serwera (14 sekcji) | **częściowo** | tak | tak | tak | tak | część | 12 sekcji z danymi, Członkowie i Strony „niedostępne”; ekran na zrzucie T-H. | ipc-server-settings, backend-w12-settings |
| 67 | Zespół: członkowie, zaproszenia, obecność, DM, hostowanie | **częściowo** | tak | tak | tak | tak | nie | Okno dołączania jest; reszty nie dało się sprawdzić (sieć, konto). | kk-w3-acceptance, ipc-team-host |
| 68 | Zdalny pulpit Windows (host, klient, zgoda, tryby, „pytaj przy każdej sesji”) | **jest** | tak | tak | tak | tak | część | Silnik z testem na hoście i kliencie; strona ma panel „Who may come in”: plakietka (gotowe/wyłączone/niedostępne), sesje i karty czekające, przełącznik „Ask on this computer every time” (`setAskEverySession`), „Unattended access: niedostępne” z powodem. Panel nie oglądany w oknie; obraz i sterowanie w oknie nie sprawdzane; bez trybu bez nadzoru z założenia. | ipc-remote-desktop, kk-w12-vault-voice |
| 69 | Telefon: czat i odpowiedzi na decyzje (PWA) | **częściowo** | tak | tak | tak | tak | część | W oknie z atrapą; przełącznik powiadomień i test są w panelu telefonów (nie oglądane w oknie); brak prawdziwego telefonu. | kk-w3-acceptance, mobile-app |
| 70 | Telefon: tworzenie i edycja agentów | **częściowo** | tak | tak | tak | tak | część | Tworzenie widać na komputerze; edycja i awatar nie. | kk-w3-acceptance |
| 71 | Telefon: kanały w PWA | **częściowo** | tak | tak | tak | nie | nie | Od BE-AB: API telefonu ma kanały (lista, wiadomości ze stronicowaniem, wysłanie, zadania, Stop/Pauza/Wznów); ekranu w aplikacji telefonu brak, strumień zdarzeń nie niesie zmian kanałów. | ipc-mobile-channels, mobile-phone-api |
| 72 | Skróty klawiszowe (Ctrl+K, Ctrl+F, Alt+↑, zakładki) | **częściowo** | część | część | część | część | część | Wybrane skróty działają; pełnej mapy 0.71 nie ma. | kk-w3-acceptance |

## Poza zakresem (nie liczone)

| Funkcja 0.71 | Dlaczego |
|---|---|
| Rozliczenia (Stripe), plany serwerów, licencje | Program tylko dla właściciela; decyzja właściciela 12.11. |
| Serwery hostowane w chmurze (tworzenie, wznawianie, zamówienia) | Nie cel; serwer Linux właściciel robi sam. |
| Konto chmurowe: e-mail, sesje, logowanie firmowe/SCIM | Nie cel. |
| WhatsApp (QR, grupy, dozwoleni nadawcy) | Decyzja lidera: nie (nieoficjalne API, ryzyko). |
| Mobile: stały link i trasa przez chmurę | Poza zakresem (stały link wpuszcza każdego, kto go znajdzie; chmura = dane poza komputerem). Zapisane w kontrakcie jako „niedostępne”. |
| Skille wbudowane OpenBota (3) i wygląd graficzny 0.71 | Własne zasoby; wygląd to bramka UI Testera, nie parytet funkcji. |

## Zmiany od wersji @ `8e6600948` (79,9% kod / 52,6% w oknie / 60,4% ostrożnie): odbiór T-AJ

Tester T-AJ (Electron @ `2dfb55f09`, raport `tester-w12-tj.md` na `team/tester/w12-tj`): e2e 0 FAIL, W5 33/33, sondy `ui-probes`, `next-probes`, `behavior`, a11y ok. **Procenty się nie zmieniają: 79,9% kod, 52,6% w oknie, 60,4% ostrożnie.** Żaden wiersz nie przechodzi z „część” na „tak” ani z „nie” na „część”, bo nowe dowody dotyczą wierszy już policzonych albo elementów bez własnego wiersza.

| Wiersz | Zmiana opisu | Dlaczego liczby bez zmian |
|---|---|---|
| 2 Wygląd | Tekst „ekran jest tylko dla motywu” był nieaktualny: ekran ma 6 z 7 kontrolek. Dowód z okna: skrót wysyłania i „unread first” zapisują się (sondy IPC i dataset) | Wiersz zostaje „częściowo” (brak przełącznika „Unread first” w tipie, UI-AT na gałęzi UI) i E, O = część |
| 25 Zadania w kanale | Ekran czyta `tasksView.board`; w oknie sonda potwierdziła 5 kolumn z licznikami | Wiersz już był „jest”, O = tak |
| 71 Telefon: kanały w PWA | **Nie ruszałem.** Tester ma własną zmianę tego wiersza na swojej gałęzi (unit 7+1, ekran PWA UI-13 `1682b267a` jeszcze nie w tipie) | Zostaje „częściowo”, E = nie, dopóki UI-13 nie wejdzie do integracji |
| 73, 74, 76, 77 | Bez zmian: T-AJ powtórzył `launchAtLogin`, zasobnik, przywracanie i zmianę nazwy | już policzone w T-AI |

**Co przesunie liczby przy następnym odbiorze:** scalenie UI-AT (wiersz 2: E część → tak, O zależy od kliknięcia przełącznika w oknie) oraz UI-13 i BE-AD (wiersz 71 i przywracanie miejsca per serwer).

**Nie sprawdzone w oknie:** klik w kontrolki sekcji „Appearance”, autostart po restarcie Windows, klik w ikonę zasobnika, Teach i Voice w menu „+” (wyłączone, bez kontraktu silnika), axe i Storybook.

## Zmiany od wersji @ `206fdc9b0` (79,2% kod / 51,3% w oknie / 59,7% ostrożnie): odbiór T-AI w Electronie

Tester T-AI (z GO): e2e 0 FAIL, W5 33/33, `MaxListenersExceededWarning` 0. Zmieniają się dwa wiersze, reszta bez zmian.

| Miara | Było | Jest |
|---|---|---|
| Parytet (kod) | 79,2% (61 z 77) | **79,9%** (61,5 z 77) |
| Ekran w kodzie | ~85,7% | **~86,4%** |
| W oknie sprawdzone | 51,3% (39,5 z 77) | **52,6%** (40,5 z 77) |
| Ostrożny parytet | 59,7% (46,0 z 77) | **60,4%** (46,5 z 77) |

| Wiersz | Zmiana | Dowód |
|---|---|---|
| 76 Przywracanie miejsca | częściowo → **jest**; E część → tak; O część → tak | UI-AH `e6523c20a` (wątek zapamiętany, `hasThread`); T-AI sonda `restore-thread`: po restarcie wracają ostatni agent i wątek, pasek wątku widoczny |
| 75 Linki z rozmów | O nie → część | T-AI sonda `external-links`: ustawienie app↔przeglądarka zapisuje się; samo otwarcie linku nie sprawdzone (`browser.open` na martwy host: oczekiwany błąd DNS) |

**Bez zmiany, ale z nowym dowodem:** 73 (T-AI: `launchAtLogin` true→false, wpis w rejestrze przywrócony; restart Windows nadal nie sprawdzony), 74 (T-AI: zamknięcie chowa, „open” pokazuje; klik w ikonę przy zegarze nadal nie sprawdzony), 77 (rename ok, jak wcześniej).

**Dowody z okna dla elementów, które nie mają własnego wiersza w 77 funkcjach (nie zmieniają procentów):** czyszczenie historii kanału (zatrzymaj zadanie → wyczyść → 0 zostało), okno historii (`historyWindow: 20` zapisane), menu „+” (Attach/Skill/Side działają; Teach i Voice wyłączone).

**Nie sprawdzone w oknie:** skrót wysyłania (Enter vs Ctrl+Enter), sonda a11y, axe i Storybook (to robi lider), klik w ikonę zasobnika, autostart po restarcie Windows.

**Uwaga o źródle:** raport `tester-w12-ti.md` leżał w momencie liczenia niezacommitowany w worktree Testera; po jego commicie warto sprawdzić, czy liczby w nim się nie zmieniły.

## Zmiany od wersji @ `4ddcbb5d3` (79,2% kod / 44,2% w oknie / 58,4% ostrożnie): dowody z okna

Kod się nie zmienił: **79,2%** (61 z 77), skontraktowane ~92,9%, silnik ~92,2%, ekran ~85,7%. Zmienia się tylko to, co Tester potwierdził w prawdziwym programie.

| Miara | Było | Jest |
|---|---|---|
| W oknie sprawdzone | 44,2% (34 z 77) | **51,3%** (39.5 z 77) |
| Ostrożny parytet | 58,4% | **59,7%** |

Wiersze, w których przybył dowód z okna (kolumna „O”):

| Wiersz | Funkcja | O: było → jest | Dowód |
|---|---|---|---|
| 10 | Aktualizacje | nie → część | nagłówek Updates i tor na ekranie „Settings” (17-11-h) |
| 17 | Akcje na wiadomościach | nie → część | menu z 6 akcjami (09d) i kroki W5 `W12-messageMenu` |
| 20 | Wstrzymania wątku | nie → część | W5 `W12-heldKind` A1–A2 |
| 21 | Cofnij usunięcie wątku | nie → tak | pasek „Cofnij” (zrzut 22) i W5 `W12-threadUndo` A1–A7 |
| 61 | Przepływy: wersje | nie → część | sekcja „Versions” (zrzut 15) |
| 73 | Autostart | nie → część | zapis `launchAtLogin` w oknie (autostart po restarcie Windows nie sprawdzony) |
| 74 | Praca w tle | nie → część | zamknięcie ukrywa okno, proces żyje, `show()` przywraca (kliku w ikonę przy zegarze nie sprawdzono) |
| 76 | Przywracanie miejsca | nie → część | restart: wraca Library i Agent B; wyłączone: od początku (wątek nie wraca) |
| 77 | Zmiana nazwy agenta | nie → tak | probe Rename: menu → pole → pasek boczny i nagłówek |
| 4 | Głos | część → część | nagłówek Voice i mikrofon widoczne; nagrywanie nie sprawdzone |

(Stan z T-AF; wiersze 75 i 76 oraz nowe elementy zostały potwierdzone w T-AI, sekcja wyżej.)

## Poprzednie zmiany: od wersji @ `eb9df8800` (78,5% kod / 47,2% w oknie / 59,0% ostrożnie, 72 funkcje)

| Miara | Było (72) | Jest (77) | Dlaczego |
|---|---|---|---|
| Parytet kodowy | 78,5% (56,5) | **79,2%** (61) | 5 nowych wierszy (73–77) dodało 4,5 pkt; wiersz 2 bez zmiany stanu |
| Skontraktowane | ~91,7% | **~92,9%** | nowe wiersze + wiersz 2 (kontrakt BE-U: część → tak) |
| Silnik | ~91,0% | **~92,2%** | nowe wiersze + wiersz 2 (zapis BE-U: część → tak) |
| Ekran w kodzie | ~85,4% | **~85,7%** | nowe wiersze mają ekran (73–75, 77) lub jego część (76) |
| W oknie sprawdzone | 47,2% (34) | **44,2%** (34) | licznik bez zmiany: **żadna nowa funkcja nie jest potwierdzona w oknie**, a mianownik urósł z 72 do 77 |
| Ostrożny parytet | 59,0% | **58,4%** | to samo: nowe „jest” bez dowodu w oknie liczą się za ½ |

**Dlaczego „w oknie” spadło, choć nic nie zepsuto:** doszło pięć funkcji, których nikt jeszcze nie obejrzał w prawdziwym programie. Wzór z pliku liczy je jako „nie sprawdzone”. Procent wróci do góry po odbiorze T-AF (Tester).

Co zmieniło wiersze:
1. **Nowe wiersze 73–77:** autostart (73), praca w tle (74), miejsce otwierania linków (75), przywracanie miejsca (76, częściowo: bez wątku), zmiana nazwy agenta (77). Cztery „jest” (K, S, T, E = tak) i jedno „częściowo”. Wszystkie O = nie.
2. **Wiersz 2 (wygląd i ustawienia ogólne):** kontrakt i silnik pełne (BE-U: motyw, rozmiar UI, czcionka, skrót wysyłania, akcent, kroki agenta, kolejność nieprzeczytanych); **ekran tylko dla motywu**, więc zostaje „częściowo”.
3. **Wiersze 4 (Głos) i 10 (Aktualizacje):** stan bez zmian, ale dopisana uczciwa uwaga: ich panele **były nieosiągalne** (siedziały w oknie ustawień, którego nic w programie nie otwierało); od KK-AC są na ekranie „Settings”. W oknie nadal nie oglądane.
4. **Wiersz 54 (sterowniki dostawców):** 7 presetów z BE-T; OpenRouter i xAI oznaczone „niezweryfikowane”. Stan „częściowo” bez zmiany (polecenia CLI innych dostawców nadal brak).
5. **Atrapy usunięte** z okna ustawień (KK-AF): dwa przełączniki „Notifications” bez zapisu; prawdziwa macierz powiadomień jest na ekranie „Settings” (wiersz 3).
6. Wiersz 28 i pozostałe bez zmian (nowe maskotki 44 px, 12 twarzy: tylko opis w UI-AG, nie oglądane w oknie).

## Poprzednie zmiany: od wersji @ `b01e8a060` (77,8%)

| Miara | Było | Jest | Dlaczego |
|---|---|---|---|
| Parytet kodowy | 77,8% (56) | **78,5%** (56,5) | wiersz 58 (rutyny kanału): brak → częściowo |
| Skontraktowane | ~91,0% | **~91,7%** | wiersz 58: kontrakt z częściowego na pełny |
| Silnik | ~89,6% | **~91,0%** | wiersz 58: sklep, harmonogram, IPC |
| Ekran w kodzie | ~84,7% | **~85,4%** | wiersz 58: panel rutyn kanału w widoku kanału (część) |
| W oknie sprawdzone | 47,2% | 47,2% | bez zmian: nic z nowych rzeczy nie oglądano w oknie |
| Ostrożny parytet | 58,3% | **59,0%** | jedna funkcja więcej w ½ |

Co zmieniło wiersze:
1. **Wiersz 58 (rutyny kanału): brak → częściowo, +0,7 pp.** Backend BE-R oddał silnik i IPC (testy 9 + 11 + 3 + 6 zielone u autora, po jednym pliku). Nie jest „jest”, bo nie ma ekranu, a nic nie biegło w prawdziwym programie. Obszar H: 67% → 75%.
2. Wiersz 54: tylko opis (przyciski presetów już scalone), bez zmiany liczb.
3. Wiersz 25: tylko opis (oś kroków Zadań), wiersz już był „jest”.
4. Pozycja 16 w `ekrany-do-podpiecia.md` (ekran rutyn kanału) zrobiona przez KK: panel w widoku kanału. Wiersz zostaje „częściowo” (brak edycji istniejącej rutyny, dni tygodnia, webhooka; nic nie oglądano w oknie).

## Poprzednie zmiany: od wersji @ `e1a2fdc76` + w12-screens @ `543bc7f88` (77,1%)

| Miara | Było | Jest | Dlaczego |
|---|---|---|---|
| Parytet kodowy | 77,1% (55,5) | **77,8%** (56) | wiersz 54 (sterowniki dostawców): brak → częściowo |
| Skontraktowane | ~89,6% | **~91,0%** | wiersz 54 (tak), wiersz 58 (część: reguły rutyn kanału) |
| Silnik | ~88,2% (skrypt) | **~89,6%** | wiersz 54: endpointy z kluczem to istniejący silnik |
| Ekran w kodzie | ~83,3% (skrypt) | **~84,7%** | wiersz 54 (część: ręczny formularz) i wiersz 61 (panel wersji przepływu jest na stronie) |
| W oknie sprawdzone | 47,2% | 47,2% | bez zmian: żaden z nowych ekranów nie był oglądany w oknie |
| Ostrożny parytet | 57,6% | **58,3%** | jedna funkcja więcej (wiersz 54) w ½ |

Co zmieniło wiersze (i co NIE zmieniło liczb):
1. **Wiersz 29 (karty agenta) i 32 (szablony):** UI-Y dał siatkę 14 kafli i szczegóły kart z publikacją szablonu. Stan już był „jest”, więc 0 pp; zmienił się tylko opis dowodu. Brak odbioru w oknie, więc kolumna O bez zmian.
2. **Wiersz 54 (sterowniki dostawców): brak → częściowo, +0,7 pp.** To jedyna zmiana w górę. Powód: Grok (xAI) i OpenRouter da się dodać bez CLI jako punkt końcowy z kluczem (czat bez narzędzi programu). Ocena jest łagodna: to 2 z ok. 6 nazwanych dostawców, bez przycisków w UI (UI-AA niescalone) i bez sprawdzenia połączenia. Jeśli lider woli ostrożniej, wiersz wraca do „brak” i parytet kodowy to 77,1%, ostrożny 57,6%.
3. **Wiersz 58 (rutyny kanału): zostaje „brak”**, ale kolumny K i T na „część”: są tylko reguły w kontrakcie z testem. Bez silnika i ekranu nie uznaję go za częściowo (ta sama reguła co wiersz 54 przed zmianą). 0 pp.
4. **Parser linku skilla (`ipc-skill-link.ts`):** nie ma własnego wiersza; wiersze 47–49 bez zmian. Zmieniła się tylko tabela decyzji (bezpieczna połowa zrobiona, nic się nie pobiera). 0 pp.
5. **Wiersze 60 i 61 (edytor i wersje przepływów):** opisy były nieaktualne. Jest nowy edytor w kartach kroków (UI-V) i panel wersji na stronie przepływów. Stany bez zmian (częściowo), E w wierszu 61 „nie” → „część”. 0 pp, bo reszta wiersza (katalog GitHub, kredyty mediów) dalej brak.
6. **Wiersz 48 (układ Marketplace):** opis dopisany o galerię UI-R; stan częściowo bez zmian.
7. **Tabela obszarów** przeliczona z wierszy. Stara miała błąd w obszarze B (8 jest / 3 częściowo / 1 brak = 79%); z wierszy wychodzi 10 / 2 / 0 = 92%. To poprawka liczenia, nie zmiana funkcji: sumy 46 / 20 / 6 zgadzają się z wynikiem głównym.
8. Wzór „ostrożnego” wyprowadziłem z poprzedniej tabeli (zgadza się na 41,5 = 57,6%): jest z dowodem „tak” w oknie = 1; każdy inny wiersz poza „brak” = ½; brak = 0.

## Wcześniejsze zmiany: od wersji @ `b1e28ab8f` + w12-flows (68,8%)

| Miara | Było | Jest | Dlaczego |
|---|---|---|---|
| Parytet kodowy | 68,8% | **77,1%** | KK: dziewięć wierszy → 75%; KAPI-C: wiersz 20 wstrzymania (częściowo→jest) i 21 Cofnij (brak→jest) po Backend w12-holds / w12-undo |
| Skontraktowane | 87,5% | **~89,6%** | +heldKind + threadUndo |
| Silnik | 86,1% | **~89%** | heldKind + threadUndo w backend |
| Ekran w kodzie | 70,8% | **~84%** | +QueueHoldNotice + ThreadUndoBar (wcześniej KK panele) |
| W oknie sprawdzone | 45,1% | 45,1% | bez zmian: heldKind/Cofnij nie oglądane w oknie |
| Ostrożny parytet | 56,9% | **57,6%** | Cofnij weszło jako ½ (jest bez okna); wstrzymania już były ½ jako częściowo |

## Decyzje: luki bez silnika

Godziny to moja ocena (kontrakt + silnik + testy na atrapach), nie pomiar. „Lekkie” = testy jednostkowe z fałszywym serwerem; „ciężkie” = potrzebne okno programu, prawdziwe CLI albo konto. Szczegóły i uzasadnienia: `luki-silnika-071.md`.

| Luka | Stan | Koszt | Lekkie/ciężkie | Decyzja | Wpływ na parytet |
|---|---|---|---|---|---|
| Marketplace: więcej treści (dziś 8 skilli + 5 agentów) | instalacja działa; dziś 14 skilli + 9 agentów | ok. 7 h (6 skilli + 4 agenty) | lekkie | ZROBIONE (73e452605) | 0 (poprawia wartość, nie wiersz) |
| Marketplace: instalacja skilla z linku GitHub | tylko parser linku w kontrakcie (`ipc-skill-link.ts`, BE-Q): przyjmuje wyłącznie `https://github.com/<właściciel>/<repo>[/tree/<gałąź>/<folder>]`, lista 5 kontroli dla karty zgody; nic się nie pobiera | ok. 8 h, zostaje ok. 6 h (pobranie, przegląd, karta zgody, ekran) | lekkie, kod z internetu | BEZPIECZNA POŁOWA ZROBIONA; reszta tylko jeśli właściciel chce, z kartą zgody | 0 |
| Workflows: Condition + Prompt | silnik, kontrakt i atrapa są; edytor tylko z mostem | ok. 7 h (5 + 2) | lekkie | ZROBIONE (gałąź w12-flows) | 0 (edytor dostaje te węzły) |
| Workflows: wersje przepływu i przywracanie | silnik, kontrakt i atrapa są; ekranu brak | ok. 5 h | lekkie | ZROBIONE (2540926db) | +0,7 pp (brak → częściowo) |
| Workflows: LLM, Asset, adnotacje na płótnie | brak | ok. 13 h (5 + 5 + 3) | lekkie | NIE ROBIĆ teraz | 0 |
| Workflows: Image/Video, katalog GitHub, kredyty mediów | brak | 12 h+ każde | ciężkie | NIE ROBIĆ | 0 |
| Discord (tylko DM) | wstrzymany | ok. 9 h | lekkie (prawdziwy test: token bota) | NIE ROBIĆ teraz (najpierw ekran komunikatorów) | +0,7 pp silnik; +1,4 pp z ekranem |
| Rutyny kanału | silnik zrobiony (BE-R): sklep, harmonogram, wiadomość do kanału, IPC `channelRoutines`, atrapa, testy; ekranu brak | ok. 6 h, zostaje ok. 2–3 h (ekran UI) | lekkie | ZROBIONE (silnik BE-R, panel KK; luki: edycja istniejącej rutyny, dni tygodnia, webhook) | +0,7 pp (brak → częściowo, już policzone) |
| Sterowniki innych dostawców (Grok, Cursor, OpenRouter…) | Grok (xAI) i OpenRouter działają jako własne punkty końcowe z kluczem, bez CLI (`ENDPOINT_CLOUD_PRESETS`, BE-Q); przyciski presetów w formularzu scalone (UI-AA) | ok. 8 h na dostawcę (CLI) | CLI ciężkie (polecenia niezweryfikowane); presety lekkie | PRESETY I PRZYCISKI W UI ZROBIONE; CLI: NIE ROBIĆ bez zgody właściciela na pobranie | +0,7 pp (brak → częściowo, już policzone) |
| Cofnięcie usunięcia wątku | jest (silnik+pasek; okno nie) | ok. 3 h | lekkie | ZROBIONE (Backend BE-J / w12-undo) | +1,4 pp (brak → jest) |
| Wstrzymania wątku (restart agenta, serwer zajęty, limit wątków) | jest (heldKind + QueueHoldNotice; okno nie) | ok. 5 h | lekkie | ZROBIONE (Backend BE-O / w12-holds) | +0,7 pp (częściowo → jest) |

**Zostaje „robić” po stronie silnika: 0 h** w tej tabeli (treści Marketplace, Condition+Prompt, wersje, wstrzymania i Cofnij — zrobione). Ekrany do gotowych silników: układ Marketplace Agents/Skills i edytor Workflows z paletą (UI Designer, częściowo już w `f87181e1a`). Komunikatory, aktualizacje, OAuth MCP, Import/Transfer, głos, Mobile Connect, zdalny pulpit, katalog dostawców, Vault konektory, Biblioteka, Użycie i Harmonogram już mają ekran.

## Czego nie sprawdziłem

1. Nie uruchamiałem Electrona, Storybooka, testów ani e2e w tym zadaniu: stan wierszy to czytanie kodu integracji, kontraktów, raportów i testów (nazwy), nie ponowne przebiegi.
2. Dowody „w oknie” są z raportów z 13–17.11 (poprzednie wersje integracji); zmiany UI po nich (UI-I, UI-J) nie były oglądane w oknie.
3. Kolumny K/S/E oceniłem z listy plików i użycia `window.openbot.*` w rendererze (grep), nie przez uruchomienie ekranu; „część” oznacza, że znalazłem tylko fragment.
4. Biblioteka, Użycie i Harmonogram: zrzut T-M pokazuje, że ekrany się rysują, ale bez danych testowych (puste listy); to „część”, nie „tak”. Panel Vault konektorów i Zadania z UI-M nie miały zrzutu.
5. Po zmianach UI-I/UI-J pełny sandbox:e2e miał 27 ok / 3 FAIL, a po poprawkach Testera (T-M) 30 ok / 0 FAIL na `79567cdf9`; zmiany UI po tym SHA (UI-M, UI-N, UI-O) nie miały jeszcze nowego przebiegu.
6. Wszystkie opisy są własnymi słowami; w repo nie ma treści ani grafik OpenBota, a pliki analizy 0.71 zostają poza repo.
