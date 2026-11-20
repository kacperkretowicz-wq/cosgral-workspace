# Plan: rozbicie największych plików renderera

Stan 20.11: `Conversation.tsx` 3133 linii, `App.tsx` 2657, `Sidebar.tsx` 1468. To dług techniczny, nie błąd. Zmiana nic
nie zmienia dla użytkownika, więc robimy ją małymi krokami, każdy z pełnym zestawem testów (`bunx vitest run`,
Storybook a11y 373, `test:visual`), nigdy jednym wielkim commitem.

## Conversation.tsx: gdzie są szwy

Komponent to jedna funkcja (`Conversation`, linie 250–3130): sygnały i logika do ok. 1560, potem jeden `return`.
Wokół są tylko drobne typy i stałe (130–248). W JSX widać pięć dużych, w miarę samodzielnych obszarów:

| Obszar | Linie (około) | Co zawiera | Docelowy plik |
|---|---|---|---|
| Nagłówek rozmowy | 1602–1782 | tytuł, agent, akcje, wybór modelu | `conversation/ConversationHeader.tsx` |
| Lista wiadomości | 1851–2173 | przewijanie, dzielnik nieprzeczytanych, wiadomości | `conversation/MessageList.tsx` |
| Pole pisania | 2203–2484 | edytor, załączniki, wysyłka, wybór agenta | `conversation/ComposerSection.tsx` |
| Panel ekranu (przeglądarka / pulpit) | 2537–2709 | panel boczny przeglądarki i pulpitu | `conversation/ScreenPanel.tsx` |
| Panel ustawień agenta | 2804–3128 | opis, avatar, onboarding agenta | `conversation/AgentSettingsPanel.tsx` |

## Zrobione

- `conversation/model.ts`: typy, stałe, `browserActionLabel`, `reasoningLabel` (3133 → 3097 linii).
- `conversation/AvatarEditor.tsx` z testami: okno wyboru awatara z panelu ustawień agenta (3097 → 2980 linii).
- `conversation/BrowserPanel.tsx` z testami: panel boczny przeglądarki (2980 → 2829 linii). Po każdym kroku: Storybook a11y 373, `test:visual` 7, testy renderera 1131.
- `conversation/AgentRecipientPicker.tsx` z testami: pole „Do:” (wybór adresata) z nagłówka rozmowy (2829 → 2763 linii).
- `conversation/ReasoningSelect.tsx` z testami: wspólny wybór poziomu rozumowania, który był skopiowany w nagłówku i w panelu ustawień (2763 → 2750 linii).

- `sidebar/SidebarIcons.tsx` i `sidebar/SidebarAgentIndicator.tsx` (z testami wskaźnika): ikony i znak stanu agenta z `Sidebar.tsx` (1468 → 1327 linii).

## Zasady każdego kroku

1. **Jeden obszar na commit**, od najmniej splątanego: Panel ustawień agenta, Panel ekranu, Nagłówek, Pole pisania,
   na końcu Lista wiadomości (najwięcej wspólnych sygnałów).
2. **Sygnały zostają w rodzicu**, do dzieci idą jawne propsy (wartości jako funkcje, żeby nie czytać reaktywnie poza
   zakresem śledzenia; ostrzeżenia `STRICT_READ_UNTRACKED` w testach mają zostać na 0 nowych).
3. **Bez zmiany zachowania i wyglądu:** klasy CSS, kolejność DOM i `aria-*` bez zmian; historyjki i testy wizualne
   mają przejść bez odświeżania wzorców.
4. **Czyste pomocnicze rzeczy najpierw** (`browserActionLabel`, `reasoningLabel`, stałe szerokości paneli, `EMPTY_DRAFT`)
   do `conversation/model.ts`; to ok. 100 linii i zero ryzyka.
5. Po każdym kroku: typecheck, `bun run check:ui`, `bunx biome check .`, testy `Conversation*` i `bunx vitest run`.

## App.tsx i Sidebar.tsx

Ta sama metoda, po zakończeniu Conversation: `App.tsx` rozbić na dostawców stanu (obszary, wybór agenta, ustawienia)
i widok powłoki; `Sidebar.tsx` na nagłówek, listy (osoby / kanały / agenci) i stopkę aktualizacji. Szwy wyznaczyć
tak samo (lista obszarów JSX z numerami linii) przed pierwszym cięciem.

## Kryterium ukończenia

Żaden z trzech plików nie przekracza ok. 1200 linii; testy, Storybook a11y 373, `test:visual` i `check:ui`
bez zmian w wynikach.
