# BE-X: „Restore workspace” i „Open links in” po stronie silnika (18.11.2026)

Gałąź `team/backend/w12-x` z integracji `544a6869c`. Dwie atrapy w Ustawieniach dostały kontrakt, zapis i walidację. **Silnik nie zmienia jeszcze zachowania okna**: odczyt i użycie wartości to zadanie UI (opis niżej).

## 1. Gdzie otwierają się linki (`behavior.externalLinks`)
- Wartości: `"browser"` (domyślna przeglądarka komputera, tak jest dziś) albo `"app"` (przeglądarka wewnątrz programu).
- Zapis: `window.openbot.appSettings.update({ behavior: { externalLinks: "app" } })`. Zła wartość = odmowa „externalLinks is one of browser, app.”.
- UI: w `Conversation.tsx` `openMessageLink(url)` dziś woła `openUrl` (domyślna przeglądarka). Przy `"app"` ma wołać `window.openbot.browser.open({ url, ownerThreadId, ownerBotId })` i otworzyć panel przeglądarki (jak istniejący `openBrowserAddress`). Wiersz w `SettingsModal.tsx` („Open external links in”) podpiąć do `behavior.externalLinks`: opcja „Default browser” = `browser`, „COSGRAL” = `app`.

## 2. Pamiętanie ostatniego miejsca (`workspace`)
- `workspace.restore` (domyślnie włączone) i `workspace.last = { page, botId, threadId } | null`.
- Okno zapisuje miejsce przy zmianie strony, agenta lub wątku: `appSettings.update({ workspace: { last: { page: "agents", botId, threadId } } })`; przy starcie czyta `appSettings.get()` i, gdy `restore` jest włączone, otwiera to miejsce. `restore:false` zostawia zapamiętane miejsce, ale nic nie przywraca. `last: null` zapomina.
- Reguły (kontrakt `parseWorkspacePatch`): strona z listy stron, identyfikatory 1–200 znaków bez znaków sterujących, wątek tylko razem z agentem. Zła zmiana odrzucana w całości, zdaniem po ludzku.
- **Gwarancja silnika:** przy odczycie agent, który już nie istnieje, jest wycinany razem z wątkiem (strona zostaje), więc okno nie dostaje miejsca, którego nie ma. Wątek, którego już nie ma, sprawdza okno (silnik zna tylko agentów).
- Zdarzenie `app-settings-changed` jak dotąd. Uwaga dla UI: zapis co każdy klik zalewa zdarzeniami; zapisywać z opóźnieniem ok. 500 ms.

## Pliki
`packages/contracts/src/ipc-agent-settings.ts`, `src/backend/agent-settings.ts`, `src/main/ipc/agent-settings-inputs.ts`, `src/renderer/stories/mock-openbot.ts` (atrapa), `AppBehaviorSection.tsx` (domyślny stan z `DEFAULT_APP_BEHAVIOR` zamiast ręcznego obiektu; klucze przełączników zawężone do dwóch boolean).

## Testy (po jednym pliku)
`ipc-agent-settings.test` 11/11, `ipc-theme.test` 1/1, `agent-settings.test` 15/15 (zapis, restart, odrzucenie usuniętego agenta, odmowy), `agent-settings-inputs.test` 3/3, `onboarding.test` 5/5, `AppBehaviorSection.test` (patrz wynik w raporcie kanału). Biome czysty, `typecheck:contracts/node/renderer` EXIT 0. Test parsera złapał brakujący klucz `workspace` w liście dozwolonych pól: poprawione.

## Luki
- Nic w oknie nie sprawdzone; UI jeszcze nie czyta ani nie zapisuje tych pól.
- Wątki, które zniknęły, sprawdza okno (silnik tego nie widzi).
- Ostatnie miejsce jest jedno (nie osobne dla każdego serwera).
