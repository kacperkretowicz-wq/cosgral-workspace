# Inwentarz napisów UI → katalog i18n

## Stan aktualny (18.11.2026, KAPI-P / kolejka #6)

**Integracja bazowa:** `codex/cosgral-desktop` @ `4f21fbfe7` (+ `team/kapi/w12-p`).  
**Metoda:** skan plików produkcyjnych `src/renderer/src` (bez `*.test.*`, bez `stories/`, bez `locales/`); test `i18n.test` („has complete, nonempty PL and EN catalogs” + skan `t("…")` na migracjach).

| Metryka | Wartość |
|---|---:|
| Klucze EN / PL | **1530 / 1530** (równe, wartości niepuste — potwierdzone vitest) |
| Pliki produkcyjne | ~172 |
| Z importem `t()` / i18n | ~63 |
| Bez `t()` (w tym helpery, ikony, CSS-in-ts) | ~109 |
| Sztywne `aria-label="…"` (literal) | **~91** miejsc |

### Co jest już na `t()` (skrót)

Conversation (panel ustawień, kicker Decision, reakcje), ContextIndicator (KAPI-P), AgentCards (Brain/Knows/More + etykiety), Sidebar/PageRail/Needs you (część), Marketplace, Tasks, Workflows, Vault connectors, Schedule/Usage/Library (część), ChannelView/Clear history/history window, InitialSetup, New agent, ThreadTabs, GlobalSearch, …

### Największe pozostałości sztywnego EN (aria / panele)

Priorytet kolejnych migracji (nie KK-only):

| Priorytet | Pliki | Co |
|---|---|---|
| P0 | `conversation/ChatSearch`, `MessageRendering`, `SelectionActions`, `QueuePanel`, `ComposerEditor` | aria rozmowy poza już migrowanym Conversation |
| P1 | `AccessSettings`, `IsolationSettings`, `BrowserProfileSettings`, `BudgetSettings` | nagłówki i opisy pól (błędy+aria sekcji: KAPI-P) |
| P1 | `AccountLogin`, `ApiKeysSection`, `McpPanel`, `MemoryPanel`, `AgentSettingsW3` | całe sekcje bez `t()` |
| P2 | `RemoteDesktopPage`, `MobileConnectPage`, `HostPanel`, `Spaces` | aria + copy |
| P2 | `Sidebar` (reszta), `App.tsx` loading aria | drobne aria |
| Uwaga | `AgentAccountPicker` | aria nadal **PL na sztywno** („Konto agenta”) — wyspa |

### Test kompletności

`bun x vitest run src/renderer/src/i18n.test.tsx` — katalogi równe + każdy literal `t("…")` w listowanych powierzchniach ma klucz EN i PL. Po KAPI-P lista obejmuje też: ContextIndicator, Access/Isolation/Browser/Budget, ChannelWorkspace, `conversation/AgentActivity`.

### Podgląd web

`scripts/web-preview` celowo stubuje katalogi (puste `en`/`pl`) pod limit 1,8 MB — **nie** jest miarą kompletności i18n desktopu (KAPI-O).

---

## Archiwum W7-T2 (16.11.2026, Tester) — stan sprzed katalogu

**Integracja wtedy:** `7fe84704e`. Poniższe liczby i „brak katalogu” są **historyczne**.

### Na górze (historyczne)

- Katalogu i18n wtedy jeszcze nie było.  
- 11 plików z PL na sztywno + reszta UI prawie cała EN.  
- Kolejność migracji: onboarding → szyna → ustawienia → Needs you → rozmowa → Providers/CLI/Vault.

---

## 1. Podsumowanie grep (historyczne W7)

| Zbiór | Orientacja |
|---|---|
| Pliki `src/renderer` `*.ts`/`*.tsx` | ~325 |
| Produkcyjne `src/renderer/src` bez testów | ~129 |
| Produkcja z markerami PL | **11** plików |
| Suma trafień PL (11 plików) | **~72** linii |
| Brak katalogu `i18n` / `locale` w rendererze | potwierdzone |

**Krytyczna lista odbioru (W7-10) — przykłady nadal na sztywno:**

| Napis | Przykład lokalizacji |
|---|---|
| `Needs you` | `Sidebar.tsx` (nagłówek, aria, title) |
| `Thinking` / Show thinking | rozmowa / AgentActivity |
| `Settings` / `Appearance` / `Language` | `SettingsModal`, `AppSettingsW3` |
| `Pokaż ukryte` | `Sidebar.tsx` |
| `Pobierz` / `Pokaż w folderze` | `LibraryPanel.tsx` |
| `Narzędzia CLI` | `ManagedCliSection.tsx` |
| `Polski` obok EN | `AppSettingsW3.tsx` |

---

## 2. Wyspy PL (priorytet naprawczy)

| # | Plik | PL≈ | EN~ | Uwagi |
|---|---|---|---|---|
| 1 | `components/ProviderAccounts.tsx` | 31 | 55 | Stany logowania PL + EN |
| 2 | `components/ManagedCliSection.tsx` | 23 | 40 | „Narzędzia CLI”, Pobierz, ścieżka |
| 3 | `components/AgentAccountPicker.tsx` | 10 | 7 | „Konto agenta”, instrukcje PL |
| 4 | `components/Sidebar.tsx` | 3 | 148 | **„Pokaż ukryte”** + dużo EN (Needs you) |
| 5 | `components/AppSettingsW3.tsx` | 2 | 30 | `Language` + opcja **Polski** |
| 6 | `components/LibraryPanel.tsx` | 2 | 17 | **Pobierz**, **Pokaż w folderze** |
| 7 | `page-pins.ts` | 2 | 0 | „Przypięta” / pin labels |
| 8 | `components/PageRail.tsx` | 1 | 64 | Etykiety szyny (mieszanka) |
| 9 | `components/InitialSetup.tsx` | 1 | 66 | „Pobierz i przejdź dalej” + EN setup |
| 10 | `components/VoiceSettings.tsx` | 1 | 20 | Resztka PL |
| 11 | `App.tsx` | 1 | 143 | Główny shell — głównie EN |

---

## 3. Kolejność migracji (propozycja dla W7-UI2)

Migruj **pakietami ekranów** (EN+PL naraz do katalogu). Q5: brak klucza → fallback EN + log + CI red. Q8: przy PL tłumacz etykiety UI w tym „Needs you”; brand **COSGRAL** bez zmian.

### Faza A — widoczne od razu

| Kolej | Pakiet | Pliki (produkcja) | EN~ (suma orient.) | Cel |
|---|---|---|---|---|
| **A1** | Onboarding | `InitialSetup.tsx` (+ powiązane kroki w `App.tsx` jeśli stringi setup) | ~66+ | W7-14: wybór języka realnie zmienia setup |
| **A2** | Szyna | `PageRail.tsx`, `page-pins.ts`, skróty pinów | ~64 | Etykiety stron; „Przypięta” |
| **A3** | Ustawienia | `SettingsModal.tsx`, `AppSettingsW3.tsx`, `AppearanceSettings.tsx`, `DataWipeSection.tsx`, `VoiceSettings.tsx`, `ContextSettingsSection.tsx` | ~39+30+7+… | W7-15; Appearance już EN — do katalogu |
| **A4** | Needs you | `Sidebar.tsx` (sekcja Needs you), `StickyDecision.tsx`, `ConversationPrompts.tsx`, `AccountLimitCards.tsx`, `needs-you.ts` | ~148+10+55+22+26 | Q8 tłumaczenie „Needs you” / Decision |
| **A5** | Rozmowa | `Conversation.tsx`, `conversation/ChatSearch.tsx`, `AgentActivity.tsx`, `MessageRendering.tsx`, `SelectionActions.tsx`, `MessageHistoryActions.tsx`, `ThreadPanel.tsx`, `PlanPanel.tsx`, `ComposerEditor.tsx`, `QueuePanel.tsx` | ~250+ (Conversation dominuje) | Search, Thinking, Stop, Retry/Edit/… |

### Faza B — wyspy PL + dostawcy

| Kolej | Pakiet | Pliki | Po co |
|---|---|---|---|
| **B1** | CLI / konta | `ManagedCliSection.tsx`, `ProviderAccounts.tsx`, `AgentAccountPicker.tsx`, `AccountLogin.tsx` | Usunąć największe wyspy PL |
| **B2** | Providers / Usage | `ProvidersPage.tsx`, `ProviderModelPicker.tsx`, `ProviderFallbackLists.tsx`, `ApiKeysSection.tsx`, `EndpointsSection.tsx`, `UsagePage.tsx` | Kanon Dostawcy (Q2) |
| **B3** | Library / Vault / tabele | `LibraryPanel.tsx`, `VaultPanel.tsx`, `TablesPanel.tsx` | Pobierz / folder |

### Faza C — reszta powierzchni

| Kolej | Pakiet | Pliki (przykłady z wysokim EN~) |
|---|---|---|
| **C1** | Agent settings | `AgentSettingsW3.tsx`, `MemorySettings.tsx`, `SkillsSettings.tsx`, `McpSettings.tsx`, `ApprovalRulesSettings.tsx` |
| **C2** | Kanały / zadania / rutyny | `ChannelView.tsx`, `TasksPage.tsx`, `WorkflowsPage.tsx`, `RoutinePanel.tsx` |
| **C3** | Mobile / remote / host | `MobileConnectPage.tsx`, `RemoteDesktopPage.tsx`, `RemoteMacPanel.tsx`, `HostPanel.tsx` |
| **C4** | Dok / wyspa | `dock/DockApp.tsx`, `dock/IslandApp.tsx` |
| **C5** | UI kit (ostrożnie) | `components/ui/*` — tylko stringi użytkownika, nie nazwy wariantów |

**Nie tłumaczyć automatycznie:** treść wiadomości modelu, nazwy skilli użytkownika, brand COSGRAL (spec §1B wiersz 11; Q8).

---

## 4. Top produkcyjnych plików EN (orientacja Title Case)

Pomoc przy szacunku kluczy (nie kompletna lista):

| EN~ | Plik |
|---|---|
| 250 | `components/Conversation.tsx` |
| 148 | `components/Sidebar.tsx` |
| 143 | `App.tsx` |
| 117 | `components/HostPanel.tsx` |
| 66 | `components/InitialSetup.tsx` |
| 64 | `components/PageRail.tsx` |
| 63 | `components/AccountLogin.tsx` |
| 61 | `components/ProvidersPage.tsx`, `WorkflowsPage.tsx` |
| 55–57 | `SelectionActions`, `ComposerEditor`, `ProviderAccounts`, `ConversationPrompts`, `MobileConnectPage` |
| 50 | `VaultPanel`, `RemoteDesktopPage` |
| 39–47 | `SettingsModal`, `MessageHistoryActions`, `RoutinePanel`, `TasksPage` |

Szacunek W7-UI2 (jak spec §5): **setki kluczy** EN+PL; CI 0 braków (Q5/Q12).

---

## 5. Reguły dla PR UI (propozycja do UI2/KK)

1. Nowy napis UI = klucz w katalogu EN **i** PL w tym samym PR.  
2. Zakaz nowych PL/EN na sztywno w JSX (W7-30 — reguła CI do dopięcia).  
3. Testy/Storybook: asercje po kluczach albo po obu locale; nie tylko hardcode „Needs you” po migracji A4.  
4. Po fazie A: `language=pl` nie może zostawić Settings/Sidebar w EN (W7-15).

---

## 6. Czego nie sprawdziłem

1. AST / pełnej ekstrakcji template literals i `aria-label` bez cudzysłowu Title Case.  
2. Stringów tylko w CSS `content:` / native menu Electron.  
3. Stories i testów (celowo poza migracją produkcyjną; testy trzeba będzie zaktualizować przy UI2).  
4. Działania przełącznika języka w oknie (brak katalogu).  
5. Dokładnej liczby unikalnych kluczy po deduplikacji.

---

## Commity

Gałąź `team/tester/w7-t2` — SHA w `channel_result`.

### W6-UI5-FIX: dopisek do W7-UI2
- Sidebar: przycisk "Pokaż ukryte" pozostaje po polsku w angielskim interfejsie. Przenieść do wspólnego katalogu EN/PL w W7-UI2; bez zmiany napisu w tej poprawce.

### W7-UI2: dopisane obszary W8/W10 (osobna migracja)
- AccessSettings, BudgetSettings: poziomy dostępu, odmowy, zużycie, ostrzeżenie i wyczerpanie budżetu, koszt niedostępny, heldReason.
- IsolationSettings, BrowserProfileSettings: active/shared-process/unavailable/off, przyczyna niedostępności, signed-out notice, domeny allow/block, potwierdzenie czyszczenia danych.
- Integrations (kontrakt W10-KK1): Connect account, waiting-for-browser, connected, failed/needs-login, Disconnect, allowlista narzędzi. Ten etap nie tłumaczy W8 ani W10.
- Etap PL/EN 1 obejmuje istniejące SettingsModal, AppearanceSettings, AppSettingsW3 i etykiety Sidebar/PageRail. Pełna migracja wszystkich ekranów i sześciu działających zakładek pozostaje do odbioru; sam słownik nie oznacza pełnego G4.

---

## 7. Nowo dodane ekrany i kontrakty W11/W12 (Stan: 17.11.2026, KAPI-B)

Weryfikacja zmian po integracji fali W11 i W12 (`team/ui/w11-ui1`, `team/backend/w11-engines`, `team/backend/w11-agent-cards`, `team/kk/w11-marketplace`, `team/kk/w11-vault-connectors`, `team/kk/w12-oauth`).

### A. Ekrany podpięte do katalogu i18n (`src/renderer/src/locales/en.ts` i `pl.ts`)

Katalog i18n został wzbogacony o 28 nowych par kluczy obsługujących nowe komponenty UI:

| Komponent / Plik | Klucze EN | Klucze PL | Uwagi / Status |
|---|---|---|---|
| `ThreadTabs.tsx` | `Could not change the thread tabs.`<br>`Threads`<br>`Close tab`<br>`Tab actions`<br>`Close other tabs`<br>`Close tabs to the right`<br>`New thread`<br>`All threads` | `Nie udało się zmienić kart wątków.`<br>`Wątki`<br>`Zamknij kartę`<br>`Akcje karty`<br>`Zamknij pozostałe karty`<br>`Zamknij karty po prawej`<br>`Nowy wątek`<br>`Wszystkie wątki` | W pełni oparte o `t()`. Obsługa nawigacji klawiaturą, menu kontekstowego i powiadomień błędów. |
| `GlobalSearch.tsx` | `Search COSGRAL`<br>`Search`<br>`Filter results`<br>`Results`<br>`Nothing found`<br>`You to {name}`<br>`{name} to you`<br>`Agent`, `Channel`, `File`, `Routine`, `Result`<br>`All`, `Messages`, `Files`, `Routines` | `Szukaj w COSGRAL`<br>`Szukaj`<br>`Filtruj wyniki`<br>`Wyniki`<br>`Nic nie znaleziono`<br>`Ty do {name}`<br>`{name} do Ciebie`<br>`Agent`, `Kanał`, `Plik`, `Rutyna`, `Wynik`<br>`Wszystko`, `Wiadomości`, `Pliki`, `Rutyny` | W pełni oparte o `t()`. Zakładka `Bots` przemianowana na `Agents` (zgodnie ze stylem 0.71). |
| `ComposerEditor.tsx` | `Commands`<br>`/{command.name}` | `Polecenia`<br>`/{command.name}` | Sekcja menu poleceń `/` (`aria-label={t("Commands")}`). Hinty poleceń pochodzą z kontraktu. |
| `InitialSetup.tsx` | Pełny zestaw ekranu powitalnego: `Set up this computer`, `Connect to a host`, `Where will COSGRAL Workspace run?`, `Local computer`, `Remote host`, `Mac permissions`, `Continue with {provider}`, `Choose a provider`, `COSGRAL Workspace could not save your local setup.` | Pełne tłumaczenia PL w `pl.ts` | Wybór języka na ekranie początkowym natychmiastowo przełącza teksty powitalne. |
| `NewAgentPage.tsx` | `Create new`, `New agent`, `Agent color`, `Automatic color`, `Agent face`, `Choose this face`, `More faces`, `Name`, `Agent name`, `What should this agent help with?`, `Model`, `Agent model`, `Effort` (`Low`, `Medium`, `High`, `Extra high`, `Max`), `Suggestions`, nazwy 10 kolorów (Red..Magenta) | Pełne tłumaczenia PL w `pl.ts` | Samodzielna strona kreatora agenta z natychmiastowym podglądem. |
| `Sidebar.tsx` / Akcje | `Duplicate`<br>`Copy ready. Memory, history, queue, routines, channels and Vault are not copied.`<br>`Note:` | `Duplikuj`<br>`Kopia gotowa. Pamięć, historia, kolejka, rutyny, kanały i Vault nie są kopiowane.`<br>`Uwaga:` | Klonowanie agenta z jasnym komunikatem o zakresie kopii. |

---

### B. Nowe kontrakty Backend / KK (do objęcia i18n przy wdrożeniach ekranów)

Nowe kontrakty zdefiniowały stałe komunikaty błędów i etykiety w języku angielskim. W momencie tworzenia dedykowanych paneli UI należy wdrożyć mapowanie tych komunikatów na klucze katalogu `t()`:

#### 1. Konektory Sejfu (`packages/contracts/src/ipc-vault-connectors.ts`)
- **Stany konektora:** `disconnected`, `connecting`, `choose-account`, `connected`, `failed`.
- **Kody błędów (`errorCode`):**
  - `cli-missing`: brak zainstalowanego narzędzia menedżera haseł (`op`, `bw`).
  - `cli-signed-out`: brak aktywnej sesji logowania w aplikacji menedżera.
  - `token-rejected`: token serwisowy lub klucz sesji został odrzucony.
  - `locked`: sejf menedżera jest zablokowany.
  - `folder-missing`: brak wskazanego folderu współdzielonego (`Shared with COSGRAL`).
  - `plan`: ograniczenia planu subskrypcyjnego konta.
  - `unknown`: ogólny błąd ze stałym, bezpiecznym komunikatem.
- **Stałe zdania błędów walidacji:**
  - `"The connector request is malformed."`
  - `"Choose one of the accounts that were offered."`
  - `"Paste the token or key first."`
  - `"That token or key is too long."`
  - `"This way of connecting takes no token or key."`
  - `"Only Bitwarden takes a server address."`
  - `"A server address starts with https:// and has no user name, query or fragment."`
  - `"Choose a Vault item."`
  - `"The file is empty."`
  - `"That file is too large to import."`

#### 2. Katalog Aplikacji Marketplace (`packages/contracts/src/ipc-plugin-catalog.ts`)
- **Kategorie wtyczek:** `coding`, `productivity`, `data-analytics`, `automation`, `research`, `design`, `documents`, `other`.
- **Stany instalacji:** `available`, `installed`, `needs-sign-in`, `update-available`, `error`.
- **Metody autoryzacji:** `link` (OAuth przez przeglądarkę), `key` (wpisanie klucza write-only), `local` (bez autoryzacji).
- **Źródła katalogu:** `none`, `folder` (folder właściciela), `demo`.

#### 3. Przegląd 14 kart Agenta (`packages/contracts/src/ipc-agent-cards.ts`)
- **Identyfikatory kart:** `chat-color`, `instructions`, `memory`, `skills`, `files`, `tables`, `routines`, `usage`, `publish`, `permissions`, `advanced`, `folders`, `notifications`, `backup-models`.
- **Kolory czatu agenta:** `default`, `blue`, `green`, `amber`, `red`, `violet`, `pink`, `teal`.
- **Tryb wiadomości podczas pracy:** `app-default`, `queue`, `steer`.
- **Poziomy powiadomień:** `all`, `mentions`, `none`.
- **Krótkie etykiety podsumowań kart:** format tekstowy np. `"3 folders"`, `"Queue"`, `"Off"`, `"8 models"`.

#### 4. Pasek czatu i polecenia `/` (`packages/contracts/src/ipc-composer.ts`)
- **Polecenia programu:**
  - `/compact` – hint: `"Shorten the conversation to free context"`
  - `/new-thread` – hint: `"Start an empty thread"`
  - `/side` – hint: `"Ask a side question without touching the chat"`
- **Stany pytania pobocznego (Side Question):** `running`, `done`, `failed`, `cancelled`.
- **Rodzaje wzmianek (`@`):** `agent`, `channel`, `file`.

#### 5. Most Telegrama (`packages/contracts/src/ipc-messengers.ts`)
- **Stany połączenia:** `disconnected`, `polling`, `failed`, `needs-token`.
- **Stałe zdania ostrzeżeń:** brak autoryzacji tokena, odrzucenie czatu spoza dozwolonej listy (ciche ignorowanie bez wysyłania odpowiedzi do obcych).

#### 6. Dostęp z telefonu (`packages/contracts/src/ipc-phone-access.ts`)
- **Ekrany PWA telefonu:** ekran blokady PIN (`"Enter PIN"`, `"Unlock"`), instrukcja konfiguracji Tailscale, stan powiadomień Web Push.
- **Odpowiedzi bezpieczeństwa:** kod 423 (blokada po 5 min bezczynności lub po restarcie komputera), kod 403 dla operacji dozwolonych wyłącznie na komputerze (Computer Use, Vault reveal, konfiguracje MCP).
