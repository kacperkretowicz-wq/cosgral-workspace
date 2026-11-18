# KAPI-G / w12-i18n3

Gałąź: `team/kapi/w12-i18n3` z integracji `fb6a09a6d`.

## Wynik

1. **en.ts ↔ pl.ts:** przed zmianą 1033=1033, bez luk klucz↔klucz.
2. **Ekrany z listy:** `ProviderAccounts`, `UsagePage`, `ProviderCatalogPanel`, `TasksViewScreen`, `UsageReportView` — wszystkie `t()` już miały wpisy PL.
3. **ProvidersPage:** ~53 sztywnych napisów EN bez `t()` / bez klucza PL — owinięte w `t()`, dopisane EN+PL.
4. **Nie ruszane:** Marketplace*, Workflows*, PluginAppsPanel.

## Dodane klucze PL (53)

Choose an id.; Start with a lowercase… {limit}; An agent with this id already exists.; Give the agent a name.; Use at most {n} characters.; Enter the program to run.; Use at most {n} arguments.; Each argument can have at most {n} characters.; ACP agent; Available; Limit reached; Resets at; Back at; No reset time was given.; {percent}% used; Could not add/remove the agent.; ACP agents; Any program that speaks…; No ACP agent is added.; Remove {name}; Confirm removing {name}; Agents set to {model}…; Yes, remove; Keep; Add ACP agent; Add an ACP agent; Id; Becomes part of its model id…; The program to start…; Arguments; One per line.; You can add up to {count} ACP agents.; Adding...; Agents using a fallback model; {name} is using {active} instead of {own}.; Fallback; All providers; Could not load fallback models.; Fallback order saved.; Could not save the order.; Providers are unavailable.; Could not load endpoint groups/ACP agents/agents.; See which providers…; Could not refresh the chain.; Recent switches; Agent fallback settings; Using provider and all-provider lists; Agent's own list; Could not reset the list.; Reset to provider list.

## Po oknie GO

`i18n.test` + `ProviderAccounts` (po jednym) + Biome na własne pliki.
