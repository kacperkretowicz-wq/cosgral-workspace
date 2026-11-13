# Raport Tester W2-T3 — odbiór skilli i MCP

**Gałąź:** `team/tester/w2-t3`  
**Worktree:** `Shared\cosgral-wt\desktop-tester`  
**Integracja bazowa:** `8de3a8380` (skille Backend + MCP KAPI + Vault; zadanie wskazywało też `6e5db03e2`)  
**Data:** 13.11.2026  
**Czas:** ~2 h

## Werdykt

Skille i MCP **przeszły odbiór API** w piaskownicy (`src/backend/w2-t3-skills-mcp.acceptance.test.ts` + `scripts/w2-t3-skills-mcp-smoke.ts`): biblioteka skilli (create / revise ze świeżą wersją / restore jako nowa wersja / instalacja u innego tylko przez API osoby / ochrona lokalnej kopii / limity nazwy·200 plików·10 MB / odrzut linku i ścieżki poza), MCP stdio (narzędzia, wywołanie, przełącznik per agent, sekrety niejawne, persist po restarcie), stan `needs-login` przy HTTP 401.  
**HTTP MCP „na żywo”:** nie sprawdzono (Avast psuje MCP po HTTP na tym komputerze — jak KAPI).  
**UI skilli i MCP — nie ma** (ustawienia agenta). **Prawdziwy Codex / Claude:** nie sprawdzono.

## Środowisko

| Element | Wartość |
|---|---|
| Profil | `Shared\cosgral-data\desktop-tester\sandbox-w2-t3-skills-mcp` (osobne USERPROFILE/APPDATA/LOCALAPPDATA) |
| Test | vitest `@vitest-environment node` → `w2-t3-skills-mcp.acceptance.test.ts` (1/1) |
| Skrypt | `scripts/w2-t3-skills-mcp-smoke.ts` (esbuild + Node; Bun bez `node:sqlite`) |
| Atrapa MCP | `src/backend/testing/mcp-echo-server.mjs` (stdio: `echo`, `env_check`) |
| SecretBox | atrapa szyfrująca (jak w testach KAPI) |
| Prawdziwy Codex / Claude / Electron UI | **nie sprawdzono** |

## Tabela odbioru — skille (spec-w2 §1)

| Punkt | Kroki | Wynik | Dowód |
|---|---|---|---|
| Agent tworzy skill | `create` inline `weekly-report` | ✓ v1 | `skill-create` |
| Revise | `revise` baseVersion=1 → v2 | ✓ | `skill-revise` |
| Revise wymaga przeczytanej wersji | `revise` z baseVersion=1 przy latest=2 | ✓ odrzut z komunikatem o latest | `skill-revise-requires-read` |
| Cofnięcie = nowa wersja | `restoreVersion` v1 → v3; v1 nadal czytelna | ✓ | `skill-restore-new-version` |
| Autor ma instalację | `listInstalls(chief)` | ✓ | `skill-author-installed` |
| Inny agent bez auto-install | helper przed instalacją | ✓ brak | `skill-other-not-auto` |
| Instalacja u innego przez osobę | `install` helper v2 | ✓ `installedVersion=2` | `skill-person-install-other` |
| Lokalna kopia chroniona | edycja SKILL.md agenta → `update` bez flagi | ✓ żąda potwierdzenia | `skill-local-protect` |
| Nadpisanie za zgodą | `overwriteLocalChanges: true` | ✓ | `skill-overwrite-ok` |
| Limit nazwy | `Bad_Name` | ✓ odrzut kebab-case | `skill-bad-name` |
| Limit 200 plików | folder z 201 plikami + SKILL.md | ✓ | `skill-files-limit` |
| Limit 10 MB | plik > `SKILL_LIMITS.totalBytes` | ✓ | `skill-bytes-limit` |
| Link poza folderem | junction do pliku poza skilliem | ✓ | `skill-symlink-reject` |
| Ścieżka poza | folder `../not-allowed-outside` | ✓ | `skill-outside-path` |
| Po restarcie DB | close → reopen | ✓ wersje 1,2,3 | `skill-after-restart` |

## Tabela odbioru — MCP (spec-w2 §2, decyzja nr 2)

| Punkt | Kroki | Wynik | Dowód |
|---|---|---|---|
| Dodanie stdio | `add` local_echo + echo-server | ✓ available, tools echo,env_check | `mcp-stdio-add` |
| Sekret tylko nazwa w API | `secretNames`, brak plaintext w `list` | ✓ | `mcp-secret-names-only` |
| Agent widzi narzędzia | `toolsFor(chief)` → `mcp_local_echo` | ✓ | `mcp-tools-visible` |
| Wywołanie narzędzia | `callTool` echo hello-w2t3 | ✓ | `mcp-tool-call` |
| Sekret w procesie, nie w odpowiedzi | `env_check` → present+length, bez wartości | ✓ | `mcp-secret-in-process` |
| Sekret nie w bazie jawnie | skan SQLite | ✓ 0 hits | `mcp-secret-not-in-db` |
| Wyłączenie u agenta | `setAgentEnabled(chief,false)` | ✓ tools puste | `mcp-switch-off-tools` |
| Inny agent nadal ma | helper | ✓ | `mcp-switch-other-keeps` |
| Call przy wyłączonym | callTool chief | ✓ „switched off” | `mcp-switch-off-call` |
| needs-login przy 401 | HTTP `/rpc` → 401 | ✓ status needs-login, token niejawny | `mcp-needs-login` |
| HTTP MCP na żywo | pełny streamable HTTP | **nie sprawdzono** (Avast) | `mcp-http-live-avast` |
| Po restarcie managera | stop → start | ✓ local_echo available | `mcp-after-restart` |
| Przełącznik zostaje | chief off / helper on | ✓ | `mcp-switch-persists` |

Pełny JSON: `Shared\cosgral-data\desktop-tester\sandbox-w2-t3-skills-mcp\evidence.json` (`ok: true`, 28 checks). Kopia: `evidence\w2-t3\`.

## Do odbioru w UI

1. Biblioteka skilli: lista, podgląd wersji, create/revise/restore, instalacja u wybranego agenta.  
2. Ostrzeżenie przy lokalnie zmienionej kopii + potwierdzenie nadpisania.  
3. Panel MCP: dodaj/edytuj/usuń serwer (stdio + HTTP), status, lista narzędzi, reconnect.  
4. Przełącznik MCP per agent + stan needs-login / error.  
5. Formularz sekretów bez pokazywania wartości w czacie / logach.  
6. Atrapa `mock-openbot.ts`: `skills.*` i `mcp.*` (jeśli brak).

## Nie sprawdzone

- Pełne MCP HTTP (streamable) na loopback — Avast na tym komputerze (jak raport KAPI).  
- Prawdziwy Codex / Claude z narzędziami skilli i MCP.  
- UI Electron.  
- Marketplace skilli (W3).  
- Logi aplikacji pod kątem sekretu poza skanem SQLite (sekret nie wraca w API `list` / wynikach narzędzi).
