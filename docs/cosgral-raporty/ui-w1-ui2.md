# Raport W1-UI2 — trwałe Needs you / Decyzja, stany wierszy agentów, foldery

**Gałąź:** `team/ui/w1-ui2` (z integracji @ `5934131e3`)  
**Agent:** UI Designer  
**Data:** 12.11.2026  
**Zakres:** renderer, stories, mock, testy i ten raport. Bez zmian w backendzie, bez pushu.

## Werdykt

Wszystkie 6 punktów zadania zrobione. Metody kontraktu W1-BE1 (`listPendingRequests`, `listActivity`, `sidebar.*`, zdarzenia `*-resolved` i `activity-changed`, `sidebar-layout-changed`) były w kontrakcie, więc nic nie zatrzymało pracy.

`bun run test` (pełny zestaw): **82 plików, 625 testów, wszystkie zielone**. `typecheck:renderer`, `typecheck:storybook`, `build` i `build-storybook` OK.

## Co działa

| # | Temat | Zachowanie |
|---|---|---|
| 1 | **Trwałe Needs you i Decyzja** | Po starcie (agent gotowy, konto zalogowane) `App` czyta `agent.listPendingRequests?.()` i wypełnia listę kart, od najstarszej. `prompt-resolved` i `approval-resolved` usuwają kartę po `requestId` (także gdy odpowiedziało inne okno). `prompt` i `approval` nadal dodają kartę. Przypięta Decyzja to **najstarsza karta aktywnego agenta**; po odpowiedzi pokazuje się następna. Na agenta może czekać wiele kart. Logika w `pending-cards.ts` (czyste funkcje: dodaj, usuń, scal, najstarsza). |
| 2 | **Wyścig lista / zdarzenia** | Zdarzenie, które przyszło w trakcie ładowania listy, wygrywa z listą (`liveKeys`, `resolvedKeys`). Karta rozwiązana w trakcie ładowania nie wraca. Brak opcjonalnego API = jak dotąd (tylko zdarzenia). |
| 3 | **Stany wiersza agenta** | Start: `listActivity?.()`, potem `activity-changed` dla jednego agenta. „waiting” → ikona i etykieta **Needs you**; „working” → **Thinking**; „limited” → **Limit · resumes 15:40** (`resetsAt` w sekundach Unix, godzina lokalna; inny dzień: „Mon 09:00” / „Nov 20”; bez czasu „Limit reached”); „error” → **Error · krótki komunikat** (pierwsza linia, do 80 znaków); „idle” → bez znaczka. Stan inny niż idle wygrywa z „Responded”. Nieprzeczytane odpowiedzi nadal się pokazują, gdy agent jest idle. Lokalny stan (otwarta karta, trwająca tura) działa jak wcześniej, gdy backend jeszcze nic nie zgłosił. Logika w `row-activity.ts`. |
| 4 | **Foldery w pasku** | Start: `sidebar?.getLayout()`, potem `sidebar-layout-changed`. Foldery są **nad agentami** na każdym poziomie, do **5 poziomów**, z szewronem zwijania (`aria-expanded`). Menu folderu (prawy przycisk): New subfolder (wyłączone na 5. poziomie), Rename, Duplicate (bez kopiowania agentów), Move to…, Delete folder (potwierdzenie; podfoldery i agenci idą do rodzica). Menu agenta ma **Move to…** (okno z listą miejsc: Top level i foldery, z notką „Current” / „Too deep”). Przycisk „New folder” w nagłówku listy. Wyszukiwanie otwiera foldery z trafieniami i chowa pozostałe. Tryb wąski (compact) i serwer zdalny: lista płaska, bez folderów. Brak API `sidebar`: lista płaska, bez przycisku. Błąd zapisu pokazuje się w oknie albo nad listą. Logika drzewa w `sidebar-tree.ts`. |
| 5 | **`mock-openbot.ts`** | Opcjonalne `listPendingRequests`, `listActivity`; zdarzenia `prompt-resolved`, `approval-resolved`, `activity-changed`; `sidebar.getLayout/createFolder/updateFolder/moveFolder/duplicateFolder/deleteFolder/moveItem`, każde wysyła `sidebar-layout-changed`. Nowy `stories/mock-sidebar.ts` ma **te same reguły i komunikaty błędów co backend** (limit głębokości, brak ruchu do własnego podfolderu, duplikat bez agentów, usunięcie przenosi dzieci). Opcje `pendingRequests`, `activity`, `sidebarLayout` i sterowanie `emitActivity`, `emitSidebarLayout`. `respondToPrompt` / `respondToApproval` / `interrupt` czyszczą karty i wysyłają `*-resolved`, jak backend. |
| 6 | **Dokumentacja** | `COSGRAL-CHANGES.md` (nowy wiersz) i ten raport. |

### Notatka o kształcie (impeccable)

- **Foldery nad agentami**: na każdym poziomie najpierw podfoldery, potem agenci. Wiersz folderu jest niższy i **ściszony** (kolor drugorzędny, bez awatara, mała ikona folderu, licznik agentów po prawej), żeby agent z awatarem pozostał głównym bohaterem listy.
- **Szewron zwijania** po lewej, obraca się o 90° przy otwarciu. Wcięcie 14 px na poziom (`--folder-level`), maksymalnie 5 poziomów, więc wiersz agenta nie traci czytelnej szerokości.
- **Stany wiersza** to mały znaczek na awatarze plus jedna linia pod nazwą (zamiast podglądu wiadomości) tylko tam, gdzie ma coś do powiedzenia: limit i błąd. Pozostałe stany mają samą etykietę dla czytników ekranu.
- Okna folderów używają tych samych klas co okno usuwania agenta (`bot-delete-*`), więc wyglądają jak reszta aplikacji.
- Nic nie jest dodane jako nowy kolor: limit używa tonu ostrzegawczego, błąd tonu błędu, jak istniejące znaczniki.

### Decyzje projektowe

- **Bez przeciągania (drag and drop).** Bez przeglądarki nie da się tego sprawdzić, a zepsuty drag jest gorszy niż jego brak. „Move to…” (agent i folder) pokrywa ten sam przypadek z klawiatury i myszy. Można dodać później na tych samych akcjach (`moveAgent`, `moveFolder`).
- **Duplikat folderu nie kopiuje agentów** (zgodnie z kontraktem: agent ma jedno miejsce). Kopia nazywa się „<nazwa> copy”.
- **Serwery zdalne nie mają folderów** (kontrakt: „remote servers have no folders yet”): UI chowa foldery, zamiast wywoływać błąd.
- **Wynik zmiany od razu aktualizuje drzewo** (każda metoda zwraca nowy układ), a zdarzenie `sidebar-layout-changed` synchronizuje pozostałe okna. Zdarzenie, które przyszło w trakcie `getLayout()`, wygrywa z jego odpowiedzią.
- **Zwinięcie folderu jest zapisywane w bazie** (`collapsed`), więc przeżywa restart.
- Przypięta Decyzja nie jest już „ostatnią kartą z zdarzenia”, tylko najstarszą otwartą kartą agenta. Zmiana zachowania względem B4, wymagana przez kontrakt.

### Uwaga dla Backendu

`listPendingRequests`, `listActivity` (w `OpenBotDesktopApi.agent`) i `sidebar` (na `OpenBotDesktopApi`) są w kontrakcie **opcjonalne** (`?`), a UI woła je przez `?.` lub sprawdza obecność. Mock je implementuje, a testy sprawdzają zarówno wariant z API, jak i bez. **Backend może zrobić je wymaganymi**, jeśli preload zawsze je podaje. Po zmianie w `App.tsx` można usunąć ścieżki „brak API” (`if (!list) return`, `if (!sidebar …)`, `requireSidebar`) oraz test „works without the optional API”.

Jedna rzecz do rozważenia po stronie Backendu: karty typu `browser-takeover` i inne z `listPendingRequests` UI na razie pomija (pokazuje tylko `prompt` i `approval`). Wiersz dla przejęcia przeglądarki dojdzie razem z jego kartą W1.

## Pliki

Nowe: `pending-cards.ts`, `row-activity.ts`, `sidebar-tree.ts`, `components/SidebarFolders.tsx`, `stories/mock-sidebar.ts`, `stories/W1Ui2.stories.tsx`; testy `pending-cards`, `row-activity`, `sidebar-tree`, `mock-sidebar`, `App.attention`, `App.activity`, `App.folders`, `Sidebar.activity`, `Sidebar.folders`.  
Zmienione: `App.tsx`, `Sidebar.tsx`, `needs-you.ts` (+ test), `styles/cosgral.css`, `stories/mock-openbot.ts`, `COSGRAL-CHANGES.md`.

## Dowód

| Polecenie | Wynik |
|---|---|
| `bun run test` (pełny) | **82 plików, 625 testów, 0 błędów** (≈ 1040 s na tej maszynie; ten sam zestaw bez prac UI2 ma 536 testów) |
| `bun run typecheck:renderer` | OK |
| `bun run typecheck:storybook` | OK |
| `bun run build` | OK |
| `bun run build-storybook` | OK |

Nowe testy (89): `pending-cards` 12, `needs-you` +2, `row-activity` 14, `sidebar-tree` 13, `mock-sidebar` 7, `App.attention` 9, `App.activity` 4, `App.folders` 6, `Sidebar.activity` 4, `Sidebar.folders` 18. Pokrywają m.in.: karty po „przeładowaniu” (drugie okno na tym samym mocku), `*-resolved` czyści kartę i przypina następną, wiele kart na agenta, etykiety stanów (Needs you, Thinking, Limit · resumes, Error), godzina lokalna limitu, znikanie znaczka po `idle`, drzewo (foldery przed agentami, zwijanie, wyszukiwanie, 5 poziomów, cele „Move to…”), reguły mocka (limit głębokości, duplikat bez agentów, usunięcie przenosi dzieci), menu folderu i agenta, błąd zapisu, kolejność po zdarzeniu `sidebar-layout-changed`, zwinięcie przeżywa przeładowanie okna.

Uwaga o stabilności: limit czasu testu avatar w `App.test.tsx` jest nadal 15 s i w tym przebiegu nie migał.

## Stories

`bun run storybook` → port 6006, grupa **COSGRAL / W1 UI2** (każda scena w ciemnym i jasnym motywie, `theme-frame`):

- `Agent row states · dark` / `· light`: Needs you, Thinking, Limit · resumes (za 2 godziny), Error. Play test sprawdza etykiety wierszy.
- `Folders tree · dark` / `· light`: drzewo Work > Clients, zwinięte Archive; działające menu (mock z regułami backendu). Play test sprawdza `aria-expanded`.
- `Durable Needs you after reload · dark` / `· light`: cała aplikacja na mocku z otwartymi kartami (pytanie Research i dwa zatwierdzenia Chief); play test sprawdza listę Needs you i przypiętą Decyzję („bun run build”).

## Nie sprawdzone

- Stories nie były uruchomione w przeglądarce: w tym środowisku nie ma Chromium dla Playwright (`test:storybook` nie startuje). Przechodzą `typecheck:storybook` i `build-storybook` (build OK), a te same ścieżki pokrywają testy jsdom.
- Brak zrzutów ekranu Electron: wygląd folderów i znaczków (CSS) nie był oceniony wizualnie, tylko przez budowę i testy struktury.
- Brak przeciągania (patrz wyżej).
- Zachowanie z prawdziwym backendem (IPC) nie było sprawdzane; UI opiera się na kontrakcie i mocku, który odtwarza reguły backendu.
- `bun run lint` na całym repo nie był uruchamiany; nowe i zmienione pliki są sprawdzone Biome (jedno wcześniejsze ostrzeżenie `noDescendingSpecificity` w `cosgral.css` nie pochodzi z tej pracy).
