# COSGRAL Workspace – rekomendacje dalszych prac (stan 4 XI 2026, ~04:30 CET)

Gałąź: `codex/cosgral-workspace`. Pełna historia: `COSGRAL-PRZEKAZANIE.md`, cel: `COSGRAL-PROMPT-POSTEP.md` (przekreślone = potwierdzone testami/e2e).

## Najnowsze przekazanie — 4 XI, kontynuacja Windows

Ten rozdział aktualizuje historyczne instrukcje poniżej. Kod zapisano w commitach `f8a21d897` (kontrole Windows), `758d21cbb` (wybór odbiorców ról), `fe5f55aaa` (wydajność redakcji), `a961e2cee` (wyniki i ograniczenia).

- **P0 pozostaje otwarte.** Poprawiono dwa odtwarzalne przypadki kosztownej redakcji; nie dowiedziono, że powodowały pierwotne 110 sekund. Testy redakcji i ścieżki logów: 64 PASS. W próbie z lokalnym kontem Sol przeszedł weryfikację na stabilnym CLI 0.162.1, lecz rzeczywisty run zakończył się EPERM symlinku przed A. B nie osiągnięto. Polityka COSGRAL wymaga obecnie linuksowego bwrap; nie wyłączać izolacji, aby uzyskać pozorny PASS. Powtórzyć A/B na Linuksie i zapisać profil CPU przed zatrzymaniem procesu oraz niezależne pomiary health.
- **Konta a/c/d są historyczną konfiguracją poprzedniego hosta**, nie wymaganiem produktu. Użytkownik zezwolił na użycie jego lokalnego, zalogowanego Codexa. Nie kopiować poświadczeń między użytkownikami. Model testowanych agentów: gpt-6.1-sol, medium. Sesja implementacyjna przeszła z Terra na Sol; zmiana modelu sesji i model uruchamianego agenta to osobne ustawienia.
- **Role:** wybór użytkownika i agenta po nazwie działa; nowy katalog członkostw agentów jest board-only, z kontrolą firmy i nieskopowanego users:manage_permissions. UI 12 PASS; API/DB + OpenAPI 45 PASS i dodatkowy finalny test ról 12 PASS. W przeglądarce utworzono i zastosowano pustą rolę do testowego agenta. Odbiór dwóch zalogowanych osób nadal otwarty.
- **Windows:** stosować krótką ścieżkę repozytorium przy embedded PostgreSQL; długi katalog powodował błąd dostępu do rozszerzenia pg_trgm. Node >=24.11, pnpm 9.15.4. Kontrole CRLF poprawione; token gates, synchronizacja palety/postaci, shared typecheck i mapy przeszły. Nie zaliczono pełnego monorepo test/build/typecheck.
- **Następna praca produktowa:** domknąć podłączanie repozytorium z formularza projektu. Rozpoznano istniejące `ProjectRepositoryInput`, `projectsApi.create` i backendowe `repositoryUrls` z walidacją HTTPS GitHub. Formularz nowego projektu wysyła obecnie tylko wybrane `repositoryIds`. Nie dodano jeszcze pola URL ani nie potwierdzono pełnego procesu prywatnego repo → checkout → praca agenta. Rozwinąć istniejący mechanizm i jego politykę dostępu.
- **Kolejność do wersji do codziennej pracy:** stabilny host Linux + trwały Postgres/sekrety; odbiór P0; pełny onboarding repo i koordynatora/wykonawcy; odbiór dwóch kont na wdrożeniu (realtime, restart, konfiguracja, Tabela/Workflow); potem kolejne runtime'y/konta i pozostały zakres UX, pamięci i integracji.
- **Wykorzystanie gotowych rozwiązań:** ta kontynuacja rozbudowała istniejące moduły Paperclip i jego zależności. Nie importowano kodu Agor, Wemux, Happy ani Agent Teams AI i nie dodano drugiego orkiestratora. Audyt tych kandydatów jest historycznym rozpoznaniem, nie dowodem integracji. W pierwszej kolejności korzystać z już obecnych adapterów, Better Auth, WebSocketów, katalogu połączeń GitHub i mechanizmów workspace. Nowy pakiet dokładać dopiero dla potwierdzonej luki; licencję i aktualną zgodność sprawdzić przed użyciem.

Praca nad celem została wstrzymana przez użytkownika na czas przekazania i publikacji zmian w GitHub. Procesy testowe zakończone; produkcji nie wdrażano.

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

## Kontynuacja 4 XI — formularz repozytorium

Dodano opcjonalny adres HTTPS GitHub w formularzu nowego projektu, przekazywany jako `repositoryUrls` obok istniejących `repositoryIds`. Serwer nadal odpowiada za walidację, deduplikację i rejestrację workspace. Zapis adresu nie potwierdza dostępu do prywatnego repo ani checkoutu. Odbiór pełnej ścieżki repo → koordynator → wykonawca pozostaje otwarty.

Weryfikacja tej zmiany: formularz 5/5, istniejące testy repozytoriów i trwałości 13/13, typecheck UI, token gates i kontrola map PASS na Node 24.18.0. Pierwsze uruchomienia na globalnym Node 20 nie przeszły inicjalizacji; powtórzenie na wymaganej wersji przeszło. Nie wykonano pełnego monorepo build/test ani odbioru w przeglądarce. Linux dla P0 nadal niepotwierdzony (lokalny WSL nie zwrócił dystrybucji).
