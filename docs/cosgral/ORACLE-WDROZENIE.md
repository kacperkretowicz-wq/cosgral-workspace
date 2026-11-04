# COSGRAL na Oracle — profil wdrożenia

Stan 4 XI 2026: konfiguracja przygotowana do uruchomienia, nieodebrana na Linuksie.
Nie istnieje jeszcze potwierdzona maszyna Oracle. Utworzenie konta, wybór zasobów
w bezpłatnym limicie i zgody należą do etapu provisioning. Nie przechodź na płatny
plan ani większą maszynę bez decyzji użytkownika.

## Układ

Jedna maszyna Ubuntu: natywna usługa Node + PostgreSQL na loopback + reverse proxy
HTTPS. Dzięki temu bwrap nie wymaga zagnieżdżania namespaces w kontenerze.
Usługa może podawać istniejący zbudowany interfejs (`SERVE_UI=true`). To pierwszy
wariant wdrożenia; oddzielenie UI na Netlify nadal wymaga osobnego odbioru origins,
cookies i WebSocketów. Nie wystawiaj `local_trusted` do internetu.

- Kod: `/opt/cosgral/app`, wybrany commit gałęzi `codex/cosgral-workspace`.
- Konto systemowe bez sudo: `cosgral`, HOME `/var/lib/cosgral`.
- Stan aplikacji, workspace'y, logowania właściciela i klucz szyfrowania:
  `/var/lib/cosgral`, bez `/tmp` i poza repozytorium.
- Baza: trwały PostgreSQL, osobna rola/baza `cosgral`, port 5432 tylko lokalnie.
- Konfiguracja: `/etc/cosgral/workspace.env`, właściciel root:cosgral, tryb 0640.
- Sekrety: niezależne losowe wartości auth/JWT/tool actions, zachowane po restarcie.
  Klucz szyfrowania `/var/lib/cosgral/secrets/master.key`, cosgral:cosgral, 0600.
- API: `127.0.0.1:3100`. Reverse proxy pod docelową domeną HTTPS z obsługą WebSocket.
  Docelowy adres publiczny musi odpowiadać `PAPERCLIP_PUBLIC_URL`.

## Przygotowanie maszyny

1. Zweryfikuj bieżący darmowy limit i dostępność maszyny w konsoli Oracle.
   Dla ARM potwierdź dystrybucje wszystkich potrzebnych CLI; działanie x64 na
   lokalnym Windowsie nie potwierdza ARM. Nie wyłączaj izolacji w celu zaliczenia.
2. Zainstaluj ze źródeł dystrybucji/vendorów: Git, PostgreSQL, Bubblewrap, narzędzia
   kompilacji wymagane przez Runnera oraz Node 24.18.0 i pnpm 9.15.4. Toolchain Rust
   określa `packages/paperclip-runner/rust-toolchain.toml`. Nie używaj konta root do
   pracy agentów. Zainstaluj wymagany Codex CLI z oficjalnej dystrybucji i sprawdź
   jego wersję jako użytkownik `cosgral`.
3. Pobierz repozytorium z autoryzacją właściciela. Nie umieszczaj tokenu w adresie
   remote. Nadaj użytkownikowi `cosgral` możliwość odczytu kodu i zapisu stanu.
4. W repozytorium wykonaj:

   ```sh
   pnpm install --frozen-lockfile
   pnpm --filter @paperclipai/plugin-sdk... build
   pnpm build
   bash scripts/prepare-server-ui-dist.sh
   ```

   Zapisz wszystkie błędy. Nie uruchamiaj usługi z niepełnym buildem. Komenda
   przygotowania UI kopiuje interfejs do `server/ui-dist`, wymaganego przez profil.
5. Utwórz bazę/rolę PostgreSQL i wypełnij `deploy/cosgral/workspace.env.example` na
   serwerze. Wygeneruj sekrety lokalnie i zapisz je bez wypisywania do chatu/logów.
   Klucz szyfrowania musi mieć 32 bajty (base64 lub hex). Zachowaj go wraz z backupem.
   Nie nadpisuj go przy aktualizacji. Placeholdery są odrzucane przez preflight.
6. W kontekście użytkownika `cosgral`, z konfiguracją usługi załadowaną do środowiska,
   wykonaj migracje istniejącym `pnpm db:migrate`. `DATABASE_URL` musi wskazywać
   docelową trwałą bazę. Wykonaj backup przed migracją istniejącej instancji.
7. Zainstaluj `deploy/cosgral/cosgral.service` w systemd. Sprawdź rzeczywistą ścieżkę
   Node (`/usr/bin/node`) i dostępność CLI w PATH usługi. Po `daemon-reload` uruchom
   usługę i odczytaj `journalctl -u cosgral`. Uruchomienie `enable` zapewnia start
   po restarcie hosta. Preflight blokuje błędną konfigurację i niesprawny bwrap.
   Preflight nie loguje wartości środowiska ani wyników poleceń CLI.
8. Zanim otworzysz dostęp, skonfiguruj reverse proxy HTTPS i ogranicz reguły sieci
   Oracle/Ubuntu. Publiczne mają być wyłącznie wymagane porty proxy, SSH ograniczone
   do uprawnionego operatora. Porty API, bazy i Inspectora pozostają niepubliczne.
   Pierwszy właściciel musi zostać ustanowiony przez istniejący onboard/board claim,
   zanim aplikacja zostanie udostępniona innym. Nie publikuj adresu claim w logach.

Preflight jest kontrolą tego profilu wdrożenia, nie zamiennikiem polityki
uprawnień Paperclip. Sonda bwrap sprawdza tworzenie namespaces, nie pełną izolację
workspace ani zdolność modelu do wywołania API. Odbiór pozostaje obowiązkowy.

## Odbiór przed codzienną pracą

- Health przez HTTPS i WebSocket; poprawne origins, cookies i logowanie.
- Oficjalne logowanie kont modeli na serwerze, bez kopiowania cudzych poświadczeń.
- Prywatne repo z formularza → autoryzacja → checkout → faktyczna zmiana agenta
  w worktree → przegląd wyniku. Nie scalaj produkcyjnych zmian jako testu.
- Approval A/B/C z pomiarem według `P0-PROFILOWANIE.md`; brak powtórzenia opóźnień
  i niezależny zapis dowodów. P0 pozostaje otwarte do ustalenia przyczyny i odbioru.
- Dwa konta: chat, konfiguracja agentów, Tabela, Workflow, reconnect i restart.
- Restart systemd i hosta: historia, zadania, workspace'y i sekrety pozostają.
- Backup PostgreSQL, stanu i klucza szyfrowania poza maszyną oraz próbne odtworzenie
  do oddzielnej bazy. Nie traktuj snapshotu dysku jako sprawdzonego odtworzenia.

Do tego czasu profil ma status przygotowany, a platforma nie jest odebrana do
niezawodnej pracy. Brak maszyny nie blokuje dalszych poprawek kodu lokalnie.
