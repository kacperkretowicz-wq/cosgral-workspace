# Spec W9: kryteria odbioru (telefon poza domem — Tailscale, Web Push, PIN)

**Stan: 16.11.2026, integracja `codex/cosgral-desktop` @ `b765a716a`. Autor: Tester (W9-T1), tylko dokument / grep, bez uruchamiania programu.**

Opis zachowania i kryteria odbioru. Podstawa dla Backend (W9-BE1/BE2), UI (W9-UI1) i odbioru T1 na prawdziwych telefonach. Fala: `PLAN-W4.md` — W9 = telefon poza domem (Tailscale), push, PIN. Bramka **G6** (`luki-070.txt`): decyzja z telefonu poza domem działa u obu wspólników.

## Na górze

- **Sytuacji: 28** (sekcja 1). **Kryteriów: W9-01 … W9-34.**
- **Wymaga właściciela: W9-29 … W9-34** (konto Tailscale, prawdziwe telefony, push OS, akceptacja G6).
- **Zasady bezpieczeństwa (obowiązkowe):**
  1. Żadne logowanie ani sekret **nie** trafia do repo ani do czatu.
  2. Telefon łączy się **tylko** przez uwierzytelnione połączenie (token urządzenia po parowaniu + TLS z odciskiem / zaufany cert sieci).
  3. Mobile Connect **domyślnie wyłączone**; LAN i zasięg poza domem tylko po świadomym włączeniu.
  4. **Zero cudzej chmury** (DECYZJE wiersz 17 / luki decyzja 6): sieć lokalna, Tailscale albo własny przekaźnik — nie WebRTC / relay OpenBot 0.70.
- **Produkt telefonu w W9:** najpierw **PWA** z Tailscale (DECYZJE wiersz 16). Natywna aplikacja dopiero, gdy push na iPhonie zawiedzie.

**Źródła:** `luki` (W9-BE1/BE2/UI1/T1, bramka G6, decyzje 5–6); `PLAN-W4`; `DECYZJE-WLASCICIELA.md` wiersze 16–17; `parytet` 42–44; grep `ipc-mobile.ts`, `mobile-connect.ts`, `mobile-certificate.ts`, `mobile-app-assets.ts`, `mobile-phone-api.ts`. **„do ustalenia”** / **„propozycja T1”** / **„niezweryfikowane”**.

**Clean room:** własne słowa. Bez kopiowania tekstów 0.68/0.70. Bez kodu OpenBota nowszego niż `a6fe240`. Dokładne zachowanie push / Live Activity / natywnej app 0.70 = **niezweryfikowane**.

**Poza rdzeniem BE1/BE2, w tej samej fali luk:** W9-UI1 dok/wyspa (odpowiedź z wyspy, kanały w doku, dyktowanie) — skrót w §1E i mapowaniu; pełny UX jak W3/W6.

---

## 0. Co już jest w kodzie COSGRAL vs czego brak (grep, bez uruchamiania)

| Obszar W9 | Jest dziś | Brak / luka |
|---|---|---|
| Mobile Connect (parowanie) | `ipc-mobile`: QR / ticket, karta zgody, token urządzenia (hash), revoke, limity; exposure `loopback` \| `lan`; port domyślny 47930; **domyślnie serwer nie startuje bez startPairing** | Brak exposure `tailscale` / instrukcji w UI; brak „włącz na stałe poza parowaniem” jako osobny produktowy przełącznik zasięgu |
| TLS | Certyfikat self-signed na tym komputerze (`mobile-certificate`); odcisk SHA-256 w QR; pinowanie po stronie klienta testowego; LAN wymaga TLS | Brak ścieżki „certyfikat HTTPS tej sieci Tailscale zamiast własnego” (W9-BE1); przeglądarka nadal ostrzega przy self-signed (kontrakt to opisuje) |
| Klient telefonu PWA | Serwowane z `/app/` (`mobile-app-assets`: app.js, sw.js cache plików, manifest); parowanie z fragmentu URL; lista agentów, czat, Needs you, SSE `/v1/events` | Service worker **nie** robi Web Push (komentarz: nie dotyka `/v1/`); brak subskrypcji push, VAPID, payload Needs you |
| API telefonu | `MOBILE_PHONE_PATHS`: threads, events, templates, agents, needs-you + answer; Vault / Computer Use / MCP = 403 computer-only | Brak kanałów w PWA; brak PIN / blokady ekranu aplikacji; brak ustawień telefonu (język, powiadomienia) |
| Poza domem | Loopback + opcjonalnie LAN | Brak dokumentowanej ścieżki Tailscale w produkcie; brak odbioru LTE→PC |
| Dok / wyspa (W9-UI1) | Kontrakty dok/wyspa z W3 | Odpowiedź z wyspy / kanały w doku / dyktowanie — poza Mobile Connect; osobne zadanie UI |

---

## 1. Zachowanie do dostarczenia

### 1A. Zasięg poza domem bez cudzej chmury (W9-BE1)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 1 | Otwiera Mobile Connect pierwszy raz. | Serwer telefonu **wyłączony**; jasny opis: włączanie = świadoma decyzja. | Startować nasłuch LAN/Tailscale przy starcie programu bez zgody. | zlecenie T1; ipc-mobile (domyślnie off) |
| 2 | Włącza dostęp dla telefonu w domu (LAN). | Tylko TLS; URLe LAN w QR; ostrzeżenie transportowe z kontraktu. | Plain HTTP na LAN. | ipc-mobile; mobile-tls testy |
| 3 | Chce telefon **poza domem** (LTE). | Instrukcja **Tailscale** (krok po kroku w UI lub docs w programie): ten sam MagicDNS / IP Tailscale w adresie Mobile Connect; telefon i PC w tej samej sieci Tailscale. | Wymagać konta OpenBot / WebRTC / cudzego relay. | luki W9-BE1; DECYZJE 16–17 |
| 4 | Używa certyfikatu **sieci Tailscale** (HTTPS tej sieci) zamiast self-signed COSGRAL. | Opcja (**propozycja T1**): wskazać / zaufać cert sieci tak, że przeglądarka **nie** ostrzega; albo dalej self-signed + porównanie odcisku. | Zmuszać do self-signed, jeśli właściciel ma działający cert sieci. | luki W9-BE1 („certyfikat HTTPS tej sieci”) |
| 5 | Alternatywa: własny przekaźnik na serwerze wspólników. | Dozwolone tylko jako **świadomy** wybór właściciela (nie domyślny); nadal bez cudzej chmury produktowej. | Domyślnie włączać publiczny tunnel SaaS. | luki decyzja 6; DECYZJE 17 |
| 6 | Telefon na LTE łączy się z komputerem. | Po parowaniu: lista agentów, czat, Needs you działają jak w LAN; sesja tylko z Bearer tokenem urządzenia. | Akceptować żądania bez tokena na `/v1/*` (poza pair). | luki W9-BE1 „gotowe, gdy”; mobile-connect |
| 7 | Przeglądarka otwiera `…/app/`. | Przy cert sieci / poprawnym zaufaniu: **brak** ostrzeżenia certyfikatu (kryterium luk). Przy self-signed: ostrzeżenie + porównanie odcisku (jak dziś w kontrakcie). | Ukrywać ostrzeżenie fałszywym „bezpieczne” bez pin/trust. | luki W9-BE1; MOBILE_TRANSPORT_WARNING |
| 8 | Gubi telefon / odwołuje urządzenie na PC. | Token unieważniony od razu; kolejne requesty 401. | Zostawić ważne tokeny po revoke. | ipc-mobile; parytet 42 |

### 1B. Web Push o Needs you (W9-BE2)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 9 | Sparowany telefon; PWA na ekranie głównym (Android / iPhone). | Może włączyć powiadomienia push o kartach Needs you (zgoda OS). | Wysyłać push bez zgody OS / bez włączenia w ustawieniach. | luki W9-BE2 |
| 10 | Aplikacja PWA jest **zamknięta**; agent czeka na decyzję. | Push dochodzi (Android i iPhone z PWA na home screen — kryterium luk). Treść: krótki tytuł + agent; **bez** sekretów (hasła, tokeny, pełna treść Vault). | Pakować sekrety / pełne dane karty w payload push. | luki W9-BE2; zasada T1 |
| 11 | Klika powiadomienie. | Otwiera PWA na właściwej karcie Needs you (lub liście). | Otwierać pusty ekran bez kontekstu karty. | propozycja T1 |
| 12 | Push na iPhonie przez PWA zawodzi mimo poprawnej konfiguracji. | Escalaacja wg DECYZJE 16: rozważyć **natywną** aplikację — **osobna decyzja lidera/właściciela**, nie ciche przejście w W9-BE2. | Obiecywać Live Activity 0.70 w W9 bez decyzji. | DECYZJE 16; luki (Live Activity = 0.70, niezweryfikowane) |
| 13 | Wyłącza powiadomienia w ustawieniach telefonu / PWA. | Push nie idzie; czat i Needs you w otwartej PWA nadal działają (SSE). | Łamać SSE, gdy push wyłączony. | propozycja T1 |

### 1C. Blokada PIN (W9-BE2)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 14 | Włącza PIN w ustawieniach telefonu (PWA). | Po wyjściu z aplikacji / po czasie bezczynności (**do ustalenia**, propozycja T1: 5 min) ekran blokady wymaga PIN zanim widać czat i karty. | Trzymać PIN w localStorage w plain text obok tokena urządzenia bez ochrony platformy. | luki W9-BE2; propozycja T1 |
| 15 | Podaje zły PIN wielokrotnie. | Krótka blokada / wymuszenie ponownego parowania po N próbach (**propozycja T1: 5**, jak ticketAttempts). | Nieskończone próby bez limitu. | propozycja T1 |
| 16 | Czyści dane strony / odinstalowuje PWA. | Traci lokalny PIN i musi sparować od nowa; PC nadal może revoke stare urządzenie. | Zakładać, że PIN chroni przed atakiem na skradziony token bez revoke na PC. | propozycja T1 |

### 1D. Kanały i ustawienia w aplikacji telefonu (W9-BE2)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 17 | Otwiera PWA po W9. | Poza agentami / czatem / Needs you: **kanały** (lista, czytanie, wysyłka / odpowiedź w zakresie telefonu) oraz **ustawienia** telefonu (PIN, push, język jeśli wspólne z W7). | Wystawiać Vault, Computer Use, MCP, remote-desktop na telefon (zostają computer-only). | luki W9-BE2; MOBILE_COMPUTER_ONLY |
| 18 | Odpowiada na Needs you z telefonu (tam gdzie `answerOn: phone`). | Tura na PC odblokowuje się jak dziś. | Pozwalać z telefonu na karty oznaczone tylko „na komputerze” bez komunikatu. | parytet 43; mobile-phone-api |
| 19 | Tworzy agenta z telefonu (już częściowo w API). | Agent widoczny na PC; edycja awatara / pełny profil — zakres jak parytet 44 (**propozycja T1**: nie blokuje G6, jeśli czat+Needs you+poza domem działają). | Wymagać pełnej edycji 0.70 do zaliczenia G6. | parytet 44; luki G6 |

### 1E. Dok i wyspa (W9-UI1) — skrót

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 20 | Dostaje kartę Needs you; wyspa aktywna. | Może **odpowiedzieć z wyspy** (nie tylko otworzyć główne okno). | Zostawić wyspę tylko jako toast bez akcji, jeśli zadanie W9-UI1 jest w zakresie fali. | luki W9-UI1 |
| 21 | Patrzy na dok. | Kanały dostępne z doku (nawigacja / skrót). | Ukryć kanały wyłącznie w głównym oknie bez ścieżki z doku. | luki W9-UI1 |
| 22 | Dyktuje (voice). | Dyktowanie w kontekście dok/wyspa / telefon — **zakres do ustalenia** z istniejącym voice W3; nie mylić z push. | Wymagać dyktowania do G6 (G6 = telefon poza domem). | luki W9-UI1; propozycja T1 |

### 1F. Kryteria odbioru (W9-01 … W9-34)

| ID | Kryterium | Grupy |
|---|---|---|
| W9-01 | Mobile Connect domyślnie wyłączony; włączenie świadome | 1A |
| W9-02 | LAN tylko z TLS; plain HTTP zabronione na LAN | 1A |
| W9-03 | Instrukcja Tailscale w produkcie / docs programu | 1A |
| W9-04 | Telefon na LTE (Tailscale) łączy się z PC po parowaniu | 1A / właściciel |
| W9-05 | Opcja certyfikatu sieci Tailscale **albo** self-signed + odcisk; przy zaufanym cert przeglądarka bez ostrzeżenia | 1A |
| W9-06 | Brak cudzej chmury w domyślnej ścieżce | 1A |
| W9-07 | Żądania `/v1/*` (poza pair) wymagają Bearer | 1A |
| W9-08 | Revoke urządzenia → 401 | 1A |
| W9-09 | PWA `/app/` serwowana z PC, bez zewnętrznych CDN | 0 / 1A |
| W9-10 | Parowanie QR / ticket / karta zgody jak W3 | 0 |
| W9-11 | Web Push: zgoda OS przed wysyłką | 1B |
| W9-12 | Push przy zamkniętej PWA o Needs you | 1B / właściciel |
| W9-13 | Payload push bez sekretów | 1B |
| W9-14 | Klik push → właściwa karta | 1B |
| W9-15 | Wyłączony push ≠ wyłączony SSE | 1B |
| W9-16 | PIN opcjonalny; blokada po bezczynności | 1C |
| W9-17 | Limit złych PIN; ścieżka odzyskania = ponowne parowanie | 1C |
| W9-18 | PIN nie w repo; nie logowany | 1C |
| W9-19 | Kanały w PWA (lista + podstawowa rozmowa) | 1D |
| W9-20 | Ustawienia telefonu: PIN, push (± język) | 1D |
| W9-21 | Needs you z telefonu odblokowuje turę (phone-capable) | 1D |
| W9-22 | Vault / CU / MCP nadal 403 z telefonu | 1D |
| W9-23 | Service worker nie cache’uje `/v1/` ani tokenów | 0 / 1B |
| W9-24 | Żadne sekrety / ścieżki profilu w commitach i raportach publicznych | zasada kanału |
| W9-25 | Odpowiedź z wyspy (W9-UI1) | 1E |
| W9-26 | Kanały w doku (W9-UI1) | 1E |
| W9-27 | Dyktowanie — zakres uzgodniony, nie blokuje G6 | 1E |
| W9-28 | Natywna app dopiero po failu push iPhone (decyzja 16) | 1B |
| W9-29 | Konto Tailscale na PC i telefonie (właściciel) | właściciel |
| W9-30 | Prawdziwy telefon Android — odbiór push + poza domem | właściciel / T1 |
| W9-31 | Prawdziwy iPhone — PWA na home + push | właściciel / T1 |
| W9-32 | Odbiór u **obu** wspólników (G6) | właściciel / T1 |
| W9-33 | Cert sieci Tailscale (jeśli wybrany) wystawiony / zaufany przez właściciela | właściciel |
| W9-34 | Lider uznaje G6 na podstawie raportu T1 | lider |

---

## 2. Co wymaga właściciela

| Potrzeba | Po co |
|---|---|
| Konta Tailscale (PC + telefony obu wspólników) | W9-04, W9-29, G6 |
| Prawdziwe telefony Android + iPhone | W9-12, W9-30–32 |
| Ewentualny cert HTTPS / zaufanie w sieci Tailscale | W9-05, W9-33 |
| Zgody OS na powiadomienia | W9-11–12 |
| Decyzja o własnym przekaźniku (jeśli nie Tailscale) | §1A nr 5 |
| Akceptacja G6 | W9-34 |

Zespół **nie** loguje się na konta właściciela i **nie** wkleja sekretów do repo.

---

## 3. Pytania otwarte do lidera (max 12) + rekomendacja T1

| Q | Pytanie | Rekomendacja T1 |
|---|---|---|
| Q1 | Exposure w kontrakcie: nowe `tailscale` czy nadal `lan` + instrukcja Tailscale? | Zostawić `loopback`\|`lan`; Tailscale = ten sam `lan`/URL z IP MagicDNS + osobna instrukcja UI. Bez trzeciego transportu, dopóki nie trzeba osobnego cert hooka. |
| Q2 | Cert: zawsze self-signed COSGRAL, czy ścieżka „użyj certyfikatu Tailscale/HTTPS sieci”? | Obie: domyślnie self-signed + odcisk; przełącznik „cert sieci” gdy właściciel ma zaufany HTTPS. |
| Q3 | Własny przekaźnik w W9 czy dopiero gdy Tailscale nie wystarczy? | W9 = Tailscale first; przekaźnik = opcjonalny plan B, osobne zadanie po G6. |
| Q4 | Web Push: VAPID klucze gdzie trzymać? | Tylko `safeStorage` / magazyn lokalny PC; publiczny klucz może iść do PWA; prywatny nigdy do repo ani do telefonu. |
| Q5 | Czy push dla innych zdarzeń (koniec tury, błąd) w W9? | W9 tylko **Needs you**; reszta później (macierz powiadomień W3 już na desktopie). |
| Q6 | PIN: obowiązkowy czy opcjonalny? | Opcjonalny; rekomendowany przy pierwszym parowaniu poza domem (karta „ustaw PIN?”). |
| Q7 | Timeout blokady PIN | 5 minut bezczynności + od razu przy `visibilitychange` hidden→visible po tle. |
| Q8 | Kanały w PWA: pełny paritet desktop czy MVP (lista + send + reply)? | MVP: lista, czytanie, send, replyTo; bez reassign zadań w W9. |
| Q9 | Czy G6 wymaga push na **obu** platformach, czy wystarczy LTE+decyzja na jednym + push na drugim? | G6 = decyzja poza domem u obu wspólników; push Android+iPhone = kryterium BE2, raportować osobno jeśli iPhone fail → decyzja 16. |
| Q10 | W9-UI1 (dok/wyspa/dyktowanie) w tej samej bramce G6? | **Nie** — G6 = telefon poza domem; UI1 równolegle, nie blokuje G6. |
| Q11 | Czy PWA może używać Web Push przez cudzy FCM/APNs „przez przeglądarkę” — czy to łamie „zero cudzej chmury”? | Dozwolone jako **transport OS powiadomień** (nie hosting rozmów); rozmowa i API zostają na PC/Tailscale. Oznaczyć w UI: „powiadomienia idą przez system telefonu”. |
| Q12 | Odbiór T1: kto trzyma telefony testowe? | Właściciele / wspólnicy; Tester pisze skrypt odbioru + raport, nie przechowuje urządzeń. |

---

## 4. Czego nie wiadomo (uczciwa lista)

1. Dokładne zachowanie **OpenBot 0.70** Mobile Connect / push / Live Activity / ~190 ekranów natywnych — **niezweryfikowane** (tylko skrót w lukach + opis 0.68 w parytecie).
2. Czy Web Push z PWA na aktualnym iOS spełni kryterium luk „przy zamkniętej aplikacji” u obu wspólników — **do sprawdzenia na urządzeniu** (stąd decyzja 16 o natywnej app).
3. Czy MagicDNS Tailscale + self-signed wystarczy przeglądarce bez ostrzeżenia — zwykle **nie**; stąd Q2.
4. Zachowanie service workera PWA offline vs wygasły token — grep pokazuje cache tylko plików `/app/*`; pełny UX offline **nie** testowany tu.
5. Integracja kanałów telefonu z modelem zadań W1 — brak ścieżek `/v1/channels` w `MOBILE_PHONE_PATHS` dziś.
6. Dyktowanie (W9-UI1) vs istniejący voice desktop — zakres nieuzgodniony.
7. Nie uruchamiałem Electrona, PWA na telefonie ani Tailscale.

---

## 5. Mapowanie na zadania z luk

| ID | Zakres |
|---|---|
| W9-BE1 | §1A, W9-01…08, W9-29, W9-33 |
| W9-BE2 | §1B–1D, W9-11…22, push+PIN+kanały |
| W9-UI1 | §1E, W9-25…27 (nie blokuje G6) |
| W9-T1 | odbiór telefonów, raport, W9-30…34 / G6 |
| W9-T1 (ten plik) | spec wejściowy |

---

## Commity

Zobacz SHA w wyniku kanału na `team/tester/w9-spec`.
