# COSGRAL Workspace — przekazanie prac

Stan: 3 listopada 2026. Po wcześniejszym wstrzymaniu użytkownik polecił wznowić budowę. Projekt nie spełnia jeszcze kryteriów ukończenia i nie jest gotowy do codziennej pracy ani udostępnienia drugiej osobie.

## Instrukcja kontynuacji dla następnego agenta

1. Przeczytaj `COSGRAL-PROMPT-POSTEP.md` w całości: jest oryginalnym celem użytkownika, a przekreślone są jedynie potwierdzone punkty. Zastosuj późniejsze doprecyzowania o dowolnym koordynatorze, samodzielnym podłączaniu repozytoriów i referencji `docs/cosgral/referencja-interfejsu.png`.
2. Kontynuuj na podstawie rzeczywistego kodu i testów z gałęzi domyślnej; nie uznawaj wątku zadania Paperclip ani poniższych prób za gotowy produkt. Sprawdź najpierw stan Git, migracje i aktualne ograniczenia dostępu.
3. Najbliższy cel techniczny: pełny cykl bezpiecznego agenta i dostęp do API; następnie dwa osobne konta w `authenticated`, wspólny kanał, realtime, reconnect, trwałość i testy bezpieczeństwa. Stwórz docelowy widok w stylu referencji, bazując na rzeczywistych danych i istniejącym silniku, a nie na makiecie.
4. Dokończ możliwość wyboru koordynatora, rzeczywistą współpracę z wykonawcą, izolowane środowiska, konfigurację kont i narzędzi, tabelę oraz workflow. Wdrożenie i kompletny scenariusz odbioru pozostają w oryginalnym celu.

Wykonane w tej kontynuacji sprawdzenia: 2 testy integracyjne wspólnego wątku na PostgreSQL, 9 testów polityki wątku, 16 testów interfejsu projektu, test shima Windows i kontrola migracji. Końcowe sprawdzenie typów UI przeszło; sprawdzenie typów serwera przeszło na stanie sprzed ostatniego przeniesienia stałej do pakietu shared i należy je powtórzyć na finalnym commicie. Pełnych repozytoryjnych testów i builda nie wykonano. Globalna kontrola tokenów kończy się błędami istniejącymi także poza zmienionymi plikami. Test na żywym serwerze obejmował tylko jednego lokalnego operatora. Dane i logi testowe nie są w repozytorium.

## Repozytorium i decyzja

- Prywatne repozytorium: https://github.com/kacperkretowicz-wq/cosgral-workspace
- Gałąź domyślna: `codex/cosgral-workspace`. Dokumenty przekazania i ostatni commit należy sprawdzić na końcu tej gałęzi.
- Baza: Paperclip (MIT), commit upstream `dc9f387edceeb92ca94c9bac943871e190130383`. W klonie zachowano historię i zdalne `origin` do Paperclip; `cosgral` wskazuje prywatne repozytorium. Adaptacja nie jest forkiem GitHub oznaczonym jako fork.
- Dlaczego: Paperclip ma istniejące zadania, agentów, adaptery, historię, uprawnienia, budżety, zatwierdzenia, PostgreSQL i zdarzenia WebSocket. Nie trzeba budować drugiego silnika. Analiza innych kandydatów i mapa luk są w `COSGRAL-AUDYT.md`. To rozpoznanie wybranych fragmentów i dokumentacji, a nie wyczerpujący audyt wszystkich repozytoriów.
- Agor jest BSL 1.1 (source-available, ograniczenie komercjalizacji usługi); Wemux Community — Apache-2.0; Happy — MIT; Agent Teams AI — AGPL-3.0. Nie kopiowano kodu tych projektów do adaptacji. Licencje modułów, runtime’ów i zasobów należy nadal weryfikować przy dalszym wykorzystaniu.

## Decyzja użytkownika o koordynatorze

Claude nie jest obowiązkowy. Użytkownik chce sam wybierać kompatybilnego koordynatora, model i źródło dostępu; Claude → Codex był przykładem scenariusza, a nie sztywnym wymogiem. Test z Codexem nie oznacza, że jest wybrany jako docelowy koordynator. Nie kopiować poświadczeń pomiędzy użytkownikami ani nie korzystać z nieoficjalnych metod logowania.

## Co zostało zrobione w kodzie

- Utworzono prywatne repozytorium, zapisano audyt, mapę luk i dokumentację stanu.
- Naprawiono na Windows tworzenie dowiązań SDK pluginów: katalogowe junction zamiast wymagającego uprawnienia symlinku. Test skryptu: **7/7 przeszło**.
- Zastąpiono uniksowe polecenia kopiowania plików licencyjnych pakietu shared skryptem Node; `pnpm --filter @paperclipai/shared build` przeszedł.
- Dodano reguły LF dla bajtowo weryfikowanych plików runtime’u i generatorów. Kontrole profili ACPX i kontraktów protokołu przeszły po przywróceniu formatu upstream.
- W Vite dodano opcjonalne `PAPERCLIP_DEV_API_URL` dla osobnej instancji testowej. Sprawdzono, że proxy drugiego UI zwracało health z serwera w trybie `authenticated`; pełny test drugiej instancji nie został ukończony.
- W chwili poprzedniego przekazania nie istniał jeszcze wspólny kanał. W obecnej kontynuacji powstał jego częściowo przetestowany fundament opisany niżej. Docelowy interfejs COSGRAL, obecność/typing, graf workflow i integracja Netlify nadal nie są gotowe; oglądany interfejs bazuje na Paperclip upstream.

## Uruchomienie i stan lokalny

Klon: `C:\Users\kretowicz_k\Documents\Codex\2026-11-03\g\work\paperclip`. Dane pierwszej instancji: sąsiedni `work\cosgral-data`, poza repozytorium. Dodatkowa izolowana baza `cosgral_auth_test` znajduje się w tym samym lokalnym klastrze PostgreSQL, a jej katalog pomocniczy to `work\cosgral-auth-test`. Te dane nie zostały wypchnięte na GitHub.

Na komputerze użyto Node 24.18.0 i pnpm 9.15.4 przez Corepack; globalny Node 20 jest za stary dla tego commita. Instalacja po poprawce przeszła z ostrzeżeniami dotyczącymi binarek oczekujących na build. Przy starcie na Windows `corepack pnpm` był używany przez lokalny shim `work\bin\pnpm.cmd`, aby zagnieżdżone polecenia nie wybierały innej wersji pnpm.

Pierwszy automatyczny start embedded PostgreSQL utknął. Następnie uruchomiono ten sam lokalny klaster przez jego `pg_ctl`, wykonano **421 migracji**, zbudowano SDK i uruchomiono API bezpośrednio oraz Vite osobno. `GET /api/health` zwrócił `ok`; Chrome otworzył ekran projektu. Procedura jest diagnostyczna i wymaga dopracowania w powtarzalny instalator; standardowy `pnpm dev` nie został potwierdzony jako działający od początku do końca na tym Windows.

Testowy serwer działał na `127.0.0.1:3100`, UI na `127.0.0.1:5173`, w trybie `local_trusted`. Ten tryb jest dla jednego lokalnego operatora; nie należy wystawiać go do sieci. W momencie przekazania **serwery testowe, Vite i uruchomiony klaster PostgreSQL zostały zatrzymane**. Losowy sekret JWT użyty w drugim uruchomieniu był tylko w pamięci procesu i nie jest trwałą konfiguracją.

W lokalnej bazie utworzono organizację COSGRAL, projekt Uszko oraz rekordy agentów. Repozytorium Uszko nie zostało podłączone. Rekord „Claude — koordynator” jest nieukończoną próbą konfiguracji, nie decyzją o obowiązkowym modelu. Testowy koordynator Codex jest wstrzymany. Utworzone wyłącznie do testu zadania COS-1 i COS-2 ręcznie oznaczono jako zakończone po sprawdzeniu, a eksperymentalny COS-3 zawiera testowy komentarz. To dane testowe, nie rzeczywista realizacja pracy nad Uszkiem.

## Faktyczne testy i ich granice

- Test środowiska adaptera Codex wykrył istniejące lokalne logowanie i uzyskał od modelu odpowiedź `hello`.
- W zadaniu COS-1 prawdziwy agent Codex odpowiedział `4`. Nie zapisał poprawnie dyspozycji zakończenia przez API; Paperclip zaplanował ponowienie. Zadanie ręcznie zamknięto, agenta wstrzymano, zaplanowany retry został anulowany.
- Po restarcie aplikacji organizacja, projekt, agenci i zadanie nadal były widoczne. Pełnego testu trwałości całej historii po restarcie nie wykonano.
- Ponowienie z losowym sekretem JWT w procesie nie rozwiązało problemu dostępu agenta do lokalnego API. W COS-2 agent zgłosił brak połączenia i nie wykonał wymaganej aktualizacji; zadanie ręcznie zamknięto, agenta wstrzymano. Przyczyna wymaga diagnozy, nie należy zakładać, że sam JWT ją wyjaśnia.
- W dwóch kartach Chrome tego samego lokalnego użytkownika komentarz do COS-3 pojawił się w drugiej karcie bez odświeżania. To test istniejącego wątku zadania i transportu zdarzeń, **nie** test dwóch kont, pełnego projektu ani nowego wspólnego czatu.
- Osobną bazę zmigrowano do testu authenticated. Pierwsza próba rejestracji została odrzucona jako `INVALID_ORIGIN`, bo UI i API miały różne porty. Kolejny start z jawnymi adresami przerwano na prośbę użytkownika przed sprawdzeniem. Żadnego dwukontowego testu nie uznano za zaliczony.
- Wykryto, że upstream domyślnie może włączyć dla Codex local pomijanie sandboxa i zatwierdzeń. W dwóch lokalnych agentach testowych wyłączono tę opcję. Bezpieczna polityka dla wszystkich nowo tworzonych agentów nie została wdrożona ani sprawdzona.

## Gdzie przerwano i co dalej

Kontynuacja: Uszko jest przykładem projektu; podłączenie konkretnego repozytorium nie jest zadaniem wstępnym. Aplikacja ma umożliwić użytkownikowi samodzielne dodawanie projektów i repozytoriów. Wskazówki wizualne z referencji użytkownika i Happy Engineering dopisano do `COSGRAL-PROMPT-POSTEP.md`.

Analiza zachowanych logów testowych wykazała dwie różne obserwacje: PowerShell w pierwszym teście zgłosił błąd inicjalizacji dostawcy usług, a `curl` w drugim nie połączył się z `127.0.0.1:3100`. Same te komunikaty nie ustalają, czy przyczyną był sandbox, proces serwera, konfiguracja czy środowisko Windows. Należy sprawdzić dostępność API z hosta i z kontekstu agenta w tym samym czasie, bez wypisywania poświadczeń.

Pierwszy element interfejsu kontynuacji: na karcie zadań projektu dodano podsumowanie rzeczywiście dostępnych zadań według ich statusów, z zaznaczeniem ograniczeń widoczności i wyłączeniem anulowanych. Jest to liczba zadań, nie oszacowanie ukończenia całego projektu ani implementacja wspólnego chatu. Testy komponentu i ekranu projektu przeszły (14 przypadków), podobnie sprawdzenie typów UI po wygenerowaniu lokalnego katalogu Storybook. Nie wykonano jeszcze testu wizualnego w przeglądarce ani testu na działającym serwerze. Globalna kontrola tokenów zgłasza istniejące naruszenia w innych plikach repozytorium.

Kolejna próba uruchomienia wykorzystała nową bazę testową w `2026-11-03/pol/work/cosgral-dev`, nie poprzednią bazę. Migracje zakończyły się poprawnie; po ręcznym uruchomieniu testowego PostgreSQL przez `pg_ctl` dev runner zbudował natywnego runnera i pobrał określony w projekcie toolchain Rust. Aplikacja działała lokalnie na `127.0.0.1:3100` w trybie `local_trusted`; po sprawdzeniu serwer i baza tej instancji zostały zatrzymane. Trwałej konfiguracji JWT agentów nadal brak. Naprawiono też `scripts/dev-both.mjs`: na Windows uruchamia shim `.cmd`, a kod błędu podprocesu nie ginie przy szybkim zamknięciu; test z zastępczym poleceniem pnpm przeszedł. Nie jest to dowód, że pełny `dev:both` działa od początku do końca.

W toku: dodano tożsamość wspólnej rozmowy projektu i migrację `0423`, endpoint oraz wejście z projektu do istniejącego widoku wątku zadania. Ograniczenia bazy wiążą rozmowę z firmą i projektem, a tworzenie jest serializowane przez blokadę wiersza projektu. Kontrola migracji i test na PostgreSQL przeszły, w tym równoczesne tworzenie, zapis i odczyt komentarzy dwóch tożsamości, podstawowe uprawnienia członków prywatnego projektu, odmowa osobie bez dostępu oraz odmowa zapisu przez widza. Dodano ochronę przed zamknięciem, ukryciem i zmianą zakresu wątku; test bazodanowy oraz osobny test polityki przeszły. W lokalnej instancji Chrome otworzył wątek z projektu i wysłał wiadomość, której zapis potwierdzono przez API. To był jeden operator w `local_trusted`, nie test dwóch kont.

**Znane ograniczenie interfejsu:** rozmowa korzysta obecnie z ekranu zadania Paperclip, pokazuje m.in. „Message the agent”, „No assignee” i właściwości zadania. Nie oznacza to, że koordynator jest podłączony lub że jest to docelowy chat. Wątek wyłączono z głównych zapytań listy/licznika zadań oraz z listy projektu, ale w przetestowanym widoku nadal pojawiał się w historii ostatnich zadań; należy sprawdzić wszystkie pozostałe powierzchnie. Przed uznaniem funkcji za gotową trzeba zbudować właściwy widok rozmowy, przeprowadzić test dwóch niezależnych zalogowanych kont na żywo z rozłączeniem i restartem, a następnie podłączyć koordynatora i rzeczywiste delegowanie.

1. Zdiagnozować, dlaczego agent w bezpiecznej konfiguracji nie może wywołać lokalnego API i sam zakończyć zadania. Ograniczyć automatyczne ponowienia oraz wykonać test pełnego cyklu z faktyczną zmianą statusu, bez omijania uprawnień.
2. Dokończyć izolowany test `authenticated`: osobne konta, zaproszenie, uprawnienia projektu, dwa niezależne konteksty przeglądarki, komentarze i zmiany ustawień na żywo, reconnect i trwałość. Poprawnie ustawić publiczny adres auth i zaufane origins; nie używać `local_trusted` do współpracy zdalnej.
3. Dokończyć i zweryfikować wspólną rozmowę: fundament atomowego powiązania i endpoint są w kodzie; sprawdzić wszystkie mutacje i miejsca prezentacji wątku, pełny dostęp dwóch kont, synchroniczne wyświetlanie komentarzy, reconnect i restart. Istniejące klucze idempotencji tworzenia zadań mają ograniczoną retencję i nie zapewniają trwałej tożsamości jednego kanału. Eksperymentalny COS-3 z poprzedniej instancji nie jest nowym kanałem.
4. Zbudować interfejs COSGRAL na rzeczywistych danych: projekty, centralna rozmowa, wybór koordynatora i agenta, zadania oraz zwijany panel. Zachować istniejące funkcje w sekcji zaawansowanej. Dodać rzeczywiste stany błędów, obecność i pisanie dopiero po zapewnieniu kontroli dostępu.
5. Wdrożyć bezpieczne domyślne uprawnienia i izolowane worktrees, następnie sprawdzić rzeczywiste delegowanie między wybranym koordynatorem a wykonawcą, model/konto dla każdego oraz budżety i zatwierdzenia.
6. Dodać tabelę i workflow na tych samych danych, integracje właściwe dla poszczególnych runtime’ów, trwałą konfigurację i instrukcje. Zrealizować pełny test dwóch użytkowników i restartu oraz konfigurację hostingu dopiero po przejściu kontroli bezpieczeństwa.

Oryginalny prompt z przekreśleniem tylko potwierdzonych punktów znajduje się w `COSGRAL-PROMPT-POSTEP.md`. Pełna lista warunków w nim pozostaje obowiązująca z aktualizacją wyboru dowolnego koordynatora i samodzielnego podłączania repozytoriów. Referencja wyglądu znajduje się w `docs/cosgral/referencja-interfejsu.png`. Następny agent powinien kontynuować realizację całego celu, a nie traktować obecnego testowego wątku jako ukończonego produktu.
