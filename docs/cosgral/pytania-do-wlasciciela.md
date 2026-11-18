# Pytania do właściciela: co robimy dalej (z kosztem)

Stan: 18.11.2026. Parytet kodowy 75% (ostrożnie 56,9%, w oknie 45,1%). Godziny to moja ocena (kontrakt + silnik + ekran + testy na atrapach), nie pomiar. Szczegóły i powody: `docs/cosgral/parytet-0.71.md` → „Decyzje” oraz `luki-silnika-071.md`.


## Stan na 18.11.2026 (KK-AJ): co zamknięte, co czeka na właściciela

**Wynik:** z pięciu pytań **dwa są zamknięte** (2 i 3, część „klucz API”), **trzy czekają na decyzję właściciela** (1, 4, 5). Do właściciela trafia tylko to, czego nie da się zamknąć bez niego.

| # | Pytanie | Stan | Dowód | Co dalej |
|---|---|---|---|---|
| 1 | Discord | **Czeka na właściciela.** Nic w kodzie; `MESSENGER_KINDS` = telegram, slack | `ipc-messengers.ts:22` | Decyzja dopiero po obejrzeniu Telegrama i Slacka w oknie (ok. 9 h silnik + 3 h ekran) |
| 2 | Rutyny kanału | **Zamknięte.** Silnik, ekran „Routines” w kanale, testy; webhook rutyny kanału poza zakresem (0.71 go nie opisuje) | `ChannelRoutinesPanel.tsx`, PRZEWODNIK 5a „Rutyny kanału” | Nic, chyba że właściciel poprosi o webhook |
| 3 | Inni dostawcy | **Część „klucz API” zamknięta.** Rząd „Use …” w „Own model endpoints” (OpenRouter, xAI, DeepSeek, Mistral, Groq, Together AI, Moonshot). Tylko czat, bez narzędzi programu | `EndpointsSection.tsx` (`ENDPOINT_CLOUD_PRESETS`), PRZEWODNIK 5a „Presety dostawców” | Sterowniki CLI (Cursor, Grok CLI, Devin) czekają na zgodę właściciela na pobieranie |
| 4 | LLM i Asset w przepływach | **Czeka na właściciela, ale bez pilności.** Doszły węzły `prompt` i `condition` (UI-AK), nie ma `llm` ani `asset`; obejście: węzeł „agent” bez narzędzi | `ipc-workflows.ts:51` | LLM (ok. 5 h) po obejrzeniu edytora w oknie |
| 5 | Skill z linku GitHub | **Czeka na właściciela.** Jest czytanie i sprawdzanie linku, brak pobierania i instalacji | `ipc-skill-link.ts` | Tylko po wyraźnym „tak” (cudzy kod, karta zgody z pełnym `SKILL.md`) |

**Nie sprawdzone przeze mnie:** żadnej z tych funkcji nie widziałem w oknie (dokument i kod). Koszty godzinowe są cudzymi szacunkami z tego pliku.
## Wynik w jednej linii

**Pięć decyzji, razem ok. 47 godzin pracy. Moja rada: Tak dla „Rutyn kanału” i „LLM w przepływach”, Nie dla Discorda i sterowników innych dostawców, dopóki nie obejrzymy w oknie tego, co już mamy.**

| # | Pytanie | Koszt | Co zyskujesz | Ryzyko | Moja rada |
|---|---|---|---|---|---|
| 1 | **Discord** (tylko rozmowy prywatne, jak Telegram i Slack)? | ok. 9 h silnik + ok. 3 h ekran | Trzeci komunikator; +0,7 pp parytetu (+1,4 pp z ekranem) | Prawdziwy test wymaga tokenu bota Discorda; bez niego tylko testy na atrapie | **Nie teraz.** Najpierw obejrzyj w oknie Telegram i Slack; jeśli ich używasz, Discord dołożymy w jeden dzień |
| 2 | **Rutyny kanału** (zadanie cykliczne dla całego zespołu, nie tylko jednego agenta)? | ok. 6 h | Kanał sam startuje pracę o stałej porze; +0,7 pp | Lekkie; dotyka silnika kanałów | **Tak, jeśli pracujesz kanałami.** Rutyny pojedynczego agenta już działają |
| 3 | **Sterowniki innych dostawców** (Grok, Cursor, OpenRouter…)? | ok. 8 h na jednego dostawcę | Więcej modeli bez ACP; +0,7 pp | Ciężkie: potrzebne ich narzędzia CLI, a polecenia nie są zweryfikowane; pobieranie CLI wymaga Twojej zgody | **Nie bez Twojej zgody na pobranie CLI.** Katalog 18 dostawców i klucze już są |
| 4 | **LLM i Asset w przepływach** (krok „zapytaj model”, krok z plikiem) i adnotacje na płótnie? | ok. 13 h (5 + 5 + 3) | Przepływy zbliżone do 0.71; +1,4 pp | Lekkie; edytor Workflows musi być najpierw zrobiony (robi UI Designer) | **Tak, ale po edytorze.** LLM najpierw (5 h) |
| 5 | **Instalacja skilla z linku GitHub** w Marketplace? | ok. 8 h | Własne skille z internetu | Ściąga cudzy kod: każdy skill wymaga przeglądu; tylko z kartą zgody | **Nie.** Katalog własny ma już 14 skilli i 9 agentów |

Do tego kategorycznie poza zakresem (decyzja jest, nie pytam): stały link do parowania telefonu, trasa przez chmurę, zdalny pulpit bez nadzoru, Image/Video w przepływach (12 h+ każde, ciężkie).

## Co silnik zrobił już BEZ Twojej decyzji (Backend, 18.11.2026, BE-Q)

Tylko rzeczy małe, bezpieczne i nic nie uruchamiające; reszta czeka na Twoje „tak”. Gałąź `team/backend/w12-q`. Kontrakty i testy napisane w cichym oknie (nie uruchomione, patrz niżej).

| # | Pytanie | Zrobione bez decyzji | Zostaje po „tak” |
|---|---|---|---|
| 1 | Discord | Nic w kodzie: dodanie rodzaju „discord” ruszyłoby `messengers.*` i ekran Komunikatorów, więc to już jest część decyzji | ok. 9 h: deskryptor (token bota, kroki w portalu deweloperskim, uprawnienie do treści wiadomości), atrapa, silnik rozmów prywatnych; prawdziwy test potrzebuje tokenu bota |
| 2 | Rutyny kanału | **Reguły** (`ipc-channel-routines.ts`): kto i co może: kanał istnieje, nie jest zarchiwizowany, ma lidera; limit 16 rutyn na kanał; nazwa i instrukcja; harmonogram jak u rutyn agenta (interwał, codziennie, cron); tekst wiadomości biegu „Scheduled: <nazwa>”. Test: 5 przypadków | ok. 5 h: tabela rutyn kanału, start (wiadomość do kanału jako osoba → zadanie lidera) i śledzenie zadania jako wyniku biegu, IPC, atrapa, wybór kanału w ekranie rutyn |
| 3 | Sterowniki innych dostawców | **Grok (xAI) i OpenRouter działają już bez CLI**, jako własne punkty końcowe z kluczem API. Dodane gotowe ustawienia `ENDPOINT_CLOUD_PRESETS` (OpenRouter `https://openrouter.ai/api/v1`, xAI `https://api.x.ai/v1`), które tylko wypełniają formularz i **nie** są sprawdzane przy starcie (inaczej niż Ollama i LM Studio). Modele wychodzą jako `endpoint:<id>/<model>`, tylko czat. Test: 1 | UI: drugi rząd przycisków presetów w sekcji punktów końcowych (dziś jest tylko `ENDPOINT_PRESETS`). Nadal bez Twojej zgody nie ruszamy: pobierania ich CLI i logowania kontem |
| 4 | LLM i Asset w przepływach | Nic bezpiecznie w silniku: nowy typ węzła łamie wyczerpujące przełączniki w edytorze (UI i KK). **Obejście dziś:** węzeł „agent” z agentem bez narzędzi robi to samo co krok „zapytaj model” | ok. 5 h na `llm` (model + prompt), po edytorze; 5 h na Asset; 3 h adnotacje |
| 5 | Skill z linku GitHub | **Pierwsza, bezpieczna połowa** (`ipc-skill-link.ts`): czytanie linku (tylko `https://github.com/<właściciel>/<repo>[/tree/<gałąź>/<folder>]`; odrzuca inne hosty, raw i gist, http, hasła w adresie, zapytanie i `..`), lista 5 kontroli, które instalacja musi zrobić i pokazać na karcie zgody, limity jak w skillu (200 plików, 10 MB). Test: 5 | ok. 6 h: pobranie (bez wykonywania czegokolwiek), przegląd listy plików, karta zgody z pełnym SKILL.md, instalacja; tylko po Twoim „tak” |

Wniosek: z pięciu pytań **jedno (3) już coś daje w programie** (Grok i OpenRouter przez klucz, po dołożeniu przycisków w ekranie), **dwa (2, 5) mają gotowe reguły**, dwa (1, 4) nie mają nic małego do zrobienia bez Twojej decyzji.

## Czego nie sprawdziłem

1. Koszty to szacunek z wielkości podobnych ekranów i silników, nie pomiar.
2. Nie sprawdzałem, czy Discord, Grok lub OpenRouter zmieniły swoje zasady dostępu od ostatniej analizy.
3. „+ pp” liczę regułą z parytetu (wiersz „częściowo” → „jest” to +0,7 pp).
4. Pliki z sekcji o pracy Backendu (`ipc-channel-routines`, `ipc-skill-link`, `ENDPOINT_CLOUD_PRESETS`) są napisane, ale ich testy i Biome czekają na koniec cichego okna; adresów OpenRouter i xAI nie sprawdzałem połączeniem (to publiczne adresy usług).

## Co mówi kod dziś (Backend, BE-Y, stan na `4ddcbb5d3`)

Odpowiedzi tylko z kodu; decyzje proponuję liderowi (nie właścicielowi), lider zdecyduje, co i kiedy trafia do właściciela.

| # | Pytanie | Stan w kodzie | Propozycja dla lidera |
|---|---|---|---|
| 1 | Discord (rozmowy prywatne) | Nadal nic. Z kodu wynika, że to **trzeci sterownik**: istnieje interfejs `MessengerDriver` (`messenger-driver.ts`, 62 linie) z dwoma sterownikami (Telegram ok. 215 linii, Slack ok. 290), a rodzaje są w `MESSENGER_KINDS = ["telegram", "slack"]`. Szacunek ok. 9 h (silnik) zostaje, ale ryzyko jest mniejsze: wzór jest gotowy, nie trzeba ruszać `messenger-bridge`. Prawdziwy test nadal wymaga tokenu bota. | Trzymać zaparkowane do pierwszego oglądu Telegrama i Slacka w oknie (to wymaga Testera i GO). Nie pytać właściciela jeszcze raz. |
| 2 | Rutyny kanału | **Zrobione**: silnik (BE-R), ekran (UI-AB/AC: lista, formularz, edycja, dni tygodnia, historia, „Otwórz zadanie”), testy. Luka: webhook dla rutyny kanału (0.71 go nie opisuje; rutyny agenta mają). | Zamknąć pytanie. Webhook tylko, jeśli właściciel o niego poprosi. |
| 3 | Sterowniki innych dostawców | **Rozszerzone**: poza xAI i OpenRouter dochodzą DeepSeek, Mistral, Groq, Together AI i Moonshot (Kimi) jako gotowe ustawienia z adresami z dokumentacji dostawców (BE-T); limit punktów końcowych 16; przyciski budują się z listy. Nadal tylko czat, bez narzędzi programu. CLI dostawców (Cursor, Grok CLI, Devin) nadal czekają na zgodę na pobieranie. | Zamknąć część „klucz API”. Pytanie o CLI tylko po obejrzeniu w oknie, co już jest. |
| 4 | LLM i Asset w przepływach | Bez zmian: nowy typ węzła łamie wyczerpujące przełączniki w edytorze; obejście: węzeł „agent” bez narzędzi. | Zostawić do czasu, aż edytor przepływów będzie oglądany w oknie. |
| 5 | Skill z linku GitHub | Bez zmian: jest czytanie i sprawdzanie linku (`ipc-skill-link.ts`), brak pobierania i instalacji. Pobieranie cudzego kodu wymaga karty zgody z pełnym `SKILL.md`. | Nie robić bez wyraźnego „tak” właściciela (ryzyko: cudzy kod). |

Nowe od ostatniej wersji tego dokumentu, bez pytania właściciela (małe, bezpieczne): „działaj w tle” z ikoną w zasobniku (BE-W), ustawienia wyglądu i skrótu wysyłania (BE-U), gdzie otwierają się linki i przywracanie ostatniego miejsca (BE-X), **czyszczenie historii kanału** (BE-Y, `docs/cosgral-raporty/backend-w12-y.md`).
