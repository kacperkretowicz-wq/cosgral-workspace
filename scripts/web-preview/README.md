# Podgląd COSGRAL Workspace w przeglądarce

Prawdziwy interfejs (`src/renderer`) na atrapie API ze Storybooka zamiast silnika Electron. Dane są demonstracyjne; żaden agent, plik ani połączenie nie jest prawdziwe. Na start dwóch agentów czeka na decyzję, żeby było widać „Needs you” i przypiętą Decyzję.

```powershell
$env:PATH = "Shared\tools\bun;Shared\tools\node;$env:PATH"
bun x vite build --config scripts/web-preview/vite.config.ts      # wynik: out/web-preview
bun x vite preview --config scripts/web-preview/vite.config.ts --host 127.0.0.1 --port 4799
```

- Wynik musi mieścić się w hostingu statycznym: każdy plik < 1 MB, łącznie < 1,8 MB (limit hostingu 2 MB). Config podglądu zrzuca Inter (system fonts), minifikuje CSS i dzieli chunki (`locales` / `fixtures` / `solid` / `ui-vendor` / `vendor`). Po KAPI-M: ~1,78 MB łącznie, max plik ~781 KB, 9 plików.
- Podgląd jest publiczny, dlatego `vite.config.ts` podmienia w atrapie imię prawdziwej osoby i linki do cudzej strony. Przed publikacją sprawdź wynik: `Select-String out\web-preview\assets\*.js -Pattern "norbert|openbot\.run"` ma dać 0 trafień.
- Po każdym scaleniu lider buduje podgląd od nowa i podmienia stronę pod tym samym adresem.
