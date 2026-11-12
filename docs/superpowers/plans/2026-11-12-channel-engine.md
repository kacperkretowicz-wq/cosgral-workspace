# W1-BE2 channel engine implementation plan

> Execute inline with superpowers:executing-plans. The assignment explicitly authorizes implementation and commits; no new design approval or delegation is needed.

**Goal:** A human channel message runs as a leader task; members help through bounded delegation and return versioned results to the shared channel.

**Architecture:** Extend the existing SQLite ChannelStore with history, memory, result versions and assignment accounting. ChannelEngine owns scheduling and authorization; ChannelAgentRunner uses fresh provider threads through AgentService, the existing Codex dynamic-tool / Claude MCP mechanism. Channel threads never bind to direct-message provider sessions or mailbox history. All channel reads and writes from agents are scoped to the current task and membership. Isolation is application context isolation, not an OS filesystem sandbox.

**Spec:** docs/cosgral/spec-w1-kanaly.md and docs/cosgral/PLAN.md, “Decyzje lidera do kanałów”.

**Constraints:** Only source based on a6fe240; own worktree and branch; no push; loopback; sandbox profile and fake Codex; secrets outside repo. Constants in CHANNEL_LIMITS: instructions 2000, memory entry 500, short answers 2, automatic assignments 8. Paused/cancelled work resumes only from human API. Archive is a flag. Result correction supersedes the previous version. Resources are browser or workspace:<absolute path>.

**Review focus:** late tool calls after Stop/transfer; same-resource release before process completion; child results waking the parent once; dependency/resource head-of-line deadlocks; restart of uncertain work; cross-channel or DM history leakage.

## 1. Storage and contract
- [ ] RED: limits, strict resource keys/canonical Windows paths, versioned results, durable messages/memory, pause budget + human reset, archived/dependency queue, recovery.
- [ ] GREEN: contracts, schema additions compatible with the existing DB, ChannelStore methods and atomic result/message writes. Publish task/message events after commit.
- [ ] Verify focused store/contract tests, commit.

## 2. Engine and isolated turns
- [ ] RED: human→leader, child→parent continuation once, serial resources across channels, dependencies, transfer/stop and stale callbacks, bounded questions, membership, memory isolation, restart recovery.
- [ ] GREEN: ChannelEngine scheduler with AbortControllers, active-run resource leases and per-turn capability; dynamic channel tools; ChannelAgentRunner with dedicated ephemeral threads and interruption; AgentService routing including pending prompts/approvals.
- [ ] Verify focused engine/runner/service tests, commit.

## 3. UI boundary and proof
- [ ] RED/GREEN: message IPC parsers/decoders/events; optional new preload methods, existing task/channel reads kept compatible.
- [ ] Fake Codex sandbox: leader + 2 members, assignment, result version, memory, automatic limit pause and human resume, stop; save evidence outside repo.
- [ ] Run complete bun run test, typecheck, build; inspect failures, fix and recheck.
- [ ] Self-review full diff, update COSGRAL-CHANGES.md and docs/cosgral-raporty/backend-w1-be2.md with “Kontrakt dla UI”; commit with trailer, no push.

## 4. W1-BE3: action cards (draft preview / confirm, browser takeover)
- Spec: spec-w1-kanaly.md §4–5; lead decisions 5 (takeover counts in Needs you) and 6 (one card type with variants).
- Contract: `DraftPreviewCard.variant` = `draft` (Send / Edit / Keep draft) | `confirm` (outward action: same three decisions, UI labels Confirm / Edit / Cancel). `RespondToDraftPreviewInput.text?` = the user's own edited version. Kept drafts are durable: `agent.listDrafts?`, `agent.deleteDraft?`, event `drafts-changed`.
- Engine: `ActionCards` (pure, testable) keeps open cards in memory with the shared pending order; AgentService merges them into `listPendingRequests`, Needs you counts and row activity; cards expire with their turn.
- Agent tools: namespace `cosgral_cards` (`confirm`, `request_takeover`, `list_drafts`) as Codex dynamic tools and a Claude in-process MCP server, the same path as `cosgral_eyes`; allowed in channel turns.
- Takeover: requested → taken-over (tab shown, agent browser tools on that tab refused) → returned (tool returns the tab's current URL; same persistent browser session) | declined | expired.
- [ ] RED/GREEN ActionCards, AgentService wiring, IPC parsers, preload; sandbox on the fake Codex; report.

## Ledger
- Existing part 1: 480b912f7, acf355c7b, 436dda27c. Integration 5934131e3 merged in b9e763d67. No uncommitted changes at resume.
- Ruling: fresh ephemeral channel threads on each continuation. Durable channel/task/history is the context source; never replay uncertain running work after restart (pause it for a human). This trades provider context reuse for clear isolation.
- Ruling: short questions are child tasks tagged as questions (no new root), max 2 answers in the helper thread; child ownership never changes the asking task's owner.
- Ruling: archived channels reject new work and suspend queued starts; active turns finish. Archive is visibility/dispatch control, Stop interrupts.
