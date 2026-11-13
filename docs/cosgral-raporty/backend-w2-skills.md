# Backend W2-BE1 — skille: biblioteka, wersje, tworzenie i naprawa przez agenta

Gałąź `team/backend/w2-skills` od integracji `b026feb9f`, bez push. Opis zachowania: `docs/cosgral/spec-w2.md` §1, lista funkcji wiersz 24.

## Wynik

| Zachowanie (spec §1) | Stan | Gdzie |
|---|---|---|
| 1.1 Lokalna biblioteka: folder z `SKILL.md` + skrypty, referencje, assety; rejestracja nic nie uruchamia | ✓ | `skill-library.ts` |
| 1.2 Agent tworzy skill (`create_skill`), od razu włączony dla niego | ✓ | `skill-tools.ts` |
| 1.3 Inni agenci nie dostają skillu sami; instaluje człowiek albo agent dla siebie | ✓ | `install`, `install_local_skill` |
| 1.4 Wersje; `revise_skill` wymaga wersji, którą agent przeczytał; nowa wersja nie zmienia zainstalowanych kopii | ✓ | `revise`, `listVersions` |
| 1.5 Aktualizacja kopii; lokalne zmiany chronione przed cichym nadpisaniem | ✓ | `update` + `overwriteLocalChanges` |
| 1.6 `list_local_skills`, `read_local_skill` | ✓ | `skill-tools.ts` |
| 1.8 Limity i format, `example-prompt` do 1000 znaków | ✓ (limity: założenie, niżej) | `SKILL_LIMITS` |
| Cofnięcie wersji (zadanie lidera) | ✓ jako nowa wersja z treścią starej | `restoreVersion` |
| 1.7 Marketplace, publikacja | — poza zakresem (W3) | — |
| 1.9 Zaufane katalogi projektu (`.agents/skills`) | — nie zrobione | — |

## Założenia do decyzji lidera

1. **Limity** (pytanie 1 z §8, bez odpowiedzi w `PLAN.md`): własne liczby w jednym miejscu `SKILL_LIMITS` (`packages/contracts/src/ipc-skills.ts`): 200 plików, 10 MB, `SKILL.md` do 256 KB, nazwa kebab-case do 64 znaków (bez nazw zarezerwowanych w Windows), opis do 1024, `example-prompt` do 1000, notatka wersji do 500, 500 skilli. Zmiana liczby = jedna linia.
2. **Gdzie leżą pliki:** biblioteka `~/COSGRAL Workspace/Skills/<nazwa>/v<N>` (każda wersja to osobny, niezmienny folder), kopia agenta `<folder agenta>/.cosgral/skills/<nazwa>`, indeks w SQLite (`projection_skills`, `projection_skill_versions`, `projection_skill_installs`). Nie zapisujemy nic do `~/.codex` ani `~/.claude` prawdziwego profilu.
3. **Jak agent widzi skille:** lista zainstalowanych skilli (nazwa, wersja, opis, ścieżka `SKILL.md`) jest w instrukcjach agenta: w rozmowie 1:1 przy wczytaniu wątku, w kanale przy każdej turze. Zmiany w trakcie sesji agent widzi przez `list_local_skills`. Nie używamy natywnego wykrywania skilli Codex/Claude: działa tak samo u obu dostawców.
4. **Agent instaluje tylko dla siebie.** Instalację u innego agenta robi człowiek (API).
5. **Usunięcie skillu** usuwa wersje i kopie u agentów; kopia zmieniona lokalnie wymaga `force`. Usunięcie agenta usuwa jego instalacje.
6. **Lokalna zmiana** = pliki kopii różnią się od zainstalowanej wersji (SHA-256 ścieżek i treści). Brak kopii też liczy się jako zmiana.

## Kontrakt dla UI

Typy: `packages/contracts/src/ipc-skills.ts` (commit `9e3504bd1`). `window.openbot.skills` jest opcjonalne i działa tylko na tym komputerze; serwer zdalny zwraca puste listy, a zmiany odrzuca.

| Metoda | Wynik | Zachowanie |
|---|---|---|
| `list()` | `LocalSkill[]` | Biblioteka po nazwie; `version` i `path` = najnowsza wersja |
| `read({skillId, version?})` | `SkillContent` | `SKILL.md` i lista plików wersji (najnowszej, gdy bez `version`) |
| `listVersions({skillId})` | `SkillVersion[]` | Wszystkie wersje od najstarszej; `note`, `authorBotId`, `restoredFrom` |
| `restoreVersion({skillId, version})` | `LocalSkill` | Cofnięcie: nowa wersja z treścią starej; kopie u agentów bez zmian |
| `delete({skillId, force?})` | `void` | Usuwa skill, wersje i kopie; zmieniona kopia wymaga `force` (błąd wymienia agentów) |
| `listInstalls({botId?})` | `SkillInstall[]` | Instalacje; `updateAvailable`, `modifiedLocally` liczone przy odczycie |
| `install({skillId, botId, version?})` | `SkillInstall` | Kopia dla jednego agenta; ta sama wersja drugi raz nic nie zmienia; inna wersja → błąd „użyj Update” |
| `update({skillId, botId, overwriteLocalChanges?})` | `SkillInstall` | Do najnowszej wersji; zmieniona kopia bez `overwriteLocalChanges` → błąd |
| `uninstall({skillId, botId})` | `void` | Usuwa kopię agenta |

Zdarzenia (`agent.onEvent`): `skills-changed {skills}` i `skill-installs-changed {installs}` — zastąp całą listę. UI: chip „Update” przy `updateAvailable`, ostrzeżenie przy `modifiedLocally` (Update z potwierdzeniem nadpisania), „Try skill” dokleja `examplePrompt` do szkicu w kompozytorze bez wysyłania.

## Narzędzia agenta `cosgral_skills`

Tym samym mechanizmem co `cosgral_eyes`: funkcje dynamiczne Codex i serwer MCP w procesie dla Claude; dozwolone też w turach kanału.

| Narzędzie | Co robi |
|---|---|
| `list_local_skills` | Biblioteka + wersja zainstalowana u tego agenta, `updateAvailable`, `modifiedLocally` |
| `read_local_skill {name, version?}` | `SKILL.md`, pliki, `version` (potrzebna do poprawki) |
| `create_skill {sourcePath \| skillMd, note?}` | Nowy skill z folderu w folderze agenta lub wspólnym, albo z tekstu `SKILL.md`; od razu zainstalowany dla autora |
| `revise_skill {name, baseVersion, sourcePath \| skillMd, note?}` | Nowa wersja; nieaktualna `baseVersion` → błąd „przeczytaj najnowszą wersję” |
| `install_local_skill {name, version?, overwriteLocalChanges?}` | Instalacja dla siebie albo przejście kopii na najnowszą lub wskazaną wersję; zmieniona kopia tylko z `overwriteLocalChanges` |

Folder źródłowy spoza folderu agenta i folderu wspólnego jest odrzucany. Linki i junction w skillu są odrzucane, ścieżki plików muszą zostać w folderze skillu.

## Dowody

| Sprawdzenie | Wynik | Dowód (poza repo, `Shared\cosgral-data\desktop-backend\`) |
|---|---|---|
| Testy TDD (czerwone przed kodem) | `ipc-skills.test.ts` 3, `skill-library.test.ts` 7, `skill-tools.test.ts` 3, `agent-service.test.ts` +2, `channel-agent-runner.test.ts` +1, `claude-client.test.ts` (serwer `cosgral_skills`), `input-parsers.test.ts` +2 | repo |
| Test ochrony lokalnych zmian | po wyłączeniu ochrony pada („promise resolved instead of rejecting”), po przywróceniu zielony | `skill-library.test.ts` |
| Całe `bun run test` na końcowym kodzie | **696/696**, 93/93 pliki | `logs\w2-skills-full-test-final.log` |
| Typecheck contracts, node, renderer; `bun run build`; `biome check` zmienionych plików | exit 0; bez błędów | `logs\w2-skills-typecheck-2.log`, `logs\w2-skills-build.log` |
| Przegląd własnego kodu | znaleziony i poprawiony błąd: folder `..drafts` w folderze agenta był odrzucany jak wyjście poza folder (test czerwony → zielony) | `skill-tools.test.ts` |
| Piaskownica (atrapa Codex, osobny profil) | `ok: true`: agent tworzy `weekly-report`, czyta, poprawia z `baseVersion` 1 → wersja 2 („Add totals”), instaluje v2; kolejna tura ma „weekly-report (version 2)” w instrukcjach; tylko autor ma instalację; po ponownym otwarciu bazy: wersja 2, v1 nadal do odczytu, kopia autora v2 bez lokalnych zmian. Na dysku `Skills\weekly-report\v1` i `v2` | `sandbox-w2-skills\evidence.json` |

## Pamięć kanału (punkt 5)

KAPI nie prosił o podłączenie. Według jego notatek w kanale pamięć kanału zostaje w `ChannelStore` i `channels.*` (moje nazwy z W1-BE2), więc nic nie zmieniałem.

## Commity

| Commit | Zakres |
|---|---|
| `9e3504bd1` | Kontrakt skilli (pierwszy commit gałęzi) |
| magazyn | Biblioteka: walidacja, wersje, cofnięcie, instalacje, tabele SQLite |
| narzędzia | `cosgral_skills` dla Codex, Claude i kanałów; instrukcje agenta |
| IPC i dowody | `skills:*`, `window.openbot.skills`, piaskownica, ten raport, `COSGRAL-CHANGES.md` |

## Nie zrobione / otwarte

- Marketplace i publikacja (1.7), zaufane katalogi projektu (1.9), wbudowany przewodnik skill-creator (opis formatu jest w opisach narzędzi).
- Człowiek nie tworzy skillu z folderu przez API (robią to agenci); można dodać `skills.importFolder`, jeśli UI będzie tego chciało.
- Atrapa `mock-openbot.ts` nie ma jeszcze `skills.*`.
- Lista skilli w instrukcjach rozmowy 1:1 odświeża się przy wczytaniu wątku (np. po restarcie), nie w trakcie sesji.
