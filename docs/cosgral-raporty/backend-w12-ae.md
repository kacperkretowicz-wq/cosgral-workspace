# BE-AE / Backend, poz. 12: Biblioteka, „pliki maszyny” (parytet 0.71, wiersz 45)

Gałąź `team/backend/w12-ae`, baza integracji `978195fbd`. Bez push. Bez Electrona.

## Co jest

Osoba wskazuje JEDEN folder komputera. Program pozwala przejrzeć ten folder i wskazać plik do skopiowania do
Biblioteki. Bez zgody (wskazania folderu) nic nie jest czytane.

| Zasada | Jak działa |
|---|---|
| Zgoda | folder wskazuje osoba; zgoda trwa do cofnięcia albo restartu programu (nie jest zapisywana na dysku) |
| Agent | domyślnie tylko osoba; agent wchodzi, jeśli jest na liście `botIds` tej zgody |
| Poza folderem | `..`, ścieżka bezwzględna, `C:`, `\\serwer`, znak NUL, link (junction) wskazujący na zewnątrz: odmowa `outside-folder` |
| Sekrety | `.env*`, klucze (`id_rsa`, `*.pem`, `*.key`, `*.pfx`, `*.kdbx`…), `.npmrc`, `Login Data`: nie są listowane ani czytane (`blocked-name`) |
| Zbyt szeroki folder | korzeń dysku, folder domowy, `AppData`, `Windows`, `Program Files`, `.ssh`, `.aws`…: odmowa przy wskazaniu |
| Limity | 10 folderów naraz, 500 wpisów w widoku (dalej `truncated`), głębokość 16, plik do `LIBRARY_LIMITS.fileBytes` |
| Kopiowanie | silnik tylko podaje zweryfikowaną ścieżkę (`resolveFile`); kopiuje istniejące `LibraryStore.addFiles` (z limitami biblioteki) |

## Pliki

- Kontrakt: `packages/contracts/src/ipc-machine-files.ts` (`MACHINE_FILES_LIMITS`, `MACHINE_FILE_REFUSALS`,
  `MachineFolderGrant`, `MachineFileEntry`, `MachineListing`, `MachineFileResolution`, `isBlockedMachineName`, walidatory).
  Eksport przez `ipc.ts`.
- Silnik: `src/backend/machine-files.ts` (`MachineFiles`: `grant`, `revoke`, `grants`, `list`, `resolveFile`).
- Testy: `src/backend/machine-files.test.ts` 14/14, `packages/contracts/src/ipc-machine-files.test.ts` 3/3.

## Testy i sprawdzenia

- `machine-files.test.ts` 14/14 (prawdziwe foldery tymczasowe, w tym junction wychodzący poza folder; sprawdziłem,
  że junction da się utworzyć na tej maszynie, więc test się nie pomija).
- `ipc-machine-files.test.ts` 3/3.
- Biome na 5 plikach czysty. `typecheck:contracts` i `typecheck:node` zielone.
- Nie sprawdzone: Electron i prawdziwe okno (brak GO).

## Notka IPC dla UI / KK (stan faktyczny)

Kontrakt i silnik są gotowe, ale **kanały IPC i okno wyboru folderu nie są jeszcze podpięte** (celowo: kolejka wymagała
kontraktu i testów jednego pliku, a w `main/index.ts` ma być minimum linii). Proponowany kształt dla UI:

- `machineFiles.grants()` → `MachineFolderGrant[]`
- `machineFiles.grant({ label?, botIds? })`: program otwiera systemowe okno wyboru folderu i zwraca `MachineFolderGrant`
- `machineFiles.revoke({ grantId })`
- `machineFiles.list({ grantId, relativePath? })` → `MachineListing` (przy `refused` pokaż zdanie wg `reason`)
- `machineFiles.importToLibrary({ grantId, relativePath })`: `resolveFile`, potem `LibraryStore.addFiles({ paths: [path] }, actor, { allowedRoots: [root] })`


## Luki

1. Brak kanałów IPC, okna wyboru folderu i podpięcia do `LibraryStore` (następny krok, mały: 1 plik `machine-files-ipc.ts`).
2. Zgoda nie przeżywa restartu (decyzja jak przy Computer Use). Jeśli właściciel chce trwałą zgodę, trzeba tabeli w bazie.
3. Brak miniatur i podglądu treści plików (parytet 45 zostaje „częściowo” do ekranu UI).
4. Reguły folderów blokowanych dotyczą Windows i typowych sekretów; nie ma listy konfigurowalnej.
