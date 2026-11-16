# Tester W5-T6 — przeliczenie parytetu po odbiorze KK w oknie (T4)

**Następny krok (lider):** zaktualizuj `docs/cosgral/parytet-0.68.md` według tej tabeli (ten plik **nie** edytuje parytetu).

Baza: `codex/cosgral-desktop` @ `0e01c0019` (Merge W5-T4).  
Źródła: `tester-parytet-w5.md` (T5), `kk-w5-t4.md` (T4), kroki `COSGRAL_MODE=w5` w `scripts/sandbox-acceptance.ts`, `parytet-0.68.md`, `Shared\cosgral-docs\luki-070.txt`.  
Reguła: **jest** tylko gdy odbiór w prawdziwym oknie potwierdza **i** kryterium 0.68 jest w pełni pokryte. Atrapy zaliczają się, jeśli opisują zachowanie 0.68 — oznaczone **na atrapie**.  
Decyzja właściciela (16.11): modele zapasowe muszą być **per dostawca** — wiersz **35** (i zapasowe w **21**) zostaje **częściowo** do odbioru BE7/UI6 w oknie.

---

## Werdykt liczb

| Metryka | Wartość |
|---|---|
| Stary (parytet / T5) | 27 jest + 17 częściowo = **35,5 / 44 = 80,7%** |
| Po T4 (ta tabela) | **żaden wiersz nie awansuje na „jest”** → nadal **35,5 / 44 = 80,7%** |
| Gdyby 1, 32, 36 = 0 | 34 / 44 = 77,3% (bez zmian) |

**Dlaczego bez awansu stanu:** T4 domknęło w oknie (na atrapie) pulę, przełączanie, kartę limitu, klucze, endpointy i listę 8 / `*` / inherited — to podnosi **pewność dowodu** wiersza **35**, ale opis 0.68 nadal wymaga wielu natywnych dostawców (Grok, Gemini, OpenCode, …) i pierścieni użycia; plus decyzja właściciela o zapasowych per dostawca (BE7/UI6 jeszcze bez odbioru w tej bazie).

---

## Awansy (dowód / stan)

| Nr | Awans stanu? | Awans dowodu | Kroki T4 (`sandbox-acceptance.ts`, `COSGRAL_MODE=w5`) |
|---|---|---|---|
| 7 | nie (już **jest**) | tak — karta limitu konta w Needs you + godzina resetu | **P07**, **P08** (na atrapie CLI) |
| 21 | nie → **częściowo** | tak — 8 modeli / `*` / inherited w oknie (IPC); UI listy tylko Storybook | **F01**, **F02** (na atrapie); nadal brak folderów dostępu, poziomu, limitów wątków; **zapasowe per dostawca — czekają na odbiór** |
| 35 | nie → **częściowo** | tak — z „tylko jednostkowe” → **okno Electron na atrapie** | **P01–P11**, **K01–K04**, **E01–E04**, **E06**, **F01–F02**, B02; brak **E05**; **P10/P11/F02/F03** częściowo w T4; **F04** brak |
| 2, 3, 30, 40 | nie | nie (T4 ich nie rusza) | — |

**Awans stanu częściowo→jest: brak.**

---

## Tabela: wiersze ruszone przez W4 / W5 (po T4)

| Nr | Obszar | Stary (T5) | Nowy | Dowód | Pewność |
|---|---|---|---|---|---|
| 2 | Szyna stron | częściowo | **częściowo** | jak T5: More pages + pin (UI4/UI5); brak osobnego e2e trwałego pin po restarcie | średnia |
| 3 | Pasek / menu agenta | częściowo | **częściowo** | jak T5: hide/show/duplicate + mark-read; brak nowego wątku / osobnego okna (W6) | wysoka |
| 7 | Stan „limit” | jest | **jest** | W3-T3 + T4 **P07** (karta „Continue on…?” w Needs you po naprawie) + **P08** (exhausted z godziną, bez wiszenia) — **na atrapie** | wysoka |
| 21 | Ustawienia agenta | częściowo | **częściowo** | T4 **F01** (8 / odmowa 9.) + **F02** (inherited / reset) w oknie przez IPC; ekran listy = UI4 Storybook. Brak folderów/poziomu/limitów wątków. **Zapasowe per dostawca: częściowo do odbioru** | wysoka na 8/`*`; niska na pełne 0.68 |
| 30 | Biblioteka plików | częściowo | **częściowo** | jak T5 / W4-T5–T6; T4 nie dotyczy | średnia |
| 35 | Dostawcy i limity | częściowo | **częściowo** | **Okno T4 (na atrapie CLI + serwerów):** P01–P09 **jest**; P10–P11 **częściowo**; K01–K04 **jest**; E01–E04, E06 **jest**, E05 **brak**; F01 **jest**, F02–F03 **częściowo**, F04 **brak**; lista `*` / inherited **jest** (F02); e2e 30/0/0 + W5 24/24. Wcześniej: CLI C01–C13, BE2 konta, W4-T5 35b. **Brak do „jest” 0.68:** natywni Grok/Gemini/OpenCode/…, pierścienie użycia, zapasowe **per dostawca** (decyzja właściciela → czekają BE7/UI6 + odbiór), prawdziwe konta/CLI (G2) | wysoka na Codex/Claude atrapa + pula/klucze/endpointy; niska na pełne 0.68 |
| 40 | Onboarding | częściowo | **częściowo** | jak T5: O1 + FIX1; język PL nadal nie zmienia napisów | wysoka |

Wiersze poza tabelą: **bez zmiany stanu** względem `parytet-0.68.md`.

### Skrót W5 w oknie T4 (wchodzi w 21 / 35)

| Temat | Stan vs 0.68 | Kroki |
|---|---|---|
| Pula kont / przełączanie | w **35** częściowo (pełne 0.68 nie) | P01–P09 **jest** na atrapie; P10/P11 częściowo |
| Klucze API | w **35** (+ Vault 26) | K01–K04 **jest** na atrapie |
| Endpointy / Ollama / LM Studio | w **35** | E01–E04, E06 **jest** na atrapie; E05 brak |
| Modele zapasowe 8 / `*` / inherited | w **21** i **35** | F01, F02; **per dostawca → częściowo** (decyzja właściciela) |
| Stan limit na wierszu / Needs you | w **7** jest | P07, P08 |

---

## Luki wobec OpenBot 0.70 (`luki-070.txt`, 13 obszarów)

| # | Obszar | Status | Zamknięte (częściowo/w pełni) | Nadal otwarte |
|---|---|---|---|---|
| 1 | Dostawcy i subskrypcje | **częściowo zamknięte** (skok po T4) | okno T4 na atrapie: pula P01–P09, klucze K01–K04, endpointy E01–E04/E06, zapasowe 8/`*` F01–F02; CLI T2a; BE2 e2e | 18 dostawców / gotowe ACP; prawdziwe CLI/login (G2); pierścienie 0.70; zapasowe **per dostawca** (odbiór); P10 idle 5 min, P11 remote/telefon, F02 sieć, F04, E05 |
| 2 | Limity i użycie | **otwarte** (lekki postęp) | P06–P08 karty limitu konta w oknie (na atrapie) | okna 5 h/tydzień, pierścienie na szynie, koszt |
| 3 | Czat i wątki | **otwarte** | — | wiele wątków, subagenci, plan, kontekst |
| 4 | Wiadomości i kompozytor | **otwarte** | odpowiedź w kanale (W4) | pin/usuń, $, bogata treść, 100 MB |
| 5 | Kanały | **częściowo** | UI create/edit (14 „jest”) | okienka plików/przeglądarki; agenci tworzą kanały |
| 6 | Pasek boczny i nawigacja | **częściowo** | More/pin/hide/duplikuj | grupy, 9 akcji, osobne okno, search |
| 7 | Agenci i bezpieczeństwo | **otwarte** | kreator/szablony (stare) | 3 poziomy, foldery±, import/eksport |
| 8 | Pamięć, skille, MCP, Vault | **częściowo** | baza UI+testy (23–26) | konektory, OAuth MCP |
| 9 | Automatyzacja | **otwarte** | przepływy/rutyny bazowe | GitHub/Slack, LLM/warunki |
| 10 | Przeglądarka i komputer | **otwarte** | ~13 akcji, CU Windows częściowo | proxy, pełny zestaw |
| 11 | Głos | **otwarte** | whisper lokalnie (34) | live conversation |
| 12 | Zespół i telefon | **otwarte** | PWA/pairing lokalne | chmura, push, Live Activity |
| 13 | Wygląd i ustawienia | **otwarte** | — | jasny motyw, 15 języków, skala |

**Podsumowanie luk 0.70:** **0 / 13 w pełni zamkniętych**, **~5 częściowo** (1, 5, 6, 8 + skrawek 2), **~8 otwartych**. Obszar 1 mocniejszy po T4, nadal nie „zamknięty”.

---

## Czego nie sprawdzono (ten raport)

1. Własnego Electron / `sandbox:e2e` / przebiegu W5 (zakaz — tylko dokument; dowód z `kk-w5-t4.md`).
2. Prawdziwych kont, CLI, Ollama, sprawdzenia klucza u dostawcy (T4: atrapy).
3. BE7/UI6 per dostawca w oknie (poza bazą `0e01c0019`; decyzja: zostaw **częściowo**).
4. P10 idle 5 min, P11 remote/telefon, F02 błąd sieci, F03 `returnAfterReset`, F04, E05, pełny `bun run check`.
5. Edycji `parytet-0.68.md` (celowo nie).

---

## Commity

Zobacz SHA w wyniku kanału na `team/tester/w5-parytet2`.
