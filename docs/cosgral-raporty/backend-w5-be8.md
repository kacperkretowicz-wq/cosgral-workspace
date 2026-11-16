# W5-BE8: trzy braki z odbioru KK (F03, P10, F02)

**Następny krok dla lidera:** scalić `team/backend/w5-be8`. UI Designer (W5-UI7) dodaje przełącznik i kartę z sekcji „Dla UI”.

**Stan:** zrobione, tylko testy jednostkowe, bez Electrona.

| Brak | Stan przed | Stan po |
|---|---|---|
| F03: ustawienie powrotu po resecie | powrót działał zawsze, ustawienia nie było | `PoolSettings.returnAfterReset` (domyślnie `true`), zapis, silnik, mock |
| P10: bezczynny proces CLI konta po 5 min | **silnik już to robił**, brak dowodu | bez zmiany kodu, 3 nowe testy |
| F02: błąd sieci a limit konta | konto nie było znakowane jako wyczerpane, ale nikt nie mówił dlaczego | nowe zdarzenie `account-error` z powodem „network error” |

## 1. F03: `returnAfterReset`

- **Kontrakt** (`ipc-subscriptions.ts`):
  - `PoolSettings.returnAfterReset?: boolean`. Brak pola znaczy `true`; program zawsze je wysyła.
  - `PoolSettingsInput.returnAfterReset?: boolean`. Brak pola w wywołaniu znaczy „bez zmiany”.
  - Stała `DEFAULT_POOL_SETTINGS` (`maxAccountsPerProvider` 3, `switchBeforeFirstAction` true, `returnAfterReset` true).
  - Pole jest opcjonalne celowo: obowiązkowe psuło fixtury testowe w plikach innych osób i starsze zapisy.
- **Kanały IPC bez zmian:** `getPoolSettings`, `setPoolSettings`, `listAccounts().pool` i zdarzenie `accounts-changed` niosą to pole. Parser odrzuca wartość, która nie jest `true` ani `false`.
- **Zapis:** `accounts.json`, razem z limitem puli. Plik sprzed zmiany czyta się jako `true`. `ProviderAccounts.setPoolSettings` przyjmuje liczbę (stare wywołania) albo `{ maxAccountsPerProvider, returnAfterReset? }`.
- **Silnik** (`account-router.ts`, `#stay`):
  - `true`: jak dotąd, każda tura zaczyna od pierwszego konta i agent wraca, gdy limit minął (zdarzenie `account-switched` z powodem `returned`).
  - `false`: agent zostaje na koncie, na którym była jego ostatnia tura, dopóki to konto może odpowiadać (włączone, zalogowane, bez limitu) i osoba nic nie zmieniła (to samo pierwsze konto). Zmiana przypisanego konta przez osobę, wyłączenie albo usunięcie konta i następny limit kończą „zostanie”. Po limicie wybór idzie jak zwykle, od pierwszego wolnego konta z kolejności puli.
  - Zdarzenia `returned` nie ma, bo agent nie wraca.
- **Mock:** `mock-accounts.ts` zna pole (test `mock-accounts.test.ts`).

## 2. P10: zatrzymanie bezczynnego procesu po 5 minutach

- **Silnik już to robi** (K1): `AccountRouter.sweepIdle()` zatrzymuje proces konta, który nie ma tury od `idleMs`, domyślnie `IDLE_CLIENT_MS` = 5 minut. Wywołuje go zegar co minutę (`setInterval`, `unref`), a `stopAll()` go czyści. Zegar `now` jest wstrzykiwany. Proces z działającą turą nigdy nie jest zatrzymywany. Nie zmieniałem kodu.
- **Luka w dowodzie:** istniejący test ustawiał `idleMs` sam, więc nie dowodził, że domyślne to 5 minut, ani że zegar w ogóle chodzi. Dopisałem 3 testy w `account-router.test.ts` (grupa „W5-BE8 P10”):
  1. bez podanego czasu: żyje po 5 min minus 1 ms, zatrzymany po 5 min plus 1 ms (fałszywy zegar);
  2. prawdziwy zegar programu na `vi.useFakeTimers`: po 4 min proces żyje, po 6 min jest zatrzymany samodzielnie, po `stopAll()` nie zostaje żaden zegar;
  3. proces z działającą turą żyje po 60 min.
- Dla KK (krok P10 w oknie): skrócenie czasu przez zmienną środowiskową nie istnieje. `idleMs` jest opcją konstruktora, a `main/index.ts` jej nie podaje. Jeśli KK potrzebuje krótszego czasu w piaskownicy, to osobna drobna zmiana (zmienna tylko w piaskownicy), której nie robiłem.

## 3. F02: błąd sieci to nie limit

- **Stan przed:** `#handleAccountLimit` wchodziło do routera tylko przy `usage-limit`, więc konto nie było znakowane i nie przełączało się. Nie było za to żadnej informacji dla osoby, dlaczego tura padła.
- **Teraz:**
  - `accountFailureKind(failure)` rozróżnia `usage-limit` | `network` | `other`. Limit zawsze wygrywa, także gdy tekst mówi też o sieci.
  - Za sieć uznaje: `kind: "unavailable"` (5xx, przeciążenie) oraz tekst o braku połączenia (m.in. `fetch failed`, `ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`, `error sending request`, `stream disconnected`, `socket hang up`, `offline`, `502`/`503`).
  - Reszta to zwykły błąd, bez żadnej karty konta.
  - `AccountRouter.noteNetworkError({ botId, provider, turnId })` wysyła zdarzenie `account-error`: powód `network-error`, tekst stały „Network error on <konto>. The account was not counted as at its limit; nothing was switched.” Surowy tekst błędu nigdy nie wychodzi w zdarzeniu. Nic nie jest znakowane, agent nie jest przenoszony, pula bez zmian.
  - Dla tury, której router nie zna (brak puli), zdarzenia nie ma.
  - `AgentService.#handleAccountLimit` woła to przed decyzją o limicie.
- **Co się dzieje z samą turą:** tak jak dotąd. Zwykły błąd sieci kończy turę błędem. Błąd klasyfikowany jako „unavailable” (np. 503) dalej może uruchomić model zapasowy, jeśli agent go ma (zasada W3). Konto się wtedy nie zmienia.
- **Kontrakt:** nowy typ `AccountError`, stała `ACCOUNT_ERROR_REASONS`, `isAccountError`, wariant `account-error` w `AgentEvent` i `isAgentEvent`.

## Dla UI (W5-UI7)

1. **Przełącznik „Return to the first account after the limit resets”** na stronie Dostawcy: czyta `snapshot.pool.returnAfterReset !== false`, zapisuje `subscriptions.setPoolSettings({ maxAccountsPerProvider: <obecny limit>, returnAfterReset })`. Wywołanie z samym limitem nie zmienia przełącznika. Limit przy zapisie trzeba podać zawsze (tak jak dziś).
2. **Karta błędu sieci:** nowe zdarzenie `account-error` ma `message` gotowy do pokazania, `accountLabel`, `botId`. Okno dziś je pomija (nieznany typ zdarzenia jest ignorowany, nic się nie psuje). Karta ma być spokojna, bez przycisków „Continue”, bez słowa „limit”. Można ją łączyć z kartami konta tak jak `account-limit-reached`.
3. Mock: `createMockAccounts(...)` ma pole i zapis. Mock nie wysyła `account-error`, więc UI musi dodać do historii własne zdarzenie.

## Testy i kontrole

| Co | Wynik |
|---|---|
| `ipc-subscriptions.test.ts` (kontrakt: pole, domyślna, parser, zdarzenie `account-error`) | 9/9 |
| `account-router.test.ts` (F03 5 testów, P10 3, F02 3; razem z dotychczasowymi) | 42/42 |
| `provider-accounts.test.ts` (zapis, restart, stary plik) | 19/19 |
| `agent-service-accounts.test.ts` (silnik K1: F03 2 testy, F02 3 przypadki) | 17/17 |
| `mock-accounts.test.ts` (nowy) | 1/1 |
| Regresja: powyższe + `agent-service-fallback-accounts`, `src/main` (subskrypcje), `ProviderAccounts`, `AgentAccountPicker`, `AccountLimitCards` | 9 plików, 115/115 |
| `lint`, `typecheck:node`, `typecheck:renderer` | zielone |

## Czego nie sprawdziłem

1. Electrona, `sandbox:e2e` i pełnego `bun run test`.
2. Prawdziwych komunikatów błędów sieci z Codex i Claude: wzorce tekstu biorę z typowych błędów Node i HTTP. Jeśli prawdziwy CLI użyje innych słów, błąd będzie traktowany jako „inny” (bez karty), a nie jako limit. Błędu w stronę „limit” być nie może.
3. Zachowania `returnAfterReset: false` w oknie (ekran i przełącznik nie istnieją jeszcze po stronie UI).
4. Karta `account-error` w oknie: nie ma jej jeszcze, okno zdarzenie ignoruje.
5. Zachowania `returnAfterReset: false` przy ponownym uruchomieniu programu: „na którym koncie była ostatnia tura” jest tylko w pamięci, więc po restarcie agent zaczyna od pierwszego konta.
