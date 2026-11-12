# COSGRAL Workspace — makiety fali W1

**Status:** high-fi shape (impeccable), light + dark.  
**Baza wizualna:** system SolidJS 2 z OpenBot 0.1.11 (tokeny, rytm, chrome).  
**Lepszy (zaakceptowane):** A Needs you · B sticky Decyzja · C Chat | Zadania · visual twin.

## Obrazy

| Motyw | Plik |
|---|---|
| Ciemny | [ui-w1/shell-dark.svg](ui-w1/shell-dark.svg) · [ui-w1/shell-dark.png](ui-w1/shell-dark.png) |
| Jasny | [ui-w1/shell-light.svg](ui-w1/shell-light.svg) · [ui-w1/shell-light.png](ui-w1/shell-light.png) |
| Logo | [../../build/icon.svg](../../build/icon.svg) · [../../src/renderer/src/assets/cosgral-logo-production.png](../../src/renderer/src/assets/cosgral-logo-production.png) |

## Shape (jedna kompozycja)

```
[rail serwerów] [sidebar agentów/kanałów] [chat | zadania] [panel boczny]
                      Needs you ↑                 sticky Decyzja nad composerem
```

1. **Szyna serwerów** — wąska, logo C, lokalny host + dołączone serwery, ustawienia na dole.  
2. **Foldery agentów** — wiersze ze stanami: myśli · czeka na Ciebie · limit · błąd; sekcja **Needs you** na górze (A).  
3. **Kanał** — lider + zadania; przełącznik **Chat | Zadania** (C).  
4. **Karty w czacie** — pytanie, zatwierdzenie, podgląd szkicu, przejęcie przeglądarki.  
5. **Panel boczny** — pliki / kontekst / limity (jedna kolumna, bez dashboardu kart).  
6. **Sticky Decyzja** (B) — pasek nad composerem, widoczny przy scrollu.

## Motywy

| Element | Dark | Light |
|---|---|---|
| Tło główne | `#0b0c10` | `#f4f6fa` |
| Sidebar | `#101218` | `#eef1f7` |
| Akcent / marka | `#2f6fed` | `#2f6fed` |
| Needs you | warn wash + stroke | `#fff8eb` + gold stroke |
| Tekst | `#f2f4f8` / muted `#8b93a7` | `#12141a` / muted `#6b7385` |

## Kryteria akceptacji W1 (UI)

- [ ] Zero widocznych napisów „OpenBot” w chrome i kartach.  
- [ ] Logo i ikony COSGRAL (C mark), nie oczy OpenBot.  
- [ ] Needs you ≤ 1 s od zdarzenia „czeka na Ciebie”.  
- [ ] Sticky Decyzja nie znika przy scrollu czatu.  
- [ ] Chat | Zadania zachowuje kontekst kanału.  
- [ ] Light i dark używają tych samych hierarchii i rytmów.

## Poza zakresem W1

Implementacja kodu A+B+C (poza marką) — osobne zadania po akceptacji makiet.  
Funkcje 0.68 spoza W1 — według `parytet-0.68.md` (Tester).
