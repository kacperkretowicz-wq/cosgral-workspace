# Instrukcja dla następnego agenta: UI i reszta (19.11.2026, wieczór)

**To jest jeden punkt startu.** Łączy audyt UI i pogłębiony audyt reszty: bezpieczeństwa zależności, CI, testów,
wydajności, słownika PL, reaktywności i parytetu z OpenBotem. Każda pozycja ma pliki i sposób sprawdzenia.
Zgłoszenie na GitHubie: **#25**. Gałąź z pracą: **`claude/friendly-noether-jpw1if`** (PR #24 + 15 commitów UI z tej sesji).

---

## Stan po sesji 19.11 wieczór (gałąź `claude/charming-euler-ag7ese`)

Szczegóły: górny rozdział `PRZEKAZANIE.md`. W skrócie, względem list niżej:

| Pozycja | Stan |
|---|---|
| P0 3.1 zależności | **Zrobione w kodzie** (`electron` 43.8.12, SDK MCP 1.32.2, `zod` 4.6.7). Zostaje przebudowa `.exe` na Windows. Narzędzia deweloperskie (Storybook, Vitest) nie ruszane. |
| P0 3.2.4 krok „channel UI” | **Zrobione** (menu „+” → „New channel” w `sandbox-e2e.ts` i `sandbox-acceptance.ts`). Nie uruchomione: wymaga Windows. |
| P0 3.2 (1–3), 3.3, 3.4 | Bez zmian: Windows, decyzje właściciela. |
| P1 1 Ustawienia | **Zrobione** (`SettingsDialog.tsx`). |
| P1 2 Okno kanału | **Zrobione.** |
| P1 3 Nowy agent | **Zrobione** (pracownia stworka z podglądem min). |
| P1 4 Dostawcy | **Zrobione:** Konta i pula, CLI agentów, Klucze API, Punkty końcowe (wiersze z ikoną i stanem; formularz w dwóch kolumnach). Region „Fallback models” nie ruszany. |
| P1 5 Katalog | **Zrobione** (nagłówek, ikony kategorii, opisy w dwóch liniach). |
| P1 6 Ustawienia serwera | **Zrobione** (nagłówek, sekcje z ikonami i opisem, pola jako wiersze). Parytet 14 sekcji z 0.71 bez zmian. |
| P2 5.8 testy | **Zrobione** (oba). |
| P2 5.1 reaktywność | **Częściowo:** `Field` (`ui/form.tsx`) przekazywał kontekst jako kopię — błąd/opis nie dochodził do `aria-describedby`; teraz gettery. `ChannelEditor` czyta wartości początkowe przez `untrack`. Skrypt zliczający (patrz § 7): 876 ostrzeżeń w 108 z 373 historyjek (poprzednio 3319 w 172; metoda nieidentyczna: 0,9 s po otwarciu, bez `play`). Zostało głównie Kobalte (`ButtonRoot`, `Menu`, `PopperRoot`), `ComposerEditor`, sidebar `mark-as-read`. |
| P2 5.3 jasne historyjki | **Zrobione:** `Work pages` Biblioteka / Przepływy / Harmonogram w jasnym. |
| P2 5.4 pasek kanału | **Zrobione** (pigułki do ikon w wąskim oknie). |
| P2 5.5 wiadomość bezpośrednia | **Zrobione** (akcja „Oznacz rozmowę jako przeczytaną”, nagłówek jak u agenta). |
| P2 5.6 wydajność | **Częściowo:** cztery strony leniwie (główny JS 3,17 → 2,94 MB). Zostały Zdalny pulpit (współdzieli plik z `RemoteDesktopSafety`) i duże pliki do podziału. `theme-init.js` bez `type="module"` jest celowe (blokuje, żeby nie było błysku motywu). |
| P2 5.2 stworki | **Zrobione:** mina w nagłówku kanału i przy wiadomościach, mrugnięcie przy najechaniu, jasny motyw sprawdzony. |
| P2 duże pliki | Bez zmian. |
| P3 6.1 napisy | **Całość z tabeli:** zrobione m.in. `VaultPanel`, `RemoteMacPanel`, `Sidebar`, `MessageRendering`, `QueuePanel`, `MemoryPanel`, karty kont, `Conversation`, wątki, głos. Dołożone: `ChannelView`, `WorkflowsPage`, `AttachmentCards`, `UnreadMessages`, `RoutinePanel`, `SelectionActions`, `RichMessageText`. Nowy skan angielskich napisów po całym kodzie nie był robiony. |
| P3 6.3 ostrzeżenie Biome | **Zrobione.** |

## 0. Start w 10 minut

1. Przeczytaj w tej kolejności: ten plik → `AGENTS.md` → `PRODUCT.md` → `docs/cosgral/PROMPT-UI-JAKOSC.md` (cel, zasady,
   dziennik sekcji) → górny rozdział `docs/cosgral/PRZEKAZANIE.md`.
2. `git fetch origin claude/friendly-noether-jpw1if && git checkout claude/friendly-noether-jpw1if`, potem `bun install`.
3. Zasady, których nie wolno łamać:
   - **Kolory** tylko z palety `:root` w `src/renderer/src/styles.css` (`var(--openbot-*)`). Bez nowych `#hex`, `rgb()`,
     `color-mix()` w regułach. Nowa rola koloru trafia najpierw do `:root`.
   - **Sprawdzanie** wyglądu tylko w aplikacji dev albo w Storybooku. Zrzut „przed” i „po” każdej sekcji.
   - **Najpierw ponowne użycie:** `WorkPage`, `WorkPageSections`, `WorkPageAnchors` (`components/WorkPage.tsx`), wiersze
     `.w2-item` z `.w2-item-icon` i `.w2-item-actions` (`styles/work-page.css`), `AgentAvatar` z `mood`.
   - **Po polsku:** każdy napis przez `t()`, klucz w `pl.ts` i `en.ts` (równe klucze, `i18n.test`).
   - **Bez ruchu też działa:** właściciel ma „ogranicz animacje”. Żadnego stałego `opacity: 0` czekającego na animację.
   - **Git:** bez `--force`, bez pushu na gałąź domyślną, bez przepisywania historii. Kodu i grafik z OpenBota 0.71 nie
     kopiujemy (licencja PolyForm Noncommercial, repo publiczne).
4. Na koniec każdej porcji: `bun run lint`, `bun run typecheck`, testy dotkniętych plików, `bun run test:storybook` dla
   zmienionych historyjek. Wpis w dzienniku `PROMPT-UI-JAKOSC.md` i krótko w `PRZEKAZANIE.md`.

## 1. Stan repozytorium (ważne, bo mylące)

| Gałąź / PR | Co to jest |
|---|---|
| `main` (domyślna na GitHubie) | **Stary projekt Paperclip**, nie aplikacja desktop. Jego workflowy działają na każdym PR (patrz 3.4). |
| `codex/cosgral-desktop` | Integracja aplikacji COSGRAL Workspace (desktop, Electron + SolidJS). |
| `team/lider/poprawki-po-exe` → PR #24 | Poprawki po `.exe` i pierwsza runda UI. Otwarty, nie scalony. |
| `claude/friendly-noether-jpw1if` | PR #24 + 15 commitów UI z tej sesji. **Nie ma PR-a.** Do scalenia najpierw do #24 albo razem z #24 do `codex/cosgral-desktop`. |
| `codex/cosgral-workspace` | Starsza linia Paperclip; trafiają do niej PR-y Dependabota (#20–#23). Nie dotyczą aplikacji desktop. |

## 2. Gotowe w tej sesji (nie ruszać bez powodu)

Mimika stworków w zależności od stanu agenta. Wiersze agentów. Kanały na liście ze stosem stworków. Widok kanału
wygląda jak rozmowa. Odpowiedzi agenta bez dymka. Kroki agenta jako oś czasu. Pasek wątków znika przy jednym wątku.
Wspólny szkielet stron. Od nowa: Biblioteka, Przepływy, Harmonogram, Zużycie. Wspólny nagłówek: Dostawcy, Telefon,
Zdalny pulpit. Cały nowy CSS używa palety `--openbot-*`.
Szczegóły i nazwy historyjek: dziennik w `PROMPT-UI-JAKOSC.md`.

---

## 3. P0: zanim cokolwiek trafi do właściciela

### 3.1 Bezpieczeństwo zależności, które idą do `.exe`

`bun audit`: 140 ostrzeżeń (5 krytycznych, 58 wysokich). Większość dotyczy narzędzi deweloperskich (Storybook, Vitest,
Vite, TanStack w `apps/auth-api`). **W działającym programie** są te:

| Paczka (teraz) | Do wersji | Dlaczego |
|---|---|---|
| `electron` 43.4.0 | **≥ 43.7.6** | 4 wysokie: okna z sandboxa bez jego ograniczeń, odczyt między źródłami przez protokoły file/http, zatrucie cache preloadu, Node w Web Workerach `<webview>`; plus kilka średnich. |
| `@modelcontextprotocol/sdk` 1.30.0 | **≥ 1.32.0** | Klient OAuth może wysłać dane uwierzytelniające do serwera wskazanego przez serwer MCP; wyczerpanie pamięci; tokeny innej usługi. |
| `zod` 4.4.3 | **≥ 4.6.6** | Wyczerpanie pamięci przy walidacji dużych kolekcji. |
| `undici` (8.10 / 7.29 / 6.28) | najnowsze w zakresie | Kilka ostrzeżeń (przez SDK i Node). |

Jak: podnieść wersje w `package.json` i w `bun.lock` (`bun update electron @modelcontextprotocol/sdk zod`), potem pełny
check i **przebudowa `.exe` na Windows**. Ustawienia okien są poprawne (`contextIsolation: true`, `sandbox: true`,
`nodeIntegration: false` w `src/main/index.ts`, `dock-windows.ts`, `conversation-windows-electron.ts`).
Zależności deweloperskie (Storybook ≥ 10.6.2, Vitest ≥ 4.1.11) podnieść osobnym commitem.

### 3.2 Sprawdzenie na Windows (nic z tej gałęzi nie było oglądane w prawdziwym oknie)

1. `bun run build`, uruchomienie w piaskownicy z `--remote-debugging-port` (`PRZEKAZANIE.md` §4), zrzuty CDP każdej
   przerobionej strony, po polsku i po angielsku.
2. `bun run dist:win` i próba `.exe`.
3. `bun run test:visual`. Wzorce `tests/visual/__screenshots__/*-chromium-win32.png` pochodzą sprzed tej gałęzi i zmienią
   się (pasek boczny z kanałami, rozmowa bez dymka, nagłówek). Aktualizuj je dopiero po obejrzeniu różnic.
4. `bun run sandbox:e2e`. Krok „channel UI” w `scripts/sandbox-e2e.ts` (ok. linii 791) klika przycisk „New channel” na
   stronie Agentów. Od PR #24 to pozycja menu „+” (`menuitem`), więc krok najpewniej padnie. Popraw go: menu „+” →
   „New channel”.

### 3.3 Scalenie

Właściciel decyduje, czy otworzyć PR `claude/friendly-noether-jpw1if` → `team/lider/poprawki-po-exe` (żeby #24
zawierał całość), czy scalać po kolei. Nie scalać bez zielonego checku z 3.2.

### 3.4 CI nie sprawdza aplikacji desktop

- `ci.yml` aplikacji uruchamia się tylko dla `push`/`pull_request` na `main` i tylko na samohostowanym macOS
  (`runs-on: [self-hosted, macOS, ARM64]`). **PR-y do `codex/cosgral-desktop` nie mają żadnego CI.**
- `main` (Paperclip) ma workflow `commitperclip-review.yml` (`pull_request_target`), który działa na każdym PR i pada,
  bo pobiera nieistniejącą gałąź `master`. Dlatego PR #24 ma czerwone „review”.
- Do decyzji właściciela (to także pkt 1 z `PRZEKAZANIE.md` §9): zmienić gałąź domyślną na `codex/cosgral-desktop` albo
  usunąć workflowy Paperclip z `main`; dodać CI dla PR-ów desktop (`ubuntu-latest`: lint, typecheck, `bun run test`,
  Storybook; `windows-latest`: testy wizualne i `acp-presets`). **Nie zmieniać bez zgody.**

---

## 4. P1: duże i widoczne w UI (w tej kolejności)

| # | Ekran | Co jest źle | Co zrobić | Pliki |
|---|---|---|---|---|
| 1 | **Ustawienia** (ikona na dole paska stron) | Otwiera kreator konfiguracji w trybie przeglądu („COSGRAL SETUP”). Jedna długa kolumna bez nawigacji sekcji. Tabela powiadomień z gołymi polami wyboru, język jako gołe pole. Komunikat „Download a model first…” po angielsku. | `WorkPage` + `WorkPageSections` (Ogólne, Powiadomienia, Dostawcy, Wygląd, Głos, Uprawnienia, Dane i prywatność, Zaawansowane; klucze `t()` w większości już są). Powiadomienia jako wiersze z przełącznikami (`ui/switch`). Przy pierwszym uruchomieniu kreator zostaje kreatorem. | `InitialSetup.tsx` (`reviewing`), `AppSettingsW3.tsx`, `App.tsx` (`permissionsOpen`) |
| 2 | **Okno kanału** (Nowy/Edytuj) | Zdanie „The short name cannot be changed…” ogromną czcionką. Członkowie jako gołe pigułki bez stworków. Prowadzący jako gołe pole wyboru. | Członkowie jako lista ze stworkami i zaznaczeniem, prowadzący oznaczony na liście, podgląd stosu stworków. Nie zmieniać nazw używanych przez testy i e2e: „Channel name”, „Display title”, „Lead agent”, „Create channel”, „Save changes”. | `ChannelEditor.tsx`, `styles/channel-view.css` |
| 3 | **Nowy agent** | Brak nagłówka. „Create agent” wyłączony bez podanego powodu. 12 stworków bez etykiet. | Nagłówek. Jedno zdanie powodu przy wyłączonym przycisku. **Edytor stworka**: kształt + kolor + podgląd min (`AvatarMood`). | `NewAgentPage.tsx`, `new-agent.css`, `blobatar.ts` |
| 4 | **Dostawcy (wnętrza sekcji)** | Konta, CLI, klucze i punkty końcowe to stosy pól („Max accounts in the pool”, „Set as default ↑ Up ↓ Down”). | Wiersze `w2-item` z ikoną, stanem i akcjami. Formularze dodawania jako karty w dwóch kolumnach (wzór: „Utwórz rutynę”). **Nie zmieniać regionu „Fallback models”**, bo szukają go skrypty akceptacyjne. | `ProviderAccounts.tsx`, `ManagedCliSection.tsx`, `ApiKeysSection.tsx`, `EndpointsSection.tsx` |
| 5 | **Katalog dodatków** | Własny układ bez wspólnego nagłówka. Kafelki z inicjałami („DB”, „DF”). **Po polsku opisy dodatków ucięte** (kolumna 67–100 px przy 156–183 px tekstu). | Nagłówek `WorkPage`, ikony kategorii, opis w dwóch liniach albo szersza kolumna. | `MarketplacePage.tsx`, `MarketplaceGallery.tsx`, `marketplace-gallery.css` |
| 6 | **Ustawienia serwera** | Mały tytuł w rogu, pola w wąskiej kolumnie, 14 sekcji z 0.71 tylko częściowo (parytet wiersz 66). | Nagłówek `WorkPage`, sekcje przez `WorkPageSections` albo zostawić własną nawigację i ujednolicić wygląd. | `ServerSettingsPage.tsx` |

## 5. P2: średnie (UI i kod)

1. **Reaktywność Solid 2:** **3319 ostrzeżeń `STRICT_READ_UNTRACKED` w 172 z 370 historyjek** („wartość reaktywna czytana
   poza śledzeniem, nie zaktualizuje się”). Pomiar z 19.11: każda historyjka otwarta w Chromium i zliczona konsola.
   - 1763 „in an effect callback”;
   - Kobalte 2 alpha na Solid 2 RC: `ButtonRoot` 465, `Menu` 265, `PopperRoot` 265, `FormControlLabel` 154, `TabsRoot` 16.
     Sprawdzić aktualizację Kobalte.
   - Nasze komponenty: `Field` 242 (`components/ui/form.tsx`), `Scene` 80 (opakowanie historyjek), `For` 31,
     `ChannelEditor` 25, `ComboboxBase` 5, `CardIcon` 4, `Input` 2, `NewAgentPage` 1, `WorkflowsPage` 1.
   - Najwięcej w historyjkach `conversation-conversation--unread-messages` i `--scroll-to-latest` (po 175).

   To potencjalne błędy: widok nie odświeża się po zmianie. **Pułapka:** `bun run test:storybook` wypisuje konsolę tylko
   dla plików z porażkami, więc przy 370/370 nic nie widać. Licz skryptem Playwright (otwórz każdą historyjkę z
   `http://localhost:6006/index.json`, zbieraj `page.on("console")`). Wzór poprawki: `untrack()` dla odczytu
   jednorazowego albo przeniesienie odczytu do JSX lub memo (zrobione w `WorkPage.tsx`).
   W konsoli są też 2× „Failed to resolve module specifier '[object Object]'” w funkcji `play` jednej z historyjek;
   ustalić której i poprawić import.
2. **Stworki dalej:**
   - mimika w nagłówku kanału i przy wiadomościach członków (`avatarMoodFor` w `row-activity.ts`);
   - mrugnięcie przy najechaniu;
   - rumieniec i kropla potu w jasnym motywie do sprawdzenia.
3. **Jasny motyw nowych ekranów:** historyjki `COSGRAL/Work pages` są tylko w ciemnym. Dodaj jasne warianty, żeby test
   dostępności sprawdzał też jasny kontrast.
4. **Pasek kanału w wąskim oknie:** „# project” w `ChatTasksSwitch` łamie się w dwie linie, pigułki schodzą do drugiego
   rzędu. Poniżej ok. 900 px rozważ menu „Ustawienia kanału”.
5. **Wiadomość bezpośrednia:** nagłówek bez akcji; dopasować do nagłówka rozmowy z agentem.
6. **Wydajność wczytywania:** renderer to jeden plik JS **3,1 MB** i CSS **488 KB** (`out/renderer/assets`, build 8 s).
   Rzadkie strony (Przepływy, Katalog, Zdalny pulpit, Telefon, Ustawienia serwera) można ładować leniwie (`lazy()`).
   Budowanie ostrzega też: `<script src="./theme-init.js">` w `index.html` bez `type="module"`.
7. **Duże pliki do podziału (przy okazji zmian, nie hurtem):**
   - renderer: `Conversation.tsx` 3133 linie, `App.tsx` 2623, `Sidebar.tsx` 1464;
   - backend: `agent-service.ts` 5352, `src/main/index.ts` 2790;
   - style: `conversation.css` 6213, `app-shell.css` 3165, `cosgral.css` 2905.
8. **Testy:**
   - `src/backend/agent-service-context-threads.test.ts` („compacts a thread that is not on screen…”) jest niestabilny,
     pada ok. 2 na 3 przebiegi także na czystym PR #24; naprawić, nie wyłączać;
   - 2 testy w `acp-presets.test.ts` zakładają Windows (wielkość liter, `.cmd/.exe`) i na Linuksie padają: oznaczyć
     `runIf(process.platform === "win32")` albo przepisać na niezależne od systemu.
9. **Parytet z OpenBotem 0.71 dotykający UI** (`docs/cosgral/parytet-0.71.md`: 81,8% w kodzie, tylko 52,6% sprawdzone
   w oknie). Wiersze „częściowo”:
   - 16 pole wiadomości (`/`, `@`, wysiłek, pytanie poboczne);
   - 23 panel boczny czatu;
   - 27 ustawienia kanału;
   - 36 pasek boczny i szyny;
   - 45 Biblioteka (pliki maszyny);
   - 48–49 Katalog jak 0.71;
   - 60 edytor przepływów (cofnij/ponów, plakietki błędów, karta triggera);
   - 61 wersje i katalog przepływów;
   - 66 Ustawienia serwera (14 sekcji);
   - 72 skróty klawiszowe (Ctrl+K, Ctrl+F, Alt+↑).

   „Brak”: 5 Głos Parakeet, 41 Vault (pokaż/kopiuj sekret, import CSV), 64 Discord, 65 łącznik GitHub. Rada zespołu:
   Discord na razie nie (`PRZEKAZANIE.md` §9.4).

## 6. P3: drobiazgi (na koniec, jak prosił właściciel)

### 6.1 Napisy po angielsku

Skan kodu: 97 miejsc w 22 plikach poza `t()`; nazwy własne Codex i Claude pominięte.

| Plik | Ile | Przykłady (linia: tekst) |
|---|---|---|
| `VaultPanel.tsx` | 18 | 151 Label, 156 Site URL, 160 Username, 164 Password, 187 Cardholder, 191 Card number |
| `RemoteMacPanel.tsx` | 16 | 190 Remote desktop, 223 Enable remote control / Use view-only mode, 226 View only / Control |
| `Sidebar.tsx` | 9 | 674 Expand/Collapse sidebar, 836 i 854 **Online now / Offline**, 1239 **Update**, 1264 Replace/Upload photo |
| `conversation/MessageRendering.tsx` | 7 | 182 You/Agent, 306 React with, 346 Reply to, 361 Branch from here |
| `AccountUsageMeter.tsx` | 5 | Usage not reported, No reset time was given, No usage windows for this account yet. |
| `MemoryPanel.tsx` | 5 | Always / When needed, Edit, Delete, Save memory, Cancel edit |
| `conversation/QueuePanel.tsx` | 5 | Queued message, Steer queued message, Steering/Steer, Delete/Edit queued message |
| `AccountLimitCards.tsx` | 4 | Limit reached, No reset time was given, Dismiss |
| `Conversation.tsx` | 4 | Remove, Open, Download, **Show in Finder** (na Windows: „Pokaż w Eksploratorze”) |
| `conversation/RichMessageText.tsx` | 4 | Open attached file, Open agent, Open citation, Open source |
| `AccountErrorCard.tsx` | 3 | Network error for, Connection problem, Dismiss |
| pozostałe (1–2) | 15 | `ApprovalRulesSettings`, `ChannelView` (aria „Reassign …”, „Reply to …”), `WorkflowsPage` (aria „Move …”, „Drag connection from …”), `AttachmentCards`, `UnreadMessages`, `ComposerEditor`, `RoutinePanel` (Create routine), `SelectionActions` (Sending…) |

Przejście po wszystkich stronach programu przełączonego na polski znalazło widoczne angielskie resztki:
- „Online now”, „Offline”, „Update” na liście;
- tytuł wątku „New thread” w panelu wątków i w etykietach typu „Otwórz New thread”, bo `ThreadPanel` nie tłumaczy
  domyślnego tytułu jak `ThreadTabs.threadTitle`;
- „Download a model first…” w Głosie;
- etykiety tylko dla czytnika ekranu, np. „2 unread direct messages”, „Thread: …; 0 running”.

**Uwaga:** etykiety `aria-label` używane w testach i e2e („Reply to …”, „Move …”, „Drag connection from …”, „Stop computer
control for …”) tłumacz przez `t()` z kluczem identycznym jak dzisiejszy tekst. Testy działają po angielsku, więc dalej
przejdą.

### 6.2 Kolory spoza palety

Literały w regułach (bez `cosgral-tokens.css` i `theme-light.css`):

| Plik | Ile | Uwagi |
|---|---|---|
| `workflow-editor.css` | 9 | `oklch` odcieni kroków; przepiąć na `--openbot-file-*` jak paletę klocków |
| `conversation.css` | 8 | |
| `marketplace-gallery.css`, `cosgral.css`, `agent-cards-grid.css` | po 4 | |
| `kk-panels.css`, `chat-side-panel-launcher.css`, `app-shell.css` | po 2 | |
| `ui-recent-a11y.css`, `shell.css` | po 1 | |

Bezpośrednie `var(--cosgral-*)` zamiast `--openbot-*`: `cosgral.css` 247, `kk-panels.css` 55, `shell.css` 52,
`new-agent.css` 51, `plugin-apps.css` 46 i inne. Przepinać przy okazji zmian w danym pliku. Kolory wewnątrz
generowanych stworków (`blobatar.ts`) są dozwolone, bo to granica integracji.

### 6.3 Inne

- Ostrzeżenie Biome `cosgral.css:2812` (kolejność selektorów).
- Znane ryzyka z `PRZEKAZANIE.md` §10:
  - `apps/auth-api/.env.production` (zaszyfrowany) jest w historii;
  - linki do autora bazy w `src/main/index.ts`, `scripts/cosgral-rebrand-visible.mjs`, `skills-lock.json`.

---

## 7. Jak sprawdzać w kontenerze Linux (sprawdzone 19.11)

| Co | Polecenie / sposób |
|---|---|
| Storybook | `bun run storybook` (port 6006); zrzuty przez Playwright (`chromium.launch()` bez opcji). |
| Testy Storybooka | Wymagają przeglądarki z `/opt/pw-browsers/chromium`. Zrób lokalną kopię configu z `playwright({ launchOptions: { executablePath: "/opt/pw-browsers/chromium" } })` i nie commituj jej. Test dostępności (axe) działa w każdej historyjce. |
| Program po polsku w Storybooku | Historyjki nie uruchamiają `startI18n`, więc są po angielsku. W Playwright: `await page.evaluate(async () => (await import('/src/renderer/src/i18n.ts')).setLanguage('pl'))`. |
| Ucięte napisy | Szukaj elementów z `scrollWidth > clientWidth` i `overflow: hidden` lub `text-overflow: ellipsis`. Pomiń podglądy wiadomości i `.sr-only`. |
| Atrapa | `stories/mock-openbot.ts` przypina 5 domyślnych stron jak nowa instalacja. |
| Pełny check | `bun run lint`, `bun run typecheck`, `bun run test` (ok. 7 min na Linuksie), `bun run test:storybook`, `bun run build`, `bun audit`. |
| Wyniki końcowe (`dfee751`, po audycie) | lint zielone (1 stare ostrzeżenie); typecheck 6/6; build zielone; `bun run test` 3391 zielonych, 18 pominiętych, 3 znane czerwone (pkt 5.8), 476 s; `bun run test:storybook` 370/370; ostrzeżenia reaktywności 3319 w 172 historyjkach (pkt 5.1). Nie uruchomione: testy wizualne, e2e, `.exe` (Windows). |
| Wyniki końcowe, sesja wieczór (`claude/charming-euler-ag7ese`) | `bun run lint` zielone **bez ostrzeżeń**; typecheck 6/6; build zielone (JS 3,1 MB, CSS 509 KB); `bun run test` 3393 zielone, 18 pominiętych, 1 czerwony w przebiegu pełnym (`i18n.test` złapał plik Sejfu w trakcie edycji; po niej zielony, potwierdzone osobnym przebiegiem dotkniętych plików: 377/377), 438 s; `bun run test:storybook` **370/370** (axe złapał po drodze kontrast plakietki „Prowadzi” i zdublowane obszary w oknie Ustawień; poprawione). Testy `acp-presets` i kompaktowania wątku już nie padają na Linuksie. Nie uruchomione: testy wizualne, e2e, `.exe` (Windows); licznik ostrzeżeń reaktywności nie mierzony ponownie. |

## 8. Decyzje właściciela, które blokują część pracy

1. Gałąź domyślna i widoczność repo; workflowy Paperclip na `main` (3.4).
2. Maszyna z czystym Windows do próby instalatora.
3. Scalenie tej gałęzi (3.3).
4. Klucze API i limity; Discord, instalacja skilla z linku GitHub, węzły LLM i Asset w przepływach (rada: na razie nie).

## Audyt interfejsu (jak powtórzyć)

Storybook musi działać (`bun run storybook --ci`). Trzy kontrole, które znalazły realne błędy 20.11:

1. **Brakujące tłumaczenia i błędy:** otwórz każdą historyjkę z `http://localhost:6006/index.json` w Playwright, ustaw
   `setLanguage("pl")` (import `i18n.ts` z zasobów strony) i zbieraj `console` (`[i18n] Missing UI translation`, błędy)
   oraz `document.documentElement.scrollWidth > innerWidth`.
2. **Napisy na sztywno (nie wpadają w kontrolę 1, bo nie przechodzą przez `t()`):** przeszukaj `.tsx` wyrażeniem na
   tekst JSX/atrybuty/ternarki z wielką literą bez `t(`; sprawdź w kontekście, czy mapy etykiet są tłumaczone przy użyciu.
3. **Układ w wąskich oknach:** ekrany aplikacji (`app--playground`) przy 1100 i 900 px; szukaj elementów poza
   widokiem bez przewijanego rodzica i tekstu ściętego bez wielokropka (pomiń `.sr-only`).

Uwaga: `sbtest.log` z poprzedniego przebiegu potrafi oszukać monitor „czekaj na `sb exit`”; sprawdzaj czas pliku.
