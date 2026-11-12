# Silnik COSGRAL Workspace: decyzja (12.11.2026)

Autor: Backend Expert. Zakres: silnik, baza danych, Electron, Windows, architektura.
Podstawa: pomiary na tym PC (Windows 10, 12.11.2026), kod bazy 0.1.11 i F1 na Paperclip (`docs/cosgral-raporty/backend-p1-windows-run.md` na `team/backend/p1-windows-run`).

## Następny krok

1. **Lider:** zatwierdź decyzję poniżej i dopisz link do niej w `docs/cosgral/PLAN.md`. Ok. 5 min.
2. **Backend (ja):** B1 — lokalne konta bez zewnętrznej usługi, zielone testy na Windows, agenci Claude i Codex w czacie, instalator. Wychodzę od pomiarów z sekcji 5.

## 1. Decyzja

**Silnikiem jest OpenBot 0.1.11 (Apache-2.0), który dalej rozwijamy sami.**

- Paperclip pozostaje wstrzymany. Służy tylko jako źródło wzorców (MIT), które przenosimy jako małe moduły.
- Inne otwarte silniki (Goose, AnythingLLM, Jan) odrzucamy: mają inny kształt produktu i nie wyglądają jak OpenBot.

Najważniejszy argument: OpenBot 0.68 wyrósł z tego samego silnika. W 0.1.11 agent dostaje narzędzia przez wbudowane serwery MCP: `openbot_browser` (6 narzędzi) i `openbot` (2 narzędzia). W OpenBocie 0.68, w którym zespół teraz pracuje, ten sam model obejmuje 138 narzędzi (104 ogólne i 34 przeglądarki, policzone 12.11 z katalogu narzędzi widocznego dla agenta): kanały, pamięć, skille, rutyny, przepływy, tabele, strony, Vault, zrzuty ekranu i inne. Luka dotyczy więc szerokości funkcji, a nie architektury. Każdą brakującą funkcję dokładamy według jednego wzoru (sekcja 3).

## 2. Porównanie (pomiary z tego PC i kod, 12.11.2026)

Wiersze o kontach, rutynach i dostawcach w Paperclip opisują kod (np. tryb `authenticated` z Better Auth, katalog `packages/adapters`). Tych funkcji nie uruchamiałem.

| Kryterium | OpenBot 0.1.11 | Paperclip |
|---|---|---|
| Kształt produktu jak OpenBot 0.68 (desktop, agenci w czacie, przeglądarka agenta, czat zespołu) | ✓ | — |
| Wygląd podobny do OpenBota bez projektowania od zera | ✓ | — |
| Ten sam model rozszerzeń co 0.68 (narzędzia agenta jako wbudowany MCP) | ✓ | — |
| Baza danych w procesie aplikacji (SQLite, bez osobnego serwera) | ✓ | — |
| Okno w < 10 s na tym PC | ✓ | — |
| Instalacja zależności w < 10 min | ✓ | — |
| Build aplikacji bez Rust i bez basha | ✓ | — |
| Kod, który 4 agentów jest w stanie znać w całości (< 100 tys. linii) | ✓ | — |
| Agenci Claude i Codex | ✓ | ✓ |
| Licencja na prywatny użytek i zmiany | ✓ | ✓ |
| Konta i wielu użytkowników bez zewnętrznej usługi | — | ✓ |
| Rutyny, skille, sekrety, zatwierdzenia, budżety gotowe w silniku | — | ✓ |
| Więcej dostawców (Gemini, Grok, OpenCode, Kimi, Cursor) | — | ✓ |
| Aktywny upstream, z którego wolno brać poprawki | — | ✓ |

Liczby:

| Pomiar | OpenBot 0.1.11 | Paperclip | Źródło |
|---|---|---|---|
| Pliki w repo | 380 | 13 658 | `git ls-files` |
| Linie TS/TSX bez testów | 39 494 (166 plików) | 1 516 675 (5 815 plików) | zliczenie 12.11 |
| Instalacja zależności | 9 min 20 s (u lidera 3 min 36 s) | 25 min 43 s | mój pomiar 12.11 |
| Typecheck | node 31 s i renderer 43 s, 0 błędów | 243 błędy środowiskowe (brak runnera w Rust) | mój pomiar 12.11 |
| Build | 28 s | serwer wymaga basha i Rust | mój pomiar 12.11 |
| Testy backendu na Windows | 29/96; 63 z 70 komunikatów błędów mają jedną przyczynę (sekcja 5) | nie uruchamiałem całości | mój pomiar 12.11 |
| Start okna | 3,2 s | 62–117 s | mój pomiar 12.11 |
| Baza danych | `node:sqlite` w procesie | embedded Postgres jako osobny proces: 3 blokery Windows (sieroty, twardy stop, monit zapory), naprawione w F1 | F1 |

Inne silniki (licencje według wyszukiwania 12.11; plików LICENSE w repozytoriach nie sprawdzałem):

- **Goose** (Block, obecnie pod fundacją AAIF): Apache-2.0. Aplikacja desktopowa, CLI i API dla jednej osoby, rozszerzenia przez MCP. [github.com/block/goose](https://github.com/block/goose)
- **AnythingLLM** (Mintplex Labs): MIT. Desktop i Docker, przestrzenie robocze, agenci, RAG, MCP. [github.com/Mintplex-Labs/anything-llm](https://github.com/mintplex-labs/anything-llm)
- **Jan**: od 05.2025 Apache-2.0. Społeczność kwestionuje, czy zmiana licencji była zgodna z prawem bez zgody autorów wkładów. Lokalny czat z modelami. [wątek r/LocalLLaMA](https://redlib.ssps.io/r/LocalLLaMA/comments/1ksjkhb/jan_is_now_apache_20)

Żaden z nich nie ma kształtu OpenBota: wielu nazwanych agentów, kanałów z liderem i zadaniami, czatu ludzi z agentami i wspólnej przeglądarki z przejęciem. Każdy wymagałby nowego wyglądu. Przegrywają z 0.1.11 w dwóch najważniejszych dla właściciela kryteriach: „wszystko co OpenBot” i „wygląda jak OpenBot”.

## 3. Jak silnik ma być lepszy niż OpenBot (zakres Backend)

Każdy punkt ma kryterium odbioru. Kolejność odpowiada falom z planu.

1. **Działa bez cudzej chmury (B1).** W 0.1.11 tożsamość (logowanie e-mailem, awatar), bilety do serwera zespołu, zaproszenia i tunele zależą od zewnętrznej usługi kont (`apps/auth-api`, w stylu Cloudflare: D1, tunele). Pomiar z 12.11: bez tej usługi całe UI stoi na ekranie łączenia z usługą kont, a nawet odczyt stanu rozmów kończy się błędem 401 („najpierw się zaloguj”). U nas będzie lokalny profil właściciela, zaproszenia na tokenach podpisywanych przez nasz serwer zespołu i łączność przez LAN albo Tailscale, bez Cloudflare. Wolę lokalny profil od lokalnego `auth-api`: nie wymaga e-maila (SMTP), emulacji Cloudflare ani dodatkowego procesu. Ostateczny wybór, z dowodem, zapadnie w B1.
   *Odbiór:* przy wyłączonej sieci program startuje, agent odpowiada (z lokalnym CLI), a drugi komputer w LAN dołącza do zespołu z zaproszenia.
2. **Windows jako system pierwszej klasy (B1, W3).** Baza powstała pod macOS. Zdalny pulpit (`remote-mac.ts`) łączy się tylko z Makiem (VNC, porty 5901–5999) przez tunel Cloudflare, a testy mają atrapy pod macOS. U nas testy przechodzą na Windows, a zdalny pulpit i Computer Use działają z Windowsem jako celem.
   *Odbiór:* `test:backend` w 100% na Windows; agent steruje oknem Windows po zgodzie człowieka.
3. **Jedna szyna funkcji.** Każda funkcja to magazyn w SQLite, kontrakt IPC w `packages/contracts`, narzędzie w wbudowanym serwerze MCP i widok w UI. Ta sama funkcja jest wtedy dostępna dla człowieka, dla agenta i (lepiej niż w OpenBocie) przez nasz serwer MCP na loopback dla innych programów.
   *Odbiór:* każdy wiersz parytetu W1–W3 (`docs/cosgral/parytet-0.68.md`) ma test kontraktu narzędzia i test UI.
4. **Odporne dane.** SQLite w trybie WAL, automatyczna kopia przed migracją i codzienna kopia, test przywracania. Lekcja z F1: żadnych osobnych procesów bazy, które mogą osierocieć.
   *Odbiór:* zabicie procesu w trakcie zapisu, a po restarcie brak utraty danych; kopia odtwarza się testem.
5. **Więcej dostawców modeli (W3).** Wzorce adapterów z Paperclip (MIT): Gemini, Grok, OpenCode, Kimi, Cursor, przeniesione jako małe klienty obok `claude-client.ts` i `app-server-client.ts`.
   *Odbiór:* wspólny test kontraktu dostawcy przechodzi dla każdego.
6. **Bezpieczeństwo domyślne.** Sekrety (Vault, klucze) w Electron `safeStorage` (DPAPI), serwery tylko na loopback, dopóki człowiek nie włączy zespołu. Jawna zgoda i widoczny wskaźnik dla ekranu i kamery (oczy agenta).
   *Odbiór:* przegląd bezpieczeństwa: brak sekretów w SQLite jawnym tekstem, brak nasłuchu poza loopback w trybie solo.
7. **Szybkość i diagnostyka.** Budżet: okno < 3 s, bezczynność < 300 MB RAM. Paczka diagnostyczna (logi per agent i wątek, bez sekretów) jednym kliknięciem.
   *Odbiór:* pomiar w każdym wydaniu, w raporcie.

## 4. Ryzyka i jak je ograniczamy

| Ryzyko | Skutek | Co robimy |
|---|---|---|
| Baza 0.1.11 jest zamrożona; nowszy OpenBot ma licencję niekomercyjną | Wszystko po 0.1.11 piszemy sami, to tygodnie pracy | Spis zachowań od Testera (B2) jako umowa, jeden wzór funkcji (sekcja 3.3), fale W1–W3 |
| Skażenie kodem nowszego OpenBota | Ryzyko prawne | Implementujący nie otwierają kodu po `a6fe240` ani paczki 0.68; źródła zapisujemy w raportach |
| Świeży stos (SolidJS 2 RC, Electron 43, bun 1.3) | Błędy bibliotek | Wersje przypięte w `bun.lock`, aktualizacje osobnymi commitami z testami |
| CLI agentów (Claude Code, Codex) wymagają kont u dostawców | Agent nie odpowie bez logowania CLI | B1 opisze dokładnie, czego brakuje na danym PC |
| Licencje zależności | Claude Agent SDK podlega komercyjnym warunkom Anthropic (nie open source), noVNC ma MPL-2.0; reszta rdzenia to MIT | Prywatnemu użytkowi to nie przeszkadza. noVNC zostawiamy bez zmian; przy ewentualnej dystrybucji sprawdzić warunki Anthropic |
| Paperclip ma funkcje, których nie mamy (rutyny, budżety, wielu użytkowników) | Kusi łączenie dwóch silników | Bierzemy tylko wzorce i małe moduły, nigdy całej platformy ani Postgresa |

## 5. Pomiar bazy 0.1.11 na Windows (12.11.2026, mój worktree)

Worktree `Shared\cosgral-wt\desktop-backend`, gałąź `team/backend/b1-local-core` od `23ca29fa9`. Logi: `Shared\cosgral-data\desktop-backend\logs\`.

```powershell
$env:PATH = "C:\Users\x1 Yoga\OpenBot\Shared\tools\bun;C:\Users\x1 Yoga\OpenBot\Shared\tools\node;C:\Users\x1 Yoga\OpenBot\Shared\tools\git\cmd;$env:PATH"
bun install                  # 560 s, EXIT 0
bun run typecheck:node       # 31 s, EXIT 0
bun run typecheck:renderer   # 43 s, EXIT 0
bun run test:backend         # 103 s, 29/96 passed, 6 z 12 plików pada
bun run build                # 28 s, EXIT 0
```

**Testy backendu: przyczyny błędów.** 67 testów padło i dało 70 komunikatów, bo jeden test może zgłosić więcej niż jeden błąd:

| Komunikaty | Przyczyna | Kierunek naprawy (B1) |
|---|---|---|
| 63 | `EBUSY: resource busy or locked, unlink`: test usuwa katalog, w którym baza SQLite jest jeszcze otwarta; Windows nie pozwala usunąć otwartego pliku | zamykać bazę przed sprzątaniem (`afterEach`), sprzątanie z ponowieniem |
| 1 | `EPERM: … symlink`: dowiązanie symboliczne wymaga trybu dewelopera Windows | junction albo pominięcie na Windows |
| 1 | prawa pliku 0666 zamiast 0600: na Windows nie ma praw POSIX | inna asercja na Windows |
| 2 | atrapa CLI Codex App Server to skrypt pod macOS (limit czasu, nieoczekiwane wyjście) | atrapa `.cmd`/`.mjs` uruchamiana przez Node |
| 3 | stan logowania CLI (`blocked`, brak konta Claude) | zbadać w B1 razem z wykrywaniem CLI na Windows |

67 z 70 komunikatów to błędy uprzęży testów pod Windows, a nie logiki silnika. Pozostałe 3 dotyczą wykrywania logowania CLI i mogą być prawdziwym błędem Windows.

**Start w piaskownicy** (osobne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`):

- Okno „COSGRAL Workspace” po 3,2 s. Zamknięcie okna: proces kończy się po 0,7 s i nie zostaje żaden proces.
- Dane powstały tylko w piaskownicy (`…\AppData\Roaming\COSGRAL Workspace Dev` i `~\COSGRAL Workspace` w udawanym profilu). Prawdziwe `APPDATA` i katalog domowy są nietknięte.
- Aplikacja nie otwiera żadnego portu TCP. Z włączonym DevTools do zrzutu nasłuch był tylko na `127.0.0.1`.
- Treść okna (zrzut przez DevTools, poza repo: `Shared\cosgral-data\desktop-backend\evidence\sandbox-content.png`): ciemny motyw, ekran „łączenie z usługą kont”, który nie mija. To blokada z sekcji 3.1.
- **Uwaga do procedury piaskownicy w planie:** Electron wylicza `appData` jako `%USERPROFILE%\AppData\Roaming`, a nie z `%APPDATA%`. Bez folderów `AppData\Roaming` i `AppData\Local` wewnątrz udawanego `USERPROFILE` start kończy się błędem `Failed to get 'appData' path`. Działający układ:

```powershell
$sb = "C:\Users\x1 Yoga\OpenBot\Shared\cosgral-data\<rola>\sandbox\home"
New-Item -ItemType Directory -Force "$sb\AppData\Roaming", "$sb\AppData\Local\Temp" | Out-Null
$env:USERPROFILE = $sb; $env:APPDATA = "$sb\AppData\Roaming"; $env:LOCALAPPDATA = "$sb\AppData\Local"
$env:TEMP = "$sb\AppData\Local\Temp"; $env:TMP = $env:TEMP
& ".\node_modules\electron\dist\electron.exe" .
```
