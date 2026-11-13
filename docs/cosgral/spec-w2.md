# Spec W2 — skille, MCP, Vault, rutyny, tabele, biblioteka

**Dla:** Hydra (skille i dalej W2), Backend, UI.  
**Źródła:** obserwacja OpenBota 0.68 jako użytkownik/agent (własne narzędzia: skille, rutyny, Vault, tabele, MCP), [README 0.68](https://github.com/nightly-labs/openbot/blob/v0.68.0/README.md) (sekcja Local skills), [docs/webhooks.md v0.68.0](https://github.com/nightly-labs/openbot/blob/v0.68.0/docs/webhooks.md), changelog v0.68.0, lista `docs/cosgral/parytet-0.68.md` wiersze 24–30, nazwy w paczce (`managed-skills`: m.in. skill-creator). Bez kopiowania tekstów UI i bez kodu nowszego niż `a6fe240`.  
**Pamięć (wiersz 23):** pominięta — opisana Hydrze przez lidera.

Stan: 13.11.2026. Żaden test odbioru z tej specyfikacji nie został uruchomiony w COSGRAL.

## 1. Skille (wiersz 24)

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 1.1 | Biblioteka lokalna | Skille żyją we **wspólnej lokalnej bibliotece** na tym komputerze / serwerze; każdy skill to folder z `SKILL.md` (opis, kroki) oraz opcjonalnymi skryptami, referencjami i assetami (np. ikona). Rejestracja **nie uruchamia** skryptów skillu. | Utworzyć skill → widać go na liście lokalnej biblioteki z nazwą i opisem; folder istnieje po restarcie. |
| 1.2 | Tworzenie przez agenta | Agent dostaje przewodnik (skill-creator) i narzędzia: przygotowuje folder, woła `create_skill`; skill trafia do biblioteki i jest **od razu włączony dla tego agenta**. | Poprosić agenta o skill z powtarzalnego workflow → pojawia się w bibliotece i w ustawieniach skilli tego agenta. |
| 1.3 | Przypisanie do agenta | Inny agent **nie** dostaje skillu automatycznie; człowiek (lub agent z narzędziem instalacji) dodaje go z biblioteki (Settings → Local skills / `install_local_skill`). | Zainstalować ten sam skill u drugiego agenta → drugi go używa; pierwszy nadal go ma. |
| 1.4 | Wersje | Biblioteka trzyma **wersje**; `revise_skill` wymaga wersji, którą agent wcześniej odczytał; poprzednie wersje zostają. Aktualizacja w bibliotece **nie** podmienia już zainstalowanych kopii u agentów. | Zmienić krok skillu (revise) → w bibliotece nowa wersja; zainstalowana kopia u agenta bez Update zostaje stara. |
| 1.5 | Aktualizacja / naprawa | Człowiek (lub jawna instalacja dokładnej rewizji) aktualizuje zainstalowaną kopię (np. chip Update). Zmodyfikowane lokalnie pliki instalacji są **chronione** przed cichym nadpisaniem. | Po Update agent czyta nową treść skillu; po ręcznej edycji instalacji Update nie niszczy zmian bez decyzji użytkownika. |
| 1.6 | Odczyt i lista | Agent ma `list_local_skills` i `read_local_skill` (oraz instalację); czyta tylko to, do czego ma dostęp. | Agent listuje bibliotekę → widzi skill utworzony wcześniej; read zwraca treść `SKILL.md`. |
| 1.7 | Marketplace / publikacja | Instalacja z Marketplace i publikacja lokalnego skillu to **osobna** droga (katalog / submit folderu); lokalna biblioteka nie równa się automatycznej publikacji. | Zainstalować skill z katalogu Marketplace → pojawia się u agenta; lokalny create_skill nie wrzuca go sam do Marketplace. |
| 1.8 | Limity i format | Skill ma limity walidacji (rozmiar / liczba plików — jak w przewodniku skill-creator); opcjonalne `example-prompt` w frontmatter (do ~1000 znaków) służy tylko podglądowi „Try skill” (dokleja szkic, **nie** wysyła wiadomości). | Skill powyżej limitu → odrzucenie z jasnym sygnałem; Try skill dokleja przykład do draftu bez send. |
| 1.9 | Brzeg: zaufane katalogi projektu | Skill z folderu projektu (np. `.agents/skills`) działa tylko gdy katalog jest na liście zaufanych ścieżek konfiguracji. | Skill poza zaufaną ścieżką → niedostępny / odrzucony; w zaufanej — widoczny. |

**Dla kontraktu Hydry (skille):** encja `LocalSkill {id, name, description, version, createdAt, updatedAt, …}`, instalacja per agent `{botId, skillId, installedVersion, modifiedLocally}`, narzędzia agenta: `create_skill`, `list_local_skills`, `read_local_skill`, `revise_skill`, `install_local_skill`; zdarzenie zmiany biblioteki / instalacji dla UI.

## 2. Serwery MCP (wiersz 25)

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 2.1 | Panel / dodanie | Człowiek dodaje **obcy** serwer MCP (adres / komenda startu / transport) w ustawieniach; serwer pojawia się na liście ze stanem (sprawdzanie / dostępny / błąd / wymaga logowania). | Dodać serwer MCP → widać go na liście; po restarcie nadal tam jest. |
| 2.2 | Logowanie do MCP | Gdy serwer wymaga OAuth / klucza / sesji, program prowadzi logowanie; przy aktywnym logowaniu odmowa wywołania jest jasna (nie „zawieszenie”). Tokeny sesji MCP **nie** trafiają do logów. | Serwer z OAuth → po zalogowaniu stan „dostępny”; bez logowania agent nie dostaje narzędzi albo dostaje komunikat sign-in. |
| 2.3 | Narzędzia dla agentów | Po udanym połączeniu (i kluczu, gdy potrzeba) narzędzia tego MCP są widoczne dla wskazanych agentów w kolejnej turze; Claude dostaje je zaraz po podaniu klucza API aplikacji MCP. | Po dodaniu MCP agent w następnej turze woła narzędzie serwera i dostaje wynik. |
| 2.4 | Zgoda na narzędzie | Przy trybie „pytaj najpierw” wywołanie MCP wymaga zgody człowieka (Always allow / odmowa); Full access nie pyta przy każdym callu po pierwszej zgodzie na dostęp. | Ask first → karta zgody; Always allow → kolejne wywołanie bez karty; odmowa → agent nie dostaje wyniku narzędzia. |
| 2.5 | TLS / sieć | Agent za korporacyjnym TLS dostaje certyfikaty systemowe, żeby MCP za inspection działało. | Za proxy z własnym CA → wywołanie MCP nie pada na „certificate”; bez CA — błąd TLS z czytelnym komunikatem. |
| 2.6 | Brzeg: wyłączenie / usunięcie | Usunięcie lub wyłączenie serwera zabiera narzędzia agentom od następnej tury; trwające wywołanie kończy się błędem, nie cichym sukcesem. | Usunąć MCP w trakcie → kolejne tool-calle tego serwera zawodzą; lista narzędzi bez niego. |

**Kontrakt (MCP):** `McpServer {id, name, transport, status, errorMessage?}`, metody add/update/remove/list, zdarzenie `mcp-servers-changed`, opcjonalnie per-bot enable; zgody tooli przez istniejący mechanizm approval.

## 3. Vault (wiersz 26)

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 3.1 | Rodzaje elementów | Vault trzyma: **loginy** (strona + user + hasło), **karty**, **kontakty**, **klucze API**, **TOTP** (sekret authenticatora); każdy element ma etykietę i da się wyszukać. | Zapisać po jednym elemencie każdego rodzaju → lista pokazuje je po restarcie (bez jawnego sekretu w podglądzie listy). |
| 3.2 | Szyfrowanie | Sekrety w magazynie OS (`safeStorage` / Credential Manager); **nie** w logach, czacie ani zwykłej bazie plaintext. | Zrzut logów po użyciu hasła → brak hasła/TOTP w plain text. |
| 3.3 | Agent używa bez ujawniania | Agent prosi o element (lub program podsuwa pasujący); wypełnia formularz / `submit_secret` **bez** wklejenia sekretu do treści odpowiedzi w czacie. | Agent loguje się hasłem z Vault → w historii czatu nie ma hasła; strona jest zalogowana. |
| 3.4 | Prośba o brakujący element | Gdy Vault nie ma pasującego loginu/karty/kontaktu, program prosi człowieka o dodanie (`request_vault_item`); nic nie wymyśla. | Zadanie wymaga karty, której nie ma → karta prośby; po dodaniu agent kontynuuje. |
| 3.5 | TOTP / 2FA | Przy włączaniu 2FA agent wybiera metodę authenticator; zapisuje setup key przy loginie; kod generuje program i podaje przez submit_secret (nie cytuje sekretu w czacie). | Zapisać twoStepKey → agent podaje aktualny kod; sekret nie pojawia się w wiadomości. |
| 3.6 | Konektory zewnętrzne | Opcjonalnie 1Password / Bitwarden / Proton jako źródła; element z konektora zachowuje te same reguły nieujawniania. | Podłączyć konektor (gdy dostępny) → agent bierze login stamtąd bez paste hasła w czacie. Brak konektora → tylko lokalny Vault. |
| 3.7 | Brzeg: wiele dopasowań | Gdy >1 element pasuje do zadania, program **pyta** człowieka, którego użyć. | Dwa loginy do tej samej domeny → wybór; bez wyboru agent nie zgaduje. |

**Kontrakt (Vault):** `VaultItem` z `kind: login|card|contact|apiKey|totp`, metody list/save/delete/request; narzędzia agenta tylko przez bezpieczne API (wypełnij / submit), nigdy raw secret w eventach UI czatu.

## 4. Rutyny i webhooki (wiersz 27)

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 4.1 | Harmonogram | Rutyna ma kalendarz / cron / „codziennie o…”, **strefę czasową** użytkownika i podgląd **następnego uruchomienia**. | Utworzyć rutynę codzienną w strefie użytkownika → widać next run; po restarcie harmonogram ten sam. |
| 4.2 | Program wyłączony | Gdy host/program **nie działa**, zaplanowane uruchomienia **nie** startują w tle „w chmurze same z siebie”; webhooki wymagają online hosta (relay nie trzyma kolejki offline). | Wyłączyć program przed godziną rutyny → po starcie widać pominięcie / brak runu w oknie offline; nie ma ukrytego runu bez historii. |
| 4.3 | Historia uruchomień | Każdy run ma wpis w historii (start, wynik, błąd, ignored); cichy koniec możliwy (`[SILENT]`). | Odpalenie testowe → wpis w historii ze statusem. |
| 4.4 | Webhook | Rutyna typu Webhook ma URL + signing secret (Standard Webhooks / nagłówki OpenBot); filtr typu zdarzenia i do 128 filtrów JSON Pointer; max **64** webhook routines na host; body ≤ 64 KiB. | Utworzyć webhook → URL; signed POST → run; zły podpis → 401; za duże body → 413. |
| 4.5 | Secret webhooka | Secret pokazywany **raz** (lub regeneracja); agent tworzący webhook **nie** dostaje secretu — tylko człowiek na karcie / w edytorze. | Agent create_webhook_routine → w odpowiedzi agenta brak secretu; karta dla człowieka ma secret/URL. |
| 4.6 | Deduplikacja | Ten sam `delivery-id` + body w oknie retencji (7 dni) nie startuje drugiego runu (`200`). | Ponowić ten sam delivery-id → jeden run w historii. |
| 4.7 | Pauza / limity | Wstrzymana rutyna nie biegnie (test event też nie); limity częstości / 429 przy nadmiarze; run kanału może zakończyć właściciel jako failed. | Pause → POST dostaje 202 bez nowego runu; Resume → kolejne zdarzenie odpala. |
| 4.8 | Kto tworzy webhook z czatu | Tylko wiadomość **człowieka** może tworzyć/zmieniać webhook routine; run rutyny ani inny agent nie. | Routine run próbuje create_webhook → odrzucone; człowiek w czacie → OK. |

**Kontrakt (rutyny):** `Routine {id, scope: agent|channel, trigger: schedule|webhook, timezone, nextRunAt, paused, …}`, historia runów, IPC create/update/delete/list; webhook: URL, filters, test-event.

## 5. Tabele wspólne (wiersz 29)

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 5.1 | Wspólna baza | Tabele agentów to **trwały magazyn wierszy** (nie tylko markdown w czacie); wielu agentów czyta te same dane. | Utworzyć tabelę, dodać wiersz agentem A → agent B widzi ten wiersz po odświeżeniu / w kolejnej turze. |
| 5.2 | Kto prowadzi | Tabela ma właściciela / uprawnienia; usunięcie przez uprawnionego usuwa **dla wszystkich**. | Usunąć tabelę → znika u obu agentów i po restarcie. |
| 5.3 | API agenta | Agent listuje tabele, czyta/pisze wiersze narzędziami; zmiany są danymi, nie poleceniami. | Agent dopisuje wiersz → widać go w UI tabeli i u drugiego agenta. |
| 5.4 | Brzeg: konflikt | Równoległy zapis tego samego wiersza: ostatni wygrywa albo wersjonowanie z jasnym sygnałem (wybrać jedną regułę i trzymać). | Dwóch agentów edytuje ten sam wiersz → wynik przewidywalny, bez cichego rozjazdu UI. |
| 5.5 | Trwałość | Dane przeżywają restart programu. | Restart → te same kolumny i wiersze. |

**Kontrakt (tabele):** `SharedTable {id, name, ownerBotId?, columns[], updatedAt}`, `list_tables` / read / write / delete; zdarzenie `table-changed`.

## 6. Biblioteka plików (wiersz 30)

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 6.1 | Widok biblioteki | Osobna strona/panel Biblioteka: siatka lub lista plików (nie tylko załączniki w wątku). | Otworzyć Bibliotekę → widać pliki niezależnie od otwartego czatu. |
| 6.2 | Dodawanie | Człowiek lub agent wrzuca plik (upload / zapis z narzędzia / zrzut); plik dostaje nazwę, rozmiar, datę. | Wrzuć plik → pojawia się na liście. |
| 6.3 | Pobieranie / otwarcie | Zaznaczenie i pobranie na dysk albo otwarcie podglądu. | Pobierz plik → bajty zgodne z oryginałem. |
| 6.4 | Sprzątanie | Usuwanie i ewentualne limity miejsca; usunięcie zwalnia miejsce. | Usuń plik → znika z listy i po restarcie. |
| 6.5 | Pliki maszyny | Opcja wskazania plików lokalnych maszyny (ścieżki) obok magazynu aplikacji — z jasnym rozróżnieniem. | Dodać odniesienie do pliku dysku → widać etykietę ścieżki; brak pliku → błąd, nie pusty sukces. |
| 6.6 | Trwałość | Biblioteka przeżywa restart. | Restart → te same wpisy. |

**Kontrakt (biblioteka):** `LibraryItem {id, name, size, createdAt, source: app|path}`, list/upload/download/delete; zdarzenie `library-changed`.

## 7. Przepływy pracy (wiersz 28) — skrót

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 7.1 | Płótno | Osobna strona Workflows: węzły, wyzwalacz, kroki (także z zatwierdzeniem człowieka), wyjścia / integracje. | Utworzyć przepływ z jednym krokiem → zapisany po restarcie. |
| 7.2 | Uruchomienie | Start ręczny lub z wyzwalacza kończy się widocznym wynikiem / statusem; wyjście może iść do kanału OpenBot. | Uruchomić prosty przepływ → status done i wynik w historii / kanale. |
| 7.3 | Zatwierdzenie w kroku | Krok z approval wstrzymuje run do decyzji człowieka (Needs you). | Krok approval → karta; po Allow run idzie dalej. |

*(Pełniejszy opis canvas można rozwinąć przy implementacji W2/W3 UI; tu minimum pod parytet wiersz 28.)*

## 8. Pytania otwarte dla lidera

1. Skille: domyślny limit plików/rozmiaru folderu skillu w COSGRAL — kopiujemy limity skill-creator 0.68, czy własne liczby w jednym pliku konfiguracji?
2. MCP: czy serwery są globalne na host, czy też per-agent enable od dnia 1?
3. Vault: czy konektory 1Password/Bitwarden/Proton są w zakresie pierwszej dostawy W2, czy tylko lokalny Vault?
4. Rutyny: na Windows bez konta OpenBot — czy webhooki w ogóle startują (wymagają konta/host online), czy W2 oddaje tylko schedule lokalny?
5. Tabele: reguła konfliktu zapisu — last-write-wins czy version field?
6. Biblioteka vs załączniki czatu — jeden magazyn z dwoma widokami, czy osobne store?
7. Przepływy (wiersz 28): pełne płótno w tej samej fali co tabele, czy po Vault/rutynach?

## Metoda

- Dowód „jako użytkownik”: narzędzia i karty w tej sesji OpenBot (skille, Vault, rutyny/webhooki, tabele, prośby o klucze).
- README 0.68 Local skills; docs/webhooks.md (limity 64 routines, 64 KiB, 7 dni receipts, secret raz).
- Changelog v0.68.0: MCP po kluczu API, Standard Webhooks, skill folder rename na Windows, ciche rutyny.
- Paczka: `resources/managed-skills` (m.in. openbot-skill-creator).
- Gałąź: `team/tester/w2-spec` od `codex/cosgral-desktop` @ `341ae769b`.
