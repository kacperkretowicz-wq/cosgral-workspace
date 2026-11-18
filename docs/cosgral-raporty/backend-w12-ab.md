# Backend W12 BE-AB: kanały w API telefonu (wiersz 71)

## Co jest
Telefon (Mobile Connect, ten sam token urządzenia, te same limity) widzi kanały komputera. Kontrakt: `packages/contracts/src/ipc-mobile-channels.ts`.

| Metoda i adres | Działanie |
|---|---|
| GET `/v1/channels` | kanały nie w archiwum, najnowsza zmiana pierwsza; `openTasks` = queued/running/waiting/paused; bez instrukcji kanału |
| GET `/v1/channels/:id/messages?limit&before` | strona wiadomości, najstarsza pierwsza, `nextBefore`; limit 1–100; zły `before` → 400 |
| POST `/v1/channels/:id/messages` | `{text, replyToMessageId?}` → 202 `{messageId, taskId}`; wiadomość startuje zadanie jak w oknie; klucz zasobu zawsze wybiera program |
| GET `/v1/channels/:id/tasks` | zadania bez zarchiwizowanych, bez folderu roboczego |
| POST `/v1/channels/:id/tasks/:taskId/{stop,pause,resume}` | 200 `{task}`; archive/restore/reassign → 403 |
| POST/PATCH/DELETE na kanale | 403 („na komputerze”) |

Zapisy liczą się do limitu 30/min na urządzenie. Bez silnika kanałów (start przed nim) adresy dają 404.

## Dla UI/KK (aplikacja telefonu, `src/mobile-app`)
Typy i ścieżki: `MOBILE_CHANNEL_PATHS`, `mobileChannelPath.{messages,tasks,taskAction}`, `MobileChannel`, `MobileChannelMessagePage`, `MobileChannelTask`. Ekranu w PWA jeszcze nie ma.

## Pliki
`ipc-mobile-channels.ts`, `mobile-phone-api.ts` (`MobilePhoneChannels`, trasy), `mobile-http.ts` (typ odpowiedzi), `mobile-channels-host.ts` (adapter na `ChannelStore`+`ChannelEngine`), `main/mobile-ipc.ts`, `main/index.ts` (+4 linie).

## Testy (jeden plik naraz)
`mobile-phone-channels` 7/7 (najpierw 6 czerwonych, 404), `mobile-channels-host` 1/1 (prawdziwy sklep i silnik), `mobile-phone-api` 10/10, `mobile-connect` 10/10, `local-only-ipc` 6/6. Biome czysty, `typecheck:contracts|node|renderer` zielone.

## Luki
- Strumień `/v1/events` nie niesie zmian kanałów: telefon pyta ponownie (odświeżanie).
- Brak ekranu w aplikacji telefonu.
- Nie sprawdzone na prawdziwym telefonie ani w oknie (brak GO).
- Reszta „ROBIĆ” po stronie silnika: 0 h wg `parytet-0.71.md`; pozostałe to „NIE ROBIĆ teraz” (LLM/Asset, Discord) i link GitHub (czeka na zgodę właściciela).
