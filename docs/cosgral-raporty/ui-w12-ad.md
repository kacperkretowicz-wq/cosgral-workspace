# UI-AD: check:ui + presety dostawców + zmiana nazwy agenta

Stan: `team/ui/w12-ad` @ `fe22919fe`; testy po zniku GO (18.11 ~16:30).

## 1. check:ui (czerwone po UI-AC)
- Przyczyna: natywne `<input type="checkbox">` w wyborze dni tygodnia w `ChannelRoutinesPanel.tsx`.
- Poprawka: `Input` z `components/ui` (`unstyled`, `type="checkbox"`).
- `bun run check:ui` → **zielone** (Legacy composite debt: 0/0).

## 2. Przyciski presetów (EndpointsSection)
- Już budowane z `ENDPOINT_CLOUD_PRESETS` (`For`); nie ma twardych dwóch przycisków.
- Dopisane CSS `.providers-actions { flex-wrap: wrap }` (klasa była w JSX, ale bez stylu) — zawijanie w obu motywach (ten sam arkusz).
- Test `EndpointsSection.test.tsx` iteruje całą listę kontraktu (przyjmie DeepSeek/Mistral/… gdy Backend scalone).
- Na tipie integracji przy commitcie UI lista ma jeszcze xAI + OpenRouter; nowe presety BE-T wejdą przy scaleniu.

## 3. Zmiana nazwy agenta
### Jest
- Pole **Agent name** w ustawieniach rozmowy (`Conversation.tsx`, `aria-label="Agent name"`) — zapis przy blur → `agent.updateBot({ name })` → `App.updateBot` aktualizuje listę botów.
- Pasek boczny i nagłówek rozmowy (`h1`) czytają `bot.name` z tej listy — po zapisie powinny się zmienić (test dopisany).
- Pole **Name** w `AgentSettingsW3` (profil zaawansowany) + **Agent name** w kreatorze (`AgentTemplateCreator` linia ~52) i `NewAgentPage`.
- Menu kontekstowe agenta: **Edit agent** otwiera te same ustawienia.

### Dopisane (tanio)
- Pozycja **Rename** / **Zmień nazwę** w menu kontekstowym: otwiera ustawienia agenta i fokusuje pole nazwy (`settingsRequest.focus: "name"`).

### Nie ma / luki
- Siatka **Agent cards** (Files/Folders/Usage…) nie pokazuje nazwy agenta — zmiana nazwy jej nie dotyczy.
- Brak edycji nazwy w miejscu na wierszu paska (tylko ustawienia).
- Zapis z `AgentSettingsW3` idzie przez `agentSettings.update` (osobny kontrakt); test UI-AD pokrywa ścieżkę `Conversation` → `updateBot`.
- Nieoglądane w oknie; testy jednostkowe dopiero po GO.

## Pliki
- `ChannelRoutinesPanel.tsx`, `cosgral.css`, `EndpointsSection.test.tsx`
- `App.tsx`, `Conversation.tsx`, `Sidebar.tsx`, `locales/en.ts`, `locales/pl.ts`, `App.test.tsx`
