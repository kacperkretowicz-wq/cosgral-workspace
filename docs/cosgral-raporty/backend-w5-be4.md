# W5-BE4: modele zapasowe (do 8) po kontach

Gałąź `team/backend/w5-be4` (baza: `team/backend/w5-be3` @ `c5c1a3191`), bez push. Bez Electrona i `sandbox:e2e`. Bez prawdziwych kont. K1 (`team/kk/w5-k1`) jeszcze nie scalone, więc część „po kontach” sprawdzona tylko czytaniem jego kodu (niżej).

## Co zmieniłem

1. **Limit 4 → 8** (`PROVIDER_LIMITS.fallbackModels`). Jedna reguła w kontrakcie (`fallbackModelsProblem`: więcej niż 8, powtórka, nieznany model) używana przez parser IPC i silnik (`ProviderRegistry.setFallbackModels`). Odrzucenie nie zmienia zapisanej listy.
2. **Migracja bez migracji schematu.** Tabela `projection_agent_fallback_models` jest ta sama. Odczyt przechodzi przez `normalizeFallbackModels`: zostaje kolejność, odpadają nieznane modele i powtórki, ucięcie do 8. Listy do 4 modeli działają bez zmian (test), uszkodzony wiersz daje `[]`, nie błąd.
3. **Lista ogólna** (nowe). Zarezerwowane `botId` `"*"` (`GENERAL_FALLBACK_SCOPE`) to lista, której używa każdy agent **bez własnej** listy. Własna lista (także pusta) zawsze wygrywa. Wcześniej agent bez listy nie miał modeli zapasowych; domyślnie lista ogólna jest pusta, więc zachowanie istniejących agentów się nie zmienia.
4. **Model usunięty.** Model `acp:<id>`, którego agent ACP został usunięty, zostaje w liście (dodanie agenta z tym samym id przywraca go), ale silnik go **nie próbuje** (`chooseModel` bierze `effective`). Lista pokazuje go w `unavailable`.
5. **Modele wbudowane i „per dostawca”.** Lista może mieszać dostawców (Codex, Claude, ACP). Limit dostawcy blokuje wszystkie jego modele naraz (stara reguła rejestru), więc zapasowy model tego samego dostawcy nie jest obejściem limitu (test).

## Kontrakt dla UI

| Co | Zmiana |
|---|---|
| `PROVIDER_LIMITS.fallbackModels` | 8 (UI już czyta stałą: „At most N models” i przycisk dodawania zmienią się same) |
| `window.openbot.providers.getFallbackModels(botId)` / `setFallbackModels({botId, fallbackModels})` | bez zmiany kształtu. `botId` `"*"` = lista ogólna. Błędy: „At most 8 fallback models.”, „A fallback model is listed twice.”, „Unknown model in the fallback list.” |
| **nowe** `getFallbackInfo?(botId)` | `FallbackModelsInfo { botId, own: AgentModelId[] \| null, general, effective, unavailable }`. `own: null` = agent idzie za listą ogólną |
| **nowe** `resetFallbackModels?(botId)` | usuwa własną listę (agent wraca do ogólnej); dla `"*"` czyści listę ogólną. Zwraca `FallbackModelsInfo` |
| `BotSummary.activeModel`, zdarzenie `model-fallback` | **bez zmian** (test sprawdza dokładny zestaw pól zdarzenia) |
| kanały | `providers:get-fallback-info`, `providers:reset-fallback-models` (tylko ten komputer) |
| mock | `src/renderer/stories/mock-fallback-models-api.ts` (`createMockFallbackModelsApi(removedAcpModels?)`), te same reguły; w Storybooku nie ma jeszcze obiektu `providers`, więc trzeba go dołożyć (`...createMockFallbackModelsApi()`) |

Kolejność zmienia się przez zapis całej listy w nowej kolejności. Nowe metody są opcjonalne (`?`), jak `subscriptions?`, dopóki wszystkie mocki ich nie mają.

## „Po kontach” (czytanie kodu K1, nie test)

Z `team/kk/w5-k1` (`agent-service.ts`, koniec tury): `#handleAccountLimit` idzie **przed** `#retryOnFallback`. Model zapasowy wchodzi tylko, gdy konta nie mają co zrobić (`"none"`), a po „switched” i „asked” nie wchodzi wcale. `#forgetTriedModel` sprawia, że przejście na inne konto nie liczy się jako wypróbowany model. Mój kod tego nie dotyka: `chooseModel(botId, model, tried)` nie ma wejścia „konto”, więc wybór modelu nigdy nie przełącza konta. Konto wybiera router per tura wg dostawcy modelu. Jedyne wspólne miejsce to `reportFailure` (blokada dostawcy), wołane po stronie K1 dopiero przy `"none"`. **Test silnika z K1 zrobię po scaleniu** (nie umiem go napisać bez kodu K1).

## Dowód

| Co | Wynik |
|---|---|
| `provider-registry.test.ts` + `agent-service.test.ts` (razem, po zmianach) | **90/90** |
| nowe w rejestrze | 0 i 8 modeli ok, 9 odrzucone, powtórka, nieznany model, stara lista (4) bez zmian, uszkodzony zapis, lista ogólna vs własna vs pusta, reset, usunięty agent ACP, przejście po 8 modelach bez pętli, limit dostawcy a ten sam dostawca |
| `ipc-fallback-models.test.ts` (kontrakt) | 5 testów |
| `provider-inputs.test.ts` | +8 modeli, 9 odrzucone, powtórka, `"*"` |
| `agent-service.test.ts` (+2) | lista ogólna w silniku, kształt `model-fallback` bez zmian; pominięcie usuniętego modelu |
| `mock-fallback-models-api.test.ts` | 1 |
| mutacja (powrót `chooseModel` do starej listy) | 4 testy czerwone |

## Wyniki końcowe

| Co | Wynik |
|---|---|
| Zbiorczy przebieg (kontrakty, main, preload, rejestr, `agent-service`, duplikowanie i szablony agentów, mocki, `AgentSettingsW3`, `ProvidersPage`) | 74 pliki, 418/420 w pierwszym przebiegu; 2 czerwone: (1) mój stary test UI „stops at four fallback models” (limit teraz 8) — **poprawiony i rozszerzony** (7 ok, 8 blokuje), plik 16/16; (2) `agent-service.test.ts` „reads the canonical SQLite conversation during an active stream” — **przechodzi osobno i w pełnym pliku (90/90 z rejestrem)**, w zbiorczym przebiegu padł pod obciążeniem (426 s); nie dotyka list zapasowych, przyczyny nie badałem |
| `biome check .` | zielone (746 plików) |
| `typecheck:node`, `typecheck:renderer`, kontrakty | zielone |
| skan prywatności nowych plików | czysty |

## Czego NIE sprawdziłem

- Electrona i `sandbox:e2e`; rejestracji nowych kanałów IPC w działającym oknie (tylko typy i parsery).
- Współpracy z kodem K1 w jednym drzewie: test silnika po scaleniu. Lista „po kontach” wyżej to odczyt kodu.
- UI: `ProvidersPage` i ustawienia agenta czytają stałą 8, ale nie dodałem ekranu listy ogólnej ani znacznika „inherited”/„unavailable”. To zadanie UI.
- Prawdziwych modeli i prawdziwych limitów dostawców; tylko atrapy ACP.
- `FallbackPolicy` ze specyfikacji (4.5: `switchBeforeFirstAction`, `returnAfterReset`) **pominąłem**: powrót do własnego modelu po resecie dzieje się już teraz przy każdej wiadomości (`chooseModel` zaczyna od modelu agenta), a przełączanie „przed pierwszą akcją” dotyczy kont (K1). Osobne ustawienie byłoby martwe.
- Interpretacja „per dostawca i ogólna”: zrobiłem listę ogólną (`"*"`) obok listy per agent, a „per dostawca” jako mieszanie dostawców na jednej liście. Osobnych list per dostawca (np. „dla wszystkich agentów Codex”) nie ma; jeśli o to chodziło, to kolejny krok.
