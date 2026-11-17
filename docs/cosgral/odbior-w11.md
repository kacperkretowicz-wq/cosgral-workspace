# Odbiór W11 w oknie (przygotowany do GO)

**Autor:** Tester (T-D) · **Gałąź:** `team/tester/w12-steps`  
**Uruchomienie:** tylko po pliku `GO-*.txt` od lidera w `Shared\cosgral-sandbox`.

```
COSGRAL_MODE=w11 COSGRAL_SANDBOX_ROOT=<sandbox> node scripts/sandbox-acceptance.ts
```

Kroki: `scripts/sandbox-w11-acceptance.ts` (tryb w `sandbox-acceptance.ts`).  
Launch: `--lang=en-US` + `cleanEnvironment()` (`scripts/sandbox-env.ts`) — PL Windows i zmienne CLAUDE_*/OPENBOT_*/tokeny nie wchodzą do piaskownicy.

| ID | Co sprawdza | API |
|---|---|---|
| W11-0 | Pierwszy start, Assistant, EN | UI |
| W11-1 | Zakładki wątków | `threadTabs.get` + pasek `.thread-tabs` |
| W11-2 | Wyszukiwarka + zakładki All…Routines | `search.query` (+ Ctrl+K) |
| W11-3 | Polecenia `/` | `composer.listSlashCommands` + listbox |
| W11-4 | `@` | `composer.searchMentions` (+ listbox; UI może jeszcze używać lokalnych botów) |
| W11-5 | Pytanie boczne | `askSideQuestion` → `failed` + „not connected” (do czasu wykonawcy BE) |
| W11-6 | Karty agenta | `agentCards.overview` (14) + `getPreferences` |
| W11-7 | Vault konektory | `vaultConnectors.list` (3 id, bez sekretów w statusie) |
| W11-8 | Marketplace Aplikacje | `pluginCatalog.info` + `list` |

Wynik: `<sandbox>/evidence/acceptance-w11.json`.
