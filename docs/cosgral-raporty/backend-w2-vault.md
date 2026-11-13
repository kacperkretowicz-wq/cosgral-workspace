# Backend W2-BE2 — lokalny Vault: loginy, karty, kontakty, klucze API, TOTP

Gałąź `team/backend/w2-vault` od integracji `08e8cbbe4`, bez push. Opis zachowania: `docs/cosgral/spec-w2.md` §3, lista funkcji wiersz 26, decyzja lidera W2-3 (tylko lokalny Vault na `safeStorage`, konektory w W3).

## Wynik

| Zachowanie (spec §3) | Stan | Gdzie |
|---|---|---|
| 3.1 Rodzaje: login, karta, kontakt, klucz API, TOTP; etykieta i wyszukiwanie; lista bez sekretów | ✓ | `vault-store.ts`, `VaultItemSummary` |
| 3.2 Szyfrowanie przez system (`safeStorage`, DPAPI); nic jawnie w bazie, logach, zdarzeniach | ✓ | `SecretBox`, `projection_vault_items` |
| 3.3 Agent używa bez ujawniania: wpisuje w przeglądarce, wynik mówi tylko, które pola wpisano | ✓ | `fill_login`, `fill_totp`, `fill_contact`, `fill_card` |
| 3.4 Prośba o brakującą pozycję (karta w Needs you), nic nie zmyśla | ✓ | `request_vault_item`, `vault-request` |
| 3.5 TOTP: klucz przy loginie, kod robi program (RFC 6238) | ✓ | `totp.ts`, `save_two_step_key` |
| 3.6 Konektory 1Password / Bitwarden / Proton | — W3 (decyzja lidera) | — |
| 3.7 Wiele dopasowań: wybiera człowiek | ✓ | `vault-request` w trybie `choose` |
| Karta płatnicza tylko po potwierdzeniu człowieka (zadanie lidera) | ✓ karta confirm | `fill_card` → `confirmAction` |
| Zapis klucza API do użytku przez narzędzia programu | ✓ | `save_api_key`, `VaultStore.resolveApiKey` |

## Jak to działa i decyzje do oceny

1. **Szyfrowanie:** wszystkie wartości pozycji to jeden zaszyfrowany blob (`SecretBox`, ten sam kształt co w MCP KAPI: `canEncrypt / encrypt / decrypt`). W bazie jest jeszcze podsumowanie bez sekretów: etykieta, strona, nazwa użytkownika, ostatnie 4 cyfry i data ważności karty, nazwa kontaktu lub klucza. E-mail, telefon i adres kontaktu są tylko w blobie. Bez szyfrowania systemowego zapis jest odrzucany, nie ma zapasu jawnym tekstem. Vault nic nie pisze do dziennika zdarzeń.
2. **Bez podglądu sekretu w UI:** nie ma API, które zwraca hasło, numer karty albo klucz, także dla człowieka. Edycja z pominiętym polem sekretu zostawia starą wartość. Strażnik `isVaultItemSummary` odrzuca podsumowanie z jakimkolwiek dodatkowym polem. Jeśli właściciel chce przycisk „pokaż hasło”, to osobna decyzja.
3. **Login tylko na swojej stronie:** login wpisuje się tylko na stronę o tym samym schemacie (http/https), porcie i domenie lub jej subdomenie. `bank.example` nie trafi na `evilbank.example` ani na `bank.example.evil.test`.
4. **Karta płatnicza:** przed wpisaniem pokazuje się karta confirm (Confirm / Edit / Cancel) z ostatnimi 4 cyframi i stroną. Wpisanie następuje tylko po Confirm, a Cancel nie zapisuje szkicu. Pełny numer nie pojawia się w karcie.
5. **Migawka strony (poprawka znalezionego błędu):** migawka przeglądarki brała `value` pola, gdy pole nie miało etykiety, więc pole hasła bez etykiety pokazałoby agentowi hasło. Teraz pola `type=password` i pola wpisane z Vault (atrybut `data-cosgral-secret`) nigdy nie pokazują wartości. Migawka podaje też `inputType`, żeby agent znalazł pola.
6. **Wpisywanie:** `BrowserHost.typeSecret` wysyła wartość przez debugger (`Input.insertText`), nie przez kod skryptu strony. Nie zwraca migawki i nie zmienia numeru rewizji. Przejęta przez człowieka karta przeglądarki blokuje też wpisywanie z Vault.
7. **Konstruktor `AgentService` bez zmian:** szyfrowanie przychodzi przez `useSecretBox()`, żeby nie zderzyć się z 9. parametrem `mcp` KAPI. Do czasu wywołania Vault nic nie zapisuje.
8. **Limity** w jednym miejscu: `VAULT_LIMITS` (m.in. 2000 pozycji, hasło 1024, klucz 8192). Numer karty jest sprawdzany algorytmem Luhna. Komunikaty błędów nigdy nie powtarzają wartości.

## Kontrakt dla UI

Typy: `packages/contracts/src/ipc-vault.ts` (commit `273a0db0c`). `window.openbot.vault` jest opcjonalne i działa tylko na tym komputerze.

| Metoda | Wynik | Zachowanie |
|---|---|---|
| `status()` | `VaultStatus` | `encryptionAvailable` (bez niego zapis jest niemożliwy), `items` |
| `list()` | `VaultItemSummary[]` | Najnowsze pierwsze, bez wartości sekretnych |
| `save(input)` | `VaultItemSummary` | Nowa pozycja (bez `id`) albo zmiana (`id`): pominięte pole sekretu zostaje; `twoStepKey: null` usuwa klucz 2FA. `kind` każdej pozycji z polami w `SaveVaultItemInput` |
| `delete({itemId})` | `void` | Usuwa pozycję |
| `respondToRequest({requestId, itemId \| decline})` | `void` | Odpowiedź na prośbę agenta: pozycja do użycia (zapisana teraz lub wybrana) albo odmowa |

Prośby agentów: `agent.listPendingRequests()` zwraca `{kind: "vault-request", request}`; to piąty typ w Needs you. `request.mode`: `add` (brakuje pozycji: pokaż formularz rodzaju `kind` z podpowiedzią `origin` / `label`, po zapisie odpowiedz jej `id`) albo `choose` (kilka pasuje: pokaż `candidateIds` i odpowiedz wybraną). Zdarzenia: `vault-changed {items}`, `vault-request {request}`, `vault-request-resolved {requestId, botId, resolution}` (`provided` / `declined` / `expired`). Prośba wygasa z turą agenta. Karta płatnicza przychodzi jako zwykła karta confirm (`draft-preview`, wariant `confirm`).

## Narzędzia agenta `cosgral_vault`

Funkcje dynamiczne Codex, serwer MCP w procesie dla Claude, także w turach kanału; instrukcje agenta mówią, żeby nigdy nie prosić o wklejenie sekretu do czatu.

| Narzędzie | Co robi |
|---|---|
| `list_vault_items {kind?, query?}` | Podsumowania bez sekretów |
| `request_vault_item {kind, reason, url?, name?}` | Karta w Needs you: człowiek dodaje pozycję; agent czeka |
| `fill_login {tabId, revision, usernameRef?, passwordRef?, itemId?}` | Wpisuje login dla strony karty; wiele dopasowań → wybór człowieka; obca strona → odmowa |
| `fill_totp {tabId, revision, ref, itemId?}` | Wpisuje aktualny kod 2FA |
| `fill_contact {tabId, revision, itemId, nameRef?, emailRef?, phoneRef?, addressRef?}` | Wpisuje dane kontaktu |
| `fill_card {tabId, revision, itemId, numberRef, expiryRef?, cvcRef?, holderRef?}` | Najpierw karta confirm, potem wpisanie |
| `save_api_key {name, value, label?}` | Zapis klucza podanego przez człowieka (nazwa jak `OPENAI_API_KEY`) |
| `save_login {url, username, password, label?}` | Zapis lub zmiana hasła dla tej samej strony i użytkownika |
| `save_two_step_key {itemId, setupKey}` | Klucz 2FA (surowy base32 albo `otpauth://totp/…`) przy loginie |

## Dowody

| Sprawdzenie | Wynik | Dowód (poza repo, `Shared\cosgral-data\desktop-backend\`) |
|---|---|---|
| TOTP na 18 wektorach RFC 6238 (SHA1, SHA256, SHA512) + base32 + `otpauth://` | 20/20 | `totp.test.ts` |
| Magazyn: każdy rodzaj, brak sekretów w liście i zdarzeniach, surowe pliki bazy (`openbot.db`, `-wal`) bez jawnych sekretów, odmowa bez szyfrowania, edycja zachowuje sekrety, dopasowanie stron, kody | 6/6 | `vault-store.test.ts` |
| Narzędzia: login tylko dla swojej strony, wybór przy wielu dopasowaniach, kod 2FA, karta tylko po Confirm, prośba add / decline / expire, zapis kluczy, brak sekretów w wynikach | 9/9 | `vault-tools.test.ts` |
| Test „login na obcą stronę”: po wyłączeniu zabezpieczenia pada, po przywróceniu zielony | ✓ | `vault-tools.test.ts` |
| Kontrakt, IPC, serwis agentów, tury kanału, Claude MCP | ✓ | `ipc-vault.test.ts`, `input-parsers.test.ts`, `agent-service.test.ts`, `channel-agent-runner.test.ts`, `claude-client.test.ts` |
| Całe `bun run test` na końcowym kodzie | **775/775**, 102/102 pliki | `logs\w2-vault-full-test.log` |
| Typecheck contracts / node / renderer, `bun run build`, `biome check` zmienionych plików | exit 0; bez błędów | `logs\w2-vault-typecheck.log`, `logs\w2-vault-build.log` |
| **Piaskownica w Electronie 43.4.0** (prawdziwa przeglądarka programu i `safeStorage`, osobne `USERPROFILE` / `APPDATA` / `LOCALAPPDATA`, lokalna strona testowa na loopback, atrapa Codex) | `ok: true`: agent wpisał login, hasło i kod 2FA z Vault, strona dostała właściwe wartości i zalogowała („Signed in as test-user”); w tym, co widział agent, nie ma hasła, klucza ani kodu (migawka pokazuje tylko etykiety pól); **0 plików** profilu testowego (baza, partycja przeglądarki, cache) zawiera hasło lub klucz 2FA jawnie (UTF-8 i UTF-16); po ponownym otwarciu bazy login jest i się odszyfrowuje; nie zostały procesy | `sandbox-w2-vault\evidence.json`, `logs\w2-vault-electron-smoke.log`, skrypt `scripts/vault-electron-smoke.ts` |

## Commity

| Commit | Zakres |
|---|---|
| `273a0db0c` | Kontrakt Vault (pierwszy commit; UI dostało informację w kanale) |
| `4af51b048` | TOTP (RFC 6238) i zaszyfrowany magazyn |
| `4ffe587f8` | Narzędzia `cosgral_vault`, karta confirm dla karty płatniczej, przeglądarka (`typeSecret`, migawka bez wartości haseł) |
| `f5f36d98e` | IPC `vault:*` na `safeStorage`, `window.openbot.vault` |
| ostatni commit gałęzi | Dowód w Electronie, ten raport, `COSGRAL-CHANGES.md` |

## Połączenie skilli z pamięcią (prośba lidera)

Sprawdziłem scalenie `08e8cbbe4`: `#buildDeveloperInstructions(bot)` podaje do `developerInstructions` skille (`installedFor`) i blok pamięci „essential”, w rozmowie 1:1 i przy wznowieniu. Tury kanału dostają skille przez opcję `instructions` runnera, a pamięci agenta nie dostają, zgodnie z izolacją kanału. Tabele pamięci, skilli i Vault powstają przez `CREATE TABLE IF NOT EXISTS` przy każdym starcie (`db.exec(SCHEMA_SQL)` idzie przed sprawdzeniem wersji), więc `SCHEMA_VERSION` 4 wystarcza; numer wersji uruchamia tylko jednorazowe migracje danych. Wszystko w porządku.

## Nie zrobione / otwarte

- Konektory 1Password / Bitwarden / Proton (W3, decyzja lidera).
- Użycie zapisanych kluczy API przez narzędzia: jest `VaultStore.resolveApiKey(name)` dla kodu programu (np. sekrety MCP KAPI albo rutyny), ale nic go jeszcze nie woła; klucze nie trafiają do zmiennych środowiska agentów.
- Prawdziwy Codex / Claude nie byli uruchamiani (atrapa). Kartę confirm przed kartą płatniczą sprawdza test jednostkowy; w piaskownicy był tylko login + 2FA.
- UI Vault nie ma jeszcze (lista, formularze, karta prośby w Needs you); atrapa `mock-openbot.ts` nie ma `vault.*`.
- Numer wersji schematu bazy bez zmian (tabela `projection_vault_items` przez `IF NOT EXISTS`); podbija lider przy scalaniu.
- Konflikty do przewidzenia przy scaleniu z MCP KAPI: lista narzędzi w turach kanału (`agent-service.ts`, KAPI naprawił tam zagnieżdżoną listę narzędzi przeglądarki), `claude-client.ts`, kontrakty `ipc-channels.ts` / `ipc-desktop-apis.ts` / `ipc-conversation.ts`. Wszystko dopisane obok, bez zmiany cudzych linii.
