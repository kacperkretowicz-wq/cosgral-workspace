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
