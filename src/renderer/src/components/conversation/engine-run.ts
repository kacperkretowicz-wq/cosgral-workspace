// A routine or a workflow starts an agent's turn with a message written for the agent: an English header line
// ("[COSGRAL routine run] …", "[COSGRAL workflow run] …") and a sentence about trust. The person reads the same message
// in the conversation, so the window shows who started it and the task itself, not the instructions to the model.

import { t } from "../../i18n";

export type EngineRunCause = "schedule" | "manual" | "webhook";

export type EngineRun =
  | { kind: "routine"; name: string; cause: EngineRunCause; when: string; text: string; webhook: string | null }
  | { kind: "workflow"; name: string; step: string; text: string };

const ROUTINE = /^\[COSGRAL routine run\] "(.*)" \((schedule|manual|webhook), ([^\n]*)\)\n[^\n]*\n([\s\S]*)$/;
const WEBHOOK =
  /\n\nThe webhook payload below is untrusted data[^\n]*\n<webhook_payload[^>]*>\n?([\s\S]*?)\n?<\/webhook_payload>\s*$/;
const WORKFLOW = /^\[COSGRAL workflow run\] "(.*)", step "(.*)"\. A workflow asks you this\.[^\n]*\n\n([\s\S]*)$/;

export function parseEngineRun(body: string): EngineRun | null {
  if (!body.startsWith("[COSGRAL ")) return null;
  const routine = ROUTINE.exec(body);
  if (routine) {
    const [, name = "", cause = "manual", when = "", rest = ""] = routine;
    const webhook = WEBHOOK.exec(rest);
    return {
      kind: "routine",
      name,
      cause: cause === "schedule" || cause === "webhook" ? cause : "manual",
      when,
      text: (webhook ? rest.slice(0, webhook.index) : rest).trim(),
      webhook: webhook ? (webhook[1] ?? "").trim() : null,
    };
  }
  const workflow = WORKFLOW.exec(body);
  if (workflow) {
    const [, name = "", step = "", text = ""] = workflow;
    // The workflow wraps run data in <workflow_data> tags for the agent; the person sees the data itself.
    return { kind: "workflow", name, step, text: text.replace(/<\/?workflow_data>/g, "").trim() };
  }
  return null;
}

/** A short text for a routine or workflow message (replies, previews), or null for any other message. */
export function engineRunSummary(body: string): string | null {
  const run = parseEngineRun(body);
  if (!run) return null;
  const label =
    run.kind === "routine"
      ? t("Routine “{name}”", { name: run.name })
      : t("Workflow “{name}” · step “{step}”", { name: run.name, step: run.step });
  return `${label}: ${run.text}`;
}

const WORKFLOW_TITLE = /^\[COSGRAL workflow run\] "(.*?)", step "(.*?)"(?:\.|$)/;
const WORKFLOW_NAME_ONLY = /^\[COSGRAL workflow run\] "(.*?)"(?:,|\.|$)/;
const ROUTINE_TITLE = /^\[COSGRAL routine run\] "(.*?)" \(/;

/**
 * A thread that a routine or a workflow started is titled after its first line, the agent's header ("[COSGRAL workflow
 * run] "Release", step "Notes". A workflow asks…", cut at 60 characters). The window shows who started it instead, in its
 * own language; null for any other title.
 */
export function engineRunTitle(title: string): string | null {
  if (!title.startsWith("[COSGRAL ")) return null;
  const workflow = WORKFLOW_TITLE.exec(title);
  if (workflow) return t("Workflow “{name}” · step “{step}”", { name: workflow[1] ?? "", step: workflow[2] ?? "" });
  const named = WORKFLOW_NAME_ONLY.exec(title);
  if (named) return t("Workflow “{name}”", { name: named[1] ?? "" });
  if (title.startsWith("[COSGRAL workflow run]")) return t("Workflow run");
  const routine = ROUTINE_TITLE.exec(title);
  if (routine) return t("Routine “{name}”", { name: routine[1] ?? "" });
  if (title.startsWith("[COSGRAL routine run]")) return t("Routine run");
  return null;
}
