# Raport KAPI (godzinowa): launchAtLogin

**Gałąź:** `team/kapi/w12-login` (z integracji `3b41ffa54`)  
**Data:** 18.11.2026 ~16:55

## Stan luk a–c

| Luka | Stan |
|---|---|
| (a) `agentCards.details` dla niedostępnych | już jest (silnik + UI) |
| (b) wstrzymania wątku `heldKind` | już jest (Backend) |
| (c) inne ROBIĆ odblokowujące UI | **launchAtLogin** (atrapa w Settings → General) |

## Co zrobiłem

1. Kontrakt `AppSettings.behavior.launchAtLogin` (+ `DEFAULT_APP_BEHAVIOR`, normalize/parse).
2. Magazyn w `agent-settings` (przeżywa restart).
3. Main: `app.setLoginItemSettings({ openAtLogin })` przy get/update app settings (`agent-settings-ipc.ts`, bez `index.ts` / `agent-service.ts`).
4. UI: przełącznik w `SettingsModal` podpięty do IPC (nie `defaultChecked`).

## Notka dla UI

```ts
window.openbot.appSettings.update({ behavior: { launchAtLogin: true } });
// odczyt: settings.behavior.launchAtLogin
```

Zdarzenie `app-settings-changed` jak dotąd. „Keep in background” i „Restore last workspace” nadal atrapy.

## Testy

| Plik | Wynik |
|---|---|
| `ipc-agent-settings.test` | 9/9 |
| `agent-settings.test` | 13/13 |
| `agent-settings-inputs.test` | 3/3 |
| Biome (5 plików) | OK |
| typecheck contracts/node/renderer | EXIT 0 |

## Luki

- Nie sprawdzone w prawdziwym Windows (login item po restarcie sesji).
- `dist:win` czeka na `GO-kapi-*` (dziś leży tylko `GO-tester-e2e.txt`).
- Keep background / restore workspace: brak.
