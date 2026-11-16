# Spec W10: kryteria odbioru (integracje — MCP OAuth, przepływy zewnętrzne, eksport/import agentów, komunikator)

**Stan: 16.11.2026, integracja `codex/cosgral-desktop` @ `b765a716a`. Autor: Tester (W10-T1), tylko dokument / grep, bez uruchamiania programu.**

Opis zachowania i kryteria odbioru. Podstawa dla KAPI (W10-K1/K2) i Backend (W10-BE1/BE2). Fala: `PLAN-W4.md` — W10 = integracje. W lukach **po decyzji właścicieli** (komunikator; zakres „wszystkie funkcje” vs bez pięciu droższych — `DECYZJE-WLASCICIELA.md` wiersz 8 / luki decyzja 1).

## Na górze

- **Sytuacji: 24** (sekcja 1). **Kryteriów: W10-01 … W10-30.**
- **Wymaga właściciela: W10-25 … W10-30** (konta OAuth agencji, wybór WhatsApp vs Telegram, decyzja zakresu W10, akceptacja odbioru).
- **Zasady bezpieczeństwa:**
  1. OAuth / tokeny tylko w magazynie lokalnym (`safeStorage` / Vault) — **nigdy** w repo, czacie, logach, raportach publicznych.
  2. Agent **nie** loguje się sam: osoba kończy OAuth w przeglądarce (karta / okno); agent dostaje dostęp dopiero po sukcesie.
  3. Webhooki zewnętrzne: domyślnie jak rutyny W2 — świadomy exposure; preferencja loopback / Tailscale; sekrety rotowalne.
  4. Eksport agenta: bez haseł Vault i bez surowych tokenów MCP w pliku, chyba że osoba **świadomie** włączy „włącz sekrety” i potwierdzi kartą (**propozycja T1**).

**Źródła:** `luki` (W10-K1/BE1/BE2/K2; tabela „Integracje” ~200 app / Slack…); `PLAN-W4`; `DECYZJE-WLASCICIELA.md` wiersz 8; grep `ipc-mcp.ts`, `ipc-workflows.ts`, `ipc-routines.ts`, `ipc-agent-settings.ts` (templates), Marketplace. **„do ustalenia”** / **„propozycja T1”** / **„niezweryfikowane”**.

**Clean room:** własne słowa. Bez kopiowania katalogu 200+ aplikacji 0.70. Dokładna lista connectorów i UX OAuth 0.70 = **niezweryfikowane**.

**Kolejność w fali (propozycja T1):** K1 (MCP OAuth wybrane) → BE1 (przepływy zewnętrzne) → BE2 (eksport/import) → K2 (komunikator) **tylko po decyzji właścicieli**.

---

## 0. Co już jest w kodzie COSGRAL vs czego brak (grep, bez uruchamiania)

| Obszar W10 | Jest dziś | Brak / luka |
|---|---|---|
| MCP | `ipc-mcp`: stdio \| http; status `checking` \| `available` \| `needs-login` \| `error`; `secretNames` bez wartości; per-agent enable; reconnect | Brak pełnego **OAuth w przeglądarce** dla Google / Notion / GitHub / Meta jako „aplikacje MCP z logowaniem”; brak katalogu „aplikacje agencji” ponad ręczny add |
| Przepływy | `ipc-workflows`: graf trigger \| agent \| approval \| channel-output; trigger `manual` \| `routine`; `workflowProblems`; run/cancel | Brak triggera **zewnętrznego** (webhook HTTP, GitHub); brak węzła „krok LLM” poza agentem; brak **wersji** przepływu; brak warunków poza allow/deny approval |
| Rutyny / webhook | `ipc-routines`: schedule \| webhook (loopback w decyzjach W2); secret raz; eventTypes | Webhook rutyny ≠ trigger przepływu z zewnątrz (GitHub) — osobne; brak gotowego „GitHub → workflow” |
| Eksport / import agentów | Szablony lokalne (`listTemplates` / save / delete); creator z template; transfer jako zakładka ustawień (nazwa) | Brak pakietu agenta **między komputerami** z pamięcią + skillami; brak formatu pliku / QR / nośnika |
| Komunikator | Brak WhatsApp / Telegram w kontraktach | Całość W10-K2; decyzja właścicieli |
| Marketplace | Sugestie instalacji z kartą zgody | Nie zastępuje OAuth MCP agencji |

---

## 1. Zachowanie do dostarczenia

### 1A. Aplikacje MCP z OAuth dla agencji (W10-K1)

Zakres luk: Google Workspace, Notion, GitHub, Meta — **wybrane**, nie 200+ naraz.

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 1 | Wybiera aplikację z listy agencji (np. GitHub). | Startuje logowanie **w przeglądarce** (system / wbudowane); po sukcesie status MCP `available`; token w magazynie lokalnym. | Zapytać o hasło w czacie agenta; zapisać refresh token w repo. | luki W10-K1 |
| 2 | Agent ma włączony ten MCP. | Może wywołać narzędzia (np. czytać issues) zgodnie z uprawnieniami OAuth. | Działać przy `needs-login` jakby było OK. | luki „agent czyta dane”; ipc-mcp |
| 3 | Token wygasa / revoke po stronie dostawcy. | Status `needs-login` lub `error` z czytelnym powodem **bez** sekretu; karta „zaloguj ponownie”. | Ciche retry z martwym tokenem w pętli bez UI. | propozycja T1 |
| 4 | Wyłącza MCP na agencie / usuwa serwer. | Narzędzia znikają; opcja usunięcia sekretów lokalnych. | Zostawić orfany tokenów bez UI do skasowania. | propozycja T1 |
| 5 | Przestrzeń klienta z W8. | Allowlist MCP per przestrzeń (decyzja W8 Q10) obowiązuje też tu. | Klient A używa OAuth klienta B. | spec-w8 §7 Q10 |

### 1B. Przepływy: wyzwalacze zewnętrzne, kroki, warunki, wersje (W10-BE1)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 6 | Dodaje trigger **webhook** do przepływu. | Unikalny URL + sekret (pokazany raz); zewnętrzny POST uruchamia run, gdy podpis/sekret OK. | Publiczny webhook bez sekretu na 0.0.0.0 jako domyślna. | luki W10-BE1; zasada T1 |
| 7 | Podłącza trigger **GitHub** (np. push / PR). | Po OAuth/GitHub app (zakres do ustalenia) zdarzenie startuje przepływ. | Słuchać wszystkich repo bez allowlisty. | luki W10-BE1 |
| 8 | Rysuje krok **LLM** / agenta i **warunek**. | Obok approval allow/deny: proste warunki na wynik poprzedniego kroku (**propozycja T1**: równość / zawiera / status). | Wymagać pełnego języka skryptowego w W10. | luki; propozycja T1 |
| 9 | Zapisuje wersję przepływu. | Widać historię wersji; run wskazuje wersję; da się wrócić do poprzedniej (**propozycja T1**). | Nadpisywać graf bez śladu przy „wersje” w kryterium luk. | luki W10-BE1 |
| 10 | Przepływ już running; przychodzi kolejne zdarzenie. | Zachowanie jak dziś: odmowa równoległego run **albo** kolejka — **do ustalenia** (propozycja T1: kolejka max N z widocznym stanem). | Gubić zdarzenia bez logu. | ipc-workflows (dziś refuse); propozycja T1 |
| 11 | Rutyna W2 vs trigger workflow. | Oba mogą startować pracę; UI nie myli „routine webhook” z „workflow webhook”. | Jeden sekret na dwa różne systemy bez rozróżnienia. | propozycja T1 |

### 1C. Eksport i import agentów między komputerami (W10-BE2)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 12 | Eksportuje agenta na PC A. | Pakiet: profil (nazwa, rola, instrukcje), model/preferencje, **pamięć**, **skille** (metadane + pliki w limicie skilli), ustawienia narzędzi **bez** sekretów domyślnie. | Wkładać klucze API / Vault / tokeny MCP do pakietu bez karty. | luki W10-BE2 |
| 13 | Importuje na PC B. | Agent pojawia się z pamięcią i skillami; poziom dostępu = **working-folder** (W8 Q9 analogia do szablonu). Ostrzeżenia, gdy brakuje MCP/modelu na B. | Ciche `full` po imporcie. | luki; spec-w8 Q9 |
| 14 | Import ze „włącz sekrety”. | Tylko po confirm; sekrety trafiają do lokalnego magazynu B; raport „co zaimportowano”. | Logować wartości sekretów. | propozycja T1 |
| 15 | Pakiet uszkodzony / nieufny. | Odmowa z powodem; brak częściowego zapisu w połowie. | Import „na ślepo” bez walidacji schematu. | propozycja T1 |

### 1D. Komunikator dla klientów (W10-K2) — po decyzji właścicieli

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 16 | Właściciele wybrali **WhatsApp albo Telegram**. | Jedna integracja w W10; druga później lub wcale. | Budować obie naraz bez decyzji. | luki W10-K2 |
| 17 | Klient pisze na wybranym komunikatorze. | Wiadomość wchodzi do wskazanego agenta / kanału; odpowiedź wraca na ten sam wątek; Needs you gdy trzeba osoby. | Wysyłać z komunikatora sekrety Vault / włączać Computer Use zdalnie bez reguł W8/W9. | luki; propozycja T1 |
| 18 | DECYZJE wiersz 8: opcja „bez komunikatorów”. | Jeśli właściciel wybierze wyłączenie — **W10-K2 nie startuje**; reszta W10 może iść. | Traktować brak decyzji jako „rób WhatsApp”. | DECYZJE 8 |

### 1E. Kryteria odbioru (W10-01 … W10-30)

| ID | Kryterium | Grupy |
|---|---|---|
| W10-01 | Lista wybranych app MCP (Google Workspace, Notion, GitHub, Meta) w UI | 1A |
| W10-02 | OAuth w przeglądarce; sukces → `available` | 1A |
| W10-03 | Agent czyta dane przez narzędzia MCP po logowaniu | 1A / właściciel |
| W10-04 | `needs-login` / revoke widoczne bez sekretów w UI | 1A |
| W10-05 | Usunięcie serwera czyści / oferuje czyszczenie sekretów | 1A |
| W10-06 | Allowlist MCP per przestrzeń (W8) | 1A |
| W10-07 | Trigger webhook przepływu z sekretem | 1B |
| W10-08 | Zewnętrzny POST uruchamia run | 1B |
| W10-09 | Trigger GitHub (wybrane zdarzenia + allowlista repo) | 1B / właściciel |
| W10-10 | Krok LLM/agent + prosty warunek w grafie | 1B |
| W10-11 | Wersje przepływu + run wskazuje wersję | 1B |
| W10-12 | Równoległy run: refuse lub kolejka — zachowanie udokumentowane | 1B |
| W10-13 | Eksport pakietu: profil + pamięć + skille | 1C |
| W10-14 | Import na drugim PC: agent działa; working-folder | 1C |
| W10-15 | Domyślny eksport bez sekretów | 1C |
| W10-16 | Eksport z sekretami tylko po confirm | 1C |
| W10-17 | Walidacja schematu pakietu; odmowa na śmieci | 1C |
| W10-18 | Żadne sekrety OAuth/eksportu w repo | zasada |
| W10-19 | Komunikator: jedna platforma po decyzji | 1D |
| W10-20 | Wiadomość klienta → agent/kanał → odpowiedź | 1D |
| W10-21 | Needs you z komunikatora respektuje zgody | 1D |
| W10-22 | Brak decyzji K2 → brak implementacji K2 | 1D |
| W10-23 | Nie obiecywać katalogu 200+ app w W10 | luki / DECYZJE |
| W10-24 | Rutyna webhook ≠ workflow webhook (rozróżnienie UI) | 1B |
| W10-25 | Konta testowe OAuth (GitHub/Google/…) — właściciel | właściciel |
| W10-26 | Meta / Notion — konta i app credentials — właściciel | właściciel |
| W10-27 | Wybór WhatsApp vs Telegram vs „bez” | właściciel |
| W10-28 | Decyzja zakresu W10 vs „pięć wyłączeń” (DECYZJE 8) | właściciel |
| W10-29 | Odbiór na dwóch komputerach wspólników (eksport/import) | właściciel / T |
| W10-30 | Lider akceptuje odbiór fali W10 | lider |

---

## 2. Co wymaga właściciela

| Potrzeba | Po co |
|---|---|
| Decyzja zakresu W10 (wiersz 8 DECYZJE: z komunikatorami / katalogiem czy bez) | W10-28, kolejność K2 |
| Konta i app OAuth: Google Workspace, Notion, GitHub, Meta | W10-03, W10-25–26 |
| Wybór WhatsApp **albo** Telegram **albo** „nie w W10” | W10-27, K2 |
| Dwa komputery do testu eksportu/importu | W10-14, W10-29 |
| Ewentualne GitHub App / webhook publiczny (Tailscale / własny host) | W10-08–09 |
| Akceptacja odbioru | W10-30 |

Zespół nie wkleja client secret OAuth do repo; `openbot.request_api_key` / Vault gdy potrzeba w runtime.

---

## 3. Pytania otwarte do lidera (max 12) + rekomendacja T1

| Q | Pytanie | Rekomendacja T1 |
|---|---|---|
| Q1 | Czy W10 startuje przed domknięciem DECYZJE wiersz 8? | **Nie dla K2 i katalogu 200+.** K1 (4 app) + BE1 + BE2 mogą iść na założeniu lidera „wybrane integracje”; K2 dopiero po jawnej decyzji właścicieli. |
| Q2 | Kolejność implementacji? | K1 → BE1 → BE2 → K2 (opcjonalnie). |
| Q3 | OAuth: systemowa przeglądarka vs okno Electron? | Systemowa / domyślna przeglądarka użytkownika (mniej bypassów cookie); callback na loopback jak typowe CLI. |
| Q4 | Czy Notion/Google/Meta/GitHub to osobne paczki MCP czy jeden „agency hub”? | Osobne wpisy MCP (łatwiejsza allowlista W8); wspólny UX „połącz konto” w UI. |
| Q5 | Workflow webhook: ten sam silnik co routine webhook? | Osobne URL-e i sekrety; wspólny kod limitu/rate-limit OK. |
| Q6 | GitHub trigger: GitHub App vs personal PAT? | GitHub App (węższy scope, rotacja); PAT tylko lab. |
| Q7 | Wersjonowanie przepływów: snapshot całego grafu czy diff? | Snapshot JSON grafu per wersja (prostsze odtwarzanie). |
| Q8 | Format eksportu agenta? | Jeden plik `.cosgral-agent` (zip+manifest) z wersją schematu; bez ścieżek `C:\Users\…`. |
| Q9 | Czy pamięć kanału wchodzi w eksport agenta? | **Nie** — tylko pamięć agenta + skille; kanały zostają na maszynie. |
| Q10 | Komunikator: WhatsApp Business API vs Telegram Bot — który pierwszy, jeśli „jeden”? | Telegram Bot (prostszy hosting, mniej weryfikacji Meta) — **chyba że** właściciel wymaga WA dla klientów. |
| Q11 | Czy Slack/Discord z tabeli luk są w W10? | **Nie** w rdzeniu W10; backlog po K2. |
| Q12 | Odbiór: kto płaci za API OAuth / Meta? | Właściciel; zespół tylko checklistę i raport bez kont. |

---

## 4. Czego nie wiadomo (uczciwa lista)

1. Dokładny katalog i UX **200+ aplikacji** oraz OAuth flow w OpenBot **0.70** — **niezweryfikowane** (tylko skrót w lukach).
2. Czy status MCP `needs-login` jest już podpięty pod prawdziwy OAuth browser flow, czy tylko HTTP 401 z ręcznym secretem — grep pokazuje status; **pełnego OAuth agency app nie ma**.
3. Zachowanie 0.70 dla eksportu agentów (co dokładnie jest w pakiecie) — **niezweryfikowane**.
4. Limity GitHub / Meta rate-limit przy workflow spam — do ustalenia przy implementacji.
5. Czy właściciel finalnie wycina komunikatory (DECYZJE 8) — decyzja otwarta.
6. Nie uruchamiałem Electrona, OAuth ani webhooków zewnętrznych.

---

## 5. Mapowanie na zadania z luk

| ID | Zakres |
|---|---|
| W10-K1 | §1A, W10-01…06, W10-25–26 |
| W10-BE1 | §1B, W10-07…12, W10-24 |
| W10-BE2 | §1C, W10-13…17, W10-29 |
| W10-K2 | §1D, W10-19…22, W10-27 (po decyzji) |
| W10-T1 (ten plik) | spec wejściowy |

---

## 7. Decyzje lidera (Q1–Q12, 16.11.2026)

Lider zaakceptował **wszystkie** rekomendacje T1 ze §3. Zapis wiążący dla W10:

| Q | Decyzja |
|---|---|
| Q1 | **K2** (komunikator) i katalog **200+** dopiero po decyzji właścicieli z `DECYZJE-WLASCICIELA.md` wiersz 8. **K1 + BE1 + BE2** mogą iść wcześniej na wybranych integracjach. |
| Q2 | Kolejność: **K1 → BE1 → BE2 → K2** (K2 opcjonalnie). |
| Q3 | OAuth: **systemowa przeglądarka** użytkownika + callback **loopback** (jak typowe CLI). |
| Q4 | Google / Notion / GitHub / Meta = **osobne wpisy MCP** (łatwiejsza allowlista W8); wspólny UX „połącz konto” w UI. |
| Q5 | Workflow webhook ≠ routine webhook: **osobne URL-e i sekrety**; wspólny rate-limit OK. |
| Q6 | GitHub trigger: **GitHub App** (węższy scope); PAT tylko lab. |
| Q7 | Wersje przepływu = **snapshot** całego grafu JSON per wersja. |
| Q8 | Eksport: plik **`.cosgral-agent`** (zip + manifest, wersja schematu); **bez** ścieżek z nazwą profilu. |
| Q9 | Eksport agenta **bez** pamięci kanału — tylko pamięć agenta + skille. |
| Q10 | Komunikator: **Telegram Bot** pierwszy, **chyba że** właściciel zażąda WhatsApp. |
| Q11 | Slack / Discord **nie** w rdzeniu W10; backlog po K2. |
| Q12 | Koszty API OAuth / Meta: **właściciel**; zespół tylko checklistę i raport bez kont. |

---

## Commity

Zobacz SHA w wyniku kanału na `team/tester/w9-spec` (decyzje §7: `team/tester/w6-t2`).
