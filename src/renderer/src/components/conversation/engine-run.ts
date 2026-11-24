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
