# KK W12 (1): logowanie OAuth do serwerów MCP

Data: 17.11.2026. Gałąź `team/kk/w12-oauth` (od integracji `51f626f5c`). Testy tylko na atrapie serwera OAuth + MCP na `127.0.0.1` (losowy port) i atrapie „przeglądarki”; **żadnego prawdziwego konta, usługi ani sieci**. `agent-service.ts` nietknięty.

## Wynik w jednej linii

**Gotowe: kontrakt + atrapa (osobny commit `eb120a9f7`), silnik na SDK MCP (odkrywanie, rejestracja klienta, PKCE, wymiana kodu, odnawianie), powrót na loopback, tokeny zaszyfrowane, IPC lokalne. To zamyka największą lukę z raportu Marketplace: wtyczka `link` instaluje się, a potem można się do niej zalogować w programie.**

## 1. Jak to działa (po ludzku)

1. Wtyczka `link` ma status `needs-sign-in`. UI woła `window.openbot.mcpOAuth.signIn({serverId})`.
2. Program otwiera jednorazowy adres na tym komputerze (`127.0.0.1`, losowy port, tylko `/mcp-oauth/callback`), znajduje ustawienia logowania serwera, rejestruje się jako klient (jeśli serwer pozwala), otwiera **przeglądarkę systemową** na stronie usługi (tylko `https`, albo `http` na tym komputerze).
3. Status od razu: `waiting-browser`; koniec przychodzi zdarzeniem `mcp-oauth-changed`.
4. Przeglądarka wraca na adres lokalny z kodem. Program sprawdza `state`, wymienia kod na tokeny (PKCE), zapisuje je **zaszyfrowane** (tabela `projection_mcp_oauth`, to samo pudełko co Vault), zamyka adres i **łączy serwer od nowa**: `needs-login` → `available`.
5. Odnawianie: zwykłe połączenie dostaje dostawcę z zapisanymi tokenami (`McpManager` → `authProvider`); gdy token wygaśnie, SDK odnawia go sam. Gdy odnowienie się nie uda, serwer wraca do `needs-login`, a **program nigdy sam nie otwiera przeglądarki**.
6. Wylogowanie: kasuje tokeny i rejestrację, łączy serwer od nowa. Nie odwołuje tokenów w usłudze (to osoba robi u usługi).

## 2. Zasady i limity

| Co | Zasada |
|---|---|
| Adres powrotu | tylko `127.0.0.1:<port>` z nagłówkiem `Host` jak trzeba i ścieżką `/mcp-oauth/callback`; pierwszy wynik wygrywa, potem 404; zamyka się po wyniku albo po 5 min |
| Strona po powrocie | stały tekst; nic z adresu (kod, stan, błąd) nie jest do niej wpisywane |
| `state` | losowy na próbę; zły = próba kończy się `state-mismatch`, kod jest ignorowany |
| Nowa próba | zastępuje starą (jej adres się zamyka), rejestracja klienta od nowa (adres powrotu zmienia się co próbę) |
| Błędy | `not-http`, `no-sign-in`, `registration-failed`, `denied`, `timeout`, `state-mismatch`, `exchange-failed`, `unknown`; każdy ma stałe zdanie; **nigdy tekst serwera, token, kod** |
| Serwery stdio | `not-http` |
| Usunięty serwer MCP | jego zapisane tokeny są kasowane przy następnym odczycie listy |

## 3. Pliki

- Kontrakt: `packages/contracts/src/ipc-mcp-oauth.ts`; kanały `mcp-oauth:{list,status,sign-in,cancel,sign-out}`, zdarzenie `mcp-oauth-changed`, okno `window.openbot.mcpOAuth?` (wspólne pliki po 1–3 linie).
- Atrapa: `src/renderer/stories/mock-mcp-oauth.ts` (+ test, 4), `simulate.approved/denied/wrongState/timedOut/tokensRevoked`; `mock-openbot.ts` (3 linie).
- Silnik: `src/backend/mcp-oauth/{oauth-store,oauth-provider,loopback-callback,mcp-oauth-service}.ts` (+ `mcp-oauth.test.ts`, 11).
- `src/backend/mcp-manager.ts`: opcja `authProvider` (kilka linii, bez zmiany reszty; testy MCP 7/7 nadal przechodzą).
- IPC: `src/main/mcp-oauth-ipc.ts`; `src/main/index.ts` (~20 linii); `local-only-ipc.test.ts` (kanały policzone, odmowy, parser).

## 4. Co sprawdzają testy (fałszywa usługa: metadane, rejestracja, autoryzacja, token z PKCE, MCP z 401)

pełny przepływ do `signed-in` i ponowne połączenie; tokeny i rejestracja zaszyfrowane w bazie, nigdzie w zdarzeniach i statusach; zwykłe połączenie nie otwiera przeglądarki; odmowa, fałszywy `state`, czas, brak rejestracji; anulowanie zwalnia adres; nowa próba zastępuje starą; wylogowanie; **odnowienie wygasłego tokenu przez SDK z użyciem refresh tokenu**; sprzątanie po usuniętym serwerze; serwer przez stdio.

## 5. Szwy

- **Backend / `agent-service.ts`:** nic nie trzeba zmieniać do samego logowania. Narzędzia agenta czytają serwery przez `McpManager`, który już łączy się z tokenami.
- **UI:** przycisk „Zaloguj” przy wtyczce ze statusem `needs-sign-in` i przy serwerze MCP ze statusem `needs-login`: `mcpOAuth.signIn`, potem czekać na `mcp-oauth-changed`; „Wyloguj” → `signOut`. Karta Aplikacje nie musi nic wiedzieć o OAuth poza tym wywołaniem.
- `McpManager.reconnect` jest wołany po zalogowaniu; tekst błędu `needs-login` w MCP wciąż mówi „Add or fix the login secret”: UI powinien dla serwera z `mcpOAuth` pokazać „Zaloguj”.

## 6. Czego NIE sprawdzono (uczciwie)

1. **Prawdziwej usługi MCP z OAuth** (np. Notion, Linear, GitHub): wszystko na atrapie. Różnice usług (rejestracja bez DCR z wpisanym `client_id`, `resource` inne niż adres serwera, inne metody uwierzytelnienia klienta) mogą dać `no-sign-in` albo `registration-failed`; wtedy potrzebny wpis klienta ręcznie (nie zrobiłem: usługi bez dynamicznej rejestracji).
2. **Otwarcia przeglądarki systemowej i zapory Windows** w uruchomionym programie (Electron czeka na GO).
3. Zachowania, gdy dwie usługi czekają naraz (kod to obsługuje osobno na serwer; test tylko jeden serwer naraz).
4. Odwołania tokenów u usługi przy wylogowaniu (celowo nie).
