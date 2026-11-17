# KK W11 (d): konektory Vault (1Password, Bitwarden) i narzędzia osoby

Data: 17.11.2026. Gałąź `team/kk/w11-vault-connectors` (od integracji `35665a2de`). Tylko testy jednostkowe na atrapach (fałszywe `op`/`bw`, fałszywy sejf, baza w pliku tymczasowym). **Żadnego prawdziwego konta, menedżera haseł, tokenu ani wywołania sieci.** `agent-service.ts` nietknięty.

## Wynik w jednej linii

**Gotowe: kontrakt + atrapa (osobny commit `8ce9e7081`), silnik 1Password i Bitwarden, narzędzia osoby (pokaż, kopiuj, import CSV, kody dwuetapowe, reset), IPC tylko lokalne. Proton Pass jest w kontrakcie, ale nie ma jeszcze sterownika: odpowiada stałą porażką. Nie podpięte do narzędzi agenta (szew niżej).**

## 1. Co robi (po ludzku)

1. **1Password, przez aplikację.** Program używa Twojej własnej sesji `op` jeden raz: tworzy sejf „Shared with COSGRAL” i konto usługowe, które może tylko czytać ten sejf. Zachowuje tylko token tego konta (zaszyfrowany, tylko do zapisu). Kilka kont i żadne nie wskazane: stan `choose-account`, nic nie zostaje utworzone.
2. **1Password, przez token.** Wklejasz token konta usługowego z 1Password.com; program sprawdza go odczytem. Token przekazywany jest `op` w środowisku (`OP_SERVICE_ACCOUNT_TOKEN`), nigdy w argumentach.
3. **Bitwarden.** Wklejasz klucz sesji z `bw unlock --raw`. Klucz żyje tylko w pamięci: po restarcie albo po 8 godzinach bez użycia sesja się kończy i łączysz ponownie. Agenci czytają tylko logowania z jednego folderu „Shared with COSGRAL” (dokładnie jeden taki folder), bez wpisów z ponownym pytaniem o hasło główne i bez usuniętych.
4. **Logowania dla strony.** Agent dostaje listę logowań (tytuł, użytkownik, czy jest kod) dla adresu strony; hasło i kod trafiają tylko do wbudowanej przeglądarki. Dopasowanie: tylko `https`, ten sam host albo jego poddomena, ten sam port (`example.test` pasuje do `login.example.test`, nie do `example.test.evil.test`).
5. **Narzędzia osoby w oknie Vault:** pokaż (jedyne miejsce, gdzie wartość opuszcza Vault, dla osoby, która o to prosi), kopiuj (schowek czyszczony po 30 s, tylko jeśli nadal trzyma ten sekret), import CSV (Bitwarden, 1Password, przeglądarki), bieżące kody dwuetapowe, reset całego Vault.

## 2. Nazwy, stany i błędy (z opisu 0.71, własnymi słowami)

| Co | Wartości |
|---|---|
| Konektory | `onepassword`, `bitwarden`, `protonpass` |
| Stany | `disconnected`, `connecting`, `choose-account`, `connected`, `failed` |
| Sposoby | `app`, `token`, `session-key`, `browser` |
| Narzędzie CLI | `checking`, `ready`, `missing`, `installing` (1Password wymaga `op` ≥ 2.18) |
| Kody błędów | `cli-missing`, `cli-signed-out`, `token-rejected`, `locked`, `folder-missing`, `plan`, `unknown`; każdy ma stałe zdanie, **nigdy tekst menedżera ani token** |
| Zdarzenie | `vault-connectors-changed` (cała lista) |
| Kanały | `vault-connectors:{list,status,check-setup,install-cli,open-app,connect,cancel,disconnect}`, `vault:{reveal,copy,import-csv,codes,reset}` |
| Okno | `window.openbot.vaultConnectors?` i `window.openbot.vaultSecrets?` |

## 3. Bezpieczeństwo (sprawdzone testami)

- Token / klucz sesji: nie ma go w żadnym statusie, zdarzeniu, błędzie ani w argumentach polecenia (test przeszukuje wszystko); baza trzyma tylko szyfrogram (`projection_vault_connectors`, to samo pudełko co Vault: DPAPI w programie).
- Błąd parsera nie powtarza wpisanego tekstu (test przez IPC).
- Błąd narzędzia to tylko rodzaj awarii: `runManagerCli` nie przekazuje stdout ani stderr dalej.
- `op` nie dziedziczy `OP_SERVICE_ACCOUNT_TOKEN`, `OP_CONNECT_*` z Twojego środowiska; `bw` dostaje krótką listę zmiennych.
- Wszystkie kanały odmawiają dla serwera innego niż `local`.
- Import CSV: tylko `https`, bez pustych haseł; inne hasło dla tej samej strony i użytkownika to osobny wpis (nic nie jest nadpisywane); ten sam plik drugi raz nic nie dodaje.

## 4. Pliki

- Kontrakt: `packages/contracts/src/ipc-vault-connectors.ts`, `vault-csv.ts`; kanały w `ipc-channels.ts`, zdarzenie w `ipc-conversation.ts`, pola w `ipc-desktop-apis.ts`, `ipc.ts` (po 1–3 linie).
- Atrapa i test: `src/renderer/stories/mock-vault-connectors.ts` (+ test, 16 w pliku razem z regułami kontraktu i parserem CSV); `mock-openbot.ts` (3 linie). UI używa atrapy od razu: `simulate.cli/accounts/refuseNext/lock/loginsChanged/clipboard/advance`.
- Silnik: `src/backend/vault-connectors/{common,onepassword-connector,bitwarden-connector,vault-connector-hub,vault-secrets-service,cli-runtime}.ts` (+ `vault-connectors.test.ts`, 20); `VaultStore.reset()` (8 linii).
- IPC: `src/main/vault-connectors-ipc.ts`; `src/main/index.ts` (~30 linii: import, zmienne, rejestracja, powołanie po moście Telegrama, `dispose()`); `local-only-ipc.test.ts` (kanały policzone, odmowy, parser bez echa).
- `src/preload/{index,vault-connectors-api}.ts`.

## 5. Szew dla Backendu (nie robiłem: `agent-service.ts`)

Narzędzia agenta (`vault-tools.ts`) czytają dziś tylko lokalny Vault. Silnik wystawia `VaultConnectorHub.sources(): ConnectorLoginSource[]` (połączone menedżery; `loginsFor(origin)`, `secretFor(id, origin, 'password' | 'otp')`). Wpięcie: `AgentService` powinien przekazać `() => vaultConnectorHub?.sources() ?? []` do `VaultTools`, a narzędzie „lista logowań dla strony” ma dołączyć wyniki z `loginsFor`, tak samo wpisanie hasła/kodu przez `secretFor`. To kilkanaście linii po stronie Backendu; do tego czasu agenci widzą konektory tylko jako stan w ustawieniach.

## 6. Czego NIE sprawdzono (uczciwie)

1. **Prawdziwe `op` i `bw`.** Kształty JSON (`op vault list`, `op item list --categories Login`, `op item get --otp/--fields label=password --reveal`, `op service-account create ... --raw`, `bw list folders/items`, `bw get totp`) pochodzą z opisu zachowania 0.71 i mojej wiedzy o tych narzędziach; testowane tylko na atrapie. Pierwszy prawdziwy test robi właściciel (konto testowe).
2. **1Password: zachowanie „autofill” (dokładna domena / nigdy).** CLI nie zwraca go w tym samym kształcie co SDK 0.71; używam „ta sama domena i poddomeny”. Rozważyć SDK, jeśli potrzeba reguł per adres.
3. **Pobieranie `op` (`installCli`):** w tym buildzie `canInstall: false` (brak własnej kopii narzędzia); przycisk „Pobierz” nie ma silnika. Bitwarden bez instalatora.
4. **Proton Pass:** tylko kontrakt i atrapa; silnik odpowiada stałą porażką `unknown`.
5. **Konektor w uruchomionym programie i okno w Electronie:** nie uruchamiałem Electrona (czekam na GO). Sprawdzone: typecheck:node, typecheck:renderer, Biome, testy jednostkowe (kontrakt, atrapa, silnik, IPC).
6. **Host-vault serwera dołączonego** (warianty `host*` z 0.71): poza zakresem (program lokalny).
7. **Dopasowanie `localhost`/portów/IP:** tylko `https` i nazwy z kropką; adresy IP i `localhost` są odrzucane przy imporcie.
