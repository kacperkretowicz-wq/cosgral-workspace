# Odbiór W6 — skrypt w oknie (wątki, kontekst, plan/akcje, osobne okno)

**Stan: 16.11.2026. Autor: Tester (W6-T2).** Tylko dokument. Integracja odniesienia: `codex/cosgral-desktop` @ `46f59a4ad`. Kryteria z `docs/cosgral/spec-w6.md` §2 (W01–W42). Bramka G3 w `luki-070.txt`.

## Na górze

- **Cel:** przebieg W6 w prawdziwym Electronie (piaskownica COSGRAL), atrapa Codex tam gdzie da się; bez zawyżania parytetu przed zielonym oknem.
- **Podział:** **KK** = kroki E w `sandbox:e2e` / `scripts/sandbox-acceptance.ts` (lub `COSGRAL_MODE=w6` gdy powstanie). **Właściciel** = W39–W42 + prawdziwy kontekst Claude.
- **Kontekst Claude / ACP:** wskaźnik = `source: unavailable` **bez liczb i bez paska %** (`kk-w6-be2.md`, `ui-w6-ui2.md`). Codex = `reported` z liczbami. Nie wymagać % na Claude.
- **Blokada T2:** nie uruchamiałem okna; ten plik = checklista dla KK / właściciela.

---

## 0. Przygotowanie (KK)

1. PATH: `Shared\tools\bun`, `node`, `git\cmd`.
2. Worktree integracji; `bun install` jeśli trzeba.
3. Piaskownica: osobne `USERPROFILE` / `APPDATA` / `LOCALAPPDATA` (jak W3/W5); **nie** ruszać profilu OpenBot właściciela.
4. Atrapa Codex (jak `sandbox-acceptance` / e2e). Claude CLI opcjonalnie tylko do kroku „unavailable”.
5. Przed startem: `sandbox:e2e` zielone na tej integracji (lider/KK).
6. Po UI1: karty Needs you mogą mieć **nazwę wątku** w etykiecie — selektory nie mogą wymagać wyłącznie starego „Assistant, …” bez wątku (nota lidera P07 / UI1-FIX).

---

## 1. Wątki — W01–W10 (KK, atrapa)

| ID | Krok w oknie | Pass gdy | Fail gdy |
|---|---|---|---|
| W01 | Menu / panel → Nowy wątek | Pusty wątek aktywny; stary na liście z historią | Stary skasowany; historie pomieszane |
| W02 | Utwórz 2. wątek; otwórz listę | ≥2 wątki jednego agenta; brak wątków innego | Lista miesza agentów |
| W03 | Przełącz A↔B; restart programu | Historia = aktywny; po restarcie ten sam aktywny | Doklejanie odpowiedzi między wątkami |
| W04 | W A: karta Needs you + pozycja w kolejce; przełącz na B; wróć do A | Karty/kolejka A wracają; B bez kart A | Karty przeniesione do B |
| W05 | Zmień tytuł wątku; restart | Tytuł ten sam | Reset tytułu |
| W06 | Archiwizuj; spróbuj wysłać; przywróć | Brak na domyślnej liście; brak wysyłki; restore OK | Trwałe skasowanie bez confirm |
| W07 | Dwa wątki, różne historie; restart | Obie historie na miejscu | Scalenie historii |
| W08 | Wspomnienie „Always” w A; otwórz B | Wspomnienie widać w B; historia A nie jest kontekstem B | Wyciek pełnej historii A do B |
| W09 | Menu wiersza agenta | Jest „Nowy wątek” (lub równoważna akcja widoczna) | Brak wejścia do wątków |
| W10 | Tura w toku w A; przełącz na B | A dokańcza w tle; B czytelny; wiersz pokazuje workingThread / background | Wiszące Thinking; zgubiona tura A |

**Dowód:** zrzut / log acceptance; 0 błędów konsoli blokujących.

---

## 2. Kontekst — W11–W16 (KK + jedna ścieżka Claude)

| ID | Krok | Pass gdy | Uwagi |
|---|---|---|---|
| W11 | Codex, rozmowa z historią | Wskaźnik widoczny przy polu; `reported` z % gdy CLI poda | Tylko Codex |
| W12 | Agent Claude **lub** ACP | Stan **unavailable** + czytelny powód; **bez** % / paska postępu | Kryterium zlecenia T2 |
| W13 | Codex: Compact (gdy `canCompact`) | Stan compacting → rosnący licznik / lastCompacted; bez cichego znikania historii z UI bez śladu | |
| W14 | Usuń historię wątku (jeśli UI/akcja jest) | Confirm; wiadomości wątku puste; pamięć agenta zostaje | Jeśli UI jeszcze nie ma — oznacz **blocked UI**, nie fail silnika |
| W15 | Po W13: restart | Wskaźnik / stan po kompakcie wraca (lub stale do nowego raportu) | |
| W16 | Auto-kompakt włączony w ustawieniach (próg 50–95, domyślnie 90) | Po zbliżeniu do limitu (Codex) widać, że skrócono; nie ukrywać faktu | Nie wymuszać na Claude |

**Podział:** W11, W13–W16 = KK na atrapie Codex. **W12 = KK** (przełączenie modelu na Claude/ACP atrapa wystarczy; nie trzeba prawdziwego logowania).

---

## 3. Plan i akcje — W17–W22, W29–W35 (KK gdy UI gotowe)

Silnik BE3 jest w integracji; **karta planu i menu akcji w UI mogą jeszcze nie być** — wtedy KK zapisuje „blocked: brak UI” i nie oznacza fail G3 za sam brak ekranu, dopóki lider nie scalí UI.

| ID | Krok | Pass |
|---|---|---|
| W17–W22 | Atrapa narzędziowa planu | Karta z ≥2 krokami; Approve startuje; Reject bez skutków; Stop kończy; pusty plan odrzucony |
| W29 | Kopiuj wiadomość | Schowek = tekst |
| W30 | Ponów | Nowa odpowiedź; stara zostaje (decyzja Q12) |
| W31 | Edytuj swoją + wyślij | Confirm gdy są odpowiedzi poniżej; treść zmieniona |
| W32 | Rozgałęź | Nowy wątek z linkiem do rodzica; oryginał nietknięty |
| W33 | Usuń | Confirm; znika z UI |
| W34 | Przypnij; restart | Przypięcie wraca |
| W35 | Akcja przy turze w toku | Odmowa lub bezpieczne zachowanie; kolejka nie psuje się |

**Subagenci W23–W28:** poza minimalnym odbiorze T2 jeśli UI panelu brak — checklista osobna po UI; nie blokuj wątków/kontekstu.

---

## 4. Osobne okno — W36–W38 (KK)

| ID | Krok | Pass |
|---|---|---|
| W36 | Menu → osobne okno | Pełna rozmowa tego wątku (nie dok) |
| W37 | Napisz w osobnym; sprawdź główne | Ta sama historia / jedno źródło |
| W38 | Zamknij osobne przy turze | Wątek i tura żyją |

Źródło: `kk-w6-kk3.md` (silnik+kontrakt); wymaga kroku E w oknie.

---

## 5. Właściciel — W39–W42 (G3)

| ID | Krok | Kto |
|---|---|---|
| W39 | Prawdziwy Codex lub Claude: 2 wątki, przełączanie, osobne historie | Właściciel (+ Tester przy odbiorze) |
| W40 | Długa rozmowa na **Codex**: wskaźnik % rośnie; na **Claude**: unavailable bez liczb (nie fail) | Właściciel |
| W41 | Wielokrokowe zlecenie → karta planu → Approve/Reject na żywym modelu | Właściciel |
| W42 | Werdykt G3: brak błędów **blokujących**; lista usterek w raporcie | Lider + właściciel |

**Zasady właściciela:** żadnych haseł w czacie/repo; agenci nie logują się sami; skan prywatności przed push (ścieżki profilu).

---

## 6. Mapowanie ról

| Rola | Kroki |
|---|---|
| **KK (sandbox)** | §0, W01–W16 (W12 na atrapie Claude/ACP), W36–W38 gdy UI; W17–W35 gdy UI planu/akcji scalone; log + 0 console errors |
| **UI Designer** | Gdy fail selektora Needs you / brak menu akcji — fix UI, nie osłabiać asercji |
| **Backend** | Fail silnika (kolejka per wątek, unavailable bez liczb, plan Reject) |
| **Tester** | Ten skrypt; po zielonym oknie KK — aktualizacja parytetu / raport G3 |
| **Właściciel** | W39–W42, prawdziwe konta, czyste Windows jeśli G2 dokończenie |

---

## 7. Proponowane nazwy kroków w skrypcie (dla KK)

Prefiks `W6-` w `sandbox-acceptance.ts` / mode `w6`, np.:

- `W6-T01` … `W6-T10` = W01–W10  
- `W6-C11` … `W6-C16` = kontekst (C12 = Claude unavailable)  
- `W6-P17` … plan (gdy UI)  
- `W6-A29` … akcje (gdy UI)  
- `W6-O36` … osobne okno  

Nie implementuję skryptu w T2 (tylko dokument).

---

## 8. Czego ten dokument nie sprawdza

1. Uruchomienia Electrona / acceptance (zakaz w W6-T2).
2. Subagentów W23–W28 end-to-end (jeśli UI brak).
3. Bogatej treści / $ / @ / 100 MB (poza spec T1).
4. Prawdziwego limitu tokenów na ChatGPT/Claude (właściciel).
5. Czy UI1-FIX (25 testów + P07) jest już na integracji w momencie odbioru — KK weryfikuje HEAD przed startem.

---

## Commity

Gałąź `team/tester/w6-t2` — SHA w `channel_result`.
