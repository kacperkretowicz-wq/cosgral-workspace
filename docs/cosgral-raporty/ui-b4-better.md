# Raport B4 — Lepszy A+B+C

**Gałąź:** `team/ui/b4-better`  
**Baza:** `codex/cosgral-desktop` @ `f42d104d6`  
**Agent:** UI Designer  
**Data:** 12.11.2026

## Werdykt

Kod A+B+C w rendererze: Needs you, przyklejona Decyzja, Chat | Zadania (Storybook atrapa). `typecheck:renderer` i `build` OK. Testy jednostkowe nowych modułów zielone.

## Co działa

| | Zachowanie |
|---|---|
| **A Needs you** | Sekcja nad listą agentów z liczbą; klik → `selectBot` (karta sticky w rozmowie). Stan wiersza `needs-you`. Źródło: tylko `prompt` + `approval` (kontrakt Backend). |
| **B Sticky Decyzja** | `StickyDecision` nad kompozytorem; najstarsza otwarta karta; znika po `respondToPrompt` / `respondToApproval`. Kompozytor ukryty, dopóki decyzja czeka. |
| **C Chat \| Zadania** | `ChatTasksSwitch` + `ChannelTasksPanel` na atrapie `ChannelTask` (Storybook `Better/Lepszy A+B+C`). |

Stories: `src/renderer/stories/BetterUx.stories.tsx` (light + dark dla C).

## Dane brakujące od Backendu (do W1)

1. Trwała lista pending po reloadzie: `agent:list-pending-requests`, `prompt-resolved`, `approval-resolved`.  
2. Kanały + zadania: `ChannelTask`, `task-changed`, `channels.listTasks(channelId)` — uzgodniony kształt atrapy.  
3. Osobna prośba o przejęcie przeglądarki (dziś `browser-control.waiting` ≠ człowiek).  
4. Limit / błąd wiersza — sygnały pośrednie; nie w Needs you B4.  
5. A1: zdarzenia „agent patrzy” + zgoda.

## Dowód

- Testy: `needs-you`, `StickyDecision`, `ChannelTasksPanel`, `Sidebar.needs-you`.  
- Brak żywego zrzutu Electron w tym wątku (Computer Use tylko w czacie głównym). Dowód UI = Storybook stories + testy. Opcjonalnie: uruchomić `bun run storybook` → Better/Lepszy A+B+C.

## Nie sprawdzone

- Pełny `App.test.tsx` regresji po przeniesieniu kart do sticky.  
- Storybook screenshot PNG w piaskownicy.  
- Merge B1 (`localProfile`) — nie wymagane do A/B/C.
