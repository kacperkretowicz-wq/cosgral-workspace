# COSGRAL Workspace „OpenBot+” — plan zespołu (12.11.2026)

Lider: Okiestrator. Zespół: Backend Expert (Claude Opus), UI Designer (Cursor), Tester (Codex).
Kanał: „Projekt COSGRAL WORKSPACE” w OpenBot.

## 00. AKTUALNY KIERUNEK (12.11.2026, później): droga B

Właściciel nie aktywuje licencji Team. Program ma być tylko dla nas i mieć wszystkie funkcje OpenBota. Budujemy go na OpenBocie 0.1.11 (Apache-2.0) w gałęzi `codex/cosgral-desktop` (worktree `Shared\cosgral-desktop`). Plan: `docs/cosgral/PLAN.md` w tej gałęzi. Sekcja 0 poniżej (droga A) jest nieaktualna.

## 0. (nieaktualne) KIERUNEK OD 12.11.2026: droga A

Właściciel chce programu identycznego z OpenBotem, tylko lepszego, i to tylko na własny użytek. Wybrał drogę A z `2026-11-12-cosgral-openbot-1to1-paths.md`: **licencja komercyjna OpenBot + nasze dodatki**. Sekcje 2–5 poniżej (silnik Paperclip) są od teraz historią.

| Etap | Kto | Zakres | Gotowe, gdy |
|---|---|---|---|
| **A0** | Właściciel | Licencja Team dla 2 osób w OpenBocie: Ustawienia → Rozliczenia (0 € do 1.12.2026) | Licencja aktywna. Do tego czasu nie zmieniamy kodu OpenBota. |
| **A1** (dziś) | Tester | Które życzenia „lepszy” OpenBot 0.68 już spełnia, a które nie: wspólna sesja na żywo, oczy agenta (okno/ekran/kamera na Windows), Plugin Studio, wygląd | Lista realnych luk z testami akceptacyjnymi. Nie budujemy tego, co już jest. |
| **A1** (dziś) | Backend Expert | Zamknąć F1 Paperclip czystym commitem. Zbadać punkty rozszerzeń OpenBota (skille, serwery MCP, wtyczki). Prototyp MCP „Oczy agenta” na Windows | Agent w OpenBocie robi zrzut wskazanego okna po zgodzie człowieka |
| **A1** (dziś) | UI Designer | „Lepszy wizualnie” w ramach licencji: co da się zrobić dodatkami, a co tylko zmianą w prywatnym forku. 3 propozycje z kryteriami, bez kodu | Lider akceptuje propozycje |
| **A2** | Zespół | Dodatki jako nasz kod w `addons/` tego repo: serwery MCP i skille (Oczy, Plugin Studio, kolejne luki z A1) | Każdy dodatek ma test, dowód i raport |
| **A3** | Backend + UI | Prywatny fork OpenBota tylko na zmiany, których nie da się zrobić dodatkiem | Mały diff, scalany z wydaniami OpenBota |

**Zasady drogi A (dodatkowe):**
1. Kod OpenBota i nasze zmiany w nim **nigdy nie trafiają do publicznego repo** ani do innych firm (licencja §6.2). Fork trzymamy lokalnie albo w prywatnym repo.
2. Nie zmieniamy nazwy ani logo OpenBot (licencja §6.3).
3. Dodatki w `addons/` to wyłącznie nasz kod, bez fragmentów kodu OpenBota.
4. Paperclip jest wstrzymany i zostaje jako archiwum pomysłów. Kopia OpenBota 0.1.11 (Apache-2.0) w `Shared\upstream` zostaje jako plan B, gdyby zmieniły się warunki licencji.

## 1. Cel

Aplikacja desktopowa na Windows, która robi wszystko co OpenBot, a do tego więcej:

1. **Wspólne sesje na żywo**: ludzie i agenci w jednym projekcie, obecność, pisanie, opcjonalny tryb „obserwuj”.
2. **Tworzenie agentów**: profil, model, konto, skille, MCP, uprawnienia, szablony.
3. **Oczy agenta** (jak Grok): agent widzi wskazane okno, ekran albo kamerę na żywo, z wyraźnym wskaźnikiem i zgodą człowieka.
4. **Plugin Studio**: agent tworzy dla siebie skill albo narzędzie MCP → test w piaskownicy → zatwierdzenie człowieka → dostępne dla wszystkich agentów.
5. **Wygląd i UX lepsze niż w OpenBocie**: spokojny, premium, czytelny (DESIGN.md, impeccable).

## 2. Stan wyjściowy (gałąź `codex/cosgral-workspace`, commit `bd5217608`)

| Obszar | Stan |
|---|---|
| Silnik | Paperclip (MIT): Express + embedded Postgres + React/Vite. Agenci, rutyny, zatwierdzenia, sekrety, skille, koszty, adaptery Claude/Codex/Cursor/Gemini. |
| Milestone 1 | Dwa konta, wspólna rozmowa projektu, koordynator, delegowanie, filtry, personalizacja. Pakiet E2E `scripts/cosgral-e2e-*.mjs`. |
| Powłoka | `app-shell/`: Electron 37, sam podnosi backend, konfiguracja NSIS. Budowa `.exe` niezweryfikowana. |
| UI | `ui/src/components/MultiAgentCanvas.tsx` i tokeny ruchu OLED (12.11). Niesprawdzone wizualnie. |
| Analiza OpenBota | `docs/cosgral-raporty/claude-k-openbot-ux-map.md` (OpenBot 0.67.1, REA statyczne). Na tym PC jest OpenBot **0.68.0**. |

Luki względem OpenBota: kanały grupowe z liderem i zadaniami, karty akcji w czacie (pytanie, zatwierdzenie, podgląd), stany agentów w pasku bocznym, Vault, wbudowana przeglądarka agenta z przejęciem, pamięć „zawsze / w razie potrzeby”, Mobile Connect, dok i wyspa, prosty onboarding.

Ryzyka znane z audytu: start embedded Postgres na Windows, nietrwały sekret JWT, tylko tryb `local_trusted`.

## 3. Licencje

- OpenBot: PolyForm Noncommercial 1.0.0. Badamy zachowanie i UX (REA, obserwacja). **Nie kopiujemy kodu, tekstów, grafik, nazw ani brandingu.**
- Paperclip: MIT. Zachowujemy LICENSE i historię upstream.
- Skille zespołu: i-have-adhd (MIT), superpowers (MIT), graphify (MIT), impeccable (Apache 2.0), REA (MIT).

## 4. Fazy

| Faza | Zakres | Kryterium ukończenia |
|---|---|---|
| **F1 — fundament** (teraz) | Uruchomienie całości na tym PC; plan powłoki UI; macierz parytetu z OpenBotem; graf repo | **Bramka G1** (decyzja silnika §4): okno Electron, `/api/health` 200, 3 restarty bez ręcznego `pg_ctl`, jeden przebieg agenta na Windows, czas zimnego startu; zaakceptowany shape UI ✓; macierz parytetu w repo |
| F2 — rdzeń OpenBota | **F2.0 kierunek wizualny + porównanie z OpenBotem**; kanały z liderem i zadaniami (na issues i koordynatorze Paperclip), karty akcji w czacie przez serwer MCP COSGRAL (jeden kontrakt dla wszystkich agentów), stany agentów w pasku bocznym | Scenariusz: wiadomość → zadanie → przydział → wynik, widoczny u dwóch osób |
| F3 — oczy i przeglądarka | Podgląd okna/ekranu/kamery dla agenta (Electron `desktopCapturer` → narzędzie MCP → model z wizją), lokalna przeglądarka agenta na `WebContentsView` z przejęciem | Agent opisuje bieżące okno; człowiek przejmuje logowanie |
| F4 — Plugin Studio, pamięć, Vault | Agent tworzy skill/MCP → test → zatwierdzenie → katalog; pamięć zawsze/w razie potrzeby; Vault na `safeStorage` | Agent sam tworzy i używa nowego narzędzia po zatwierdzeniu |
| F5 — dystrybucja | Instalator NSIS `.exe`, autoaktualizacja, telefon (PWA przez Tailscale), dok/wyspa | Czysta instalacja na Windows 10 i pierwszy agent w < 5 min |

## 5. Przydział F1

| Kto | Zadanie | Worktree / gałąź | Wynik |
|---|---|---|---|
| Backend Expert | Uruchomić całość na tym PC, naprawić blokery Windows, ustalić osobne porty i dane dla każdej instancji, opisać procedurę | `Shared\cosgral-wt\backend` · `team/backend/p1-windows-run` | `docs/cosgral-raporty/backend-p1-windows-run.md` + commity |
| UI Designer | impeccable `shape` powłoki „OpenBot+” (szyna, pasek boczny ze stanami, czat z kartami akcji, panel boczny, kanały) + krytyka Canvas; **bez kodu** do akceptacji | `Shared\cosgral-wt\ui` · `team/ui/p1-shell-shape` | `doc/plans/2026-11-12-ui-shell-shape.md` |
| Tester | REA OpenBota 0.68.0 (różnice względem mapy 0.67.1) i macierz parytetu: każda funkcja OpenBota → stan w COSGRAL → test akceptacyjny | `Shared\cosgral-wt\tester` · `team/tester/p1-openbot-parity` | `docs/cosgral-raporty/tester-p1-openbot-parity.md` |
| Okiestrator | Graf repo (graphify), review i scalanie, kolejne przydziały | `Shared\cosgral-workspace` (integracja) | ten plan, merge'e |

## 6. Zasady pracy

1. **Wiadomości**: zawsze w stylu `i-have-adhd`: najpierw następny krok, potem stan i konkretny czas.
2. **Złożona praca**: `superpowers`: plan (writing-plans), TDD, systematic-debugging, verification-before-completion.
3. **UI**: najpierw `impeccable shape`, akceptacja lidera, dopiero kod. `DESIGN.md` to źródło prawdy; `ui/` tylko na tokenach; `pnpm check:token-gates` przed commitem.
4. **Graf**: `graphify` na `Shared\cosgral-workspace\graphify-out`. Najpierw zapytanie do grafu, po zmianach w kodzie `graphify update .`.
5. **REA**: tylko do zachowania OpenBota; wyniki własnymi słowami.
6. **Git**: każdy pracuje w swoim worktree i na swojej gałęzi. Do integracji scala tylko lider po przeglądzie. Bez `push` do GitHuba, dopóki właściciel nie da tokenu. Bez force-push i bez usuwania cudzych plików.
7. **Commit**: mały, opisowy, z trailerem `Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>`.
8. **Gotowe** = testy przeszły + dowód (log, zrzut ekranu) + raport w `docs/cosgral-raporty/`. Funkcje sprawdza Tester przed scaleniem.
9. **Bezpieczeństwo**: serwer tylko na loopback, sekrety poza repo, żadnych kluczy w czacie ani commitach.
10. **Repo `AGENTS.md`** obowiązuje (zasady Paperclip: zakres firmy, kontrakty db/shared/server/ui, plany w `doc/plans/`).

## 6a. Decyzje lidera (12.11.2026)

- **Silnik:** zostaje Paperclip jako warstwa sterowania. Warstwę uruchomieniową (Electron, ACP, serwer MCP dla agentów, `WebContentsView`, `safeStorage`) budujemy na wzór architektury OpenBota, własnym kodem. Hermes i OpenClaw działają jako agenci w środku. Szczegóły, porównanie i plan awaryjny dla bazy: `doc/plans/2026-11-12-cosgral-engine-decision.md`.
- **Shape UI** (`doc/plans/2026-11-12-ui-shell-shape.md`): zaakceptowany z poprawkami z §6 dokumentu decyzji.

## 7. Narzędzia na tym PC (bez instalacji systemowej)

```powershell
$env:PATH = "C:\Users\x1 Yoga\OpenBot\Shared\tools\node;C:\Users\x1 Yoga\OpenBot\Shared\tools\git\cmd;C:\Users\x1 Yoga\OpenBot\Shared\tools\graphify-venv\Scripts;$env:PATH"
```

- Node 24.22.3 (+ `corepack` → pnpm 9.15.4), MinGit 2.56.1, Python 3.12 + graphify, `uv`.
- Brak: GitHub CLI, token GitHub (push zablokowany), MCP REA (używamy CLI przez `npx`).
