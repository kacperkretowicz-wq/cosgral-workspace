# KAPI-AK — MessageHistoryActions / AlwaysAllowPanel / resztki rozmowy

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #27

## Zakres
- `MessageHistoryActions`: menu (Copy/Retry/Edit/Pin/Delete/Branch), dialogi edit/delete przez `t()`
- `AlwaysAllowPanel`: przyciski i opisy reguł „zawsze zezwalaj” przez `t()`
- `MessageRendering` (`ExchangeSystemRow`): Message from / Messaged / aria wymiany
- `QueuePanel`: Queue paused / Resume queue
- `SelectionActions`: Retry, preset Explain/Improve/…, placeholder, show more/fewer
- `ComposerEditor`: sekcje mention Agents / Files
- Klucze PL/EN: +~37
- **Nie** ruszane: Remote / MobileConnect

## Testy
- `i18n` 8/8
- Biome na własnych plikach
- `typecheck:renderer`
- Duplikaty kluczy: 0

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`
- Powody z silnika (`messageMenu` / `threadBusyProblem`) nadal EN z API
- App.tsx: Library / Schedule / Loading COSGRAL Workspace

## Notka UI
Menu wiadomości, Always allow, wymiana agentów, kolejka i akcje zaznaczenia po PL.
