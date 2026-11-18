# T-AD — W5 mierzy produkt, nie język PC

**SHA:** (po commitcie) `team/tester/w12-td` z `141049a6a`

## Wynik
1. **EN na każdej ścieżce:** e2e, W5 (`sandbox-acceptance`), zrzuty, probe Rename: `--lang=en-US` + `LANG`/`LC_ALL=en-US` + seed `appSettings.language=en` (W5 też wybiera English w first-run).
2. **Lokatory W5 kont:** PL → EN (`Accounts for codex`, `Account label for Codex`, `Add account`, `Sign in`, `Default`, `Maximum number of accounts reached`, `Accounts`). Asercje nie rozluźnione; osobny przebieg PL = osobny task (nie tu).
3. **e2e `listRuns`:** **skrypt** (nie produkt). Pętla woła get/list bez argumentów; produkt poprawnie mówi „Choose a routine.” — dopisane do `needsInput` (BE-V zgodne).
4. **Probe Rename:** `scripts/sandbox-rename-probe.ts` z fixture Codex + GO gate; gotowy po GO lidera.

## Pliki
- `scripts/sandbox-acceptance.ts`
- `scripts/sandbox-e2e.ts`
- `scripts/sandbox-shots-w12.ts`
- `scripts/sandbox-rename-probe.ts` (nowy)
- `scripts/sandbox-e2e-needs-input.test.ts` (nowy)

## Nie sprawdzone
Electron / W5 / e2e / probe w oknie (bez GO; KAPI ma teraz ciężkie). Po GO: `COSGRAL_SANDBOX_ROOT=… node scripts/sandbox-rename-probe.ts` i ponowny W5.
