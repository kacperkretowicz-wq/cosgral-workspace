# KK Fullstack: odpowiedzi właściciela (pkt 3 i 5): instalator na tym komputerze i modele zapasowe per dostawca

Data: 16.11.2026. Gałąź `team/kk/w5-g2` (od `codex/cosgral-desktop` @ `0e01c0019`). Odpowiedzi właściciela na pytania z raportu 8:45: pkt 3 „spróbuj sam zainstalować na obecnym komputerze”, pkt 5 „muszą być per dostawca modele zapasowe, w OpenBocie to działa”. Pkt 1, 2 i 4 (historia gita, widoczność repo, CI) to decyzje lidera: nie ruszałem ich.

## Wynik w jednej linii

**Instalator zbudowany, zainstalowany na tym komputerze (bez administratora, 22 s) i sprawdzony: program startuje, pobiera prawdziwy Codex CLI z oficjalnego źródła (0.169.0, 365 MB, 15–20 s, suma SHA-256 sprawdzona przez program) i go uruchamia. Czystego konta Windows nie da się tu zrobić (brak praw administratora), więc G2 na czystym koncie zostaje do wykonania. Modele zapasowe są teraz per dostawca (Codex, Claude, agenci ACP, własne punkty końcowe) obok listy ogólnej i listy agenta.**

## 1. Instalator na tym komputerze

| Co | Wynik |
|---|---|
| Budowa `bun run dist:win` | zielona, 12 min (głównie pakowanie), `COSGRAL Workspace-0.2.0-x64.exe`, 108 MB, bez podpisu (SmartScreen może ostrzegać) |
| Instalacja cicha (`/S`), dla bieżącego użytkownika | exit 0 w 22 s, **bez okna UAC**, do `%LOCALAPPDATA%\Programs\cosgral-workspace\` (215 MB), skróty na pulpicie i w menu Start, wpis „COSGRAL Workspace 0.2.0” w dodaj/usuń programy (dane programu zostają po odinstalowaniu: `deleteAppDataOnUninstall: false`) |
| Start zainstalowanego programu | kroki `scripts/sandbox-installed.ts`: **7/7 ok**, 0 błędów konsoli (I01–I07) |
| Pierwszy ekran bez agenta CLI | „Where will COSGRAL Workspace run?”, potem „Set up this computer”: Continue zablokowane, karta mówi „Brak”, bez przycisku logowania |
| **Prawdziwe pobranie CLI** | karta „Download Codex CLI 0.169.0?” → zgoda → pobrane w 15–20 s, 365 MB, plik w folderze danych programu (w profilu piaskownicy), program sam odczytał wersję `0.169.0`, brak błędu; setup poszedł dalej, główne okno otwarte |
| Dane zainstalowanego programu | w folderze `COSGRAL Workspace` profilu piaskownicy, nic w folderach OpenBota |

Zainstalowany program **zostawiłem zainstalowany** na tym komputerze (jak prosiłeś). Odinstalowanie: Ustawienia → Aplikacje, albo `%LOCALAPPDATA%\Programs\cosgral-workspace\Uninstall COSGRAL Workspace.exe`. Uruchomienie normalne (skrót) użyje Twojego prawdziwego profilu i prawdziwych logowań Codex/Claude: tego nie robiłem.

### Co trzeba wiedzieć o „czystym koncie” (usterka izolacji, nie programu)

1. **Brak praw administratora**: nie mogę założyć drugiego użytkownika Windows ani włączyć Windows Sandbox. Test na naprawdę czystym koncie (G2) musisz zrobić Ty albo ktoś z uprawnieniami: instrukcja `docs/cosgral/T2-odbior-czysty-windows.md`.
2. **Piaskownica z innym `USERPROFILE` nie izoluje prawdziwych CLI.** Przy drugim starcie zainstalowanego programu w profilu piaskownicy (powtarzalne, sprawdzone dwa razy): znalazł on prawdziwy CLI Claude z folderu użytkownika (źródło „system”) i pokazał oba konta systemowe (Codex, Claude) jako zalogowane na Twoje prawdziwe konta. Prawdziwy CLI pyta Windows o folder domowy i ignoruje `USERPROFILE`. Niczego nie czytałem ani nie wysyłałem do modelu; program tylko odczytał stan przez CLI. Wniosek: testy z prawdziwymi CLI w piaskownicy muszą omijać też PATH, folder `.local\bin` i konta systemowe; do tej pory testy używały atrapy CLI i to nie występowało. Krok I07 skryptu to notuje (przy pierwszym starcie CLI Claude nie był jeszcze widoczny, dlatego wartość w I07 bywa „false”).
3. Pierwsze pobranie prawdziwego CLI: karta zgody w nowym profilu działa, a plik waży 365 MB: warto o tym powiedzieć w tekście karty (rozmiar jest znany z metadanych, ale karta go nie pokazuje). Nie zmieniałem.

## 2. Modele zapasowe per dostawca (pkt 5)

Do tej pory: lista ogólna (`*`) i lista agenta. **Teraz trzy poziomy:** własna lista agenta → lista dostawcy jego modelu → lista ogólna.

| Co | Jak |
|---|---|
| Dostawcy | Codex, Claude, agenci ACP, własne punkty końcowe: zakresy `provider:codex`, `provider:claude`, `provider:acp`, `provider:endpoint` (jak `*`: te same cztery metody `get/setFallbackModels`, `getFallbackInfo`, `resetFallbackModels`; limit 8, bez powtórek, te same reguły) |
| Który dostawca agenta | z jego własnego modelu (`bot.model`), nie z modelu zapasowego w użyciu; rejestr dostaje to z silnika (`useBotModelLookup`) |
| Kontrakt | `FallbackModelsInfo` ma nowe pola opcjonalne `provider` (lista dostawcy lub `null`) i `source` (`own` / `provider` / `general`); stare odpowiedzi nadal poprawne |
| Silnik | `chooseModel` bierze `own ?? lista dostawcy ?? ogólna`, pomija niedostępne (usunięty agent ACP, usunięty punkt końcowy), konta nadal przed modelami zapasowymi |
| UI | strona Dostawcy: lista wyboru ma grupy „Per provider” (Codex, Claude, ACP agents, Own endpoints), „Agents”; status „Saved list for Codex” / „Inherited from the provider list” / „Inherited from general list”; przycisk „Reset to provider list” lub „Reset to general list”; panel ustawień agenta pokazuje to samo źródło |
| Mock i historie | `createMockFallbackModelsApi(removed, providerOfAgent)` |

### Testy i dowód

| Co | Wynik |
|---|---|
| Rejestr (`provider-registry.test.ts`, 7 nowych): kolejność własna → dostawcy → ogólna, lista pusta własna wygrywa, reset po kolei, zakres nie jest agentem, limity 8 per dostawca, wybór modelu po limicie Codex idzie na listę Codex, agent Claude jej nie widzi, restart | zielone |
| Kontrakt (`ipc-fallback-models.test.ts`, 2 nowe) | zielone |
| UI (`ProvidersFallbackProviders.test.tsx`, 3 nowe) + stare `ProvidersFallbackW5`, `AgentSettingsW3` | zielone |
| Zbiorczy przebieg 7 plików (rejestr, kontrakt, mock, UI, silnik z kontami) | **58/58** |
| `agent-service.test.ts` + `agent-service-fallback-accounts` + `ProvidersPageW3` + nowy UI | **99/99** |
| **W oknie** (`COSGRAL_MODE=w5`): P09 teraz używa listy `provider:codex` (agent bez własnej listy): konta, potem model zapasowy z punktu końcowego, powrót po resecie; nowy krok **F03** (źródło „provider”, lista Claude osobno, strona oferuje General/Codex/Claude/ACP agents/Own endpoints, reset) | **25/25 ok**, 0 błędów konsoli |
| `sandbox:e2e` na tym kodzie | **30 ok, 0 FAIL, 0 findings** |
| `bun run lint` (776 plików), `check:ui`, `typecheck:contracts`, `node`, `renderer`, `storybook` | zielone |

## Czego nie sprawdziłem

1. Czystego konta Windows (brak uprawnień) i zachowania instalatora przy aktualizacji z poprzedniej wersji.
2. Logowania do prawdziwego konta Codex/Claude (tylko właściciel), prawdziwej rozmowy z modelem, prawdziwego limitu.
3. Historii Storybook dla nowych opcji list (typecheck storybook zielony, bez uruchomienia axe).
4. Pełny `bun run check` (Twoje).
5. Pkt 1, 2, 4 odpowiedzi właściciela (historia gita z force-push, widoczność repo i gałąź domyślna, aktualizacje/ochrona gałęzi/CI): decyzje lidera, niczego nie zmieniałem.
