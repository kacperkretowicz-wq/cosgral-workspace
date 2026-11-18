# KAPI-U — skan aria po KAPI-S (kolejka #11)

Gałąź: `team/kapi/w12-p` (baza `2dfb55f09`). Bez push, bez Electrona/dist:win.

## Wynik

| Co | Stan |
|---|---|
| Nowe klucze | **+13** PL/EN (**1665**/1665) |
| MessageHistoryActions | More message actions → `t()` |
| ThreadPanel | Needs you by thread |
| UnreadMessages | New messages |
| StickyDecision | Decision |
| ConversationPrompts | Custom answer / prev/next / permissions |
| PageRail / Sidebar | Pages / Bot navigation |
| AlwaysAllow / ApprovalRules | panel + Remove rule |
| AccountLimitCards | limit + switched |

## Notka dla UI / KK

Aria rozmowy i paska (Pages, Bot navigation) mówią po PL. KK #8 może odhaczyć część „Sidebar/PageRail”.

## Testy

| Co | Wynik |
|---|---|
| `i18n.test` | ✅ 8/8 |
| Biome (własne) | ✅ |
| `typecheck:renderer` | ✅ |

## Luki

1. `#3/#7 dist:win` bez `GO-kapi-dist.txt`.
2. Wiele aria w Vault/MCP/Routines/Remote/Mobile nadal EN (poza tym przebiegiem).
3. Nic nie widziane w Electronie.
