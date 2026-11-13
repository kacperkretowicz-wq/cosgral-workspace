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
