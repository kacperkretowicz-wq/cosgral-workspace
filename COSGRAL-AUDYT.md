# COSGRAL Workspace — stan techniczny i wybór bazy

Baza: Paperclip, MIT, commit dc9f387edceeb92ca94c9bac943871e190130383. Kod zachowuje licencję i historię upstream. Wybór oparty na istniejących adapterach, zadaniach, uprawnieniach, audycie, budżetach i bazie PostgreSQL. To podstawa, nie dowód spełnienia scenariusza końcowego.

## Porównanie (3 listopada 2026)

- Paperclip: MIT; serwer Express, React, Postgres, adaptery CLI, WebSocket, projekty, agenci, zadania, komentarze i role. Chat agenta ma kontener przypisany do konkretnego użytkownika; nie jest wspólnym czatem projektu.
- Agor: BSL 1.1, source-available z ograniczeniem komercjalizacji usługi orkiestracji; współpraca na żywo, sesje CLI i worktree. Kod useBoardPresenceRoom dołącza do pokoju kursorów dla konkretnej tablicy i ponawia subskrypcję po reconnect.
- Wemux: Apache-2.0 dla edycji community; izolowane worktree i osobne workery. workspace-presence-service przechowuje obecność z TTL 60 sekund. Usługi komercyjne są poza repozytorium.
- Happy: MIT; klienci i sesje agentów, synchronizacja obecności sesji i maszyn. Nie wykazano, że zastępuje pełną orkiestrację i współdzielony projekt.
- Agent Teams AI: AGPL-3.0; współpracujące zespoły i grupowy chat, implementacja grupowej komunikacji zależy od procesu aplikacji desktopowej. Licencja wymaga osobnej oceny przed wykorzystaniem kodu.

Żaden kod z pozostałych projektów nie został skopiowany.

## Mapa

Gotowe w Paperclip: modele zadań i komentarzy, historia, organizacje i uprawnienia, adaptery, agent runs, budżety, zatwierdzenia, websocket i odświeżanie zapytań. Dostępność poszczególnych funkcji wymaga testu lokalnego.

Konfiguracja: trwała baza, tryb authenticated, użytkownicy i zaproszenia, agenci i źródła uwierzytelnienia, izolacja środowisk, dostęp sieciowy.

Adaptacja: wspólny widok projektu oparty o kanoniczne zadania i komentarze, podgląd delegowania, interfejs COSGRAL.

Do zbudowania i zweryfikowania: projektowa obecność i pisanie, wspólny chronologiczny widok oraz obsługa równoczesnych wysyłek; widok workflow, a także test rzeczywistego delegowania Claude → Codex i dwóch użytkowników.

Conference Room jest eksperymentalny, wyłączony i ograniczony do local_trusted: uruchamia lokalny Claude CLI z pominięciem interaktywnych uprawnień. Nie należy usuwać tej blokady dla dostępu zdalnego.

## Źródła

- https://github.com/paperclipai/paperclip
- https://github.com/preset-io/agor
- https://github.com/wemux-ai/wemux
- https://github.com/slopus/happy
- https://github.com/777genius/agent-teams-ai
