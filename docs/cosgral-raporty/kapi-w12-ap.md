# KAPI-AP — AppSettingsW3 / AgentCard / fallbacki

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #32

## Zakres
- `AppSettingsW3`: fallback zapisu + aria macierzy powiadomień (obie części przez `t()`)
- `ApprovalRulesSettings` / `MemoryPanel`: fallbacki błędów
- `App.tsx` / `Conversation.tsx`: mark-read / copy fallbacki
- AgentCard* / Integrations / McpSignIn: etykiety już przez `t()` — bez zmian map
- Klucze PL/EN: +4 (Could not save/load/remove/update + copy)
- **Omijane:** English/Polski w select; Remote/Mobile (KK)

## Testy
- `i18n` 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`

## Notka UI
Błędy ustawień aplikacji, reguł zgody, pamięci, kopiowania/odczytu wiadomości po PL; aria powiadomień pełna.
