# W6-BE5: logowanie agentów ACP w programie, presety Gemini i Antigravity, poprawki z przeglądu

**Następny krok dla lidera:** scalić `team/backend/w6-be4`, potem `team/backend/w6-be5`. UI Designer ma kontrakt i mock logowania w commicie `0dded7015` (presety są w `1159a3dd7`).

**Stan:** kontrakt, mock, silnik, IPC i testy jednostkowe gotowe. Bez Electrona i bez `sandbox:e2e`. **Prawdziwego logowania do Google nie dokończyłem** (to klik właściciela), więc ścieżka „kod zaakceptowany” jest sprawdzona tylko na atrapie. Merge integracji nie robiłem: BE4 nie był jeszcze scalony.

## 1. Commity (gałąź `team/backend/w6-be5`, baza `team/backend/w6-be4` @ `a141541d6`)

| Commit | Co |
|---|---|
| `0dded7015` | **kontrakt + mock** logowania ACP (osobny, pierwszy) |
| `8d020a6de` | silnik logowania, IPC, stan „Authentication required” |
| `1159a3dd7` | presety Gemini CLI i Antigravity, uruchamianie `.cmd` |
| `78ffbe0dd` | poprawki z przeglądu Testera: Stop → plan (L5) i restart planu |
| (raport) | ten plik i wpis w `COSGRAL-CHANGES.md` |

## 2. Co sprawdziłem na prawdziwych agentach (bez kończenia logowania)

Oba agenty uruchomiłem w osobnym folderze domowym (nie w Twoim profilu), tylko do `initialize`, do wypisania linku i do **błędnego** kodu. Żadnego prawdziwego konta nie zalogowałem.

| | Gemini CLI 0.68.0 | Antigravity `agy` 1.5.9 |
|---|---|---|
| Rozmowa po ACP | tak (`--acp` i `--experimental-acp`) | tak (`agy acp`) |
| Co zgłasza w `initialize` | „Log in with Google”, klucz API, Vertex AI, gateway | to samo, plus „Gemini Enterprise” i **metoda `terminal-login`** (`type: "terminal"`, argument `--login`) |
| Bez logowania | `session/new`: „Gemini API key is missing or not configured.” | „Authentication required” |
| Jak dostać **link** | ustaw `NO_BROWSER=true`: wypisuje link i „Enter the authorization code:” | `agy acp --login`: wypisuje „Open this link in a browser…” i czeka na kod |
| Przyjęcie kodu | kod idzie linią na stdin podczas `authenticate`. Zły kod: `invalid_grant` i **nowy link** | kod idzie linią na stdin. Zły kod: komunikat i wyjście 1 |
| Sukces | odpowiedź na `authenticate` | wyjście 0 |

Dwie niespodzianki, które zmieniły projekt:
1. **`agy` w trybie zwykłym odmawia** („No browser is available here… Run `agy acp --login`”), więc domyślna metoda to ta typu `terminal`.
2. **Bez zmiennej `SSH_CONNECTION` `agy --login` sam otwiera przeglądarkę** (widziałem nową kartę Chrome). Program ustawia ją, żeby agent tylko wypisał link, a przeglądarkę otwierało okno po kliknięciu.

## 3. Jak działa logowanie w programie

- **Przepływ:** Zaloguj → program uruchamia agenta, czyta metody → pokazuje **link** → osoba klika (okno otwiera go w domyślnej przeglądarce przez istniejące `openUrl`) → loguje się → strona pokazuje **kod** → osoba wkleja go w oknie → sukces albo błąd z powodem.
- **Fazy:** `idle`, `starting`, `code-required` (z `url`), `success`, `error`, `cancelled`.
- **Oferujemy tylko to, co program umie uruchomić:** metody `oauth-*` (link i kod) i `terminal`. Klucz API, Vertex AI, gateway i ADC są pominięte (to ustawienie i sekret, nie logowanie).
- **Domyślna metoda:** pierwsza typu `terminal`, inaczej pierwsza z listy.
- **Sekrety:** program **nie czyta** plików z logowaniem agenta (trzyma je sam CLI). Kod trafia tylko do działającego logowania, nie jest zapisywany ani w stanie, ani w zdarzeniach. W tym, co agent odpowiada, kod jest zastępowany `[code]`, a linki `[link]`.
- **Limity:** całe logowanie do 10 min, start agenta do 90 s (pierwszy start Gemini trwa ok. 20 s). Anuluj kończy od razu i zatrzymuje proces agenta. Zamknięcie programu i usunięcie agenta z Dostawców kończą logowanie.
- **„Authentication required” → karta:** klient ACP rozpoznaje to jako `needs-login` (też „API key is missing…”), **nie** przenosi tury na model zapasowy i ustawia `signedIn: false`, więc okno pokazuje kartę logowania zamiast błędu w rozmowie.
- **Kanały** `acp-login:list|start|submit-code|cancel` tylko lokalnie, dopisane do `local-only-ipc.test.ts`.

## 4. Presety w Dostawcach (punkt 2)

- `gemini --acp` i `agy acp`. Program szuka polecenia w PATH (z `PATHEXT` na Windows) i dodaje agenta **tylko**, gdy polecenie jest znalezione albo osoba poda je sama (pełna ścieżka istniejącego pliku albo nazwa z PATH). **Nic nie instaluje, nie uruchamia i nie otwiera strony instalacji**: okno pokazuje link (`installUrl`).
- **`.cmd` z npm:** Node nie uruchamia pliku `.cmd` bezpośrednio (`spawn EINVAL`, sprawdzone). Dodałem `spawnAcpAgent`: `.cmd` i `.bat` startują przez `cmd.exe` w formie, która zachowuje ścieżkę ze spacją (sprawdzone na atrapie w folderze ze spacją). Używa tego klient ACP i logowanie. Odmowa, gdy w ścieżce lub argumentach jest cudzysłów, `%` albo nowa linia.
- Kanały `acp-presets:list|add`, tylko lokalnie.

## 5. Poprawki z przeglądu Testera (punkt 3)

Numeracja w przeglądzie różni się od Twojego opisu: „restart planu” to w nim **L2**, a **L3** to załączniki w tekście po edycji.

| Pozycja | Co zrobiłem |
|---|---|
| **L5** Stop → plan | 2 testy na `AgentService`: zatwierdzony plan po Stop jest `stopped`, kroki zachowują postęp, agent jest bezczynny, planu nie da się zatwierdzić ani aktualizować; plan czekający na decyzję po Stop jest `expired`, a agent dostaje „nic nie zatwierdzono”. Zachowanie było poprawne, brakowało testu. |
| **L2** restart planu | test: po awarii plan otwarty jest zamykany przy starcie (proponowany → `expired`, zatwierdzony → `stopped`, ukończony zostaje), z zachowanym postępem, i nie da się go zatwierdzić. Komentarz w `ipc-plan.ts` mówił „plan zostaje po restarcie”: poprawiłem, że wraca tylko **historia**, nie otwarta karta. |
| **L3** załączniki w tekście po edycji | **tylko opis.** Pliki idą z edytowaną wiadomością, ale odwołania do załączników **w tekście** wskazują stare id. Propozycja: `#sendAgain` zwraca mapę stare id → nowe id (po `enqueue`) i przepisuje odwołania w nowym tekście; test na jednej ścieżce. |
| L1 | bez zmiany (Q8 świadome). Do odbioru: atrapa CLI, która zawsze woła `propose_plan` przy wielokroku. |
| L4 | decyzja lidera: stare snapshoty w dzienniku zdarzeń trzymają usunięty tekst do skasowania wątku. |
| L6 | jedna linia dla UI: **przypięcie działa na dowolnym wątku, ponów/edytuj/usuń tylko na widocznym.** |
| L7 | zablokowane na UI karty planu. |
| L8 | UI nie trzyma starego id po edycji (edycja daje nowe id, stare jest w `removedMessageIds`). Test „przypięcie → edycja” nadal wart dopisania. |

## 6. Wskazówki UI

**Logowanie ACP** (`window.openbot.acpLogin?`):
- `list()` zwraca `AcpLoginState[]` dla każdego agenta z Dostawców. Pola: `agentId`, `phase`, `message`, `url`, `methodId`, `methods[{ id, name, description, kind }]`, `signedIn`.
- `start({ agentId, methodId? })`, `submitCode({ agentId, code })`, `cancel({ agentId })`. Zdarzenie `acp-login-changed { state }`: podmień stan tego agenta.
- Przycisk „Zaloguj” przy agencie ACP w Dostawcach. Gdy `signedIn === false`, pokaż kartę „Authentication required. Sign in to use this agent.” z tym przyciskiem.
- W fazie `code-required`: pokaż `url` jako przycisk „Open sign-in page” (otwórz przez `openUrl`, tylko gdy `isSafeAcpLoginUrl(url)`) i pole na kod. Po wysłaniu faza wraca do `starting` („Checking the code…”). U Gemini zły kod wraca do `code-required` z **nowym** `url`. U `agy` zły kod kończy się `error`: pokaż „Sign in again”.
- `methods` jest puste do pierwszego startu. Gdy agent nie ma metod, które program umie uruchomić, `phase` to `error` z wyjaśnieniem.
- Nie wyświetlaj wpisanego kodu nigdzie poza polem.

**Presety** (`window.openbot.acpPresets?`):
- `list()` zwraca `{ id, name, command, args, installUrl, detectedCommand, added }`. `detectedCommand: null` oznacza „nie znaleziono”: pokaż link `installUrl` i pole na ścieżkę polecenia.
- `add({ presetId, command? })` zwraca `AcpAgentConfig`. Bez `command` wymaga `detectedCommand`.

## 7. Czego NIE sprawdziłem

- **Prawdziwego logowania do końca.** Żaden kod z Google nie został wpisany. Nie wiem, czy Google zaakceptuje Twoje konto w obu CLI ani czy `authenticate` Gemini kończy się sukcesem po prawdziwym kodzie (sprawdziłem wysłanie kodu i reakcję na zły kod). `login-agy.cmd` w folderze sondowania czeka na Twój klik.
- **Tury po zalogowaniu** i działania narzędzi COSGRAL (most MCP) w `agy` i `gemini`.
- **`SSH_CONNECTION`** to obejście: sprawdziłem tylko na `agy` 1.5.9. Inna wersja może zachować się inaczej.
- **`.cmd` na prawdziwym npm-owym `gemini.cmd`:** sprawdzone na atrapie w folderze ze spacją, nie na prawdziwej instalacji.
- **Okno:** nie ma karty logowania ani przycisku presetów (zadanie UI).
- **Logout** nie jest zrobiony (agy zgłasza `auth.logout`, można dodać).
- **Pełny `bun run test`:** uruchomiłem 95 powiązanych plików, 743 z 743 zielone. Lint i 5 typecheck-ów zielone.

## 8. Poza repo (do skasowania po „zalogowane”)

`Shared\cosgral-sandbox`: `gemini-probe` i `agy-probe` (zostawione zgodnie z poleceniem) oraz moje skrypty sond `probe-nobrowser.mjs`, `probe-terminal-login.mjs`, `probe-terminal-login-nossh.mjs`, `probe-gemini-code.mjs`, `probe-flags.mjs`, `dump-auth.mjs` i folder `shim test`. Nie zawierają Twoich danych logowania (żadne logowanie nie zostało dokończone).
