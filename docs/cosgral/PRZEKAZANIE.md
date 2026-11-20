# Przekazanie projektu (najnowsze): sesja 19.11.2026 wieczór, ekrany P1 i reszta

**Dla następnego agenta. Zacznij od `docs/cosgral/INSTRUKCJA-DLA-AGENTA.md`, punkt „Stan po sesji 19.11 wieczór”.**

## W. Ta sesja (gałąź `claude/charming-euler-ag7ese`)

| Co | Gdzie |
|---|---|
| Gałąź | `claude/charming-euler-ag7ese` = `claude/friendly-noether-jpw1if` (@ `5f0d878`) + commity tej sesji |
| Do scalenia | razem z `claude/friendly-noether-jpw1if` do `team/lider/poprawki-po-exe` (PR #24), potem do `codex/cosgral-desktop` |

**Zrobione (każdy ekran obejrzany w Storybooku przed i po, po polsku i po angielsku, z testami):**

1. **Ustawienia** (ikona na dole paska stron, menu konta): własne okno `SettingsDialog.tsx` zamiast kreatora w trybie
   przeglądu. Spis sekcji z ikonami (Ogólne, Powiadomienia, Działanie aplikacji, Dostawcy, Uprawnienia na macOS, Wygląd,
   Rozmowy, Budżet, Głos, Aktualizacje, Dane i prywatność), który przewija i podąża za przewijaniem; wszystkie sekcje
   zostają na stronie (testy i skrypty ich szukają). Jedna stopka: „Zapisz zmiany” zapisuje dostawcę, język i
   powiadomienia. Powiadomienia jako przełączniki. Pierwsze uruchomienie zostaje kreatorem.
2. **Okno kanału** (`ChannelEditor.tsx`): podgląd stosu stworków, członkowie jako lista ze stworkami, prowadzący
   oznaczony na liście, podpowiedzi pod polami. Nazwy pól dla testów i e2e bez zmian.
3. **Nowy agent** (`NewAgentPage.tsx`, `new-agent.css` na `--openbot-*`): nagłówek `WorkPage`, pracownia stworka
   (scena, podgląd min, kształt, kolor; próbki kolorów były niewidoczne), powód przy wyłączonym przycisku.
4. **Dostawcy › Konta** (`ProviderAccounts.tsx`): wiersze z kolejnością w puli, stanem i akcjami jako ikony.
   **Nie zrobione:** CLI agentów, Klucze API, Punkty końcowe (dalej stosy pól).
5. **Katalog dodatków** (`MarketplacePage.tsx`, `PluginAppsPanel.tsx`): nagłówek `WorkPage`, ikony kategorii, opisy
   w dwóch liniach (po polsku nie są ucinane).
6. **Ustawienia serwera** (`ServerSettingsPage.tsx`): nagłówek `WorkPage`, 14 sekcji z ikonami i opisem, pola jako wiersze.
7. **Bezpieczeństwo (P0 3.1):** `electron` 43.4.0 → 43.8.12, `@modelcontextprotocol/sdk` 1.30.0 → 1.32.2,
   `zod` 4.4.3 → 4.6.7. `bun audit` nie pokazuje już tych paczek. `undici` zostaje tylko w narzędziach (jsdom,
   pobieranie Electrona, miniflare), nie w programie. **`.exe` trzeba przebudować na Windows.**
8. **e2e (P0 3.2.4):** `sandbox-e2e.ts` i `sandbox-acceptance.ts` otwierają „Nowy kanał” z menu „+”; wiersz 39
   akceptacji używa przełączników i stopki okna Ustawień.
9. **Testy (P2 5.8):** `acp-presets.test.ts` działa na każdym systemie (pliki szukane jak na Windows przez podany
   `isFile`, pełna ścieżka z korzenia bieżącego systemu); niestabilny test kompaktowania wątku poprawiony (przy 95 %
   program sam kompaktował wątek po turze i wyścig decydował o 1 albo 2 kompaktowaniach; test działa teraz poniżej
   progu; 6/6 przebiegów zielonych).
10. **Po polsku (P3 6.1, część):** lista osób, pasek, wątki („New thread”), akcje wiadomości, kolejka, pamięć, karty
    kont i limitów, załączniki, komunikaty głosu, Sejf, Zdalny pulpit. Zostały drobne z wiersza „pozostałe” tabeli 6.1.
11. **Biome:** stare ostrzeżenie w `cosgral.css` usunięte, `bun run lint` bez ostrzeżeń.

12. **Azure Glass (styl z inspiracji właściciela, 19.11 wieczór):** nowa paleta (granatowa czerń, Dark Azure,
    elektryczny błękit, chłodna czerwień), szkło podświetlone od dołu, przejścia kolorów, ziarno, świecące pigułki,
    mocniejsze stworki. Tokeny w `cosgral-tokens.css` i `styles.css`, reguły w `styles/azure-glass.css`, opis w
    dzienniku `PROMPT-UI-JAKOSC.md` (wiersz 19.11 (6)). Storybook 370/370 (axe), testy renderera 1119/1119.
    Druga runda (prawie 1:1 z inspiracjami): kafle podświetlone od dołu, ikony z siatką gradientów, pigułki stanów,
    błyszczące pigułki akcji, połysk stworków także u osób (wiersz 19.11 (7) w dzienniku).
    Trzecia runda: szklane tło okna z plamami światła, pasek stron jako dok z kolorowymi kafelkami, większe ikony,
    szklane pola, pigułki, menu i podpowiedzi (wiersz 19.11 (8)). `backdrop-filter` na dużych panelach: sprawdzić
    płynność przewijania na słabszym komputerze z Windows.
    **Do obejrzenia na Windows:** testy wizualne zmienią się na każdym ekranie (inna paleta) — wzorce aktualizować
    dopiero po obejrzeniu różnic.

13. **Kontynuacja według schematu (P1 → P2 → P3):** wnętrza Dostawców (CLI, Klucze API, Endpointy), pasek kanału w wąskim
    oknie, nagłówek wiadomości bezpośredniej, jasne historyjki, leniwe ładowanie czterech stron, błąd kontekstu `Field`,
    ostatnie angielskie napisy (wiersz 19.11 (9) w dzienniku).
14. **Kolejne strony w Azure Glass (wiersz 19.11 (10)):** Zadania na ramie `WorkPage` ze szklaną tablicą; Przepływy
    (kroki jako szklane kafelki, kolory kroków z tokenów); Biblioteka, karty agenta i panel ustawień agenta (kafelki
    z siatką gradientu, strzałki na prawej krawędzi, sekcje zaawansowane jako karty); `PanelHeading` (kafelek z ikoną
    + tytuł) na Telefonie, Zdalnym pulpicie i w sekcjach panelu agenta; ekrany logowania i konfiguracji na szkle;
    **Modele zapasowe:** błąd pionowego tekstu („acp:removed” łamany po literze) naprawiony, wiersze z akcjami zawijają
    się, listy jako wstawki szkła; formularze dodawania (Dostawcy, ACP, rutyna) jako wstawka szkła zamiast ramki
    kreskowanej; podświetlenie sekcji w `WorkPageAnchors` ignoruje pustą sekcję. **Stworki:** mina członka w nagłówku
    kanału wg jego zadań (`channelMemberMood`), mina wiadomości wg rodzaju (`channelMessageMood`), mrugnięcie przy
    najechaniu (`shell.css`, tylko bez „reduce motion”). Jasny motyw min sprawdzony: kropla i rumieniec czytelne.
15. **Ikony, sekcje, znaczniki wg inspiracji 20.11 (wiersz 20.11 (1)):** podświetlane szklane żetony zamiast neonowych
    siatek, karty jako granatowe szkło ze świecącą dolną krawędzią, jedna rodzina pigułek stanu. Propozycja palety:
    `docs/cosgral/PLAN-KOLORY.md` i strona-podgląd (artefakt „Paleta Azure Glass”).
16. **Typografia i napisy (wiersz 20.11 (2)):** skala, trzy grubości, etykiety bez wersalików, daty w języku
    aplikacji (`appLocale()`), polska odmiana liczebników (`tn()`), dotłumaczone podsumowania kart i powody akcji.
17. **Przegląd całości (wiersz 20.11 (3)):** skany (historyjki, układ w wąskich oknach, napisy na sztywno), poprawki
    nawigacji ustawień, notatek stron, pigułek i przycisków drugorzędnych; 17 literałów przeniesionych do `t()`.
    Skrypty audytu: patrz `docs/cosgral/INSTRUKCJA-DLA-AGENTA.md` (sekcja „Audyt”).
18. **Krój i grubość pisma (wiersze 20.11 (11)–(13)):** Jost Variable, domyślne wagi 420 / 490 / 590; w Ustawieniach →
    Wygląd jest „Grubość pisma” (lżejsza / zwykła / mocniejsza, `appearance.fontWeight`). `body` bierze
    `--openbot-weight-regular`, więc ustawienie działa na cały tekst. **Nie sprawdzone w prawdziwym oknie** (Electron
    jako root w kontenerze daje puste okno): to ocena właściciela na Windowsie lub Macu.
19. **Tłumaczenia (po sesji 20.11):** `untranslated-jsx.test.ts` pilnuje, żeby w komponentach nie było gołych napisów
    (wyjątki: marka, nazwy języków, protokoły, jednostki); `contract-messages.test.ts` i `workflow-problems.test.ts`
    pilnują polskich tekstów z kontraktów (powody akcji, problemy przepływów). Backendowych komunikatów, które
    przechodzą przez `tData()`, jest więcej niż przetłumaczonych; brak tłumaczenia nic nie psuje (zostaje angielski).
20. **Rozbicie dużych plików:** plan i stan w `docs/cosgral/PLAN-ROZBICIE-PLIKOW.md` (`Conversation.tsx` 3133 → 2669,
    `Sidebar.tsx` 1468 → 1256, `App.tsx` 2657 → 2382 linii; każdy krok z testami, Storybook a11y 373, `test:visual` 7).
21. **Do zrobienia poza kontenerem Linux:** `bun run test:visual -u` na Windowsie i Macu (wzorce tylko dla Linuksa),
    ocena grubości pisma na prawdziwym oknie, nowy `.exe`. W kontenerze testy Storybooka i wizualne wymagają
    lokalnej kopii konfiguracji z `executablePath: "/opt/pw-browsers/chromium"` (nie commitować).

**Wynik pełnego sprawdzenia:** patrz `INSTRUKCJA-DLA-AGENTA.md` § 7 (wiersz „Wyniki końcowe, sesja wieczór”).

---

# Przekazanie (poprzednie): sesja 19.11.2026, kontynuacja PR #24

**Dla następnego agenta. Zacznij od `docs/cosgral/INSTRUKCJA-DLA-AGENTA.md` (UI i reszta: P0–P3, pliki, jak sprawdzać).**
Ta sesja kontynuuje gałąź `team/lider/poprawki-po-exe` (PR #24). Najpierw ten rozdział, potem
rozdział niżej („sesja 19.11.2026 po południu”), `PRODUCT.md` i `docs/cosgral/PROMPT-UI-JAKOSC.md`.

## A. Gdzie jest praca

| Co | Gdzie |
|---|---|
| Gałąź tej sesji | `claude/friendly-noether-jpw1if` = `team/lider/poprawki-po-exe` (@ `159250b`) + commity tej sesji |
| Do scalenia | najpierw do `team/lider/poprawki-po-exe` (PR #24), potem razem do `codex/cosgral-desktop` |
| Środowisko | kontener Linux (nie komputer właściciela): Bun 1.4, Node 22, Chromium Playwrighta; Storybook jako okno do oglądania |

## B. Co zrobiono (każda zmiana obejrzana w Storybooku, z testami)

1. **Mimika stworków** (`blobatar.ts`, `AgentAvatar` prop `mood`, `row-activity.ts` `avatarMoodFor`): twarz mówi stan agenta.
   Pracuje = oczy na dwóch wysokościach (`thinking`), potrzebuje Cię = szerokie oczy + uniesione brwi (`surprised`),
   nowa wiadomość / odpowiedział = „^ ^” + rumieńce (`happy`), błąd = smutne oczy + kropla potu (`sad`), limit = przymknięte
   oczy + „zz” (`sleepy`). Pozy pochodzą z `blobatar/expression` i są **zapieczone w geometrii**, więc działają bez ruchu
   („ogranicz animacje” u właściciela). Ruch tylko dodaje (`shell.css`: rozglądanie się, podskok, migające „zz”).
   Kształty i kolory stworków bez zmian (test geometrii nadal pilnuje pozy spoczynkowej). Galeria: `Identity/AgentAvatar › Moods`.
2. **Wiersze agentów:** godzina nie jest już ucinana („Yesterd…”, „10:00 …”); „Pracuje w: …” trafiło do linii podglądu
   (wcześniej siedziało w kółku stworka); stworek w wierszu ma minę stanu.
3. **Nagłówek rozmowy:** stworek 24px, nazwa pogrubiona, stworek „myśli”, gdy agent pracuje. Przy jednym wątku pasek kart
   znika, a „Nowy wątek” jest ikoną w nagłówku (`NewThreadButton` w `ThreadTabs.tsx`, `onSingleThreadChange`).
4. **Wiadomości:** odpowiedź agenta bez dymka (czysty tekst, wiersz 22px, max 720px); dymek tylko dla człowieka.
5. **Po polsku:** stany w wierszu („Limit · wznowi o …”, „Błąd · …”, „Myśli”, liczba odpowiedzi, dni tygodnia po polsku),
   „Steruje komputerem / Zatrzymaj”, „Oznacz jako przeczytane”, etykiety dostępności wiersza (`Ukryty`, model zapasowy).

6. **Szkielet stron** (`WorkPage.tsx`, `styles/work-page.css`): jeden nagłówek na każdej stronie z paska (ikona strony,
   tytuł, zdanie, akcje), `WorkPageSections` (sekcje z ikonami, zapamiętane) i `WorkPageAnchors` (spis sekcji, który
   przewija; używany tam, gdzie testy i skrypty akceptacyjne oczekują wszystkich sekcji naraz, np. Dostawcy).
7. **Biblioteka** (`LibraryPage.tsx`): 8 sekcji zamiast 8 kart w stosie; Pliki z jednym paskiem narzędzi, kafelkami typu
   pliku i akcjami na najechanie; wiersze umiejętności, sejfu i MCP z ikonami.
8. **Przepływy** (`WorkflowsPage.tsx`, `workflow-editor.css`): układ edytora (lista po lewej, pasek z nazwą i akcjami,
   paleta i karty z ikonami typu kroku, pusty stan płótna, połączenia w jednym wierszu, historia uruchomień z łańcuchem
   kroków). Logika bez zmian.
9. **Harmonogram** (`SchedulePage.tsx`, `ScheduleOverview.tsx`, `RoutinePanel.tsx`): Plan jako oś czasu ze stworkami
   agentów, Rutyny jako wiersze ze stworkami; „Pause/Resume/Run now/History” przetłumaczone.
10. **Dostawcy, Zużycie, Telefon, Zdalny pulpit:** ten sam nagłówek; Dostawcy ze spisem sekcji.
11. Atrapa Storybooka (`mock-openbot.ts`) przypina 5 domyślnych stron jak nowa instalacja (wcześniej pusta lista).

12. **Kolory (runda 4):** CSS tej gałęzi używa tylko palety `--openbot-*` ze `styles.css` (nowa zasada AGENTS.md);
    dodany token `--openbot-bg-inset` (studnie edytorów, np. płótno przepływu).
13. **Zużycie** (`UsageReportView.tsx`): karty liczb z ikonami, wykres w karcie, „Ten komputer” obok, agenci ze stworkami.
14. **Kanały na liście agentów** (`Sidebar.tsx` `channels`/`onOpenChannel`, `App.tsx` ładuje listę i słucha
    `channels-changed`): wiersz ze stosem stworków członków. Test: `Sidebar.channels.test.tsx`.
15. **Widok kanału** (`ChannelView.tsx`, `ChannelWorkspace.tsx`, `styles/channel-view.css`): wygląda jak rozmowa z agentem
    (nagłówek, pigułki ustawień z kartą, wiadomości ze stworkami, pole wiadomości, Enter wysyła). Nazwy dostępne dla testów
    i skryptów e2e bez zmian („Edit channel”, „Send”, „New message to channel lead”, „Reply to …”).
16. **Kroki agenta** (`conversation/AgentActivity.tsx`): oś czasu z ikoną rodzaju kroku. Test: `AgentActivity.steps.test.tsx`.
17. Usunięte 2 zrzuty, które jeden z commitów przez pomyłkę dodał do katalogu głównego (`shots/`).

## C. Stan sprawdzenia

| Sprawdzenie | Wynik (kontener Linux) |
|---|---|
| `bun run lint` | zielone (1 ostrzeżenie w `cosgral.css:2812`, było już przed tą sesją) |
| `bun run typecheck` (6 projektów) | zielone |
| **Końcowy pełny przebieg** (`dfee751`, po audycie) | `bun run lint` zielone (1 stare ostrzeżenie `cosgral.css:2812`); `bun run typecheck` 6/6 zielone; `bun run build` zielone (renderer JS 3,1 MB, CSS 488 KB); `bun run test` **3391 zielonych**, 18 pominiętych, 3 znane czerwone (2 windowsowe `acp-presets`, niestabilny `agent-service-context-threads`), 475 plików, 476 s; `bun run test:storybook` **370/370** (71 plików). |
| Ostrzeżenia reaktywności (pomiar osobny) | **3319 `STRICT_READ_UNTRACKED` w 172 z 370 historyjek** (każda historyjka otwarta w Chromium, konsola zliczona): effect callback 1763, Kobalte `ButtonRoot` 465, `Menu` 265, `PopperRoot` 265, `FormControlLabel` 154, `TabsRoot` 16; nasze: `Field` 242, `Scene` 80, `For` 31, `ChannelEditor` 25, `ComboboxBase` 5, `CardIcon` 4, `Input` 2, `NewAgentPage` 1, `WorkflowsPage` 1. Najwięcej: `conversation--unread-messages` i `--scroll-to-latest` (po 175). Uwaga: `test:storybook` pokazuje konsolę tylko dla plików z porażkami, więc przy 370/370 nic nie wypisuje (wcześniejsze „1384” pochodziło z 5 padających plików). Błędy konsoli: 2× „Failed to resolve module specifier '[object Object]'” w funkcji `play` jednej z historyjek, 1× `ERR_UNKNOWN_URL_SCHEME` (celowo zepsuty adres w `custom-image-fallback`). |
| Nie uruchomione | `bun run test:visual`, `bun run sandbox:e2e`, `bun run dist:win` (wymagają Windows; patrz instrukcja P0). |
| `bun run test` (runda 4) | 3391 zielonych, 18 pominiętych, te same 3 znane czerwone (2 windowsowe `acp-presets`, niestabilny `agent-service-context-threads`). |
| `bun run test:storybook` (runda 4) | 370/370 po poprawce: test dostępności wyłapał za słaby kontrast „#nazwa” w wierszu kanału (`text-dim`, 3,2:1), teraz kolor linii podglądu. |
| `bun run test` (po stronach, runda 2) | 3386 zielonych, 18 pominiętych, 3 czerwone: te same 2 windowsowe w `acp-presets.test.ts` oraz niestabilny `agent-service-context-threads.test.ts` („compacts a thread that is not on screen…”) — na czystym PR #24 też pada mniej więcej 2 razy na 3, backendu nie ruszałem. |
| `bun run test:storybook` (runda 2) | 370/370 (+3 nowe historyjki `COSGRAL/Work pages`: Biblioteka, Przepływy, Harmonogram, z testem dostępności; wyłapały zdublowaną nazwę nawigacji „Library sections”, poprawione na „Źródła plików”). |
| `bun run test` (runda 1) | 3387 zielonych, 18 pominiętych, **2 czerwone** w `src/backend/acp-presets.test.ts` (testy zakładają Windows: wielkość liter i rozszerzenia `.cmd/.exe` w PATH). Na czystym PR #24 w tym kontenerze padają te same 2, więc to nie skutek zmian UI; na Windows powinny przejść. |
| `bun run test:storybook` | 367/367 zielonych. Dwie historyjki z PR #24 miały stare asercje (`Sidebar › Agent Tiles`: wiersz 68px/stworek 44px → 60/42 po spłaszczeniu wierszy; `Sidebar › Channels`: pierścień fokusu to teraz `outline`, nie `box-shadow`); poprawione pod nowy wygląd. W kontenerze uruchamiane z lokalną kopią configu wskazującą na zainstalowany Chromium (nie w repo). |
| `bun run test:visual` | nie uruchomione: wzorce są `*-chromium-win32.png`, na Linuksie nie da się ich porównać. Do zrobienia na Windows. |
| e2e / W5 w Electronie, `.exe` | nie uruchomione (brak Windows w kontenerze). |

## D. Co dalej

1. Obejrzeć zmiany w prawdziwym oknie na Windows (`bun run build`, piaskownica, zrzut CDP) i przebudować `.exe`.
2. `bun run test:visual` na Windows: wzorce są `*-chromium-win32.png`, na Linuksie nie da się ich porównać.
3. Dalsze sekcje: `docs/cosgral/PROMPT-UI-JAKOSC.md` → „Następne sekcje”.

---

# Przekazanie projektu (aktualne): sesja 19.11.2026 po południu

**Dla następnego agenta. Najpierw ten rozdział, potem `PRODUCT.md` i `docs/cosgral/PROMPT-UI-JAKOSC.md`.**
Starsze przekazanie (zespół OpenBota, rano 19.11) jest niżej, pod kreską. Jego fakty o rutynach i decyzjach właściciela nadal obowiązują.

## 0. Na czym zależy właścicielowi (najważniejsze)

1. **Duże, widoczne skoki jakości UI w każdej sekcji.** Układ jak w OpenBocie (pasek stron, lista agentów, rozmowa), ale wykonanie
   co najmniej na poziomie OpenBota, najlepiej lepsze: ikony z jednej rodziny, porządne sekcje, stany puste, brak uciętych napisów.
   Kosmetyka się nie liczy: zrzut przed i po ma pokazywać wyraźną różnicę. Kolory są mniej ważne niż struktura i wykończenie.
2. **Stworki (awatary agentów) to serce produktu:** dopracowane, z mimiką i ruchem, zawsze też w wersji bez animacji.
   Właściciel pozwala użyć ChatGPT albo Gemini w przeglądarce do generowania grafik, jeśli kod nie wystarczy.
3. **Program po polsku**, bez angielskich resztek.
4. Logo „C”, ciemny motyw domyślny i stworki zostają (zobowiązania marki, `PRODUCT.md`).
5. Właściciel uruchamia Gemini CLI do oceny UI i podobieństwa do OpenBota. Jego uwagi traktuj jak recenzję.
6. Użytkownicy: właściciel i jego kolega. Obaj znają OpenBota.
7. **Strona Zadań nie jest teraz potrzebna** (właściciel, 19.11). Przerabiałem ją, ale cofnąłem; nie wracaj do niej bez prośby.

## 1. Gdzie jest praca

| Co | Gdzie |
|---|---|
| Gałąź z tą pracą | `team/lider/poprawki-po-exe` na GitHubie (odbita od `codex/cosgral-desktop` @ `cdc9c29`) |
| Scalenie do integracji | **Nie zrobione.** `codex/cosgral-desktop` nie ma tych zmian. Scal po zielonym checku i przeglądzie. |
| Lokalny klon u właściciela | `Projekty\cosgral-workspace` w profilu właściciela. Folderu `Shared\...` z porannego przekazania na tym komputerze nie ma. |
| Instalator | `dist\COSGRAL Workspace-0.2.0-x64.exe` zbudowany z `cdc9c29`, **przed** poprawkami z tej gałęzi. Do przebudowania: `bun run dist:win` (~10 min). |
| Zasady jakości UI i dziennik sekcji | `docs/cosgral/PROMPT-UI-JAKOSC.md` |
| Prawda o produkcie | `PRODUCT.md` (wywiad z właścicielem, 19.11) |

## 2. Co zrobiono w tej sesji (wszystko sprawdzone w oknie programu albo w Storybooku)

**Błędy znalezione w zbudowanym `.exe` i naprawione (z testami):**

1. **Niewidoczne wiadomości przy „ogranicz animacje”** (komputer właściciela ma to włączone): `.message-entry-animated` miało stałe
   `opacity: 0`, a przy reduced motion animacja była wyłączona. Teraz `animation-fill-mode: both` (`conversation.css`).
2. Konfiguracja startowa wysyłała język „English”, choć okno było po polsku → program przechodził na angielski (`InitialSetup.tsx`).
3. Pierwszy fokus konfiguracji był na „Wyloguj” (Enter wylogowywał). Teraz na pierwszym wyborze (`InitialSetup.tsx`).
4. Karta CLI pokazywała „Brak” przy dostawcy „Dostępny”, gdy CLI szło ze zmiennej `OPENBOT_CODEX_PATH` (`backend/cli.ts`, `findSystemCli`).
5. Przyciski `md` miały 16px zamiast 13px (`primitives.css`: rozmiar czcionki dla `data-size="md"`).
6. Przyciski renderowane przez Kobalte (`as={Button}`) wrzucały do DOM atrybuty `as`/`component` z całym kodem funkcji (~16 KB).
   Poprawka w `ui/button.tsx`. **Uwaga:** takie przyciski celowo nie dostają klasy `ui-button` (ich wygląd należy do własnej klasy);
   pierwsza wersja poprawki to zmieniła i wiersze agentów zrobiły się kartami, więc to cofnąłem.
7. Brakujące tłumaczenia: rola „New teammate”, „New thread”, poziom wysiłku w nagłówku, podpowiedzi pola wiadomości, „No agents yet”.
8. Szary poziomy pasek przewijania pod ikonami paska stron (`cosgral.css`, `.page-rail-list { overflow-x: hidden }`).
9. Kontrast zielonego w jasnym motywie (4,34 → 4,84 na tle wiersza; `theme-light.css`).
10. Pływająca kolumna „Otwórz…” ucinała polskie etykiety (później i tak przeniesiona do nagłówka, punkt UI-4).

**Zmiany UI (układ OpenBota, wyższa jakość):**

1. **Pasek stron:** domyślnie 5 stron jak w OpenBocie (Agenci, Przepływy, Zadania, Zużycie, Biblioteka) + „Więcej”; bez niebieskiej
   kropki „przypięta” na każdej ikonie (`agent-settings.ts`, `shell.css`). Istniejące instalacje zachowują swoje przypięcia.
2. **Lista agentów:** „Pokaż ukryte” przeniesione do menu filtra (ikona obok szukania), „Przeglądaj/Nowy kanał” do menu „+”,
   pusta lista z jednym zdaniem i przyciskiem „Nowy agent” (`Sidebar.tsx`, `cosgral.css`).
3. **Wiersze agentów płaskie jak w OpenBocie:** bez karty pod każdym wierszem, bez kolorowego paska z lewej, stworek 42px, rola
   nie ucina już nazwy (agent bez wiadomości pokazuje rolę w linii podglądu) (`shell.css`, `Sidebar.tsx`).
4. **Nagłówek rozmowy:** Pliki, Ustawienia agenta i Głos jako ikony w nagłówku (jak w OpenBocie) zamiast pływającej kolumny dużych
   przycisków nad rozmową (`ChatSidePanelLauncher.tsx` wariant `header`, `Conversation.tsx`).
5. **Pole wiadomości:** „Wybierz z biblioteki” przeniesione do menu „+”; każda pozycja menu „+” ma ikonę.
6. **Stworki z objętością:** gradient światła, odblask przycięty do kształtu, błysk w oczach (mruga z okiem), miękki cień
   (`blobatar.ts`, `app-shell.css`). Kształty zostały z biblioteki `blobatar` (test geometrii pilnuje).

**Testy:** do zmian są testy (TDD). Wzorzec zrzutu `ui-foundation` zaktualizowany po obejrzeniu różnicy (tylko rozmiar przycisków).
Skrypt e2e `scripts/sandbox-e2e.ts` dostosowany do menu filtra, **ale e2e w Electronie nie był uruchomiony**.

## 3. Co zostało do zrobienia (kolejność)

1. **Przebudować instalator** z tej gałęzi i uruchomić go w piaskownicy (sekcja 4). Pokazać właścicielowi.
2. **Uruchomić e2e i W5 w Electronie** (`bun run sandbox:e2e`, wymaga Node 24 i zbudowanego programu) na tej gałęzi.
3. **Stworki dalej:** mimika stanów (pracuje, ma wiadomość, potrzebuje Cię, błąd), mrugnięcie i spojrzenie przy najechaniu,
   wersja bez ruchu. Rozważyć grafiki z generatora (zgoda właściciela). Plik: `src/renderer/src/blobatar.ts`.
4. **Licznik nieprzeczytanych na awatarze** w wierszu agenta (OpenBot ma kółko z liczbą na rogu stworka) i kanały na liście
   jako wiersze ze stosem awatarów członków.
5. **Pasek kart wątków nad rozmową** (`ThreadTabs`): przy jednym wątku zbędny; uprościć jak w OpenBocie.
6. **Przegląd pozostałych stron** z porównaniem do OpenBota: Przepływy, Zużycie, Biblioteka, Katalog dodatków, Dostawcy,
   Ustawienia, okna dialogowe. Każda: zrzut przed/po, wpis w dzienniku w `PROMPT-UI-JAKOSC.md`.
7. **Resztki angielskiego** w oknie: np. „Controlling computer”/„Stop” w `Sidebar.tsx`, „Show in Finder” (na Windows to Eksplorator),
   placeholdery przycisków. Skan: `i18n.test` + przejście okna po polsku.
8. **Scalić gałąź** do `codex/cosgral-desktop` po pełnym checku (bez `--force`, nie na gałąź domyślną).
9. Decyzje właściciela z porannego przekazania (sekcja 9 niżej) nadal otwarte.

## 3a. Stan sprawdzenia w chwili wypchnięcia (bądź ostrożny)

| Sprawdzenie | Wynik |
|---|---|
| `bun run lint` | zielone |
| `bun run typecheck` (6 projektów) | zielone |
| Testy jednostkowe całości | **ostatni pełny przebieg 3393/3393 zielony przed zmianami UI** (lista agentów, wiersze, nagłówek, stworki, menu „+”). Po nich puszczone tylko testy dotkniętych obszarów (App, Sidebar, Conversation, ChatSidePanelLauncher, blobatar, ui, agent-settings, i18n: zielone). **Pełnego przebiegu po ostatnich zmianach nie było** (właściciel kazał wypchnąć bez niego). |
| Storybook | historyjki Sidebar, App i Themes zielone po zmianach listy; pełny przebieg 366 przerwany. |
| Testy wizualne | 7/7 zielone po zmianie przycisków; po zmianach wierszy/nagłówka nie powtórzone. |
| e2e / W5 w Electronie | nie uruchomione na tej gałęzi. |

**Pierwsza rzecz dla następnego agenta:** `bun run test`, `bun run test:storybook`, `bun run test:visual`. Jeśli coś padnie, to
najpewniej asercje o starym wyglądzie (karty wierszy, plakietka roli, pływająca kolumna „Otwórz…”, przełącznik „Show hidden”).
Popraw test pod nowe zachowanie opisane w sekcji 2, nie cofaj wyglądu.

## 3b. Rozszerzenie działań: pomysły na kolejne duże skoki UI (do oceny z właścicielem)

1. **Stworki jako „żywy zespół”:** stan agenta widoczny na samym stworku (oczy zamknięte = śpi, oczy w ruchu = pracuje, uniesione
   brwi = potrzebuje Cię, plaster = błąd), w liście, nagłówku i kanałach. To mocniejszy znak niż kropki i plakietki.
2. **Edytor stworka:** wybór kształtu i koloru z podglądem mimiki; dziś jest tylko losowanie z 12 propozycji.
3. **Lista agentów:** sekcje „Nieprzeczytane” / „Przypięte” / reszta jak w OpenBocie, licznik na stworku, przeciąganie kolejności.
4. **Rozmowa:** odpowiedź agenta bez dymka (czysty tekst z markdownem, jak w OpenBocie), dymek tylko dla wiadomości człowieka;
   kroki agenta („3 kroków”) jako zwijana oś czasu z ikonami narzędzi.
5. **Pole wiadomości:** jedno pole z „+” po lewej, mikrofon i wyślij po prawej, wybór agenta w polu przy kanałach.
6. **Strony robocze** (Przepływy, Zużycie, Biblioteka): wspólny szkielet strony (tytuł w nagłówku okna, wyśrodkowana kolumna,
   jeden pasek narzędzi, płaskie listy, porządne stany puste), zamiast osobnego wyglądu każdej strony.
7. **Ikony:** jedna rodzina (lucide 1.5px) w całym programie; własne SVG w `PageRail.tsx` i `Sidebar.tsx` wyrównać do niej.
8. **Gemini CLI jako recenzent:** po każdej sekcji zrzut przed/po do właściciela, uwagi z Gemini wpisać do dziennika w
   `PROMPT-UI-JAKOSC.md` i zamknąć.

## 4. Jak pracować na komputerze właściciela (sprawdzone)

1. Narzędzia: Bun 1.3.11 zainstalowany globalnie przez `npm i -g bun@1.3.11`; Node 24; Git. `bun install` w repo.
2. Przeglądarki Playwrighta są w domyślnym folderze (`%LOCALAPPDATA%\ms-playwright`), więc `PLAYWRIGHT_BROWSERS_PATH` nie jest
   potrzebne. Jeśli testy wizualne/Storybook zgłoszą brak przeglądarki: `bun x playwright install chromium`.
3. **Uruchamianie programu do oglądania:** zawsze w piaskownicy (osobne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`,
   `OPENBOT_CODEX_PATH` na atrapę z `src/backend/testing/channel-codex.cjs`), jak w `start-cosgral-sandbox.cmd`, plus
   `--remote-debugging-port=<port>`. Zrzuty i klikanie przez CDP (`Page.captureScreenshot`, `Runtime.evaluate`).
   Pułapka: gdy okno jest zminimalizowane, `document.visibilityState` = `hidden` i zrzut CDP wisi.
4. **Iteracja UI najszybciej w Storybooku** (`bun run storybook`, http://localhost:6006/iframe.html?id=app--playground):
   pełna aplikacja na danych testowych, okno się nie minimalizuje. Strony otwierasz przez „Więcej” na pasku.
5. **Porównanie z OpenBotem:** OpenBot jest zainstalowany u właściciela. Tylko patrz (zrzuty, przełączanie stron);
   nie pisz w jego rozmowach, nie zmieniaj danych. Kodu i obrazków z OpenBota 0.71 nie kopiujemy do repo (licencja, repo publiczne).
6. Ten komputer ma włączone **„ogranicz animacje”**: każdy nowy stan musi działać bez ruchu.
7. Testy menu Kobalte w jsdom: `fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })`, potem `pointerUp` na pozycji
   (pomocniki `createNew` i `toggleShowHidden` w `src/renderer/src/sidebar-test-utils.ts`).
8. PowerShell 5.1 `Set-Content -Encoding utf8` dodaje BOM: edytuj pliki narzędziami do edycji albo Pythonem.
9. Pełny check: `bun run lint`, `bun run typecheck`, `bun run test` (~17 min, 473 pliki), `bun run test:storybook`, `bun run test:visual`.

---

# Przekazanie projektu: co jest, czego nie ma, co dalej (19.11.2026)

**Dla agenta, który zaczyna od zera. Przeczytaj ten plik, potem rób punkty z sekcji „Zacznij tutaj”.**
Pisał lider (Okiestrator). Fakty z commitów, logów i raportów; czego nie sprawdziłem, jest oznaczone.

## 1. Wynik w jednej linii

Integracja `codex/cosgral-desktop` @ **`08822f550`** jest na GitHubie (0 commitów przed `origin`). Pełny `bun run check` zielony na tym commicie. Kod ma ok. **82%** funkcji OpenBota 0.71, ale w prawdziwym oknie sprawdzone jest ok. **53%**. Zespół jest zatrzymany na polecenie właściciela, rutyny wstrzymane.

## 2. Czym jest projekt (założenia)

1. COSGRAL Workspace = własny program na Windows (potem telefon), tylko dla właściciela: wszystkie funkcje OpenBota, wygląd podobny, działa lepiej. Każda funkcja dla człowieka, agenta i API.
2. Baza: OpenBot 0.1.11 (Apache-2.0, `a6fe240`). Kod piszemy sami. **Kod i zasoby z paczki 0.71 NIGDY nie trafiają do repo** (licencja PolyForm Noncommercial, repo jest publiczne).
3. Program uruchamiamy tylko w piaskownicy (osobne USERPROFILE/APPDATA/LOCALAPPDATA). Danych zainstalowanego OpenBota właściciela nie ruszamy.
4. Bez push na gałąź domyślną, bez `--force`. Przepisanie historii i zmiana widoczności repo tylko za wyraźną zgodą właściciela.
5. Prawdziwe konta i logowania tylko przez właściciela. Do właściciela piszemy tylko przy blokerze.

## 3. Gdzie są pliki

| Co | Ścieżka |
|---|---|
| Integracja (tylko lider scala) | `<Shared>\cosgral-desktop` (gałąź `codex/cosgral-desktop`) |
| Worktree ról | `Shared\cosgral-wt\desktop-{backend,ui,kk,kapi,tester}` (gałęzie `team/<rola>/<temat>`) |
| GitHub | `https://github.com/kacperkretowicz-wq/cosgral-workspace` |
| Narzędzia | `Shared\tools\bun`, `Shared\tools\node`, `Shared\tools\git\cmd`, `Shared\tools\playwright` |
| Logi, GO, piaskownice | `Shared\cosgral-sandbox` (logi checków: `check-*.log`) |
| Materiały 0.71 (POZA repo) | `Shared\cosgral-docs` (zrzuty, ekstraktor, `openbot-0.71-*.md`, zrzuty Testera `zrzuty-cosgral-17-11-*`) |
| Plan i decyzje | `docs/cosgral/PLAN.md`, `PLAN-W4.md`, `PLAN-W5.md`, `DECYZJE-WLASCICIELA.md`, `pytania-do-wlasciciela.md` |
| Parytet 0.71 (procenty, luki) | `docs/cosgral/parytet-0.71.md`, `luki-silnika-071.md` |
| **Kolejka zadań (stąd bierzesz pracę)** | `docs/cosgral/KOLEJKA-ZADAN.md` |
| Jak uruchomić program | `docs/cosgral/URUCHOMIENIE-DLA-WLASCICIELA.md`, `PRZEWODNIK.md` |
| Raporty agentów | `docs/cosgral-raporty/` (np. `backend-w12-ae.md`, `kapi-w12-au.md`, `tester-w12-tl.md`, `kk-w12-an.md`) |
| Podgląd w przeglądarce (zbudowany, nie wgrany) | `cosgral-desktop\out\web-preview` |
| Instalator `.exe` (stary, 18.11) | zmierzony w `Shared\cosgral-docs\dist-win-measurements`, raport `kapi-w12-l.md` |

## 4. Liczby (źródła: `parytet-0.71.md`, logi checków)

| Miara | Wynik |
|---|---|
| Parytet w kodzie | 81,8% (63 z 77 funkcji: 53 jest, 20 częściowo, 4 brak) |
| Ostrożnie (z dowodem w oknie) | 61,0% |
| Sprawdzone w oknie programu | 52,6% |
| Wygląd vs 0.71 (7 ekranów P0/P1) | 4 zgodne / 3 częściowo / 0 brak |
| Pełny check na `08822f550` | lint, 6 typechecków, **3389 testów**, Storybook **366**, wizualne 7, API 29, build: zielone |
| e2e i kroki W5 w Electronie | 0 FAIL, W5 33/33 (T-AL, na `978195fbd`; **nie** powtórzone na `08822f550`) |

## 5. Czego NIE zrobiono

1. **Podgląd w przeglądarce nie został odświeżony.** Wersja jest zbudowana (`out/web-preview`, 1,84 MB), ale `openbot.replace_site` dwa razy zwróciło „fetch failed”. Strona: site id `719c8813-2101-48c4-9b82-cd2fd968d983`, adres w `PLAN.md`. Ponów podmianę (tytuł „COSGRAL Workspace: podgląd interfejsu”, `spaFallback: true`).
2. **Nowy instalator `.exe`** (`bun run dist:win`, ~10 min, wymaga pliku `GO-kapi-dist.txt`). Ostatni jest z 18.11, bez podpisu (SmartScreen ostrzeże).
3. **e2e i W5 w Electronie na `08822f550`** (potrzebny `GO-tester-e2e.txt`).
4. **Czyste Windows (bramka G2):** próba instalatora na czystym koncie. Czeka na konto lub maszynę od właściciela.
5. **Kolejka zadań nie ruszona od stopu:** UI 6 pozycji (Komunikaty/Telegram+Slack, ustawienia agenta 059–074, nagłówek zadania, Teach/Voice + `@` i `/`, „Więcej” i skróty, Marketplace), KK 5 (ustawienia kanału, onboarding, Computer Use, ustawienia serwera), Backend 5 (m.in. 12b: kanały IPC i okno wyboru folderu dla plików maszyny; edycja rutyn kanału), KAPI 4 (m.in. wersje przepływów, mapa skrótów), Tester 4 (odbiór Marketplace/Harmonogram/Biblioteka z danymi, odbiór PL).
6. **Rzeczy sprawdzone tylko kodem, nie w oknie:** Marketplace, Harmonogram, Biblioteka z danymi, edytor przepływów, przełącznik „Unread first”, kanały w PWA, Teach/Voice (przyciski wyłączone), cały program po polsku, serwer zdalny i zespół, telefon (nie testowany na prawdziwym telefonie).
7. Skan prywatności objął tylko aktualne drzewo (`git grep`), bez historii i bez plików binarnych.

## 6. Zacznij tutaj (kolejność)

1. `git fetch`; upewnij się, że jesteś na `origin/codex/cosgral-desktop` @ `08822f550` albo nowszym. Scal integrację do swojej gałęzi `team/<rola>/<temat>` (nie pushuj na `codex/cosgral-desktop`; scala tylko lider).
2. **Lider:** poproś właściciela o „start”, potem włącz rutyny (sekcja 8) i daj Testerowi `GO-tester-e2e.txt`, żeby powtórzył e2e/W5 na bieżącym tipie.
3. Odśwież podgląd (punkt 5.1).
4. Każdy agent: weź pierwszą nieoznaczoną pozycję ze swojej sekcji `KOLEJKA-ZADAN.md`, dopisz `[w toku: ROLA, godzina]`, po oddaniu zmień na `[zrobione: SHA]`. Pusta kolejka nie znaczy „cisza”: bierz pierwszą lukę „częściowo/brak” ze swojego obszaru z `parytet-0.71.md`.
5. Największy zysk na godzinę: ekrany do gotowych silników (Komunikatory, pliki z komputera, ustawienia agenta, nagłówek zadań) i odbiór w oknie tego, co ma tylko kod.

## 7. Jak pracować (polecenia i pułapki)

1. PATH: `Shared\tools\bun`, `Shared\tools\node`, `Shared\tools\git\cmd`. Polecenia bezpośrednio, bez `.ps1` i bez `-ExecutionPolicy Bypass`.
2. **Testy Storybooka i wizualne wymagają** `PLAYWRIGHT_BROWSERS_PATH=<Shared>\tools\playwright`. Bez tego padają z „Executable doesn't exist” (to się dziś zdarzyło).
3. Storybook przy pierwszym uruchomieniu po zmianach może zgłosić „Failed to fetch dynamically imported module” dla 1–2 plików. To zimny cache Vite, nie kod: uruchom ponownie.
4. Jedno ciężkie polecenie naraz w całej drużynie (pełny check ok. 45 min: testy jednostkowe ok. 32 min, reszta ok. 13 min; Storybook, e2e, `dist:win`). Ciężkie tylko za plikiem `Shared\cosgral-sandbox\GO-<rola>-*.txt` tworzonym przez lidera. Lekkie: testy jednego pliku, Biome, typechecki.
5. Przed oddaniem: `bun x biome check` na swoich plikach, `bun run typecheck:renderer` (UI), testy jednego pliku. Format po scaleniu psuł się już raz (`scripts/sandbox-e2e.ts`).
6. **Po scaleniu cudzych gałęzi zawsze puść pełny check.** Dziś po scaleniu wyszło: atrapa telefonu bez `message`, 4 testy rozjechane z nowymi napisami (próbka zadań, etykiety powiadomień, zdanie o folderze), klucz i18n z prostym zamiast krzywego apostrofu (`Couldn’t send`; dla angielskiego `t()` zwraca sam klucz, więc zmiana wartości nic nie daje).
7. Commity z trailerem `Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>`. Repo publiczne: bez ścieżek z nazwą profilu Windows, bez e-maili, bez zrzutów z nazwą konta.
8. Raport z każdego zadania: `docs/cosgral-raporty/<rola>-<id>.md` + `channel_result` (SHA, testy, luki, czego nie sprawdziłeś).
9. Push lidera: fast-forward `git push origin codex/cosgral-desktop` (bez `--force`) po zielonym checku i skanie prywatności.

## 8. Rutyny (wstrzymane 19.11 ok. 09:15)

Wstrzymane (`active:false`), wznawia tylko lider po „start” właściciela:

| Rutyna | id |
|---|---|
| UI | `df85b4bf-693a-4858-a8df-4871f192b2cc` |
| KK | `83b8d1fd-f3ea-4074-a4b6-1e169cdad18e` |
| Backend | `a78cd23a-c578-455e-92e2-3eec5fb8bede` |
| Tester | `bc4b1c97-825c-43a1-9dcd-c273273eeeec` |
| KAPI | `6aaeded9-e948-4b13-a351-7783626a0ca4` |
| Strażnik lidera (45 min) | `4293df91-ad8c-46dc-9357-b3babc678f91` |

Aktywne (raporty dla właściciela): 14:00, 18:00, 22:00 (18.11, jednorazowa, można usunąć), 8:00 (wpis „18.11”, dotyczy tylko tej daty).
Wznowienie: `openbot.channel_update_routine {routineId, active:true}` (tylko w zadaniu zleconym przez osobę).

## 9. Decyzje, które czekają na właściciela

1. Repo publiczne czy prywatne, domyślna gałąź, przepisanie historii (wiersze 6–7 w `DECYZJE-WLASCICIELA.md`). Bez zgody niczego nie ruszamy.
2. Konto Windows lub maszyna do próby instalatora na czysto (G2) i termin.
3. Kto płaci za klucze API i jaki limit.
4. Czy robić: Discord, instalację skilla z linku GitHub, węzły LLM i Asset w przepływach. Rada zespołu: na razie nie.

## 10. Znane ryzyka

1. `apps/auth-api/.env.production` jest w repo od importu bazy (zaszyfrowany, upstream go śledzi). Zostawiony celowo; jego usunięcie nie usuwa go z historii.
2. Link do autora bazy w `src/main/index.ts:420`, `scripts/cosgral-rebrand-visible.mjs`, `skills-lock.json`: do ewentualnego przepisania.
3. Jedno ostrzeżenie Biome w `cosgral.css` (kolejność selektorów, `.provider-key-name`), niegroźne.
4. Kod bez dowodu w oknie liczy się w parytecie „kod”, ale nie w „w oknie”. Nie podawaj procentów bez źródła.
