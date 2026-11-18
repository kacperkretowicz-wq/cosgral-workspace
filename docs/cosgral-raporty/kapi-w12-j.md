# Raport KAPI-J: PL/EN HostPanel + ChannelView

**Gałąź:** `team/kapi/w12-j` (z `5ac646674`)  
**Data:** 18.11.2026  
**Ciche okno:** kod + commit; `i18n.test` i `dist:win` po GO.

## Pkt 1

| Plik | Stan |
|---|---|
| `HostPanel.tsx` | sztywny EN → `t()` (ok. 90 wywołań, ~95 nowych kluczy) |
| `ChannelView.tsx` | pozostałe sztywne napisy → `t()` (~15) |
| Marketplace*, Workflows*, PluginAppsPanel, InitialSetup | już na `t()` — bez zmian (minimum linii / czysty merge z UI) |
| `locales/en.ts` + `pl.ts` | +95 par, katalogi równe (1280) |
| `i18n.test.tsx` | dodane `HostPanel`, `ChannelView` do skanu literałów |

**Unikalne klucze w Host+Channel po zmianie:** 107 (wszystkie w obu katalogach).  
**Poza ChannelRoutinesPanel** (UI) — nietknięte.

## Pkt 2

Czeka na GO lidera: `bun run dist:win` + rozmiar/SHA-256 (plik poza repo) oraz `i18n.test`.
