# Backend W12 – dlaczego kolejka czeka (`heldReason` + `heldKind`) (BE-N pkt 1)

Gałąź `team/backend/w12-holds` (z integracji 85c19bc3a). Oparta na pracy KAPI, którą zostawił **niezatwierdzoną** w swoim worktree (gałąź `team/kapi/w12-thread-holds` nie ma commitu); jego pliki zostają nietknięte, ta gałąź go zastępuje.

## Dla UI (bez nowego IPC)
`QueueSnapshot` (zdarzenie `queue-changed` i `agent.listQueue`) ma obok `heldReason` (zdanie po angielsku) nowe pole **`heldKind`**:

| `heldKind` | Kiedy | Co zaproponować w oknie |
|---|---|---|
| `budget` | budżet wykorzystany (jak dotąd) | „Zwiększ budżet” |
| `agent-restart` | CLI agenta startuje lub restartuje, a w kolejce coś czeka | „Czekam, aż agent wstanie” (bez przycisku) |
| `server-busy` | serwer prowadzi tyle tur naraz, ile wolno (`maxTurns`) | „Poczekaj na wolne miejsce” |
| `thread-limit` | agent ma maksymalną liczbę wątków (200) i coś czeka w kolejce | „Zarchiwizuj lub usuń wątek” |

- Gdy kilka naraz, wygrywa to, na co osoba może zareagować najpierw: `budget`, `agent-restart`, `server-busy`, `thread-limit`.
- Bez wstrzymania oba pola są nieobecne (jak dotąd); starsze serwery nie wysyłają żadnego.
- `Conversation.tsx` już pokazuje `heldReason` w pasku „Message queued: …”; `heldKind` pozwala dobrać ikonę i przycisk.
- Funkcje czyste w kontrakcie (`ipc-queue-holds.ts`): `queueHoldOf(facts)`, `QUEUE_HOLD_REASONS`, `QUEUE_HOLD_KINDS`.

## Silnik
- Powód liczy się z faktów przy budowie migawki (`#queueSnapshot`), bez mapy stanów per agent (u KAPI 66 linii w `agent-service.ts`, tu 27).
- Kolejka jest wysyłana ponownie, gdy: serwer zaczyna wstrzymywać agenta (limit tur), faza CLI zmienia się z/na „starting/restarting” (kolejki z czekającymi wiadomościami), jak dotąd przy każdej zmianie kolejki lub wątków (limit wątków).

## Czego nie obejmuje
- „Wątek poza budżetem” w sensie osobnych wstrzymań **per wątek** (nie per agent): kolejka UI jest kolejką aktywnego wątku, `heldKind` dotyczy agenta.
- `thread-limit` nie zatrzymuje pracy (wiadomości w kolejce nie potrzebują nowego wątku); to wskazówka, że nowy wątek nie powstanie. Zdanie nie obiecuje nic więcej.
- Atrapa Storybooka nie ma wstrzymań (UI może przekazać `queue` z `heldKind` wprost w historii).

## Testy (napisane w cichym oknie, NIE uruchomione)
`ipc-queue-holds` 6 (reguły), `agent-service-queue-holds` 1 (server-busy na dwóch agentach, `maxTurns: 1`; test KAPI). Do uruchomienia po oknie: te dwa pliki, `agent-service-budgets` (czy `heldReason` bez zmian), `agent-service-threads`, `typecheck` contracts i node, Biome na plikach.

## Notka dla UI Designera: jak pokazać `heldKind` (BE-O pkt 2)
Znaleziony błąd po moim kontrakcie: pasek nad polem wiadomości w `Conversation.tsx` pokazywał przycisk „Review budget settings” przy KAŻDYM `heldReason`, a teraz `heldReason` bywa też o restarcie, serwerze i limicie wątków. Poprawka (mała, 2 linie w `Conversation.tsx`): pasek wyciągnięty do `QueueHoldNotice.tsx` (+ test 3), który pokazuje przycisk budżetu tylko dla `heldKind === "budget"` (albo bez `heldKind`, starszy serwer) i daje `data-hold-kind` do stylowania.
Co UI może dołożyć (własny wygląd, bez nowych kontraktów):
1. `agent-restart`: ikona wirującego koła i bez przycisku („Czekam, aż agent wstanie”); znika sam, gdy faza CLI wraca do ready.
2. `server-busy`: ikona zegara, zdanie z silnika; bez przycisku (zwolni się, gdy skończy się tura innego agenta).
3. `thread-limit`: przycisk „Otwórz wątki” (`ThreadPanel`), bo osoba może zarchiwizować lub usunąć wątek (tu działa też cofnięcie usunięcia).
4. `budget`: jak dotąd „Review budget settings”.
