# KAPI-S — aria/i18n P0 rozmowy + AgentAccountPicker (kolejka #9)

Gałąź: `team/kapi/w12-p` (baza `4f21fbfe7`). Bez push, bez Electrona/dist:win.

## Wynik

| Co | Stan |
|---|---|
| Nowe klucze | **+26** PL/EN (**1615**/1615) |
| ChatSearch | aria `t()` (search, messages, prev/next, close) |
| MessageRendering | Add reaction / Choose / More emoji / More actions |
| SelectionActions | panel + close + Describe edits + Send |
| QueuePanel | Message queue |
| ComposerEditor | Insert mention |
| AgentAccountPicker | cała wyspa PL → `t()` (EN klucz / PL wartość) |

## Notka dla UI / KK

P0 aria rozmowy i wyspa kont mówią po PL przy `language=pl`. Testy pickera ustawiają `setLanguage("pl")`. AgentSettingsW3.test nadal szuka „Konto” — przy domyślnym EN trzeba `setLanguage("pl")` albo asercji EN.

## Testy

| Co | Wynik |
|---|---|
| `i18n.test` | ✅ 8/8 |
| `AgentAccountPicker.test` | ✅ 3/3 |
| Biome (własne) | ✅ |
| `typecheck:contracts\|node\|renderer` | ✅ |

## Luki

1. `#3/#7 dist:win` bez `GO-kapi-dist.txt`.
2. Inne aria rozmowy (MessageHistoryActions, ThreadPanel, PlanPanel…) poza tym zakresem.
3. Nic nie widziane w Electronie.
