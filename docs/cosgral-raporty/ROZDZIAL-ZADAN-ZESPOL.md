# COSGRAL Workspace — Oficjalny podział obowiązków (4 Agentów Czatu)

Data: 12.11.2026 07:15 CET  
Lider / Koordynator: **Gremlinek**

---

## 1. Skład 4 agentów czatu i ich obszary odpowiedzialności

| # | Agent | Identyfikator | Przypisany obszar odpowiedzialności | Bieżące zadanie wykonawcze |
|---|---|---|---|---|
| 1 | **Gremlinek** | `agent-d7fed197-992e-4845-890b-51a177d4a215` | **Lider, koordynacja i integracja:** Zarządzanie całością, pilnowanie limitów i rotacji, integracja kodu, utrzymywanie grafu (`graphify`), nadzór nad stabilnością. | Koordynacja prac pozostałej trójki, weryfikacja scalania i budowania `.exe`. |
| 2 | **Geminek** | `agent-cc276432-707c-40ad-8a16-cd8da69e9473` | **Architektura UI / Frontend (Impeccable):** Multi-Agent Canvas, ciemny motyw OLED, brak AI-slop, interaktywne karty czatu i widok wspólnych sesji. | [UKOŃCZONE P0] Przygotowanie `PRODUCT.md` i `DESIGN.md`. [KOLEJNE] Implementacja komponentów w `ui/src/`. |
| 3 | **Cursor K** | `agent-b0142c6f-df13-4c9c-b461-ab8dcc48b9f8` | **Powłoka Desktopowa (.EXE) & Backend:** Electron 37 main process, IPC contracts, autostart, packaging NSIS, baza PostgreSQL/SQLite, uruchomienie serwera na loopback. | Wdrożenie skryptów produkcyjnego instalatora NSIS i integracja okna z backendem. |
| 4 | **Claude K** | `agent-e4a9b3ad-0fc3-4460-bdb3-bcffb295ab0e` | **Grok-Eyes & Dynamic Bot Plugin Studio:** Przechwytywanie obrazu okien w czasie rzeczywistym (percepcja multimodalna) oraz silnik tworzenia narzędzi MCP w locie przez boty. | Implementacja modułu screen-capture w Electronie i endpointu dynamicznego ładowania pluginów. |

---

## 2. Harmonogram wdrożenia
1. **Geminek:** Koduje layout Canvasu i szynę agentów według `DESIGN.md`.
2. **Cursor K:** Buduje instalator `.exe` łączący Node loopback i Electron window.
3. **Claude K:** Dostarcza specyfikację i kod adaptera wzroku (Grok-Eyes) oraz JIT Plugin Studio.
4. **Gremlinek:** Scala commity, przeprowadza testy smoke i raportuje postęp.
