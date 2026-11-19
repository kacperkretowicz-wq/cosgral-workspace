# KAPI-AO — TasksViewScreen / TasksPage statusy + App delivery

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #31

## Zakres
- `App.tsx`: statusy dostawy wiadomości (`Queued #{n}` / Cancelled / Failed / Stopped) przez `t()`
- `TasksPage`: filtry, badge stanów, akcje, nagłówek, błędy, puste listy
- `TasksViewScreen`: już miał `t()` na etykietach — bez zmian map
- `Sidebar`: „Working in / background: {title}”
- `RoutinePanel`: Paused/Active, Next, No scheduled run, Webhook
- Klucze PL/EN: +10
- **Omijane:** Remote/Mobile/ChannelWorkspace (KK); brand; English/Polski; HTTP

## Testy
- `i18n` 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`
- AppSettingsW3 etykiety powiadomień, AgentCard* „Working folder”, ApprovalRules/Memory fallbacki — następna porcja

## Notka UI
Zadania (lista + statusy), podgląd wątku w pasku, rutyny (Paused/Next) i statusy wiadomości po PL.
