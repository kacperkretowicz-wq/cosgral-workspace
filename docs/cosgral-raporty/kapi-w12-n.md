# KAPI-N — i18n Conversation (panel ustawień) + wygląd (skala/czcionka/akcent)

Gałąź: `team/kapi/w12-n` (baza `78d908540`). Bez push, bez Electrona, bez `dist:win`.

## 1. i18n

+**~34** klucze PL/EN (katalogi równe; po mergu M: 1454/1454).

| Obszar | Stan |
|---|---|
| Panel boczny Settings w `Conversation` | Name/Title/Description/Runtime/Reasoning/Notifications + awatar |
| Kicker | `Decision · pinned` |
| Znaczniki wiadomości | Pinned / Edited / Regenerated answer |
| Reakcje / media / Conversation aria | `t()` |

## 2. Luka (parytet wiersz 2 — wygląd)

**Dlaczego ta:** Backend/KK/UI w tej rundzie nie biorą skalowania UI / czcionki / koloru akcentu (BE-Z = `historyWindow`, KK = Clear history + SettingsModal, UI = ekrany P0/P1). Kontrakt `appearance` już był (BE-U), ale **nic nie malowało** go w oknie — atrapa ustawień bez skutku.

**Co dodałem:**
1. Kontrakt: `appearanceDomTokens()` → data-* + `--openbot-ui-scale` / accent hex.
2. Silnik okna: `startAppearance()` / `applyAppearanceDom()` (jak `theme.ts`), start w `index.tsx`.
3. CSS: `html { font-size: calc(16px * var(--openbot-ui-scale, 1)) }`, `body` czyta `--openbot-font-sans`.

**Notka IPC dla UI:** kontrolki w `AppearanceSettings` mogą wołać `appSettings.update({ appearance: { uiScale, font, chatAccent, … } })` — okno od razu zmienia skalę/czcionkę/akcent. `sendShortcut` / `unreadFirst` / `agentSteps` są na `dataset` (do podpięcia zachowania później).

## 3. Testy

| Plik | Wynik |
|---|---|
| `ipc-agent-settings.test` (nowy: DOM tokens) | ✅ |
| `appearance.test` | ✅ |
| `i18n.test` | ✅ |
| Biome | na zmienionych |
| typecheck contracts / renderer | przed oddaniem |

## Luki

1. `AppearanceSettings` nadal tylko motyw — UI musi dodać listy skali/czcionki/akcentu.
2. `sendShortcut` nie zmienia Enter w composerze (tylko dataset).
3. `unreadFirst` / `agentSteps` nie sortują/zwijają jeszcze listy.
4. Inne TSX poza Conversation nadal mają sztywne EN (AccessSettings, Budget…).
5. Podgląd 1,78 MB — kolejne fixture mogą nacisnąć limit (pozycja 2 kolejki).
