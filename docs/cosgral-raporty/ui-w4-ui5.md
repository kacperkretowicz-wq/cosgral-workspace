# W4-UI5: szyna stron, menu agentów, pliki i model zapasowy

Gałąź: `team/ui/w4-ui5`, baza integracji `ad216fe12`. Bez push. W5-UI1b i W3-UI6 zachowane. Do 02:55 wyłącznie odczyt i pisanie kodu/testów, bez uruchamiania testów, typecheck, Storybook ani visual.

## Zmiany

- Szyna: `AppSettings.navigation.pinnedPageIds`, pełna lista w zapisie. Przypinanie z More pages, odpinanie/przypinanie z menu kontekstowego strony. Kolejność z ustawień; przypięte pozostają na szynie niezależnie od pomiaru wysokości. Agents zostaje stałym skrótem powrotu (gdy nie jest przypięte samodzielnie); reszta stron w More pages. Krótka szyna przewija przypięcia, Settings pozostaje osobnym narzędziem. Wersje bez appSettings zachowują wcześniejszy tryb responsywnego przepełnienia. Zmiany ustawień z innych okien idą przez app-settings-changed; zapis odczytuje najnowszą listę, nie wysyła starego lokalnego fragmentu.
- Agenci: Ukryj/Pokaż przez setBotHidden, filtr sidebaru z Pokaż ukryte, ukryci mają stonowany wiersz i oznaczenie. Dane agenta pozostają w App i mechanizmach Needs you. Gdy ukrywa się bieżącego, wybieramy innego widocznego lub otwieramy wybór agenta. Duplikuj wywołuje duplicateBot, wybiera kopię i pokazuje dyskretny komunikat o wyłączeniach oraz warnings. Bez fikcyjnych akcji wątku i osobnego okna. Akcje K3 dostępne tylko dla lokalnego serwera.
- Pliki: Pobierz i Pokaż w folderze, istniejące library.open(action: download/reveal), błędy w panelu. Bez nowej metody backendowej.
- Model zapasowy: BotProfile zachowuje BotSummary.activeModel i hidden. App obsługuje model-fallback, aktualizuje model bieżący i zbiera ostatnie komunikaty niezależnie od strony Providers. Wiersz agenta i nagłówek rozmowy mają tę samą plakietkę; model równy bazowemu oraz bots-changed po resecie usuwają ją. Providers dostaje komunikaty z App zamiast zbierać je tylko podczas otwarcia.

## Kroki e2e dla KK

W scripts/sandbox-e2e.ts dopisane dwa kroki UI:
1. Tworzy agenta testowego w piaskownicy, Ukryj z menu wiersza, potwierdza hidden w API i brak wiersza; włącza Pokaż ukryte, wybiera Pokaż, sprawdza powrót.
2. Duplikuje tego agenta z menu; sprawdza wybór nowej rozmowy, komunikat o wyłączeniach, inne ID i katalog roboczy. Czyści tylko utworzone tam dane demonstracyjne i wraca do rozmowy New agent.

Pętla otwierania stron w e2e potrafi wybrać stronę także z More pages. Kroki napisane, uruchomi KK.

## Weryfikacja

- Testy, typecheck, Biome, Storybook i check:ui uruchomione po 02:55, pojedynczo. Jednostkowe przez Node/Vitest, plik po pliku: PageRail.pins 4/4, PageRail 5/5, Sidebar.folders 25/25, LibraryPanel 2/2, FallbackModelBadge 1/1, App 90/90; razem 127/127. App obejmuje faktyczne wywołania ukrywania/duplikowania, wybór kopii z warnings oraz fallback i reset bez otwierania Providers.
- Storybook w Chromium: App 9/9, PageRail 8/8, Sidebar 16/16, LibraryActions 1/1; razem 34/34. Nowe stany: przypięcia, ukryci agenci, ostrzeżenie kopii, model zapasowy w pełnym App, download/reveal. Osobna historia AgentMenuActions przechodzi Ukryj → Pokaż → Duplikuj i zbiera błędy okna.
- Obejrzany Storybook w prywatnej przeglądarce: pełny App z plakietką w wierszu i nagłówku, przypięcie/odpięcie Library (lista z API [library] → []), ukryty wyszarzony wiersz oraz powrót i wybór kopii. To są dane demo, bez silnika Electron. Zrzuty nie zapisane w repo.
- W oglądaniu wykryłem błąd fokusu: usunięcie aktywnego menu emitowało focusout podczas sprzątania Solid, a Kobalte próbowało zapisać stan w owned scope. Poprawka jest lokalna w Sidebar: zwolnienie fokusu przed wykonaniem akcji menu i stabilne obiekty wierszy między migawkami (z uwzględnieniem głębokości, rozwinięcia i liczników folderów). Nie zmieniałem Kobalte, zależności ani zabezpieczeń Solid. Po poprawce ręczne Ukryj/Pokaż/Duplikuj: zero błędów okna; test Chromium również przechodzi. Test liczników folderu był czerwony przed dopięciem agentCount do porównania, po poprawce zielony.
- Typecheck renderer, Storybook i node (w tym napisany sandbox-e2e) zielone. Biome na zmienionych plikach i check:ui zielone, impeccable detect: [].
- Storybook dev zatrzymany, karta zamknięta. Logi uruchomienia pozostały poza repo w piaskownicy (ui-w4-ui5-storybook*.log); cache narzędzi w ignorowanym node_modules. W dev nadal są ostrzeżenia STRICT_READ_UNTRACKED w istniejących adapterach; nie twierdzę, że konsola jest bez ostrzeżeń.

## Czego nie sprawdziłem

- Prawdziwego okna Electron i sandbox:e2e (nowe kroki dla KK).
- Prawdziwego limitu dostawcy i resetu konta (testowane będzie zdarzenie/stan, silnik ma osobny odbiór).
- Pełnego bun run check, pełnych testów, build i całej macierzy Windows/DPI.
- Operacji usuwania kopii agenta i folderów w rzeczywistym profilu. Zmiany dotyczą UI; agenci ukryci nadal pracują.

Parytet wierszy 2 i 3 pozostaje częściowy: wątki i osobne okno to W6. Wiersze 30/35 nie są oznaczane jako w pełni odebrane wyłącznie na podstawie testów tych kontrolek.
