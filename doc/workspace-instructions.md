# Instrukcje pracy COSGRAL

Ustawienia → Profil → **Instrukcje pracy** udostępnia zakres firmy, projektu
widocznego dla użytkownika i własnych wskazówek w wybranej firmie. Własne
instrukcje dotyczą zadań, za które ta osoba odpowiada według silnika Paperclip;
nie są automatycznie instrukcjami każdego autora komentarza. Zapis nie budzi
agenta i nie zmienia aktywnego runu. Puste pole wyłącza dany zakres.

## Kontrakt i dostęp

GET/PUT `/api/companies/:companyId/instructions/company`,
`/api/companies/:companyId/instructions/me`,
`/api/companies/:companyId/instructions/projects/:projectId`.
Zapis: ścisły obiekt `{ "text": "..." }`, maksymalnie 8000 jednostek UTF-16
(walidacja Zod/JS), bez znaków sterujących poza tabulatorem i końcami linii.
Odczyt: `{ "text": "...", "canEdit": true }`. Tożsamość `me` pochodzi wyłącznie
z aktora. Agent i anonim nie mają dostępu do tych tras. Widz czyta, lecz nie
zapisuje, także własnych wskazówek. Projekt wymaga istniejącej polityki odczytu
i `project:write_workspace` do zapisu. Brak/obca firma lub projekt: 404;
brak prawa zapisu: 403; błędne dane lub rozpoznane poświadczenie: 400.
Odpowiedzi są private/no-store.

Instrukcje są danymi firmy w `workspace_instructions`, nie preferencjami wyglądu.
Unikalny indeks firma/klucz, klucz projektu i złożony FK firma/projekt chronią
zakres danych. Migracja 0425 jest generowana standardowym `pnpm db:generate`.
Zapis i beztreściowy wpis `workspace_instructions.updated` są jedną transakcją.
Równoległe edycje mają semantykę ostatniego zapisu, bez scalania i wersjonowania.

## Dostarczenie i bezpieczeństwo

Istniejący `heartbeat/task-context.ts` czyta wskazówki jednym indeksowanym
zapytaniem podczas nowego przygotowania. Kolejność bloków: firma → projekt →
osoba odpowiedzialna rozstrzygnięta przez silnik. Nie ma nowego orkiestratora,
pollingu ani integracji z dostawcą modelu. Wskazówki trafiają do pełnego,
assignment i obu wariantów compact task markdown; identyczne warianty nadal
mogą być pomijane przez istniejący kontrakt Paperclip.

Recovery zachowuje zapisany snapshot wskazówek, bez podmieniania go aktualną
konfiguracją. Nowy run ignoruje snapshot przesłany przez wywołującego i pobiera
aktualny zapis. Redakcja sekretów z rejestru runu obejmuje także snapshot.
Instrukcje nie nadają uprawnień, nie zmieniają adapterConfig, trust preset,
sandboxa, budżetu ani zatwierdzeń. Sprzeczne wskazówki nie zastępują polityk.

Zapis odrzuca rozpoznane poświadczenia: istniejącą redakcję Paperclip, przypisania
kluczy/hasła/tokenów, Bearer, znane prefiksy API/GitHub/AWS, PEM i adresy baz.
Skaner jest konserwatywny: może odrzucić przykład dokumentacji zawierający taki
wzorzec i nie rozpoznaje każdego dowolnego sekretu (np. arbitralnego hasła bez
etykiety). Instrukcje nie są magazynem sekretów. Treść osoby zostaje częścią
kontekstu zadania — nie należy traktować jej jako prywatnej wiadomości do modelu.

## Dowód

`node scripts/cosgral-e2e-instructions.mjs` uruchamia jedynie fixture na
127.0.0.1:3197 z osobną bazą PostgreSQL w /tmp, odmawia zajęcia używanego portu
i kończy własną grupę procesów w finally. Używa produkcyjnych tras instrukcji,
serwisu heartbeat i kontrolowanego adaptera. Tożsamości są syntetyczne,
bez rejestracji/logowania, kont dostawców ani prawdziwych poświadczeń.
Test sprawdza cztery warianty markdown, zapis podczas aktywnego runu, następny
run, izolację firm/projektu/osób, odmowę widzowi i walidację. Nie dowodzi
stosowania instrukcji przez rzeczywisty model ani pełnego scenariusza dwóch
zalogowanych przeglądarek.
