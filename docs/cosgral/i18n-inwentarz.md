# Inwentarz napisów UI → katalog i18n (W7-T2)

**Stan: 16.11.2026. Autor: Tester.** Wejście dla **UI Designer (W7-UI2)**.  
**Integracja:** `codex/cosgral-desktop` @ `7fe84704e`.  
**Metoda:** jak `spec-w7.md` §5 — grep `src/renderer/**/*.ts(x)`, **bez** uruchamiania, **bez** AST extractora.  
**Zakres produkcyjny:** `src/renderer/src` **bez** `*.test.*` i **bez** `stories/`.

## Na górze

- **Katalogu i18n jeszcze nie ma** (brak folderu locale / `t()` w rendererze).  
- **11 plików z PL na sztywno** (wyspy) + **reszta UI prawie cała EN** w JSX.  
- **Kolejność migracji:** onboarding → szyna → ustawienia → Needs you → rozmowa → potem Providers/CLI/Vault/reszta.  
- Liczby poniżej = **orientacyjne** (trafienia linii grep). Kolumna „EN~” = cudzysłowy Title Case / typowe etykiety — **zawyża** (klasy, identyfikatory, zdania). Kolumna „PL” = diakrytyki + znane PL labelki.

---

## 1. Podsumowanie grep

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
