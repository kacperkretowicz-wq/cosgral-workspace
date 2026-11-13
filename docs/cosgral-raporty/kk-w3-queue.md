# W3-KK3: kolejka wiadomości i zatwierdzenia „zawsze” (wiersze 17 i 11)

Gałąź `team/kk/w3-queue` (z `codex/cosgral-desktop` @ `ac79c430b`), worktree `Shared\cosgral-wt\desktop-kk`. Bez push.

**Stan: oba kroki zrobione, z testami i zielonym typecheckiem. Nie uruchamiałem programu ani nie oglądałem ekranów (zob. „Czego nie sprawdzono”).**

| Krok | Co | Commit |
|---|---|---|
| 1. Kolejka wiadomości | steer zależny od dostawcy, test restartu, powód w panelu | `33752c956` |
| 2a. Zatwierdzenia „zawsze”, silnik | kontrakt, reguły, magazyn, IPC, telefon | `d8f8eda43` |
| 2b. Zatwierdzenia „zawsze”, ekran | przycisk na karcie zgody, lista reguł w ustawieniach agenta | `2221beb09` |

## Krok 1: kolejka wiadomości (wiersz 17): co już było, co dodałem

**Najpierw sprawdziłem kod bazy.** OpenBot 0.1.11 ma już prawie wszystko: kolejka FIFO na agenta w `mailbox-store.ts` (SQLite), edycja oczekującej wiadomości (kopia przy zapisie, z załącznikami), usuwanie, zmiana kolejności, pauza i wznowienie, `turn/steer`, zdarzenie `queue-changed`, `QueuePanel` nad polem wiadomości (przeciąganie, Alt+↑/↓, edycja, usuń, Steer) i uzgadnianie po restarcie (`#reconcileUnresolvedDeliveries`). Niczego z tego nie przepisywałem.

**Luki, które znalazłem i uzupełniłem:**

1. **Steer dla agentów ACP.** `turn/steer` jest w kliencie Codex App Server (`agent-service.ts`) i Claude (`claude-client.ts`, `#steerTurn`). Adapter ACP (`acp-client.ts`) go nie ma. Przycisk Steer był jednak aktywny i kończył się surowym błędem „The ACP adapter does not implement turn/steer.”.
   - Kontrakt: `QueueSnapshot.steer?: { available, reason }` (opcjonalne, brak = dostępne).
   - Silnik: `queue-steer.ts` (`steerSupport(provider)`), `listQueue` i `queue-changed` niosą to pole; `steerQueuedMessage` odrzuca ACP od razu czytelnym zdaniem („niedostępne”).
   - Panel: przycisk Steer wyłączony, z powodem w `title` i w podpowiedzi.
2. **Restart.** Parytet mówił „nie sprawdzone”. Dodałem test `queue-restart.test.ts` na prawdziwym magazynie: po restarcie wiadomość „w toku” jest tylko „nieuzgodniona” i **nic nowego nie startuje, dopóki nie zostanie uzgodniona** (żaden drugi obrót obok możliwego trwającego); po uzgodnieniu idą kolejne **w kolejności, każda raz**, bez dubli; pauza przeżywa restart.

**Czego nie zmieniałem:** wiadomość, która w chwili awarii była w toku, po restarcie nie jest powtarzana (silnik wybiera „nigdy nie powtarzaj niepewnych skutków ubocznych”). To decyzja bazy, którą zostawiam.

## Krok 2: zatwierdzenia „zawsze” (wiersz 11)

Karta zgody ma teraz obok „Reject” i „Approve” (= zezwól raz) przycisk **„Always allow…”**. Zapisuje regułę dla **tego agenta** i **tego rodzaju** prośby; kolejna pasująca prośba przechodzi bez karty.

### Reguły są wąskie z założenia

| Rodzaj | Kiedy reguła pasuje |
|---|---|
| Komenda | Komenda zaczyna się od zapisanych słów (cała słowa, nie pół słowa). Komenda, która łączy lub przekierowuje (`; & \| < > `` ` ``, `$(`, `${`, nowa linia), **nigdy** nie pasuje, więc „git status” nie zezwala na „git status; rm -r x”. |
| Zmiana plików | Prośba podaje folder (`grantRoot`, w razie braku `cwd`) i leży on w zapisanym folderze. Prośba bez folderu nie pasuje nigdy. |
| Uprawnienia | Każdy folder do odczytu lub zapisu leży w zapisanym folderze; zapis wymaga reguły „write”; **sieć nigdy nie jest objęta**. |

Dodatkowo: nie da się zapisać gołej powłoki ani interpretera (`powershell`, `cmd`, `bash`, `python`, `node`, `curl` …), jednego luźnego słowa (trzeba co najmniej dwóch słów albo całej komendy), prefiksu urwanego w cudzysłowie, ani całego dysku jako folderu. Domyślnie reguła komendy to **cała komenda**; osoba może skrócić do wcześniejszych słów.

### Czego reguły nigdy nie obejmują

Computer Use, Vault, płatności, parowanie Mobile Connect, przejęcie przeglądarki, oczy agenta (ekran i kamera). To inne karty (confirm, vault-request, takeover, `resolve` oczu), które w ogóle nie pytają o reguły. Reguły działają tylko na trzy prośby samego dostawcy (komenda, zmiana plików, uprawnienia). Test pilnuje, że typ reguły ma tylko te trzy rodzaje i że `screen`/`camera` nie da się zapisać.

### Telefon

Telefon **nie tworzy i nie czyta reguł**: jego odpowiedź na zgodę nie niesie `always` (test: dodatkowe pole jest ignorowane), a ścieżki `/v1/approval-rules…` dają 403 (`approval-rules` w `MOBILE_COMPUTER_ONLY`). Serwery zdalne też tylko `accept/decline`.

### Bezpieczeństwo po stronie silnika

Reguła powstaje **wyłącznie z otwartej karty**, przy odpowiedzi „Allow”, a zakres wybrany w oknie jest sprawdzany względem tej karty (nie można zapisać reguły dla czegoś, o co nie pytano). Odrzucona reguła **zostawia kartę otwartą** i niczego nie odpowiada. Gdy magazyn reguł nie jest podpięty, „Always” jest odrzucane, a zwykłe „Allow” działa.

## Kontrakt dla UI

Plik `packages/contracts/src/ipc-approval-rules.ts`.

- **Kolejka:** `QueueSnapshot.steer?: { available: boolean; reason: string | null }`. Gdy `available: false`, wyłącz Steer i pokaż `reason`. Reszta (`listQueue`, `cancelQueuedMessage`, `updateQueuedMessage`, `reorderQueue`, `steerQueuedMessage`, `queue-changed`) bez zmian.
- **Zgoda z „zawsze”:** `window.openbot.agent.respondToApproval({ requestId, decision: "accept", always?: { prefix?, folder?, access? } })`. `always` tylko z `accept` (inaczej błąd). Pusty `{}` = domyślne (cała komenda, folder z prośby, dla uprawnień wspólny folder). Błąd silnika (np. „Keep at least two words…”) wraca jako odrzucenie obietnicy, karta zostaje.
- **Lista i cofanie:** `window.openbot.approvalRules?.list(botId?)` i `.revoke({ ruleId })` (zwraca pozostałe). Zdarzenie `approval-rules-changed { rules }` (cała lista; przy zapisie, użyciu i cofnięciu). `ApprovalRule`: `kind` (`command` + `prefix`, `file-change` + `folder`, `permissions` + `folder` + `access`), `uses`, `lastUsedAt`. `describeApprovalRule(rule)` daje jedną linię do listy; `APPROVAL_RULES_NEVER_COVER` to tekst „czego nie obejmuje”.
- **Ekran (zrobiony, minimalny):** `AlwaysAllowPanel` (na karcie: wybór słów komendy, folder przy zmianach plików; powód, gdy nie można; ukryty dla oczu agenta), `ApprovalRulesSettings` (lista z „Remove” w ustawieniach agenta, pod `AgentSettingsW3`).

## Pliki

Nowe: `ipc-approval-rules.ts`, `approval-rules.ts` (+ test), `queue-steer.ts`, `queue-restart.test.ts`, `main/approval-rules-ipc.ts`, `main/ipc/approval-rules-inputs.ts` (+ test), `preload/approval-rules-api.ts`, `renderer/always-allow.ts`, `AlwaysAllowPanel.tsx`, `ApprovalRulesSettings.tsx`, `ApprovalRulesW3.test.tsx`. Wspólne pliki (tylko dodatki, poza jednym wyjątkiem niżej): `agent-service.ts`, `main/index.ts` (+1 import, +10 linii, +1 rejestracja), `preload/index.ts` (+2), `ipc-*.ts` (kontrakty, kanały, zdarzenie), `App.tsx`, `Conversation.tsx`, `ConversationPrompts.tsx`, `StickyDecision.tsx` (`div role=region` zamieniony na `section`, bo lint a11y; to ta sama rola), `cosgral.css`, testy telefonu i `agent-service.test.ts`.

**Jedna zmiana istniejącego kodu, nie dodatek:** w `respondToApproval` wydzieliłem budowanie odpowiedzi do `#answerProviderApproval` (to samo zachowanie, wywoływane z dwóch miejsc: odpowiedź osoby i auto-zezwolenie).

## Sprawdzone

- Testy po jednym pliku: `queue-restart.test.ts` 4/4, `QueuePanel.test.tsx` 5/5, `approval-rules.test.ts` 19/19, `approval-rules-inputs.test.ts` 5/5, `ApprovalRulesW3.test.tsx` 13/13, `mobile-phone-api.test.ts` 10/10, `ipc-mobile-phone.test.ts` 4/4, `StickyDecision.test.tsx` 3/3, `ConversationPrompts.test.tsx` 2/2, `ConversationPrompts.eyes.test.tsx` 5/5.
- `agent-service.test.ts` **tylko** trzy nowe testy (`-t "W3-KK3"`): 3/3 na prawdziwym `AgentService` z atrapą Codex: „Always allow” odpowiada od razu i zapisuje regułę, następna pasująca komenda nie otwiera karty, a inna komenda i komenda z `;` nadal pytają; odrzucona reguła zostawia kartę otwartą; bez magazynu „Always” jest odrzucane.
- `typecheck:node` kod 0, `typecheck:renderer` kod 0, `biome check` na 27 zmienionych plikach: 0 błędów.
- Skan prywatności zmienionych plików: czysto.

## Czego nie sprawdzono

1. **Nie uruchomiłem programu ani nie oglądałem ekranów.** Wygląd panelu „Always allow”, listy reguł i wyłączonego Steera (jasny i ciemny motyw) nie był oglądany. Dla kart i listy nie ma historii Storybooka.
2. **Reguły na prawdziwym Codexie lub Claude.** Test używa atrapy, która wysyła prośbę `item/commandExecution/requestApproval` z polem `command`. Nie wiem, w jakiej postaci prawdziwy Codex przysyła `command` (jako cała linia powłoki z opakowaniem?). Jeśli komenda przychodzi jako `powershell.exe -Command "git status"`, domyślna reguła (cała komenda) zadziała, ale skrócenie do „git status” nie pasuje do opakowania, a komenda z `;` w cudzysłowie nie pasuje nigdy (zbyt ostrożnie, nie za luźno). Do sprawdzenia na prawdziwym przebiegu.
3. **Zmiana plików i uprawnienia.** Dla zmiany plików reguła pasuje tylko, gdy prośba podaje `grantRoot` lub `cwd`; Codex w `item/fileChange/requestApproval` często nie podaje żadnego, wtedy „Always allow” się nie pojawi (zostanie powód). Nie wiem, jak często to się zdarza w praktyce. Uprawnienia: wspólny folder wyliczam z podanych ścieżek; ścieżki względne lub różne dyski dają odmowę z komunikatem.
4. **Steer na prawdziwym Codexie i Claude** w trakcie pracy: kod jest bazowy, nie uruchamiałem go. Test steera istnieje w `agent-service.test.ts` (baza), jego nie powtarzałem.
5. **Pełne `agent-service.test.ts`, `bun run test`, budowa i Playwright** nie były uruchamiane (polecenie lidera). Nie wiem, czy refaktor `respondToApproval` nic nie zmienia w pozostałych 61 testach tego pliku; sprawdziłem tylko pięć powiązanych z kartami (`StickyDecision`, `ConversationPrompts` ×2, nowe trzy).
6. **Zdalny serwer (OpenBot zespołu):** „Always allow” wysłane do zdalnego serwera jest tam ignorowane (jego API zna tylko `accept/decline`), więc karta zostanie zatwierdzona raz, bez reguły. UI nie rozróżnia tego przypadku.
7. **Reguły a wiele okien lub restart w trakcie karty:** reguła zapisuje się od razu do pliku `approval-rules.json` (atomowo); nie sprawdzałem współbieżnych zapisów z dwóch okien.
8. **Okno i kolejka w UI po restarcie** nie były oglądane, tylko magazyn pod spodem.
