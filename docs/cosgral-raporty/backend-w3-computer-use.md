# Backend W3-BE1: Computer Use na Windows (+ odpowiedź osoby na wiadomość kanału)

Gałąź `team/backend/w3-computer-use` od integracji `ad9a6a5b6`, bez push. Opis zachowania: `docs/cosgral/parytet-0.68.md` wiersz 32 i `docs/cosgral/PLAN.md` etap W3. Kodu OpenBota nowszego niż `a6fe240` nie czytałem.

## Wynik

| Zachowanie | Stan | Gdzie |
|---|---|---|
| Osoba odpowiada na konkretną wiadomość kanału (`replyToMessageId`); wiadomość z innego kanału daje błąd i nie tworzy zadania | ✓ | `channel-engine.ts`, `channel-store.ts`, `channel-inputs.ts` |
| Agent widzi pulpit (zrzut całego ekranu, wszystkie monitory) | ✓ | `screenshot` |
| Klik, podwójny klik, przewijanie, pisanie tekstu, skrót klawiszowy | ✓ | `click`, `double_click`, `scroll`, `type_text`, `press_keys` |
| Lista okien i przełączenie okna | ✓ | `list_windows`, `switch_window` |
| Karta zgody przed pierwszą akcją w rozmowie (karta confirm, liczy się do Needs you) | ✓ | `ComputerUseController`, `ActionCards.confirmAction` |
| Stan „agent steruje komputerem” i Stop, który od razu kończy sesję | ✓ backend i kontrakt; widok w wierszu agenta robi UI | `ComputerUseState.sessions`, `computerUse.stop` |
| Agent nie wpisuje wartości z Vault poza przeglądarką programu | ✓ | `VaultStore.containsSecretValue` |
| Brak sterowania przy zablokowanym ekranie i przy oknie zgody administratora (UAC); jasny komunikat | ✓ | `DesktopState.locked`, `uacPrompt` |
| Narzędzia dla Codex, Claude i tur kanału, tym samym mechanizmem co inne `cosgral_*` | ✓ | `cosgral_computer` |
| Sterowanie prawdziwym pulpitem na własnym oknie testowym | — **nie uruchomione w tej sesji** (powód niżej); dowód na atrapie + samotest prawdziwego pomocnika bez wysyłania wejścia | `scripts/computer-use-desktop-smoke.ts` gotowy |

## Technika sterownika

Mały pomocnik w **Windows PowerShell 5.1** (jest w każdym Windows 10 i 11) z kodem **C#** kompilowanym raz przez `Add-Type`. Program trzyma jeden proces pomocnika i rozmawia z nim liniami JSON przez stdin i stdout (`src/backend/computer-driver-windows.ts`).

- **Mysz i klawiatura:** `SendInput`. Ruch myszy jest w absolutnych współrzędnych wirtualnego pulpitu (wszystkie monitory). Tekst idzie znakami Unicode (`KEYEVENTF_UNICODE`), więc polskie litery nie zależą od układu klawiatury; nowa linia to Enter. Skróty to kody wirtualnych klawiszy z kodem skanowania.
- **Okna:** `EnumWindows` (bez okien narzędziowych i ukrytych), `WindowFromPoint` z oknem nadrzędnym, `SetForegroundWindow` z krótkim Altem, przywrócenie zminimalizowanego okna.
- **Obraz:** GDI `CopyFromScreen` całego wirtualnego pulpitu, PNG pomniejszony do 1600 px na dłuższym boku. Pomocnik jest DPI aware (per-monitor v2), więc współrzędne to fizyczne piksele. Kontroler przelicza piksele zrzutu na piksele ekranu.
- **Bezpieczeństwo w pomocniku:**
  - nazwa pulpitu wejścia: inna niż `Default` oznacza zablokowany ekran albo bezpieczny pulpit UAC;
  - proces `consent.exe` oznacza otwarte okno UAC;
  - podniesienie procesu okna (token elevation) sprawdza okna administratora;
  - Win+L i Ctrl+Alt+Delete nigdy nie są wysyłane.
- **Stop:** kontroler pisze po 16 znaków i sprawdza Stop między krokami. Stop zabija też proces pomocnika, więc krok w trakcie kończy się od razu, a następny krok uruchamia nowy pomocnik (start ok. 1,7 s). Pomocnik bez pracy kończy się po 5 minutach.
- **Tryb na sucho** (`dryRun`): nic nie wysyła i zwraca rekordy `SendInput`, które by wysłał. Tak sprawdziłem prawdziwego pomocnika na tym komputerze.
- **Czemu nie inaczej:** robotjs i nut.js to moduły natywne, które trzeba budować pod każdą wersję Electrona. Osobny plik exe trzeba kompilować i dołączać do paczki. PowerShell z C# nie dodaje żadnej zależności. Ryzyko: polityka AppLocker / WDAC albo tryb Constrained Language może zablokować `Add-Type`. Wtedy Computer Use kończy się czytelnym błędem „pomocnik nie wystartował”.

## Bezpieczeństwo i decyzje do oceny

1. **Zgoda:** przed pierwszą akcją w rozmowie (agent + wątek; w kanale wątek zadania) pokazuje się zwykła karta confirm: „Let <agent> control this computer?” z opisem pierwszego kroku. Liczy się do Needs you. Tylko „send” (Confirm) daje zgodę; Edit i Keep draft to odmowa. Zgoda dotyczy wszystkich narzędzi, także zrzutu ekranu. Nie przeżywa restartu programu.
2. **Sesja:** trwa od akcji do końca tury, 60 s bez akcji (`COMPUTER_USE_LIMITS.idleMs`) albo Stop. Widać ją w `ComputerUseState.sessions` (faza `acting` / `idle`, ostatnia akcja, liczba akcji).
3. **Stop:** od razu przerywa akcję w trakcie, kończy sesję i **cofa zgodę**, więc następna akcja znów pokazuje kartę. Karta odpowiedziana już po Stop nic nie daje. Stop przez IPC działa zawsze na tym komputerze, także gdy okno pokazuje serwer zdalny.
4. **Jeden agent naraz:** drugi agent dostaje „<agent> is controlling the computer right now”. Akcje jednego agenta idą po kolei, a kroki sterownika są szeregowane dla wszystkich.
5. **Odmowy z jasnym komunikatem:**
   - zablokowany ekran albo ekran bezpieczeństwa Windows;
   - okno UAC;
   - okno działające jako administrator (Windows i tak nie przyjmie wejścia);
   - **sam COSGRAL Workspace**: agent nie może sobie kliknąć Confirm na własnej karcie;
   - punkt poza zrzutem;
   - tekst zawierający wartość z Vault: hasła, numery kart (porównanie po cyfrach), klucze API, sekrety 2FA, dane kontaktu, od 5 znaków;
   - Win+L, Ctrl+Alt+Delete.
6. **Dane, nie polecenia:** wynik zrzutu i lista okien mają notkę, że treść ekranu i tytuły okien to dane.
7. **Zakres okna testowego** (`scopeWindowHandle`): w piaskownicy kontroler przepuszcza tylko jedno okno. Klik sprawdza `WindowFromPoint`, a pisanie wymaga tego okna na wierzchu.
8. **Narzędzia tylko ze sterownikiem:** `cosgral_computer` jest w narzędziach Codex tylko wtedy, gdy program ma sterownik (na Windows ustawia go main przed startem wątków). Claude ma serwer MCP zawsze; bez sterownika wywołanie zwraca „not available”.
9. **Małe zmiany w dużych plikach:** `agent-service.ts` +34/−0, `main/index.ts` +8/−0, `preload/index.ts` +2, `claude-client.ts` +9, `channel-agent-runner.ts` +2. Stara flaga `AgentStatus.capabilities.computerUse` (wtyczka Codex na macOS z bazy) zostaje bez zmian. O naszym Computer Use mówi `ComputerUseState.available`.

## Kontrakt dla UI

Typy: `packages/contracts/src/ipc-computer-use.ts` (commit `c67034340`) i `ipc-workspace-channels.ts` (commit `0af74f5a1`).

**Odpowiedź osoby na wiadomość kanału:** `channels.sendMessage({channelId, text, resourceKey?, replyToMessageId?: string | null})`. Wiadomość musi być z tego samego kanału, inaczej jest błąd „This message is not in the channel.” i nie powstaje zadanie. Link jest w `ChannelMessage.replyToMessageId` wiadomości osoby, tak jak u agentów.

**Computer Use: `window.openbot.computerUse`** (opcjonalne, ten komputer)

| Metoda | Wynik | Zachowanie |
|---|---|---|
| `getState()` | `ComputerUseState` | `available`, `unavailableReason`, `sessions`, `grants` |
| `stop({botId?})` | `ComputerUseState` | Kończy sesję od razu, przerywa akcję w trakcie i cofa zgodę: jednego agenta albo wszystkich |

- `ComputerUseSession`: `id, botId, threadId, phase ("acting" | "idle"), lastAction, actions, startedAt, lastActionAt`. Gdy jest sesja agenta, pokaż w jego wierszu „Controlling the computer” i przycisk Stop.
- `ComputerUseGrant`: `botId, threadId, grantedAt`: rozmowy, które mają zgodę do Stop albo restartu programu.
- Zdarzenie `computer-use-changed {state}`: podmień cały stan.
- **Karta zgody** to zwykła karta confirm (`draft-preview`, wariant `confirm`) w Needs you, z tytułem „Let <agent> control this computer?”. Odpowiedź przez `agent.respondToDraftPreview` (Confirm = `send`).
- Ustawienia: gdy `available` jest false, pokaż `unavailableReason` (np. „Computer Use works on Windows in this version.”).

## Narzędzia agenta `cosgral_computer`

Funkcje dynamiczne Codex, serwer MCP w procesie dla Claude, tury kanału. Argumenty są sprawdzane schematem; nieznane pola są odrzucane.

| Narzędzie | Co robi |
|---|---|
| `screenshot {}` | Zrzut całego ekranu (obraz + szerokość i wysokość); współrzędne innych narzędzi to piksele tego zrzutu |
| `click {x, y, button?}` | Klik (left / right / middle) |
| `double_click {x, y}` | Podwójny klik |
| `scroll {x, y, direction, amount?}` | Przewijanie w górę, w dół, w lewo albo w prawo o 1–20 ząbków (domyślnie 3) |
| `type_text {text}` | Pisanie do aktywnego okna (do 2000 znaków; nowa linia = Enter) |
| `press_keys {keys}` | Skrót, np. `ctrl+s`, `alt+tab`, `enter` (do 4 klawiszy) |
| `list_windows {}` | Okna: handle, tytuł, aplikacja, położenie w pikselach zrzutu; `controllable: false` dla COSGRAL i okien administratora |
| `switch_window {handle}` | Okno na wierzch (przywraca zminimalizowane) |

## Dowody

| Sprawdzenie | Wynik | Dowód (poza repo, `Shared\cosgral-data\desktop-backend\`) |
|---|---|---|
| Odpowiedź osoby: ten sam kanał zapisuje link, inny kanał daje błąd bez zadania; parser IPC | ✓ | `channel-engine.test.ts`, `channel-messages.test.ts` |
| Kontrakt: stan, akcje, limity, kanały IPC, zdarzenie | 3/3 | `ipc-computer-use.test.ts` |
| Protokół sterownika Windows na atrapie pomocnika: jeden proces, błędy, Stop w trakcie i nowy proces, limit czasu, tryb na sucho, poza Windows; skróty i zakazane kombinacje | 7/7 | `computer-driver-windows.test.ts` |
| Kontroler na atrapie: karta raz na rozmowę, odmowa, Stop w trakcie pisania z cofnięciem zgody, kolejność, blokada i UAC, COSGRAL / admin / poza zrzutem, Vault, przeliczanie pikseli (także monitor z ujemnym x), jeden agent naraz, koniec tury i bezczynność, zakres okna, brak sterownika, schematy | 13/13 | `computer-use.test.ts` |
| Vault: wykrycie zapisanej wartości w tekście | ✓ | `vault-store.test.ts` |
| AgentService (Codex): karta zgody w Needs you, po Confirm klik i pisanie, stan sesji, Stop; tury kanału i serwer MCP Claude z `cosgral_computer`; parser Stop | ✓ | `agent-service.test.ts`, `channel-agent-runner.test.ts`, `claude-client.test.ts`, `computer-use-inputs.test.ts` |
| **Prawdziwy pomocnik na tym Windows, na sucho** (nic nie wysłane, bez tytułów okien w logu):<br>- C# kompiluje się w PowerShell 5.1, start 1,7 s, DPI per-monitor-v2;<br>- pulpit `Default`, bez blokady i UAC, ekran 1920×1080, miniatura 8×4 px;<br>- plany `SendInput`: klik w środek (dx 32785, dy 32798, flagi MOVE / VIRTUALDESK / ABSOLUTE), przewijanie −360, 18 zdarzeń dla „Zażółć 1⏎”, Ctrl+S;<br>- punkt poza ekranem odrzucony | `ok: true` | `logs\w3-computer-helper-selftest.log`, `sandbox-w3-computer-helper\helper-selftest.json` |
| **Piaskownica** (osobny profil, atrapa Codex, atrapa pulpitu, prawdziwy AgentService):<br>- pierwsza akcja → karta → Confirm; zrzut, lista okien, klik w okno testowe, pisanie, Ctrl+S;<br>- druga akcja bez karty;<br>- Stop w trakcie pisania (48 z 400 znaków) kończy sesję i cofa zgodę;<br>- potem karta znowu; odmowa nic nie robi;<br>- odmowy: blokada, UAC, wartość z Vault, sam COSGRAL | `ok: true` | `logs\w3-computer-use-sandbox.log`, `sandbox-w3-computer-use\evidence.json` |
| Test „bez zgody”: po wyłączeniu sprawdzania zgody padają testy karty, Stop, jednego agenta i bezczynności; po przywróceniu 13/13 zielone, a plik jest identyczny z commitem | 5 padło → 13/13 | `logs\w3-computer-use-mutation.log` |
| Całe `bun run test` | **906/906**, 127/127 plików | `logs\w3-computer-use-full-test.log` |
| Typecheck contracts / node / renderer, `bun run build`, `biome check` 36 zmienionych plików | exit 0; bez błędów | `logs\w3-computer-use-typecheck.log`, `logs\w3-computer-use-build.log` |

## Prawdziwy pulpit: czemu nie w tej sesji

Ta rozmowa to wątek kanału działający obok głównego czatu właściciela. W tym wątku nie wolno mi sterować aplikacjami pulpitu; Computer Use ma tylko główny czat. Dodatkowo prawdziwe `SendInput` porusza myszą i pisze klawiaturą właściciela, więc trafiłoby w to, czego on właśnie używa. Dlatego:

- dowód zachowania (zgoda, Stop, kolejność, odmowy) jest na atrapie sterownika przez prawdziwy AgentService;
- prawdziwy pomocnik jest sprawdzony na tym Windows w trybie na sucho (kompilacja, stan pulpitu, dokładne rekordy wejścia), bez wysyłania wejścia;
- gotowy jest skrypt `scripts/computer-use-desktop-smoke.ts`. Otwiera własne małe okno z polem tekstowym (na wierzchu), steruje tylko nim (`scopeWindowHandle`), klika w pole, wpisuje tekst sprawdzany przez plik, robi Stop w trakcie i sprawdza odmowę punktu poza oknem. Bez `COSGRAL_ALLOW_REAL_DESKTOP=yes` nic nie robi. **Do uruchomienia** w głównym czacie albo przez Testera, gdy nikt nie używa komputera:

```powershell
$env:COSGRAL_COMPUTER_SANDBOX = "Shared\cosgral-data\desktop-backend\sandbox-w3-desktop"
$env:COSGRAL_ALLOW_REAL_DESKTOP = "yes"
bun build scripts/computer-use-desktop-smoke.ts --target=node --format=cjs --outfile "$env:COSGRAL_COMPUTER_SANDBOX\desktop-smoke.cjs"
node "$env:COSGRAL_COMPUTER_SANDBOX\desktop-smoke.cjs"
```

## Commity

| Commit | Co |
|---|---|
| `0af74f5a1` | Osoba odpowiada na konkretną wiadomość kanału |
| `c67034340` | Kontrakt Computer Use |
| `d083d8e9a` | Sterownik Windows (PowerShell + C#), atrapa sterownika, samotest na sucho |
| `6655f1f16` | Kontroler: karta zgody, Stop, kolejność, odmowy, Vault |
| `68da9257f` | Narzędzia `cosgral_computer` (Codex, Claude, kanały), IPC, preload |
| `cc51fcec0` | Piaskownica na atrapie pulpitu |
| `7be991ec2` | Skrypt na prawdziwy pulpit (tylko okno testowe, nie uruchomiony) |
| ostatni na gałęzi | `COSGRAL-CHANGES.md`, ten raport |

## Nie zrobione / otwarte

1. **Prawdziwy pulpit:** klik, pisanie i Stop na żywym oknie nie były uruchamiane (powód wyżej). Skrypt jest gotowy.
2. **UI:** stan w wierszu agenta, przycisk Stop i zakładka ustawień to praca zespołu UI (kontrakt wyżej).
3. **Elementy UI Automation:** agent klika po pikselach ze zrzutu. Wyszukiwanie przycisków po nazwie (drzewo UIA) można dodać później jako osobne narzędzie.
4. **Monitory z różnym DPI:** przeliczenie jest sprawdzone na atrapie (także ujemny x lewego monitora), na prawdziwym zestawie nie.
5. **Wyścig z człowiekiem:** między sprawdzeniem okna na wierzchu a `SendInput` osoba może przełączyć okno. Okno administratora i tak nie przyjmie wejścia, a COSGRAL sprawdzamy tuż przed krokiem; ryzyko jest małe, ale jest.
6. **Okno, którego procesu nie da się sprawdzić**, traktujemy jak okno administratora (odmowa).
7. **Polityka firmy** (AppLocker, WDAC, Constrained Language Mode) może zablokować pomocnika; wtedy jest błąd zamiast sterowania.
8. Zgoda nie przeżywa restartu programu (celowo).
