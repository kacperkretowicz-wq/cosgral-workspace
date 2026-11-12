# Parytet 0.68 — inwentaryzacja w toku

Stan roboczy, 12.11.2026. Baza `23ca29fa9` (pochodzi z 0.1.11). Żaden test odbioru nie został uruchomiony. Mapa 0.67.1 opisuje statyczne ślady, nie dowodzi zachowania 0.68; [README 0.68](https://github.com/nightly-labs/openbot/blob/v0.68.0/README.md) potwierdza ogólny zakres, a [wydanie 0.68](https://github.com/nightly-labs/openbot/releases/tag/v0.68.0) wskazuje zmiany. Istnienie pliku nie dowodzi pełnej funkcji. Oceny poniżej są wstępne i wymagają porównania implementacji oraz testu.

| Nr | Obszar | Zachowanie | 0.1.11: wstępny stan / dowód | Fala | Test odbioru: kroki → wynik |
|---|---|---|---|---|---|
| 1 | Nawigacja | Lista agentów otwiera ich rozmowy. | Częściowo — `src/renderer/src/components/Sidebar.tsx`; zakres stanów do sprawdzenia. | W1 | Wybrać dwóch agentów kolejno → każdy pokazuje własną historię. |
| 2 | Czat | Rozmowa wyświetla wiadomości i odpowiedzi agenta. | Częściowo — `src/renderer/src/components/Conversation.tsx`; działanie bez zewnętrznego logowania do sprawdzenia. | W1 | Wysłać wiadomość agentowi → odpowiedź widoczna i zachowana po restarcie. |
| 3 | Czat | Wiadomości wysłane podczas pracy czekają w kolejce. | Częściowo — `src/renderer/src/components/conversation/QueuePanel.tsx`; zachowanie po awarii do sprawdzenia. | W1 | Wysłać dwie wiadomości podczas pracy → wykonać je kolejno i zachować po restarcie. |
| 4 | Czat | Przeszukiwanie rozmowy prowadzi do trafienia. | Częściowo — `src/renderer/src/components/conversation/ChatSearch.tsx`; zakres wyszukiwania do sprawdzenia. | W1 | Wyszukać unikalny tekst → otworzyć właściwą wiadomość. |
| 5 | Przeglądarka | Agent i człowiek korzystają z wbudowanej przeglądarki. | Częściowo — `src/backend/browser-host.ts`; przejęcie i sesja do sprawdzenia. | W1 | Agent otwiera stronę testową, człowiek przejmuje sterowanie → po oddaniu agent kontynuuje w tej samej sesji. |
| 6 | Zespół | Użytkownicy wymieniają wiadomości w zespole. | Częściowo — `src/backend/team-chat-store.ts`; kanały z liderem i zadaniami niezweryfikowane. | W1 | Dwie osoby i agent otwierają wspólną rozmowę → wiadomości widoczne wszystkim i po restarcie. |

## Pozostała praca

Ta tabela nie jest pełną listą funkcji ani podstawą do ogłoszenia parytetu. Należy dopisać wszystkie obszary z B2, zbadać zachowanie 0.1.11 i dowody 0.68, ustalić liczbę stanów oraz priorytety W1. REA jest w trakcie próby; wyniku nie ma. Testów runtime nie wykonano.
