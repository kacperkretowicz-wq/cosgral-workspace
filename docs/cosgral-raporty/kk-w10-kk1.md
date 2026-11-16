# KK Fullstack W10-KK1: łączenie kont aplikacji (OAuth) jako serwery MCP

Data: 16.11.2026. Gałąź `team/kk/w10-kk1` (od integracji `64027856a`). Spec: `spec-w10.md` §1A, W10-01…06, §7 Q1, Q3, Q4, Q6. Tylko testy jednostkowe na atrapie usługi OAuth na tym komputerze; **żadnego prawdziwego konta i żadnego wywołania na zewnątrz**. `agent-service.ts` nietknięty.

## Wynik w jednej linii

**Cztery usługi (GitHub, Google Workspace, Notion, Meta), każda jako osobny wpis MCP, z jednym sposobem „Connect account”: logowanie w przeglądarce systemowej, powrót na adres pętli zwrotnej komputera, PKCE, tokeny zaszyfrowane w sejfie programu, po połączeniu powstaje wpis MCP, po rozłączeniu znika razem z tokenami. Kontrakt i mock w osobnym pierwszym commicie `fc619f0d6`. Czego nie widziałem: żadnej prawdziwej usługi (patrz §5): adresy logowania i MCP pochodzą z publicznej dokumentacji usług, a rejestracja aplikacji u każdej z nich to praca właściciela.**

## 1. Jak działa logowanie (`oauth-pkce.ts`, bez Electrona)

1. Program tworzy **weryfikator** (32 losowe bajty) i jego odcisk **S256**, oraz losowy `state` (24 bajty).
2. Uruchamia mały serwer na `127.0.0.1` (stały port, gdy usługa wymaga dokładnego adresu, inaczej dowolny wolny).
3. Adres logowania otwiera **przeglądarka systemowa** (`shell.openExternal`, tylko `https`, albo `http` na `127.0.0.1` dla laboratorium).
4. Usługa odsyła przeglądarkę na `http://127.0.0.1:<port>/callback?code=…&state=…`. Serwer przyjmuje **jedno** poprawne wywołanie, sprawdza `state` (stały czas), zamyka się i oddaje stronę „możesz zamknąć okno”.
5. Kod jest wymieniany na tokeny razem z weryfikatorem. Ukradziony po drodze kod jest bezwartościowy: tylko program, który zrobił weryfikator, kończy logowanie.

Odrzucane **bez przerywania logowania** (404): zły `state`, zła ścieżka, inna metoda, zły nagłówek `Host` (strona przez przeprojektowaną nazwę próbująca trafić w serwer pętli zwrotnej). Nigdy nie wypisuje kodu, tokenu ani treści odpowiedzi usługi: każdy błąd to stałe zdanie („The access was not allowed on the sign-in page”, „The service does not accept this app's client id or secret…”, „Port N is already in use…”, „The sign-in was not finished in time”, „The sign-in was cancelled”). Strona w przeglądarce nie powtarza adresu, z którym przyszła, ma `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, CSP `default-src 'none'`. Limit czasu 300 s. Gdy przeglądarka się nie otworzy, próba **czeka dalej** z adresem w statusie (osoba otwiera go ręcznie).

## 2. Co robi menedżer (`integration-manager.ts`)

| Element | Zasada |
|---|---|
| Magazyn | tabela `projection_integrations` w bazie **bieżącej przestrzeni** (W8-KK1): konta klienta A nie istnieją u klienta B. Identyfikator klienta jawny; **sekret klienta i tokeny zaszyfrowane** tym samym sejfem co Vault i sekrety MCP (`SecretBox`, safeStorage/DPAPI w programie) |
| Wpis MCP (Q4) | po połączeniu: serwer `github` / `google` / `notion` / `meta`, transport `http`, adres MCP usługi, nagłówek `Authorization: Bearer …` trzymany szyfrowany przez magazyn MCP. Agent włącza go jak każdy serwer MCP |
| Rozłączenie | usuwa wpis MCP i tokeny **zawsze** (żadnych sierot); „zapomnij klienta” usuwa też identyfikator i sekret |
| Odświeżanie | co minutę (`refreshDue`): token kończący się za mniej niż 2 minuty jest odnawiany tokenem odświeżającym, nagłówek MCP aktualizowany. Odmowa (token odwołany/wygasły) = `needs-login`, martwe tokeny są kasowane, bez pętli prób; chwilowa awaria usługi = ponowienie za minutę |
| Start programu | `reconcile`: wpis MCP usunięty ręcznie zabiera tokeny (spec: brak osieroconych tokenów) |
| `needs-login` | pokazywany także wtedy, gdy sam serwer MCP zgłosi 401 (status z menedżera MCP), z powodem bez sekretu |
| Allowlista narzędzi (W8 Q10) | `toolAllowlist` per usługa w bazie przestrzeni; **szew w `McpManager`** (`toolFilter`, +10 linii): niedozwolone narzędzie nie jest pokazywane agentowi i jest odmawiane z powodem |
| Zasady | zmiana identyfikatora klienta pod zapisanym logowaniem jest odmawiana (trzeba rozłączyć); `connect` odmawia, gdy brakuje identyfikatora, wymaganego sekretu, adresu MCP lub gdy nazwa serwera jest zajęta przez inny wpis; błąd tworzenia wpisu MCP nie zostawia nic (tokeny nie są zapisywane) |

IPC `integrations:*` (7 kanałów) tylko dla tego komputera, parser kontraktu przed czymkolwiek. `main/index.ts`: menedżer powstaje razem z menedżerem MCP, `openBrowser` przepuszcza tylko bezpieczny adres, odświeżanie co minutę (timer zatrzymywany przy zamknięciu).

## 3. Usługi (z dokumentacji, niezweryfikowane w tej sesji)

| Usługa | Logowanie / token | Klient | Adres MCP |
|---|---|---|---|
| GitHub | `github.com/login/oauth/authorize` / `…/access_token`; **GitHub App** (Q6), uprawnienia ustawia aplikacja, domyślnie bez zakresów | publiczny (sekret opcjonalny) | `https://api.githubcopilot.com/mcp/` |
| Google Workspace | `accounts.google.com/o/oauth2/v2/auth` (offline, zgoda) / `oauth2.googleapis.com/token`; zakresy domyślnie tylko `openid email`, podnosi osoba | klient typu Desktop + sekret | **brak założonego**: właściciel podaje |
| Notion | `api.notion.com/v1/oauth/authorize` / `…/token`, klient w nagłówku Basic | id + sekret, **stały port** | `https://mcp.notion.com/mcp` |
| Meta | `facebook.com/v21.0/dialog/oauth` / `graph.facebook.com/v21.0/oauth/access_token`; zakres domyślnie `public_profile` | id + sekret, stały port | **brak założonego**: właściciel podaje |

Domyślne zakresy są tylko do odczytu; każde podniesienie to świadoma zmiana osoby w ustawieniach.

## 4. Testy

| Plik | Co | Wynik |
|---|---|---|
| `ipc-integrations.test.ts` (kontrakt) | usługi i etykiety, adresy MCP (https lub lokalnie), strażnik statusu (faza zgodna z polami), lista, opis (PKCE, adres pętli, szyfrowanie), parsery, błędy nie powtarzają sekretu | 8/8 |
| `mock-integrations.test.ts` | te same reguły w mocku | 7/7 |
| `oauth-pkce.test.ts` | **atrapa usługi na pętli zwrotnej sprawdzająca PKCE**: weryfikator, wymiana kodu, serwer zamknięty po logowaniu, zły state/ścieżka/metoda/Host ignorowane, strona bez echa i z nagłówkami, odmowa i nieznany błąd (bez echa), limit czasu i anulowanie, stały port i zajęty port, przeglądarka się nie otwiera, każdy błąd kroku tokenu bez treści odpowiedzi, niedostępny serwer tokenów, odpowiedź formularzem, klient Basic, klient bez sekretu, odświeżenie (stary token zostaje, odmowa = `needsLogin`, awaria = nie) | 17/17 |
| `integration-manager.test.ts` | prawdziwa baza + atrapa usługi + atrapa MCP: gotowość, odmowy z powodem, pełne połączenie z wpisem MCP i nagłówkiem, **tokeny i sekret zaszyfrowane w bazie, żaden w zdarzeniach ani statusach**, restart, wpis usunięty ręcznie, `needs-login`, odnawianie i jego odmowa, anulowanie i drugie `connect`, błąd i ponowienie, nieudany wpis MCP nic nie zostawia, rozłączenie, allowlista, zakresy i port, dwie przestrzenie nie mieszają się | 17/17 |
| `mcp-tool-filter.test.ts` | prawdziwy serwer MCP (stdio): bez filtra jak dotąd, narzędzie niedozwolone niewidoczne i odmówione, brak dozwolonych = brak narzędzi (+ istniejące `mcp-manager` bez zmian) | 3/3 + 7/7 |
| `integrations-ipc.test.ts` | prawdziwy menedżer z zaufaniem okna: pełny przebieg, brak sekretu w żadnej odpowiedzi, odmowy (parser, inny serwer, niezaufana strona) | 3/3 |
| `local-only-ipc.test.ts` | 7 kanałów `integrations:*` odmawia obcym serwerom i telefonowi | 6/6 |
| `src/main`, MCP, kontrakt, `stories` razem | | 68 plików, 371/371 |
| `bun run lint` (978 plików), `typecheck:node`, `typecheck:renderer` | moje pliki czyste; jedna uwaga stylu w cudzym `ipc-access.test.ts` (Backend) | zielone |

## 5. Czego nie sprawdziłem i granice

1. **Żadnej prawdziwej usługi.** Adresy logowania, tokenów i MCP są z publicznej dokumentacji (z pamięci, bez pobrania stron w tej sesji): trzeba je potwierdzić. Nie wiem, czy: GitHub przyjmuje PKCE dla GitHub App w tym przepływie; Notion i Meta w ogóle respektują PKCE (program wysyła `code_challenge` do wszystkich, a usługa, która go nie zna, powinna go zignorować, ale tego nie sprawdzałem); hostowane serwery MCP GitHuba i Notiona przyjmują token takiej aplikacji (mogą wymagać własnego rejestru lub innego przepływu); Meta nie zwraca tokenu odświeżającego (długożyjący token wymaga osobnej wymiany, której nie zrobiłem: po wygaśnięciu będzie `needs-login`).
2. **Rejestracja aplikacji i konta testowe (W10-25/26) to praca właściciela**: GitHub App, klient Google typu Desktop, integracja Notion, aplikacja Meta (większość uprawnień Meta wymaga weryfikacji aplikacji). Adres zwrotny do wpisania pokazuje „describe”: `http://127.0.0.1:<port>/callback`; Notion i Meta wymagają stałego portu (ustawienie `redirectPort`).
3. **Nie widziałem prawdziwego Electrona:** `shell.openExternal`, szyfrowania `safeStorage`, timera odświeżania i wpięcia w `main`. Szyfrowanie sprawdzone na atrapie sejfu.
4. **Czy agent faktycznie czyta dane przez narzędzia po zalogowaniu (W10-03)** tylko właściciel, na prawdziwym koncie.
5. Zrobione tylko dla czterech usług z Q4; katalog 200+ i komunikator (K2) czekają na decyzję właściciela (wiersz 8), nie ruszałem.
6. Wpis MCP jest tworzony z jednym nagłówkiem `Authorization`; usługi wymagające innych nagłówków (np. wersji API) nie są obsłużone.
7. Nowe pola przestrzeni: tokeny każdej przestrzeni są osobne, więc ta sama usługa w dwóch przestrzeniach wymaga dwóch logowań (celowo, W8).
8. **Dla UI:** ekran „Connected accounts” z czterema usługami: stan i powód (zdanie z kontraktu, bez procentów), pola client id / secret (sekret tylko do zapisu), „Connect” (otwiera przeglądarkę; gdy się nie otworzy, pokazać `signInUrl` jako link do skopiowania), „Cancel”, „Disconnect” z pytaniem „forget app credentials too?”, lista kroków dla właściciela (`ownerSteps`) i adres zwrotny (`callbackExample`).
9. Konflikty przy scalaniu: `ipc-channels.ts`, `ipc-conversation.ts`, `ipc-desktop-apis.ts`, `ipc.ts`, `preload/index.ts`, `mock-openbot.ts`, `main/index.ts`, `local-only-ipc.test.ts`: zostawić obie strony. `mcp-manager.ts`: +10 linii (`toolFilter`).
