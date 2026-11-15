# W4-UI3 — kontrast danger i akcje kanałów

Gałąź: team/ui/w4-ui3. Baza: codex/cosgral-desktop @ f86942e6a. Bez push.
Stan: poprawki i testy gotowe; odbiór w oknie aplikacji oraz pełny check wykonuje KK.

## Co zmieniono

- W components/ui/Button dodano wariant danger-solid: wypełnienie danger i tekst przez semantyczny token --openbot-text-on-danger, wskazujący w programie na --openbot-text-on-light.
- Oba dialogi usuwania (agent i folder) używają tego wariantu. Usunięto lokalne nadpisanie jasnego tekstu, zamiast poprawiać tylko jeden dialog.
- Zwykły danger pozostaje wariantem z miękkim tłem. Jego wypełniony hover oraz hover awaryjnego Stop zdalnego pulpitu także używają tekstu on-danger.
- Hover i pressed wariantu solid używają danger-strong. Disabled zachowuje opacity 1 oraz czytelność tekstu; niedostępność sygnalizuje przerywane obramowanie i natywny disabled. Hover nie zmienia niedostępnego przycisku.
- Wyłączono przejście koloru i tła miękkiego danger: przy zmianie polarności tekstu ich interpolacja dawałaby chwilowo słaby kontrast. Zachowano przejścia opacity i transform.
- Jasna ramka Storybooka ma alias on-danger do istniejącego białego tokenu, ponieważ jej danger jest ciemny. Nie zmienia to motywu aplikacji.
- Browse channels i New channel mają wariant secondary, wysokość lg (36 px), obramowanie, tło kontrolki, ikony Search/Plus z istniejącego zestawu paska, stan hover i wspólny focus-visible. Usunięto klasę wiersza agenta bot-row, która nadpisywała styl przycisków. Obsługa obu akcji pozostaje bez zmian.

## Kontrasty

Obliczenia WCAG, względna luminancja sRGB, zwykły tekst: wymaganie 4,5:1. Wartości przed z bazy, po z tokenów użytych w CSS. Testy przeglądarkowe sprawdzają także rzeczywiste kolory computed style.

| Przycisk / stan w ciemnym motywie | Przed | Po |
| --- | --- | --- |
| Delete w dialogach: normal i focus | 2,152:1 | 7,646:1 |
| Delete w dialogach: hover i pressed | 2,152:1 | 5,374:1 |
| Delete disabled: etykieta po uwzględnieniu opacity | 1,788:1 | 7,646:1 |
| Wypełniony hover miękkiego danger / Stop | 3,062:1 | 5,374:1 |

Normal: tło #e88f88; stary tekst #f2f2f2, nowy #141414. Hover/pressed po zmianie: tło #ff4058, tekst #141414. Stary disabled w dialogu: opacity 0,55 na tle bg-control #1b1b1b; policzono osobno kompozycję tekstu i tła przycisku. Nowy disabled nie obniża opacity.

Jasny podgląd (nie motyw programu): nowy solid normal/focus/disabled 7,049:1; hover/pressed 8,953:1, biały tekst na odpowiednio #aa241d i #8f1c16. Wszystkie nowe stany przekraczają 4,5:1.

W produkcyjnych CSS pozostałe wypełnienia danger dotyczą wskaźników stanu bez etykiety, nie przycisków z tekstem. Nie zmieniano koloru danger ani innych wartości palety; doszedł tylko alias semantyczny.

## Testy

- Jednostkowe, po jednym pliku i 1 worker: ui/ui 11/11; Sidebar.folders 19/19 (w tym nowy test osobnych akcji kanałów); Sidebar.needs-you 1/1; Sidebar.activity 4/4; Sidebar.eyes-local 5/5. Razem 40/40.
- Storybook, wyłącznie dotknięte pliki, osobno: Button.stories 3/3; Sidebar.stories 11/11. Historie obejmują kontrast obu rzeczywistych dialogów oraz ikony, tło, fokus i obsługę klawiaturą obu przycisków kanałów.
- Dodano danger-contrast.visual.test.tsx: 2/2 w Chromium, ciemny motyw i jasny podgląd. Natywne zdarzenia przeglądarki sprawdzają hover, przytrzymany Space (:active), fokus, disabled i hover miękkiego danger. Próg kontrastu 4,5:1.
- Pierwszy pełny test:visual: 5/6; jedyne niepowodzenie wynikało ze zmiany rozmiaru obrazu aplikacji po poprawie przycisków. Pozostałe testy, w tym nowe stany kontrastu, przeszły.
- Po obejrzeniu renderu zaktualizowano wyłącznie test representative application screens. Przebieg z aktualizacją: 1/1. Następnie kontrolny przebieg tego samego testu BEZ aktualizacji: 1/1. Testy kontrastu powtórzono osobno po końcowej poprawce przejść: 2/2. Nie uruchamiano ponownie całego zestawu obrazów bez potrzeby.
- check:ui: exit 0. Biome na 13 plikach kodu: exit 0. typecheck:renderer i typecheck:storybook: exit 0.
- Mechaniczny detektor impeccable wskazał jeden zastany warning: pasek .bot-row-needs-you w app-shell.css. Ta reguła nie jest częścią zmiany i pozostała nietknięta. To nie nowy dług wprowadzony przez zadanie.

## Obrazy win32

Zmieniły się dokładnie dwa wzorce w tests/visual/__screenshots__/ui-foundation.visual.test.tsx:

1. application-chromium-win32.png — widoczne nowe tło, obramowanie i ikony obu akcji kanałów; niższe kontrolki zmniejszają wysokość całego obrazu z 1280×711 do 1280×679. Grupy paska i dolna część okna przesuwają się zgodnie z tą zmianą układu.
2. join-server-dialog-chromium-win32.png — ten sam zmieniony panel pod przyciemnieniem oraz wynikające z niższego okna położenie wyśrodkowanego dialogu; również 1280×711 → 1280×679.

Foundations, host panel, provider model picker, oba obrazy kolejki oraz wszystkie wzorce macOS pozostały bez zmian. Nie podnoszono tolerancji różnic. Obrazy zawierają istniejące dane demo, nie zwykły profil użytkownika.

## czego nie sprawdziłem

- Nie uruchomiłem ani nie oglądałem okna Electron aplikacji. Obejrzałem render kontrolowanych testów wizualnych; to nie odbiór rzeczywistej sesji programu.
- Nie uruchomiłem pełnego bun run check, pełnego bun run test, sandbox:e2e, build ani instalatora — zgodnie z przydziałem pełny odbiór robi KK.
- Nie uruchomiłem historii innych niż dwa zmienione pliki ani testów macOS i innego komputera Windows.
- Nie sprawdziłem fizycznej klawiatury ani czytnika ekranu. Klawiaturę i pseudostany zweryfikowano natywnymi zdarzeniami Chromium.
- W teście aplikacji są znane ostrzeżenia STRICT_READ_UNTRACKED z istniejących komponentów Kobalte/Solid. Nie były powodem niepowodzenia porównania obrazu; ich naprawa nie jest częścią tej zmiany.

## Dowody i bezpieczeństwo

Zrzuty pomocnicze są poza repo, w Shared/cosgral-sandbox/ui-w4-ui3. Test kontrastu zapisuje je tylko po ustawieniu opcjonalnego VITE_COSGRAL_UI_EVIDENCE_DIR. Bez tej zmiennej nie tworzy dodatkowych plików. Nie ma ścieżki profilu w kodzie ani raporcie.

Początkowy worktree czysty. W3-UI6 i cudze worktree nietknięte. Bez push, uruchamiania okna programu, zmian danych OpenBota i zabijania procesów. Pełny check po scaleniu pozostaje do KK.
