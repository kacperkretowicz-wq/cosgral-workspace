# Prompt: jakość UI COSGRAL Workspace (dla każdego agenta, który rusza wygląd)

Właściciel, 19.11.2026: „Każda sekcja ma wyglądać jakościowo, a nawet lepiej niż sam OpenBot. Zmiany w UI mają być
diametralne i dużo wnoszące: ikonki, sekcje, to jak to wygląda. Kolory mniej ważne.”

Wkład produktowy: `PRODUCT.md` (użytkownicy, zasady, ograniczenia). Ten plik mówi, JAK pracować nad wyglądem.

## Cel

1. Układ jak w OpenBocie (pasek stron, lista agentów, rozmowa). Ktoś biegły w OpenBocie znajduje wszystko tam, gdzie się spodziewa.
2. Wykonanie lepsze niż OpenBot w każdej sekcji: gęstość, rytm odstępów, ikony z jednej rodziny, stany (pusty, błąd, ładowanie, fokus), szczegół.
3. Stworki (awatary agentów) są sercem produktu: dopracowane rysunki, mimika, ruch (mrugnięcie, „myślę”, „mam wiadomość”), zawsze też w wersji bez ruchu.
4. Logo „C”, ciemny motyw domyślny, awatary-stworki: zostają (zobowiązania marki).

## Jak pracować

1. **Porównuj na żywo.** OpenBot jest zainstalowany na komputerze właściciela. Patrz (zrzuty), nie klikaj w jego rozmowy, nie zmieniaj jego danych.
2. **Nie kopiuj 0.71.** Ani kodu, ani obrazków, ani ikon z paczki OpenBota 0.71 (licencja PolyForm Noncommercial, repo publiczne). Rysujemy i piszemy swoje.
3. **Sekcja po sekcji**, od najczęściej oglądanej: pasek boczny z agentami → nagłówek i pole wiadomości → wiadomości w rozmowie → strony (Zadania, Przepływy, Zużycie, Biblioteka) → ustawienia → okna dialogowe.
4. **Duży skok, nie kosmetyka.** Jedna zmiana sekcji = widoczna różnica na zrzucie przed/po. Jeśli przed i po wyglądają prawie tak samo, to nie jest ta zmiana.
5. **Sprawdzaj w prawdziwym oknie.** Zbuduj (`bun run build`), uruchom w piaskownicy z `--remote-debugging-port`, zrób zrzut przez CDP. Zrzut przed i po każdej sekcji.
6. **Po polsku.** Każdy nowy napis przez `t()`, klucz w `pl.ts` i `en.ts` (równe klucze). Żadnych uciętych etykiet po polsku.
7. **Bez ruchu też działa.** Ten komputer ma „ogranicz animacje”. Nic nie może zależeć od animacji (np. `opacity: 0` czekające na animację = niewidoczna treść).
8. **Testy zielone.** Testy jednego pliku, `typecheck:renderer`, Biome, Storybook dla zmienionych historyjek, wizualne. Zmiana wzorca zrzutu tylko po obejrzeniu różnicy.

## Poziom wykonania (podłoga)

- Jedna rodzina ikon (obecnie `lucide-solid` + własne SVG w `PageRail.tsx`): ta sama grubość linii i rozmiar w obrębie sekcji.
- Jeden rytm odstępów (tokeny `--openbot-space-*`), większy odstęp nad nagłówkiem niż pod nim.
- Typografia: tokeny `--openbot-text-*`; przycisk `md` = 13px.
- Każdy element interaktywny ma stan najechania, fokus z klawiatury i stan wyłączony z powodem.
- Kontrast WCAG AA w obu motywach (Storybook a11y to sprawdza).
- Stany puste mówią, co zrobić dalej, jednym zdaniem i jednym przyciskiem.

## Czego unikać

- Pływających „wysp” i chipów bez funkcji, przełączników na wierzchu, które są rzadko używane (chować do menu filtra).
- Kropek, plakietek i kolorów, które niczego nie znaczą (np. kropka „przypięta” na każdej ikonie).
- Generycznych kafelków z ikoną, szklanych efektów i gradientów zamiast prawdziwej treści.

## Dziennik zmian sekcji

| Data | Sekcja | Co zmieniono | Zrzuty |
|---|---|---|---|
| 19.11 | Pasek stron | 5 stron domyślnie (Agenci, Przepływy, Zadania, Zużycie, Biblioteka) + „Więcej”, bez kropek, bez poziomego paska przewijania | — |
| 19.11 | Pasek boczny agentów | „Pokaż ukryte” do menu filtra (lejek), „Przeglądaj/Nowy kanał” do menu „+”, stan pusty z przyciskiem „Nowy agent” | — |
| 19.11 | Wiersze agentów | Płaska lista jak w OpenBocie (bez kart i kolorowego paska), stworek 42px, rola w linii podglądu zamiast plakietki ucinającej nazwę | — |
| 19.11 | Stworki | Gradient światła, odblask przycięty do kształtu, błysk w oczach, miękki cień; kształty bez zmian | — |
| 19.11 | Nagłówek rozmowy | Pliki / Ustawienia agenta / Głos jako ikony w nagłówku zamiast pływającej kolumny przycisków | — |
| 19.11 | Pole wiadomości | „Wybierz z biblioteki” w menu „+”, ikony przy każdej pozycji menu | — |
| 19.11 (2) | Stworki: mimika | Twarz mówi stan agenta: pracuje (oczy na dwóch wysokościach, z ruchem rozgląda się), potrzebuje Cię (szerokie oczy, uniesione brwi, z ruchem podskok), nowa wiadomość/odpowiedział („^ ^” i rumieńce), błąd (smutne oczy, kropla potu), limit (przymknięte oczy, „zz”). Pozy są statyczne (`blobatar/expression`, zapieczone w geometrii), więc działają przy „ogranicz animacje”. Historyjka `Identity/AgentAvatar › Moods` | Storybook `identity-agentavatar--moods` |
| 19.11 (2) | Wiersze agentów | Godzina nigdy nie jest ucinana („Yesterd…”, „10:00 …” → pełne); „Pracuje w: …” w linii podglądu zamiast w kółku stworka; stworek pokazuje stan miną | `cosgral-w1-ui2--activity-states-dark/light` |
| 19.11 (2) | Nagłówek rozmowy | Stworek 24px i nazwa pogrubiona; stworek „myśli”, gdy agent pracuje; „Nowy wątek” jako ikona w nagłówku, gdy agent ma jeden wątek | `app--playground` |
| 19.11 (2) | Pasek kart wątków | Przy jednym wątku nie rysuje się wcale (jedna karta nic nie mówi); od dwóch wątków jak dotąd | — |
| 19.11 (2) | Wiadomości | Odpowiedź agenta bez dymka (czysty tekst na tle, wiersz 22px, max 720px), dymek tylko dla wiadomości człowieka (jak w OpenBocie) | `app--playground` |
| 19.11 (2) | Po polsku | Stany w wierszu („Limit · wznowi o…”, „Błąd · …”, „Myśli”, liczba odpowiedzi), „Steruje komputerem / Zatrzymaj”, „Oznacz jako przeczytane”, etykiety dostępności wiersza | — |
| 19.11 (3) | Szkielet stron | `WorkPage`: każda strona z paska ma ten sam nagłówek (ikona strony w kafelku, tytuł, jedno zdanie, akcje po prawej). `WorkPageSections`: lista sekcji z ikonami po lewej (na wąskim oknie zakładki), wybrana sekcja płasko na stronie, zapamiętana. `WorkPageAnchors`: spis sekcji, który przewija i podąża za przewijaniem (gdy wszystkie sekcje muszą zostać na stronie) | `app--playground` → każda strona |
| 19.11 (3) | Biblioteka | Zamiast 8 kart jedna pod drugą: sekcje Pliki, Umiejętności, Tabele, Sejf, Menedżery haseł, Komunikatory, Integracje, Serwery MCP. Pliki: jeden pasek narzędzi (szukaj z ikoną, typ, sortowanie, „Dodaj pliki”), kafelek typu pliku (miniatura obrazu, dokument, tabela), akcje wiersza na najechanie. Wiersze umiejętności, sejfu i MCP: ikona, nazwa z wersją, opis, akcje po prawej | `app--playground` → Biblioteka |
| 19.11 (3) | Przepływy | Układ edytora: zapisane przepływy po lewej, po prawej nazwa jako tytuł, „Szkic”, usuń jako ikona, „Zapisz” z ikoną. Paleta i karty kroków z ikoną typu. Pusty stan płótna „Zacznij od wyzwalacza”. Połączenia w jednym wierszu, ścieżki jako kolorowe etykiety. Historia uruchomień: status, czas, kroki jako łańcuch etykiet w kolorze stanu | `app--playground` → Przepływy |
| 19.11 (3) | Harmonogram | Sekcje Plan i Rutyny. Plan jako oś czasu: Dziś/Jutro/Wczoraj, kropka na osi, stworek agenta (mina „pracuje” przy trwającym uruchomieniu), status. Rutyny: wiersze ze stworkiem, „Aktywne/Wstrzymane”, akcje na najechanie; formularz jako karta w dwóch kolumnach | `app--playground` → Więcej → Harmonogram |
| 19.11 (3) | Dostawcy, Zużycie, Telefon, Zdalny pulpit | Ten sam nagłówek; Dostawcy ze spisem 8 sekcji z ikonami (wszystkie sekcje zostają na stronie dla skryptów akceptacyjnych) | `app--playground` |
| 19.11 (4) | Kolory | Nowy CSS tej gałęzi przepięty na paletę `--openbot-*` z `styles.css` (zasada z AGENTS.md); nowy token `--openbot-bg-inset`; kolory kroków przepływu z `--openbot-file-*` | — |
| 19.11 (4) | Zużycie | Karty liczb z ikoną i wyliczoną linią (dziennie, na turę, tury z ceną); wykres w karcie ze szczytem, przerywaną siatką i dzisiejszym słupkiem w akcencie; „Ten komputer” obok; tabela agentów ze stworkami; bez zewnętrznej karty | `app--playground` → Zużycie |
| 19.11 (4) | Kanały na liście | Sekcja „Kanały” nad „Agentami”: stos do 3 stworków członków (prowadzący z przodu), tytuł, liczba członków, „#nazwa · prowadzi X”; wyszukiwarka filtruje też kanały | `app--playground` |
| 19.11 (4) | Widok kanału | Nagłówek ze stworkami i „Edytuj kanał”; pasek Czat/Zadania + pigułki (Instrukcje, Pamięć, Rutyny, Historia) otwierające kartę; wiadomości ze stworkiem autora, etykietą rodzaju i czasem, cytat odpowiedzi, „Odpowiedz” jako ikona; pole wiadomości jak w rozmowie (Enter wysyła); zadania ze stworkiem i stanem; lista kanałów w środku chowa się, gdy kanał otwarto z paska | `app--playground` → kanał Project |
| 19.11 (4) | Kroki agenta | „N kroków” jako oś czasu: ikona rodzaju kroku (czytanie, szukanie, uruchomienie, pisanie, sieć, myślenie), bieżący krok w akcencie; blok kroków nie zależy już od animacji wejścia | `conversation-agentactivityindicator--thinking-details` |
| 19.11 (5) | Ustawienia (okno) | Własne okno zamiast kreatora konfiguracji w trybie przeglądu: po lewej spis 10–11 sekcji z ikonami (przewija do sekcji i podąża za przewijaniem), po prawej wszystkie sekcje na jednej stronie, jedna stopka Anuluj / Zapisz zmiany (zapisuje też język i powiadomienia). Powiadomienia jako wiersze z przełącznikami zamiast gołych pól wyboru. Pierwsze uruchomienie zostaje kreatorem | `app--playground` → Ustawienia |
| 19.11 (5) | Okno kanału | Podgląd kanału (stos stworków, prowadzący z przodu), członkowie jako lista ze stworkiem i zaznaczeniem, prowadzący oznaczony na liście („Ustaw jako prowadzącego”), podpowiedzi pod polami zamiast ogromnego akapitu. Nazwy pól dla testów i skryptów bez zmian | `app--playground` → + → Nowy kanał |
| 19.11 (5) | Nowy agent | Nagłówek `WorkPage`; pracownia stworka: scena, podgląd 6 min, kształt, kolor (próbki kolorów były wcześniej niewidoczne); powód przy wyłączonym „Utwórz agenta”; propozycje pod formularzem | `app--playground` → + → Nowy agent |
| 19.11 (5) | Dostawcy › Konta | Konta jako wiersze: kolejność w puli, kropka stanu, przełączniki pod nazwą, akcje jako ikony (w górę, w dół, domyślne, odśwież, usuń); limit puli i „Dodaj konto” jako zwarte wiersze. CLI, klucze i punkty końcowe jeszcze nie | `app--playground` → Więcej → Dostawcy |
| 19.11 (5) | Katalog dodatków | Nagłówek `WorkPage`, spis sekcji z ikonami, ikona kategorii zamiast inicjałów („DB”, „DF”), opis w dwóch liniach (po polsku nie jest już ucinany) | `app--playground` → Więcej → Katalog |
| 19.11 (5) | Ustawienia serwera | Nagłówek `WorkPage`, 14 sekcji z ikonami i jednym zdaniem opisu, pola jako wiersze (etykieta po lewej, pole po prawej) | `app--playground` → Więcej → Ustawienia serwera |
| 19.11 (5) | Po polsku | „Online now/Offline/Update”, zwijanie paska, zdjęcie konta, domyślny tytuł „New thread” w panelu wątków, akcje wiadomości (odpowiedz, reakcja, rozgałęź, kopiuj), kolejka, pamięć, karty kont i limitów, „Pokaż w Finderze/Eksploratorze”, komunikaty głosu z backendu | — |
| 19.11 (6) | **Azure Glass** (styl z inspiracji właściciela) | Paleta: granatowa czerń (`#0a0d12` tło), Dark Azure `#00638E`/`#004A6B`/`#8CB9CC`, elektryczny błękit `#1A5CF0`/`#1951FC` jako akcent, chłodna czerwień `#E01543` (neon `#FF2D55` do poświaty); jasny motyw na Dark Azure i `#A80B2F`. Nowe tokeny: `--openbot-gradient-brand/-electric/-red/-green`, `--openbot-glass`, `--openbot-glass-edge`, `--openbot-glass-glow(-red/-green)`, `--openbot-glow-accent/-red/-green`, `--openbot-ambient`, `--openbot-grain`. Arkusz `styles/azure-glass.css`: ziarno na całym oknie, poświata tła stron, kafelek ikony strony w gradiencie marki, zaznaczenia jako przejście koloru od lewej, szklane karty i okna podświetlone od dołu, przycisk główny elektryczny, niszczące czerwone, pigułki stanów ze świeceniem, czerwona plakietka nieprzeczytanych, Zużycie: trzy kafelki w trzech kolorach poświaty, słupki z gradientem. Stworki: mocniej nasycone kolory i głębszy połysk (`vividHex` w `blobatar.ts`) | `app--playground` (Rozmowa, Zużycie, Nowy agent, Ustawienia) |
| 19.11 (7) | **Azure Glass 1:1 z inspiracjami** (właściciel: „prawie 1:1 jakościowo”) | Przepisy z referencji jako tokeny: **kafle podświetlone** (`--openbot-tile-blue/-red/-green` + `-shadow`: ciemna góra, dolne ~40% wypełnione kolorem, jasny rdzeń i świecąca krawędź dolna, poświata na zewnątrz — jak „Daily Newsletter / Curated Tools / Expert Insights” i karta „400 %”); **ciche szkło** (`--openbot-tile-quiet`: karty, listy, okna, pole wiadomości, dymek Twojej wiadomości, zaznaczony wiersz); **ikony z siatką gradientów** (`--openbot-mesh-blue/-red/-lime/-green/-cyan/-pink/-orange`, jak „Modern Gradient Pack”) dla nagłówka każdej strony, kategorii katalogu i kafli Zużycia; **pigułki stanów** z jaskrawą obwódką i kolorowym tekstem (`--openbot-status-*`); **błyszczące pigułki** (`--openbot-pill-glossy(-red)`) dla głównych akcji, wysyłania, przełączników i plakietki nieprzeczytanych. Stworki: odbite światło przy dolnej krawędzi i mocniejszy odblask; stworki osób mają ten sam połysk co agenci | `app--playground` → Zużycie, Nowy agent, Katalog, Ustawienia, rozmowa |
| 19.11 (8) | **Szklane okno, dok i ikony** (właściciel: „ikony w tym stylu, większe; całe tło lekko szklane; dopracowane”) | Tło okna: kolorowe, rozmyte plamy światła (`--openbot-backdrop`), panele (pasek boczny, rozmowa, strony) półprzezroczyste z rozmyciem i jasną krawędzią (`--openbot-panel-glass`, `--openbot-panel-edge`). Pasek stron jako dok: każda strona ma własny kafelek z siatką gradientu (`--rail-mesh` per `data-page`: Agenci niebieski, Przepływy limonkowy, Zadania cyjan, Zużycie czerwony, Biblioteka różowy, Harmonogram zielony, Katalog pomarańczowy), nieaktywne przygaszone, aktywny świeci; „Więcej” i Ustawienia jako ciche szkło. Większe kafelki: nagłówek strony 52 px, Ustawienia 40, Zużycie 44, Katalog 46. Spisy sekcji z kolorowymi kafelkami jak w ustawieniach telefonu (kolory cyklicznie). Pola tekstowe i listy jako szklane studzienki z poświatą fokusu (`--openbot-field-glass/-edge`); przełączniki okresu, filtry i zakładki panelu bocznego jako szklane pigułki; menu, listy i podpowiedzi jako matowe szkło (`--openbot-popover-glass`); karty plików w rozmowie szklane; podpisy min stworka na scenie w szklanych pigułkach (czytelne na poświacie) | `app--playground` → każda strona |
| 19.11 (9) | Dostawcy (wnętrza), kanał, wiadomość bezpośrednia, ładowanie | **CLI agentów, Klucze API, Punkty końcowe** jako wiersze z ikoną (mesh), stanem i akcjami; ustawienia CLI (auto-aktualizacja, wersja, ścieżka) jako lista z polami w jednym wierszu; formularz punktu końcowego jako karta w dwóch kolumnach (region „Fallback models” bez zmian). **Pasek kanału w wąskim oknie:** „# nazwa” w jednej linii, pigułki (Instrukcje, Pamięć, Rutyny, Historia) skracają się do ikon z podpowiedzią (`@container`). **Wiadomość bezpośrednia:** nagłówek jak u agenta (większy stworek, świecąca kropka online, „Oznacz rozmowę jako przeczytaną”, szklana pigułka „Prywatna”). **Jasne historyjki** `Work pages` (Biblioteka, Przepływy, Harmonogram). **Ładowanie:** Przepływy, Katalog, Telefon i Ustawienia serwera ładują się leniwie (`lazy` + `Loading`), główny plik JS 3,17 → 2,94 MB | `app--playground` → Dostawcy, kanał (900 px), Alice Chen |
| 19.11 (10) | Zadania, Przepływy, Biblioteka, karty i panel agenta, logowanie, Modele zapasowe, stworki | Zadania na `WorkPage` (szklana tablica); Przepływy: kroki jako szklane kafelki z siatką gradientu per typ (kolory z tokenów `--step-*`, bez `oklch`); Biblioteka: kafelek rodzaju pliku; karty agenta: kafelki w kolorze grupy, strzałka przy prawej krawędzi, liczba w pigułce; panel agenta: scena stworka, sekcje zaawansowane (Poziom dostępu, Izolacja, Profil przeglądarki, Budżet, MCP, Rutyny) jako szklane karty z `PanelHeading`; Telefon i Zdalny pulpit z `PanelHeading`; logowanie i konfiguracja na szkle. **Modele zapasowe:** wiersz (numer, nazwa, akcje) zawija się, nazwa nie łamie się po literze; listy jako wstawki szkła; formularze dodawania jako wstawka zamiast ramki kreskowanej. **Stworki:** mina członka w nagłówku kanału wg zadań, mina wiadomości wg rodzaju (pytanie, wynik), mrugnięcie przy najechaniu (nie przy „reduce motion”) | `app--playground` → Zadania, Przepływy, Ustawienia agenta, kanał Project; `cosgral-fallback-lists--general-list` |

## Runda 3 (19.11, kontynuacja): cel i zasady

**Cel:** kolejne duże skoki tam, gdzie właściciel patrzy najczęściej, drobiazgi na koniec.

1. **Zużycie:** karty liczb z ikonami, spokojny wykres (słupki z palety, siatka, podpisy), tabela agentów ze stworkami.
2. **Kanały na liście agentów:** wiersz kanału ze stosem stworków członków zamiast pojedynczej ikony.
3. **Rozmowa:** kroki agenta („N kroków”) jako zwijana oś czasu z ikonami narzędzi.
4. **Dostawcy (wnętrza sekcji):** konta i CLI jako wiersze z ikonami i stanem zamiast stosów pól.

**Zasady tej rundy (AGENTS.md):** kolory tylko z palety `:root` w `src/renderer/src/styles.css` (`var(--openbot-*)`),
bez nowych `#hex`, `rgb()`, `color-mix()` w regułach; nowa rola koloru najpierw w `:root`. Sprawdzanie tylko w Storybooku
(komponenty) albo w aplikacji dev (całość). Najpierw szukaj istniejącego komponentu/stylu do ponownego użycia.
Kolory stworków (rumieniec, kropla potu) są wewnątrz generowanego awatara, więc zostają przy nim (`blobatar.ts`).

## Następne sekcje (kolejność)

Pełna lista (UI i reszta, P0–P3): `docs/cosgral/INSTRUKCJA-DLA-AGENTA.md`.

1. Okno nowego/edycji kanału (`ChannelEditor`) i tworzenie agenta: ten sam poziom co widok kanału.
2. Dostawcy: wnętrza sekcji (konta, CLI, klucze) jako wiersze z ikonami i stanem zamiast stosów pól.
3. Katalog dodatków i Ustawienia serwera: nagłówek `WorkPage` bez łamania ich nawigacji.
4. Ustawienia (okno) i pozostałe okna dialogowe.
5. Drobiazgi: „Online now/Offline” i etykiety dostępności w wierszach osób po polsku, ostrzeżenie Biome w `cosgral.css:2812`.
