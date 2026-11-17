# Backend W12 – dostawcy (BE-E): domknięcia z odbioru i katalog 18 dostawców

Gałąź `team/backend/w12-providers` (z integracji 9b571a8ab).

## Krok 1: błędy z odbioru Testera i wartości, które były tylko zapisane
| Punkt | Stan |
| --- | --- |
| agentCards "IPC/silnik w oknie FAIL" | Naprawione już w BE-D (`registerAgentCardsIpc`, silnik, wpięcie w `main/index.ts`, test lokalnego IPC); odbiór był na 6752d67a1, przed tym scaleniem. |
| Start Codex się nie udaje: agent wisi na "Thinking" | Naprawione wcześniej (W4-BE2, `8f7def35d`); test `cli-start-failure.test.ts`. Nie zmieniałem. |
| Limit "wątki naraz" (Ogólne) | Czytany przez `agent-service`: nowa tura nie startuje, gdy liczba trwających tur osiągnęła limit; agent czeka i startuje po końcu tury (`#limitHeld`). Przy pierwszej wersji znalazłem pętlę ponownego planowania (zawieszała test): naprawiona. |
| Limit wspomnień na agenta | Czytany: `MemoryStore.useDefaultLimit` (własny limit agenta ma pierwszeństwo). |
| Przegląd wspomnień, uczenie umiejętności, uczenie z przeglądania, plan przed długimi zadaniami, współautor commitów, nowe czaty | Czytane jako linie instrukcji agenta (`agent-policy.ts`, dopisywane przy starcie i wznowieniu wątku). To są polecenia dla modelu, nie mechanizm wymuszający. |
| quickAcknowledgement | Gdy tura trwa, a osoba chciała, w czacie pojawia się krótka notatka systemowa "Got it…" (na żywo, nie zapisywana w historii). |
| notificationLevel | Czytany przez powiadomienia pulpitu: `none` nic, `mentions` tylko to, o co agent prosi osobę (pytanie, zgoda, przejęcie przeglądarki), `all` jak dotąd. |
| chatColor | Przechowywany i oddawany przez `agentCards`; użycie to ekran (UI). |
| agentStartsNewChats | Linia instrukcji (jw.); brak osobnego narzędzia "nowy czat" dla agenta. |
| localScripts | Zapisane; brak interfejsu skryptów lokalnych w programie, więc nic jeszcze nie czyta. |

## Krok 2: `window.openbot.providerCatalog`
- Tabela 18 dostawców (claude, codex, grok, opencode, antigravity, cursor, cline, pi, muse, inception, deepseek, openrouter, hermes, acp, kimi, devin, copilot, mistral) z danymi o nazwach, programach, opisach i komunikatach logowania wg deskryptorów 0.71 (odczyt kopii poza repo; w repo własne dane).
- Poziom wsparcia mówi wprost: `built-in` (Codex, Claude), `acp-preset` (OpenCode, Gemini/Antigravity, Cline, Hermes, Kimi, Copilot, Mistral), `needs-runtime` (Grok, Cursor, Pi, Muse, Inception, DeepSeek, OpenRouter, Devin: wymagają runtime, którego nie mamy), `custom` (dowolny ACP).
- Polecenia ACP: `antigravity` (`agy acp`) jest `documented` (dokumentacja dostawcy, W6-BE5); pozostałe 6 (`opencode acp`, `cline --acp`, `hermes acp`, `kimi acp`, `copilot --acp`, `vibe-acp`) to `unverified`: nie potwierdzone na tym komputerze, program ich sam nie uruchamia; osoba dodaje preset i sprawdza.
- Klucz API: `setKey/clearKey` (8–512 znaków; dostawca bez klucza odmawia). Klucz zaszyfrowany (ten sam magazyn co API keys: Codex/Claude zostają w swoich polach, reszta w "catalog:<id>"), odpowiedź ma tylko maskę, redakcja logów obejmuje nowe klucze. Zmienna środowiskowa trafia WYŁĄCZNIE do procesu agenta ACP dodanego z tego presetu (`acpAgentEnv`).
- Stan: znaleziony program w PATH (`findCommandInPath`), klucz zapisany, agent dodany; zdarzenie `provider-catalog-changed` (cała lista).

## Krok 3: UI → Backend (zapotrzebowanie-backend-ui.md, bez nowych wpisów od 10:13)
| Wpis | Kontrakt | Mock | Silnik |
| --- | --- | --- | --- |
| createAgent z avatarSeed/avatarHue | tak | tak | tak (W11) |
| listTemplates, ≥3 sugestie | tak | tak | tak |
| search.query | tak | tak | tak |
| wątki: karty, reorder, closeOthers | tak | tak | tak |
| pytanie boczne | tak | tak | tak (BE-D, test na serwisie) |
| slash i @ | tak | tak | tak |
| server settings: Personality, General, Agents, Storage | tak | tak | tak |
| server settings: Sites, Members | tak ("niedostępne" z powodem) | tak | brak: wymaga usługi online |
| server settings: Import, Transfer | wskazanie na API KK (`transfer`) | brak | KK (g2) w toku |
| karty agenta: publikacja | `available:false` | tak | brak (KAPI-C robi karty bez silnika) |
| zdarzenia: agent-preferences-changed, server-settings-changed, side-question-changed, provider-catalog-changed | tak | tak | tak |

## Czego nie zrobiono (zakres po katalogu: KAPI)
`providerRuntimes`, CLI zarządzane i logowanie nowych dostawców, pula kont dla innych dostawców niż Codex/Claude, pobieranie CLI za zgodą karty dla nowych dostawców. Pula kont: `account-router` jest związany z `AccountProvider = codex|claude`; rozszerzenie wymaga katalogu runtime (patrz wyżej).

## Testy (jeden plik naraz)
`ipc-provider-catalog` 7, `provider-catalog` 5, `agent-policy` 5, `agent-notifications` +1, `memory-store` +1, `agent-service -t W12` 4/4, `local-only-ipc` zielony; typecheck contracts, node, renderer, storybook; Biome.

## Nie sprawdzone
Prawdziwe CLI (żadne z 7 poleceń ACP, żaden klucz), Electron/e2e (brak GO dla mnie), efekt instrukcji na prawdziwym modelu (to polecenia tekstowe), UI katalogu (UI podpina).
