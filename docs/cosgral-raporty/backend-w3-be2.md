# Backend W3-BE2: pełne ustawienia agenta, szablony, kreator agenta, powiadomienia i onboarding

Gałąź `team/backend/w3-be2` od integracji `5368cc9a5`, bez push. Opis zachowania: `docs/cosgral/parytet-0.68.md` wiersze 39 (ustawienia i powiadomienia) i 40 (onboarding), `docs/cosgral/PLAN.md` etap W3. Kodu OpenBota nowszego niż `a6fe240` nie czytałem. Zakresy KK Spajacza (dok, wyspa) i KAPI (marketplace, dostawcy) są nietknięte; tylko zakładki „dock” i „island” mają miejsce na flagę dostępności.

## Wynik

| Zachowanie | Stan | Gdzie |
|---|---|---|
| Pełne ustawienia agenta w jednym odczycie: profil, model, dostawca, narzędzia, pamięć, skille i MCP z W2 | ✓ | `AgentSettingsService.get`, `AgentSettings` |
| Jeden zapis ekranu: profil i model przez zwykłe `updateBot` (z jego sprawdzaniem zmiany dostawcy) oraz przełączniki narzędzi | ✓ | `AgentSettingsService.update` |
| Uprawnienia: przełączniki 10 grup narzędzi na agenta, egzekwowane w silniku | ✓ narzędzia znikają z wątku, wywołanie jest odrzucane (Codex, Claude, kanały) | `agent-settings.ts`, `agent-service.ts` |
| Szablony agentów: 7 wbudowanych (własne treści) i zapisane przez osobę | ✓ | `agent-templates.ts` |
| Kreator agenta: z szablonu, z pól albo z obu; skille z biblioteki, pamięć startowa, ostrzeżenia | ✓ | `AgentTemplates.createAgent` |
| Macierz powiadomień: zdarzenie × kanał (systemowe / z dźwiękiem), „tylko gdy okno w tle” | ✓ | `agent-notifications.ts`, `AppSettings.notifications` |
| Zakładki ustawień z dostępnością | ✓ lista i flagi | `AppSettings.tabs` |
| Onboarding: język, pierwszy dostawca, pierwszy agent z propozycji, krok Computer Use | ✓ | `src/main/onboarding.ts` |
| Ekrany | — praca UI według kontraktu niżej | — |

## Jak to działa i decyzje do oceny

1. **Grupy narzędzi** (wszystkie domyślnie włączone): `browser`, `computer`, `eyes`, `vault`, `skills`, `tables`, `library`, `routines`, `memory` (narzędzia pamięci w `openbot`), `messaging` (`openbot.send_message`). Zawsze zostają: pytania (`ask_user`), karty, narzędzia kanału, a także MCP, które ma własny przełącznik na serwer z W2.
2. **Egzekwowanie w trzech miejscach:**
   - wyłączona grupa znika z narzędzi wątku: rozmowa przez `#dynamicTools`, tury kanału przez nową opcję `filterTools` silnika kanałów;
   - zmiana przełączników wznawia wątek przed następną turą (podpis narzędzi jak przy MCP);
   - wywołanie wyłączonej grupy jest odrzucane w jednym miejscu obsługi narzędzi, więc dotyczy też Claude (jego serwery MCP w procesie są stałe, ale każde wywołanie przechodzi przez tę samą obsługę). Agent dostaje jasny tekst, że osoba wyłączyła narzędzie i może je włączyć w ustawieniach.
3. **Instrukcje agenta** dostają linię o wyłączonych narzędziach i, gdy osoba wybrała język, linię „odpowiadaj po polsku / angielsku, chyba że osoba pisze w innym”. Bez wyboru języka nie ma takiej linii.
4. **Bez zmiany schematu:** tabele `projection_agent_tool_settings`, `projection_app_settings` i `projection_agent_templates` tworzą same magazyny (`CREATE TABLE IF NOT EXISTS`). `SCHEMA_VERSION` jest nietknięty.
5. **Szablony** mają własne treści: Assistant, Researcher, Writer, Developer (te cztery są propozycjami pierwszego agenta), Inbox manager, Data analyst i Desktop operator. Szablon niesie rolę, opis, wysiłek rozumowania, kolor awatara, wyłączone grupy, skille z biblioteki (po nazwie) i pamięć startową („zawsze”). Model `null` oznacza model dostawcy wybranego w programie.
6. **Kreator** najpierw sprawdza wszystko (nazwy, długości, liczbę wspomnień, nazwy skilli), a dopiero potem tworzy agenta. To, czego nie da się zrobić już po utworzeniu (model niedostępnego dostawcy, skill spoza biblioteki), wraca jako ostrzeżenie, a agent działa z resztą. Pamięć idzie przez `MemoryService`, więc UI dostaje `agent-memory-changed`.
7. **Zapis szablonu z agenta** zabiera profil, model, przełączniki i nazwy zainstalowanych skilli. Pamięć „zawsze” zabiera tylko na życzenie (`includeMemories`), maksymalnie 10 wpisów po 1000 znaków. Wbudowanych szablonów nie da się usunąć.
8. **Powiadomienia:**

   | Wiersz macierzy | Zdarzenia |
   |---|---|
   | finished | tura zakończona |
   | failed | tura z błędem |
   | needs-input | pytanie, prośba Vault |
   | needs-approval | zatwierdzenie, karta szkicu lub potwierdzenia, zgoda na Computer Use |
   | takeover | przejęcie przeglądarki |
   | channel-result | wynik w kanale |

   - Domyślnie: systemowe dla wszystkiego oprócz wyników kanału, z dźwiękiem przy „needs-input” i „needs-approval”.
   - **Zmiana zachowania:** tura z błędem pokazuje teraz powiadomienie; wcześniej nie pokazywała nic. Da się to wyłączyć w macierzy.
   - Wyciszony agent (`notifications: false`) dalej milczy.
   - Ustawienia są w pamięci podręcznej do następnego zapisu, bo czyta je każde przekazane zdarzenie.
9. **Onboarding:**
   - Kolejność: język, potem dostawca (zapis do tego samego pliku co dotychczasowy setup i start tak samo jak `saveSetup`), potem pierwszy agent. Dostawca musi być gotowy przed utworzeniem agenta, żeby agent dostał jego model.
   - Pierwszy agent powstaje tylko raz; jego id jest w pliku setupu, a stary `saveSetup` go nie kasuje.
   - Nieznany szablon jest odrzucany, zanim cokolwiek się zmieni. Gdy agenta nie da się utworzyć, setup zostaje zapisany.
   - Krok Computer Use pokazuje dostępność z W3-BE1.
10. **Zakładki:** `general, agents, notifications, voice, computer-use, profile, mobile, dock, island, updates, hosts, transfer`.
    - Niedostępne są dziś: `voice`, `mobile`, `dock`, `island`, a także `computer-use` poza Windows.
    - „Rozliczeń” nie ma, bo program nie ma konta.
    - Dok i wyspa KK Spajacza mogą przełączyć swoją flagę przez `tabFeatures` bez zmiany kontraktu.
11. **Małe zmiany w dużych plikach** (bez przesuwania wcięć):

    | Plik | Zmiana |
    |---|---|
    | `agent-service.ts` | +68/−5 (dwa obiekty w konstruktorze, filtr, odmowa, podpis, instrukcje, sprzątanie przy usunięciu agenta, opcjonalna metoda w interfejsie `AgentMcp`) |
    | `main/index.ts` | +13/−2 |
    | `preload/index.ts` | +4 |
    | `channel-agent-runner.ts` | +6/−1 |

## Kontrakt dla UI

Typy: `packages/contracts/src/ipc-agent-settings.ts` (commit `4a131c2b7`). Wszystkie trzy API są opcjonalne i działają na tym komputerze.

**`window.openbot.agentSettings`**

| Metoda | Wynik | Zachowanie |
|---|---|---|
| `get(botId)` | `AgentSettings` | `bot`, `provider` (z modelu), `models`, `tools[{group, enabled, available}]`, `memory` (jak w W2), `skills[{skillId, name, installedVersion, updateAvailable}]`, `mcp[{serverId, enabled}]` |
| `update({botId, name?, role?, description?, notifications?, model?, reasoningEffort?, tools?})` | `AgentSettings` | Jeden zapis ekranu. `tools` to `{grupa: true/false}`. Zmiana dostawcy przy pracującym agencie daje błąd jak dotąd |
| `listTemplates()` | `AgentTemplate[]` | Najpierw wbudowane, potem zapisane |
| `saveTemplate({botId, name?, summary?, includeMemories?})` | `AgentTemplate` | Szablon z agenta |
| `deleteTemplate({templateId})` | `void` | Tylko zapisane |
| `createAgent({templateId?, name?, role?, description?, model?, reasoningEffort?, tools?, skills?, memories?})` | `{bot, warnings}` | Kreator; pola wygrywają z szablonem. Pokaż `warnings` po utworzeniu |

- `AgentTemplate`: `id, origin (built-in | saved), name, role, summary, description, model | null, reasoningEffort | null, tools (wyłączone grupy), skills, memories, avatarHue, suggested, createdAt`.
- Zakładka „Narzędzia” w ustawieniach agenta: pokaż przełącznik dla każdej grupy. Gdy `available: false`, przełącznik jest szary z dopiskiem, że funkcji nie ma na tym komputerze.
- Serwery MCP przełącza się dalej przez `mcp.setAgentEnabled`, pamięć przez `memory.*`, a skille przez `skills.*` (W2).

**`window.openbot.appSettings`**

| Metoda | Wynik | Zachowanie |
|---|---|---|
| `get()` | `AppSettings` | `language (en | pl)`, `languageChosen`, `notifications {matrix, onlyWhenUnfocused}`, `tabs[{id, available}]` |
| `update({language?, notifications?: {matrix?, onlyWhenUnfocused?}})` | `AppSettings` | Macierz zmienia się punktowo, np. `{matrix: {finished: {desktop: false}}}` |

Macierz: wiersze `finished, failed, needs-input, needs-approval, takeover, channel-result`, kolumny `desktop, sound`.

**`window.openbot.onboarding`**

| Metoda | Wynik | Zachowanie |
|---|---|---|
| `getState()` | `OnboardingState` | `completed, language, preferredProvider, firstAgentId, proposals (szablony z suggested), computerUse {available, reason}` |
| `complete({language, preferredProvider, firstAgent: {templateId, name?} | null})` | `OnboardingState` | Zapisuje język i dostawcę, startuje go i tworzy pierwszego agenta (tylko raz). Stary `saveSetup` działa dalej |

**Zdarzenia:**
- `agent-settings-changed {botId}`: przełączniki agenta się zmieniły, odczytaj je ponownie;
- `agent-templates-changed {templates}`: podmień listę szablonów;
- `app-settings-changed {settings}`: podmień ustawienia programu;
- profil i model jak dotąd przez `bots-changed`, pamięć startowa przez `agent-memory-changed`.

## Dowody

Dowody leżą poza repo, w `Shared\cosgral-data\desktop-backend\`.

| Sprawdzenie | Wynik | Dowód |
|---|---|---|
| Kontrakt: ustawienia, szablon, ustawienia programu z macierzą i zakładkami, onboarding, kanały IPC, zdarzenia | 5/5 | `ipc-agent-settings.test.ts` |
| Silnik ustawień: domyślnie włączone, zapis i restart, filtr narzędzi (też narzędzia `openbot`), odmowa wywołań (pytania i karty nigdy), instrukcje, odczyt zbiorczy, jeden zapis, usunięcie agenta, ustawienia programu z restartem | 7/7 | `agent-settings.test.ts` |
| Szablony i kreator: wbudowane, z szablonu, pola wygrywają, ostrzeżenia, walidacja przed utworzeniem, zapis z agenta, restart, usuwanie, pamięć tylko na życzenie | 6/6 | `agent-templates.test.ts` |
| Macierz powiadomień dla każdego rodzaju zdarzenia | 3/3 | `agent-notifications.test.ts` |
| Onboarding: propozycje, kolejność (język → dostawca → agent), tylko raz, bez agenta, nieznany szablon, błąd agenta przy zapisanym setupie; plik setupu zachowuje pierwszego agenta | 5/5 + 4/4 | `onboarding.test.ts`, `setup-store.test.ts` |
| Parsery IPC (nieznane pola, grupy, model, macierz, dostawca) | 2/2 | `agent-settings-inputs.test.ts` |
| AgentService (Codex): wyłączone grupy nie trafiają do wątku, pytania zostają, odmowa wywołania, instrukcje z językiem; kreator przez prawdziwy serwis (skill, pamięć, zdarzenia, zapis szablonu); opcja filtra w turach kanału | ✓ | `agent-service.test.ts`, `channel-agent-runner.test.ts` |
| **Piaskownica** (osobny profil, atrapa Codex, prawdziwy AgentService):<br>- onboarding PL + Codex + pierwszy agent „Pisarz” z szablonu Writer, tylko raz;<br>- wątek ma wyłączone „computer use, routines” i linię po polsku;<br>- po wyłączeniu Vault i wiadomości wątek wznowiony bez nich, `ask_user` zostaje;<br>- wywołanie wyłączonej grupy odrzucone;<br>- kreator z wbudowanego i z zapisanego szablonu;<br>- macierz decyduje o powiadomieniu;<br>- po restarcie wszystko zostaje | `ok: true` | `logs\w3-settings-sandbox.log`, `sandbox-w3-settings\evidence.json` |
| Test „bez blokady”: po wyłączeniu odmowy i filtra padają 3 testy (silnik i AgentService); po przywróceniu 3/3, plik identyczny z commitem | 3 padły → 3/3 | `logs\w3-be2-mutation.log` |
| Całe `bun run test` | **943/943**, 137/137 plików | `logs\w3-be2-full-test.log` |
| Typecheck contracts / node / renderer, `bun run build`, `biome check` 28 zmienionych plików | exit 0; bez błędów | `logs\w3-be2-typecheck.log`, `logs\w3-be2-build.log` |

## Commity

| Commit | Co |
|---|---|
| `4a131c2b7` | Kontrakt: ustawienia, szablony, kreator, ustawienia programu, onboarding |
| `ae3f5fbcd` | Przełączniki narzędzi, odczyt i zapis ustawień, egzekwowanie w silniku |
| `1fe4ae3dd` | Szablony i kreator agenta |
| `c0560e72f` | Macierz powiadomień |
| `37f7743ea` | Onboarding |
| `dcb94a143` | IPC i API okna |
| `9238245ea` | Piaskownica |
| ostatni na gałęzi | `COSGRAL-CHANGES.md`, ten raport |

## Nie zrobione / otwarte

1. **Ekrany:** ustawienia agenta, zakładki, kreator, galeria szablonów i onboarding to praca UI (kontrakt wyżej).
2. **Zakres plików agenta** (tylko folder roboczy zamiast pełnego dostępu) nie jest przełącznikiem. Wymagałby zmiany trybu sandbox Codex i Claude w kilku miejscach wspólnych plików; to osobna decyzja.
3. **Modele zapasowe i użycie** należą do kontraktu KAPI (`ipc-providers.ts`). Po scaleniu W3-K1 można je dołożyć do `AgentSettings` jednym polem.
4. **Język interfejsu:** zapisuję wybór i przekazuję go agentom. Tłumaczenia ekranów to praca UI.
5. **Kanały powiadomień** to tylko systemowe i dźwięk. Telefon (Mobile) dojdzie w etapie M.
6. **Claude** ma serwery MCP w procesie dla wszystkich grup; wyłączona grupa jest odrzucana przy wywołaniu, ale jej narzędzia nadal są na liście Claude. Dla Codex i kanałów znikają z listy.
