# W5-BE2: konta dostawców, logowanie i wylogowanie, pula

Gałąź `team/backend/w5-be2`, bez push. Zachowanie wg `luki-070.txt` (W5/Subskrypcje); bez kodu OpenBota nowszego niż 0.1.11. Wszystko w piaskownicy, na fałszywym CLI, bez prawdziwych kont.

## Co działa

- **Kontrakt** (`packages/contracts/src/ipc-subscriptions.ts`, commit `e1f60cd87`): `ProviderAccount` (`id`, `provider`, `label`, `stateDir` jako sama nazwa, `system`, `loggedIn`, `account` zawsze zamaskowane, `plan`, `isDefault`, `inPool`, `poolOrder`, `enabled`, `limitedUntil`, `login {phase, message, url, userCode}`), `PoolSettings {maxAccountsPerProvider (domyślnie 3, 1–10), switchBeforeFirstAction: true}`, `AccountsSnapshot`, kanały `subscriptions:*` dla kont i puli, zdarzenie `accounts-changed`, `ACCOUNT_POOL_WARNING` (R1), atrapa `src/renderer/stories/mock-accounts.ts`.
- **Silnik** (`src/backend/provider-accounts.ts`, `src/main/subscriptions-ipc.ts`):
  - każde konto ma folder `<dane programu>/accounts/<id>`; CLI dostaje go tylko jako `CODEX_HOME` / `CLAUDE_CONFIG_DIR` w środowisku swojego procesu. Program nie otwiera, nie kopiuje i nie wypisuje plików w środku;
  - **logowanie** = oficjalne polecenie CLI (`codex login`, `claude auth login`) jako proces potomny; CLI otwiera przeglądarkę, a program czyta z jego wyjścia link, kod urządzenia albo prośbę o wklejenie kodu i oddaje je w `login` (fazy `idle`, `waiting-for-browser`, `code-required`, `success`, `error`). Limit czasu 10 min, `cancelLogin` zatrzymuje tylko ten proces;
  - **wylogowanie** = `codex logout` / `claude auth logout`;
  - **stan** tylko z `codex login status` i `claude auth status --json` (`loggedIn`, zamaskowany identyfikator, plan), bez sekretów;
  - **konto systemowe** (dotychczasowe logowanie właściciela) jest domyślne i nietykalne: bez logowania, wylogowania i usunięcia, jego plików nic nie zmienia;
  - **pula**: limit kont na dostawcę (domyślnie 3) pilnowany przy dodawaniu, kolejność (`poolOrder`), włączanie, konto domyślne, przypisanie konta do agenta (silnik tylko zapisuje; użycie i przejście przy limicie to W5-K1);
  - **R2**: `openLoginTerminal` otwiera terminal z oficjalnym poleceniem tylko po karcie zgody, nigdy po cichu;
  - usunięcie konta kasuje tylko jego folder (dowiązanie jest odpinane, nie śledzone).
- **Oficjalny sposób bez terminala**: istnieje dla obu CLI w tej samej formie: CLI sam otwiera przeglądarkę systemową i wypisuje link (Codex) albo prosi o wklejenie kodu (Claude). Jeśli to nie zadziała, jest obejście z terminalem. Sprawdzone tylko na atrapach, nie na prawdziwych CLI (patrz niżej).

## Przyczyna usterki z e2e i naprawa

Logowanie atrapy Codex w prawdziwym Electronie nie kończyło się: faza zostawała „waiting-for-browser”, choć atrapa już wyszła. W teście jednostkowym i w tym samym kodzie poza oknem działało. Silnik czekał na zdarzenie `close` procesu CLI, a ono przychodzi dopiero po zamknięciu wyjścia przez **wszystkie** procesy, które je odziedziczyły. Test na samym runnerze z pomocnikiem trzymającym wyjście otwarte potwierdza, że wtedy `close` przychodzi dopiero po zniknięciu pomocnika (czerwony przy zwłoce 60 s, zielony przy 750 ms). Dokładnego procesu, który w Electronie trzymał wyjście, nie wskazałem; objaw i naprawa są potwierdzone, mechanizm w oknie wnioskuję.

Naprawa (`nodeCliRunner.run` i `start`): koniec procesu CLI (`exit`) liczy się jako odpowiedź po 750 ms, nawet gdy `close` jeszcze nie przyszło. Po tym e2e kończy logowanie sukcesem. Bezpieczeństwa to nie dotyka (nic nie czyta plików).

## Dowód

| Co | Wynik |
|---|---|
| `provider-accounts.test.ts` | 14/14 (zmienne środowiska, maskowanie e-maila, limit puli, sukces, błąd, kod, wylogowanie, nietykalne konto systemowe, zgoda na terminal, runner z pomocnikiem). Mutacje zepsucia `CODEX_HOME`, limitu i zwłoki są łapane (testy czerwone) |
| `ManagedCliSection.test.tsx`, kontrakt `ipc-subscriptions.test.ts` | 13/13 |
| `bun run lint` | zielony |
| `typecheck:node`, `typecheck:renderer` | zielone (po jednej poprawce, niżej) |
| `bun run build` | zielony |
| `bun run sandbox:e2e` (osobny root `w5-be2-e2e3`, po scaleniu poprawki KK `team/kk/w5-fix-onboarding`) | **28 ok, 0 FAIL, 0 findings** |

Krok e2e „accounts: add, sign in and out on the fake CLI, limit, remove; the system account stays”: konto systemowe jest domyślne, nie da się go wylogować ani usunąć; nowe konto ma własny folder w danych piaskownicy; logowanie atrapy kończy się sukcesem (plan „ChatGPT”), wylogowanie, limit trzech kont, usunięcie kasuje folder i zostają tylko konta systemowe.

## Zmiana poza moimi plikami

Po scaleniu z W5-UI1a `typecheck:renderer` padał: `CliAction` w `ManagedCliSection.tsx` było „wszystkie metody oprócz `listCli`”, a po dodaniu metod kont obejmowało też konta. Zamieniłem to na jawną listę metod CLI (jedna definicja, bez zmiany działania). UI Designer: ta linia może kolidować przy scalaniu W5-UI1b, zostaw wersję z jawną listą.

## Czego nie sprawdziłem

- **Prawdziwych CLI.** Ani `codex login`, ani `claude auth login` nie były uruchomione (zakaz prawdziwych kont). Kształt wyjścia (link, kod urządzenia, prośba o kod) wzięty z opisu i atrap; prawdziwe wersje mogą wypisywać inaczej. Parser (`readLoginOutput`, `readAccountStatus`) jest łagodny, ale to nieprzetestowane na żywo.
- **Prawdziwej przeglądarki** i faktycznego otwarcia strony logowania.
- **Terminala R2** w prawdziwym oknie: test jednostkowy sprawdza kartę zgody i wywołanie; sam `start cmd.exe /k` nie był odpalony.
- **Dokładnego procesu**, który w Electronie trzymał wyjście CLI (patrz wyżej).
- **Użycia kont przy starcie agenta** i przejścia przy limicie: to W5-K1, nie robiłem.
- **Claude w e2e**: atrapa Claude nie istnieje, e2e dotyka tylko Codex; Claude pokrywają testy jednostkowe.
- **Warunków planów dostawców** (R1): w UI i silniku jest tekst `ACCOUNT_POOL_WARNING`, ale nie oceniam, czy współdzielenie jest dozwolone.
- Pełnego `bun run test`, `check` i Storybooka.
