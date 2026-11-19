# KAPI-AI — ConversationPrompts / StickyDecision / aria rozmowy

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #25

## Zakres
- `ConversationPrompts`: ChoiceCard, ApprovalCard (pytania/zgody), tytuły, przyciski, uprawnienia przez `t()`
- `StickyDecision`: kicker „Decision · pinned”
- `ImageGeneration`, `MessageNavigation`, `ComparisonTable`, `DataTable`: aria/label
- Klucze PL/EN: +~38
- **Nie** ruszane: `ChannelWorkspace` (KK w toku)

## Testy
- `i18n` — oczekiwane 8/8
- Biome na własnych plikach
- `typecheck:renderer`

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`
- `ThreadPanel` / `DirectConversation` jeszcze częściowo EN

## Notka UI
Karty Needs you (pytania/zgody), przypięta Decyzja i aria tabel/obrazów po PL.
