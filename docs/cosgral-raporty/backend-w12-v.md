# BE-V: diagnoza czerwonych kroków odbioru T-AC (18.11.2026)

Gałąź `team/backend/w12-v` z `141049a6a`. Źródło: `tester-w12-tac.md`, logi i dowody w `<Shared>/cosgral-sandbox/{e2e-tac-console.log,w5-tac/evidence}`. Nic nie uruchamiałem w Electronie; wnioski z logów, kodu i testów jednostkowych.

| Krok | Przyczyna | Czyje | Co zrobiono |
|---|---|---|---|
| e2e `ipc: every read-only call` (`channelRoutines.listRuns`) | Pętla `GETTER_SMOKE` wywołuje każdą metodę `get*/list*` bez argumentów (przez most okna długość funkcji to 0). Wywołanie bez `routineId` odpowiada poprawnym zdaniem walidacji „Choose a routine.”, a lista `needsInput` w `scripts/sandbox-e2e.ts` zna tylko „required / Expected an object / Choose an agent / Choose a server…”. Kontrakt i kanał działają dobrze: to samo robi każde `list*` wymagające obiektu. | **skrypt** (Tester) | Brak zmiany w silniku. Poprawka skryptu (1 linia): do `needsInput` w `scripts/sandbox-e2e.ts` dopisać `Choose a routine`. Pętla woła tylko `get*/list*`; z kanałów rutyn tylko `listRuns` wymaga argumentu (`list` bez wejścia odpowiada listą), więc inne zdania nie są potrzebne. |
| W5 E01 | Krok czyta tekst formularza przy adresie lokalnym i żąda braku fraz „another computer / not on this computer”. Formularz zawierał **stały napis** „Hosted services need an API key, and your messages go to another computer.” (wiersz presetów chmurowych, UI-AA/BE-Q) widoczny także przy adresie `127.0.0.1`. | **produkt** (mylący tekst) | Napis skrócony do „Hosted services need an API key.” (PL i EN). Ostrzeżenie o innym komputerze pokazuje się z adresu (`checkEndpointUrl`): dla `https://` spoza komputera „This server is not on this computer (host). Your messages and the key go to it.”, więc po wybraniu presetu chmurowego nadal jest. |
| W5 E02 | Kaskada z E01: punkt końcowy „Local LLM” nie został zapisany, więc nie ma przycisku „Check connection to Local LLM”. | kaskada | Znika razem z E01. |
| W5 E03, E06 | Kaskada z E01: `endpointId` puste, więc model `endpoint:/llama3:8b` jest nieważny („Invalid agent model”), a model punktu nie istnieje na liście. | kaskada | Znikają razem z E01. |
| W5 F02n | Agent odpowiedział „Stub: account system answered n1” z konta domyślnego, bez wstrzykniętego błędu. Konta z P01 (np. „Work”) nie powstały (P01/P02 padły na lokatorach PL, np. „Etykieta konta Codex”), więc `ids` z `accountList()` nie zawierało kont, którym skrypt ustawia `network: true`, i zdarzenie `account-error` nie mogło przyjść. Silnik: `account-router` 42/42 i `agent-service-accounts` 18/18 (w tym `network-error`) zielone. | **kaskada ze skryptu** (język/lokatory P01) | Brak zmiany w silniku. Do Testera: uruchamiać W5 z językiem `en`; po naprawie P01 sprawdzić F02n ponownie. |

**Czy to moje zmiany (presety dostawców, limit 16, wygląd)?** Nie dla E02/E03/E06/F02n. E01 miało przyczynę w napisie z UI-AA (7 przycisków presetów go nie spowodowało, tylko ten napis). Limit 16 i `appearance` nie występują w żadnym z logów.

## Testy po jednym pliku
`EndpointsSection.test` 8/8 (nowe asercje: brak „another computer” przy adresie lokalnym, ostrzeżenie „not on this computer” po wyborze presetu chmurowego), `i18n.test` 9/9, `ipc-channel-routines.test` 9/9, `account-router.test` 42/42, `agent-service-accounts.test` 18/18. Biome na zmienionych plikach czysty, `typecheck:renderer` EXIT 0.

## Luki
- E01 w oknie nie sprawdzone po poprawce (czeka na Electrona i GO).
- Poprawka e2e `needsInput` i język W5 to zmiany w skryptach Testera.
