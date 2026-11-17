# W11-UI1 — wygląd klasy OpenBot 0.71 w COSGRAL (własna implementacja)

Źródło wartości: pomiary ekstraktora (poza repo). W repo są tylko nasze tokeny i kod.

## Commit 1 — tokeny
- `styles/cosgral-tokens.css`: `--cosgral-*` (ciemny + jasny). `--openbot-*` w styles.css wskazują na nie, więc cała aplikacja zmienia wygląd naraz.
- Jasny akcent #0069d9 (nie #007cf7), bo test kontrastu wymaga 4,5:1 dla białego tekstu na akcencie; w ciemnym #007cf7 daje ok. 4,0:1 przy białym tekście (do oceny wizualnej).
- Kontrola: theme-palette + theme test 4/4, check:ui OK, Biome OK.
- Nie sprawdzono: Storybook, test:visual (wzorce zmienią się — wymagają GO i aktualizacji po ocenie), Electron. Czcionka Inter nie jest dołączona (wymaga zależności @fontsource-variable/inter, licencja OFL) — decyzja lidera.

## Commit 2 — pasek boczny + szyna (zrzuty 089–092, 099; folder 01-new-agent)
- Szyna ikon 52 px, przyciski 36 px / promień 8, stan aktywny `--cosgral-bg-control-hover`.
- Wiersz wyszukiwania: pole + „+” z menu: Nowy agent, Nowy kanał (gdy jest `onSelectChannels`), Nowy folder (gdy `layout && folderActions`). Usunięto osobne przyciski w nagłówku.
- Kontrola: Sidebar.folders 25/25, App.folders 6/6, i18n 9/9, typecheck:renderer OK, Biome OK, check:ui OK. App.test.tsx: 91/92; jedyny czerwony `hides and shows without dropping…` (menuitem „Ukryj”) jest czerwony także BEZ moich zmian (sprawdzone na Sidebar.tsx z HEAD) — do naprawy osobno (test zakłada polski język).
- Nie zrobiono: filtr zakładek wyszukiwarki globalnej (Wszystko/Agenci/Kanały/Wiadomości/Pliki/Rutyny), zwijanie szyny, karta „mobile”. Storybook/test:visual/Electron nie uruchamiano.

## Commit 3 — ekran „Nowy agent” (zrzuty 001, 041–043, 098; folder 01-new-agent)
- `NewAgentPage`: podgląd awatara, 10 kolorów + auto, wybór twarzy (warianty bloba + „więcej twarzy”), Nazwa*, „W czym ma pomagać”, Model (ProviderModelPicker) + Effort, Utwórz agenta, Sugestie (do 3 szablonów z `agentSettings.listTemplates`).
- Podpięte do backendu: `agentSettings.createAgent({name,description,model,reasoningEffort})`; bez tego API fallback `agent.createBot` + `updateBot`. Twarz i kolor: jedna `agent.updateBot({avatarSeed,avatarHue})` po utworzeniu.
- Luka kontraktu (do Backendu): `CreateAgentInput` nie przyjmuje `avatarSeed`/`avatarHue` — dwa zapisy zamiast jednego; ewentualne „utwórz agenta z szablonu z kolorem” też.
- Sidebar „+ → Nowy agent” otwiera stronę (zamiast pickera + pytania o specjalizację). Stary picker i onboarding w Conversation zostały (pierwszy start bez agentów nadal idzie starą ścieżką).
- Kontrola: NewAgentPage 3/3, App.test 91/92 (przy --testTimeout=30000; bez tego 5 losowych timeoutów pod obciążeniem), jedyny czerwony to stary `hides and shows…`, typecheck OK, Biome OK, check:ui OK, i18n 9/9.

## Commit 4 — napisy do t() (odbiór Testera: pasek boczny FAIL)
- InitialSetup (tytuły, opisy, przyciski, uprawnienia macOS, błędy), Sidebar „Duplicate”, App „Copy ready…” w słowniku PL/EN (52 klucze). Test zgodności kluczy skanuje InitialSetup i NewAgentPage.
- Kontrola: i18n 9/9, InitialSetup.onboarding 5/5, App.test 92/92 (--testTimeout=30000), typecheck:renderer OK, Biome OK.

## Commit 5 — zakładki wątków (zrzuty 102–104)
- `ThreadTabs`: karty otwartych wątków (kontrakt U6), menu karty (zamknij / pozostałe / po prawej), lista zamkniętych pod szewronem, „+”. Zamknięcie aktywnej karty pokazuje sąsiednią; wątek zostaje w liście. Bez kontraktu threadTabs nic się nie rysuje (bez atrapy).
- Luka: przeciąganie kart (reorder) — kontrakt jest, UI jeszcze nie.
- Kontrola: ThreadTabs 5/5, i18n 9/9, typecheck OK, Biome OK, check:ui OK.

## Commit 6 — wyszukiwarka z zakładkami (zrzuty 090, 099)
- Sześć zakładek; `search.query({q, kinds:[channels,files,routines], limit:10})` z 150 ms debounce i ochroną przed spóźnioną odpowiedzią; bez kontraktu zakładki Kanały/Pliki/Rutyny są puste (bez atrapy).
- Otwarcie: kanał → widok kanałów, plik → Biblioteka, rutyna → Harmonogram (hit nie niesie jeszcze celu głębszego niż strona).
- Zmiana nazwy zakładki Bots→Agents dotyka `stories/App.stories.tsx` (nie uruchamiane — wymaga GO na Storybook).
- Kontrola: GlobalSearch 2/2, App.test 92/92, i18n 9/9, typecheck OK, Biome OK, check:ui OK.

## Commit 7 — polecenia „/” (zrzut 111)
- Lista poleceń programu i skilli nad polem wiadomości; podpięta pod `window.openbot.composer.listSlashCommands`; bez kontraktu brak listy (bez atrapy).
- „@” zostaje na lokalnych agentach i plikach; `searchMentions` (kanały, pliki spoza szkicu) jeszcze niepodpięte.
- Kontrola: ComposerEditor 13/13, i18n 9/9, typecheck OK, Biome OK, check:ui OK.

## Commit 8 — menu załączników: skill i pytanie boczne (zrzuty 046, 107, 110)
- Menu „+”: Attach files, Use a skill (SkillQuickPick), Side question (SideQuestionPanel nad polem). Pytanie boczne pokazuje stan „failed: not connected…” z backendu (do czasu wykonawcy Backendu) zamiast ciszy.
- Bez kontraktu composer: komunikaty „niedostępne w tej wersji” (bez atrapy).
- Kontrola: SideQuestionPanel+SkillQuickPick 5/5, App.test 92/92, i18n 9/9, typecheck OK, Biome OK, check:ui OK.

## Commit 9 — effort w nagłówku czatu (zrzuty 050, 105)
- Obok wyboru modelu: lista effort z poziomów wybranego modelu; zapis jak w ustawieniach agenta. Test App.test (effort z nagłówka).
- Kontrola: App.test 93/93 (pojedynczy test + cały plik 92 przed dopisaniem), typecheck OK, Biome OK, check:ui OK.

## W12-UI2 (gałąź team/ui/w12-ui2, od integracji 9b571a8ab)
- Commit 1: „@” z `searchMentions` (kanały i pliki). Kontrola: ComposerEditor 14/14, typecheck OK, Biome OK, check:ui OK.
- Zostało z P0: „1 step”, akcje/reakcje (117), rama panelu bocznego, przeciąganie kart wątków.
- Commit 2: „1 step” (zwinięty nagłówek kroków po zakończeniu). Kontrola: AgentActivity 4/4, App.test (thinking disclosure) OK, typecheck OK, Biome OK, check:ui OK.
- Commit 3: karty agenta (`agentCards`): AgentCardsSection w panelu ustawień agenta. Stany: loading, error+Retry, brak kontraktu, karta niedostępna. Kontrola: AgentCardsSection 5/5, App.test 93/93, i18n 9/9, typecheck OK, Biome OK, check:ui OK. Luka: wiersze kart nie otwierają jeszcze osobnych podstron (pamięć/skille/rutyny mają własne sekcje niżej w panelu).
- Commit 4: ustawienia serwera (`serverSettings`): ServerSettingsPage jako nowa strona szyny (APP_PAGE_IDS +1). Kontrola: ServerSettingsPage 6/6, PageRail 5/5 + pins 4/4 + contract 1/1, agent-settings (backend) 10/10, App.test 93/93, i18n 9/9, typecheck OK, Biome OK, check:ui OK. Luki: sekcje Vault/MCP/Import/Transfer/Browser profiles otwierają dialog ustawień (nie ich własny ekran); brak edycji logo serwera.
- Commit 5: Marketplace Apps na `pluginCatalog`. Kontrola: PluginAppsPanel 5/5, MarketplacePage 1/1, App.test 93/93, i18n 9/9, typecheck OK, Biome OK, check:ui OK. Luki: „Sign in” dla `needs-sign-in` pokazuje tylko tekst (przycisk wymaga `mcpOAuth.signIn({serverId})`, a `PluginSummary` nie niesie serverId — wpis do zapotrzebowania); wybór folderu katalogu jest w ustawieniach serwera tylko jako wskazówka (brak okna wyboru folderu w UI); Vault konektory jeszcze bez ekranu.
- Commit 6: poprawki po zrzutach Testera (zrzuty poza repo). Kontrola: AgentCards 5/5, MarketplacePage 1/1, PluginApps 5/5, i18n 9/9, typecheck OK, Biome OK, check:ui OK. Zauważone, jeszcze nie poprawione: szara „pastylka” na dole szyny (przycisk „Więcej stron” bez widocznych kropek), etykieta konta z nazwą użytkownika w stopce paska bocznego (dane sandboxa).

## UI-F krok 1–2 — przyczyna różnicy i ciemny motyw domyślny
- Przyczyna: (a) domyślny motyw był „system”, a komputer ma jasny tryb Windows, więc okno startowało jasne; tokeny `--cosgral-*` działają w obu motywach, ale zrzuty były jasne; (b) ekran „Nowy agent” był wpięty tylko pod „+ → Nowy agent”, a pusty program otwierał stary picker; zrzut `02` Testera to widok czatu po utworzeniu agenta; (c) stary układ bazy (karty „Threads / Context”, płaskie pola) nadal jest — przebudowałem tylko tokeny i wybrane ekrany, nie całą powłokę (pływające panele z zaokrąglonymi rogami, szyna jak w 0.71, dock/wyspa).
- Zmiana: domyślnie ciemny (theme-init, backend default, normalizeAppTheme), pusty program → Nowy agent. Kontrola: theme 2/2, theme-palette 2/2, AppearanceSettings 2/2, agent-settings 10/10, App.test (nowy start) OK, typecheck OK, Biome OK.

## UI-F krok 3–4 (część)
- Logo: istniejące własne animowane SVG (`AppLogo`) pokazane na szczycie szyny. Maskotki agentów: generator `blobatar` (10 kształtów × 10 odcieni + auto); wzorzec 0.71 ma ok. 12 kształtów i 17 kolorów — poszerzenie to zmiana kontraktu `BotAvatarHue` (wpis do zapotrzebowania). Ikony szyny to własne SVG (20 px, linia 1,5); ujednolicenie reszty (lucide) zostaje.
- Ruch: `styles/motion.css` (wejście stron, menu, oddech maskotki, hover kart), `prefers-reduced-motion` wyłącza animacje. Nie ruszone jeszcze: animacja zwijania paska bocznego, przejścia zakładek wątków przy zamykaniu, stan „pisze” (już istnieją kropki).
- Kontrola: PageRail 5/5 + pins 4/4, AppLogo 7/7, App.test, typecheck OK, Biome OK, check:ui OK.
