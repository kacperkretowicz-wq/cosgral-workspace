# Backend A1: oczy agenta (12.11.2026)

Gałąź `team/backend/a1-agent-eyes`, założona od `team/backend/b1-local-core` (B1 nie było jeszcze scalone), worktree `Shared\cosgral-wt\desktop-backend`. Czas: ok. 2,5 h.

## Następny krok

1. **Lider (ok. 20 min):** przegląd i scalenie. Najpierw B1 (4 commity), potem A1 (3 commity, lista w sekcji 9).
2. **UI Designer:** wskaźnik „agent patrzy” z przyciskiem Stop oraz tytuły karty zgody. Kontrakt jest w sekcji 6.
3. **Właściciel:** nic nie musi robić. Uwaga na sekcję 7: test Codex zapisał 4 sesje w prawdziwym `~\.codex`.

## Werdykt

| Cel A1 | Stan | Dowód |
|---|---|---|
| Wbudowany serwer narzędzi, tylko stdio / w procesie | ✓ `cosgral_eyes`: Codex przez stdio (App Server), Claude przez serwer MCP w procesie; bez portów sieciowych | sekcja 2 |
| Lista okien, zrzut okna, zrzut ekranu, zdjęcie z kamery, podgląd na żywo | ✓ 5 narzędzi | sekcja 1 |
| Zgoda przez kartę zatwierdzenia z bazy, kamera osobno | ✓ ekran raz na rozmowę, kamera przy każdym zdjęciu | sekcja 3, run „final” |
| Widoczny wskaźnik i Stop | ✓ zdarzenia i IPC gotowe; tymczasowo napis w tytule okna. Wskaźnik w UI robi UI Designer | sekcje 3 i 6 |
| Obrazy tylko lokalnie, z czyszczeniem | ✓ `userData\eyes`, 24 h, najwyżej 200 plików | sekcja 4 |
| Agent opisuje zrzut okna testowego w piaskownicy | ✓ prawdziwy Codex CLI 0.167.2: „PELIKAN, 4711, blue triangle, okno Notatnika” po 12 s | sekcja 5 |
| Testy | ✓ 17 nowych testów; `test:backend` i cały zestaw zielone | sekcja 8 |

## 1. Narzędzia agenta (`cosgral_eyes`)

| Narzędzie | Argumenty | Co robi | Zgoda |
|---|---|---|---|
| `list_sources` | — | lista okien i ekranów: `id`, `kind`, `title` | ekran, raz na rozmowę |
| `look_at_window` | `windowId` albo `titleContains` | jeden obraz jednego okna (tylko to okno, nie cały pulpit) | ekran |
| `look_at_screen` | `screenId` (domyślnie pierwszy ekran) | jeden obraz ekranu | ekran |
| `take_photo` | — | jedno zdjęcie z kamery | kamera, **każde zdjęcie osobno** |
| `watch` | `target: window/screen`, okno lub ekran, `frames` 2–6, `intervalSeconds` 1–10 | podgląd na żywo: kilka klatek w odstępach, najwyżej 60 s, Stop w każdej chwili | ekran |

Wynik zaczyna się od ścieżki zapisanego obrazu i wskazówki „otwórz przez `view_image`”, a dalej jest obraz (`inputImage`). Obrazy to JPEG, dłuższy bok do 1600 px.

## 2. Jak to działa (architektura)

- **Rdzeń:** `src/backend/eyes-service.ts`, niezależny od Electrona i w pełni testowany. Odpowiada za:
  - narzędzia i kontrolę argumentów;
  - zgody: ekran zapamiętany dla rozmowy, kamera zawsze pytana;
  - sesje „patrzy”, podgląd na żywo z przerwaniem;
  - zapis i czyszczenie obrazów.
- **Codex:** przestrzeń `cosgral_eyes` w `dynamicTools` przy `thread/start` i `thread/resume`. Wywołania idą tym samym kanałem stdio (JSON-RPC App Servera) co narzędzia przeglądarki z bazy.
- **Claude:** dodatkowy serwer MCP w procesie (`createSdkMcpServer`, nazwa `cosgral_eyes`) obok `openbot_browser` i `openbot`.
- **Zbieg w jednym miejscu:** oba silniki trafiają do `AgentService.#handleEyesTool`.
- **Nasłuch sieciowy: brak.** Serwer MCP na loopback dla innych programów („funkcja dla API”) to osobny krok, razem z publicznym API platformy (W3).
- **Przechwytywanie na Windows** (`src/main/eyes-capture.ts`):
  - okna i ekrany: `desktopCapturer.getSources`, obraz w żądanym rozmiarze;
  - kamera: `getUserMedia` w ukrytym oknie. Strona kamery działa na własnym schemacie `cosgral-eyes://` oznaczonym jako bezpieczny, bo `about:blank` i `data:` nie dają dostępu do kamery (sprawdzone próbą). Okno ma osobną sesję, która zezwala tylko na wideo i tylko na czas robienia zdjęcia. Po zdjęciu ścieżki kamery są zatrzymywane, a okno niszczone.
- **Testowa kamera:** build dev uruchomiony z `COSGRAL_FAKE_CAMERA=1` używa wirtualnej kamery Chromium. Prawdziwa kamera nie była włączana w testach. W buildzie produkcyjnym ta opcja nie działa.

## 3. Zgoda użytkownika

1. Agent wywołuje narzędzie. Gdy w tej rozmowie nie ma jeszcze zgody na ekran (albo zawsze, gdy chodzi o kamerę), serwis pokazuje **kartę zatwierdzenia z bazy** (zdarzenie `approval`) i wstrzymuje wywołanie do decyzji:
   - `kind: "screen"`: „New agent wants to look at "COSGRAL eyes test — Notatnik". If you approve, it may look at your windows and screens in this conversation until you press Stop. Pictures stay on this computer.”;
   - przy podglądzie na żywo: „…wants to watch "…" live: 3 pictures, 2 s apart…”;
   - `kind: "camera"`: „…wants to take one photo with your camera. You approve every photo separately. It stays on this computer.”
2. **Approve:**
   - ekran: zgoda obowiązuje do końca rozmowy albo do Stop; zdarzenie `eyes-changed` pokazuje ją w `grants`;
   - kamera: zgoda na jedno zdjęcie.
3. **Reject:** narzędzie zwraca „The user did not allow …” i nie robi zdjęcia.
4. **Brak decyzji:** gdy tura się kończy albo jest przerwana, a także przy zatrzymaniu serwisu, karta znika i liczy się jako odmowa. Wywołanie nie wisi; jest na to test.
5. **Patrzy:** każde ujęcie i każdy podgląd to sesja w `eyes-changed.state.sessions`, z postępem klatek przy podglądzie. Do czasu wskaźnika w UI proces główny dopisuje do tytułu okna „— an agent is looking”.
6. **Stop** (`agent:stop-eyes`):
   - z `sessionId`: przerywa to ujęcie;
   - z `botId`: przerywa i cofa zgody tego agenta;
   - bez parametrów: wszystko.

   Przerwany podgląd oddaje agentowi klatki zrobione przed Stop i dopisek „Stopped by the user after N of M frames”.
7. Zgody żyją w pamięci programu: restart czyści je, więc następne użycie znów pyta.

## 4. Obrazy: tylko lokalnie, z czyszczeniem

- Miejsce: `userData\eyes\<botId>\<czas>-<nr>-<window|screen|camera>.jpg`. To folder danych programu; w piaskownicy `…\AppData\Roaming\COSGRAL Workspace Dev\eyes`.
- Obrazy nie trafiają do repo ani do bazy SQLite. Do dostawcy modelu idą tylko w odpowiedzi narzędzia, a to jest cel tej funkcji.
- Czyszczenie przy starcie programu i po każdym zapisie: pliki starsze niż 24 h są usuwane, a zostaje najwyżej 200 najnowszych. Test sprawdza oba warunki.

## 5. Przebieg w piaskownicy: agent opisuje zrzut okna testowego

Warunki:
- piaskownica jak w B1 (osobne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, wyczyszczone zmienne agenta OpenBota);
- prawdziwy Codex CLI 0.167.2 z `Shared\tools\codex-cli`;
- okno testowe: Notatnik z plikiem `COSGRAL eyes test.txt`, w którym jest słowo `PELIKAN`, liczba `4711` i kształt „a blue triangle”;
- sterowanie oknem przez DevTools na 127.0.0.1, jak w B1.

**Run „final” (końcowy build, nowy agent), log:**

```text
17:30:36  turn-started
17:30:40  approval kind=screen  "New agent wants to look at "COSGRAL eyes test — Notatnik". If you approve, ..."
          (skrypt klika Approve)
17:30:41  eyes-changed  grants=1
17:30:41  eyes-changed  session window "COSGRAL eyes test — Notatnik" phase=capturing 0/1
17:30:41  eyes-changed  sessions=[]  (obraz zapisany: eyes\<bot>\…-window.jpg)
17:30:46  turn-completed
Agent: "Secret word: PELIKAN · Number: 4711 · Shape: blue triangle.
        The window is a Notepad document titled "COSGRAL eyes test", displaying the test details on a white page."
stop-eyes → {sessions: [], grants: []}
```

Pozostałe przebiegi:

| Run | Co | Wynik |
|---|---|---|
| `a1-eyes` | pierwsze spojrzenie na okno | poprawna odpowiedź (te same 3 dane) po 17 s; drugie spojrzenie w tej samej rozmowie bez nowej karty. Zapisana klatka: tylko okno Notatnika, 1600×813 |
| `a1-eyes-live` | `watch`: 3 klatki co 2 s | karta „watch … live: 3 pictures, 2 s apart”; `eyes-changed` `phase: watching` z licznikiem 0→1→2→3 co ok. 2,4 s; odpowiedź: „Nothing changed between the three frames”; stop przez IPC czyści zgody |
| `a1-eyes-camera`, `a1-eyes-camera2` | kamera (wirtualna) | karta `camera`, zdjęcie zapisane (1280×720), ale **model nie zobaczył obrazu**; przyczyna i poprawka w sekcji 7.1 |
| `a1-eyes-camera3` | kamera po poprawce | „The photo shows a bright green Pac-Man-like circle on a dark green background, with a timestamp in the upper-left corner” po 11,5 s (to obraz testowy wirtualnej kamery) |

Wszystkie przebiegi zamknęły się czysto, bez pozostałych procesów, a prawdziwe `APPDATA` jest nietknięte. Agent nie wywołał `list_sources`, więc tytuły innych okien na pulpicie nie poszły do modelu. Kamera była wyłącznie wirtualna.

Dowody: `Shared\cosgral-data\desktop-backend\evidence\b1\a1-eyes*`. Są tam zrzuty karty zgody i odpowiedzi, `drive.log` z listą zdarzeń, `saved-frame-1.jpg` (to, co widział agent), `saved-camera.jpg` oraz `summary.json` z listą plików w `eyes`.

## 6. Kontrakt dla UI (wskaźnik „agent patrzy” i Stop)

Typy są w `packages/contracts/src/ipc-eyes.ts`, eksportowane z `@openbot/contracts/ipc`.

**Prośba o zgodę:** zwykłe zdarzenie `approval`.
- `approval.kind`: `"screen"` lub `"camera"`.
- `approval.eyes: AgentEyesRequest = {source: "screen"|"window"|"camera", targetLabel, live, frames, intervalSeconds|null}`. `frames: 0` oznacza prośbę o listę okien.
- `approval.reason`: gotowy tekst karty; `command` = null.
- Odpowiedź: `agent.respondToApproval({requestId, decision})`, jak dziś.
- Dziś karta z bazy pokazuje ogólny tytuł „Grant permissions?” (`ConversationPrompts.tsx`). Proponuję własne tytuły i ikony, np. „Pozwolić agentowi zobaczyć okno?” i „Zrobić zdjęcie kamerą?”.

**Patrzy / nie patrzy:** zdarzenie `eyes-changed {state}` w kanale zdarzeń agenta oraz `agent.getEyesState?.()`.
- `state.sessions[]: AgentEyesSession = {id, botId, threadId, turnId, source, targetLabel, phase: "capturing"|"watching", framesCaptured, framesPlanned, startedAt, endsAt|null}`. Niepusta lista oznacza „agent patrzy” (pokaż wskaźnik). Przy `phase: "watching"`: postęp `framesCaptured / framesPlanned` i `endsAt`.
- `state.grants[]: AgentEyesGrant = {botId, threadId, source: "screen", grantedAt}`: rozmowa ma stały dostęp do ekranu. Dobre miejsce: znaczek przy agencie albo w nagłówku rozmowy.

**Stop:** `agent.stopEyes?.(input)` zwraca nowy `AgentEyesState`.
- `{sessionId}`: zatrzymaj to ujęcie;
- `{botId}`: zatrzymaj agenta i cofnij jego zgody;
- `{}`: wszystko.

**Zespół:** oczy działają tylko na tym komputerze; dla serwera zdalnego IPC zwraca pusty stan.

`getEyesState` i `stopEyes` są w `AgentDesktopApi` opcjonalne (`?.`), żeby nie łamać atrap UI (`mock-openbot.ts`, `App.test.tsx`). Gdy UI je doda, zmienię je na wymagane.

## 7. Uwagi i ograniczenia

1. **Codex 0.16x i tryb „exec” (znalezione w piaskownicy, obejście jest, właściwa poprawka później).**
   - Nowy Codex woła narzędzia ze skryptu JavaScript i zwykle szuka obrazu w `result.content` (kształt MCP).
   - Wynik naszych narzędzi (tak samo jak narzędzi przeglądarki z bazy) dostaje jako jeden tekst, w którym obraz jest długim `data:…base64`. Pętla modelu nic więc nie wypisywała, a model mówił „no image”.
   - Obejście w tym zadaniu: wynik zaczyna się od ścieżki pliku i wskazówki `view_image`, a opisy narzędzi i instrukcje agenta mówią to samo. Po zmianie okno i kamera działały za pierwszym razem.
   - Właściwa poprawka: wystawić `cosgral_eyes` Codexowi jako prawdziwy serwer MCP (wynik jako obiekt z obrazem), razem z serwerem MCP na loopback dla API (W3). Ten sam problem dotyczy zrzutu przeglądarki z bazy.
2. **Codex nie czeka bez końca na zgodę.** Gdy karta zostaje bez odpowiedzi, Codex po ok. 2 min (gdy kończy się jego skrypt) anuluje wywołanie („dynamic tool call was cancelled before receiving a response”). Po naszej stronie karta znika z końcem tury i liczy się jako odmowa. W UI warto pokazać, że prośba wygasa.
3. **Izolacja piaskownicy a Codex.** Codex ustala katalog domowy przez Windows, a nie przez `USERPROFILE`, więc w piaskownicy użył prawdziwego `~\.codex`: logowania (`auth.json`) i zapisu sesji.
   - Moje testy (B1 „pong” i A1) zapisały tam 4 pliki sesji. Mają dzisiejszą datę i godziny 17:06, 18:15, 18:29 i 18:30, zawierają wyłącznie treść testów (polecenia, okno Notatnika, wirtualną kamerę) i pokażą się w `codex resume`.
   - Nie usuwałem ich, bo Codex trzyma też indeks sesji, a to nie jest mój katalog. Właściciel może je usunąć.
   - Na przyszłość: piaskownica z własnym `CODEX_HOME` wymaga osobnego logowania Codex w piaskownicy.
   - W raporcie B1 przypisałem logowanie Menedżerowi poświadczeń Windows; właściwym źródłem jest `~\.codex\auth.json`.
4. Okno zminimalizowane nie daje obrazu. Narzędzie zwraca wtedy czytelny błąd.
5. **Prawdziwa kamera nie była testowana** (prywatność). Kod obsługuje typowe błędy: wyłączona kamera w ustawieniach prywatności Windows, brak kamery, kamera zajęta przez inną aplikację.
6. Claude: narzędzia są zarejestrowane (jest test), ale bez przebiegu w piaskownicy, bo Claude nie jest zalogowany (B1).
7. Konsola DevTools i port 127.0.0.1 działały tylko w przebiegach testowych.

## 8. Testy

| Zestaw | Wynik |
|---|---|
| `eyes-service.test.ts` | 11/11: zgoda raz na rozmowę; odmowa; kamera osobno za każdym razem; sesje „patrzy”; podgląd z postępem; Stop w trakcie podglądu i ponowna zgoda; limity; brak okna; zapis i czyszczenie; wynik ze ścieżką i `view_image`; `stop()` cofa zgody. Mutacje sprawdzone: bez zapamiętania zgody → 2 testy czerwone; Stop bez cofania zgód → 2 czerwone |
| `agent-service.test.ts` (nowe 3) | karta zatwierdzenia przed obrazem i odpowiedź z obrazem; Reject = brak obrazu; koniec tury bez odpowiedzi nie zostawia wiszącego wywołania |
| `claude-client.test.ts` (nowy 1) | Claude dostaje serwer `cosgral_eyes` obok `openbot_browser` i `openbot` |
| `ipc-eyes.test.ts` (kontrakt, 2) | walidacja zdarzenia `eyes-changed`; bez nowej gałęzi walidacji test pada |
| `test:backend` | **117/117** (13 plików; po B1 było 102) |
| `bun run test` (wszystko) | **472/472** (61 plików, 331 s; po B1 było 455) |
| typecheck node/renderer/storybook/contracts, Biome | 0 błędów |

## 9. Commity

| Commit | Zmiana |
|---|---|
| `ca14da31e` | oczy agenta: kontrakt, `EyesService`, narzędzia dla Codex i Claude, przechwytywanie w Electronie, IPC, tytuł okna |
| `032b5c1dd` | wynik narzędzi czytelny w trybie „exec” Codex (ścieżka + `view_image`) |
| (ten raport) | raport A1 |

Zmiany plików bazy są w `COSGRAL-CHANGES.md`. Bez push.

## 10. Zapisane poza repo

- `Shared\cosgral-data\desktop-backend\`:
  - `evidence\b1\a1-eyes*` (przebiegi);
  - `eyes-test\` (plik okna testowego);
  - piaskownica `sandbox-b1\` ze zrzutami w `eyes`;
  - skrypty `run-sandbox.ps1` (nowe opcje `-FakeCamera`, `-TestWindowFile`) i `cdp-drive.mjs` (kroki `send`, `waittext`, `waitturn`, `events`, `stopeyes`).
- Prawdziwy `~\.codex\sessions`: 4 sesje testowe (sekcja 7.3).
