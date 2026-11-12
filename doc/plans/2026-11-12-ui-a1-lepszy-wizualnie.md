# A1 UI — 3 propozycje „lepszy niż OpenBot” (wizualnie + obsługa)

**Status:** waiting for leader acceptance · **bez kodu**  
**Branch:** `team/ui/a1-visual` (od `bd92bdf0e`)  
**Kontekst:** droga A — silnik = OpenBot (licencja Team); Paperclip wstrzymany; shape Chat-first / karty decyzji / stany agentów zostaje jako **zasady**, nie plan kodu Paperclip.  
**Zasady:** nie kopiujemy grafik, ikon, tekstów UI OpenBota do repo; nazwa i logo OpenBot bez zmian; zmiany chrome tylko w prywatnym forku po aktywacji licencji.

---

## 0. Metoda i dowody

| Źródło | Co dało |
|---|---|
| OpenBot 0.68.0 działa na tym PC | Procesy `OpenBot` / `electron` widoczne; loopback `127.0.0.1:28417` odpowiada tytułem „OpenBot” (goły `/` → 404 — klient to Electron, nie pełny web). |
| Mapa UX 0.67.1 | `docs/cosgral-raporty/claude-k-openbot-ux-map.md` — szkielet: szyna stron, stany w pasku, karty w czacie, kanały. |
| Kryteria lidera (F2.0) | „Czeka na Ciebie” ≤ 1 s; PL; bez świecenia; porównanie light/dark. |
| Ograniczenie tej sesji | Side-thread bez Computer Use — **brak zrzutu pikseli Electrona w tym raporcie**. Zrzuty żywe: folder poza repo `C:\Users\x1 Yoga\OpenBot\Agents\agent-47a8f2c5-9b74-4380-910e-a5ab189976b9\tmp\openbot-a1-ui\` (do wypełnienia w czacie głównym UI Designera). |

**Wniosek jakości:** OpenBot jest już „jakościowy” (właściciel). „Lepszy” = mniej szukania decyzji i stanu zespołu, nie nowy branding.

---

## 1. Propozycja A — Pasek „Czeka na Ciebie” (scan ≤ 1 s)

### Problem
Stany *czeka na odpowiedź / zatwierdzenie / przeglądarkę* są w wierszu agenta, ale gubią się między folderami, długimi listami i innymi stronami (Użycie, Biblioteka, Marketplace…). Operator musi **skanować listę**, zamiast dostać jedną powierzchnię „co mnie blokuje”. Przy 2 osobach + kilku agentach to główny koszt uwagi.

**Dowód:** mapa UX §2.1 (stany w wierszu) + kryterium lidera „≤ 1 s”; brak zrzutu Electron w tej sesji.

### Propozycja
1. Nad listą agentów/kanałów: **pasek Needs you** — tylko wiersze ze stanem waiting (pytanie, zatwierdzenie, przejęcie). Klik → ten wątek + fokus na kartę.  
2. Sortowanie: waiting na górze folderu (opcjonalnie przełącznik).  
3. Licznik na ikonie Agenci / Inbox w szynie stron = suma waiting.

```
┌ Agents ─────────────┐
│ ⚠ Needs you (3)     │  ← zawsze widoczne gdy >0
│  · UI Designer · Q  │
│  · Backend · Approve│
│ ── Folders ──────── │
│  … idle agents …    │
└─────────────────────┘
```

### Dostawa
| Droga | Co |
|---|---|
| **(b) prywatny fork** | Zmiana layoutu listy agentów / badge na szynie stron. To jest chrome produktu → fork. |
| **(a) dodatek** | Skill/MCP **nie** naprawi chrome. Wtyczka ze stroną „Needs you” (jeśli apps w manifeście) = obejście, gorsze niż w pasku. |

**Rekomendacja:** **fork** (po A0). Do czasu forka: wtyczka-strona jako MVP widoczności.

### Motyw jasny / ciemny
Jeden semantyczny kolor „needs-you” (warning), bez glow. Light: ciemniejszy tekst na jasnym chipie; dark: jasny tekst na stonowanym tle. Kontrast WCAG AA na chipie i liczniku.

### Klawiatura
- `G` then `N` — skok do paska Needs you (jak vim-chord albo Command Palette: „Needs you”).  
- `j`/`k` w pasku; `Enter` otwiera wątek; `1–3` gdy fokus na karcie pytania.

### Kryteria akceptacji
1. Przy ≥1 waiting, pasek lub licznik widać **bez scrolla** na liście agentów (viewport 1280×800).  
2. Czas od pojawienia się waiting do widoczności chipa ≤ **1 s** (pomiar ręczny stopera, 5 prób).  
3. Light + dark: chip czytelny, zero animacji pulse przy `prefers-reduced-motion`.  
4. PL etykieta własna w forku / wtyczce — bez kopiowania cudzych stringów do publicznego repo (w forku lokalnym wolno edytować UI OpenBota).

---

## 2. Propozycja B — Sticky „Decyzja” nad kompozytorem

### Problem
Karty pytanie / zatwierdzenie / przejęcie siedzą w strumieniu czatu. Przy długiej historii i streamingu operator **scrolluje w górę**, żeby znaleźć kartę, albo gubi fokus gdy dochodzą nowe linie. To ten sam ból co „czeka na Ciebie”, tylko w środku.

**Dowód:** mapa UX §2.2 (karty w czacie); typowy wzorzec Slack/Codex: decyzja musi być przy miejscu pisania.

### Propozycja
Gdy wątek ma otwarte waiting: **sticky strip** 1 kartę (lub stos „1/3”) tuż nad kompozytorem. Pełna karta zostaje też w historii. Strip: skrót pytania + te same CTA. Po rozwiązaniu — znika.

```
│ … historia …                    │
│ [stream / nowe linie]           │
├─ Decyzja 1/2 ───────────────────┤  ← sticky
│ Zezwolić na zapis pliku X?      │
│ [Zezwól] [Zawsze] [Odrzuć]      │
├─────────────────────────────────┤
│ Message…                     ⏎  │
```

### Dostawa
| Droga | Co |
|---|---|
| **(b) prywatny fork** | Właściwe miejsce: layout czatu / composer. |
| **(a) dodatek** | Nie da się wiarygodnie „dokleić” do kompozytora bez API hosta. |

**Rekomendacja:** **tylko fork**.

### Motyw jasny / ciemny
Strip = `surface` + border hairline (jak karty systemowe), nie gradient. Light/dark z tokenów motywu OpenBota w forku; zero neonu.

### Klawiatura
- Fokus strip: `Alt+Shift+D` (Decyzja).  
- `1`/`2`/`3` lub litery skrótów przycisków gdy strip ma fokus.  
- `Esc` nie odrzuca — tylko zdejmuje fokus (bezpieczeństwo).

### Kryteria akceptacji
1. Przy otwartej karcie waiting, CTA widać **bez scrolla** gdy kompozytor jest widoczny.  
2. Po Zezwól/Odrzuć strip znika w ≤ 1 s; historia nadal ma pełną kartę.  
3. Light + dark; reduced-motion OK.  
4. Dwa waiting naraz: widać „1/2” i da się przełączyć strzałkami.

---

## 3. Propozycja C — Kanał: Chat | Zadania w jednym nagłówku

### Problem
Kanał z liderem i zadaniami jest potężny, ale **zadania i czat rozjeżdżają się po powierzchniach** (czat kanału vs lista zadań / zatrzymane). Przy pracy 1:1 z OpenBotem „identyczny” zostaje; „lepszy” = ta sama praca w dwóch widokach bez gubienia kontekstu (zasada Chat/Tabela z wcześniejszego shape).

**Dowód:** mapa UX §2.3; wcześniejszy shape §2.6 (trzy widoki) — nadal aktualne jako zasada.

### Propozycja
W nagłówku kanału: segmented **Chat | Zadania** (Workflow później). Zadania = tabela: właściciel, stan, wynik, link do wiadomości. Ten sam filtr „tylko waiting / zatrzymane”.

```
# Projekt COSGRAL    [Chat] [Zadania]    lider: Okiestrator · 2 online
```

### Dostawa
| Droga | Co |
|---|---|
| **(a) dodatek — wtyczka / strona** | Osobna strona „Zadania kanału” w manifeście `apps` + deep-link z wiadomości. Szybsze bez forka. |
| **(b) fork** | Segment w **native** nagłówku kanału (lepsze UX, jeden kontekst). |

**Rekomendacja:** **A2 dodatek (strona)** najpierw → po sprawdzeniu, **A3 fork** wkleja segment do nagłówka.

### Motyw jasny / ciemny
Segment jak w System UI: aktywny = foreground + underline/weight, nie wypełniony „pill glow”. Tabela: status chips jak w propozycji A.

### Klawiatura
- `Ctrl+\` przełącza Chat ↔ Zadania.  
- W tabeli: strzałki, `Enter` → Chat na wiadomości zadania.  
- `/waiting` filtr w polu tabeli.

### Kryteria akceptacji
1. Z kanału da się zobaczyć listę zadań **bez** gubienia ID kanału (powrót jednym kliknięciem / skrótem).  
2. Klik wiersza otwiera Chat w miejscu powiązanej wiadomości (±1 wiadomość).  
3. Light + dark; puste / ładowanie / błąd opisane własnym copy.  
4. Nie dodajemy trzeciego silnika zadań — tylko widok na istniejące zadania kanału OpenBota.

---

## 4. Co świadomie odpuszczamy teraz

| Pomysł | Dlaczego nie w top 3 |
|---|---|
| Przebudowa całej szyny stron | Duży fork, wysokie ryzyko regresji; najpierw Needs you. |
| MultiAgentCanvas / OLED glow | Anti-goal; nie wraca. |
| Zmiana nazwy / logo | Zakaz licencji §6.3. |
| Plugin Studio UI | Czeka na lukę z Testera A1 — może być osobny ekran w `addons/`. |
| Wskaźnik „agent patrzy” | Backend A1 (MCP Eyes) + potem mały fork badge; zależy od prototypu. |

---

## 5. Kolejność wdrożenia (UI)

| Krok | Co | Blokuje |
|---|---|---|
| A0 | Licencja Team aktywna | Fork chrome (A, B) |
| A2 | Wtyczka/strona Zadania kanału (C-lite) | — |
| A3 | Fork: Needs you + sticky Decyzja (A, B) + segment C | A0 |
| Potem | Badge Eyes + Plugin Studio UI wg luk Testera | Backend / Tester |

---

## 6. Decyzje dla lidera

1. Przyjąć **A + B + C** jako pakiet „lepszy wizualnie/obsługowo”?  
2. C-lite jako dodatek przed forkiem — tak/nie?  
3. Po A0: priorytet forka **A przed B** (najpierw lista, potem composer)?

---

## 7. Nie sprawdzone

- Piksele live OpenBot 0.68 (brak Computer Use w tym wątku).  
- Czy licencja Team już aktywna i czy daje źródła do forka.  
- Dokładne API wtyczek OpenBota pod custom `apps` (Backend A1 rozszerzenia).  
- Pełna macierz luk „oczy / Plugin Studio” (Tester A1).
