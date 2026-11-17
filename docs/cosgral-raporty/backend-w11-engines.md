# W11 (BE-C): silniki U3–U6, szukanie, pole wiadomości, karty wątków

Gałąź `team/backend/w11-engines` (od integracji `51f626f5c`, bez push). Kontrakt i mock były w `f71e8aee1`. Tylko testy jednostkowe, Biome i typechecki; Electrona, e2e i pełnego `check` nie uruchamiałem na tych zmianach.

## Co jest

| Funkcja | Silnik | Testy |
|---|---|---|
| U6 karty wątków | `thread-tabs.ts`: kolejność własna osoby, zapis w jednym pliku JSON obok danych, zamknięcie karty nigdy nie archiwizuje ani nie usuwa wątku, wątek zarchiwizowany lub usunięty traci kartę (z jednym zdarzeniem), limit 12 kart (najstarsza odpada), uszkodzony plik ignorowany | 8 |
| U3 szukanie | `search-service.ts` + `OpenBotDatabase.searchMessages`: agenci, kanały (bez zarchiwizowanych), wiadomości (zwykłe dopasowanie tekstu w SQLite, `%` i `_` nie są znakami wieloznacznymi, najnowsze pierwsze), pliki biblioteki, rutyny; fragment wokół trafienia; limit na rodzaj i flaga `truncated` | 6 (w tym na prawdziwej bazie) |
| U5 komendy `/` i `@` | `composer-service.ts`: komendy programu (compact, new-thread, side) i umiejętności agenta o poprawnej nazwie komendy; wzmianki: agenci (bez pytającego), kanały, pliki | 2 |
| U4 pytanie boczne | `composer-service.ts`: stany running/done/failed/cancelled, zdarzenie `side-question-changed` z całym stanem, anulowanie z sygnałem przerwania, limit 3 naraz na agenta, zamknięcie programu kończy wszystkie | 6 |
| IPC | `composer-ipc.ts`: kolejność: serwer lokalny, parser kontraktu, dopiero silnik; 9 kanałów, tylko ten komputer; `local-only-ipc.test.ts` rozszerzony (kanały i odmowy) | 6 (`local-only`) |
| Wpięcie | `main/index.ts` (+ ok. 35 linii, bez `agent-service.ts`): źródła z istniejących list (agenci, `channelStore`, biblioteka `sharedData.library`, `routineStore`, umiejętności `skillLibrary`), karty uczą się z `threads-changed` | typecheck |

## Czego nie ma / granice

1. **Pytanie boczne nie ma jeszcze prawdziwego wykonawcy.** Silnik trzyma stany, limity i anulowanie, ale samo zadanie pytania w osobnym kontekście (efemeryczny wątek CLI czytający czat, jak podagenci W6-BE4) to port `ask`, którego **jeszcze nie wpiąłem**: bez niego pytanie kończy się od razu błędem „not connected”. To szew w `agent-service.ts` (kilkadziesiąt linii), zaplanowany jako osobny krok.
2. **Szukanie w wiadomościach** to `LIKE`, nie indeks pełnotekstowy: wystarcza przy dziesiątkach tysięcy wiadomości, nie sprawdzałem na dużej bazie. `threadId` w trafieniu to id z bazy; że jest równe publicznemu id wątku w oknie, nie sprawdziłem (okno ma to potwierdzić).
3. Komendy `/` zwracają listę; **wykonanie** komendy (compact, new-thread, side) to sprawa okna (używa istniejących API), nie tego silnika.
4. Nie sprawdzałem Electrona ani prawdziwej aplikacji z tymi kanałami.

## Uwaga o bezpieczeństwie (ekstraktor)

Przy próbie `--target cosgral` moja powłoka dziedziczyła zmienne `CLAUDE_*` (m.in. `CLAUDE_CONFIG_DIR`), więc **nasza aplikacja w piaskownicy zobaczyła konto Claude właściciela** (adres e-mail na ekranie „Set up this computer”). Nic nie wysłano ani nie wpisano; wyniki z tego przebiegu usunąłem (przeskanowałem `Shared\cosgral-docs` pod kątem adresu). Reguła dla każdego uruchamiania kopii: **czyste środowisko** (bez `CLAUDE_*`, `OPENBOT_*`, `GIT_CONFIG_*`, tokenów). Dopisane do `scripts/openbot-probe/README.md`.
