# Parytet 0.68 — W1 + W2/W3/M (B2a + B2b)

Stan: 12.11.2026. Baza COSGRAL = OpenBot 0.1.11 (`a6fe240`, opis w `package.json`). Opis zachowania 0.68: własnymi słowami, bez fragmentów kodu i bez kopiowania tekstów UI.

**Źródła:** mapa UX 0.67.1 (`docs/cosgral-raporty/claude-k-openbot-ux-map.md` na `codex/cosgral-workspace`), publiczny [README 0.68](https://github.com/nightly-labs/openbot/blob/v0.68.0/README.md) i [changelog v0.68.0](https://github.com/nightly-labs/openbot/releases/tag/v0.68.0), statyczna lista paczki `app.asar` (8250 wpisów + nazwy chunków; B2b: `Shared\cosgral-data\desktop-tester\rea-0.68-b2b`), kod worktree `desktop-tester` @ `codex/cosgral-desktop` `f42d104d6`. REA CLI: timeout 600 s w B2a (6502 pliki, pusty wynik) → B2b nie powtarza tej samej próby; obowiązuje fallback statyczny.

**Legenda stanu w 0.1.11:** jest = zachowanie pokryte end-to-end w bazie · częściowo = jest zalążek, brakuje stanów albo powierzchni · brak = nie ma odpowiednika. Istnienie pliku nie dowodzi pełnej funkcji. Żaden test odbioru z tej tabeli nie został uruchomiony w runtime.

## W1 — nawigacja, czat, kanały, panel, kolejka, wyszukiwanie

| Nr | Obszar | Zachowanie 0.68 (własnymi słowami) | 0.1.11: stan / dowód | Fala | Test odbioru: kroki → wynik |
|---|---|---|---|---|---|
| 1 | Nawigacja · szyna serwerów | Skrajnie po lewej widać ten komputer oraz serwery zdalne/hostowane; można je wybierać, dopinać, wyciszać, ustawiać, opuszczać i przestawiać kolejność. | Częściowo — `ServerRail.tsx` + `ServerSummary`: lokalny i zdalne, dodawanie i host; bez pełnego menu wycisz/opuść/ukryj i bez hostowanych stron jak w 0.68. | W1 | Dodać serwer zdalny i przełączyć lokalny ↔ zdalny → aktywny serwer zmienia kontekst listy agentów. |
| 2 | Nawigacja · szyna stron | Obok szyny serwerów jest szyna stron (Agenci, Harmonogram, Zadania, Przepływy, Użycie, Biblioteka, Marketplace, Ustawienia, Więcej, przypinanie). | Brak — w rendererze bazy nie ma szyny stron; ustawienia to modal, biblioteka/przepływy nie są osobnymi stronami w shellu. W paczce 0.68 widać m.in. chunki `LibraryPanel`, `WorkflowsPage`. | W1 | Otworzyć Harmonogram, wrócić do Agentów → stan listy agentów zachowany. |
| 3 | Nawigacja · pasek boczny | Lista agentów i kanałów; klik otwiera rozmowę; sekcja osób; wyszukiwanie na liście; menu wiersza (edycja, duplikat, nowy wątek, okno, ukryj, usuń, przeczytane). | Częściowo — `Sidebar.tsx`: ludzie + agenci, filtr, usuwanie, konto; brak kanałów grupowych na liście i części akcji menu z 0.68. | W1 | Wybrać dwóch agentów kolejno → każdy ma własną historię. |
| 4 | Nawigacja · foldery | Użytkownik tworzy foldery (także zagnieżdżone), przenosi agentów/kanały, duplikuje i zmienia nazwę folderu. | Brak — lista to stałe sekcje ludzie/agenci, bez modelu folderów użytkownika. Changelog 0.68 potwierdza foldery w folderach. | W1 | Utworzyć folder, wrzucić agenta, zagnieździć folder → po restarcie układ ten sam. |
| 5 | Nawigacja · stan „myśli” | Wiersz agenta pokazuje, że agent właśnie pracuje (myśli / analizuje). | Częściowo — `SidebarAgentState.kind = working` + kropki w `Sidebar.tsx`, gdy trwa tura lub kolejka `starting`/`running`. | W1 | Wysłać wiadomość → w pasku widać stan pracy, po odpowiedzi znika. |
| 6 | Nawigacja · stan „czeka na Ciebie” | Wiersz (i zbiorczo Needs you) pokazuje oczekiwanie na pytanie, zatwierdzenie albo przejęcie przeglądarki. | Częściowo — powiadomienia „Needs your input/approval” w `agent-notifications.ts` oraz karty w aktywnej rozmowie; **brak** osobnego stanu w pasku i sekcji Needs you (stany to tylko working/unread/responded). | W1 | Agent zada pytanie poza otwartą rozmową → w Needs you widać go z liczbą; klik otwiera kartę. |
| 7 | Nawigacja · stan „limit” | Wiersz pokazuje czekanie na limit użycia z godziną resetu. | Brak — `AccountUsage` istnieje w kontraktach, ale pasek boczny nie renderuje stanu limitu na agencie. | W1 | Symulować limit → wiersz pokazuje limit i czas; po resecie wraca do normalnego stanu. |
| 8 | Nawigacja · stan „błąd” | Wiersz pokazuje, że ostatnia praca padła błędem (widać to bez otwierania czatu). | Brak — błędy tur są w rozmowie; brak dedykowanego stanu wiersza. | W1 | Wywołać błąd dostawcy → wiersz pokazuje błąd; po udanej turze znika. |
| 9 | Czat · rozmowa | Rozmowa pokazuje wiadomości człowieka i agenta, wątki, bogaty tekst, załączniki; historia zostaje po restarcie. | Częściowo — `Conversation.tsx` + magazyn wiadomości; działanie bez zewnętrznego konta i pełny zestaw kart/wstawek 0.68 do domknięcia. | W1 | Wysłać wiadomość → odpowiedź widoczna i zachowana po restarcie. |
| 10 | Czat · karta pytania | Agent zadaje 1–3 pytania z opcjami (i własną odpowiedzią); bez odpowiedzi tura czeka. | Częściowo — `ConversationPrompts.tsx` (`ApprovalCard` variant questions) + zdarzenie `prompt`; brak zbiorczego Needs you i sticky paska. | W1 | Agent pyta z opcjami → wybór wraca do agenta; pominięcie też kończy kartę. |
| 11 | Czat · karta zatwierdzenia | Agent prosi o zgodę na polecenie, zmianę plików albo uprawnienia; Zezwól / Odrzuć (i warianty „zawsze”). | Częściowo — `AgentApproval` (command / file-change / permissions) + karta w czacie; brak „zawsze zezwalaj” jak w mapie 0.68. | W1 | Agent prosi o komendę → odmowa zatrzymuje, zgoda kontynuuje. |
| 12 | Czat · podgląd szkicu | Przed wysłaniem w imieniu użytkownika widać kartę z podglądem szkicu (np. wiadomość); Send / Edit / Keep draft. | Brak — w bazie nie ma karty podglądu szkicu typu ask_ui; w paczce 0.68 jest chunk `UiBlockPrompt`. | W1 | Agent pokazuje szkic → Send wysyła, Edit wraca do edycji, Keep draft zostawia bez wysyłki. |
| 13 | Czat · przejęcie przeglądarki | Gdy strona wymaga człowieka (logowanie, CAPTCHA itd.), pojawia się karta przejęcia; po oddaniu agent wraca do tej samej sesji. | Częściowo — wbudowana przeglądarka i `BrowserControlState` (acting/waiting) w `Conversation.tsx`; brak osobnej karty „przejęcie” i przepływu request_takeover jak w 0.68. | W1 | Agent utknie na logowaniu → człowiek przejmuje, oddaje → agent kontynuuje tę samą kartę. |
| 14 | Kanały · lider i członkowie | Kanał ma nazwę, tytuł, instrukcje, członków-agentów i lidera; historia wspólna; stop / wznowienie / przejęcie pracy. | Brak — `TeamChatStore` to tylko rozmowy osoba↔osoba; brak modelu kanału z liderem i agentami jak w README 0.68 („shared desktop channel chats”). | W1 | Utworzyć kanał z liderem i dwoma agentami → wiadomość człowieka widzą wszyscy członkowie. |
| 15 | Kanały · zadania | Wiadomość człowieka staje się zadaniem z właścicielem, stanem i wynikiem; można przydzielać, przenosić, zatrzymywać, wznawiać, archiwizować. | Brak — w bazie nie ma listy zadań kanału ani przełącznika Chat \| Zadania. | W1 | Przydzielić zadanie agentowi → w Zadaniach widać właściciela i stan; wynik wraca do kanału. |
| 16 | Panel boczny | Przy rozmowie otwiera się panel z okienkami (przeglądarka, pliki, ustawienia agenta, pytanie poboczne, głos, subagent); da się go zmienić rozmiarem i zmaksymalizować. | Częściowo — `Conversation.tsx`: panel `browser` / `desktop` / `settings`; brak osobnych okienek pliki / pytanie poboczne / głos / subagent jak w mapie 0.68 (`ChatFilesPanel` w paczce 0.68). | W1 | Otworzyć przeglądarkę i ustawienia agenta → panel zmienia rozmiar i nie gubi stanu przy przełączeniu. |
| 17 | Kolejka wiadomości | Wiadomości wysłane w trakcie pracy czekają w kolejce FIFO; da się je edytować, usuwać, przestawiać, kierować (steer) i wznawiać; kolejka przeżywa awarię. | Częściowo — `QueuePanel.tsx` + zdarzenia `queue-changed`; README 0.68 potwierdza pause/resume/cancel i trwałość. Zachowanie po crashu w naszej bazie do potwierdzenia testem. | W1 | Wysłać dwie wiadomości podczas pracy → wykonują się kolejno; po restarcie kolejka nadal tam jest. |
| 18 | Wyszukiwanie · w rozmowie | Wyszukiwarka w czacie prowadzi do kolejnych trafień w tej rozmowie. | Jest — `ChatSearch.tsx` + `chat-search.ts` (nawigacja po trafieniach). | W1 | Wyszukać unikalny tekst → podświetlenie i skok do właściwej wiadomości. |
| 19 | Wyszukiwanie · globalne | Globalne wyszukiwanie po rozmowach i agentach otwiera właściwy wątek. | Częściowo — `GlobalSearch.tsx` po botach i wiadomościach 1:1; bez kanałów/zadań z 0.68. | W1 | Wyszukać unikalną frazę z innej rozmowy → otwiera tę rozmowę na wiadomości. |

## Współpraca UI (Needs you) — zachowanie 0.68

Agent jest „czeka na Ciebie”, gdy otwarta jest nierozstrzygnięta karta pytania, zatwierdzenia albo prośba o przejęcie przeglądarki w tej rozmowie. Ten stan widać na wierszu agenta i w zbiorczej sekcji Needs you na górze listy (z liczbą). Klik w Needs you otwiera rozmowę już przewiniętą do tej karty. Stan znika dopiero po odpowiedzi, pominięciu pytań, decyzji zatwierdzenia albo zakończeniu przejęcia — nie znika samym odczytaniem czatu.

## Współpraca UI (przyklejona Decyzja) — zachowanie 0.68

Nad polem wpisywania widać przyklejoną Decyzję: najstarszą otwartą kartę pytania lub zatwierdzenia w tej rozmowie. Pasek zostaje widoczny przy przewijaniu historii. Po decyzji (odpowiedź / pomiń / zezwól / odrzuć) pasek znika od razu; jeśli czeka kolejna karta, pojawia się następna najstarsza. Samo przewinięcie albo odczytanie wiadomości nie zamyka Decyzji.

## Współpraca UI (Chat \| Zadania) — zachowanie 0.68

W kanale jest przełącznik Chat | Zadania w tej samej rozmowie (bez zmiany kanału). Chat to oś wiadomości. Zadania to lista przydziałów: kto jest właścicielem, stan (kolejka / w toku / czeka / wynik / zatrzymane), oraz akcje Stop, Resume, Reassign, Archive, Restore. Przełączenie zachowuje kontekst kanału i otwarte karty Decyzji. Lista zadań pokazuje też zadania zatrzymane i pozwala je wznowić albo przydzielić ponownie.

## Podsumowanie liczb

### Według fali

| Fala | Wiersze | Jest | Częściowo | Brak |
|---|---|---|---|---|
| W1 | 1–19 | 1 | 11 | 7 |
| W2 | 20–31 | 0 | 5 | 7 |
| W3 | 32–41 | 0 | 6 | 4 |
| M | 42–44 | 0 | 0 | 3 |
| **Razem** | **1–44** | **1** | **22** | **21** |

### Według obszaru (skrót)

| Obszar | Jest | Częściowo | Brak |
|---|---|---|---|
| Nawigacja (W1) | 0 | 4 | 4 |
| Czat i karty (W1) | 0 | 4 | 1 |
| Kanały / panel / kolejka / search (W1) | 1 | 3 | 2 |
| Agenci / pamięć / skille / MCP / Vault (W2) | 0 | 2 | 5 |
| Rutyny / przepływy / tabele / pliki / przeglądarka+ (W2) | 0 | 3 | 2 |
| CU / remote / głos / dostawcy / zespół (W3) | 0 | 4 | 1 |
| Dok / wyspa / ustawienia / onboarding / marketplace (W3) | 0 | 2 | 3 |
| Telefon (M) | 0 | 0 | 3 |

## 10 najważniejszych braków W1

1. Szyna stron (Agenci / Harmonogram / Zadania / …) — brak w shellu bazy.
2. Foldery agentów (zagnieżdżeniem) — brak modelu.
3. Sekcja Needs you + stan „czeka na Ciebie” w pasku — tylko powiadomienia i karty w otwartej rozmowie.
4. Stan limitu na wierszu agenta — brak.
5. Stan błędu na wierszu agenta — brak.
6. Karta podglądu szkicu (ask_ui) — brak; w 0.68 jest `UiBlockPrompt`.
7. Karta / przepływ przejęcia przeglądarki dla człowieka — tylko kontrola agenta acting/waiting.
8. Kanały z liderem i agentami — brak (jest tylko DM osób).
9. Lista zadań kanału i Chat \| Zadania — brak.
10. Przyklejona Decyzja nad kompozytorem — brak w bazie (cel B4-UI).

## 10 najważniejszych braków W2

1. Pamięć agentów/kanałów (zawsze / w razie potrzeby).
2. Skille lokalne + wersje + Marketplace skill install.
3. Panel i połączenia MCP użytkownika.
4. Vault (loginy, karty, kontakty, TOTP) bez sekretów w czacie.
5. Rutyny z harmonogramem i webhookami.
6. Przepływy pracy (płótno).
7. Szablony agentów / instalacja z katalogu.
8. Wspólne tabele między agentami (nie tylko markdown w czacie).
9. Biblioteka plików jako osobna powierzchnia.
10. Trwałość / dock / live view przeglądarki poza podstawowymi kartami W1.

## 10 najważniejszych braków W3

1. Pełny Computer Use na Windows z `cua-driver` (dziś głównie capability + setup Mac).
2. Głos (STT/TTS + hosty).
3. Dostawcy poza Codex/Claude + modele zapasowe i limity w UI.
4. Dok agentów.
5. Dynamic Island / notch.
6. Marketplace agentów i skilli.
7. Macierz powiadomień i pełne zakładki ustawień (Mobile, Dok, Wyspa, …).
8. Onboarding z językiem i pierwszym agentem z propozycji.
9. Role z dostępem per agent + status maszyny hosta.
10. Zdalny pulpit jako produkt Windows (nie tylko Remote Mac).

## Metoda i limity sprawdzenia

- Mapa 0.67.1 i README/changelog 0.68 opisują powierzchnie; nie uruchamiano OpenBota 0.68 pod debuggerem w tym zadaniu.
- Statyczna paczka: 8250 ścieżek w `app.asar`; nazwy chunków W1 m.in. `QuestionPromptBubble`, `UiBlockPrompt`, `QueuePanel`, `GlobalSearch`, `BrowserPreviewSidebar`, `channel-*`, `LibraryPanel`, `WorkflowsPage`.
- REA CLI (`analyze-javascript-application` na `app.asar`): **timeout 600 s** w B2a po fazie „Processing 6502 selected application files”; wynik pusty → B2b używa fallbacku statycznego (lista + chunki), bez drugiej próby 600 s na tym samym celu.
- Testów odbioru z tabeli nie uruchomiono.

## W2 — agenci, pamięć, skille, MCP, Vault, rutyny, tabele, pliki, przeglądarka+

| Nr | Obszar | Zachowanie 0.68 (własnymi słowami) | 0.1.11: stan / dowód | Fala | Test odbioru: kroki → wynik |
|---|---|---|---|---|---|
| 20 | Agenci · tworzenie | Tworzy się agenta z imieniem, opisem i przeglądem sekcji; da się importować i zakładać z poziomu desktopu i telefonu. | Częściowo — `bot-store.ts` `createBot` / `updateBot` / `deleteBot`; tworzenie z pickera w UI. Bez pełnego kreatora z przeglądem sekcji jak w README 0.68. | W2 | Utworzyć agenta z nazwą i opisem → pojawia się na liście i ma własną rozmowę. |
| 21 | Agenci · ustawienia | Awatar, kolor, dostawca/model (+ zapasowe), instrukcje z limitem, foldery dostępu, poziom dostępu, zachowanie gdy zajęty, limity wątków, skille, użycie. | Częściowo — panel ustawień w `Conversation.tsx` (nazwa, tytuł, opis, model, reasoning, powiadomienia, awatar w `bot-store`); brak modeli zapasowych, folderów dostępu, skilli w ustawieniach. | W2 | Zmienić model i instrukcje → kolejna tura używa nowych ustawień po restarcie. |
| 22 | Agenci · szablony | Gotowe szablony (np. poczta, podróż) i instalacja z Marketplace / import. | Brak — w bazie nie ma katalogu szablonów; w paczce 0.68 jest `AgentTemplateInstall`. | W2 | Zainstalować szablon → nowy agent ma gotowe instrukcje i skille szablonu. |
| 23 | Pamięć | Wspomnienia „zawsze” vs „w razie potrzeby”, wyszukiwanie, ręczne dodawanie, osobna pula per agent i per kanał. | Brak — brak magazynu pamięci i narzędzi remember/search w bazie. | W2 | Zapisać wspomnienie „zawsze” → widać je w kolejnej rozmowie bez ponownego podawania. |
| 24 | Skille | Lokalna biblioteka skilli, wersje, aktualizacja/naprawa, instalacja z Marketplace, przypisanie do agenta. | Brak — brak IPC/skill store; w 0.68 chunki `ipc-skills`, `SkillPreview`, `skills-port`. | W2 | Agent tworzy skill → widać go w bibliotece; drugi agent może go dodać. |
| 25 | MCP | Panel serwerów MCP, połączenie, narzędzia dostępne dla agentów, obsługa logowania do MCP. | Brak — baza ma własny browser MCP dla agentów, ale nie panel użytkownika do obcych serwerów MCP (`mcp-servers` w paczce 0.68). | W2 | Dodać serwer MCP → agent widzi jego narzędzia w kolejnej turze. |
| 26 | Vault | Loginy, karty, kontakty, klucze API, TOTP; agent bierze element bez ujawniania sekretu w czacie; konektory 1Password/Bitwarden/Proton. | Brak — brak `VaultPanel` / magazynu sekretów UI; sekrety konta idą innymi ścieżkami. | W2 | Zapisać login → agent prosi o element i wypełnia formularz bez pokazania hasła w czacie. |
| 27 | Rutyny i webhooki | Harmonogram (kalendarz, strefa, następne uruchomienie), webhook z filtrami, historia uruchomień, feed na serwerze. | Brak — brak strony Harmonogram/Rutyny; w 0.68 `routine-schedule-ui`, `RoutineWebhookTrigger`. | W2 | Utworzyć rutynę codzienną → odpala się o wskazanej godzinie i zostawia wynik. |
| 28 | Przepływy pracy | Płótno z węzłami, wyzwalacz, kroki z zatwierdzeniem, wyjścia, integracje. | Brak — brak `WorkflowsPage` / canvas w bazie. | W2 | Zbudować prosty przepływ z jednym krokiem → uruchomienie kończy się widocznym wynikiem. |
| 29 | Tabele | Wspólne tabele agentów (kto prowadzi, usuwanie dla wszystkich), nie tylko tabela w markdownie czatu. | Częściowo — `DataTable.tsx` renderuje tabele **w czacie**; brak wspólnej bazy tabel między agentami jak w mapie 0.68. | W2 | Utworzyć wspólną tabelę → dwóch agentów czyta te same wiersze po restarcie. |
| 30 | Pliki · biblioteka | Biblioteka plików (siatka/lista), zaznaczanie, pobieranie, sprzątanie, pliki maszyny. | Częściowo — załączniki i mailbox (`mailbox-store.ts`, karty załączników); brak osobnej Biblioteki (`LibraryPanel` w 0.68). | W2 | Wrzuć plik do biblioteki → widać go na liście i da się pobrać po restarcie. |
| 31 | Przeglądarka · poza W1 | Trwała przeglądarka, wiele kart, żywy podgląd, zapis zrzutu jako plik, profile, dock przeglądarki. | Częściowo — zakładki i kontrola agenta w `Conversation.tsx` / `browser-host.ts`; bez docka/live view jak w chunkach `BrowserDock`, `BrowserLiveView`. | W2 | Agent otwiera dwie karty → po restarcie sesja/karty wracają albo jasny komunikat o utracie. |

## W3 — Computer Use, zdalny pulpit, głos, dostawcy, zespół, dok/wyspa, ustawienia, onboarding, marketplace

| Nr | Obszar | Zachowanie 0.68 (własnymi słowami) | 0.1.11: stan / dowód | Fala | Test odbioru: kroki → wynik |
|---|---|---|---|---|---|
| 32 | Computer Use | Osobny sterownik `cua-driver` na Windows/macOS/Linux; agent steruje pulpitem poza przeglądarką; setup uprawnień. | Częściowo — capability `computerUse` w `agent-service.ts` + setup uprawnień w `InitialSetup.tsx` (macOS); bez dołączonego `cua-driver` i pełnego przebiegu Windows jak w README 0.68. | W3 | Włączyć Computer Use → agent opisuje/klika element poza przeglądarką; Stop kończy sesję. |
| 33 | Zdalny pulpit | Podgląd i sterowanie zdalnym pulpitem hosta (VNC/tunnel), konfiguracja po stronie właściciela. | Częściowo — `RemoteMacPanel.tsx`, `remote-mac.ts`, API `remoteMac` w kontraktach; ukierunkowane na Mac host, nie pełny Windows↔Windows jak produkt 0.68. | W3 | Połączyć się z hostem → widać pulpit i da się rozłączyć bez zawieszenia. |
| 34 | Głos | Mowa → tekst i tekst → mowa w kompozytorze / panelu; osobne hosty przetwarzania. | Brak — brak UI głosu w bazie; w paczce 0.68 są `voice-speech-host` / `voice-transcription-host`. | W3 | Nagrać komendę głosową → pojawia się jako tekst i agent odpowiada. |
| 35 | Dostawcy i limity | Wiele dostawców (Codex, Claude, Grok, Gemini, OpenCode, Cursor, …), konta, modele zapasowe, pierścienie użycia i limity. | Częściowo — tylko `codex` i `claude` w `AgentProviderId`; `AccountUsage` w kontraktach; bez listy kont wielu dostawców (`ProviderAccountList` w 0.68). | W3 | Dodać drugiego dostawcę → agent przełącza model; przy limicie widać reset. |
| 36 | Zespół i serwery | Członkowie, role, zaproszenia (link/QR), hostowanie serwera, status maszyny, klient webowy. | Częściowo — `team-store.ts` (role, invite), `HostPanel.tsx`, `JoinServerDialog.tsx`, `ServerRail`; bez macierzy dostępu per agent i pełnego statusu maszyny z mapy 0.68. | W3 | Wystawić host i dołączyć drugą osobę zaproszeniem → obie widzą obecność i mogą pisać DM. |
| 37 | Dok agentów | Mini-czaty z ulubionymi agentami poza głównym oknem; ukrywanie, kolejność, rozmiar. | Brak — brak okna doku; changelog 0.68 i mapa opisują dock. | W3 | Przypiąć agenta do doku → mini-czat działa przy zamkniętym głównym układzie listy. |
| 38 | Dynamic Island | Nakładka ze stanem (pracuje, wiadomość, pytanie, zatwierdzenie, przejęcie, błąd). | Brak — chunk `OpenBotDynamicIsland` tylko w 0.68. | W3 | Agent zada pytanie w tle → wyspa pokazuje stan; klik otwiera kartę. |
| 39 | Ustawienia i powiadomienia | Zakładki: ogólne, agenci, powiadomienia (macierz), głos, Computer Use, profil, Mobile Connect, dok, wyspa, aktualizacje, rozliczenia, hosty, transfer. | Częściowo — `SettingsModal.tsx` (głównie General + proste powiadomienia desktop); bez macierzy zdarzeń i zakładek Mobile/Dok/Wyspa. | W3 | Wyłączyć powiadomienia desktop → zdarzenie „needs input” nie pokazuje toastu systemowego. |
| 40 | Onboarding | Język, pierwszy dostawca, pierwszy agent z propozycji, Computer Use. | Częściowo — `InitialSetup.tsx` / setup preferred provider + uprawnienia Mac; bez wyboru języka i galerii pierwszego agenta jak `FirstAgentSetup` / `FirstRunFlow` w 0.68. | W3 | Świeża instalacja → przejście setupu kończy się listą z pierwszym agentem gotowym do czatu. |
| 41 | Marketplace i wtyczki | Katalog skilli/agentów, instalacja, sugestie marketplace, wtyczki z własnymi połączeniami. | Brak — brak `MarketplaceModal` / seed katalogu w bazie. | W3 | Wyszukać skill w Marketplace → instalacja włącza go u wybranego agenta. |

## M — Telefon (etap po Windows)

### Zachowanie telefonu w OpenBot 0.68 (opis dla Backendu i UI)

OpenBot 0.68 ma **osobną aplikację mobilną** (Expo / iOS, także Android w release pipeline) obok desktopu. Telefon nie uruchamia silnika agentów: łączy się z kontem / hostem desktopowym przez **Mobile Connect** (parowanie kodem QR albo stałym linkiem `openbot://` / biletem developerskim). Po sparowaniu z telefonu da się m.in.: tworzyć i edytować agentów (instrukcje, awatar), czytać i pisać w rozmowach, dostawać powiadomienia (w tym Live Activity na iPhonie), kontynuować pracę gdy desktop czeka na decyzję. Aktualizacje JS mogą iść OTA przy tej samej wersji natywnego runtime. Desktytopowe `bun run mobile:*` i `dev:mobile` w README służą do buildu, symulatora i parowania bez skanowania QR w trybie deweloperskim.

W paczce desktop 0.68 widać ślad powierzchni telefonu (np. asset `smartphone-*`); pełny kod aplikacji leży w `apps/mobile` repozytorium OpenBot (nie w samym `app.asar` desktopu).

| Nr | Obszar | Zachowanie 0.68 (własnymi słowami) | 0.1.11: stan / dowód | Fala | Test odbioru: kroki → wynik |
|---|---|---|---|---|---|
| 42 | Telefon · Mobile Connect | Parowanie telefonu z komputerem (QR / link / bilet); telefon używa tego samego konta/hosta. | Brak — brak zakładki Mobile Connect i generowania QR w bazie. | M | Z telefonu zeskanować QR z desktopu → sesja sparowana, widać listę agentów. |
| 43 | Telefon · czat i decyzje | Z telefonu: czytanie/pisanie czatu, powiadomienia o „czeka na Ciebie”, odpowiadanie na pytania/zatwierdzenia. | Brak — brak klienta mobilnego COSGRAL. | M | Agent pyta na desktopie → powiadomienie na telefonie; odpowiedź z telefonu odblokowuje turę. |
| 44 | Telefon · agenci | Tworzenie i edycja agentów z telefonu (instrukcje, awatar, przegląd sekcji). | Brak — tylko desktopowy `createBot`. | M | Utworzyć agenta na telefonie → widać go na desktopie po odświeżeniu. |

### Decyzje do podjęcia (Backend + UI)

1. **Klient:** natywny (Expo/Capacitor) vs PWA do hosta na Windows (plan COSGRAL dopuszcza PWA/Tailscale na start).
2. **Transport:** tylko loopback+LAN vs tunel; jak wystawić Mobile Connect bez chmury OpenBot.
3. **Zakres MVP telefonu:** czat + Needs you + powiadomienia najpierw; tworzenie agentów i OTA później.
