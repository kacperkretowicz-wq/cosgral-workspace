# W4-UI2 — usunięcie długu check:ui

Stan: etap statyczny UI zielony. Odbiór wyglądu i zachowania w prawdziwym oknie pozostaje do wykonania przez KK/Backend.
Gałąź: team/ui/w4-ui2. Baza: codex/cosgral-desktop @ 86d6f7e0f. Bez push.

## Przed i po

| Pomiar | Przed | Po |
| --- | --- | --- |
| Pliki z natywnymi kontrolkami poza components/ui | 22 | 0 |
| Użycia button/input/select/textarea poza components/ui | 199 | 0 |
| Ręczne złożone role ARIA poza components/ui | 5 | 0 |
| Kolory poza paletą zgłoszone przez skan | 12 (3 wartości i 9 fałszywych trafień) | 0 |
| Nietokenizowane font-size | 7 | 0 |
| Nietokenizowane border-radius | 7 | 0 |
| Nietokenizowane czasy transition | 0 | 0 |
| bun run check:ui | exit 1 | exit 0 |

Lista pozostałego długu check:ui: pusta. Nie zmieniłem budżetów ani wyłączeń plików.

## Zmiany i zachowanie

1. 11 plików ustawień i danych: AgentSettingsW3, AppSettingsW3, LibraryPanel, McpPanel, MemoryPanel, RoutinePanel, SkillsPanel, SkillsSettings, TablesPanel, VaultPanel, VaultRequestCard.
2. Pozostałe 11 plików: ActionCard, MarketplacePage, RemoteDesktopPage, SettingsModal, Sidebar, VoicePlayback, VoiceRecorder, VoiceSettings, WorkflowsPage, DockApp, IslandApp.
3. Kontrolki zastąpione przez Button, Input, NativeSelect, Textarea. Komponenty bazowe mają opcję unstyled, która zachowuje istniejące klasy i wygląd natywnych checkboxów, kontrolek pliku oraz formularzy. Nie zmienia to domyślnego wyglądu dotychczasowych użytkowników components/ui. Nie dodaje osobnego systemu wizualnego. Zdarzenia, referencje, typy, wartości, limity i disabled pozostają przekazywane.
4. Nowe tokeny zachowują dokładnie poprzednie wartości: 7px, 8px, 15px, 1.2rem, promienie 10px i 20px, biały kontrast i tło zdalnego płótna. Istniejące wartości 12px i 6px korzystają z wcześniejszych tokenów. Paleta i źródło tokenów pozostają w :root styles.css, zgodnie z AGENTS.md; cosgral.css i conversation.css używają zmiennych.
5. Dwa potwierdzenia w ProvidersPage i MobileConnectPage są grupami fieldset zamiast udawanych alertdialog. Nadal pozostają w tym samym miejscu strony, z tymi samymi przyciskami i etykietami. Reset domyślnych odstępów fieldset zachowuje poprzednie deklaracje layoutu.
6. ChatTasksSwitch używa współdzielonego ViewTabList/ViewTabPanel: role, powiązania aria-controls/labelledby, jeden punkt wejścia Tab, strzałki z zawijaniem, Home/End, kontrolowany wybór. Panele są renderowane warunkowo jak wcześniej. Chat panel używa display: contents, żeby zachować istniejący układ wiadomości i pola wysyłania.
7. Próba użycia istniejącego adaptera Tabs Kobalte ujawniła w teście brak poprawnego fokusu po strzałce i powiązania do warunkowo tworzonego panelu. Ten wariant nie został zachowany. Minimalny komponent w components/ui przechodzi test fokusu i powiązań; nie zmieniałem pozostałych zakładek aplikacji.

## Poprawka pomiaru kolorów

Poprzedni skan liczył nazwy blue/yellow/orange/green/red/pink w selektorach data-file-tone i słowa red/white/red w komentarzu. To 9 fałszywych trafień; deklaracje już korzystały z palety. Skan kolorów analizuje teraz wartości deklaracji CSS, pomijając selektory i komentarze. Trzy rzeczywiste literały przeniesiono na tokeny. Testy ui-foundation-css.test.ts potwierdzają pomijanie selektorów/komentarzy oraz zachowanie wykrywalności red, #fff, rgba w zwykłych, własnych i zagnieżdżonych deklaracjach. Regexy wykrywania kolorów i wszystkie budżety pozostały takie same.

## Weryfikacja

- typecheck:renderer: exit 0 po każdej paczce.
- Biome: exit 0; końcowy skan 39 zmienionych plików kodu, bez wyłączeń reguł.
- check:ui: exit 0, Legacy composite debt: 0/0.
- Testy: 96 testów w 28 plikach, każdy plik uruchamiany osobno, --maxWorkers=1. W tym nowe testy checkboxa i wysłania formularza w trybie unstyled, klawiatury zakładek i skanera CSS.
- Paczka 1: ui/ui (11), AgentSettingsW3 (1), AppSettingsW3 (2), LibraryPanel (1), McpPanel (1), MemoryPanel (1), RoutinePanel (1), SkillsPanel (1), TablesPanel (1), VaultPanel (1). Razem 21.
- Paczka 2: ActionCard (3), MarketplacePage (1), RemoteDesktopPage (2), Sidebar.needs-you (1), Sidebar.folders (18), Sidebar.eyes-local (5), Sidebar.activity (4), VoicePlayback (3), VoiceRecorder.ui (1), VoiceSettings (1), WorkflowsPage (1). Razem 40.
- Paczka 3: ChatTasksSwitch (1), ChannelView (2), ChannelWorkspace (4), MobileConnectPage (9), ProvidersPageW3 (16), ui-foundation-css (2), ui/view-tabs (1). Razem 35.
- Naprawa lokalnego środowiska: brakowało qrcode-generator. bun install --frozen-lockfile --ignore-scripts uzupełnił node_modules bez zmiany lockfile. Po naprawie typecheck:node: exit 0.

## czego nie sprawdziłem

- Nie uruchomiłem prawdziwego okna, Storybooka ani sandbox:e2e. Nie wykonałem zrzutów ani porównania pikseli. Zachowanie wyglądu wynika z pozostawienia klas i dokładnych wartości CSS; wymaga potwierdzenia w renderze.
- Nie uruchomiłem pełnego bun run check ani pełnego bun run test, testów wizualnych, buildu czy instalatora. Zielony check:ui nie oznacza potwierdzenia całej bramki G1.
- Brak oddzielnych testów komponentowych w repo dla SkillsSettings, VaultRequestCard, SettingsModal, DockApp i IslandApp. Migracja tych miejsc jest objęta typami i testami kontrolek bazowych; ich działanie trzeba potwierdzić w oknie.
- Nie sprawdziłem czytnika ekranu, natywnego wyboru pliku, QR na telefonie, mikrofonu ani prawdziwego zdalnego pulpitu. Nie zmieniałem odpowiedzialnych za nie API.

## Odbiór przez KK/Backend

Po scaleniu i build uruchomić sandbox:e2e oraz odbiór sandbox-acceptance. Sprawdzić zwłaszcza: Chat/Tasks myszą i klawiaturą, tworzenie/edycję kanału i odpowiedź, checkboxy ustawień, wybór pliku, nagrywanie/odtwarzanie, potwierdzenia usunięcia dostawcy i rotacji certyfikatu, dok/wyspę oraz przewijanie formularzy. Zrzuty poza repo. Do czasu tego odbioru zgodność wizualna pozostaje niepotwierdzona.

## Bezpieczeństwo

Worktree był czysty przed utworzeniem gałęzi. W3-UI6 i cudze worktree nietknięte. Bez push, zmian danych OpenBota, uruchamiania okna i zabijania procesów. Zapisano kod, testy i dokumenty w repo oraz uzupełniono lokalne node_modules; brak nowych plików tymczasowych i zrzutów.

## Commity kodu

- 244611635 — komponenty bazowe oraz ustawienia i dane.
- 711a88803 — pozostałe widoki, głos, dok i wyspa.
- e71b6284d — tokeny, dostępność zakładek i potwierdzeń, poprawka skanu CSS i testy.
- Raport i COSGRAL-CHANGES: osobny końcowy commit dokumentacji.