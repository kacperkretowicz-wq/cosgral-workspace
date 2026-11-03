# COSGRAL Workspace — baza robocza

To wczesna adaptacja Paperclip, a nie ukończony COSGRAL Workspace. Bieżący audyt, licencje, zakres i wyniki prób są w `COSGRAL-AUDYT.md`.

Repozytorium: https://github.com/kacperkretowicz-wq/cosgral-workspace (prywatne), gałąź `codex/cosgral-workspace`. Baza upstream: Paperclip MIT `dc9f387edceeb92ca94c9bac943871e190130383`; źródło upstream pozostaje skonfigurowane jako `origin`.

Na komputerze testowym projekt działa w trybie deweloperskim wyłącznie na loopback: UI http://127.0.0.1:5173 i API http://127.0.0.1:3100. Sesja jest jednego operatora (`local_trusted`), bez bezpiecznego dostępu drugiej osoby; nie wystawiać jej do sieci. Dane testowe są w `work/cosgral-data` obok katalogu `work/paperclip`, poza repozytorium Git. Repozytorium Uszko nie jest podłączone.

Na Windows zastosowano Node 24.18.0, pnpm 9.15.4 (Corepack) i poprawki junction/plików licencji. W pierwszym uruchomieniu embedded PostgreSQL utworzył bazę, ale start z dev runnera utknął; ręczny `pg_ctl` uruchomił ją poprawnie. Serwer został uruchomiony bezpośrednio z adresem tej lokalnej bazy, a Vite osobno. To procedura diagnostyczna, nie gotowy instalator. Sekret JWT w bieżącym procesie jest losowy i nietrwały, więc środowisko nie jest skonfigurowane do niezawodnego wznowienia sesji agentów.

Przed udostępnieniem innym osobom potrzebne są: tryb authenticated, konta, poprawna konfiguracja sekretów, bezpieczne środowiska agentów, sprawdzony kanał wspólny, uprawnienia i testy E2E. Próby logowania/modelu, ograniczenia API runnera i pominięte scenariusze opisano w audycie. Nie korzystać z tej instancji do produkcyjnych zadań.
