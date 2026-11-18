# UI-AU (kolejka #13): kanały w PWA (BE-AB)

## Wynik
Zakładka **Channels** w kliencie telefonu: lista kanałów, czat (stronicowanie, wysyłka), zadania Stop/Pause/Resume. API: `GET/POST /v1/channels…` (`ipc-mobile-channels.ts`).

## Pliki
- `src/mobile-app/app.ts` — trasy `#/channels`, `#/channels/:id`, teksty PL/EN, guardy, `loadChannels`, ekrany
- `src/mobile-app/app.css` — `.channel-tasks`, `.msg.superseded`
- `src/mobile-app/app.test.ts` — atrapa kanałów + 1 test UI
- `src/backend/mobile-app-assets.ts` — `bun run build:mobile-app`

## Testy
| Plik | Wynik |
|---|---|
| `src/mobile-app/app.test.ts` | 9/9 (+1 kanały) |
| Biome | OK (3 pliki) |
| typecheck:renderer | OK |
| `build:mobile-app` | OK |

Bez Storybooka / Electrona (brak GO-ui).

## Luki
- Nie w prawdziwym telefonie / Electronie.
- Strumień `/v1/events` nie odświeża kanałów (kontrakt BE-AB: telefon pyta sam; BE-AD zdarzenia na innej gałęzi).
- Tworzenie kanału, członkowie, pamięć, archive — tylko na komputerze.
- KK #9 (wspólny ekran) — ich tor dokument/atrapa.
