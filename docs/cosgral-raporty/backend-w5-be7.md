# W5-BE7: modele zapasowe per dostawca

**Następny krok dla lidera:** scalić `team/backend/w5-be7`. UI Designer (W5-UI6) bierze kontrakt z commita `a3d3c28ce`.

**Stan:** zrobione, tylko testy jednostkowe, bez Electrona i bez pełnego `bun run test`.

## Kolejność wyboru (decyzja właściciela z 16.11)

Najpierw idą inne konta z puli (K1). Potem, po modelu głównym agenta, kolejno:

1. **lista własna agenta** (`own`);
2. **lista dostawcy agenta** (`provider`): tego dostawcy, do którego należy **własny** model agenta;
3. **lista ogólna `"*"`** (`general`), czyli „wszyscy dostawcy”, zgodna wstecz.

- Warstwy się **sumują**. Każdy model jest próbowany raz, wygrywa pierwsza warstwa, która go wymienia. Model główny nie trafia do łańcucha.
- Każda lista ma do 8 pozycji, więc łańcuch ma najwyżej 24, a pętli nie ma (każdy model raz na wiadomość).
- Na liście mogą być modele innego dostawcy, jak w OpenBocie.
- Limit dostawcy dalej blokuje wszystkie jego modele, w każdej warstwie.

**Zmiana względem BE4, świadoma.** W BE4 własna lista, także pusta, **zastępowała** listę ogólną. Teraz pusta własna lista nic nie dodaje i po kontach dalej idą lista dostawcy i ogólna. Wyłączenia modeli zapasowych dla jednego agenta nie ma. Jeśli trzeba, to osobne ustawienie.

## Kontrakt dla UI (`packages/contracts/src/ipc-providers.ts`, commit `a3d3c28ce`)

Metody są te same, bez nowych kanałów IPC: `getFallbackModels`, `setFallbackModels`, `getFallbackInfo?`, `resetFallbackModels?`. Zakres podaje się jak dotąd w `botId`:

| `botId` | Co to |
|---|---|
| id agenta | lista własna agenta |
| `"*"` (`GENERAL_FALLBACK_SCOPE`) | lista ogólna, wszyscy dostawcy |
| `"provider:codex"`, `"provider:claude"` | lista dostawcy |
| `"provider:acp:<id>"` | lista jednego agenta ACP |
| `"provider:endpoint:<id>"` | lista jednego własnego punktu końcowego |

Inna wartość z prefiksem `provider:` daje błąd „Unknown provider for a fallback list.”.

**Nowe pola `FallbackModelsInfo`** (stare zostają):

| Pole | Co znaczy |
|---|---|
| `providerScope` | lista dostawcy, za którą idzie agent (z jego modelu). `null` dla `"*"` i dla list dostawców. |
| `provider` | zapisana lista tego dostawcy; `null`, gdy nic nie zapisano. |
| `chain` | `[{ model, source: "own" \| "provider" \| "general", available }]`: cały łańcuch po modelu głównym, z etykietą źródła (Agent / Provider / All providers). |
| `effective`, `unavailable` | liczone teraz z `chain`: dostępne i niedostępne modele w tej samej kolejności. |

- **`own`** to zapisana lista samego `botId`: dla agenta jego własna, dla `"*"` i `"provider:…"` ta lista.
- **`getFallbackInfo("provider:codex")`** zwraca w `chain` modele tej listy (`source: "provider"`), a za nimi listę ogólną.
- **`resetFallbackModels(botId)`** usuwa zapisaną listę `botId`. Dla agenta to „Reset to provider list”: agent idzie za listą dostawcy i ogólną.

**Pomocnicze funkcje (do użycia w UI):**
- `providerFallbackScope(model)`: lista dostawcy dla modelu, np. do nagłówka grupy;
- `isProviderFallbackScope(value)`;
- `fallbackScopeProblem(botId)`: walidacja zakresu;
- `fallbackChain(...)`: ta sama logika łańcucha co w silniku.

**Mock:** `src/renderer/stories/mock-fallback-models-api.ts`, `createMockFallbackModelsApi(removedModels?, { agentModels? })`. `agentModels` podaje model własny agentów demo (domyślnie `gpt-5.6-luna`, czyli Codex). Mock korzysta z tego samego `fallbackChain`.

**Uwaga dla UI:** `effective` zostało listą modeli (`AgentModelId[]`), a nie łańcuchem obiektów, bo UI4 i UI5 już go tak czytają. Łańcuch ze źródłem jest w nowym polu `chain`.

## Silnik

- `ProviderRegistry`:
  - nowe `useAgentModelLookup(fn)`, które podpina `AgentService.useProviders`;
  - `#fallbackInfo(botId, ownModel)` buduje łańcuch;
  - `chooseModel` bierze listę dostawcy z modelu, który dostaje, więc działa też bez lookupu;
  - `setFallbackModels` i `resetFallbackModels` sprawdzają zakres.
- Ta sama tabela `projection_agent_fallback_models`, z kluczem `provider:…` w kolumnie `agent_id`. Bez zmiany schematu. Stare listy agentów i `"*"` czytają się bez zmian.
- Zmienione linie: `provider-registry.ts` (~40), `agent-service.ts` (+2). Kontrakt: `ipc-providers.ts`, komentarze w `ipc-desktop-apis.ts`.

## Testy

| Co | Wynik |
|---|---|
| Kontrakt `ipc-fallback-models.test.ts` (zakresy, łańcuch, walidacja info) | 9/9 |
| `provider-registry.test.ts` (+5 testów W5-BE7: 0/8/9 i powtórki na każdej liście dostawcy, kolejność warstw, brak pętli, lista dostawcy per agent, limit dostawcy, usunięty punkt końcowy, stare listy) | 25/25 |
| `agent-service-fallback-accounts.test.ts` (konta K1, potem lista agenta, dostawcy, ogólna; +2 testy) | 10/10 |
| Mock `mock-fallback-models-api.test.ts` | 2/2 |
| Regresja: powyższe + `agent-service`, `agent-service-accounts`, `agent-service-endpoints`, `ProvidersFallbackW5`, `AgentSettingsW3`, `ProvidersPageW3`, `src/main` | 47 plików, 341/341 |
| `lint`, `typecheck:node`, `typecheck:renderer` | zielone |

## Czego nie sprawdziłem

1. Electrona, `sandbox:e2e` i pełnego `bun run test` (zgodnie z poleceniem).
2. Zachowania OpenBota 0.68 dla list per dostawca: mam tylko opis właściciela. Kolejność warstw i sumowanie list to moja decyzja według polecenia lidera.
3. Po usunięciu agenta ACP albo punktu końcowego jego lista dostawcy zostaje w bazie. Nie jest używana, dopóki żaden agent nie ma takiego modelu, a wróci, gdy ten dostawca zostanie dodany z tym samym id. Nie kasuję jej.
4. Ekran UI: to zadanie W5-UI6.
