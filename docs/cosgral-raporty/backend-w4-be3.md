# Backend W4-BE3: bez fałszywego „Sign in required” przy wolnym Claude CLI

Gałąź `team/backend/w4-be3` od `codex/cosgral-desktop` @ `1c48c9dc7`, bez push. Uwagę zgłosił KK w odbiorze W4 (`kk-w4-verify.md`).

## Wynik

| Sprawdzenie | Wynik |
|---|---|
| Nowy test `claude-auth-status.test.ts` | 3/3 |
| Istniejące `claude-client`, `cli`, `cli-timeout` | 8/8, 10/10, 3/3 |
| `typecheck:node`, `typecheck:renderer` | kod 0 |
| `biome` na zmienionych plikach | 0 błędów |
| `bun run build` | kod 0 |
| `sandbox:e2e` | **23/23**, 0 wpisów w konsoli |

## Co było źle

`claude-client.ts` sprawdzał logowanie poleceniem `claude auth status --json` z limitem 5 s. Każdy błąd (przekroczony czas, awaria, nieczytelna odpowiedź) kończył się wynikiem „niezalogowany”. Silnik pokazywał wtedy „Sign in required” i radził `claude auth login`, choć konto było zalogowane, a CLI tylko wolno wstawało.

## Naprawa

- `cli.ts`: wspólne `runCliWithRetry` (20 s, jedno ponowienie po przekroczeniu czasu, drugi raz `CliTimeoutError`). `codex --version` używa go jak dotąd, bez zmiany zachowania.
- `claude-client.ts`: nowa funkcja `readClaudeAuthStatus` na tym samym mechanizmie.
  - „Niezalogowany” tylko wtedy, gdy CLI samo odpowie `loggedIn: false`. Jego JSON jest czytany także przy niezerowym kodzie wyjścia.
  - Dwa razy brak odpowiedzi daje `CodexCliError`: „Claude CLI did not answer "claude auth status" within 20 s (twice). The computer may be busy; choose Try again.”. Dostawca ma wtedy stan „Unavailable” z tym powodem i przyciskiem Try again z W4-BE2, nigdy prośbę o zalogowanie.
- Test logiki (prawdziwe procesy fałszywego CLI):
  1. Zalogowany: odczyt konta.
  2. `loggedIn: false` z kodem 1: „niezalogowany”.
  3. CLI, które nie odpowiada (limit 0,3 s w teście): błąd „did not answer”, bez słów „login” ani „sign in”.

## Inne sprawdzenia z krótkim limitem (tylko spis, bez zmian)

| Gdzie | Co | Limit | Skutek przy wolnym komputerze | Ocena |
|---|---|---|---|---|
| `src/backend/cli.ts` (`collectCandidates`, Windows) | `where.exe codex/claude` | 5 s | Kandydaci z `PATH` przepadają, zostają znane miejsca instalacji. CLI zainstalowane tylko w `PATH` może dostać fałszywe „Not installed”. | **Ryzyko podobne.** Do poprawy osobno (np. 20 s albo ponowienie) |
| `src/backend/cli.ts` (`collectCandidates`, macOS) | `zsh -lic "command -v …"` | 5 s | Jak wyżej, na macOS | Poza zakresem Windows |
| `src/backend/agent-service.ts` (`#refreshModelCatalog`) | `model/list` u działającego klienta | 5 s | Lista modeli spada do domyślnej. Logowanie bez zmian. | Małe ryzyko, bez fałszywego alarmu logowania |
| `src/main/host-service.ts` | zapytanie sieciowe do hosta | ≤ 5 s | Dotyczy serwera zdalnego, nie CLI | Bez związku |
| `src/main/team-api-server.ts` | wskaźnik „pisze…” | 5 s | Wygasanie wskaźnika, nie sprawdzenie | Bez związku |
| `src/main/maintenance-service.ts` | PowerShell przy eksporcie danych | bez limitu | — | Bez związku |

W `src/main` nie ma innych sprawdzeń CLI. Wszystkie wywołania zewnętrznych CLI do wykrywania dostawców są w `src/backend/cli.ts` i `claude-client.ts`.

## Czego nie sprawdziłem

- **Prawdziwego obciążonego komputera:** ścieżkę „nie odpowiada” sprawdziłem testem z fałszywym CLI i krótkim limitem, nie przy prawdziwym Claude.
- **Prawdziwego Claude po tej zmianie:** KK przeszedł 4/4 tur na wersji sprzed zmiany. Odczyt konta działa tak samo, gdy CLI odpowiada, ale osobnego przebiegu `sandbox:real-claude` nie robiłem.
- **Kroku w `sandbox:e2e` dla wolnego Claude:** atrapa nie ma Claude CLI. Zostałem przy teście logiki, jak dopuszczało zadanie.
- **`where.exe` z limitem 5 s:** wypisane powyżej, nie zmienione.
- **Pełnych `bun run test` i `bun run check`.**
