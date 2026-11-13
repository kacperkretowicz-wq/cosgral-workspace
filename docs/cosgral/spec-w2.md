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
