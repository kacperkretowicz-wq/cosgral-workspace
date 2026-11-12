# Raport Tester B2 — parytet 0.68 (B2a + B2b)

**Gałąź:** `team/tester/b2-parity`  
**Worktree:** `Shared\cosgral-wt\desktop-tester`  
**Data:** 12.11.2026

## Werdykt

Pełna lista w `docs/cosgral/parytet-0.68.md`: **44 wiersze** (W1–W3 + M). Względem bazy 0.1.11: **1 jest / 22 częściowo / 21 brak**. Osobna sekcja telefonu (M) dla decyzji Backendu i UI. Żadnego testu odbioru nie uruchomiono.

## Liczby według fali

| Fala | Jest | Częściowo | Brak |
|---|---|---|---|
| W1 | 1 | 11 | 7 |
| W2 | 0 | 5 | 7 |
| W3 | 0 | 6 | 4 |
| M | 0 | 0 | 3 |
| Razem | 1 | 22 | 21 |

## 10 braków W2 / 10 braków W3

Jak w `parytet-0.68.md` (pamięć, skille, MCP, Vault, rutyny, przepływy, szablony, tabele wspólne, biblioteka, przeglądarka+; oraz CU Windows, głos, dostawcy, dok, wyspa, marketplace, ustawienia, onboarding, role per agent, remote Windows).

## Telefon (M) — skrót dla Backendu/UI

- 0.68: osobna app mobilna; silnik na desktopie; **Mobile Connect** (QR / link).
- Z telefonu: czat, decyzje „czeka na Ciebie”, tworzenie/edycja agentów, powiadomienia.
- W 0.1.11: **brak** (wiersze 42–44).
- Do decyzji: Expo vs PWA, transport bez chmury OpenBot, MVP = czat + Needs you.

## Metoda

- Źródła: mapa 0.67.1, README/changelog 0.68, ASAR 8250 (B2b: `Shared\cosgral-data\desktop-tester\rea-0.68-b2b`), kod worktree.
- REA: timeout 600 s w B2a → B2b bez powtórki; fallback statyczny.
- Merge `codex/cosgral-desktop`: already up to date @ `f42d104d6`.

## Commity B2b (kolejność)

1. W2: agenci / pamięć / skille / MCP / Vault / rutyny / pliki  
2. W3 + M: CU, głos, dostawcy, zespół, telefon  
3. Liczby + ten raport  

Bez push.
