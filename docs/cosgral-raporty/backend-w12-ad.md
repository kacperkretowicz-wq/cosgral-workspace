# Backend W12 BE-AD: kolejka Backend, pozycje 8–10

Gałąź `team/backend/w12-ad` (z integracji). Bez Electrona i Storybooka.

## 8. Strumień `/v1/events` niesie kanały (`2a2ae3772`)
- Nowe zdarzenia: `{type:"channel", channelId}` (zmiana wiadomości lub zadania kanału) i `{type:"channels"}` (zmiana listy kanałów).
- Bez tekstu i bez danych kanału: telefon sam pobiera listę, zadania albo wiadomości. Serię zmian łączy jedno zdarzenie na kanał i krótki okres. Wznawianie (`Last-Event-ID`) działa jak przy rozmowach.
- Pliki: `ipc-mobile.ts` (typ i guard), `mobile-phone-api.ts`.

## 9. Miejsce przywracania osobno na serwer (`9d79bedfc`)
- `workspace.byServer?: Record<serverId, {page, botId, threadId}>`. `last` zostaje miejscem tego komputera, więc stary kształt i testy się nie zmieniają. Brak wpisów = pole nie istnieje.
- Zmiana: `appSettings.update({ workspace: { byServer: { "<serverId>": place | null } } })`. `null` zapomina. Serwer `local` jest odrzucony zdaniem („to jest `last`”). Maks. 16 serwerów, najstarsze odpadają, ponowny zapis robi wpis najnowszym.
- Silnik nie zna agentów zdalnych, więc ich miejsc nie sprawdza (sprawdza okno); agent lokalny nadal jest wycinany po usunięciu.
- Jedna funkcja `applyWorkspacePatch` dla silnika i atrapy Storybooka.

## 10. Szczegół zadania kanału w API telefonu (``9d766313a``)
- `GET /v1/channels/:id/tasks/:taskId` → `{ task, request, result, steps }`: wiadomość startowa, wynik (gdy jest) i kroki (zadania podrzędne bez zarchiwizowanych). Telefon nie musi przeglądać wiadomości. Zadanie z innego kanału lub nieznane = 404; inna metoda niż GET = 405.
- Adapter: `MobilePhoneChannels.message` (jedna wiadomość lub null).

## Notka IPC dla UI/KK
- Telefon (`src/mobile-app`): po `channel` pobrać ponownie wiadomości lub zadania danego kanału, po `channels` listę. Ścieżki: `mobileChannelPath.{messages,tasks,task,taskAction}`, typ `MobileChannelTaskDetail`.
- Okno: przy starcie serwera `X` czytać `workspace.byServer[X]` (dla lokalnego `workspace.last`), a zapisywać `workspace: { byServer: { [X]: place } }`. Hook `useRestoreWorkspace` dziś zna tylko `last`.

## Testy (jeden plik naraz)
`mobile-phone-channels` 11/11 (najpierw czerwone: 2 + 2 + 2), `mobile-channels-host` 2/2, `mobile-phone-api` 10/10, `mobile-connect` 10/10, `ipc-mobile` 4/4, `local-only-ipc` 6/6, `ipc-agent-settings` 15/15 (+3), `agent-settings` 16/16 (+1), `agent-settings-inputs` 3/3, `onboarding` 5/5, `useRestoreWorkspace` 6/6, `AppBehaviorSection` 3/3. Biome czysty, `typecheck:contracts|node|renderer` zielone.

## Luki
- Nic nie sprawdzone na prawdziwym telefonie ani w oknie (brak GO).
- Okno jeszcze nie zapisuje miejsca per serwer; klient telefonu nie używa nowych zdarzeń ani szczegółu zadania.
- Push (Web Push) dla zakończonych zadań kanału: nie zrobiony (dziś tylko karty Needs you).
