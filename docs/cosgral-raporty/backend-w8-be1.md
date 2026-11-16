# W8-BE1: poziomy dostępu agenta (spec-w8.md §1A, W8-01…08)

**Następny krok (lider):** scalić `team/backend/w8-be1`. UI Designer bierze `window.openbot.access` z kontraktu (commit 1, `2fab6cbc2`). Silnik jest w commicie 2.

**Stan:** wszystko z zakresu gotowe (krok 3 z 3: kontrakt, silnik, L3/L9). Tylko testy jednostkowe i lint/typecheck na zmienionych plikach. Electrona, `sandbox:e2e` i pełnego `bun run test`/`check` nie uruchamiałem.

## 1. Co jest (commity)

| Commit | Zawartość |
|---|---|
| `2fab6cbc2` | kontrakt + mock: `packages/contracts/src/ipc-access.ts`, `window.openbot.access`, zdarzenia `access-changed` i `access-denied`, mock do Storybooka, testy kontraktu (14) i mocka (6) |
| 2 (silnik) | `access-policy`, `access-store`, `access-service`, `access-ipc`, wpięcie w `agent-service`, bramka narzędzi Claude, szew subagenta, L3, L9, testy, raport |

## 2. Jak działa każdy poziom

| Poziom | Co dostaje CLI | Prośba CLI o wyjście poza foldery | Wykluczone foldery |
|---|---|---|---|
| `working-folder` (domyślny, też po szablonie, kopii i imporcie: Q9) | sandbox `workspace-write`: zapis tylko w folderze roboczym, folderach dodanych i wspólnym folderze programu | **odmowa** bez karty, z powodem; okno dostaje `access-denied` (W8-02) | zawsze odmowa |
| `ask-first` | ten sam sandbox | zwykła karta w Needs you (Allow / Always / Deny jak dziś), po Deny koniec (W8-03) | zawsze odmowa, reguła Always ich nie otwiera |
| `full` | szeroki sandbox, jak dotąd | zwykły przepływ reguł i kart | **odmowa także tu** (Q3) |

- **Podniesienie poziomu = tylko karta** (confirm w Needs you). `setLevel` przy podniesieniu zwraca `raiseRequested: true` i niczego nie zmienia, aż osoba kliknie Allow. Obniżenie jest od razu, bez karty. Agent nie ma żadnego narzędzia do zmiany poziomu (test w `agent-service-access.test.ts`).
- Poziom, foldery dodane i wykluczone leżą w `agent-access.json` w folderze danych (osobno w każdej przestrzeni klienta). Uszkodzony plik jest odkładany obok jako `.damaged-…`, a agenci startują z domyślnym poziomem, nigdy z szerszym.
- Poziom dotyczy następnej tury: Codex dostaje `sandboxPolicy` w każdym `turn/start`, więc podniesienie i obniżenie działają od następnej wiadomości. Prośby o zgodę są oceniane na bieżąco po aktualnym poziomie (obniżenie działa od razu).
- **Computer Use i kamera nie są częścią żadnego poziomu (Q4):** karty `screen` i `camera` poziom pomija i zostają przy swoich zgodach.

## 3. Gdzie program egzekwuje

1. **Start/wznowienie wątku i tura Codex** (`agent-service.ts`): sandbox i korzenie z poziomu (zamiast stałego `danger-full-access`).
2. **Prośby CLI o zgodę** (komenda, zmiana pliku, dodatkowe uprawnienia): najpierw poziom (odmowa jest ostateczna), potem reguły Always, potem karta.
3. **Narzędzia programu z ścieżką w argumentach** (np. biblioteka plików): wykluczony folder jest odmową na każdym poziomie, zapis poza folderami na working-folder też, na ask-first karta. Ścieżki względne są liczone od folderu roboczego, więc `..\..\x` nie ucieknie.
4. **Claude Code:** klient dostaje bramkę narzędzi (`useToolGate`). Z bramką działa w trybie `default` (nie `bypassPermissions`), więc narzędzia plikowe i powłoka pytają program. Bez bramki (testy, atrapy) nic się nie zmienia.
5. **Szew subagenta** (`access` w `SubagentRunner`): subagent dostaje dokładnie sandbox, korzenie i `approvalPolicy` rodzica (to samo `cliAccess`), a jego prośby o zgodę są oceniane po poziomie rodzica (ten sam agent). Nigdy więcej niż rodzic (test).
6. **Rozmowa agenta w kanale** (`channel-agent-runner`): ma poziom członka.

## 4. Poprawki z przeglądu Testera (docs/cosgral/przeglad-w6-be4-w8-kk1.md)

| L | Wynik |
|---|---|
| **L3** pula kont | zrobione: subagent startuje w tym samym procesie CLI co wątek rodzica, więc na jego koncie z puli (test: `agent-service-accounts.test.ts`, "starts a subagent on the account its parent works on") |
| **L4** poziom subagenta | zrobione (pkt 5 wyżej, 2 testy) |
| **L6** Q9 | zrobione: każdy nowy agent (kreator, szablon, kopia, import z katalogu) przechodzi przez `createBot`, który zeruje poziom; test: szablon i kopia agenta `full` startują w `working-folder`, a źródło zostaje `full` |
| **L9** wzorzec id | poprawione w `kk-w8-kk1.md`: generator robi 12 znaków `[0-9a-f]`, parser przyjmuje `main` albo `^[a-z0-9][a-z0-9-]{5,39}$` |
| L1 | UI (panel subagentów), nie moje |
| L2 | osobne zadanie Backend+UI (pytanie poboczne W28), niczego tu nie dotykałem |
| L5 | opcjonalne: pole `source` na karcie zgody; propozycja zostaje, UI może dalej łączyć po `waitingRequestIds` |
| L7 | decyzja lidera/KK (allowlista MCP) |
| L8 | W8-BE2 (izolacja procesu) |
| L10 | już zatwierdzone przez lidera (Q11) |

## 5. Granice (uczciwie)

1. **To nie izolacja systemowa (to W8-BE2).** Agent na `full` działa z prawami użytkownika Windows. Wykluczony folder jest odmową tam, gdzie program jest pytany (jego narzędzia, prośby CLI, narzędzia Claude), a nie murem.
2. **Codex na `full` o nic nie prosi**, więc jego własne polecenia i zapisy w wykluczonym folderze nie przechodzą przez program. Tego dziś nie da się zamknąć bez piaskownicy procesu.
3. **Tekst polecenia powłoki** jest czytany tylko pod kątem pełnych ścieżek (dysk, udział sieciowy, unix). Zmienna środowiskowa lub `cd` w innym kroku mogą ścieżkę ukryć. Dlatego poniżej `full` polecenie z krokiem `..` liczy się jako "nie da się sprawdzić" (odmowa na working-folder, karta na ask-first). Prawdziwą ścianą na working-folder i ask-first jest sandbox CLI.
4. **Claude:** odczyty plików w obrębie folderów roboczych Claude Code przepuszcza sam (bez pytania programu). Odczyt wykluczonego folderu jest odmową, gdy leży poza nimi, ale nie, gdy ktoś dodał folder nadrzędny. Karty na ask-first dla Claude to zwykła karta potwierdzenia (Allow/Cancel), **bez** "Always" (Claude do tej pory nie miał zgód w ogóle).
5. **Karta podniesienia po zmianie zdania:** jeśli osoba po prośbie o podniesienie zmieni poziom albo poprosi o inny, stara karta zostaje w Needs you do odpowiedzi, ale jej Allow nic już nie zmienia. Karty nie da się dziś cofnąć z poziomu silnika.
6. **Zasady dla poleceń są ocenione jako zapis.** Polecenie bez żadnej znanej ścieżki na working-folder przechodzi do zwykłej karty, nie do odmowy (CLI prosi tylko, gdy sandbox coś blokuje).

## 6. Kontrakt dla UI (skrót)

- `window.openbot.access.get({botId})`, `list()`, `setFolders({botId, additionalFolders?, excludedFolders?})`, `setLevel({botId, level})` → `{access, raiseRequested}`.
- Po `raiseRequested: true` okno pokazuje "czeka na zgodę" i nasłuchuje `access-changed`; poziom zmienia się dopiero po Allow w Needs you.
- `access-denied {botId, threadId, kind, reason: excluded|outside-folder, path, message}`: pokaż zdanie `message` (odmowa nigdy nie jest cichym sukcesem ani cichą porażką).
- Foldery tylko absolutne, bez całego dysku; do 20 w każdej liście; kanały `access:*` tylko lokalnie.

## 7. Weryfikacja

- Testy jednostkowe zielone: nowe `access-policy` (16), `access-store` (6), `access-service` (26), `agent-service-access` (13), bramka Claude (1), L3 (1), `local-only-ipc`. Razem 30 plików powiązanych, 350/350.
- Biome na zmienionych plikach i `typecheck:node` zielone.
- Kolejność pracy: kontrakt, polityka, usługa i bramka Claude + L3 pisane test-first (test czerwony, potem kod). Testy silnika na `AgentService` dopisałem po wpięciu kodu (przeszły za pierwszym razem, poza jednym testem asercji, poprawionym).

## 8. Czego nie sprawdziłem

1. Prawdziwego Codex i Claude: czy `workspaceWrite` z `networkAccess: true` i `writableRoots` jest przyjmowane tak, jak zakłada atrapa, i czy CLI na working-folder naprawdę prosi o zgodę przy zapisie poza korzeniami (zakładam z dokumentacji protokołu).
2. Claude w trybie `default` z bramką na prawdziwym SDK (czy każde narzędzie zapisu i Bash przechodzi przez `canUseTool`, czy ustawienia użytkownika Claude nie zmieniają obrazu). Sprawdzona tylko atrapa zapytań.
3. Test ucieczki z procesu (W8-BE2) i G5.
4. Interfejsu, Electrona, `sandbox:e2e`, pełnych `check` i `test`.
5. Konfliktów przy scalaniu: dotknięte pliki wspólne `agent-service.ts`, `claude-client.ts`, `main/index.ts`, `local-only-ipc.test.ts`, `COSGRAL-CHANGES.md` (po kilka linii, zostaw obie strony).

## 9. Decyzje do potwierdzenia

1. Polecenie bez znanej ścieżki na working-folder idzie do zwykłej karty (a nie do odmowy).
2. Karta Claude na ask-first bez "Always" na razie.
3. `..` w poleceniu poniżej `full` = "nie da się sprawdzić".
