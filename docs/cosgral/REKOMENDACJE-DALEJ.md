# COSGRAL Workspace – rekomendacje dalszych prac (stan 4 XI 2026, ~04:30 CET)

Gałąź: `codex/cosgral-workspace`. Pełna historia: `COSGRAL-PRZEKAZANIE.md`, cel: `COSGRAL-PROMPT-POSTEP.md` (przekreślone = potwierdzone testami/e2e).

## Priorytety

1. **Zawieszanie pętli zdarzeń serwera w approval e2e** (P0). W odbiorze t18 dwa razy serwer nie odpowiadał ~110 s tuż po `GET /issues/:id/interactions` w scenariuszu B (`scripts/cosgral-e2e-approval.mjs`), sonda health: 109953 ms. Wystąpiło na koncie c; na d przeszło. Zrobić: uruchomić 3199 z `node --cpu-prof` (lub `--inspect` + profil), powtórzyć approval na c, znaleźć synchroniczną operację (podejrzane: synchroniczne fs/git przy worktree, kopiowanie Codex home/auth, redakcja dużych tekstów regexami, `containsInstructionCredential`). Dodać test/sondę opóźnienia pętli.
2. ~~UI własnych ról (§12)~~ – zrobione w t20 (`CompanyRolesPanel` w profilu). Panel umożliwia wybór aktywnej osoby lub agenta po nazwie, z ręcznym wyborem członkostwa jako opcją awaryjną. Przypisanie agenta sprawdzono w przeglądarce lokalnie. Pozostaje: odbiór dwóch kont i decyzja o usuwaniu ról w użyciu (dziś 409).
3. **§7 integracje** – Claude Code / Cursor / Grok / Gemini CLI oraz API (OpenAI/Anthropic/Google/xAI/OpenRouter); uczciwe oznaczanie możliwości narzędzi per runtime (start w t16).
4. **§4 multiplayer** – awatary (upload), kursory na wspólnych widokach, „Obserwuj użytkownika”, sync ustawień agentów na żywo.
5. **§10 pamięć projektu** – pamięć w repo GitHub, podłączanie własnego repo z aplikacji.
6. **§11 hosting** – Netlify (UI) + stały backend + trwała baza (nie /tmp; restart boxa kasuje /tmp, `node_modules` i `dist`).
7. **§14 kryteria 2–4, 12–15 i §16** – instrukcja wdrożenia, lista funkcji, końcowy odbiór.
8. Pozostałe częściowe: §6 import profili Runnera, MCP/CLI/skille per agent, żywe potwierdzenie zmiany modelu; §8 audyty/postęp w jednej historii.

## Zasady pracy

- Konta Codex: **a (kacperdeska12345), c (glassandgo), d (kacperdeska1234); nigdy b** (brak gpt-6.1-sol). Przed użyciem `CODEX_HOME=~/.codex-X codex login status`.
- Model: **gpt-6.1-sol, rozumowanie medium**; uruchamianie `/workspace/cosgral-codex.sh <konto> gpt-6.1-sol <prompt> <tag>`.
- **Maksymalnie 2 e2e z modelem naraz + jeden serwer** (4 naraz → OOM i restart boxa).
- **Rutyna nie odpala Codexa w tym samym drzewie podczas odbioru innego przebiegu** – t18 i t19 trafiły przez to do commitów poprzednich tur (`364ec63b1`, `274187733`) pod nie swoim opisem.
- Push bez force; zielone → `codex/cosgral-workspace`, czerwone → `wip/cosgral-tNN`. Przekreślenia tylko po teście/e2e.
- Po restarcie boxa: `pnpm install --frozen-lockfile`, `pnpm --filter @paperclipai/plugin-sdk... build`; PAPERCLIP_HOME w /tmp jest pusty.

## Stan kont (4 XI 2026 ~04:30 CET)

- a: limit do 05:26 (CET).
- c: działa (wcześniej limit do 02:50, minął).
- d: działa.
- b: nie używać.
