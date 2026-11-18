# T-AK / Tester — #9 PWA kanały (część docs/skrypty, bez GO)

Gałąź: `team/tester/w12-tj` @ tip po tym commicie. Baza integracji `2dfb55f09`. Bez push. Bez Electrona (brak `GO-tester-*.txt`).

## Wynik teraz

| Warstwa | Stan | Dowód |
|---|---|---|
| Kontrakt BE-AB | **jest** w tipie | `ipc-mobile-channels.ts` — lista, messages+paging, send, tasks, stop/pause/resume |
| API unit | **ok** | `mobile-phone-channels` **7/7**, `mobile-channels-host` **1/1** |
| UI PWA (UI-13) | **na `team/ui/w12-ai` @ `1682b267a`**, **nie** w tipie integracji | raport `ui-w12-au.md`; test UI „lists channels…stops a task” |
| Żywy telefon / Electron | **nie** | brak GO |

## Checklista na następny GO (żywy odbiór)

1. Scal tip z UI-13 (albo czekaj aż lider scali `1682b267a` do `codex/cosgral-desktop`).
2. `bun run build` + `build:mobile-app`.
3. Piaskownica: Mobile Connect → para urządzenia → zakładka **Channels**.
4. Lista: ≥1 kanał, badge `openTasks`.
5. Czat: stronicowanie `nextBefore`, wysyłka → 202 + nowe zadanie.
6. Zadania: Stop / Pause / Resume widoczne; archive/reassign **niedostępne**.
7. Negatyw: `/v1/events` **nie** odświeża listy (telefon musi odświeżyć sam).
8. Negatyw: tworzenie kanału tylko na PC.

## Skrypt zrzutów (bonus KK, ten sam przebieg)

`sandbox-shots-w12.ts`: Updates (16) i Voice (19) używają `inWindowChecklist` — offscreen = `FAIL:…:offscreen`, nie fałszywe OK. Lokatory zawężone do `#settings-updates` / `#settings-voice` (bez luźnego `getByText` po całym dokumencie).

## Luki / nie sprawdzone

1. UI-13 nie w tipie — nie uruchamiałem PWA z kanałami.
2. Brak GO → brak Electron / telefon.
3. Strumień zdarzeń kanałów (BE-AD) nadal poza tipem.
4. axe / Storybook — nie.
