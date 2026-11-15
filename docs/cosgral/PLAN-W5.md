# PLAN W5: subskrypcje bez terminala (start 16.11.2026 00:22)

Źródła: `docs/cosgral/spec-w5-subskrypcje.md` (kontrakty, zadania, ryzyka), dokument źródłowy (`Shared\cosgral-docs\luki-070.txt`, sekcja W5). Obowiązują zasady z `PLAN-W4.md` (gotowe = backend + UI + test + krok e2e/odbioru + wpis w parytecie, clean room do 0.1.11, push tylko `team/*`, sekrety nigdy w repo, max 2 agentów ciężkich naraz, nie zabijać wszystkich procesów bun).

## Decyzje właściciela (16.11.2026, w kanale)
1. **Bramka G1: POTWIERDZONA.** Dowód: pełne `bun run check` exit 0, `sandbox:e2e` 24/24, odbiór 38/38, Codex 4/4 i Claude 4/4 tur.
2. **„Na wszystko, idziemy dalej”:** zgoda na rekomendacje lidera z `docs/cosgral/DECYZJE-WLASCICIELA.md` i z §6 specyfikacji W5. Wyjątek (lider nie robi bez osobnej, wyraźnej zgody): przepisanie historii gita z force-push i zmiana widoczności lub domyślnej gałęzi repozytorium. To zostaje do osobnego pytania.
3. **CLI pobierane automatycznie** przez program (oficjalne źródła, SHA-256, folder per wersja), **ale konfigurowalnie jak w OpenBocie:** w Ustawieniach przełącznik „aktualizuj automatycznie”, przypięcie wersji, ręczne „Sprawdź / Zaktualizuj / Usuń”, wskazanie własnej ścieżki CLI zamiast pobranego.
4. **Pula kont: TAK, konfigurowalna jak w OpenBocie:** wiele kont na dostawcę, wybór konta per agent, kolejność i włączanie/wyłączanie kont w puli, przejście na kolejne konto przy limicie (tylko przed pierwszą akcją tury, R7), limit liczby kont w puli (domyślnie 3, zmienny). Pula tylko z kont właściciela, bez dzielenia jednego konta między osoby (R1). Kolejność warstw: najpierw inne konto tego samego modelu, potem kolejny model zapasowy (do 8).
5. Klucze API (OpenAI, Anthropic) w `safeStorage` tylko w env procesu CLI: TAK, włączone w W5-BE3. Ollama i LM Studio: wykrywanie i endpointy OpenAI-compatible w W5-K2.
6. Clean room: zachowanie opisujemy własnymi słowami z dokumentu źródłowego, bez czytania kodu OpenBota nowszego niż 0.1.11 i bez kopiowania grafik i tekstów.

## Kolejność zadań (z spec-w5 §3)
| Kolejność | ID | Kto | Zadanie | Stan |
|---|---|---|---|---|
| 0 | W5-T1 | KAPI (doc, lekkie) | Kryteria odbioru W5 własnymi słowami, `docs/cosgral/spec-w5.md` | do przydziału |
| 1 | W5-BE1 | Backend | Kontrakt `ipc-subscriptions.ts` (najpierw, atrapy dla UI) i CLI zarządzane (pobranie, SHA-256, przypięcie, auto-aktualizacja, własna ścieżka) | do przydziału |
| 2 | W5-BE2 | Backend | Logowanie i wylogowanie w aplikacji | po BE1 |
| 3 | W5-K1 | KAPI | Konta i pula (konfigurowalna), wybór konta per agent, przejście przy limicie | po BE2 |
| 3 | W5-BE3 | Backend | Klucze API w safeStorage | po BE2 |
| 4 | W5-K2 | KAPI | Endpointy OpenAI-compatible, Ollama, LM Studio | po K1 |
| 4 | W5-BE4 | Backend | 8 modeli zapasowych, przejście przed pierwszą akcją | po K1 |
| 5 | W5-UI1/UI2 | UI Designer | Strona Dostawcy, krok „połącz”, użycie i limity | po kontraktach |
| 6 | W5-T2 | KK (+ właściciel) | Odbiór na czystym koncie Windows i prawdziwych kontach, bramka G2 | na końcu |

Równolegle (nie W5): W4-T5 (KK, wiersze 24/26/30/35) i W4-UI4 (UI Designer, wiersze 2/3).