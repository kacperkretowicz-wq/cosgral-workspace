# Login, invitations, and access — agent access

Product map: [Login, invitations, and access](../feature-map/access.md).

Feature ID: `access`.

Review date: 2026-10-12. Source commit: `58e16dbddfc9c8d0cf60867f9d9847f0feda055b`.
Native REST transport reconciled in this change; see the
[shared transport contract](README.md#native-rest-transport).

This is a source-reviewed baseline of representative operations and known gaps.
Each capability needs operation-level review before its entire scope can be
qualified. No live agent execution is claimed. Follow the [map contract](../README.md)
for format, permission checks, evidence and maintenance.

## `login`

Capability ID: `access/login`.

Review: `baseline`.

API: `present` — representative operation IDs:

- `GET /api/auth/get-session`.
- `POST /api/bootstrap/claim`.

Agent access: `restricted` — Agent authenticates with its own issued bearer; board login
uses human/client auth.

Policy: Company access plus action-specific grants; instance administration requires a
board administrator.

Evidence: `source-only` — [implementation](../../server/src/routes/access.ts#L3018) at
the reviewed commit above.

Verification: `not-run` — assert the documented agent denial with an owned test fixture;
verify any listed agent request/result path separately. A delegated operation needs its
own policy and access review.

Gaps: An agent identity is not a board login or board claim; explicit delegation is a
product-policy decision.

## `invitations`

Capability ID: `access/invitations`.

Review: `baseline`.

API: `present` — representative operation IDs:

- `POST /api/companies/{companyId}/invites`.
- `POST /api/invites/{token}/accept`.

Agent access: `partial` — REST / native `call_api` invite creation with the invite
permission; CLI access. Human acceptance and agent onboarding have distinct policies.

Policy: Company access plus action-specific grants; instance administration requires a
board administrator.

Evidence: `source-only` — [implementation](../../server/src/routes/access.ts#L3018) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Invite creation has an agent permission branch. Human joining and agent onboarding
are different operations.

## `membership`

Capability ID: `access/membership`.

Review: `baseline`.

API: `present` — representative operation IDs:

- `GET /api/companies/{companyId}/members`.
- `PATCH /api/companies/{companyId}/members/{memberId}/permissions`.

Agent access: `partial` — REST with the specific company permission; native fallback for
unrestricted operations.

Policy: Company access plus action-specific grants; instance administration requires a
board administrator.

Evidence: `source-only` — [implementation](../../server/src/routes/access.ts#L3018) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Company membership APIs include agent grants; instance-admin user operations stay
board-only.

## `resources`

Capability ID: `access/resources`.

Review: `baseline`.

API: `present` — representative operation IDs:

- `GET /api/issues/{id}`.
- `GET /api/projects/{id}`.

Agent access: `available` — REST or scoped task/project tools.

Policy: Company access plus action-specific grants; instance administration requires a
board administrator.

Evidence: `source-only` — [implementation](../../server/src/routes/access.ts#L3018) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Company/resource authorization is implemented; a negative test must cover private
resources and another company.

## `cli-auth`

Capability ID: `access/cli-auth`.

Review: `baseline`.

API: `present` — representative operation IDs:

- `POST /api/cli-auth/challenges`.
- `POST /api/cli-auth/revoke-current`.

Agent access: `restricted` — Board CLI authorization; agents use issued agent
credentials.

Policy: Company access plus action-specific grants; instance administration requires a
board administrator.

Evidence: `source-only` — [implementation](../../server/src/routes/access.ts#L3018) at
the reviewed commit above.

Verification: `not-run` — assert the documented agent denial with an owned test fixture;
verify any listed agent request/result path separately. A delegated operation needs its
own policy and access review.

Gaps: CLI board login/revocation cannot be counted as agent self-authentication.

## T19 — uzupełnienie `membership`

Operacje `GET/POST /api/companies/{companyId}/roles`,
`GET /api/companies/{companyId}/role-agent-recipients`,
`PUT /api/companies/{companyId}/roles/{roleId}` oraz
`PUT /api/companies/{companyId}/members/{memberId}/custom-role` są board-only.
Token agenta otrzymuje 403 również przy odczycie katalogu; agent może być
odbiorcą grantów przez własne aktywne członkostwo. Mutacje wymagają bazowej
roli owner/admin, users:manage_permissions i nieskopowanych grantów nadającego.
Lista członkostw agentów również wymaga owner/admin i nieskopowanego users:manage_permissions.
Brak aktywnego członkostwa/obca firma daje 404, nieaktualna wersja 409.
Zastosowanie używa istniejącego ACL, nie zmienia specjalizacji ani granicy
zaufania agenta. Pokwitowanie wersji nie zastępuje bieżących grantów.
Dowody i granice: [test](../../server/src/__tests__/company-roles.test.ts),
[e2e HTTP/DB bez modelu](../../scripts/cosgral-e2e-roles.mjs),
[dokumentacja](../../doc/company-roles.md). Brak odbioru natywnego call_api,
logowania i UI; nie rozszerza wcześniejszych deklaracji całej capability.

## T20 — rozszerzenie `membership`

API: `present` — DELETE /api/companies/{companyId}/roles/{roleId}, ciało `{version}`.
Agent access: `restricted` — board-only, tak jak katalog t19; token agenta nie wystarcza.
Policy: aktywne członkostwo owner/admin, users:manage_permissions oraz nieskopowane
uprawnienia starej definicji. Zapis i audyt w jednej transakcji. Wersja nieaktualna
lub zapisane zastosowanie: 409. Usunięcie nie odbiera grantów.
Evidence: test HTTP/DB company-roles oraz komponent CompanyRolesPanel; bez odbioru natywnego agenta.
Verification: owner/admin usuwa nieużywaną wersję; viewer i administrator bez grantów
mają odmowę, zastosowana rola pozostaje. UI w profilu korzysta z tych samych API.
Gaps: nie wykonano przeglądarkowego/logowanego przypisania; wybór odbiorcy przez UUID
członkostwa, bez katalogu członkostw agentów w panelu.
