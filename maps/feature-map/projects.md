---
navigation: {"section":"Projects and execution","sectionOrder":40,"order":10}
---

# Projects and repositories

People group tasks into projects, attach goals and repositories, and configure the context and defaults used by project work.

Feature ID: `projects`.

Implementation: [project list](../../ui/src/pages/Projects.tsx), [project detail](../../ui/src/pages/ProjectDetail.tsx).

Agent access: [companion](../agent-access-map/projects.md).

## Sub-features

- `lifecycle`: `projects/lifecycle` — create, name, organize, and archive projects.
- `conversation`: `projects/conversation` — shared COSGRAL project conversation, messages and accessible task progress.
- `task-context`: `projects/task-context` — inspect project tasks and create work in the selected project.
- `repositories`: `projects/repositories` — configure repository/workspace sources and verify usable checkouts.
- `defaults`: `projects/defaults` — maintain project instructions, environment, goal, and budget context where offered.
- `privacy`: `projects/privacy` — create private projects, inspect access members, and manage their audience without publishing protected tasks.

## How to get to it (user POV)

### `project-list`

Open `/projects`, create a project, and enter its overview or Issues view.

### `repository-settings`

Open `/projects/:projectId/configuration` and its repository/workspace settings.
Workspace storage shows the inherited installed default and allows an explicit
provider or Core/local choice. Conflicting defaults remain visible for repair.

### `project-access`

Open `/projects/:projectId/configuration`, use **Private project**, and choose **Manage access** or **View access** according to your authority. Create a private project through the supported creation surface or API when needed for a fixture.

### `project-conversation`

Open a project and choose **Rozmowa projektu**, or visit
`/:companyPrefix/projects/:projectId/conversation`. The advanced task screen stays
available through **Widok zaawansowany**. This Polish surface reuses project
conversation identity, task comments, company directory and the company live stream.
Chat / Tabela / Workflow retain the project and draft; the selected view is stored
per user/company/project. Tabela filters by status/agent/priority, searches and
sorts accessible tasks (including cancelled tasks). Its model/access summary is
current configuration, not historical run attribution. Completion counts observed
children; each row can fetch the recorded subtree USD cost and work products.
Workflow embeds the existing pan/zoom org chart, links agents and tasks, and draws
blocker → dependent and recorded author/parent → task edges. A task can jump to a
matching loaded/older conversation comment, falling back to its task card.


## Driving it with Playwright and the Paperclip CLI

Preconditions: follow the [baseline](./README.md#before-driving-a-journey). Use a disposable project and a small repository you can access; record checkout and credential ownership.

### `project-list`

Automated: [projects UI](../../ui/src/pages/Projects.test.tsx) and [project detail](../../ui/src/pages/ProjectDetail.test.tsx) are component tests.

Automated: the explicit [`project-task-context` deployment journey](../../tests/runner-e2e/product-journeys/project-context-flow.ts)
creates a project and a self-assigned task through the production dialogs. It
reopens both, verifies the project task list and task properties after reload,
and independently checks the saved company, project, prompt, assignment and
standard work mode with zero agent runs. [Oracle tests](../../tests/runner-e2e/product-journeys/project-context-evidence.test.ts)
reject lost links and mismatched records. This describes coverage; each target
still needs its own live pass before daily promotion.

Manual: Create a project, add a task from its view, and reload. Verify the task belongs to that project, list counts are plausible, and links preserve company scope. Archive only the disposable project and inspect list/task behavior.

### `repository-settings`

Automated: [provider defaults and API overrides](../../server/src/__tests__/project-workspace-provider.integration.test.ts) and [storage selection UI](../../ui/src/components/ProjectProperties.concurrency.test.tsx) cover inherited choices, explicit overrides, and configuration errors. These offline checks do not qualify live provider storage.

Automated: [repository persistence](../../server/src/__tests__/project-repositories-persistence.test.ts) and [repository browser suite](../../tests/e2e/project-repositories.spec.ts) cover configured repository workflows.

Manual: Attach a small repository, save, and create a project task. Inspect the actual checkout/revision used by its run. Test an invalid repository and missing credentials without treating a saved URL as a working workspace.

### `project-access`

Automated: [Privacy production review](../../server/src/__tests__/privacy-production-review.test.ts) covers persisted project audience changes, task inheritance, and actor intersections. [Privacy controls](../../ui/src/components/PrivateTaskPrivacyControls.test.tsx) covers UI controls and task-cache invalidation after membership removal. These tests do not prove both people’s live navigation.

Manual: As an ordinary authenticated project owner, create a private project and task. Add another company person and an eligible agent through Manage access, reload, and inspect their project discovery and task reads. The added person can view members but cannot change the audience. Remove them, reload their session, and retry direct project/task links. Confirm removing the owner is unavailable or rejected. Add a direct grant for one private task, then open the project to the company after inspecting the confirmation. Verify the project becomes discoverable, protected tasks remain private, and project-derived task access no longer substitutes for direct task access. Test the agent and its responsible person separately.

Sources: [Project properties](../../ui/src/components/ProjectProperties.tsx), [access members](../../ui/src/components/ProjectAccessMembers.tsx), [project routes](../../server/src/routes/projects.ts), and [authorization](../../server/src/services/authorization.ts).

## Gotchas

- A private project’s member list is readable to an authorized project reader. Task access-grant inspection has a stricter management boundary.

- `/overview` now selects Configuration, not a distinct overview page. Personal
  join/leave and star controls have their own persistence and should be checked
  when affected; **Star/Unstar {project name}** is the visible star action.
- Project name slugs change on rename and have no historical alias lookup.
  Reopen a renamed project through its stable UUID route, wait for the current
  Configuration form, and record the newly normalized URL before reloading.

- Project repository configuration and a provisioned execution workspace are different records.
- See [workspaces](./workspaces.md), [goals](./goals.md), and [budgets](./budgets-costs.md) for those features.
- Do not assume a deleted or archived project should erase its historical task evidence.

### Automatic repository skills

Creating or attaching a GitHub repository enqueues skill import without another setup
step. Check Skills → Sources and the installed library afterward. Ordinary edits to
older projects do not adopt their repositories; explicit adoption belongs in Sources.
Removing a repository retains installed skills and originating project access but stops
its automatic tracking. Changing the ref does not retarget existing skill references.

### Documentation scope: Projects and execution workspaces

Provider-specific provisioning, multi-repository/submodule edge cases, Git reconciliation variants, and all service exposure combinations require deeper recipes.

### Shared COSGRAL project conversation

Capability ID: `projects/conversation`.

Component/data coverage: [conversation tests](../../ui/src/pages/ProjectConversation.test.tsx),
[data mapping](../../ui/src/lib/project-conversation.test.ts), and
[editor keyboard tests](../../ui/src/components/MarkdownEditor.test.tsx).
Manual: use two authenticated project members. Send with Enter, keep a newline
with Shift+Enter, select an @agent mention, disconnect B, send as A and reconnect B.
Verify new messages without navigation changes. Load earlier messages from a
history over 40 comments. Check task cards against accessible project tasks,
excluding cancelled tasks, with done / remaining total. Check dark/light, mobile
navigation drawer, details overlay and inline errors/retry. Task assignment is
shown as assignment, not proof of agent delegation. The coordinator selector uses
the project's authorized management endpoint; verify selection, a visible change
comment, paused-agent errors and conversation-specific active-run status. Verify
that the coordinator only comments, each completed child produces a reporting
wake, and failed/unanswered turns show a system notice without task disposition.
[Server tests](../../server/src/__tests__/project-conversations.test.ts) cover
selection and normal message/assignment/child-completion wakes with a mocked
heartbeat boundary. [Delegation script](../../scripts/cosgral-e2e-delegation.mjs)
requires a separate real-model run; its Node tests validate acceptance on mocks.
Project-scoped ephemeral presence uses the authenticated company WS endpoint with
`?projectConversation=<project UUID>`; human typing expires after five seconds.
Check join/leave, duplicate tabs, blur/send/empty stop, disconnect/reconnect and
unauthorized project/anonymous rejection. Active conversation agents use existing
live-run data and events. [Presence hook tests](../../ui/src/hooks/useProjectConversationPresence.test.tsx)
cover expiry and reconnect; the two-account script covers real WS join/typing/leave.
Browser evidence belongs in the handoff;
these recipes alone do not claim a live pass.

COSGRAL execution verification: `node scripts/cosgral-e2e-delegation.mjs --verify-isolation`
exercises real concurrent worktrees, kernel confinement, coordinator read-only writes,
credential canaries and cleanup without a model. See
[permissions and limits](../../docs/cosgral/uprawnienia-agentow.md). This does not qualify
full heartbeat dispatch or a real-model journey.

COSGRAL view/config verification: [project work projections](../../ui/src/lib/project-work.test.ts),
[conversation UI](../../ui/src/pages/ProjectConversation.test.tsx), existing
AgentConfigForm render and LiveUpdatesProvider tests. The two-account script now
PATCHes a disabled process agent A→B and B→A, waits for an agent.updated WS
invalidation and independently GETs the saved model/budget/concurrency.
This proves HTTP/WS synchronization, not two browsers or actual model execution.

COSGRAL approvals/selection: coordinator context receives a server projection of
same-company skills/model, assigned active-task counts, queued/running load,
concurrency, project access and explicitly unverified provider quota/login/price.
For work requiring human approval, use existing `suggest_tasks` proposals in the
conversation: pending/rejected proposals create no task; human acceptance creates
assigned todo tasks once. `request_confirmation` handles non-task decisions.
Conversation cards reuse the existing resolver and invalidate on thread-interaction
activity for both viewers. Verify accept/reject, concurrent A/B decisions, viewer
and agent denials, retry errors and a new comment that must not imply consent.
[Server coverage](../../server/src/__tests__/project-conversations.test.ts) uses real
PostgreSQL and HTTP with fixture actors; [UI coverage](../../ui/src/pages/ProjectConversation.test.tsx)
uses component rendering and mocked API/events. These are not real-model or
two-browser acceptance evidence.

Coordinator no-op regression: the server must show a system error even if the
agent posts a handoff claim but creates no task/interaction and performs no
scoped child mutation. Old or unrelated task writes cannot satisfy the check;
completion reports validate the stored child binding and require a saved reply.
Informational turns without an action obligation pass without a child mutation.
Workspace preparation tests cover fresh worker worktrees after inherited coordinator
bindings and preservation of the coordinator folder. RO/RW adapter tests exercise
nested bwrap metadata mounts; manual Codex CLI evidence is in Codex #11 and the
follow-up regressions in Codex #12 of COSGRAL-PRZEKAZANIE.md. Live model delegation
remains supervisor acceptance.
