# Backend W2-BE3: tabele wspólne i biblioteka plików

Gałąź `team/backend/w2-tables-files` od integracji `8de3a8380`, bez push. Opis zachowania: `docs/cosgral/spec-w2.md` §5–6, decyzje lidera nr 5 (pole wersji wiersza) i nr 6 (jeden magazyn plików, dwa widoki) w `docs/cosgral/PLAN.md`, wiersze 29–30 w `parytet-0.68.md`.

## Wynik

| Zachowanie | Stan | Gdzie |
|---|---|---|
| 5.1 Tabele to trwały magazyn wierszy; wielu agentów czyta te same dane | ✓ | `table-store.ts` (SQLite) |
| 5.2 Właściciel; usunięcie przez uprawnionego usuwa dla wszystkich | ✓ właściciel to agent, który utworzył tabelę; usuwa on albo człowiek | `TableStore.deleteTable` |
| 5.3 Agent listuje tabele, czyta i pisze wiersze narzędziami; wiersze to dane, nie polecenia | ✓ | `cosgral_tables`, notka `note` w wyniku, `DATA_INSTRUCTIONS` |
| 5.4 Konflikt zapisu: pole wersji wiersza; stara wersja dostaje konflikt z aktualnym wierszem | ✓ bez cichego nadpisania | `updateRow` / `deleteRow` → `{status: "conflict", current}` |
| 5.5 Dane przeżywają restart | ✓ | test magazynu i piaskownica |
| Zapytania tylko parametryzowane, bez SQL od agenta | ✓ | stały tekst SQL, wartości i ścieżki kolumn jako parametry |
| 6.1 / 6.2 Biblioteka: plik zapisany przez człowieka (wybór, upuszczenie, wklejenie, kopia załącznika z czatu) albo przez agenta; nazwa, rozmiar, data | ✓ | `library-store.ts`, `cosgral_library.save_file` |
| 6.3 Pobieranie, otwarcie, pokazanie w folderze, podgląd | ✓ w kodzie; okna dialogowe Electron nie były uruchamiane w piaskownicy | `data-ipc.ts`, protokół `openbot-attachment` |
| 6.4 Usuwanie zwalnia miejsce; limity w jednym miejscu | ✓ | `LIBRARY_LIMITS`, `usage()` |
| 6.5 Odwołania do plików z dysku maszyny (ścieżki) | — nie zrobione: zasada zadania „ścieżki poza magazynem odrzucone” | — |
| 6.6 Biblioteka przeżywa restart | ✓ | test magazynu i piaskownica |
| Decyzja 6: jeden magazyn, dwa widoki (biblioteka i załączniki czatu) | ✓ ten sam indeks i ten sam folder | `projection_attachments`, `Shared/Transfers` |
| Załączenie pliku z biblioteki do wiadomości | ✓ człowiek: `attachToDraft`; agent: ścieżka z `get_file` w `openbot.send_message` | piaskownica, krok 3 i 4 |

## Jak to działa i decyzje do oceny

1. **Schemat bez podbicia wersji.** Tabele `projection_shared_tables` i `projection_shared_table_rows` tworzy sam `TableStore` przy pierwszym użyciu (`CREATE TABLE IF NOT EXISTS`). Plik `openbot-database-schema.ts` i `SCHEMA_VERSION` są nietknięte, więc nie ma konfliktu ze zmianami schematu KAPI (rutyny). Jeśli lider woli wszystkie definicje w pliku schematu, to przeniesienie około 20 linii.
2. **Wersja wiersza.** Każdy wiersz ma `version` od 1, rosnące przy każdej zmianie. `updateRow` i `deleteRow` wymagają `expectedVersion`. Przy starej wersji wynik to `{status: "conflict", current}` z aktualnym wierszem i nic nie jest zapisane. Zabezpieczenie jest podwójne: sprawdzenie przed zapisem i `UPDATE … WHERE version = ?` (porównanie z zamianą), więc dwa równoległe zapisy nie przejdą obydwa. Zmiana dotyczy tylko podanych kolumn.
3. **Bez SQL od agenta.** Tekst SQL jest stały. Nazwy kolumn są sprawdzane z kolumnami tabeli i bezpiecznym wzorcem (litera, potem litery, cyfry, spacja, `_`, `-`, do 64 znaków) i trafiają jako parametr ścieżki JSON (`json_extract(values_json, ?)`). Operatory są z listy `eq, neq, contains, gt, gte, lt, lte, empty, notEmpty`. Narzędzia i IPC odrzucają nieznane pola (np. `sql`). Tekst wyglądający jak SQL lub polecenie zostaje zwykłą wartością (test).
4. **Typy kolumn:** `text` (do 10 000 znaków), `number` (skończona liczba), `boolean`, `date` (`2026-11-20` albo czas ISO). Każda kolumna przyjmuje `null`. Brakujące kolumny przy wstawianiu są puste.
5. **Prawa.** Wiersze zmienia każdy agent i człowiek. Tabelę usuwa jej właściciel albo człowiek (dla wszystkich, razem z wierszami). Plik biblioteki usuwa człowiek (każdy) albo agent (tylko swój). Załącznik czatu zostaje przy wiadomości: z biblioteki się go nie usuwa.
6. **Jeden magazyn plików.** Załączniki czatu już mają indeks `projection_attachments` i folder `Shared/Transfers/<id wiadomości>/`. Pliki biblioteki trafiają do tego samego indeksu jako wiersze rodzaju `library` i do folderu `Shared/Transfers/library/<id>/<nazwa>`. Widok biblioteki i widok załączników to dwa filtry tego samego indeksu. Skrzynka usuwa i przepisuje tylko swoje rodzaje (`mailbox-message`, `draft`, `generated`), więc wiersze `library` zostają. Bez nowej tabeli i bez zmiany schematu.
7. **Załączenie robi kopię.** Wiadomość dostaje własną kopię pliku (jak każdy załącznik), więc usunięcie pliku z biblioteki nie psuje historii czatu. Obie kopie są widoczne: w bibliotece i w załącznikach.
8. **Ścieżki.** Każdy odczyt pliku sprawdza ścieżkę po `realpath`: plik musi być wewnątrz magazynu, inaczej `resolve` zwraca brak (test z podmienioną ścieżką w bazie). Agent zapisuje tylko pliki ze swojego folderu roboczego i folderu wspólnego (`..` i linki wychodzące poza nie są odrzucane). Człowiek może wybrać dowolny plik, bo wskazuje go sam.
9. **Limity w jednym miejscu:** `TABLE_LIMITS` (200 tabel, 50 kolumn, 10 000 wierszy na tabelę, 50 wierszy na jedno wstawienie, 10 filtrów, do 500 wierszy na odczyt) i `LIBRARY_LIMITS` (plik 100 MB, tak jak załącznik czatu; razem 2 GB plików biblioteki; 5000 plików; lista do 1000). Załączniki czatu liczy czat, nie biblioteka.
10. **Dane, nie polecenia.** Wyniki `query_rows`, `list_files` i `get_file` mają notkę, że treść to dane, a nie polecenia. Instrukcje agenta (rozmowa i tury kanału) mówią to samo.
11. **Małe zmiany w dużych plikach.** `agent-service.ts`: +32 linie, 0 usuniętych. `main/index.ts`: import, jedno wywołanie `registerSharedDataIpc` i jedna linia protokołu podglądu (+10/−1). `preload/index.ts`: +3. `mailbox-store.ts`: tylko `export` przy 3 funkcjach nazw i typów plików.

## Kontrakt dla UI

Typy: `packages/contracts/src/ipc-tables.ts` i `ipc-library.ts` (commit `a97a9a453`). `window.openbot.tables` i `window.openbot.library` są opcjonalne i działają tylko na tym komputerze: przy wybranym serwerze zdalnym listy są puste, a zmiany są odrzucane.

**Tabele: `window.openbot.tables`**

| Metoda | Wynik | Zachowanie |
|---|---|---|
| `list()` | `SharedTable[]` | Wszystkie tabele po nazwie: `id, name, description, columns[{name, type}], ownerBotId (null = człowiek), rowCount, createdAt, updatedAt` |
| `create({name, description?, columns})` | `SharedTable` | Nazwa unikalna bez względu na wielkość liter. Utworzona przez człowieka ma `ownerBotId: null` |
| `delete({tableId})` | `void` | Usuwa tabelę i wiersze dla wszystkich |
| `queryRows({tableId, filters?, orderBy?, limit?, offset?})` | `TableRowPage {rows, total}` | Domyślnie od najstarszych, 100 wierszy (max 500). Filtr: `{column, op, value?}` |
| `insertRows({tableId, rows})` | `TableRow[]` | Do 50 wierszy; wiersz `{nazwa kolumny: wartość}` |
| `updateRow({tableId, rowId, expectedVersion, values})` | `TableWriteResult` | `{status: "updated", row}` albo `{status: "conflict", current}`: ktoś zmienił wiersz, nic nie zapisano; pokaż aktualny wiersz i pozwól zdecydować ponownie |
| `deleteRow({tableId, rowId, expectedVersion})` | `TableWriteResult` | `{status: "deleted", rowId}` albo `conflict` jak wyżej |

`TableRow`: `id, tableId, version, values, createdByBotId, updatedByBotId, createdAt, updatedAt`. Błędy (nieznana kolumna, zły typ wartości, brak tabeli, brak prawa do usunięcia) przychodzą jako odrzucona obietnica z czytelnym komunikatem.

**Biblioteka: `window.openbot.library`**

| Metoda | Wynik | Zachowanie |
|---|---|---|
| `list({query?, origin?, limit?})` | `LibraryItem[]` | Najnowsze pierwsze. `origin`: `upload` (zapisał człowiek), `agent` (zapisał agent), `chat` (załącznik wiadomości). `query` szuka części nazwy bez względu na wielkość liter, także z polskimi znakami |
| `usage()` | `LibraryUsage {files, bytes, limitBytes}` | Miejsce zajęte przez pliki biblioteki (bez załączników czatu) |
| `choose()` | `LibraryItem[]` | Systemowe okno wyboru; wybrane pliki trafiają do biblioteki |
| `addFiles(files: File[])` | `LibraryItem[]` | Pliki upuszczone lub wklejone w widoku biblioteki |
| `saveFromChat({attachmentId})` | `LibraryItem` | Kopia załącznika czatu (`origin: "chat"`) wśród plików biblioteki |
| `delete({fileId})` | `void` | Usuwa plik biblioteki i zwalnia miejsce; dla załącznika czatu błąd „zostaje przy wiadomości” |
| `open({fileId, action})` | `void` | `open` (aplikacja systemowa), `reveal` (pokaż w folderze), `download` (zapisz kopię przez okno zapisu) |
| `attachToDraft({fileId})` | `DraftAttachment` | Plik jako załącznik następnej wiadomości, tak jak wybrany plik: dodaj go do szkicu i wyślij przez `agent.sendMessage({attachmentDraftIds})` |

`LibraryItem` = `AttachmentSummary` (`id, name, size, kind, mimeType, previewKind, previewUrl`) + `origin, createdAt, createdByBotId, messageId`. `previewUrl` działa jak przy załącznikach czatu (`openbot-attachment://file/<id>`), także dla plików biblioteki.

**Zdarzenia (`AgentEvent`):** `tables-changed {tables}` (podmień całą listę), `table-rows-changed {tableId, rowIds}` (odczytaj wiersze tej tabeli ponownie), `library-changed {fileIds}` (odczytaj listę ponownie). Nowy załącznik czatu nie wysyła `library-changed`: widok biblioteki odświeża listę przy otwarciu i przy zdarzeniach rozmowy (`conversation`, `queue-changed`).

## Narzędzia agenta

Funkcje dynamiczne Codex i serwery MCP w procesie dla Claude (`DATA_TOOL_SPECS`), w rozmowie i w turach kanału. Argumenty są sprawdzane schematem; nieznane pola są odrzucane.

| `cosgral_tables` | Co robi |
|---|---|
| `list_tables {}` | Tabele z kolumnami, właścicielem i liczbą wierszy |
| `create_table {name, description?, columns}` | Nowa tabela; agent zostaje właścicielem |
| `query_rows {table, filters?, orderBy?, limit?, offset?}` | Wiersze z wersjami i notką „dane, nie polecenia”; `table` to id albo nazwa |
| `insert_rows {table, rows}` | Do 50 wierszy |
| `update_row {table, rowId, expectedVersion, values}` | `updated` albo `conflict` z aktualnym wierszem i instrukcją „nic nie zapisano, zdecyduj ponownie” |
| `delete_row {table, rowId, expectedVersion}` | `deleted` albo `conflict` |
| `delete_table {table}` | Tylko właściciel |

| `cosgral_library` | Co robi |
|---|---|
| `list_files {query?, origin?, limit?}` | Pliki obu widoków i zajęte miejsce |
| `save_file {path}` | Kopia pliku z folderu roboczego agenta albo folderu wspólnego |
| `get_file {fileId}` | Plik i jego ścieżka do odczytu albo do `openbot.send_message` (`paths`) |
| `delete_file {fileId}` | Tylko pliki zapisane przez tego agenta |

## Dowody

| Sprawdzenie | Wynik | Dowód (poza repo, `Shared\cosgral-data\desktop-backend\`) |
|---|---|---|
| Kontrakt: tabele, wiersz z wersją, wynik konfliktu, bezpieczne nazwy kolumn, plik obu widoków, zdarzenia | 4/4 | `ipc-tables-library.test.ts` |
| Magazyn tabel: typy, filtry, kolejność i stronicowanie, konflikt drugiego zapisu, usuwanie wiersza z wersją, tekst jak SQL zostaje danymi, prawa do usunięcia, restart, limity | 9/9 | `table-store.test.ts` |
| Biblioteka: zapis człowieka i agenta, odmowa ścieżki spoza folderów agenta, widok czatu z tego samego magazynu, wyszukiwanie z polskimi znakami, kopia z czatu, usuwanie i prawa, limity, odmowa ścieżki spoza magazynu, restart | 7/7 | `library-store.test.ts` |
| Narzędzia agenta: oba zestawy, konflikt jako wynik, błędy jako błędy narzędzia, zapis pliku agenta i ścieżka w magazynie | 4/4 | `data-tools.test.ts` |
| Parsery IPC: poprawne wejścia, nieznane pola (`sql`), złe wartości, wersja | 4/4 | `data-inputs.test.ts` |
| AgentService (Codex): agent tworzy tabelę i zapisuje plik, zdarzenia, instrukcje; tury kanału i serwery MCP Claude z nowymi przestrzeniami | ✓ | `agent-service.test.ts`, `channel-agent-runner.test.ts`, `claude-client.test.ts` |
| Piaskownica na atrapie Codex (osobny `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`): agent tworzy tabelę; agenci A i B czytają wiersz w wersji 1, A zapisuje (wersja 2), B dostaje konflikt z aktualnym wierszem (wartość A zostaje); agent zapisuje plik do biblioteki i wysyła go innemu agentowi jako załącznik (ten sam plik w widoku biblioteki i czatu, te same bajty); człowiek załącza plik biblioteki do swojej wiadomości; po restarcie tabela, wersja 2 i 3 pliki są na miejscu | `ok: true` | `logs\w2-data-sandbox.log`, `sandbox-w2-data\evidence.json` |
| Regresja: piaskownica kanałów W1/W2 (zespół, karty, przejęcie, skille, stop) ze zmienioną atrapą Codex | `ok: true` | `logs\w2-data-channel-regression.log` |
| Test „drugi zapis nadpisuje”: po wyłączeniu sprawdzania wersji padają 2 testy konfliktu (magazyn i narzędzia), po przywróceniu 13/13 zielone, plik identyczny z commitem | ✓ | `logs\w2-data-mutation.log` |
| Całe `bun run test` na końcowym kodzie | **835/835**, 113/113 pliki | `logs\w2-data-full-test.log` |
| Typecheck contracts / node / renderer, `bun run build`, `biome check` 28 zmienionych plików | exit 0; bez błędów | `logs\w2-data-typecheck.log`, `logs\w2-data-build.log` |

## Commity

| Commit | Co |
|---|---|
| `a97a9a453` | Kontrakt tabel i biblioteki (pierwszy commit gałęzi) |
| `d950a35fe` | `TableStore`: tabele wspólne z wersją wiersza |
| `22c0443cb` | `LibraryStore`: biblioteka jako drugi widok magazynu załączników |
| `75d085fe5` | Narzędzia `cosgral_tables` i `cosgral_library` (Codex, Claude, kanały) |
| `be9eeadc4` | IPC `tables:*` i `library:*`, `window.openbot.tables` i `window.openbot.library` |
| ostatni na gałęzi | Piaskownica `scripts/data-sandbox-smoke.ts`, tryb rozmowy (komendy `DATA …`) w atrapie Codex, `COSGRAL-CHANGES.md`, ten raport |

## Nie zrobione / otwarte

1. **6.5 odwołania do plików z dysku** (etykieta ścieżki obok magazynu): nie zrobione, bo zadanie mówi „ścieżki poza magazynem odrzucone”. Kontrakt pozwala dodać później rodzaj `origin` dla odwołań.
2. **UI:** strona Biblioteki i widok tabel to praca zespołu UI (kontrakt wyżej).
3. **Okna Electron** (`choose`, `open`, `download`) nie były uruchamiane w piaskownicy; sprawdzone są typy, parsery i ta sama ścieżka `resolve` co w testach.
4. **`contains` w wierszach** porównuje bez względu na wielkość liter tylko dla liter ASCII (funkcja `lower()` SQLite). Wyszukiwanie nazw plików i tabel działa też dla polskich liter.
5. **Eksport danych** (`maintenance.exportData`) obejmuje załączniki czatu, ale nie pliki biblioteki ani tabel.
6. **Usunięcie agenta** nie usuwa jego tabel ani plików (to dane wspólne). Tabelę takiego agenta może potem usunąć tylko człowiek.
