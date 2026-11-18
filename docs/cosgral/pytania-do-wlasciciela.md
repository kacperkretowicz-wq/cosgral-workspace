# Pytania do właściciela: co robimy dalej (z kosztem)

Stan: 18.11.2026. Parytet kodowy 75% (ostrożnie 56,9%, w oknie 45,1%). Godziny to moja ocena (kontrakt + silnik + ekran + testy na atrapach), nie pomiar. Szczegóły i powody: `docs/cosgral/parytet-0.71.md` → „Decyzje” oraz `luki-silnika-071.md`.

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
