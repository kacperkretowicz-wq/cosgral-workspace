# Projects and repositories — agent access

Product map: [Projects and repositories](../feature-map/projects.md).

Feature ID: `projects`.

Review date: 2026-10-12. Source commit: `f981fa3cc10cb8663a87dec60345fbff46d54d0a`.

This is a source-reviewed baseline of representative operations and known gaps.
Each capability needs operation-level review before its entire scope can be
qualified. No live agent execution is claimed. Follow the [map contract](../README.md)
for format, permission checks, evidence and maintenance.

## `lifecycle`

Capability ID: `projects/lifecycle`.

Review: `baseline`.

API: `present` — representative operation IDs:

- `POST /api/companies/{companyId}/projects`.
- `PATCH /api/projects/{id}`.
- `DELETE /api/projects/{id}`.

Agent access: `available` — Native create_project/list_projects; REST / CLI / MCP.

Policy: Company/project visibility, protected configuration/runtime policies; some
repository/privacy management requires board.

Evidence: `source-only` — [implementation](../../server/src/routes/projects.ts#L278) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Actual data operations exist; project discovery and private-resource permissions
still apply.

## `task-context`

Capability ID: `projects/task-context`.

Review: `baseline`.

API: `present` — representative operation IDs:

- `GET /api/companies/{companyId}/issues`.
- `POST /api/companies/{companyId}/issues`.

Agent access: `available` — Native create_task/search_tasks; REST / CLI / MCP.

Policy: Company/project visibility, protected configuration/runtime policies; some
repository/privacy management requires board.

Evidence: `source-only` — [implementation](../../server/src/routes/projects.ts#L278) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Use explicit project context; task creation, assignment, and execution remain
separate checks.

## `repositories`

Capability ID: `projects/repositories`.

Review: `baseline`.

API: `present` — representative operation IDs:

- `GET /api/companies/{companyId}/project-repositories`.
- `PUT /api/projects/{id}/repositories`.

Agent access: `partial` — Native list_project_repositories/create_project for initial
selection; board-only replacement API.

Policy: Company/project visibility, protected configuration/runtime policies; some
repository/privacy management requires board.

Evidence: `source-only` — [implementation](../../server/src/routes/projects.ts#L278) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Authorized initial selection works. Replacement of repositories on an existing
project hard-requires board and needs a delegation decision.

## `defaults`

Capability ID: `projects/defaults`.

Review: `baseline`.

API: `present` — representative operation IDs:

- `PATCH /api/projects/{id}`.
- `GET /api/projects/{id}/workspaces`.

Agent access: `partial` — REST / native call_api for permitted fields; CLI
project/workspace.

Policy: Company/project visibility, protected configuration/runtime policies; some
repository/privacy management requires board.

Evidence: `source-only` — [implementation](../../server/src/routes/projects.ts#L278) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Description/goal/target selection exist; host workspace command mutation is denied
to agents and budget policy is board-managed.

Repository attachment also writes a durable skill import binding in its transaction.
Agent-created bindings derive their refresh person from authenticated responsible-user
context. Project selection does not grant runtime credentials or override private
project skill access. Verify automatic import and denial with the actual agent identity.

Workspace creation, update and deletion require project:write_workspace through
the shared authorization evaluator in addition to project read access. Repository
attachment does not bypass skill-import policy for its background discovery.

## `privacy`

Capability ID: `projects/privacy`.

Review: `baseline`.

API: `present` — POST /api/companies/{companyId}/projects; PATCH /api/projects/{id}; GET and POST /api/projects/{id}/access-members; DELETE /api/projects/{id}/access-members/{memberId}. Creation and authorized updates accept visibility; use stable UUID paths for evidence.

Agent access: `partial` — authorized agent REST or admitted native `call_api` can create a private project, and eligible project/member reads retain their normal API paths. Existing project visibility and audience mutations require board authority; no dedicated agent audience-management tool is established.

Policy: Company access and project:read apply; inaccessible projects return not found. Listing members requires project read, unlike task-grant listing. Visibility/member mutations require a board privacy/personal owner, active company owner/admin, instance admin, or local implicit board. The server derives the creation owner from the board person or agent’s onBehalfOfUserId. Targets must be company agents or active company users; the owner cannot be removed. Agent access intersects agent and responsible-user access. Opening a project does not publish its protected tasks.

Evidence: `source-only` — reviewed at `9ef434fe79c57d976b8b03b14c5242db270b8320`. [Project properties](../../ui/src/components/ProjectProperties.tsx), [access members](../../ui/src/components/ProjectAccessMembers.tsx), [project routes](../../server/src/routes/projects.ts), and [authorization](../../server/src/services/authorization.ts).

Verification: `not-run` — Verify allowed creation and reads as the actual operator/agent, then compare project and task access after adding/removing a person. Reject ordinary members’ audience changes, agent member/visibility mutations, foreign-company targets, and owner removal. After opening the project, inspect protected tasks and independent direct grants rather than inferring task publication from project discovery.

Gaps: The dedicated create_project tool does not advertise a visibility field; explicit private selection uses REST or admitted call_api. Private-project creation through each client, inherited task audiences, and responsible-user combinations need separate live evidence. The map does not infer filesystem isolation from these app-record permissions.

Project configuration responses also expose effective workspace storage through
`workspaceProvider`, separate from the stored execution policy. Existing project
read/update permissions apply. Omitted provider IDs inherit; null explicitly selects
Core/local. [Offline API coverage](../../server/src/__tests__/project-workspace-provider.integration.test.ts)
checks overrides and cross-company denial; live agent credential verification remains unqualified.

## `conversation`

Capability ID: `projects/conversation`.

Review: `baseline`.

API: `present` — `GET /api/projects/{id}/conversation`,
`POST /api/projects/{id}/conversation`,
`PUT /api/projects/{id}/conversation/coordinator`, `GET /api/issues/{id}/comments`
(with order/limit/after), `POST /api/issues/{id}/comments`.

Agent access: `partial` — comments use the existing REST task-comment path;
project conversation creation is a board action. No separate message store or
execution authority is introduced by the UI.

Policy: company and private-project/task read access; comment writes require
existing mutation authority. A viewer can read but cannot send. Comment authors
come from the authenticated actor; clientRequestId preserves retry identity.
Project conversation policy protects its identity and nonterminal lifecycle.
Coordinator selection requires project read access and existing project-owner or
administrator management authority; viewers and agent callers cannot select.
The selected agent must be ready, company-scoped and able to read the project.
Assignment and its comment/audit commit together. Execution/checkout ownership
blocks changing coordinator. Ordinary issue PATCH cannot change this assignment.
The shared channel uses assigneeAgentId; personal conversationAgentId stays null.
Messages wake the coordinator and each completed child task uses the ordinary
parent wake path, preserving child context behind an active run. Task dispositions
and their recovery do not apply to this channel; failed or unanswered turns are
visible as system comments. Access, approvals and budgets still gate execution.

Evidence: `source-only` — [project routes](../../server/src/routes/projects.ts),
[comment routes](../../server/src/routes/issues.ts),
[conversation UI](../../ui/src/pages/ProjectConversation.tsx).
[Two-account script](../../scripts/cosgral-e2e-two-accounts.mjs) exercises board
HTTP/WS grants and denials; it does not qualify agent execution.

Verification: `not-run` for an agent posting on this UI test project. Browser
board verification is recorded separately in COSGRAL-PRZEKAZANIE.md.

Presence: the existing company WS accepts `?projectConversation=<project UUID>`
only for authenticated humans with project and backing issue access. Typing
requires comment authority; viewer typing, agents and anonymous/implicit local
board identities are rejected. Frames contain user IDs and expiry only; no DB,
audit, wake or replay. Access is rechecked before each snapshot delivery. Multiple
tabs merge by user; last disconnect removes presence. Agent activity uses existing
conversation live runs, never client-authored typing.

Gaps: server integration tests exercise persistence/access through wake calls
with mocked heartbeat, not provider execution. See the handoff for separate
supervisor real-model acceptance and current presence test evidence.

COSGRAL conversation descendants: stored ancestry selects isolated task/agent Git
branches; codex_local legacy CLI is confined by bwrap with explicit run environment
and no bypass. Coordinator repository mounts are read-only. Other runtime paths
fail closed. Existing API permissions, approvals and budgets still apply;
[this filesystem policy](../../docs/cosgral/uprawnienia-agentow.md) does not grant API
authority. Offline probes verify filesystem/process denial, not agent API dispatch.

COSGRAL Tabela/Workflow use the same authorized project issue list with
includeAgentCreatedTasks/includeBlockedBy; they introduce no execution endpoint.
Cost and work-product reads use existing issue-scoped endpoints. Agent nodes link
to the existing editor; agent PATCH keeps existing agent configuration authority,
audit and budget rules. Company live agent.updated/created events invalidate
roster/details/org queries and carry no adapter config. The two-account script
checks A↔B config reads and viewer/foreign-company denials; this is board HTTP/WS
coverage, not an additional agent grant or proof of model execution.

COSGRAL decisions reuse `GET/POST /api/issues/{id}/interactions` and
`POST /api/issues/{id}/interactions/{interactionId}/{accept|reject}`. On shared
project conversations the service pins `suggest_tasks`/`request_confirmation` to
`human_only` and no single addressee; confirmations cannot be superseded by an
ordinary comment. Proposals stay in the conversation's project/tree. Existing
project/issue access, mutation, task creation and assignment checks still apply.
Agents may propose but cannot resolve these human gates. Pending proposals have
no executable issue; atomic acceptance creates the assigned task once, rejection
creates none. Existing governed-operation approvals remain mandatory. Roster
context is a safe projection, not a grant of assignment/execution authority.
Git metadata uses a read-only private shallow HEAD/index object pack, excluding
unrelated branch objects and common configuration. Nie dodano obejścia polityki runtime. See the targeted server/UI tests and permission
policy; live-model acceptance remains separate.

T13: `POST /api/issues/{conversationId}/executor-selection` jest dostępny dla
operatora lub przypisanego koordynatora z runem. Wymaga odczytu rozmowy i firmy,
polityki mutacji agenta i `tasks:assign` dla konkretnego kandydata/projektu/rodzica.
Filtruje pauzę, budżet, wolne sloty, zgodność runtime i dostęp do projektu;
nie przyznaje uprawnień ani nie rezerwuje wykonania. Zapisuje uzasadnienie w
komentarzu. Jawny wybór niedostępnego agenta daje 422 bez cichego fallbacku.
`suggest_tasks` i `request_confirmation` wymuszają `wake_assignee` po obu
rozstrzygnięciach; capability `canResolveApprovals` z polityki issue:mutate
wyłącza akcje kart dla widza. Autoryzacja decyzji nadal działa w API.

Coordinator RO worktrees prepare empty `.agents`/`.codex`/`.aws` mount targets
before launch; `.git` keeps its private RO binding. Symlinks fail closed.
Post-turn settlement verifies run/agent/company/project/parent-scoped task or
interaction writes when the coordinator declares an action or the wake asks for one.
Completion wakes require a reply tied to the validated completed child. Informational
turns do not require a mutation; process `succeeded` is not proof of delegation.
Inherited worker bindings are discarded before restore; only the task/agent worktree
can be reused. The previous workspace is retained unchanged.

T14: `GET /api/issues/{conversationId}/project-history?cursor=...` zwraca
stronicowany odczyt komentarzy dzieci, delegowań/statusów i błędów. Wymaga
odczytu rozmowy, tej samej firmy/projektu, odczytu każdego dziecka i runu.
Nie przyznaje uprawnień zapisu. Komentarz agenta do zadania przypisanego innemu
agentowi jest adresowaną wiadomością; serwer zapisuje `metadata.recipientAgentId`
z bieżącego przypisania, klient nie może go podrobić. Samo @mention nie kieruje
wake. Istniejące ACL komentarzy i rola viewer pozostają obowiązujące.
`POST /api/issues/{id}/comments` przyjmuje opcjonalne `messageKind: "audit"`
(jedynie klasyfikacja widoku). Nowych endpointów wykonania nie dodano.
W rozmowie projektu i jej bezpośrednich dzieciach run wybudzony komentarzem
agenta nie może uruchomić kolejnego wake komentarzem (POST ani PATCH).
Wiadomość nadal jest zapisywana. Brak/poprawność runu i źródło wiadomości są
sprawdzane w bazie; klient nie ustawia licznika hopów. Zwykłe wybudzenie po
zakończeniu dziecka pozostaje osobnym istniejącym zdarzeniem orkiestracji.
Testy HTTP z PostgreSQL używają syntetycznych aktorów i spy wake; żywa próba
modelu i dwóch przeglądarek wymaga odbioru nadzorcy.


T15: dobór wykonawcy uwzględnia referencyjny koszt modelu z istniejącego
wersjonowanego cennika (jawny koszyk standardowego API, nie cena subskrypcji),
liczbę otwartych zadań w całej firmie, aktywne zadania i queued/running runy.
Nieznana cena wyłącza porównanie kosztu dla całej grupy o równym dopasowaniu.
Lifecycle inny niż ready, pełne sloty i budżet wykluczają. Powody odrzuceń,
również całkowitej odmowy 422, trafiają do rozmowy. Regresja PostgreSQL/HTTP
w `project-conversations.test.ts`; skrypt `cosgral-e2e-parallel.mjs` przygotowuje
odbiór. T15b wymusza limit 4 aktywnych dzieci rozmowy (również backlog/blocked),
z zapisem powodu odmowy 422; raport czeka na ostatnie dziecko. Ukończenia
rodzeństwa są serializowane także w natywnym runtime. Testy PostgreSQL/HTTP
obejmują wyścigi tworzenia/ukończeń i odmowę akceptacji suggest_tasks.
Brak żywego dowodu równoległości z modelem w t15/t15b.

Repository URL onboarding (4 XI): the board repository form calls existing
`POST /api/projects/:id/workspaces` with `sourceType: git_repo` and `repoUrl`.
Project read/workspace-write checks and activity logging remain in the owning
route. No new agent tool, endpoint, credential grant or execution permission is added.

New-project completion navigates to the existing conversation UI after the create
request succeeds. It adds no API or agent authority; conversation creation and
coordinator assignment retain their existing server checks.

Conversation onboarding links reuse project configuration and agent creation
routes. Visibility of the creation shortcut follows coordinator-management UI
state; the destination retains company agent-creation authorization. It grants
neither coordinator assignment nor credentials merely by following the link.
