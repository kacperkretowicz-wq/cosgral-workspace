# KK Fullstack: W5-K1, konta dostawcy przy agencie i przełączanie przy limicie

Data: 16.11.2026. Gałąź `team/kk/w5-k1` (od `codex/cosgral-desktop` @ `a3f60e25a`). Przejęte od KAPI (limit tygodniowy modelu do 19.11, 23:00). Jego worktree czytałem tylko do odczytu; szkic skopiowałem do mojej gałęzi i sprawdziłem krytycznie.

## Wynik w jednej linii

**Silnik kont działa na atrapach CLI: konto agenta jest wybierane przy każdej turze, limit przed pierwszą akcją przenosi turę na następne konto puli, limit po akcji pyta kartą, a model zapasowy wchodzi dopiero po wszystkich kontach. Karty UI2a są podpięte do prawdziwych zdarzeń. Nie uruchamiałem Electrona ani `sandbox:e2e` (czekam na znak lidera), więc „w prawdziwym oknie" nic nie jest sprawdzone.**

## Co dostałem od KAPI i co poprawiłem

Szkic był dobrym kierunkiem, ale nie był skończony. Skopiowane: kontrakt (`ipc-conversation.ts`, `ipc-subscriptions.ts`), zmiany `provider-accounts.ts`, `account-router.ts` + test. Zmiany względem szkicu:

| Co | Problem w szkicu | Poprawka |
|---|---|---|
| `account-router.ts` `configured` | wyłączone konto puli liczyło się jako „skonfigurowane", router wchodził w grę, choć nic nie było do wyboru | liczą się tylko konta włączone i nie systemowe |
| `account-router.ts` `acquire` | gdy żadne konto puli nie wystartowało, pętla kręciła się dalej | koniec pętli i powrót do starej ścieżki (zwykły klient dostawcy) |
| 2 testy szkicu | złe oczekiwania (testy opisywały błąd jako normę) | poprawione; router 31/31 |
| silnik | szkic nie miał żadnego podłączenia do `AgentService` | zrobione w tym zadaniu (niżej) |

## Co jest zrobione

**1. Konto agenta i wybór konta przy turze** (`account-router.ts`, `agent-service.ts`). Kolejność: konto przypisane agentowi (inaczej domyślne), potem pula wg `poolOrder`. Konta wyłączone, wylogowane i z aktywnym limitem są pomijane. Limit kont na dostawcę z ustawień puli (domyślnie 3) działa przy dodawaniu i przy wejściu do puli (`setPool`), także po obniżeniu limitu. Każde konto spoza systemowego ma własny proces CLI; folder stanu konta trafia tylko do zmiennej środowiska tego procesu (`CODEX_HOME` / `CLAUDE_CONFIG_DIR`). Nie otwieram, nie kopiuję i nie wypisuję plików logowania.

**2. Przełączanie przy limicie.**
- Limit przed pierwszą akcją (tylko wiadomości, rozumowanie, plan): konto dostaje `limitedUntil` (czas od dostawcy, a gdy go brak, założona godzina z adnotacją), wiadomość wraca do kolejki i następna tura idzie na następne konto. Zdarzenia: `account-limit-reached` (wynik `switched`) i, gdy nowe konto zaczyna turę, `account-switched` („usage-limit").
- Limit po pierwszej akcji (polecenie, plik, narzędzie): nic nie jest powtarzane samo. Tura kończy się jako nieudana, w „Needs you" pojawia się karta „Limit reached on X. Continue on Y?". „Send" powtarza prośbę na następnym koncie, „Keep draft" nie robi nic.
- Wszystkie konta wyczerpane: po jednej próbie na konto stop, bez pętli; zdarzenie z wynikiem `exhausted` i czasem resetu; decyzję przejmują modele zapasowe.
- Powrót po resecie: każda tura zaczyna od pierwszego wyboru, więc agent wraca na swoje konto, gdy limit minął (zdarzenie `account-switched` z powodem „returned"). Znacznik limitu wygasa też sam (timer w routerze).
- Kolejność warstw (P09): najpierw inne konto tego samego modelu, potem model zapasowy. **Test złapał błąd w moim okablowaniu**: przełączenie konta wpisywało model do „już wypróbowanych", więc silnik od razu skakał na model zapasowy. Naprawione (`#forgetTriedModel`).
- Limit modelu zapasowego nie jest limitem konta: router liczy tylko tury, które sam rozpoczął na koncie (`begin`).
- Wątek dostawcy żyje w koncie, które go utworzyło. Przy zmianie konta rozmowa idzie dalej w nowym wątku nowego konta z przekazaniem historii (mechanizm przekazania z przełączania dostawcy). Prośby o stary wątek idą do procesu jego konta.

**3. Karty UI2a podpięte do kontraktu K1** (`account-usage-view.ts`, `AccountLimitCards.tsx`, `App.tsx`, `Conversation.tsx`, `account-state.ts`, `AgentAccountPicker.tsx`):
- Widoki kart budowane są z prawdziwych zdarzeń (`limitReachedView`, `switchedView`), nie z zgadniętych pól. Karty pojawiają się w otwartej rozmowie tego agenta (nie innego), po maks. 3 na agenta, każda z „Dismiss".
- **Usunięty martwy przycisk „Return to X after reset"**: nie ma IPC powrotu, a powrót jest automatyczny. Karta mówi to tekstem. Karta „asks" wskazuje kartę w „Needs you". Założony czas resetu jest oznaczony („Assumed reset at").
- Ustawienia agenta: „Teraz odpowiada kontem: X" z `AccountsSnapshot.active` (etykieta, nigdy adres e-mail).
- Nadal zgadnięte w UI2a (opisane, nie ruszane): mapowanie okien użycia primary=5 h i secondary=tydzień w `AccountUsageMeter` (z kontraktu `AccountUsageWindow` bez nazw okien); pasek użycia nie ma jeszcze źródła użycia per konto (zob. „Luki").

**4. Usterka 2 z T2a (karta zgody CLI w pierwszym agencie): naprawiona, mała zmiana.** `confirmForPerson(null, …)` używa teraz agenta, którego rozmowę okno otworzyło jako ostatnią (`readConversationFor`), a dopiero potem pierwszego z listy. Agent podany wprost nadal wygrywa. To nie jest karta na stronie Dostawcy (to byłaby większa zmiana kontraktu IPC), ale karta jest w „Needs you" i w rozmowie, na którą patrzy osoba.

**5. Poprawka cudza, drobna:** `ManagedCliSection.tsx` używał typu `SubscriptionsDesktopApi` bez importu, więc `typecheck:renderer` był czerwony już na integracji `a3f60e25a`. Dodany import (1 linia).

## Testy

| Co | Wynik |
|---|---|
| `account-router.test.ts` | **31/31** |
| `agent-service-accounts.test.ts` (nowy, prawdziwy `AgentService` + atrapy CLI per konto) | **12/12** |
| `provider-accounts.test.ts` (3 nowe: limit do czasu, konto aktywne, pełna pula) | **17/17** |
| `ipc-subscriptions.test.ts` (2 nowe: zdarzenia K1, `active`) | **6/6** |
| `AccountLimitCards.test.tsx` (przepisany pod kontrakt K1) | **7/7** |
| `AgentAccountPicker.test.tsx` (1 nowy: „Teraz odpowiada kontem") | **3/3** |
| `App.test.tsx` (1 nowy: karty tylko u właściwego agenta, Dismiss), przebieg filtrowany `-t` razem z pickerem | zielone (13 testów, reszta pliku pominięta) |
| `agent-service.test.ts` (regresja, stary zestaw) | **69/69** |
| `bun run lint` (całe repo, 735 plików) | zielony |
| `bun run check:ui` | zielony, dług 0/0 |
| `typecheck:contracts`, `typecheck:node`, `typecheck:renderer`, `typecheck:storybook` | zielone |

Przypadki graniczne pokryte testem silnika: wszystkie konta wyczerpane (po 1 próbie, bez pętli), konto usunięte w trakcie tury (brak przełączenia, wiadomość nie ginie, następna idzie na domyślne), dwa agenty naraz (limit jednego nie rusza drugiego), „Keep draft" nie powtarza, brak puli = zachowanie jak dawniej, powrót na pierwsze konto po resecie, model zapasowy dopiero po kontach.

Uwaga o uruchamianiu: `bun run test` w tym worktree wywala się na `zod` (bun jako środowisko vitest). Uruchamiałem testy przez `node node_modules/vitest/vitest.mjs run …` (przy `VITEST_MAX_WORKERS=1`, po jednym pliku).

## Kryteria `spec-w5.md` dla K1

| Kryterium | Stan | Jak sprawdzone |
|---|---|---|
| P01 dwa konta obok siebie z własnym stanem | **J tak, E nie** | atrapy: dwa agenty na dwóch kontach, osobne procesy i foldery w env; E dopiero po znaku |
| P02 jedno konto domyślne na dostawcę | **J tak** (BE2) | `provider-accounts.test.ts` |
| P03 agent z kontem startuje CLI z folderem tego konta | **J tak, E nie** | fabryka atrap mapuje `CODEX_HOME` na klienta, tura idzie na właściwego |
| P04 pula: włączanie, kolejność, wyłączone nigdy | **J tak** | router + silnik |
| P05 limit kont w puli | **J tak** | dodanie i wejście do puli odrzucone z komunikatem |
| P06 limit przed akcją → następne konto, znacznik w UI | **J tak, E nie** | silnik; znacznik = karta limitu i karta „switched" |
| P07 limit po akcji → karta „continue on X?" w Needs you | **J tak, E nie** | silnik (karta w `listPendingRequests`, Send/Keep) |
| P08 brak wolnego konta: stan limitu z godziną resetu, bez wiszącego „Thinking"; po resecie powrót | **J tak (część)** | tura kończy się jako `failed`, zdarzenie z czasem resetu; wygasanie znacznika na timerze tylko w teście ręcznego `reconcile`, nie w czasie |
| P09 najpierw konto, potem model zapasowy | **J tak** | test z modelem ACP jako zapasowym |
| P10 jeden proces na aktywne konto, bezczynne zatrzymane | **J tak** | testy routera (sweep bezczynnych 5 min) |
| P11 brak udostępniania i eksportu; ostrzeżenie o puli | **Częściowo** | brak kanału w kontrakcie (przegląd), ostrzeżenie jest w UI1b; nie dodawałem nic nowego |

## Luki i czego nie sprawdziłem

1. **Brak E2E.** Nie uruchamiałem Electrona ani `sandbox:e2e`, ani odbioru w prawdziwym oknie (polecenie lidera). Karty w prawdziwym oknie, karta w „Needs you" i powrót po resecie nie były oglądane.
2. **Zużycie okien nie jest per konto.** `account/rateLimits/updated` odświeża zużycie tylko klienta systemowego; pasek `AccountUsageMeter` nie ma jeszcze źródła per konto, a Strona użycia pokazuje konto systemowe. Limit konta pochodzi z błędu tury, nie z okna.
3. **Każda zmiana konta to nowy wątek dostawcy** z przekazaniem historii (nie wznowienie tego samego), więc kontekst może być streszczony.
4. **Kopia zapasowa historii przy starcie** (`#backfillProviderHistory`) używa klienta systemowego; dla wątku konta niesystemowego zgłasza niekrytyczny błąd.
5. **ACP** jest poza kontami (to skonfigurowane programy).
6. **Karta zgody CLI** nie jest na stronie Dostawcy (opis w pkt 4).
7. Czas założony (godzina), gdy dostawca nie poda resetu, jest oznaczony w karcie; nie weryfikowałem go z prawdziwym dostawcą (zasada: bez prawdziwych kont).
8. `App.test.tsx` uruchomiłem tylko dla testów dotyczących kont i zapasowego modelu (filtr `-t`), nie cały plik (3400+ linii).

## Commity (gałąź `team/kk/w5-k1`)

Wszystkie z trailerem `Co-authored-by: OpenBot`; bez push i bez `--force`.
