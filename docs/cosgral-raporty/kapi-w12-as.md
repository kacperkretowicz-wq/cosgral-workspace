# KAPI-AS — App publish + throw EN w UI

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #35

## Zakres
- `App.tsx`: Folders unavailable / Select a person / publish fallback
- `Conversation.tsx`: draft actions / browser takeover / preview
- `RoutinePanel` / `VaultPanel`: unavailable throws (ujednolicone z setError)
- `HostPanel`: Invalid team member role
- Klucze PL/EN: +7
- **Omijane:** `index.tsx` root element (bootstrap); Remote/Mobile (KK)

## Testy
- `i18n` 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`

## Notka UI
Błędy publikacji hosta, folderów, DM, draft/takeover/preview, Vault/rutyn, roli zespołu po PL.
