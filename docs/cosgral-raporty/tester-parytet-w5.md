# Tester W5-T5 — przeliczenie parytetu po W5 (propozycja)

**Następny krok (lider):** po swoim e2e/T4 zaktualizuj `docs/cosgral/parytet-0.68.md` według tej tabeli (ten plik **nie** edytuje parytetu).

Baza gałęzi: `codex/cosgral-desktop` @ `0705340a9` (scalone m.in. K1, BE3, BE4, K2, UI3, security-review; tip lint testu T3).  
Reguła: **jest** = odbiór w prawdziwym oknie albo `sandbox:e2e`; **tylko jednostkowe / Storybook = częściowo**. Nie zawyżam.

Źródła: `parytet-0.68.md` (stan 27 jest / 17 częściowo = 35,5/44 = 80,7%), raporty W4/W5 w `docs/cosgral-raporty/`, `spec-w5.md`, `Shared\cosgral-docs\luki-070.txt`.  
Uwaga kanału (lider, niesprawdzone przeze mnie): e2e na scaleniu BE4/K2/UI3 miał **30 ok, 0 FAIL** — przyjmuję jako **niezweryfikowane lokalnie**; kroki BE2 accounts (28 ok) i T2a/FIX1 (C01–C13, hide/show/duplicate w skrypcie) są w raportach.

---

## Werdykt liczb

| Metryka | Wartość |
|---|---|
| Stary wynik (parytet w repo) | 27 jest + 17 częściowo = **35,5 / 44 = 80,7%** |
| Propozycja po W4/W5 (ta tabela) | **żaden wiersz nie awansuje na „jest”** → nadal **35,5 / 44 = 80,7%** |
| Gdyby policzyć 1, 32, 36 jako 0 (jak nota w parytecie) | 34 / 44 = 77,3% (bez zmian względem tej metody) |

Dlaczego bez awansu: W5 domknęło dużo **silnika** (konta, klucze, endpointy, zapasowe 8, router limitu), ale odbiór **w oknie** dla puli/przełączania/kluczy/endpointów/listy 8 jeszcze nie (W5-T4 czeka na GO). CLI zarządzane i konta (add/sign-in/out) mają e2e/okno, lecz wiersz **35** obejmuje też dostawców spoza Codex/Claude i pełne limity — nadal „częściowo”.

---

## Tabela: wiersze ruszone przez W4 / W5

| Nr | Obszar | Stary | Nowy (propozycja) | Dowód | Pewność |
|---|---|---|---|---|---|
| 2 | Szyna stron | częściowo | **częściowo** | W4-UI4 More pages; W4-UI5 `pinnedPageIds` (`ui-w4-ui5.md`); e2e umie otworzyć stronę z More; **trwałe pin po restarcie nie ma osobnego kroku e2e w raporcie UI5** | średnia |
| 3 | Pasek / menu agenta | częściowo | **częściowo** | Mark as read (UI4, e2e bywał niestabilny — `kk-w5-fix-onboarding.md`); Ukryj/Pokaż + Duplikuj (UI5, kroki w `sandbox-e2e.ts` ~899–933; lider: 30 ok). **Brak:** nowy wątek, osobne okno (W6) | wysoka na hide/duplikat; średnia na mark-read |
| 7 | Stan „limit” na wierszu | jest | **jest** (bez zmiany) | W3-T3 już „jest”; W5-UI2a/K1 karty limitu konta — jednostkowo / bez osobnego e2e limitu konta | wysoka (stary dowód) |
| 21 | Ustawienia agenta | częściowo | **częściowo** | Zapasowe do 8 + lista ogólna `*` (BE4 `backend-w5-be4.md`, UI4 Storybook — brak Electron w raporcie UI4). Nadal brak folderów dostępu, poziomu dostępu, limitów wątków | wysoka |
| 30 | Biblioteka plików | częściowo | **częściowo** | W4-UI5 Download/Reveal w panelu (`ui-w4-ui5.md`); W4-T5/T6 już częściowo. Siatka/zaznaczanie nadal brak | średnia |
| 35 | Dostawcy i limity | częściowo | **częściowo** | **Okno/e2e:** CLI C01–C13 + O1 (`kk-w5-t2a.md`, FIX1); accounts add/sign-in/out (`backend-w5-be2.md` e2e 28 ok, krok ~821 `sandbox-e2e.ts`); W4-T5 krok 35b zapasowy ACP. **Tylko jednostkowe:** K1 przełączanie puli (`kk-w5-k1.md`); klucze API (`backend-w5-be3.md`, `ui-w5-ui3.md`); endpointy/Ollama/LM Studio (`kk-w5-k2.md`); fallback 8 (`backend-w5-be4.md`). Brak natywnych Gemini/OpenCode/…; G2 prawdziwy CLI/Windows nie | wysoka na CLI+konta atrapa; niska na K1/klucze/endpointy w oknie |
| 40 | Onboarding | częściowo | **częściowo** | O1 + FIX1 e2e (`kk-w5-t2a.md`, `kk-w5-fix-onboarding.md`): pobranie CLI w setupie. Język PL nadal nie zmienia napisów (stary W3) | wysoka |

Wiersze **1–19 / 20–34 / 36–44** poza tabelą: **bez propozycji zmiany stanu** względem `parytet-0.68.md` (W5 ich nie domknęło w oknie). Wiersze 14–15 już „jest” od W4-T2.

### Skrót W5 poza tabelą 44 (nie osobne wiersze)

| Temat | Stan względem parytetu 0.68 | Dowód |
|---|---|---|
| CLI zarządzane | wchodzi w **35** (częściowo) | T2a okno C01–C13 |
| Logowanie kont w aplikacji | wchodzi w **35** | BE2 e2e |
| Pula / przełączanie przy limicie | wchodzi w **35** | K1 jednostkowo; T4 w toku |
| Klucze API | wchodzi w **35** (+ Vault 26 ma „klucze” w opisie 0.68 — nadal częściowo przez konektory) | BE3/UI3 jednostkowo; security-review bez wycieku pełnego klucza |
| Endpointy / Ollama / LM Studio | wchodzi w **35** | K2 jednostkowo |
| Modele zapasowe do 8 | wchodzi w **21** i **35** | BE4 jednostkowo; UI4 Storybook |

---

## Luki wobec OpenBot 0.70 (`luki-070.txt`, strony 8–10)

Uczciwie względem **stanu na 14.11 w dokumencie** vs **stan kodu/odbioru po W4–W5** (nie względem idealnego 0.70).

| # | Obszar z luki-070 | Status | Zamknięte (częściowo/w pełni) | Nadal otwarte |
|---|---|---|---|---|
| 1 | Dostawcy i subskrypcje | **częściowo zamknięte** | CLI w aplikacji (okno T2a); logowanie Codex atrapa w oknie (BE2 e2e); klucze API w magazynie (jednostkowo); pula+router (jednostkowo); endpointy + presety Ollama/LM Studio (jednostkowo); zapasowe do 8 (jednostkowo); ACP ogólne | 18 dostawców / gotowe ACP Gemini·OpenCode·…; prawdziwe pobranie CLI (G2); prawdziwe ChatGPT/Claude login; odbiór okna K1/kluczy/endpointów (T4); pierścienie użycia 0.70 |
| 2 | Limity i użycie | **otwarte** (lekki postęp) | karta limitu konta / switch (K1 jednostkowo); Usage % (stare) | okna 5 h/tydzień, pierścienie na szynie, koszt |
| 3 | Czat i wątki | **otwarte** | — | wiele wątków, subagenci, plan, wskaźnik kontekstu |
| 4 | Wiadomości i kompozytor | **otwarte** | odpowiedź w kanale (W4) | pin/usuń wiadomość, $, bogata treść, 100 MB |
| 5 | Kanały | **częściowo zamknięte** | tworzenie/edycja w UI (wiersz 14 „jest”, W4-T2) | okienka plików/przeglądarki w kanale; agenci tworzą kanały |
| 6 | Pasek boczny i nawigacja | **częściowo zamknięte** | More pages, pin stron, ukryj/duplikuj/mark read (e2e częściowo) | grupy unread/pinned, 9 akcji, osobne okno, menu serwera, search kanałów/rutyn |
| 7 | Agenci i bezpieczeństwo | **otwarte** | kreator/szablony/narzędzia (stare „jest”/częściowo w 20–21) | 3 poziomy dostępu, foldery±, import/eksport, piaskownica macOS-parzystość |
| 8 | Pamięć, skille, MCP, Vault | **częściowo** (jak przed W5) | baza UI+testy (wiersze 23–26) | konektory 1Password/Bitwarden, OAuth MCP, „inteligentna” warstwa |
| 9 | Automatyzacja | **otwarte** | przepływy/rutyny bazowe (28, 27) | GitHub/Slack triggers, kroki LLM/warunki, wersje |
| 10 | Przeglądarka i komputer | **otwarte** (jak W3 częściowo) | ~13 akcji, CU Windows częściowo | profile proxy, pełny zestaw akcji, nauka zadań |
| 11 | Głos | **otwarte** | whisper lokalnie (34 częściowo) | live conversation, lepsze głosy |
| 12 | Zespół i telefon | **otwarte** | PWA/pairing lokalne (42–44 częściowo) | chmura WebRTC, push, Live Activity, pełna app |
| 13 | Wygląd i ustawienia | **otwarte** | — | jasny motyw, 15 języków (PL napisy), skala 67–200% |

**Podsumowanie luk 0.70:** z **13 obszarów** tabeli luk → **0 w pełni zamkniętych**, **~5 częściowo** (1, 5, 6, 8 + skrawek 2), **~8 otwartych**. W5 celowało w obszar 1 — największy skok kodu, ale bez G2 i bez T4 w oknie nie wolno pisać „zamknięte”.

Dodatkowa teza dokumentu (str. 1): „logowanie tylko w terminalu” — **nieaktualna** względem BE2/e2e (logowanie w aplikacji na atrapie); prawdziwe CLI nadal G2.

---

## Czego nie sprawdzono

1. Własnego przebiegu Electron / `sandbox:e2e` / T4 (zakaz w zadaniu).
2. Czy tip `0705340a9` to już pushnięty stan z BE4/K2 (lokalna integracja w worktree — tak; zgodność z GitHubem — nie weryfikowałem).
3. Raportu UI4/`ui-w5-ui4.md` w oknie (tylko Storybook w wyniku UI).
4. Prawdziwych kont, prawdziwego CLI, czystego Windows (G2).
5. Edycji `parytet-0.68.md` (celowo nie).

---

## Commity

Zobacz SHA w wyniku kanału na `team/tester/w5-parytet`.
