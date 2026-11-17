# Mapa tokenów projektowych COSGRAL (zgodność z OpenBot 0.71)

Dokument standaryzuje nazewnictwo i wartości tokenów projektowych `--cosgral-*` dla interfejsu COSGRAL Workspace. Opracowany na podstawie faktów wizualnych i wymiarowych zbadanych w OpenBot 0.71 (ekstrakcja 83 ekranów i 14 039 elementów interfejsu).

Dokument stanowi bezpośrednią wytyczną dla UI Designera do wdrożenia w arkuszach stylów (`src/renderer/src/styles/`).

---

## 1. Tło i powierzchnie bazowe aplikacji

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Główne tło okna (płótno robocze / canvas) | `--cosgral-bg-canvas` | `#1a1a1a` | `#f6f6f8` *(motyw jasny; brak w TOKENS.md)* |
| Tło paska bocznego (sidebar) | `--cosgral-bg-sidebar` | `#1a1a1a` | `#ececf0` *(motyw jasny; brak w TOKENS.md)* |
| Tło natywnego paska bocznego | `--cosgral-bg-sidebar-native` | `#141414` | `#ececf0` *(motyw jasny)* |
| Tło ramki zewnętrznej / obramowania okna | `--cosgral-bg-frame` | `#0d0d0d` | `#e5e5ea` *(motyw jasny)* |
| Przesłona modalna (overlay) | `--cosgral-bg-overlay` | `rgba(26, 26, 26, 0.92)` | `rgba(255, 255, 255, 0.96)` *(motyw jasny)* |
| Tło arkusza / panelu bocznego (sheet) | `--cosgral-bg-sheet` | `#141414` | `#ffffff` *(motyw jasny)* |
| Wcięcie arkusza / sekcja zagnieżdżona | `--cosgral-bg-sheet-inset` | `#101010` | `#f6f6f8` *(motyw jasny)* |
| Tło półprzezroczyste (szkło / glass) | `--cosgral-bg-glass` | `rgba(33, 33, 33, 0.76)` | `rgba(255, 255, 255, 0.8)` *(motyw jasny)* |
| Tło chromu okna z rozmyciem (chrome glass) | `--cosgral-bg-chrome-glass` | `rgba(38, 38, 40, 0.96)` | `rgba(255, 255, 255, 0.92)` *(motyw jasny)* |
| Przezroczyste tło bazowe (canvas clear) | `--cosgral-bg-canvas-clear` | `rgba(26, 26, 26, 0)` | `rgba(255, 255, 255, 0)` |

---

## 2. Kontrolki, przyciski i powierzchnie interaktywne

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Powierzchnia bazowa karty / kafelka | `--cosgral-surface-bg` | `#212121` | `#f0f0f0` *(jako surface-light w TOKENS.md)* |
| Powierzchnia uniesiona (hover / dropdown) | `--cosgral-surface-raised` | `#242424` | `#ffffff` *(motyw jasny)* |
| Tło kontrolki bazowe (przycisk, pole input) | `--cosgral-control-bg` | `#212121` | `#f1f1f5` *(motyw jasny)* |
| Tło kontrolki – najechanie (hover) | `--cosgral-control-bg-hover` | `#242424` | `#e4e4ea` *(motyw jasny)* |
| Tło kontrolki – wciśnięcie / aktywne | `--cosgral-control-bg-active` | `#2a2a2a` | `#d9d9e2` *(motyw jasny)* |
| Pasek zakładek / nawigacji (tabs bar) | `--cosgral-tabs-bar-bg` | `#212121` | `#ececf0` *(motyw jasny)* |
| Pigułka aktywnej zakładki (tabs pill) | `--cosgral-tabs-pill-bg` | `#2a2a2a` | `#ffffff` *(motyw jasny)* |
| Przełącznik – wysokość standardowa | `--cosgral-switch-height` | `20px` | `20px` |
| Przełącznik – szerokość standardowa | `--cosgral-switch-width` | `36px` | `36px` |
| Przełącznik – wcięcie / margines gałki | `--cosgral-switch-inset` | `2px` | `2px` |
| Przełącznik – średnica gałki | `--cosgral-switch-thumb` | `16px` | `16px` |
| Przełącznik mały (sm) – wysokość | `--cosgral-switch-sm-height` | `14px` | `14px` |
| Przełącznik mały (sm) – szerokość | `--cosgral-switch-sm-width` | `24px` | `24px` |
| Przełącznik mały (sm) – wcięcie gałki | `--cosgral-switch-sm-inset` | `1px` | `1px` |
| Przełącznik mały (sm) – średnica gałki | `--cosgral-switch-sm-thumb` | `12px` | `12px` |
| Wysokość kontrolki bardzo małej (xs) | `--cosgral-control-height-xs` | `24px` | `24px` |
| Wysokość kontrolki małej (sm) | `--cosgral-control-height-sm` | `28px` | `28px` |
| Wysokość kontrolki średniej (md) | `--cosgral-control-height-md` | `32px` | `32px` |
| Wysokość kontrolki dużej (lg) | `--cosgral-control-height-lg` | `36px` | `36px` |
| Wysokość kontrolki bardzo dużej (xl) | `--cosgral-control-height-xl` | `40px` | `40px` |

---

## 3. Akcent i akcja główna

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Kolor akcentu podstawowy (marka) | `--cosgral-accent` | `#007cf7` | `#007cf7` |
| Akcent – stan najechania (hover) | `--cosgral-accent-hover` | `#1f8fff` | `#1f8fff` |
| Akcent miękki (tło podświetlenia/selekcji) | `--cosgral-accent-soft` | `rgba(0, 124, 247, 0.16)` | `rgba(0, 124, 247, 0.12)` |
| Akcent mocny (wyraźne zaznaczenie) | `--cosgral-accent-strong` | `rgba(0, 124, 247, 0.34)` | `rgba(0, 124, 247, 0.25)` |
| Tekst w kolorze akcentu | `--cosgral-accent-text` | `#42a0ff` | `#007cf7` |
| Tekst na tle akcentu | `--cosgral-text-on-accent` | `#ffffff` | `#ffffff` |
| Tło przycisku akcji głównej | `--cosgral-action-bg` | `#f0f0f0` | `#141414` |
| Tekst przycisku akcji głównej | `--cosgral-action-text` | `#141414` | `#ffffff` |

---

## 4. Kolory tekstu i hierarchia czytelności

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Tekst główny (podstawowy / primary) | `--cosgral-text-primary` | `#ffffff` | `#141414` *(w TOKENS.md jako text-on-light)* |
| Tekst drugorzędny (secondary) | `--cosgral-text-secondary` | `#dcdcdc` | `rgba(20, 20, 28, 0.78)` |
| Tekst pomocniczy wyciszony (muted) | `--cosgral-text-muted` | `#979797` | `rgba(20, 20, 20, 0.52)` *(w TOKENS.md jako text-muted-on-light)* |
| Tekst przygaszony (dim / nieaktywny) | `--cosgral-text-dim` | `#6a6a6a` | `rgba(20, 20, 20, 0.36)` *(w TOKENS.md jako text-dim-on-light)* |
| Tekst zastępczy pola (placeholder) | `--cosgral-text-placeholder` | `#bfbfbf` | `#595961` |
| Tekst o podwyższonej czytelności | `--cosgral-text-readable` | `rgba(255, 255, 255, 0.52)` | `rgba(20, 20, 28, 0.66)` |
| Tekst na jasnym tle (ogólny) | `--cosgral-text-on-light` | `#141414` | `#141414` *(w TOKENS.md)* |

---

## 5. Kolory semantyczne: błąd, ostrzeżenie, sukces, odznaki

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Błąd / niebezpieczeństwo (danger) | `--cosgral-danger` | `#fd2f3b` | `#aa241d` |
| Błąd – najechanie (hover) | `--cosgral-danger-hover` | `#fd5d67` | `#8f1c16` |
| Tekst błędu | `--cosgral-danger-text` | `#ff6069` | `#aa241d` |
| Obramowanie stanu błędu | `--cosgral-danger-border` | `rgba(253, 47, 59, 0.5)` | `rgba(170, 36, 29, 0.5)` |
| Miękkie tło błędu | `--cosgral-danger-soft` | `rgba(253, 47, 59, 0.16)` | `rgba(179, 38, 30, 0.1)` |
| Pierścień skupienia błędu | `--cosgral-danger-focus` | `rgba(253, 47, 59, 0.4)` | `rgba(170, 36, 29, 0.4)` |
| Ostrzeżenie (warning) | `--cosgral-warning` | `#ff9412` | `#ff9412` |
| Tekst ostrzeżenia | `--cosgral-warning-text` | `#ff9412` | `#6e4a0d` |
| Miękkie tło ostrzeżenia | `--cosgral-warning-soft` | `rgba(255, 148, 18, 0.12)` | `rgba(154, 107, 18, 0.14)` |
| Odznaka zatwierdzenia / decyzji | `--cosgral-approval-soft` | `rgba(255, 148, 18, 0.18)` | `rgba(154, 107, 18, 0.18)` |
| Sukces (success) | `--cosgral-success` | `#31cf76` | `#1a6e39` |
| Tekst sukcesu | `--cosgral-success-text` | `#31cf76` | `#1a6e39` |
| Miękkie tło sukcesu | `--cosgral-success-soft` | `rgba(49, 207, 118, 0.12)` | `rgba(26, 110, 57, 0.1)` |
| Poświata sukcesu (wash) | `--cosgral-success-wash` | `rgba(49, 207, 118, 0.045)` | `rgba(26, 110, 57, 0.04)` |
| Odznaka nowości (badge new) | `--cosgral-badge-new` | `#ff1e5e` | `#d9144d` |
| Odznaka nowości – miękkie tło | `--cosgral-badge-new-soft` | `rgba(255, 30, 94, 0.16)` | `rgba(217, 20, 77, 0.14)` |

---

## 6. Promienie zaokrągleń (border-radius)

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Zaokrąglenie mikro (xs) | `--cosgral-radius-xs` | `4px` | `4px` |
| Zaokrąglenie małe (sm) | `--cosgral-radius-sm` | `6px` | `6px` |
| Zaokrąglenie średnie (md / przyciski, pola) | `--cosgral-radius-md` | `8px` | `8px` |
| Zaokrąglenie duże (lg / kontenery) | `--cosgral-radius-lg` | `12px` | `12px` |
| Zaokrąglenie karty głównej (card) | `--cosgral-radius-card` | `14px` | `14px` |
| Zaokrąglenie grupy kontrolek (grouped) | `--cosgral-radius-grouped` | `16px` | `16px` |
| Zaokrąglenie bardzo duże (xl) | `--cosgral-radius-xl` | `20px` | `20px` |
| Zaokrąglenie bąbla wiadomości | `--cosgral-radius-bubble` | `22px` | `22px` |
| Wcięcie wewnętrzne bąbla | `--cosgral-radius-bubble-inset` | `9px` *(calc(22px - 12px - 1px))* | `9px` |
| Zaokrąglenie okna modalnego (modal) | `--cosgral-radius-modal` | `30px` | `30px` |
| Zaokrąglenie pigułki / okrągłe (pill) | `--cosgral-radius-pill` | `999px` | `999px` |
| Zaokrąglenie awatara / logo | `--cosgral-radius-logo` | `20%` | `20%` |

---

## 7. Typografia: krój, wagi, rozmiary i interlinie

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Krój bezszeryfowy podstawowy | `--cosgral-font-sans` | `"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | `"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| Krój o stałej szerokości (kod, logi) | `--cosgral-font-mono` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` |
| Waga czcionki zwykła (regular) | `--cosgral-font-weight-regular` | `400` | `400` |
| Waga czcionki średnia (medium – najczęstsza) | `--cosgral-font-weight-medium` | `500` | `500` |
| Waga czcionki półgruba (semibold) | `--cosgral-font-weight-semibold` | `600` | `600` |
| Waga czcionki gruba (bold) | `--cosgral-font-weight-bold` | `700` | `700` |
| Rozmiar mały (sm / stopki, mikro-etykiety) | `--cosgral-font-size-sm` | `12px` | `12px` |
| Rozmiar pomocniczy (md / drugorzędne) | `--cosgral-font-size-md` | `13px` | `13px` |
| Rozmiar podstawowy (lg / treść główna czatu) | `--cosgral-font-size-lg` | `14px` | `14px` |
| Rozmiar powiększony (xl / nagłówki sekcji) | `--cosgral-font-size-xl` | `16px` | `16px` |
| Rozmiar tytułowy podrzędny (2xl) | `--cosgral-font-size-2xl` | `18px` | `18px` |
| Rozmiar tytułowy modalny (3xl) | `--cosgral-font-size-3xl` | `24px` | `24px` |
| Rozmiar ekspozycyjny (display) | `--cosgral-font-size-display` | `32px` | `32px` |
| Interlinia mała (dla 12px) | `--cosgral-leading-sm` | `16px` | `16px` |
| Interlinia pomocnicza (dla 13px) | `--cosgral-leading-md` | `18px` | `18px` |
| Interlinia standardowa (dla 14px – najczęstsza) | `--cosgral-leading-lg` | `21px` *(oraz 20px)* | `21px` |
| Interlinia powiększona (dla 16px) | `--cosgral-leading-xl` | `24px` *(oraz 22px)* | `24px` |
| Interlinia tytułowa 2xl (dla 18px) | `--cosgral-leading-2xl` | `24px` | `24px` |
| Interlinia tytułowa 3xl (dla 24px) | `--cosgral-leading-3xl` | `30px` | `30px` |
| Interlinia ekspozycyjna (dla 32px) | `--cosgral-leading-display` | `38px` | `38px` |
| Odstęp między literami zwarty (tracking tight) | `--cosgral-tracking-tight` | `-0.1px` | `-0.1px` |

---

## 8. Odstępy, siatka i dopełnienia (spacing & padding)

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Skok siatki 0.5 (2px) | `--cosgral-space-0-5` | `2px` | `2px` |
| Skok siatki 1 (4px) | `--cosgral-space-1` | `4px` | `4px` |
| Skok siatki 1.5 (6px) | `--cosgral-space-1-5` | `6px` | `6px` |
| Skok siatki 2 (8px) | `--cosgral-space-2` | `8px` | `8px` |
| Skok siatki 3 (12px) | `--cosgral-space-3` | `12px` | `12px` |
| Skok siatki 4 (16px) | `--cosgral-space-4` | `16px` | `16px` |
| Skok siatki 6 (24px) | `--cosgral-space-6` | `24px` | `24px` |
| Skok siatki 8 (32px) | `--cosgral-space-8` | `32px` | `32px` |
| Odstęp w układzie flex/grid (gap mikro) | `--cosgral-gap-xs` | `4px` | `4px` |
| Odstęp w układzie (gap zwarty – najczęstszy) | `--cosgral-gap-sm` | `6px` | `6px` |
| Odstęp w układzie (gap średni) | `--cosgral-gap-md` | `8px` | `8px` |
| Odstęp w układzie (gap duży) | `--cosgral-gap-lg` | `12px` | `12px` |
| Odstęp w układzie (gap sekcyjny) | `--cosgral-gap-xl` | `16px` | `16px` |
| Dopełnienie kontrolki (pion 8px, poziom 12px) | `--cosgral-pad-control` | `8px 12px` | `8px 12px` |
| Dopełnienie zwarte (pion 4px, poziom 8px) | `--cosgral-pad-sm` | `4px 8px` | `4px 8px` |
| Dopełnienie karty / sekcji | `--cosgral-pad-card` | `16px` | `16px` |

---

## 9. Obramowania, linie i cienie (borders & shadows)

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Obramowanie subtelne (podstawowe) | `--cosgral-border` | `rgba(255, 255, 255, 0.035)` | `rgba(20, 20, 20, 0.14)` *(w TOKENS.md jako border-on-light)* |
| Obramowanie mocne (separatory, nagłówki) | `--cosgral-border-strong` | `rgba(255, 255, 255, 0.045)` | `#73737d` *(motyw jasny)* |
| Obramowanie aktywne / fokus | `--cosgral-border-focus` | `#979797` | `#4d44d6` *(motyw jasny)* |
| Pierścień skupienia (focus ring standard) | `--cosgral-focus-ring` | `0 0 0 1px #979797` | `0 0 0 3px #4d44d6` *(motyw jasny)* |
| Pierścień skupienia akcentu | `--cosgral-focus-ring-accent` | `rgba(0, 124, 247, 0.16) 0px 0px 0px 2px` | `rgba(0, 124, 247, 0.16) 0px 0px 0px 2px` |
| Cień karty podstawowej | `--cosgral-shadow-card` | `rgba(228, 228, 228, 0.04) 0px 1px 2px 0px` | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` |
| Cień elementu uniesionego (dropdown, tooltip) | `--cosgral-shadow-raised` | `0 12px 32px rgba(0, 0, 0, 0.1)` | `0 12px 32px rgba(0, 0, 0, 0.1)` |
| Cień menu kontekstowego | `--cosgral-shadow-menu` | `rgba(0, 0, 0, 0.45)` | `rgba(0, 0, 0, 0.15)` |
| Cień okna dialogowego (modal) | `--cosgral-shadow-dialog` | `rgba(0, 0, 0, 0.48)` | `rgba(0, 0, 0, 0.25)` |
| Cień nakładki pełnoekranowej | `--cosgral-shadow-overlay` | `0 12px 32px rgba(0, 0, 0, 0.48)` | `0 12px 32px rgba(0, 0, 0, 0.2)` |
| Cień dynamicznej wyspy (island) | `--cosgral-shadow-island` | `rgba(0, 0, 0, 0.6)` | `rgba(0, 0, 0, 0.3)` |

---

## 10. Czasy trwania, krzywe animacji i płynność (motion)

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Domyślny czas przejścia mikro-interakcji | `--cosgral-duration-default` | `150ms` | `150ms` |
| Szybki czas przejścia (hover) | `--cosgral-duration-fast` | `120ms` | `120ms` |
| Standardowy czas przełączenia widoków | `--cosgral-duration-normal` | `160ms` | `160ms` |
| Wolny czas animacji (duże panele) | `--cosgral-duration-slow` | `200ms` | `200ms` |
| Czas otwierania okna modalnego | `--cosgral-duration-modal-open` | `250ms` | `250ms` |
| Czas zamykania okna modalnego | `--cosgral-duration-modal-close` | `150ms` | `150ms` |
| Początkowa skala okna modalnego | `--cosgral-scale-modal` | `0.96` | `0.96` |
| Czas otwierania panelu bocznego | `--cosgral-duration-panel-open` | `400ms` | `400ms` |
| Czas zamykania panelu bocznego | `--cosgral-duration-panel-close` | `350ms` | `350ms` |
| Czas zwijania/rozwijania akordeonu | `--cosgral-duration-accordion` | `250ms` | `250ms` |
| Krzywa płynna nadrzędna (modal, panel, akordeon) | `--cosgral-ease-smooth` | `cubic-bezier(0.22, 1, 0.36, 1)` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Krzywa łagodnego wyjścia (ease-out) | `--cosgral-ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | `cubic-bezier(0.23, 1, 0.32, 1)` |
| Krzywa standardowa (ease-in-out) | `--cosgral-ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | `cubic-bezier(0.4, 0, 0.2, 1)` |

---

## 11. Wymiary i układ czatu (bąble wiadomości i markery)

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Wąski bąbel wiadomości (standardowy tekst) | `--cosgral-message-bubble-narrow` | `min(92%, max(420px, 50%), 800px)` | `min(92%, max(420px, 50%), 800px)` |
| Szeroki bąbel wiadomości (kod, tabele, obrazy) | `--cosgral-message-bubble-wide` | `min(100%, max(720px, 70%), 1200px)` | `min(100%, max(720px, 70%), 1200px)` |
| Odstęp pionowy między wpisami w czacie | `--cosgral-chat-entry-gap` | `12px` | `12px` |
| Rozmiar awatara znacznika wiadomości | `--cosgral-chat-marker-avatar` | `16px` | `16px` |
| Wysokość znacznika wiadomości | `--cosgral-chat-marker-height` | `24px` | `24px` |
| Odstęp wewnętrzny znacznika wiadomości | `--cosgral-chat-marker-gap` | `4px` | `4px` |
| Maksymalna szerokość znacznika wiadomości | `--cosgral-chat-marker-width` | `680px` | `680px` |

---

## 12. Poziomy nakładania warstw (z-index)

| Rola tokenu | Nazwa `--cosgral-*` | Wartość ciemna | Wartość jasna (jeśli jest w TOKENS.md) |
|---|---|---|---|
| Menu rozwijane (dropdown) | `--cosgral-z-dropdown` | `40` | `40` |
| Okienko podręczne (popover) | `--cosgral-z-popover` | `60` | `60` |
| Dialog / okno modalne | `--cosgral-z-dialog` | `100` | `100` |
| Powiadomienie ulotne (toast) | `--cosgral-z-toast` | `120` | `120` |
| Podpowiedź (tooltip) | `--cosgral-z-tooltip` | `240` | `240` |

---

## Wytyczne wdrożeniowe dla UI Designera

1. **Struktura stylów:**
   - Zdefiniować powyższe zmienne w pliku bazowym (np. `src/renderer/src/styles/cosgral.css` lub `tokens.css`) pod selektorem `:root` dla trybu ciemnego (domyślnego).
   - Dla selektora `:root[data-theme="light"]` (lub `[data-story-theme="light"]`) nadpisać wartości jasne z powyższych tabel.
2. **Zachowanie zgodności:**
   - Nie usuwać gwałtownie starych zmiennych aliasowych dopóki istniejące komponenty z nich korzystają; zmapować stare aliasy na nowe tokeny `--cosgral-*` (np. `--openbot-bg-canvas: var(--cosgral-bg-canvas);`).
3. **Płynność i wrażenia wizualne:**
   - Zastosować krzywą `--cosgral-ease-smooth: cubic-bezier(0.22, 1, 0.36, 1)` przy wszystkich animacjach wysuwania i modali, aby odtworzyć płynność OpenBota 0.71.
