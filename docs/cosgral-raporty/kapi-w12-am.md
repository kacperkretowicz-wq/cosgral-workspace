# KAPI-AM — AccountLogin + skan TSX (poza Remote/Mobile)

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #29

## Zakres
- `AccountLogin`: placeholder e-mail
- `ServerRail`: aria/menu Publish / Add remote / Remote Mac
- `RoutinePanel`: sekret webhooka (copy/done)
- `WorkflowsPage`: aria Routine
- `ConversationWindowApp`: notatki + Messages/Message/Send
- `DockApp` / `IslandApp`: dok + wyspa (etykiety statusu)
- Klucze PL/EN: +~23
- **Omijane:** RemoteMacPanel, MobileConnect, ChannelWorkspace; brand COSGRAL; English/Polski; HTTP

## Testy
- `i18n` 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`
- `RemoteMacPanel` nadal EN (Remote — KK)
- Sidebar SVG titles Limit/Error/Responded

## Notka UI
Logowanie (placeholder), szyna serwerów, sekret rutyn, okno rozmowy, dok i wyspa po PL.
