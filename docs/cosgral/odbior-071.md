# Odbiór zgodności z OpenBotem 0.71 (wygląd + funkcje)

**Data:** 17.11.2026 · **Autor:** Tester (T-A) · **Gałąź:** `team/tester/w11-odbior`  
**Cel:** nic nie jest „zrobione” bez dowodu. Ten plik = kryteria PASS/FAIL per ekran i funkcję.  
**Własne słowa i nasze nazwy.** Bez kopiowania tekstów, grafik ani nazw zmiennych z paczki OpenBota do repo.  
**Odniesienie wizualne (POZA repo, nigdy do commita):** `Shared\cosgral-docs\openbot-0.71-ui\` (ekstraktor B1) oraz `Shared\cosgral-docs\openbot-0.71-screens\`.  
**Kolejka implementacji:** `Shared\cosgral-docs\openbot-0.71-kolejka-ui.md`.  
**Tokeny COSGRAL:** `docs/cosgral/tokeny-071.md` (`--cosgral-*`).

## Tolerancje (wygląd)

| Co | Tolerancja | Fail gdy |
|---|---|---|
| Pozycja / rozmiar (px) | ±2 px względem odniesienia lub makiety z tokenów | Różnica ≥ 3 px na kluczowym elemencie (rail, panel, nagłówek, przycisk główny) |
| Kolor (RGB / kanał) | ±5 jednostek na kanał | Wyraźnie inny odcień tła, akcentu lub tekstu głównego |
| Napisy | Ten sam **sens** (PL/EN z naszego katalogu i18n) | Sens inny, brak etykiety, mieszanka języków w jednym widoku |
| Motyw | Ciemny i jasny (gdy wdrożony) | Wyspa starego motywu; jasny tekst na jasnym tle |
| Stany | hover / focus / disabled / pusty / błąd widoczne i czytelne | Brak feedbacku albo stan wygląda jak normalny |

**Porównanie liczbowe:** `scripts/ui-fidelity/` (T-A pkt 2) oraz `scripts/openbot-probe/compare.ts` (Backend) → raporty w `Shared\cosgral-docs\porownanie-ui\` (poza repo).

**Dowód w oknie:** lekkie kontrole zawsze; `sandbox:e2e` i Electron dopiero po pliku `GO-*.txt` od lidera w `Shared\cosgral-sandbox`.

**Wynik per ekran:** `PASS` | `FAIL` | `niejasne` + różnice + adresat (UI Designer / Backend / KK).

---

## Mapa odniesień (ścieżki folderów ekstraktora, bez treści)

Ścieżka bazowa: `Shared\cosgral-docs\openbot-0.71-ui\`

| Ekran COSGRAL | Folder(y) odniesienia | Zrzuty właściciela (opcjonalnie) |
|---|---|---|
| Pasek boczny + szyna | `main-shell\01-new-agent` … oraz foldery z listą agentów / wyszukiwarką (patrz `INDEKS.md`) | 089–092, 006 |
| Nowy agent | `main-shell\01-new-agent`, `03-new-agent`, `43-*`…`60-*` (kolor, model) | 001, 041–043, 098 |
| Chrome czatu | foldery rozmowy / karty „Potrzebują cię” w `main-shell\` (ok. 62–68) | 046–052, 102–119 |
| Ustawienia agenta (12 kart) | do uzupełnienia po domknięciu ekstraktora; na razie zrzuty | 059–074 |
| Ustawienia serwera (14 sekcji) | `main-shell\17-`…`32-` (Ogólne…Profile przeglądarki) | 020–034 |
| Marketplace | `main-shell\13-`…`16-` | 009, 035–039 |
| Zadania ↔ czat | foldery zadań w `main-shell\` + zrzuty | 078–087 |
| Dok + wyspa | brak w ekstraktorze B1 (osobne okna) — tylko zrzuty | 014–015, 093–095 |
| Ustawienia aplikacji | `main-shell\33-`…`41-` | 010–019 |
| Workflows | brak pełnego przebiegu w B1 — zrzuty | 002, 075–077 |
| Biblioteka / Użycie / Rutyny | `main-shell\04-`…`12-` | 004–005, 008 |
| Nowy kanał | brak pewnego przebiegu w B1 — zrzuty 096–097 (ostrożnie: 097) | 096–097 |

---

## Kryteria wspólne (każdy ekran)

### Wygląd

1. **Układ:** regiony (szyna, panel, treść, nagłówek) w tych samych miejscach co odniesienie; szerokości szyny / panelu zgodne z tokenami i ±2 px.
2. **Typografia:** Inter (lub równoważny stack z `--cosgral-*`); rozmiary główne 14 / 16 / 13 / 12 px (±0 przy tokenach stałych).
3. **Kolory:** tło, powierzchnie, akcent, tekst z `tokeny-071.md`; porównanie z `styles.json` / raportem fidelity w tolerancji ±5.
4. **Promienie / odstępy:** 8 / 12 / 999 px tam, gdzie odniesienie; odstępy kluczowe ±2 px.
5. **Stany:** hover, focus (widoczny pierścień/obramowanie), disabled (przygaszony, nieklikalny), pusty (jasny komunikat + CTA), błąd (kolor niebezpieczeństwa + tekst).
6. **Motyw:** ciemny obowiązkowy; jasny gdy jest przełącznik — te same role tokenów, bez wysp.
7. **Marka:** logo i ikony COSGRAL; zero assetów OpenBota w paczce.

### Funkcja (ogólny szablon)

| Krok | Oczekiwany wynik | Jak sprawdzić |
|---|---|---|
| Otwórz ekran z nawigacji | Widok się ładuje < 2 s w piaskownicy; brak białego ekranu | Klik w UI; lekki test selektora / Storybook gdy jest |
| Wykonaj główne CTA | Stan zapisany / nawigacja / karta Needs you zgodnie z kontraktem | IPC mock lub silnik; po GO: `sandbox:e2e` / tryb W5 |
| Odśwież / wróć | Stan wraca (nie gubi wyboru) | Restart widoku; po GO: Electron |
| Błąd sieci / atrapy | Komunikat + możliwość ponowienia; pole nie zostaje zablokowane bez Stop | Mock błędu |

---

## P0 — kolejność implementacji

### 1. Pasek boczny + szyna (`S-SIDEBAR`)

**Odniesienie:** `openbot-0.71-ui\main-shell\` (foldery listy agentów / wyszukiwania) + zrzuty 089–092.

| ID | Kryterium wyglądu | Pass | Fail |
|---|---|---|---|
| S-SIDEBAR-L1 | Szyna ikon + panel listy; szerokości zgodne z tokenami / odniesieniem ±2 px | Regiony na miejscu | Panel „pływa” / zła szerokość |
| S-SIDEBAR-L2 | Wyszukiwarka, collapse, foldery, „+” z menu (agent / kanał / folder) | Wszystkie widoczne i spójne | Brak „+” lub osobne chaotyczne przyciski bez sensu |
| S-SIDEBAR-L3 | Napisy sens: wyszukaj, foldery, nowy… (PL/EN z i18n) | Sens OK | EN przy PL lub odwrotnie |
| S-SIDEBAR-L4 | Hover/focus na wierszu i ikonie szyny | Wyraźne | Brak stanu |

| ID | Kryterium funkcji | Pass | Jak |
|---|---|---|---|
| S-SIDEBAR-F1 | Klik agenta otwiera jego czat | Wątek właściwy | UI + mock `bots` |
| S-SIDEBAR-F2 | Wyszukiwanie filtruje listę | Wyniki sensowne | Lekki test |
| S-SIDEBAR-F3 | Foldery: utwórz / zmień nazwę / przenieś | Zmiana zostaje po odświeżeniu | IPC sidebar |
| S-SIDEBAR-F4 | Menu „+” → Nowy agent / kanał / folder | Odpowiedni widok lub dialog | UI |

**Adresat poprawek:** UI Designer (układ); Backend (foldery IPC).

### 2. Nowy agent (`S-NEW-AGENT`)

**Odniesienie:** `main-shell\01-new-agent`, `03-new-agent`, foldery koloru/modelu; zrzuty 001, 041–043, 098.

| ID | Wygląd | Pass |
|---|---|---|
| S-NEW-AGENT-L1 | Formularz: awatar/kolor, nazwa, opis, model + effort, sugestie, Create | Jak odniesienie (układ), nasze teksty |
| S-NEW-AGENT-L2 | Wybór koloru i modelu czytelny w ciemnym (i jasnym) | Kontrast OK |

| ID | Funkcja | Pass | Jak |
|---|---|---|---|
| S-NEW-AGENT-F1 | Create → agent na liście i otwarty czat | Bot istnieje | `agentSettings.createAgent` / mock |
| S-NEW-AGENT-F2 | Walidacja pustej nazwy | Błąd, bez tworzenia | UI |
| S-NEW-AGENT-F3 | Anuluj / wstecz | Bez śmieci w bazie | UI |

**Adresat:** UI Designer; Backend (createAgent).

### 3. Chrome czatu (`S-CHAT`)

**Odniesienie:** foldery rozmowy w `main-shell\` + zrzuty 046–052, 102–119.

| ID | Wygląd | Pass |
|---|---|---|
| S-CHAT-L1 | Zakładki wątku, pasek modelu, pole wiadomości, attach, akcje hover | Regiony OK ±2 px |
| S-CHAT-L2 | Panel boczny / kroki (Steps) nie zasłaniają pola bez sensu | Czytelne |
| S-CHAT-L3 | Stany: Thinking / limit / błąd — z Stop gdy agent działa | Nie „wisi” bez Stop |

| ID | Funkcja | Pass | Jak |
|---|---|---|---|
| S-CHAT-F1 | Wyślij wiadomość | Pojawia się w wątku | mock / po GO e2e |
| S-CHAT-F2 | Attach pliku | Plik w bibliotece / szkicu | library IPC |
| S-CHAT-F3 | Stop podczas pracy | Kończy turę, odblokowuje pole | computerUse/agent stop |
| S-CHAT-F4 | Needs you: confirm / draft | Karty działają, nie znikają po reload | action cards |

**Adresat:** UI Designer; Backend (kolejka, Stop).

---

## P1

### 4. Ustawienia agenta — 12 kart (`S-AGENT-SETTINGS`)

**Karty (kolejność odbioru):** instrukcje, pamięć, skille, pliki, tabele, rutyny, użycie, publikacja, uprawnienia, zaawansowane, foldery, powiadomienia (+ zapasowe modele jeśli w tej grupie).  
**Odniesienie:** zrzuty 059–074; folder ekstraktora — po domknięciu B1.

| ID | Wygląd | Pass |
|---|---|---|
| S-AGENT-SETTINGS-L1 | Nawigacja 12 kart; aktywna karta wyróżniona | Wszystkie dostępne |
| S-AGENT-SETTINGS-L2 | Formularze: pola, toggles, listy — tokeny `--cosgral-*` | Spójne |

| ID | Funkcja | Pass | Jak |
|---|---|---|---|
| S-AGENT-SETTINGS-F1 | Zapis karty → `agentSettings.update` / równoważne | Stan po reload | IPC |
| S-AGENT-SETTINGS-F2 | Pamięć / skille / MCP przełączniki | Włącz/wyłącz zostaje | IPC memory/skills/mcp |
| S-AGENT-SETTINGS-F3 | Modele zapasowe w obrębie dostawcy | Faktycznie przełączają | providers (regresja KK) |

**Adresat:** UI Designer; Backend (kontrakty ustawień).

### 5. Ustawienia serwera — 14 sekcji (`S-SERVER-SETTINGS`)

**Sekcje:** General, Personality, Agents, Vault, Members, Remote desktop, MCP, Storage, Sites, Providers, Import, Transfer, Routines, Browser profiles.  
**Odniesienie:** `main-shell\17-`…`32-`.

| ID | Wygląd / funkcja | Pass |
|---|---|---|
| S-SERVER-SETTINGS-L1 | Lista 14 sekcji + treść | Nawigacja działa |
| S-SERVER-SETTINGS-F1 | Zmiana w General/Personality zapisuje się | Po reload OK |
| S-SERVER-SETTINGS-F2 | Providers / Vault / MCP otwierają realne widoki (nie martwe „soon”) | Podpięte do kontraktu lub jasny stub z ticketem |

**Adresat:** UI + Backend/KK wg `podzial-backend.md`.

### 6. Marketplace — 3 zakładki (`S-MARKET`)

**Odniesienie:** `main-shell\13-`…`16-`; zrzuty 009, 035–039.

| ID | Pass |
|---|---|
| S-MARKET-L1 | Apps / Agents / Skills + Connect/Install czytelne |
| S-MARKET-F1 | Install (atrapa) dodaje pozycję; Connect bez prawdziwego konta = Needs you / komunikat |
| S-MARKET-F2 | Brak crash przy pustym katalogu |

**Adresat:** UI; KK (katalog).

### 7. Zadania ↔ czat (`S-TASKS`)

**Odniesienie:** zrzuty 078–087.

| ID | Pass |
|---|---|
| S-TASKS-L1 | Lista zadań, archiwum, kroki — spójne z chrome czatu |
| S-TASKS-F1 | „Open as chat” otwiera wątek |
| S-TASKS-F2 | Archive ukrywa z aktywnych |

**Adresat:** UI; Backend (tasks).

---

## P2 / P3 (skrót — pełne ID przy oddaniu ekranu)

| Ekran | ID bazowe | Minimum PASS |
|---|---|---|
| Dok + wyspa | S-DOCK | Pin/unpin, reorder, island badge; zdarzenia `dock-changed` / `island-changed` |
| Ustawienia aplikacji | S-APP-SETTINGS | Język, powiadomienia, wygląd, aktualizacje (bez billing w COSGRAL) |
| Workflows | S-WF | Płótno puste + dodaj trigger/node; `workflowProblems` na żywo gdy API jest |
| Biblioteka / Użycie / Rutyny | S-LIB / S-USAGE / S-ROUTINES | Siatka plików; pierścienie użycia; lista rutyn + pause/run |
| Nowy kanał | S-CHANNEL | Dialog create; przycisk w UI (regresja: API bez UI = FAIL) |
| Mobile / Remote / Voice | S-MOBILE / S-REMOTE / S-VOICE | Ekrany Connect / remote / voice models; bez prawdziwych kont w teście |

---

## Top 10 luk 0.71 — stan odbioru

Źródło priorytetów: analiza Testera + raport poranny lidera. Aktualizuj kolumnę tylko z dowodem w oknie (nie z samym mockiem).

| # | Luka | Stan odbioru | Dowód |
|---|---|---|---|
| 1 | Pasek boczny, nowy agent, chrome czatu | oczekuje UI `team/ui/w11-ui1` | — |
| 2 | 12 kart ustawień agenta + 14 sekcji serwera | brak ekranów | — |
| 3 | 18 dostawców, pula kont, CLI | backend w toku | — |
| 4 | Marketplace Apps | brak | — |
| 5 | Vault konektory | KK | — |
| 6 | Odbiór wątków w prawdziwym oknie | po GO | — |
| 7 | Komunikatory poza Telegramem | KK | — |
| 8 | Zdalny pulpit | backend/KK | — |
| 9 | Głos | brak | — |
| 10 | Biblioteka (siatka) + Użycie | brak UI | — |

`docs/cosgral/parytet-0.68.md`: sekcję „0.71” dopisuj **tylko** gdy PASS w Electronie (pkt 4 T-A).

---

## Kolejność pracy Testera (T-A)

1. **Ten plik** — kryteria (gotowe na tej gałęzi).
2. **`scripts/ui-fidelity/`** — porównanie `styles.json` / `texts.json` (statycznie, potem z `--target cosgral` Backendu).
3. **Odbiór gałęzi UI** (`team/ui/w11-ui1`): lekkie kontrole od razu; e2e/Electron po `GO-*.txt`.
4. **Parytet** — tylko z dowodem w oknie.

## Czego ten dokument nie obejmuje

- Treści i assetów z paczki OpenBota (zakaz w repo).
- Browser / Voice / pełnych Workflows w ekstraktorze B1 (braki odnotowane w `INDEKS.md` poza repo).
- Prawdziwych kont zewnętrznych (Slack, billing, CLI download) — tylko atrapy i Needs you.
