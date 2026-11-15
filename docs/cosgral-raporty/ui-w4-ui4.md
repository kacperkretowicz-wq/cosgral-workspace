# W4-UI4 — nawigacja, wiersze 2 i 3

Gałąź: team/ui/w4-ui4. Baza: 4111f0e30. To uzupełnienie W1–W3, nie start W5.

## Zakres działający w kodzie

- Menu agenta: Mark as read przez istniejący kontrakt agent.readConversation + agent.markConversationRead. Najpierw odczyt najnowszej historii, potem zapis granicy ostatniej wiadomości. Nie trzeba otwierać rozmowy, nie używa się nieaktualnej listy wiadomości załadowanej w App. W przypadku nowej wiadomości między odczytem a zapisem UI przyjmuje unreadCount zwrócony przez silnik, zamiast wymuszać zero.
- App aktualizuje stan przeczytania i usuwa znacznik ostatniej odpowiedzi dopiero po udanym zapisie. Zmiana serwera podczas odczytu przerywa operację przed zapisem. Błąd jest widoczny i pozwala ponowić; kolejnego zapisu nie uruchamia się, gdy poprzedni trwa.
- Szyna stron: responsywne More pages. ResizeObserver mierzy dostępną wysokość oraz rozmiary istniejących kontrolek; dolne strony przechodzą do menu z components/ui. Settings pozostaje oddzielną, dostępną akcją. Gdy aktywna strona jest w przepełnieniu, More sygnalizuje jej wybór. Powiększenie szyny przywraca przyciski bez zmiany aktywnej strony.
- Nie dodawano atrap niedostępnych akcji ani zastępczej trwałości w localStorage.

## Dokładne braki kontraktu dla Backendu

Poniższe nazwy i kształty są propozycją potrzebnego publicznego kontraktu, NIE metodami dodanymi w tej gałęzi. Backend powinien ustalić i wdrożyć ich semantykę oraz preload, zanim UI wystawi działające akcje.

| Akcja | Co istnieje dziś i dlaczego nie wystarcza | Potrzebny kontrakt |
| --- | --- | --- |
| Duplicate agent | AgentDesktopApi.createBot nie ma parametrów; agentSettings.createAgent przyjmuje pola, nie sourceBotId. saveTemplate tworzy dodatkowy trwały szablon, nie jest operacją duplikowania. Brak ustalonej polityki kopiowania pełnych ustawień i pamięci. | agent.duplicateBot({ sourceBotId: string, name?: string }): Promise<CreateAgentResult>. Nowy agent musi mieć własną tożsamość i historię. Jawnie opisać, co kopiuje się z profilu, narzędzi, skilli, MCP, pamięci i powiadomień; nie kopiować sekretów ani sesji CLI. |
| New thread | BotSummary.threadId jest tylko wynikiem odczytu. UpdateBotInput nie pozwala zmieniać wątku. SendMessageInput nie wybiera wątku. | agent.createThread({ botId: string }): Promise<ConversationWithReadState>; bez usuwania starej historii. Żeby można było wrócić do starej rozmowy: agent.listThreads(botId: string): Promise<ConversationThread[]> oraz agent.selectThread({ botId: string, threadId: string }): Promise<ConversationWithReadState>. ConversationThread musi przynajmniej określać id, botId, title i updatedAt. |
| Open in a separate window | dock.openChat pokazuje czat w doku; dock.showMainWindow odtwarza główne okno. Żadna z tych metod nie otwiera osobnego okna rozmowy danego agenta. | agent.openConversationWindow({ botId: string }): Promise<void>; silnik zarządza oknem, jego zamknięciem i właściwym serwerem. Bez window.open i obchodzenia zabezpieczeń renderera. |
| Hide agent | BotSummary i UpdateBotInput nie mają hidden. sidebar.moveItem przenosi agenta do folderu, nie ukrywa; dock.setPinHidden dotyczy tylko przypięcia w doku. | agent.setBotHidden({ botId: string, hidden: boolean }): Promise<BotSummary>; BotSummary.hidden: boolean. listBots musi udostępnić także ukrytych agentów, żeby dało się ich przywrócić (np. opcjonalne { includeHidden?: boolean }); zmiana wymaga zdarzenia aktualizacji listy. |
| Pin/unpin pages | AppSettings.tabs to lista dostępnych zakładek Ustawień. UpdateAppSettingsInput przyjmuje wyłącznie language i notifications. Brak miejsca na kolejność i przypięcie stron szyny. | AppSettings.navigation: { pinnedPageIds: AppPageId[] }; appSettings.update({ navigation?: { pinnedPageIds: AppPageId[] } }): Promise<AppSettings>. AppPageId powinien być współdzielonym typem w contracts odpowiadającym 10 identyfikatorom PAGE_RAIL_ITEMS. Zapisać kolejność, walidować identyfikatory i zwracać zapisany stan z get/update. |

Źródła: packages/contracts/src/ipc-desktop-apis.ts (AgentDesktopApi, AppSettingsDesktopApi, DockDesktopApi), ipc-conversation.ts (BotSummary, UpdateBotInput, SendMessageInput, MarkConversationReadInput), ipc-agent-settings.ts (CreateAgentInput, SaveAgentTemplateInput, AppSettings, UpdateAppSettingsInput), ipc-sidebar.ts; implementacje i preload zgodne z tymi interfejsami.

Mark as read ma już gotowy kontrakt: markConversationRead({ botId: string, throughMessageId: string | null }): Promise<ConversationReadState>. W tej gałęzi nie zmieniano kontraktów ani silnika.

## Krok odbioru dla KK

W scripts/sandbox-e2e.ts dodano dwa kroki przed istniejącym testem kanałów:

1. navigation: mark a background agent read from its row menu — tworzy agenta demonstracyjnego, czeka na odpowiedź atrapy, uruchamia akcję menu i sprawdza trwałą granicę odczytu oraz brak zmiany otwartej rozmowy; zrzut navigation-mark-read.
2. navigation: overflow pages remain reachable in a short viewport — tymczasowo zmienia viewport na 1100×400, wybiera Library przez More, robi zrzut navigation-overflow i przywraca viewport oraz Agents w finally.

Kroki są napisane, NIE uruchomione przeze mnie. KK powinien sprawdzić je w piaskownicy.

## Weryfikacja

- Testy jednostkowe, pojedyncze pliki, 1 worker: agent-read-actions 6/6, Sidebar.folders 22/22, PageRail 5/5, Sidebar.needs-you 1/1, Sidebar.activity 4/4, Sidebar.eyes-local 5/5. Razem 43/43 w 6 plikach.
- Storybook: PageRail.stories 7/7 (w tym przepełnienie ciemne/jasne), Sidebar.stories 13/13 (w tym odczyt i błąd zapisu). Pliki uruchamiano osobno.
- Celowany test Chromium navigation-overflow.visual.test.tsx: 1/1. Sprawdza rzeczywiste wymiary, otwarcie menu, Home/End i fokus, wybór Library oraz przywrócenie przycisków po zwiększeniu wysokości bez zgubienia aktywnej strony. Obejrzano render tego komponentu.
- typecheck:renderer, typecheck:storybook, typecheck:node: exit 0.
- Biome na wszystkich 12 plikach kodu/testów tej zmiany: exit 0. check:ui: exit 0, bez zwiększania budżetów. Detektor impeccable na zmienionym UI: pusta lista wyników.
- Pierwsze ciężkie polecenie zaczęło się o 00:25:16 czasu lokalnego, po sprawdzeniu, że poprzedni ciężki przebieg już nie działa. Polecenia wykonywano kolejno.
- Pomocniczy zapis zrzutu poza dozwolonym rootem został zablokowany przez Vite server.fs. Nie zmieniałem zabezpieczeń ani listy dozwolonych katalogów. Opcjonalny zapis usunięto; finalny test działa bez niego. Automatyczny zrzut awarii z danymi demonstracyjnymi posłużył tylko do obejrzenia renderu i został usunięty po diagnostyce. Nie dodano ani nie zmieniono obrazów wzorcowych.
- W testach komponentów menu zdarzają się istniejące ostrzeżenia STRICT_READ_UNTRACKED biblioteki Kobalte/Solid. Końcowe asercje działania przechodzą; nie wyłączano logowania ani reguł a11y.

## czego nie sprawdziłem

- Nie uruchomiłem aplikacji Electron ani sandbox:e2e. Nie deklaruję pełnego odbioru wierszy 2 i 3.
- Nie uruchamiam pełnego bun run check/test. Pozostaje to do KK po scaleniu.
- Nie zaimplementowałem duplikowania, nowego wątku, osobnego okna, ukrywania ani przypinania stron — powody i wymagane kształty powyżej.
- Nie zmieniano ani nie badano modeli, silnika kolejek, danych zwykłego OpenBota czy logowań.

## Bezpieczeństwo

Początkowy worktree czysty, W3-UI6 i cudze worktree nietknięte. Bez push i zabijania procesów. Nie uruchamiano ciężkich poleceń przed 00:25.

## Commity

- a38fdb67b — oznaczanie rozmów jako przeczytanych, świeża granica i testy.
- f147e5028 — responsywne More pages oraz testy jednostkowe i Chromium.
- Historie, nieuruchomione kroki sandbox:e2e, raport i status: osobny końcowy commit.