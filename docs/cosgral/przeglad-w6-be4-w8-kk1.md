# Przegląd W6-BE4 + W8-KK1 vs spec (W23–W28, W8-20…24)

**Stan: 16.11.2026. Autor: Tester (W6-T4).** Tylko czytanie kodu / raportów, **bez** uruchamiania programu i **bez** zmian w kodzie programu.  
**Baza gałęzi przeglądu:** `codex/cosgral-desktop` @ `61799a63c` → `team/tester/w6-t4`.  
**Źródła BE4 (nie scalone w integracji):** `team/backend/w6-be4` @ `a141541d6` — `docs/cosgral-raporty/backend-w6-be4.md`, `packages/contracts/src/ipc-subagents.ts`, `src/backend/subagent-runner.ts`, `subagent-tools.ts`, `subagent-store.ts`, `src/main/subagents-ipc.ts`, testy `subagent-runner.test.ts`, `agent-service-subagents.test.ts`.  
**Źródła KK1 (nie scalone w integracji):** `team/kk/w8-kk1` @ `42c6fbcfa` — `docs/cosgral-raporty/kk-w8-kk1.md`, `packages/contracts/src/ipc-spaces.ts`, `src/backend/space-store.ts`, `space-isolation.test.ts`, `src/main/spaces-ipc.ts` (+ wpięcie w `main/index.ts`).  
**Spec:** `docs/cosgral/spec-w6.md` §2D + §7 (Q10–Q11); `docs/cosgral/spec-w8.md` §2D + §7 (Q5, Q9, Q10).

## Na górze

- **W6-BE4:** rdzeń W23, W25, W26 i §7 (głębokość 1, limit 3, dziedziczenie dostępu bez narzędzi subagentów, Stop rodzica → dzieci, karty przez `waitingRequestIds`) jest w **kodzie + testach** na fałszywym CLI.  
- **W24 / W27:** kontrakt + zdarzenia + mock; panel/okienko = **UI**. **W28** (pytanie poboczne) = **brak** (świadomie poza BE4).  
- **W8-KK1:** W8-20…24 po stronie **danych** (osobne foldery + jedna przestrzeń naraz) + test izolacji Vault/MCP/agent/plik A↛B/Main. Q5 OK. Q10 = osobna lista MCP **z konstrukcji**, bez allowlisty globalnej. Q9 = **tylko komentarz** w kontrakcie.  
- **Izolacja OS / env / absolute path z procesu CLI:** poza KK1 (W8-BE2) — nie uznaję G5 „ucieczki procesu” za zaliczone.

**Legenda „Stan”:** `kod` = silnik/kontrakt (plik:linia na gałęzi źródłowej) · `test` = jednostkowy · `brak` · `niejasne` · `UI` = wymaga okna.

---

## 1. Subagenci — W23–W28 (`team/backend/w6-be4` @ `a141541d6`)

| ID | Kryterium (skrót) | Stan | Gdzie |
|---|---|---|---|
| W23 | Start → widoczna sesja / powiązanie z rodzicem | **kod + test**; panel UI = **UI** | Spawn: `subagent-runner.ts:290–335` (`#spawn` → store + `subagent-changed`). Osobny wątek CLI: `:366–400` (`ephemeral: true`). Wynik do rodzica: tool result (`:334–335`, `:338–346`). API człowieka: tylko `list`/`stop` (`subagents-ipc.ts:24–25`). Test W23: `agent-service-subagents.test.ts` („runs a subagent…”). |
| W24 | Panel: stan pracuje/done/błąd (+ podgląd) | **kod + test** (dane); **UI** (panel) | Stany: `ipc-subagents.ts:43–44`, `69–70`. `preview`/`result`/`error`: `ipc-subagents.ts:63–68`. Odświeżanie preview: `subagent-runner.ts:413–420`. Zdarzenie: `subagent-changed`. Test kart/stanu waiting: `agent-service-subagents.test.ts` („question of a subagent…”). Rysunek panelu: brak w BE4. |
| W25 | Stop subagenta kończy; rodzic nie wisi | **kod + test** | `stop` → `#finish` stopped: `subagent-runner.ts:139–146`, `:423+` (interrupt CLI). Odpowiedź rodzicowi: tool result stopped. Test: `agent-service-subagents.test.ts` („Stop ends the subagent…”). |
| W26 | Limit równoległych / głębokości = czytelna odmowa | **kod + test** | Limity: `ipc-subagents.ts:22–26` (`parallel: 3`, `depth: 1`). Odmowa: `subagentStartProblem` `:107–112`; użycie w `#spawn` `subagent-runner.ts:292–296`. Namespace nie dla dziecka: `subagent-tools.ts:1–2`, tools dziecka bez `cosgral_subagents` (test service). Test: `agent-service-subagents.test.ts` („refuses the fourth…”) + `subagent-runner.test.ts` depth. |
| W27 | Okienko subagenta w panelu bocznym | **brak w BE4** (kontrakt/mock pod UI) | Kontrakt §5 raportu BE4; `mock-subagents.ts`. Silnik nie rysuje panelu. |
| W28 | Pytanie poboczne ≠ subagent | **brak** | Jawnie poza BE4: `ipc-subagents.ts:16`; raport BE4 §4. |

### Decyzje §7 / zlecenie (głębia, limit, dostęp, Stop rodzica, karty)

| Decyzja | Stan | Gdzie |
|---|---|---|
| Głębokość 1 | **kod + test** | `SUBAGENT_LIMITS.depth` `ipc-subagents.ts:26`; `#spawn` depth przez `owns()` `subagent-runner.ts:293`; odmowa tool + brak oferty namespace (`subagent-tools.ts:1–2`). |
| Limit 3 równoległe | **kod + test** | `parallel: 3` `ipc-subagents.ts:24`; `#activeCount` w `#spawn` `:294`. |
| Subagent dziedziczy dostęp rodzica, bez więcej uprawnień | **kod + test** (dziś: policy/sandbox/cwd/tools−subagents) | `InheritedAccess` `subagent-runner.ts:40–43`, `:365–378` (te same `approvalPolicy`/`sandbox`/`runtimeWorkspaceRoots`/`cwd`/model). Minus narzędzia subagentów: test service. **Nie** ma jeszcze poziomów W8 (`working-folder` itd.) — hak `access` + raport BE4 §4. |
| Stop / koniec tury rodzica zatrzymuje dzieci | **kod + test** | `stopForTurn` `subagent-runner.ts:149–156`; też `stopBot`/`stopAll`/`forgetThread`/`recover` `:159–193`. Test: „ending the parent's turn stops…”. |
| Karty subagenta oznaczone (w Needs you rodzica) | **kod + test**; etykieta UI = **UI** | Karty w wątku rodzica + `waitingRequestIds`: `ipc-subagents.ts:13–15`, `70`; `refreshWaiting` `subagent-runner.ts:196–208`. Brak osobnego `kind: subagent` na karcie — UI łączy po `requestId` (kontrakt §5). Test waiting ids w service test. |
| Q11: człowiek = Stop + podgląd (start przez agenta) | **kod** (interpretacja BE) | IPC bez `start`: `subagents-ipc.ts:1–3`, `:24–25`. §7 „oba” = agent startuje / człowiek Stop+podgląd — zgodne z raportem BE4 decyzja 1. |

---

## 2. Przestrzenie klientów — W8-20…24 (`team/kk/w8-kk1` @ `42c6fbcfa`)

| ID | Kryterium (skrót) | Stan | Gdzie |
|---|---|---|---|
| W8-20 | Tworzenie przestrzeni z izolowanym zestawem danych | **kod + test**; E w oknie = **UI** | Create + foldery `data`/`home`: `space-store.ts:168–174` (create). Opis izolacji: `describe` `:232–246`, `SPACE_ISOLATED_PARTS` `ipc-spaces.ts` (`agents,files,vault,browser,mcp,memory`). Testy store + isolation. |
| W8-21 | Przełączenie szyny: dane B niewidoczne w A | **kod** (1 przestrzeń naraz + restart); **UI** | `select` zapisuje wybór: `space-store.ts:221–229`. Restart: raport KK1 §3 + `main/index.ts` (`SpaceStore` → `app.setPath("userData", runningSpace.userData)`). Druga baza nie jest otwarta jednocześnie — wyciek filtrem niemożliwy z konstrukcji. Widok szyny: UI. |
| W8-22 | Test izolacji G5 (API + UI) | **test (dane/API)**; UI/E + OS = **brak / poza** | `space-isolation.test.ts:63–126` (agent, Vault, MCP+sekret, plik A brak w B i Main, zero bajtów sekretów). UI izolacji i G5 ucieczki procesu: nie w KK1. |
| W8-23 | Vault A niedostępny w B | **kod + test** (osobna baza w `userData`) | Izolacja: `space-isolation.test.ts:80–86`, `:104`. Osobny folder danych: `space-store.ts:3–15`, `#pathsOf` `:295–297`. |
| W8-24 | Usunięcie z potwierdzeniem | **kod + test**; dialog UI = **UI** | Parser `confirm: true`: `ipc-spaces.ts:220–231`. Delete tylko własny folder, nie Main, nie running/selected, odmowa junction: `space-store.ts:205–218`. Testy: `space-store.test.ts` „delete removes only…”, „refuses a space folder that is a link…”. |

### Decyzje §7 W8 (Q5, Q9, Q10) + pytania zlecenia

| Temat | Stan | Gdzie / werdykt |
|---|---|---|
| Q5: przestrzeń ≠ serwer/team | **kod (kontrakt)** | Komentarz + model `spaces` osobno: `ipc-spaces.ts:10–12`. Kanały `spaces:*` local-only (raport + `local-only-ipc.test.ts`). |
| Q9: import ze szablonu → `working-folder` | **brak w KK1** | Tylko komentarz `ipc-spaces.ts:15–16`; raport KK1 §5 pkt 1b → Backend W8-BE1. Brak kodu ustawiającego poziom przy imporcie. |
| Q10: MCP per przestrzeń / allowlist | **kod częściowo** | Osobna lista MCP w osobnej bazie = tak (`space-isolation.test.ts` + komentarz `ipc-spaces.ts:7–8`). **Allowlista globalnych serwerów per przestrzeń: nie zbudowana** (raport KK1 §1). |
| A odczyt B / Main: ścieżki, `..`, id | **kod + test** (strażnik folderu przestrzeni) | `#folderOf` odrzuca `..` / absolut / sep: `space-store.ts:285–292`. `isSpaceId`: `ipc-spaces.ts:142–143`. Złe id w delete: test `space-store.test.ts` (`../main`, `..`, `a/b`). |
| Dowiązania / junction przy delete | **kod + test** (gdy OS pozwala) | `lstat` + odmowa symlink: `space-store.ts:211–214`; test junction `space-store.test.ts:154+` (może skip bez praw). |
| Env / proces CLI do cudzego folderu | **poza KK1** | Izolacja = dane programu, nie OS (raport KK1 §5 pkt 4). Wspólne env użytkownika Windows — brak scrubbingu per przestrzeń. |
| Vault / MCP A→B | **test OK** (przy osobnym otwarciu store) | Jak W8-22/23. |
| Delete nie kasuje cudzych folderów | **kod + test** | Tylko `<Spaces>\<id>`; Main i drugi klient zostają (`space-store.test.ts` „delete removes only…”). Wipe Main nie obejmuje sibling `… Spaces\` (`space-isolation.test.ts:144–156`). |
| Uszkodzona lista `spaces.json` | **kod + test** | `#load`: rename → `.damaged-…`, start Main, foldery nietknięte: `space-store.ts:308–326`; test `space-store.test.ts:193+`. |

---

## 3. Luki i błędy logiczne

| # | Problem | Adresat | Propozycja |
|---|---|---|---|
| L1 | **W27 / W24 E:** brak panelu/okienka subagenta w rendererze; silnik emituje dane, UI nie domknięte. | UI | Zmontować panel na `subagents.list` + `subagent-changed`; Stop → `subagents.stop`; etykieta karty gdy `requestId ∈ waitingRequestIds`. |
| L2 | **W28** pytanie poboczne nie istnieje. | Backend (+ UI) | Osobne zadanie: kontrakt `side-question` ≠ `Subagent`; nie doklejać do BE4. |
| L3 | Subagent **nie dziedziczy konta z puli** rodzica (raport BE4 §4) — idzie na domyślny klient dostawcy. | Backend | Po W8/poziomach: przekazać to samo konto/pool slot co rodzicowi w `client(botId)` dla subagenta; test na atrapie puli. |
| L4 | „Dziedziczy poziom dostępu” §7: dziś kopia `approvalPolicy`/`sandbox`/korzeni, **bez** modelu W8 (`working-folder` / ask / full). | Backend (W8-BE1 + szew BE4) | Wypełnić `options.access` poziomem wątku rodzica; subagent nigdy nie dostaje wyższego poziomu. |
| L5 | Karty „oznaczone” tylko przez join `waitingRequestIds` — brak pola na karcie; UI może zapomnieć oznaczyć. | UI (ew. Backend) | Minimum: UI join. Opcjonalnie Backend: `source: { kind: "subagent", id, title }` na pending request. |
| L6 | **Q9** niezaimplementowane w KK1 (tylko komentarz). | Backend (W8-BE1) | Przy imporcie szablonu do przestrzeni ustawić `working-folder`; test jednostkowy. |
| L7 | **Q10 allowlist** globalnych MCP per przestrzeń brak; bezpieczeństwo opiera się na osobnych listach + 1 przestrzeń naraz. | KK / Backend | Albo utrzymać „tylko osobne listy” jako decyzję lidera, albo dodać allowlistę; nie mieszać obu bez dokumentacji. |
| L8 | **Izolacja OS / env / ścieżki absolute:** proces agenta nadal może czytać folder innej przestrzeni lub Main, dopóki nie ma W8-BE2. Test G5 KK1 = dane programu, nie ucieczka procesu. | Backend (W8-BE2) + Tester | Nie reklamować G5 pełnego po samym KK1; acceptance: próba odczytu `…Spaces\<idB>\data` z CLI w A = odmowa po piaskownicy. |
| L9 | Raport KK1: id „12 znaków `[a-z0-9]`”; kontrakt: `^[a-z0-9][a-z0-9-]{5,39}$` (`ipc-spaces.ts:142–143`) — **niespójność dokumentacji**. | KK | Dopisać w raporcie rzeczywisty wzorzec; albo zawęzić generator id. |
| L10 | `wait: false` + koniec tury rodzica → subagent `stopped` („The turn of the agent ended.”) — bezpieczne, ale rodzic **musi** czekać albo straci pracę (decyzja BE4 §3.2). | Backend / lider | Zostawić (bezpieczeństwo) **albo** pozwolić orphan do done przy `wait:false` — wymaga decyzji; dopisać w kontrakcie dla modelu. |

**Nie uznaję za bug:** brak startu subagenta z okna (Q11 jak w BE4); restart przy switch (świadome); brak jednoczesnych dwóch przestrzeni; odmowa delete Main/running/junction; damaged list → Main.

---

## 4. Czego nie da się ocenić bez UI i okna

1. Panel / okienko subagenta (W24, W27), oznaczenie „od subagenta: …” na kartach Needs you.  
2. Stop subagenta z UI w Electronie (brak wiszącego Thinking rodzica).  
3. Przełącznik przestrzeni w szynie (Q5 UX vs Local server / team) + potwierdzenie restartu (W8-21 E).  
4. Tworzenie / rename / archive / delete przestrzeni z dialogami confirm (W8-20, W8-24 E).  
5. Po restarcie: czy `userData` i profil Chromium faktycznie są z folderu przestrzeni (KK1 §5.3).  
6. Single-instance / `relaunch` po switch (raport: z lektury, nie z okna).  
7. Prawdziwy Codex/Claude/ACP ze `cosgral_subagents` (raport BE4: tylko atrapa).  
8. Czy agent w przestrzeni A przez narzędzie plikowe otworzy ścieżkę B (bez piaskownicy OS).

---

## 5. Czego nie sprawdziłem (T4)

1. Uruchomienia Electrona, `sandbox:e2e`, pełnego `bun run test`, lint/typecheck na gałęziach BE4/KK1.  
2. Scalenia BE4/KK1 w `codex/cosgral-desktop` (oba **poza** integracją @ `61799a63c` w chwili przeglądu).  
3. Każdej linii `agent-service.ts` poza testami subagentów i raportem (wpięcie runnera przyjęte z testów service).  
4. Działania junction testu na tej maszynie (kod + test przeczytane; wynik skip możliwy).  
5. Współbieżnego dostępu dwóch procesów do dwóch przestrzeni (z założenia niemożliwe po relaunch).  
6. UI Designer / mock stories poza istnieniem plików na gałęzi.  
7. W8-BE1/BE2, budżetów, poziomów dostępu poza stykiem opisanym wyżej.

---

## Commity

Gałąź `team/tester/w6-t4` — SHA w wyniku kanału. Linie plików BE4/KK1 odnoszą się do tipów `a141541d6` / `42c6fbcfa`, nie do tipu integracji.
