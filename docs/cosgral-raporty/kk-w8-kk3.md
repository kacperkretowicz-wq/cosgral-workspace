# KK Fullstack W8-KK3: profile przeglądarki agentów

Data: 16.11.2026. Gałąź `team/kk/w8-kk3` (od integracji `3589a40df`). Spec: `spec-w8.md` §1C, W8-15…19, §7; zasada najmniejszych uprawnień. Tylko testy jednostkowe, bez Electrona. `agent-service.ts` nietknięty.

## Wynik w jednej linii

**Każdy agent ma własny profil przeglądarki (osobna partycja sesji Electron: własne ciasteczka, storage, cache i historia), w folderze danych bieżącej przestrzeni; ma też własną listę domen (zablokowane, opcjonalnie tylko dozwolone) i można go wyczyścić po potwierdzeniu. Kontrakt i mock w osobnym pierwszym commicie `e1c9516b3`. Silnik w nowych plikach i jednym małym szwie w `browser-host.ts`. Czego nie widziałem: prawdziwej partycji Electron w działaniu (patrz §5).**

## 1. Stan przed zmianą (ważne)

Cała przeglądarka (`BrowserHost`) używała **jednej** partycji `persist:openbot-browser` dla wszystkich agentów i dla kart osoby: każdy agent widział te same logowania. Karta otwarta przez narzędzie agenta miała `ownerBotId = null` (zna tylko wątek CLI), więc nie było wiadomo, czyja jest.

## 2. Co zrobiłem

| Element | Zasada |
|---|---|
| Partycja | `persist:cosgral-<przestrzeń>-<skrót 24 hex z (przestrzeń, id agenta)>`. Skrót, nie id: zawsze bezpieczna nazwa folderu i nic nie zdradza. Trwała (`persist:`). Electron trzyma ją w `<userData>\Partitions`, a `userData` jest już folderem przestrzeni (W8-KK1), więc profile klienta A i B leżą w osobnych folderach, a id przestrzeni w nazwie to druga ściana |
| Kto jest właścicielem karty | `ownerBotId`, a gdy go brak (agent otwiera przez CLI), agent, do którego należy wątek CLI: szukam go w sesjach CLI wszystkich wątków agenta (`listAgentProviderSessions`). Przywrócone po restarcie karty agentów też trafiają do swoich profili |
| Karty osoby | bez agenta za nimi: dalej wspólny profil programu. **Profile agentów nie są z niego wypełniane**: agent startuje wylogowany, a logowanie, które osoba zrobi w karcie agenta (przejęcie), należy tylko do profilu tego agenta |
| Lista domen | `block`: odmowa dla każdego żądania (też obrazów, skryptów). `allow` (puste = wszystko): ogranicza tylko **strony** (nawigację główną), bo inaczej większość stron by się sypała (CDN, czcionki). Block wygrywa. Domena obejmuje subdomeny na granicy etykiety (`badexample.com` to nie `example.com`). Wpisy są porządkowane (adres, `*.`, port, wielkie litery, nazwy z polskimi znakami w formie punycode), zły wpis jest odrzucany z komunikatem |
| Odmowa | agent dostaje czytelny powód przy otwieraniu strony (`This browser profile blocks …` / `… only opens the sites on its allow list …`), a żądania spoza reguł są anulowane w sesji (także przekierowania) |
| Czyszczenie | po `confirm: true`: kasuje ciasteczka, storage, cache i dane uwierzytelnienia **tylko** partycji tego agenta; polityka domen zostaje; czas zapisany dopiero, gdy się udało (błąd wraca do okna) |
| Hasła | program nie ma menedżera haseł w profilu; profil trzyma sesje. Nie czytam żadnych plików logowania |
| IPC | 5 kanałów `browser-profiles:*`, tylko ten komputer, parser kontraktu przed czymkolwiek |

Kontrakt (`e1c9516b3`): `window.openbot.browserProfiles` (`list`, `create`, `setDomains`, `clear({botId, confirm})`, `describe`), zdarzenie `browser-profiles-changed`, `BrowserProfileDescription` (`isolated`: cookies/storage/cache/history, `sharedWithOthers: false`, `openTabs`). Mock `createMockBrowserProfiles` z `simulate.tabs`.

**Dla UI:** na stronie agenta „Browser profile”: stan (jest/nie ma), listy domen (dwie listy, wpisy jako tagi, błąd z komunikatu parsera), przycisk „Clear sign-ins” z potwierdzeniem (zdanie z kontraktu), napis „Separate from other agents”. Przy odmowie agenta komunikat jest po angielsku i gotowy.

## 3. Pliki

Nowe: `ipc-browser-profiles.ts`, `browser-profiles-api.ts`, `mock-browser-profiles.ts`, `src/backend/browser-profiles.ts` (magazyn `browser-profiles.json` w folderze przestrzeni, partycje, decyzje, port dla hosta), `src/main/browser-profiles-ipc.ts` (+ testy). Zmienione we wspólnych plikach tylko linie wpięcia (kanały, eksport, zdarzenie, preload, mock, `main/index.ts`, `local-only-ipc.test.ts`) oraz **`src/backend/browser-host.ts`** (+44/−14): 4. parametr konstruktora (port profili, `null` = stare zachowanie), `#ownerOf`, `#sessionFor` (sesja z partycji agenta, konfigurowana tak samo jak wspólna i z filtrem `onBeforeRequest`), sprawdzenie domen w `open()` przed utworzeniem karty, `#configureSession` przyjmuje sesję.

## 4. Testy

| Plik | Co | Wynik |
|---|---|---|
| `ipc-browser-profiles.test.ts` (kontrakt) | odczyt nazw stron (adres, `*.`, port, punycode, `localhost`), odrzucane wpisy (spacje, `@`, IPv6, zbyt długie etykiety), lista bez duplikatów i z limitem 100, granica etykiety, block wygrywa, allow tylko dla stron, adresy nie-http nieoceniane, strażniki, parsery z `confirm` | 9/9 |
| `mock-browser-profiles.test.ts` | te same reguły w mocku | 4/4 |
| `browser-profiles.test.ts` | partycje różne dla agentów i przestrzeni, bezpieczne i nic nie zdradzają, brak kolizji przy sklejaniu; magazyn: nic na dysku bez profilu, jeden profil na agenta, restart, listy domen per agent, czyszczenie zachowuje listy, uszkodzony plik odłożony obok, dwie przestrzenie w dwóch folderach; port: wskazanie agenta po wątku CLI, karta osoby bez partycji i bez oceny, odmowa poza listą dozwolonych, **na prawdziwej bazie** wskazanie agenta po sesjach CLI związanych z jego wątkami | 13/13 |
| `browser-profiles-ipc.test.ts` | prawdziwy magazyn z zaufaniem okna: tworzenie, listy, czyszczenie TYLKO jednej partycji po potwierdzeniu, błąd czyszczenia nie zapisuje „wyczyszczono”, odmowy (parser, inny serwer, niezaufana strona) | 4/4 |
| `local-only-ipc.test.ts` | 5 kanałów `browser-profiles:*` odmawia obcym serwerom i telefonowi | 6/6 |
| `src/main`, `browser-state`, `browser-shortcuts`, kontrakt, `stories` razem | | 63 pliki, 329/329 |
| `bun run lint`, `typecheck:node`, `typecheck:renderer` | moje pliki czyste; lint zgłasza jedną uwagę (styl, „FIXABLE”) w cudzym `packages/contracts/src/ipc-access.test.ts` (Backend, W8-BE1) | zielone poza tą uwagą |

## 5. Czego nie sprawdziłem i granice

1. **Prawdziwego działania w Electronie nie widziałem.** Jednostkowo sprawdzone są: wybór partycji, jej nazwa, magazyn, reguły domen, wybór agenta po wątku, IPC. **Nie** sprawdzone: że `session.fromPartition` rzeczywiście rozdziela ciasteczka dwóch kart (to zachowanie Electrona, nie moje), że `onBeforeRequest` anuluje żądania i przekierowania, że `clearStorageData` czyści właściwą partycję, że nowa sesja dostaje poprawny `User-Agent` i nagłówki jak wspólna. To pierwszy krok odbioru po `GO-W6.txt`: dwa agenty, dwa logowania do tej samej strony, wyczyszczenie jednego.
2. **Wątki kanałów i agenci spoza sesji CLI agenta**: wątek, którego nie ma wśród sesji CLI żadnego agenta (np. uruchomienie z kanału), nie ma właściciela, więc jego karta trafia do **wspólnego** profilu (jak dotąd). To dziura wobec „najmniejszych uprawnień”. Zamknąć ją może Backend jednym polem: przekazać `botId` w `handleDynamicTool` (`#browser.handleDynamicTool({ ...params, botId })`) i używać go w `open()` zamiast szukania po wątku. Nie ruszałem `agent-service.ts`.
3. **Istniejące logowania we wspólnym profilu** zostają tam; agenci nie dostają ich (zmiana zachowania: agent, który dziś jest „zalogowany”, po tej zmianie zaczyna wylogowany i osoba loguje go przez przejęcie).
4. **Proxy per profil (W8-16)** nie jest zrobione (nie było w zleceniu). Nowe akcje przeglądarki (W8-17, upload/wybór/czekanie/dialogi) i W8-18/19 (przejęcie, dwa konta Meta Ads, właściciel) też nie.
5. Lista `allow` ogranicza strony, nie podzasoby (decyzja z §2): strona dozwolona może ładować zasoby z innych hostów, o ile nie są na `block`.
6. Czyszczenie nie zamyka otwartych kart agenta: strona zostaje w pamięci do przeładowania, ale bez zapisanych sesji.
7. Do potwierdzenia: karta osoby zostaje we wspólnym profilu; agent startuje wylogowany; `allow` tylko dla stron.
8. Konflikty przy scalaniu: `ipc-channels.ts`, `ipc-conversation.ts`, `ipc-desktop-apis.ts`, `ipc.ts`, `preload/index.ts`, `mock-openbot.ts`, `main/index.ts`, `local-only-ipc.test.ts`: zostawić obie strony.
