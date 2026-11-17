// COSGRAL W12-KK: more Marketplace content (6 skills, 4 agents). Our own texts, written for COSGRAL Workspace.
// Same rules as marketplace-catalog.ts: raise an item's `version` when its content changes; agents use only catalog skills.

import type { CatalogEntry } from "./marketplace";

function skillMd(name: string, description: string, examplePrompt: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\nexample-prompt: ${examplePrompt}\n---\n${body.trim()}\n`;
}

export const MORE_CATALOG: CatalogEntry[] = [
  {
    kind: "skill",
    slug: "daily-brief",
    title: "Daily brief",
    summary: "Writes a one-screen morning brief: what is on today, what needs a decision, what is late.",
    description:
      "Collects today's plan from the shared tables, the files you point it to and the conversation, and writes a brief that fits on one screen: schedule, decisions waiting for you, and things that are late. It never sends the brief anywhere without asking.",
    category: "productivity",
    tags: ["brief", "morning", "planning", "priorities"],
    featured: true,
    version: 1,
    skillMd: skillMd(
      "daily-brief",
      "Writes a one-screen morning brief with today's plan, the decisions waiting for the person and the items that are late.",
      "Write my brief for today",
      `
# Daily brief

Use this when the person asks for a morning brief, a day plan or "what is on today".

## Steps
1. Read what you have: the shared tables the person named, the notes and files they pointed to, and the latest conversation. Do not guess what you cannot read; list it under "Could not check".
2. Write the brief in this order, in the template in references/template.md:
   - **Today**: the plan in time order, at most seven lines.
   - **Needs your decision**: each item as one question the person can answer with yes or no.
   - **Late**: what is past its date, with the date and who owns it.
   - **Could not check**: sources you could not read.
3. Keep it to one screen. Cut the least important line before you cut the decisions.
4. Show the brief as a draft. Send or post it only after the person confirms on a card.

## Rules
- Dates are written in full (Tue 18 Nov), not "tomorrow".
- A line without an owner says "owner?".
- Numbers come from the data, not from memory.
`,
    ),
    files: [
      {
        path: "references/template.md",
        content:
          "# Brief for <weekday date>\n\n## Today\n- <time> <what>\n\n## Needs your decision\n1. <question>?\n\n## Late\n- <what>, due <date>, owner <name or owner?>\n\n## Could not check\n- <source>\n",
      },
    ],
  },
  {
    kind: "skill",
    slug: "decision-log",
    title: "Decision log",
    summary: "Keeps a log of decisions with the reason, the alternatives and who decided.",
    description:
      "Records each decision in a shared table: what was decided, why, which options were dropped, who decided and when it should be looked at again. Later it answers 'why did we do it this way'.",
    category: "productivity",
    tags: ["decisions", "log", "history", "reasons"],
    featured: false,
    version: 1,
    skillMd: skillMd(
      "decision-log",
      "Records decisions in a shared table with the reason, the dropped options, the decider and a date to review, and answers questions about past decisions.",
      "Log the decision we just made",
      `
# Decision log

## Recording a decision
1. Make sure the table "Decisions" exists in the shared tables. If it does not, create it with the columns: Decision, Why, Dropped options, Decided by, Date, Review on.
2. Write the decision in one sentence that can be understood alone, without the conversation.
3. Fill "Why" with the reason in the person's words. If the reason was not said, write "reason not given" and ask once.
4. Fill "Dropped options" with the alternatives that were discussed and why each lost. "None discussed" is a valid answer.
5. Put a review date when the decision depends on something that can change (a price, a deadline, a test result).

## Answering "why did we do this"
1. Search the table for the topic.
2. Quote the row: decision, reason, who and when. Do not add reasons that are not in the row.
3. If nothing matches, say so and offer to record the decision now.

## Rules
- Never edit an old row. Add a new row that replaces it and name the old one in "Why".
`,
    ),
  },
  {
    kind: "skill",
    slug: "source-check",
    title: "Source check",
    summary: "Checks a claim against its sources and says what holds up and what does not.",
    description:
      "Takes a claim, finds where it comes from, checks it against independent sources and reports one of four verdicts: confirmed, partly true, not supported, or cannot be checked. Every verdict has its links.",
    category: "research",
    tags: ["fact check", "claims", "sources", "verification"],
    featured: false,
    version: 1,
    skillMd: skillMd(
      "source-check",
      "Checks a claim against its original source and independent sources and gives a verdict with links: confirmed, partly true, not supported, or cannot be checked.",
      "Check whether this claim is true",
      `
# Source check

## Steps
1. Write the claim in one sentence, exactly as it was said. Note who said it and where.
2. Find the original source of the claim, not a page that repeats it. If you cannot find one, say so.
3. Find at least two independent sources on the same point. Independent means they did not copy each other.
4. Compare the numbers, dates and names word for word. Note every difference.
5. Give the verdict:
   - **Confirmed**: the original and independent sources agree.
   - **Partly true**: the core is right but a number, date or context is off. Say which.
   - **Not supported**: sources contradict it or nothing backs it.
   - **Cannot be checked**: the sources are paid, private or missing.
6. List the links with their dates.

## Rules
- A verdict without a link is not a verdict.
- Say plainly when you could only read a summary and not the source itself.
- Do not judge the person who made the claim; judge the claim.
`,
    ),
  },
  {
    kind: "skill",
    slug: "copy-edit",
    title: "Copy edit",
    summary: "Edits a draft for clarity and keeps your voice, and shows what it changed.",
    description:
      "Edits a draft sentence by sentence: cuts filler, fixes grammar and unclear lines, keeps your voice and meaning. It returns the clean text and a short list of the changes that mattered, so you can reject any of them.",
    category: "writing",
    tags: ["editing", "writing", "clarity", "proofreading"],
    featured: false,
    version: 1,
    skillMd: skillMd(
      "copy-edit",
      "Edits a draft for clarity, grammar and length while keeping the author's voice, then lists the changes that mattered.",
      "Edit this draft but keep my voice",
      `
# Copy edit

## Steps
1. Ask for the reader and the length only if the draft does not make them obvious.
2. Read the whole draft once without changing anything. Note the voice: formal or casual, short or long sentences, first person or not.
3. Edit in this order: meaning problems, structure, unclear sentences, filler words, grammar and spelling.
4. Keep names, numbers, quotes and the author's key phrases unchanged.
5. Return:
   - **Clean text**.
   - **Changes that mattered**, at most ten, each as "before → after" with a few words of why.
   - **Questions**, where the meaning was unclear and you did not want to guess.

## Rules
- Do not add facts or opinions.
- Do not make the text longer unless a sentence was missing.
- If the draft is already good, say so and change only what is wrong.
`,
    ),
  },
  {
    kind: "skill",
    slug: "support-reply",
    title: "Support reply",
    summary: "Drafts a customer reply that says what is known, what is not, and what happens next.",
    description:
      "Writes a reply to a customer message in three honest parts: what we know, what we do not know yet, and the next step with a time. It matches the customer's tone and never promises what is not decided. It shows the draft and sends nothing by itself.",
    category: "communication",
    tags: ["support", "customers", "reply", "email"],
    featured: false,
    version: 1,
    skillMd: skillMd(
      "support-reply",
      "Drafts a customer reply with what is known, what is not known yet and the next step with a time, in the customer's tone, and shows it as a draft.",
      "Draft a reply to this customer",
      `
# Support reply

## Steps
1. Read the customer's message twice. Write down, in one line each: what they asked, what they feel (annoyed, confused, polite), and what they need to do next.
2. Check the facts you have (order, account, history in the files or tables you can read). Mark each fact as known or not known.
3. Write the reply in this order:
   - One sentence that shows you understood the problem, in the customer's words.
   - **What we know**.
   - **What we do not know yet**, said plainly.
   - **Next step**, with who does it and by when.
4. Match the tone: short and warm for a short message, more careful for a long upset one. No jargon.
5. Show the reply as a draft card. Do not send it.

## Rules
- Never promise a refund, a date or a fix that nobody decided.
- Do not blame the customer, another team or a tool.
- If the facts are missing, ask the person for them before you write.
`,
    ),
  },
  {
    kind: "skill",
    slug: "data-cleanup",
    title: "Data cleanup",
    summary: "Cleans a table: duplicates, formats and empty cells, and reports what it changed.",
    description:
      "Looks through a shared table, finds duplicate rows, mixed formats (dates, phone numbers, spelling of names) and empty cells, and fixes what is safe. Anything that is a guess goes to a list for you to decide. It keeps a report of every change.",
    category: "data",
    tags: ["tables", "cleanup", "duplicates", "formats"],
    featured: false,
    version: 1,
    skillMd: skillMd(
      "data-cleanup",
      "Cleans a shared table by removing exact duplicates, normalising formats and flagging guesses, and reports every change.",
      "Clean up this table",
      `
# Data cleanup

## Steps
1. Read the table's columns and a sample of rows. Tell the person what each column seems to hold; ask only if a column is unclear.
2. Find problems, and sort them into two groups:
   - **Safe to fix**: exact duplicate rows, extra spaces, inconsistent capital letters, dates written in different formats, numbers stored as text.
   - **A guess**: near-duplicates, a missing value you would have to invent, a name spelled two ways.
3. Before you change anything, say how many rows each fix touches. Then fix only the safe group.
4. Put the guesses in a list with the row, the column and your suggestion. Do not apply them.
5. Report: rows before and after, each fix with its count, and the list of guesses.

## Rules
- Never delete a row that is not an exact duplicate.
- Never fill an empty cell with an invented value.
- Keep the original values in the report so any change can be undone by hand.
`,
    ),
  },
  {
    kind: "agent",
    slug: "chief-of-staff",
    title: "Chief of staff",
    summary: "Runs your day: a morning brief, a decision log and notes from every meeting.",
    description:
      "An agent for the person who has too much on the plate: it writes the daily brief, keeps the log of decisions, turns meetings into action items and tells you what is late. It starts with the Daily brief, Decision log and Meeting notes skills.",
    category: "productivity",
    tags: ["brief", "decisions", "meetings", "priorities"],
    featured: true,
    version: 1,
    role: "Chief of staff",
    instructions:
      "You help the person run their day. Write a one-screen daily brief, keep the decision log, turn meetings into action items with owners and dates, and say what is late. Ask a short question only when a decision is needed, and send nothing to other people without a confirm card.",
    reasoningEffort: "medium",
    tools: { computer: false },
    skills: ["daily-brief", "decision-log", "meeting-notes"],
    memories: ["Show every message to other people as a draft first; never send without a confirm card."],
  },
  {
    kind: "agent",
    slug: "copy-editor",
    title: "Copy editor",
    summary: "Edits your drafts in your own voice and drafts posts from an idea.",
    description:
      "An agent for writing: it edits what you wrote without changing your voice, and turns a rough idea into a few draft versions. It shows what it changed and publishes nothing. It starts with the Copy edit and Post drafts skills.",
    category: "writing",
    tags: ["editing", "writing", "drafts", "voice"],
    featured: false,
    version: 1,
    role: "Editing and drafts",
    instructions:
      "You edit and draft text for the person. Keep their voice and meaning, show the changes that mattered, and add no facts of your own. Publish or send nothing; give drafts only.",
    reasoningEffort: "medium",
    tools: { computer: false, vault: false },
    skills: ["copy-edit", "post-drafts"],
    memories: ["Keep the author's voice; list the changes that mattered after every edit."],
  },
  {
    kind: "agent",
    slug: "support-desk",
    title: "Support desk",
    summary: "Sorts the support inbox and drafts honest replies for you to approve.",
    description:
      "An agent for customer messages: it sorts what came in, drafts replies that say what is known and what is not, and sends nothing without your approval. It starts with the Inbox triage and Support reply skills.",
    category: "communication",
    tags: ["support", "customers", "inbox", "replies"],
    featured: false,
    version: 1,
    role: "Customer support",
    instructions:
      "You handle customer messages for the person in the built-in browser. Sort new messages by urgency, draft replies that say what is known, what is not and the next step, and never send, archive or delete anything without a confirm card. Never promise what was not decided.",
    reasoningEffort: "medium",
    tools: { computer: false },
    skills: ["inbox-triage", "support-reply"],
    memories: ["Never promise a refund, a date or a fix that nobody decided."],
  },
  {
    kind: "agent",
    slug: "data-steward",
    title: "Data steward",
    summary: "Keeps your tables clean and your expenses in order, and reports every change.",
    description:
      "An agent for tables and numbers: it cleans duplicates and formats, keeps the expense table up to date and reports every change it made. Anything that is a guess goes to you. It starts with the Data cleanup and Expense log skills.",
    category: "data",
    tags: ["tables", "expenses", "cleanup", "numbers"],
    featured: false,
    version: 1,
    role: "Tables and data",
    instructions:
      "You keep the person's shared tables clean and correct. Fix only what is safe, list every guess for the person to decide, and report each change with its count. Numbers come from the data, never from memory. Delete nothing that is not an exact duplicate.",
    reasoningEffort: "medium",
    tools: { computer: false, vault: false },
    skills: ["data-cleanup", "expense-log"],
    memories: ["Report every change with a count; never invent a value for an empty cell."],
  },
];
