# W1-UI3a — karty akcji

- Szkic i potwierdzenie pokazują treść, odbiorcę i kanał w czacie oraz w przypiętej decyzji. Edit przekazuje zmieniony tekst do ponownego przygotowania; Keep draft/Cancel korzysta z decyzji `keep-draft` kontraktu.
- Przejęcie pojawia się w Needs you; po przejęciu otwiera panel wskazanej karty, a Return to agent oddaje ją backendowi. Otwarte karty wracają z `listPendingRequests`.
- Testy obejmują odtwarzanie szkicu, zapis na atrapie, edycję, etykiety potwierdzenia oraz przejęcie i oddanie. Stories mają wariant jasny i ciemny.
- Weryfikacja: `bun run test src/renderer` 361/361 (41 plików), `typecheck:renderer`, `typecheck:storybook` i `build` zakończone kodem 0. Obie stories otwierają się w lokalnym Storybooku.
- Nie sprawdzono przejęcia prawdziwej strony w aplikacji Electron; testy UI korzystają z atrapy API.
