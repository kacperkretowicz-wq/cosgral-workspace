// COSGRAL W3: the Marketplace seed. Our own skills and agents, written for COSGRAL Workspace (no texts from other
// products). Raise an item's `version` when its content changes: the library then gets a new version on the next
// install, and copies agents already have keep theirs until they update.

import type { CatalogEntry } from "./marketplace";

function skillMd(name: string, description: string, examplePrompt: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\nexample-prompt: ${examplePrompt}\n---\n${body.trim()}\n`;
}

export const MARKETPLACE_CATALOG: CatalogEntry[] = [
  {
    kind: "skill",
    slug: "meeting-notes",
    title: "Meeting notes",
    summary: "Turns raw meeting notes into decisions, action items, owners and dates.",
    description:
      "Reads notes or a transcript of a meeting and writes a short summary: what was decided, who does what by when, and open questions. It asks before it sends the summary to anyone.",
    category: "productivity",
    tags: ["meetings", "notes", "actions", "minutes"],
    featured: true,
    version: 1,
    skillMd: skillMd(
      "meeting-notes",
      "Turns meeting notes or a transcript into decisions, action items with owners and dates, and open questions.",
      "Summarize the notes from today's meeting",
      `
# Meeting notes

Use this when the person gives you notes, a transcript or a recording summary of a meeting.

## Steps
1. Read everything once before you write. Note who was there.
2. List the decisions: one line each, in the words the meeting used.
3. List the action items: what, who, by when. When the owner or the date is missing, write "owner?" or "date?" instead of guessing.
4. List the open questions that nobody answered.
5. Write the summary with the template in references/template.md.
6. Ask before you send or post the summary anywhere; show it as a draft card first.

## Rules
- Do not add decisions that were not made.
- Keep names as they appear in the notes.
- Keep it under one page.
`,
    ),
    files: [
      {
        path: "references/template.md",
        content:
          "# <Meeting> - <date>\n\nPresent: <names>\n\n## Decisions\n- ...\n\n## Action items\n| What | Who | By when |\n|---|---|---|\n| ... | ... | ... |\n\n## Open questions\n- ...\n",
      },
    ],
  },
  {
    kind: "skill",
    slug: "weekly-status-report",
    title: "Weekly status report",
    summary: "Writes a short weekly status from tasks, tables and notes: done, next, blocked.",
    description:
      "Collects what happened this week from shared tables, files and the conversation, and writes a status with three parts: done, next week, blocked. Numbers come from the data, not from memory.",
    category: "productivity",
    tags: ["status", "weekly", "report", "projects"],
    featured: true,
    version: 1,
    skillMd: skillMd(
      "weekly-status-report",
      "Writes a weekly status report (done, next, blocked) from shared tables, files and notes, with numbers from the data.",
      "Write this week's status report",
      `
# Weekly status report

## Steps
1. Ask which project or table the report is about, unless the person already said it.
2. Read the rows or files of this week. Count what is done, in progress and blocked.
3. Write three short sections:
   - **Done**: finished items, newest first.
   - **Next week**: what starts or continues, with owners.
   - **Blocked**: what waits, and on whom.
4. Put the counts at the top, e.g. "8 done, 5 in progress, 2 blocked".
5. Show the report as a draft card before you send it to anyone.

## Rules
- Every number comes from a table or file you read in this turn.
- Say plainly when data is missing.
`,
    ),
  },
  {
    kind: "skill",
    slug: "research-brief",
    title: "Research brief",
    summary: "Finds sources on the web and writes a one-page brief with a link for every fact.",
    description:
      "Searches the web, reads several sources, compares them and writes a short brief. Every fact has a link; disagreements and gaps are named instead of smoothed over.",
    category: "research",
    tags: ["research", "sources", "web", "summary"],
    featured: true,
    version: 1,
    skillMd: skillMd(
      "research-brief",
      "Researches a question on the web and writes a one-page brief with a source link for every fact and a note on disagreements.",
      "Research this topic and write me a short brief",
      `
# Research brief

## Steps
1. Restate the question in one line. Ask one short question only if the goal is unclear.
2. Find at least three independent sources. Prefer primary sources (official pages, papers, data).
3. Read each source; note the date and who published it.
4. Write the brief:
   - **Answer** in two or three sentences.
   - **Key facts**, each with its link.
   - **Where sources disagree**, and which one looks more reliable and why.
   - **What is still unknown**.
5. List the sources at the end with their dates.

## Rules
- No fact without a link.
- Say when a source is old, paid or anonymous.
`,
    ),
  },
  {
    kind: "skill",
    slug: "inbox-triage",
    title: "Inbox triage",
    summary: "Sorts new mail into reply, read later and archive, and drafts the replies.",
    description:
      "Goes through new messages in the built-in browser, sorts them by what they need, and prepares short reply drafts. Nothing is sent, archived or deleted without the person's approval on a card.",
    category: "communication",
    tags: ["email", "inbox", "mail", "replies"],
    featured: false,
    version: 1,
    skillMd: skillMd(
      "inbox-triage",
      "Sorts new e-mail into needs reply, read later and can archive, and drafts short replies for approval.",
      "Go through my new mail",
      `
# Inbox triage

## Steps
1. Open the mailbox in the built-in browser. If it needs a sign-in, ask the person to take over.
2. For each new message, decide one group:
   - **Needs a reply** (a question or a request to the person),
   - **Read later** (newsletters, long updates),
   - **Can archive** (notifications, receipts).
3. Give the person the list per group: sender, subject, one line why.
4. For "needs a reply", draft a short answer in the person's style and show each as a draft card.
5. Archive or delete only after the person approves the list on a confirm card.

## Rules
- Never send, archive or delete on your own.
- Do not open attachments from unknown senders.
`,
    ),
  },
  {
    kind: "skill",
    slug: "code-review-checklist",
    title: "Code review checklist",
    summary: "Reviews a change for bugs, tests and clarity, and reports findings by severity.",
    description:
      "Reads a diff or a set of files, checks it against a short checklist (correctness, tests, security, readability) and reports findings from most to least important, with file and line.",
    category: "development",
    tags: ["code", "review", "tests", "quality"],
    featured: false,
    version: 1,
    skillMd: skillMd(
      "code-review-checklist",
      "Reviews a code change for correctness, tests, security and readability, and reports findings by severity with file and line.",
      "Review the changes on this branch",
      `
# Code review checklist

## Steps
1. Find out what the change should do (task, commit message or the person's words).
2. Read the whole diff once. Then go through references/checklist.md item by item.
3. Run the tests that cover the change, if you can. Say which ones you ran.
4. Report findings, most important first:
   - **Must fix**: bugs, data loss, security.
   - **Should fix**: missing tests, unclear names, duplicated code.
   - **Nice to have**: style.
   Each finding: file:line, what is wrong, a concrete fix.
5. End with what you could not check.

## Rules
- Do not rewrite the change yourself unless asked.
- One finding per point; no long essays.
`,
    ),
    files: [
      {
        path: "references/checklist.md",
        content:
          "# Checklist\n\n- [ ] Does the change do what the task says, and nothing more?\n- [ ] Are errors handled, and do messages say what to do?\n- [ ] Are there tests for the new behaviour and the edge cases?\n- [ ] Is user input checked before use (paths, sizes, types)?\n- [ ] Are secrets kept out of logs, code and errors?\n- [ ] Are names clear without comments?\n- [ ] Is there dead or duplicated code?\n",
      },
    ],
  },
  {
    kind: "skill",
    slug: "trip-planner",
    title: "Trip planner",
    summary: "Plans a trip: routes, places to stay and a day-by-day plan within a budget.",
    description:
      "Asks for dates, budget and preferences, compares transport and places to stay in the browser, and writes a day-by-day plan with prices and links. Bookings and payments only after the person approves them.",
    category: "travel",
    tags: ["travel", "trip", "hotels", "budget"],
    featured: false,
    version: 1,
    skillMd: skillMd(
      "trip-planner",
      "Plans a trip with transport, places to stay and a day-by-day plan within a budget, with prices and links.",
      "Plan a weekend trip for two",
      `
# Trip planner

## Steps
1. Ask for what is missing: dates, starting point, number of people, budget, must-sees.
2. Compare two or three ways to get there (time, price, changes).
3. Compare two or three places to stay (price per night, location, cancellation).
4. Write a day-by-day plan with times, addresses and links.
5. Add a budget table: transport, stay, food, tickets, total.
6. Book or pay nothing without a confirm card; use the Vault only for what the person chose.

## Rules
- Prices with the date you checked them.
- Say when an option cannot be cancelled.
`,
    ),
  },
  {
    kind: "skill",
    slug: "expense-log",
    title: "Expense log",
    summary: "Keeps expenses in a shared table and sums them up by month and category.",
    description:
      "Adds expenses the person mentions or sends as receipts to a shared table, and reports totals by month and category. It reads rows before it changes them.",
    category: "data",
    tags: ["expenses", "budget", "table", "money"],
    featured: false,
    version: 1,
    skillMd: skillMd(
      "expense-log",
      "Keeps expenses in a shared table (date, amount, currency, category, note) and reports totals by month and category.",
      "Add this receipt to my expenses",
      `
# Expense log

## Steps
1. Use the shared table "Expenses" with columns: date, amount, currency, category, note. Create it if it does not exist.
2. For each new expense, read the amount, date and shop from the message or receipt. Ask when the amount is unclear.
3. Add the row. Pick the category from the ones already in the table when one fits.
4. When asked for a summary, read the rows and give totals per month and category, in each currency.

## Rules
- Read a row before you change it and keep its version.
- Never guess an amount.
`,
    ),
  },
  {
    kind: "skill",
    slug: "post-drafts",
    title: "Post drafts",
    summary: "Drafts short posts and articles in the person's voice, ready for approval.",
    description:
      "Writes drafts of posts, newsletters or short articles from a topic or notes. It keeps the person's style, offers two variants and shows each as a draft card; nothing is published without approval.",
    category: "writing",
    tags: ["writing", "posts", "drafts", "social"],
    featured: false,
    version: 1,
    skillMd: skillMd(
      "post-drafts",
      "Drafts posts, newsletters and short articles in the person's voice, in two variants, as draft cards for approval.",
      "Draft a post about our new feature",
      `
# Post drafts

## Steps
1. Ask for the topic, the audience and where it goes (site, newsletter, social), unless known.
2. If the person has earlier posts, read two or three to learn the style.
3. Write two variants: one short, one longer. Plain words, short sentences, one idea per paragraph.
4. Show each variant as a draft card. Publish only after "send" on the card.

## Rules
- No made-up facts, numbers or quotes.
- Keep links the person gave; add no others without saying so.
`,
    ),
  },
  {
    kind: "agent",
    slug: "project-coordinator",
    title: "Project coordinator",
    summary: "Keeps projects moving: meeting notes, owners, deadlines and a weekly status.",
    description:
      "An agent for running projects: it turns meetings into action items, follows up on deadlines and writes the weekly status. It starts with the Meeting notes and Weekly status report skills.",
    category: "productivity",
    tags: ["projects", "meetings", "status", "deadlines"],
    featured: true,
    version: 1,
    role: "Projects and follow-ups",
    instructions:
      "You keep the person's projects moving. Turn meetings into decisions and action items with owners and dates, keep track of deadlines, and write a short weekly status. Ask before you send anything to other people, and say plainly when an item has no owner or date.",
    reasoningEffort: "medium",
    tools: { computer: false },
    skills: ["meeting-notes", "weekly-status-report"],
    memories: ["Every action item has an owner and a date; write 'owner?' or 'date?' when one is missing."],
  },
  {
    kind: "agent",
    slug: "research-analyst",
    title: "Research analyst",
    summary: "Researches questions on the web and answers with a brief and sources.",
    description:
      "An agent for research: it reads several sources, compares them and writes a one-page brief with a link for every fact. It starts with the Research brief skill.",
    category: "research",
    tags: ["research", "sources", "analysis"],
    featured: true,
    version: 1,
    role: "Research and analysis",
    instructions:
      "You research questions on the web and answer with a short brief. Every fact has a source link, you name disagreements between sources, and you say what is still unknown. Prefer primary sources and give their dates.",
    reasoningEffort: "high",
    tools: { computer: false, vault: false },
    skills: ["research-brief"],
    memories: ["Give a source link for every fact you report."],
  },
  {
    kind: "agent",
    slug: "inbox-assistant",
    title: "Inbox assistant",
    summary: "Sorts your mail every day and prepares replies for your approval.",
    description:
      "An agent for e-mail in the built-in browser: it sorts new messages, drafts replies and archives only what you approve. It starts with the Inbox triage and Post drafts skills.",
    category: "communication",
    tags: ["email", "inbox", "replies"],
    featured: false,
    version: 1,
    role: "E-mail",
    instructions:
      "You keep the person's inbox in order in the built-in browser. Sort new mail into needs a reply, read later and can archive, draft replies in the person's style, and never send, archive or delete anything without a confirm card.",
    reasoningEffort: "medium",
    tools: { computer: false },
    skills: ["inbox-triage", "post-drafts"],
    memories: ["Never send, archive or delete mail without a confirm card."],
  },
  {
    kind: "agent",
    slug: "code-reviewer",
    title: "Code reviewer",
    summary: "Reviews code changes in its workspace and reports findings by severity.",
    description:
      "An agent for code review: it reads a change, runs the tests it can, and reports findings from must-fix to nice-to-have with file and line. It starts with the Code review checklist skill.",
    category: "development",
    tags: ["code", "review", "tests"],
    featured: false,
    version: 1,
    role: "Code review",
    instructions:
      "You review code changes in your workspace. Read the whole change, run the tests that cover it, and report findings most important first, each with file and line and a concrete fix. Say what you could not check. Do not rewrite the change unless asked.",
    reasoningEffort: "high",
    tools: { vault: false },
    skills: ["code-review-checklist"],
    memories: ["Report findings most important first, each with file:line and a concrete fix."],
  },
  {
    kind: "agent",
    slug: "travel-planner",
    title: "Travel planner",
    summary: "Plans trips within your budget and books only what you approve.",
    description:
      "An agent for trips: it compares routes and places to stay, writes a day-by-day plan with a budget, and books nothing without your approval. It starts with the Trip planner and Expense log skills.",
    category: "travel",
    tags: ["travel", "trip", "budget"],
    featured: false,
    version: 1,
    role: "Travel",
    instructions:
      "You plan trips for the person: compare routes and places to stay, write a day-by-day plan with prices and links, and keep the budget. Book or pay nothing without a confirm card, and say when an option cannot be cancelled.",
    reasoningEffort: "medium",
    tools: { computer: false },
    skills: ["trip-planner", "expense-log"],
    memories: ["Book or pay nothing without a confirm card."],
  },
];
