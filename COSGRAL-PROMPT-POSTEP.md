# Prompt celu — stan na 3 listopada 2026

Przekreślenie oznacza element faktycznie wykonany w obecnym zakresie. Niezaznaczone punkty pozostają otwarte, również wtedy, gdy rozpoczęto ich część.

- Mapa jest krótkim audytem i wymaga dalszego pogłębienia przed produkcją.
- Repozytorium jest prywatną adaptacją Paperclip, z zachowaną historią upstream.
- Projekt Uszko został utworzony wyłącznie w lokalnej testowej bazie; nie podłączono jego repozytorium.
- Aktualizacja użytkownika: koordynatorem nie musi być Claude; użytkownik wybiera kompatybilnego agenta, model i dostępne źródło uwierzytelnienia. Oryginalnego przykładu nie zmieniano.
- Aktualizacja użytkownika z 3 listopada: Uszko jest przykładowym projektem; użytkownik ma móc sam podłączyć wybrane repozytorium w aplikacji. Nie jest wymagane podłączenie Uszka podczas budowy Workspace.
- Kierunek wizualny: [załączona przez użytkownika referencja](docs/cosgral/referencja-interfejsu.png) WorkHub pokazuje ciemny, uporządkowany interfejs z boczną hierarchią koordynatora i agentów, centralną rozmową oraz czytelnymi, osadzonymi w niej zestawieniami delegowania i postępu. To inspiracja do adaptacji, nie wymóg kopiowania marki ani fikcyjnych danych. Zachować również wymagania jasnego motywu, dostępności i układu mobilnego.
- Dodatkowa inspiracja: [Happy Engineering](https://happy.engineering/welcome/) — trwałe sesje, czytelna konfiguracja modeli i agentów, odrębne worktree dla pracy równoległej oraz wspólna praca nad sesją. Deklarowane funkcje Happy nie są dowodem działania tych funkcji w COSGRAL; zgodność integracji i bezpieczeństwo wymagają osobnej weryfikacji. Paperclip pozostaje wybraną bazą.
- Kontynuacja: działa sprawdzony na poziomie API fundament jednego wątku projektu, ale pełna synchronizacja dwóch zalogowanych przeglądarek, koordynator, delegowanie i docelowy interfejs pozostają otwarte. Szczegóły i zakres dowodów są w `COSGRAL-PRZEKAZANIE.md`.

---

# ZADANIE: Zbuduj COSGRAL Workspace — prywatny, wieloosobowy orkiestrator agentów AI

## 1. Twoja rola i główny cel

Jesteś głównym architektem, doświadczonym full-stack developerem, specjalistą od systemów multi-agent i projektantem UX/UI.

Twoim zadaniem jest **stworzenie rzeczywiście działającej aplikacji webowej COSGRAL Workspace**, która łączy:

- Prostotę i elegancję interfejsu OpenAI Codex.
- Wspólną komunikację zespołową znaną ze Slacka.
- Zaawansowaną orkiestrację agentów podobną do Paperclip.
- Współpracę na żywo, jak w nowoczesnych edytorach multiplayer.
- Swobodę konfigurowania modeli, subskrypcji, API, CLI, MCP, skilli i pluginów.

Aplikacja jest przeznaczona początkowo dla dwóch osób pracujących wspólnie nad projektami programistycznymi, m.in. aplikacją mobilną Uszko.

**Najważniejsza zasada: wykorzystuj maksymalnie dużo istniejącego, sprawdzonego oprogramowania open source. Nie twórz od zera funkcjonalności, które można rozsądnie wykorzystać, rozszerzyć lub zaadaptować z istniejących projektów.**

Nie oczekuję samej koncepcji, makiety ani raportu. Masz przygotować i uruchomić działające oprogramowanie.

## 2. Najpierw przeanalizuj istniejące repozytoria

Zanim zaczniesz programować, sprawdź aktualny kod, dokumentację, architekturę, licencje oraz dostępne funkcjonalności tych projektów:

**Główni kandydaci:**

1. Paperclip — https://github.com/paperclipai/paperclip
2. Agor — https://github.com/preset-io/agor
3. Wemux — https://github.com/wemux-ai/wemux
4. Happy — https://github.com/slopus/happy
5. Agent Teams AI — https://github.com/777genius/agent-teams-ai

Możesz wyszukiwać również nowsze lub lepiej dopasowane rozwiązania na GitHubie.

Przeanalizuj szczególnie:
- Systemy delegowania i orkiestracji.
- Implementacje wspólnego chatu i synchronizacji na żywo.
- Silniki uruchamiania agentów przez CLI i API.
- Obsługę wielu użytkowników i dostawców.
- Komunikację agent–agent.
- Przechowywanie historii i kontekstu projektu.
- Biblioteki agentów, MCP, pluginów i skilli.
- Możliwości modyfikowania istniejącego interfejsu.
- Licencje i ograniczenia wykorzystywania kodu.

**Preferowana baza: Paperclip**, ponieważ oferuje gotową orkiestrację i mechanizmy zarządzania agentami. Nie traktuj jednak tego wyboru jako bezwzględnego.

Jeżeli inny projekt pozwoli osiągnąć cel szybciej, prościej i stabilniej, wybierz go i uzasadnij decyzję.

Nie łącz całych repozytoriów mechanicznie. Wybierz jeden główny silnik, a pozostałe traktuj jako inspirację lub źródło kompatybilnych, prawnie dopuszczalnych komponentów.

Sprawdź licencje poszczególnych modułów, zachowaj wymagane informacje o autorach. Nie kopiuj zamkniętych elementów ani zasobów objętych licencją, która nie pozwala na planowany sposób wykorzystania.

**Priorytet: minimum nowego kodu, maksimum istniejących i stabilnych funkcji.**

## 3. Projekt interfejsu — Slack × Codex

Interfejs ma wyglądać nowocześnie, minimalistycznie i bardzo profesjonalnie.

Inspiracje:
- Codex — wygląd chatu, typografia, przejrzystość, organizacja projektów.
- Slack — komunikacja, użytkownicy online, kanały, obecność, współdzielone rozmowy.
- Linear — tabele, statusy, zadania, precyzja układu.
- Agor — współpraca i interakcje na żywo.

Nie kopiuj dosłownie identyfikacji wizualnej żadnej marki. Stwórz własny, spójny design system.

### Domyślny ekran

Po wejściu użytkownik widzi:

**Lewy sidebar:**
- Lista projektów.
- Przełączanie między projektami.
- Historia rozmów.
- Lista dostępnych agentów.
- Aktualny koordynator projektu.
- Ustawienia i integracje.

**Środkowa, największa część:**
- Główny wspólny chat.
- Wiadomości obu użytkowników.
- Odpowiedzi koordynatora.
- Wiadomości i raporty agentów.
- Wpisy o delegowaniu zadań i ich zakończeniu.
- Pole tekstowe z obsługą @agentów oraz załączników.
- Możliwość bezpośredniego zwrócenia się do agenta lub całego zespołu.

**Prawy panel, domyślnie zwinięty:**
- Aktywni agenci.
- Aktualne zadania.
- Postęp i statusy.
- Obecni użytkownicy.
- Szybkie akcje.

Nie przeładowuj interfejsu. Większość funkcji powinna być schowana w dobrze zaprojektowanych panelach.

Dopracuj:
- Typografię i hierarchię informacji.
- Odstępy, wyrównanie i proporcje.
- Ikony oraz stany hover/focus.
- Responsywność.
- Motyw ciemny i jasny.
- Płynne, dyskretne animacje.
- Wydajność przy długiej historii rozmów.

Nie chcę futurystycznego dashboardu pełnego świecących gradientów i niepotrzebnych kart. Ma być elegancko, funkcjonalnie i premium.

## 4. Wspólna praca dwóch użytkowników na żywo

To jedna z najważniejszych funkcji całej aplikacji.

Dwóch użytkowników może jednocześnie wejść do tego samego projektu z różnych komputerów.

Obaj muszą widzieć **jedną rzeczywistą, zsynchronizowaną rozmowę**, a nie dwie osobne kopie.

Wymagania:

- ~~Każdy użytkownik ma swoje konto i profil.~~
- ~~Dostęp do projektów przez zaproszenie.~~
- ~~Pokazywanie, kto aktualnie jest online.~~
- Awatary użytkowników obecnych w projekcie.
- ~~Informacja, kto aktualnie pisze.~~
- ~~Nowe wiadomości pojawiają się natychmiast u obu osób.~~
- Zmiany ustawień agentów są synchronizowane.
- Gdy jeden użytkownik dodaje agenta, drugi widzi go na żywo.
- Wszyscy widzą te same zadania, raporty i działania agentów.
- Można przeglądać tę samą sesję równocześnie.
- Na wspólnych tablicach można pokazywać kursory uczestników.
- Opcjonalny tryb „Obserwuj użytkownika” pokazuje, którą sekcję ogląda i gdzie klika.

Istotny szczegół UX: użytkownicy powinni widzieć nawzajem swoje działania, ale bez wymuszania identycznej nawigacji. Kliknięcie wykonane przez jedną osobę nie powinno automatycznie przełączać ekranu drugiej, chyba że ta włączy świadomie tryb obserwacji.

Zastosuj właściwą architekturę realtime, np. WebSocket lub kompatybilną usługę synchronizacji. Zadbaj o kolejność zdarzeń, odtwarzanie historii po rozłączeniu oraz kontrolę równoczesnych edycji.

## 5. Inteligentny koordynator agentów

Każdy projekt ma możliwość przypisania stałego koordynatora.

Koordynatorem może być dowolny kompatybilny agent, np. Claude Opus, Codex albo wybrany model API.

Koordynator:
1. Odbiera wiadomości od użytkowników.
2. Analizuje projekt i jego instrukcje.
3. ~~Sprawdza dostępnych agentów oraz ich konfiguracje.~~
4. ~~Dobiera wykonawców do zadań.~~
5. Rozdziela zadania, również równolegle.
6. Nadzoruje przebieg pracy.
7. Koordynuje wymianę informacji między agentami.
8. Zleca dodatkowe audyty lub poprawki.
9. Zbiera wyniki i raportuje postęp.
10. ~~Prosi o zatwierdzenie działań wymagających decyzji człowieka.~~

Stan t13 (4 XI 2026): pkt 3, 4 i 10 przekreślone po żywym e2e na koncie a
(`scripts/cosgral-e2e-approval.mjs`, log `e2e-approval-a1.log`: PASS A/B/C — dobór
wykonawcy z uzasadnieniem, karta zatwierdzenia human-only, akceptacja → worker →
raport, odrzucenie bez zadania i bez retry) oraz testy serwer 126 / UI 27 / skrypt 27.
Szczegóły: `COSGRAL-PRZEKAZANIE.md`, Codex #13 i „Nadzorca – po Codex t13”.

Przykład polecenia:

„Opus, sprawdź aktualny stan Uszka, znajdź najważniejsze problemy, dobierz odpowiednie modele i rozdziel pracę. Działajcie równolegle i przygotujcie poprawki”.

Koordynator nie powinien automatycznie używać najmocniejszego modelu do wszystkiego.

Powinien brać pod uwagę:
- Rodzaj zadania.
- Kompetencje i dostępne narzędzia agenta.
- Koszt API.
- Dostępne subskrypcje i ich limity, o ile można je wiarygodnie odczytać.
- Aktualne obciążenie agenta.
- Dostępność konkretnego środowiska wykonawczego.
- Możliwość równoległej pracy.
- Priorytet szybkości, kosztu lub jakości.

Nie zakładaj nieistniejących danych o limitach. Jeżeli nie można sprawdzić dostępnego limitu, pokaż to w UI i zastosuj bezpieczną strategię wyboru.

Użytkownik musi mieć możliwość nadpisania każdej decyzji koordynatora.

## 6. Agenci i ich indywidualne konfiguracje

Każdy agent jest samodzielnie konfigurowalnym członkiem zespołu.

Panel pojedynczego agenta powinien umożliwiać:

**Tożsamość:**
- Nazwa.
- Awatar.
- Opis.
- Rola i specjalizacja.
- Koordynator, któremu podlega.

**Model i wykonanie:**
- Dostawca modelu.
- Konkretny model.
- Źródło dostępu: subskrypcja, CLI lub API.
- Konto właściciela.
- Ustawienia rozumowania, jeżeli dostępne.
- Możliwość zmiany modelu przed kolejnym zadaniem.
- Własne instrukcje systemowe i projektowe.

**Narzędzia:**
- MCP.
- CLI.
- Skille.
- Pluginy.
- Dostęp do repozytorium.
- Narzędzia terminalowe.
- Integracje z zewnętrznymi usługami.

**Zarządzanie:**
- Dostępne uprawnienia.
- Maksymalna liczba jednoczesnych zadań.
- Budżet i ograniczenia kosztów.
- Historia pracy.
- Raporty i audyty.
- Liczba wykonanych zadań.
- Ostatnie błędy.
- Stan: dostępny, pracuje, oczekuje, offline, błąd.

Obsługa narzędzi ma być dostosowana do rzeczywistych możliwości danego runtime'u. Nie udawaj, że każda integracja MCP, skill albo plugin działa identycznie z każdym dostawcą.

Przygotuj możliwość zapisania konfiguracji agenta jako szablonu i późniejszego użycia jej w innym projekcie.

## 7. Integracje modeli i subskrypcji

System ma obsługiwać dwa główne sposoby korzystania z modeli.

**A. Logowanie istniejącą subskrypcją**, gdy jest oficjalnie wspierane przez dany runtime i zgodne z warunkami dostawcy.

Przykładowe narzędzia do zbadania:
- Claude Code.
- Codex CLI.
- Cursor CLI.
- Grok CLI.
- Gemini / Antigravity.
- Inne dostępne narzędzia agentowe.

**B. Połączenia przez API**, np.:
- OpenAI.
- Anthropic.
- Google.
- xAI.
- OpenRouter.
- Inne kompatybilne usługi.

Możliwość dodania wielu kont tego samego dostawcy, jeżeli pozwala na to dostawca i sposób uwierzytelnienia.

Każdy użytkownik powinien móc dodawać własne konta i określać, czy dany agent jest prywatny, czy udostępniony w projekcie.

Nie przenoś haseł, tokenów sesyjnych ani kluczy API między użytkownikami. Poświadczenia muszą pozostawać w odpowiednio zabezpieczonym środowisku właściciela lub obsługiwanym magazynie sekretów.

Nie implementuj mechanizmów omijających limity, zasady uwierzytelniania ani zabezpieczenia dostawców.

Przy każdym połączeniu pokazuj czytelny stan: dostępny, niepołączony, limit, błąd, wymaga logowania.

## 8. Wspólny chat oraz komunikacja między agentami

Główny chat powinien być centrum całej aplikacji.

W jednej chronologicznej historii pokazuj:

- Wiadomości ludzi.
- Odpowiedzi koordynatora.
- Delegowanie zadań.
- ~~Wiadomości agentów między sobą.~~
- Aktualizacje postępu.
- Błędy.
- Wyniki audytów.
- Decyzje wymagające zatwierdzenia.
- Zakończone zadania i podsumowania.

Przykładowy przebieg:

**Użytkownik:** „Sprawdźcie jakość generowania głosu w Uszku”.

**Opus:** „Przydzielam analizę modelu TTS Codexowi, a ocenę architektury drugiemu agentowi”.

**Codex:** „Zidentyfikowałem problem z kolejką generowania”.

**Agent audytujący → Codex:** „Sprawdź także obsługę błędów GPU”.

**Codex:** „Wprowadzam poprawkę”.

**Opus:** „Otrzymałem oba raporty. Przechodzę do końcowej weryfikacji”.

Każdą wiadomość agenta można rozwinąć, aby zobaczyć więcej szczegółów.

Dodaj filtry:
- ~~Wszystkie wiadomości.~~
- ~~Tylko ludzie.~~
- ~~Koordynator.~~
- ~~Komunikacja agentów.~~
- ~~Zadania.~~
- ~~Błędy i audyty.~~

Domyślnie chat musi być czytelny, a nie przypominać surowego logu terminala.

Stan t14 (4 XI 2026): przekreślone filtry i wiadomości agent–agent po żywym e2e (`scripts/cosgral-e2e-messages.mjs`, log `e2e-messages-t14.log` PASS). Pozostałe punkty listy (delegowanie, postęp, audyty, zatwierdzenia w jednej historii) tylko częściowo potwierdzone.

## 9. Trzy widoki tej samej pracy

Użytkownik przełącza widok bez utraty kontekstu.

### Chat — widok domyślny

Najprostszy i najważniejszy ekran, inspirowany Codexem i Slackiem.

### Tabela — zarządzanie

Tabela przedstawia:
- Nazwę zadania.
- Przypisanego agenta.
- Model.
- Konto lub źródło dostępu.
- Status.
- Priorytet.
- Zależności.
- Postęp.
- Koszt, jeżeli dostępny.
- Wynik.

Dodaj filtrowanie, sortowanie i możliwość przejścia od zadania bezpośrednio do odpowiedniego fragmentu chatu.

### Workflow — wizualizacja

Interaktywny graf pokazujący:
- Koordynatora.
- Pozostałych agentów.
- Zadania.
- Zależności.
- Kierunki delegowania.
- Komunikację między agentami.
- Aktualne statusy.

Gdy agent wysyła wiadomość do innego agenta, odpowiednie połączenie może subtelnie się animować.

Wizualizacja ma być przydatna, a nie tylko dekoracyjna. Można kliknąć agenta i otworzyć jego informacje, bieżące zadanie lub rozmowę.

Wszystkie trzy widoki korzystają z tego samego źródła danych.

## 10. Pamięć projektu i praca z kodem

Każdy projekt posiada:
- Własne repozytorium GitHub.
- Konfigurację koordynatora.
- Agentów.
- Historia rozmów i decyzji.
- Instrukcje projektowe.
- Dokumentację.
- Audyty.
- Plany i zadania.
- Udostępnione skille.
- Powiązane integracje.

Projekt nie traci wiedzy po zamknięciu przeglądarki czy restarcie agenta.

Wykorzystaj istniejące mechanizmy pamięci, historii, resumowania sesji i trwałych zadań z wybranego silnika. Tam, gdzie potrzeba, dodaj uporządkowaną bazę wiedzy projektu.

Agenci programujący powinni pracować w izolowanych Git worktrees lub gałęziach, a ich zmiany powinny podlegać przeglądowi przed scaleniem.

Nie pozwalaj niezależnym agentom nadpisywać jednocześnie tego samego katalogu roboczego bez kontroli konfliktów.

## 11. Hosting i architektura

Aplikacja ma być dostępna przez przeglądarkę na komputerze obu użytkowników.

Preferowany układ:
- Frontend React / TypeScript — Netlify.
- Backend orkiestracji — działający stale serwer.
- Baza danych — trwała, odpowiednia dla wielu użytkowników.
- Realtime — WebSocket lub kompatybilne rozwiązanie.
- GitHub — przechowywanie kodu projektów.
- Agenty CLI — środowiska wykonawcze, lokalne lub zdalne.
- NoMac — opcjonalny runner macOS do operacji związanych z Xcode.

Rozważ wykorzystanie już istniejących API, serwera, bazy danych, autoryzacji i mechanizmów zdarzeń wybranego projektu.

**Nie przepisuj backendu Paperclip tylko dlatego, że tworzysz nowy frontend.**

Jeśli istniejąca aplikacja wspiera odpowiednie rozszerzenia, pluginy lub łatwe modyfikacje, rozważ zmianę wyglądu w jej obecnym frontendzie zamiast budowy całkowicie nowego klienta.

Netlify ma hostować interfejs. Nie próbuj uruchamiać wielogodzinnych procesów CLI w funkcjach serverless.

Zadbaj o bezpieczeństwo dostępu z internetu: autoryzację, role, szyfrowanie sekretów, uprawnienia do projektów, weryfikację zdarzeń realtime i zabezpieczenia narzędzi wykonywanych przez agentów.

Operacje takie jak merge do głównej gałęzi, deploy produkcyjny, usuwanie danych, instalowanie niezweryfikowanego oprogramowania czy przekroczenie budżetu API powinny wymagać odpowiednich uprawnień lub zatwierdzenia.

## 12. Personalizacja

Dodaj prosty panel personalizacji:
- Zmiana nazwy i awatara każdego agenta.
- Możliwość tworzenia własnych ról.
- Motyw jasny/ciemny.
- Zmiana akcentu kolorystycznego.
- Regulacja szerokości paneli.
- Zapamiętywanie układu.
- Konfiguracja widoków.
- Własne instrukcje globalne i projektowe.

Projekt powinien mieć spójny charakter wizualny COSGRAL.

Nie twórz przesadnie rozbudowanego kreatora wyglądu. Wystarczy kilka użytecznych ustawień.

## 13. Kolejność realizacji

### Etap 1 — audyt i wybór istniejącego silnika

Przeanalizuj wskazane repozytoria, wskaż funkcje możliwe do bezpośredniego wykorzystania, sprawdź licencje i wybierz najkorzystniejszą bazę.

~~Przygotuj krótką mapę:~~
~~- Gotowe i do wykorzystania.~~
~~- Wymagające konfiguracji.~~
~~- Wymagające adaptacji.~~
~~- Niezbędne do dopisania.~~

Nie kończ pracy na tym etapie — przejdź do implementacji.

### Etap 2 — działająca baza

Uruchom wybrany silnik, bazę danych i istniejące integracje.

~~Przygotuj prywatne repozytorium projektu COSGRAL Workspace, najlepiej jako fork lub odpowiednio uporządkowaną adaptację projektu bazowego.~~

Nie nadpisuj istniejących produkcyjnych projektów użytkownika.

### Etap 3 — nowy interfejs

Dostosuj lub wymień frontend, zachowując istniejący silnik.

Najpierw uruchom prosty chat, wybór projektu, koordynatora i widok zadań.

### Etap 4 — multiplayer

Dodaj dwa konta użytkowników, wspólny projekt i pełną synchronizację wiadomości, aktywności i statusów.

### Etap 5 — orkiestracja

Podłącz rzeczywistych agentów i uruchom delegowanie, komunikację między nimi, audyty oraz zarządzanie modelem każdego agenta.

### Etap 6 — konfiguracje i widok workflow

Dodaj panele agentów, MCP, skille, dostępne pluginy, opcje API/CLI oraz wizualizację przepływu pracy.

### Etap 7 — testy i wdrożenie

Przeprowadź testy end-to-end i wdroż aplikację w dostępnej infrastrukturze. Jeśli nie ma dostępu do kont hostingowych, przygotuj działającą wersję lokalną oraz konfigurację do wdrożenia, zamiast udawać, że aplikacja już działa online.

## 14. Kryteria ukończenia

Nie uznawaj projektu za gotowy, dopóki nie uda się przetestować następującego scenariusza:

1. ~~Pierwszy użytkownik loguje się do COSGRAL Workspace.~~
2. Tworzy lub otwiera projekt, a wybrane repozytorium może samodzielnie podłączyć w aplikacji. (Wcześniej utworzono jedynie testowy projekt Uszko; pełnego procesu podłączania repozytorium nie zweryfikowano.)
3. Wybiera kompatybilnego koordynatora, model i dostępne źródło uwierzytelnienia (Claude był tylko przykładem).
4. Podłącza działającego agenta Codex.
5. ~~Zaprasza drugiego użytkownika.~~
6. ~~Drugi użytkownik wchodzi do tego samego projektu.~~
7. ~~Obaj widzą swoją obecność i wspólną historię chatu.~~
8. ~~Pierwszy użytkownik zleca koordynatorowi wykonanie zadania.~~
9. ~~Koordynator przekazuje część pracy do Codexa.~~
10. ~~Codex wykonuje zadanie i raportuje wynik.~~
11. Komunikaty koordynatora i Codexa pojawiają się u obu użytkowników bez odświeżania.
12. Drugi użytkownik zmienia dozwoloną konfigurację agenta.
13. Pierwszy użytkownik widzi tę zmianę na żywo.
14. W tabeli aktualizuje się status zadania.
15. W wizualizacji widać rzeczywiste delegowanie i komunikację.
16. Po ponownym uruchomieniu aplikacji historia, zadania i konfiguracje nadal istnieją.

Rozróżniaj testy symulowane od rzeczywistych połączeń z modelami. Nie oznaczaj integracji jako ukończonych, jeśli działają jedynie na danych demonstracyjnych.

## 15. Zasady, których musisz przestrzegać

- Nie twórz projektu od zera, jeśli istniejący silnik spełnia większość wymagań.
- Nie buduj drugiego orkiestratora wewnątrz już istniejącego.
- Nie dubluj mechanizmów zarządzania zadaniami, agentami i sesjami.
- Nie twórz wyłącznie pięknego dashboardu bez prawdziwej funkcjonalności.
- Nie dodawaj elementów UI, które wyglądają na aktywne, ale niczego nie robią.
- Nie komplikuj konfiguracji osobom korzystającym z aplikacji.
- Nie poświęcaj stabilności dla animacji lub efektów wizualnych.
- Nie zakładaj, że nieoficjalne metody subskrypcyjnego logowania są dozwolone.
- Nie narażaj prywatnych tokenów i repozytoriów na wyciek.
- Korzystaj z istniejących bibliotek, komponentów i sprawdzonych wzorców.
- Dąż do jak najniższego kosztu utrzymania.
- Zachowaj możliwość aktualizacji silnika bazowego z upstream.
- Nie usuwaj działających funkcji bazowego projektu tylko dlatego, że nie mieszczą się w podstawowym interfejsie — można je ukryć w sekcji zaawansowanej.

## 16. Co masz dostarczyć

Oczekuję:

1. Krótkiego uzasadnienia wyboru silnika i komponentów.
2. Działającego kodu źródłowego.
3. Dopracowanego interfejsu w stylu Slack × Codex.
4. Funkcjonalnego współdzielonego chatu.
5. Działającego koordynatora i przynajmniej jednego wykonawcy.
6. Konfiguracji agentów i integracji.
7. Synchronizacji dwóch użytkowników w czasie rzeczywistym.
8. Wersji z tabelą i opcjonalnym workflow.
9. Instrukcji uruchomienia i wdrożenia.
10. Wyników testów oraz listy funkcji już działających i wymagających dalszego rozwinięcia.

Pracuj iteracyjnie, uruchamiaj projekt, testuj zmiany i sprawdzaj je w przeglądarce.

Jeżeli jakaś funkcja wymaga dodatkowych prac, wyraźnie to zaznacz i kontynuuj pozostałe możliwe zadania.

**Ostateczny cel: stworzyć nasz prywatny, wspólny COSGRAL Workspace, który wygląda tak prosto jak Codex i Slack, ale wykorzystuje możliwości prawdziwego wieloagentowego orkiestratora. Ma być narzędziem do codziennej pracy, a nie eksperymentalną demonstracją.**

Podejmuj samodzielnie rozsądne decyzje architektoniczne, szukaj szybszych i lepszych rozwiązań, wykorzystuj dostępny kod open source i minimalizuj niepotrzebną pracę.

**Rozpocznij od analizy rzeczywistego kodu repozytoriów, następnie przejdź bezpośrednio do budowy pierwszej działającej wersji.**
