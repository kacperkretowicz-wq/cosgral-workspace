# Raport KAPI W4-K3: braki kontraktu z W4-UI4 (wiersze 2 i 3 parytetu)

**Gałąź:** `team/kapi/w4-k3` (od integracji `7ea9afcfe`), worktree `desktop-kapi`
**Data:** 16.11.2026, ok. 01:05–01:45
**Zakres:** kontrakty, silnik, IPC, preload, atrapy i testy. **UI nie podłączone** (robi UI Designer po tym oddaniu).

## Werdykt

| Krok | Wynik | Commit |
|---|---|---|
| 1. Przypinanie stron szyny (`AppSettings.navigation`) | ✓ kontrakt, silnik, parser IPC, atrapa, testy | `7592543bc` |
| 2. Ukrywanie agenta (`agent.setBotHidden`, `BotSummary.hidden`, `listBots`) | ✓ | `32b64dd02` |
| 3. Duplikowanie agenta (`agent.duplicateBot`) | ✓ | `dc4dae483` |
| 4. Wątki (`createThread`, `listThreads`, `selectThread`) i okno rozmowy (`openConversationWindow`) | **nie zrobione celowo**: silnik ma jeden wątek na agenta (to W6-BE1). Opis, czego trzeba, niżej | (ten raport) |

Wiersze 2 i 3 parytetu zostają „częściowo”, dopóki UI nie wystawi tych akcji i KK ich nie odbierze. Tabeli parytetu nie ruszałem.

## Kontrakty dla UI (dokładne nazwy i kształty)

### 1. Przypinanie stron szyny

```ts
// packages/contracts/src/ipc-agent-settings.ts
export const APP_PAGE_IDS = ["agents","schedule","tasks","workflows","usage","library","marketplace","remote-desktop","providers","phone"] as const;
export type AppPageId = (typeof APP_PAGE_IDS)[number];
export interface AppNavigationSettings { pinnedPageIds: AppPageId[] }   // domyślnie []
AppSettings.navigation: AppNavigationSettings                            // z get i update
UpdateAppSettingsInput.navigation?: { pinnedPageIds: AppPageId[] }
```

- **Wywołanie:** `window.openbot.appSettings.update({ navigation: { pinnedPageIds: ["library", "agents"] } })` → zwraca zapisane `AppSettings`. `appSettings` jest w `window.openbot` opcjonalne (jak dotąd).
- **Semantyka:** zapis **całej listy naraz**. Kolejność to kolejność, w jakiej osoba przypięła. Pusta lista = nic nie przypięte. Zapis bez `navigation` (np. sam język) **nie rusza** przypięć.
- **Walidacja:** nieznane id i powtórzone id są odrzucane błędem `pinnedPageIds must list known pages, each at most once.` (parser IPC i drugi raz silnik). Dane odczytane z bazy są sprawdzane ponownie: złe lub powtórzone id są pomijane.
- **Zdarzenie:** istniejące `app-settings-changed { settings }` (już było emitowane przy każdym zapisie ustawień).
- **Trwałość:** w tabeli ustawień aplikacji, przeżywa restart (test).
- **Uwaga dla UI:** `PageId` w `PageRail.tsx` ma te same 10 id. Test `PageRail.contract.test.ts` pilnuje, żeby `APP_PAGE_IDS` i `PAGE_RAIL_ITEMS` nigdy się nie rozjechały (kolejność też). Co znaczy „przypięta” wizualnie (np. zawsze poza „More pages”), rozstrzyga UI.

### 2. Ukrywanie agenta

```ts
// packages/contracts/src/ipc-conversation.ts
BotSummary.hidden?: boolean                       // brak pola = widoczny; ustawione tylko gdy ukryty (true)
interface ListBotsInput { includeHidden?: boolean }
interface SetBotHiddenInput { botId: string; hidden: boolean }
// window.openbot.agent
listBots(input?: ListBotsInput): Promise<BotSummary[]>
setBotHidden(input: SetBotHiddenInput): Promise<BotSummary>
```

- **`setBotHidden`:** zapisuje flagę razem z rekordem agenta, odpowiada zaktualizowanym `BotSummary` i emituje `bots-changed`. **Nie jest aktywnością:** `updatedAt` zostaje, więc sortowanie i „nowa odpowiedź” się nie ruszają. Kanał `agent:set-bot-hidden`, **tylko ten komputer** (zdalny serwer dostaje błąd „Hiding an agent works on this computer only.”).
- **`listBots`: decyzja, którą musisz znać.** Bez argumentu albo z `{ includeHidden: true }` zwraca **wszystkich** (ukryci mają `hidden: true`). Dopiero `{ includeHidden: false }` zwraca **tylko widocznych**. Uzasadnienie: `service.listBots()` i zdarzenie `bots-changed` zawsze niosą wszystkich agentów, a z listy korzystają strony Providers, Workflows, dok, wyspa, telefon i Team API. Ukryty agent ma działać wszędzie poza paskiem bocznym. Odwrotna domyślna (bez ukrytych) rozjechałaby wynik `listBots()` ze zdarzeniami.
- **Dla paska bocznego:** filtruj po `bot.hidden !== true` (i zdarzeń, i listy). „Pokaż ukryte” = ten sam zbiór bez filtra. Ukryty agent **nadal działa**: kanały, przepływy, powiadomienia i „Needs you” go widzą.
- **Pole opcjonalne** (`hidden?`), żeby nie ruszać każdego `BotSummary` w atrapach i testach. Odczyt: `bot.hidden === true`.

### 3. Duplikowanie agenta

```ts
// packages/contracts/src/ipc-agent-settings.ts
interface DuplicateAgentInput { sourceBotId: string; name?: string }
// window.openbot.agent
duplicateBot(input: DuplicateAgentInput): Promise<CreateAgentResult>   // { bot: BotSummary, warnings: string[] }
```

- **Kanał** `agent:duplicate-bot`, **tylko ten komputer**. Zdarzenia: `bots-changed` (nowy agent), `skill-installs-changed` (skille).
- **Kopiuje się:** profil (rola, instrukcje = opis, wysiłek rozumowania, kolor awatara, flaga powiadomień), model, przełączniki narzędzi, zainstalowane skille (**czyste kopie z biblioteki**, bez lokalnych zmian źródła), serwery MCP **wyłączone** u źródła (reszta ma domyślnie włączone, jak u źródła) i modele zapasowe.
- **Nie kopiuje się:** pamięć, historia rozmów i wątek, kolejka, folder roboczy (kopia dostaje własny), rutyny, członkostwo w kanałach, Vault, reguły „zawsze zezwalaj”, sekrety i sesje CLI, własny obraz awatara (kopia ma własny `avatarSeed`, kolor jest skopiowany), miejsce w folderze paska bocznego (nowy agent jak po „New agent”).
- **Nazwa:** gdy `name` nie podano: `<nazwa> kopia`, potem `<nazwa> kopia 2`, `kopia 3` itd., aż nazwa będzie wolna (bez rozróżniania wielkości liter). Kopia kopii zachowuje nazwę źródłową (z „Ada kopia” robi „Ada kopia 2”, nie „Ada kopia kopia”). Nazwa mieści się w limicie 80 znaków. Nazwa podana przez osobę jest przycinana z białych znaków i użyta bez numeracji; za długa (> 80) jest odrzucana **zanim** powstanie agent.
- **Błędy:** brak agenta źródłowego → błąd, nic nie powstaje. Limit liczby agentów → błąd z `createBot`, nic nie powstaje. Gdy po utworzeniu nie uda się coś częściowo (model, narzędzia, skill, MCP, modele zapasowe), **kopia zostaje**, a powód jest w `warnings` (jak w kreatorze agenta).

## Krok 4: wątki i okno rozmowy (nie zrobione, powód i plan)

### Wątki: `createThread`, `listThreads`, `selectThread`
**Silnik nie ma pojęcia wielu wątków na agenta**, więc zgodnie ze zleceniem nie wymyślałem go (to W6-BE1: „wątki na agenta: karty, nazwa, archiwum, nowa rozmowa”, bramka „dwa równoległe wątki z jednym agentem, każdy z własnym kontekstem”). Co jest: tabela `projection_threads` ma klucz `thread_id` i `agent_id`, więc magazyn pomieściłby wiele wątków. Co blokuje:
1. `BotSummary.threadId` to jedyny wątek agenta (`stableThreadId(bot.id)`); cały silnik czyta go z rekordu agenta.
2. Migawki rozmów w `AgentService` są trzymane **per agent**, nie per wątek (`#ensureSnapshot(bot.id, bot.threadId)`), a kolejka (`mailbox`), stan przeczytania i „aktywna tura” są per agent.
3. Powiązanie sesji dostawcy (`bindProviderSession`, `activeProviderSession`) bierze `bot.threadId`.
4. `#ensureThreadProjection` przy każdym zapisie agenta nadpisuje wiersz wątku nazwą agenta (tytuł wątku nie istnieje).
5. Usunięcie agenta kasuje jeden wątek (`hardDeleteAgent`).
6. Karty „Needs you” niosą `threadId`, ale dla jednego wątku.

Potrzebne do W6-BE1: wskaźnik „aktywny wątek” agenta, lista wątków (id, tytuł, `updatedAt`, `archived`), migawki i kolejka per wątek, powiązanie sesji dostawcy per wątek, stan przeczytania per wątek, kaskada usuwania, tytuł wątku niezależny od nazwy agenta. Dopiero potem kontrakt, który zaproponował UI4 (`createThread`, `listThreads`, `selectThread`).

### Okno rozmowy: `openConversationWindow`
Nie ma pojęcia „okno jednej rozmowy” ani w silniku, ani w rendererze: `index.tsx` kieruje tylko `#dock`, `#island` albo cały `App`. Potrzebne: nowy widok renderera (np. `#conversation=<botId>` z samą rozmową, bez paska bocznego), w procesie głównym `BrowserWindow` jak w `dock-windows.ts` (z tymi samymi zabezpieczeniami, bez `window.open`) i rejestr okien per agent (otwarcie drugi raz = fokus, zamknięcie czyści). To praca UI + main, więc zostawiłem ją jako kontrakt do ustalenia przy wspólnej robocie z UI (po W6-BE1 okno dostanie jeszcze `threadId`). Pusta metoda w kontrakcie byłaby martwym przyciskiem, więc jej nie dodałem.

## Weryfikacja (komenda i wynik, po jednym poleceniu naraz)

| Komenda | Wynik |
|---|---|
| `vitest` `agent-settings.test.ts` (nowe: przypinanie, odrzucanie) | 10/10 |
| `vitest` `ipc-agent-settings.test.ts` + `agent-settings-inputs.test.ts` | 7/7 |
| `vitest` `onboarding.test.ts`, `AppSettingsW3.test.tsx`, `PageRail.contract.test.ts` | 8/8 |
| `vitest` `bot-store-hidden.test.ts` (nowy) | 4/4 |
| `vitest` `agent-inputs-k3.test.ts` (nowy) | 2/2 |
| `vitest` `agent-duplicate.test.ts` (nowy) | 7/7 |
| `vitest` `agent-service.test.ts` cały (+2 nowe: ukrywanie, duplikat przez prawdziwy `AgentService`) | 69/69, 73 s |
| `vitest` `bot-store.test.ts`, `agent-templates.test.ts`, `agent-settings.test.ts` (regresja) | 31/31 |
| `bun run test:contracts` | 26 plików, 97 testów |
| `vitest` `App.test.tsx` | 87/87 |
| Storybook (po jednym pliku, Chromium z `Shared\tools\playwright`): `InitialSetup`, `SettingsModal`, `W3Settings`, `App` | 3/3, 2/2, 2/2, 7/7 |
| `bun run typecheck:contracts`, `typecheck:node`, `typecheck:renderer`, `typecheck:storybook` | wszystkie exit 0 |
| `bun run check:ui` | exit 0 („Legacy composite debt: 0/0”) |
| `biome check --write` na wszystkich zmienionych plikach | czysto |

Nowa atrapa `appSettings` w `mock-openbot.ts` (get i update z `navigation`, `language`, `notifications`) sprawiła, że historie renderujące ustawienia widzą teraz ustawienia, a nie „niedostępne”. Cztery pliki historii, które to dotyka, przechodzą (wyżej).

**Pliki wspólne, minimum linii:** `src/main/index.ts` +16/−5 (przepisany handler `agent:list-bots` i nowy `agent:set-bot-hidden`), `src/backend/agent-service.ts` +18/−0 (`setBotHidden`, wiring kopii, jedna metoda w `AgentMcp`), `src/preload/index.ts` +10/−1. Bez przesuwania wcięć. Backend dopisuje wiring W5 w `index.ts`: przy konflikcie zostaw obie strony.

## Czego nie sprawdziłem

- **Prawdziwego okna Electron i `sandbox:e2e`.** Nie uruchamiałem programu ani nie pisałem kroku e2e dla tych metod (UI nie jest podłączone, a nieuruchomiony krok mógłby zepsuć bramkę). Propozycja kroku dla KK, już na poziomie API w prawdziwym oknie: `window.openbot.agent.setBotHidden` → `listBots({ includeHidden: false })` bez agenta → `listBots()` z `hidden: true` → przywrócenie; `duplicateBot` → nazwa „… kopia”, brak pamięci, `warnings: []`; `appSettings.update({ navigation })` → restart → przypięcie jest.
- **Preloadu w praktyce.** Strażnik `hidden` w `isBotSummary` i dekoder `duplicateBot` sprawdzone tylko typecheckiem (nie ma testów preloadu).
- **Prawdziwych ścieżek MCP i modeli zapasowych przy kopiowaniu.** Silnik kopii jest przetestowany na atrapach zależności; test przez prawdziwy `AgentService` nie ma `McpManager` ani `ProviderRegistry`, więc ścieżki `setAgentEnabled` i `setFallbackModels` przy kopii nie były wykonane na prawdziwych obiektach.
- **Zdalnych serwerów:** `setBotHidden` i `duplicateBot` świadomie tylko lokalnie; filtr `includeHidden: false` na liście ze zdalnego serwera jest w kodzie (po stronie głównego procesu), ale go nie wywoływałem.
- **Kopii skilla z lokalnymi zmianami źródła** i skilli spoza biblioteki: kopia dostaje czystą wersję z biblioteki albo ostrzeżenie.
- **Zachowania paska bocznego** po ukryciu agenta (UI jeszcze nie filtruje), obrazów wzorcowych `test:visual` (nie uruchamiałem), pełnego `bun run check` i `bun run test`.
- **Wpływu `hidden` na telefon, dok i wyspę:** nie zmieniałem ich; zgodnie z projektem ukrycie dotyczy tylko paska bocznego, więc wciąż widzą ukrytych agentów (do potwierdzenia przez lidera).

## Commity

1. `7592543bc` przypinanie stron
2. `32b64dd02` ukrywanie agenta
3. `dc4dae483` duplikowanie agenta
4. (ten raport, README_URUCHOMIENIE.md i COSGRAL-CHANGES.md: ostatni commit)
