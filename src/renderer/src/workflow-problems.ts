import { withoutIpcPrefix } from "./components/provider-error";
import { t, tData } from "./i18n";

/**
 * `workflowProblems()` (contracts) returns English sentences, some with a step name or an id inside. Static ones are
 * translated through `tData()`; the others are matched here and put through `t()` with their value, in the order that
 * keeps the more specific sentence first.
 */
const PATTERNS: ReadonlyArray<{ pattern: RegExp; translate: (match: RegExpMatchArray) => string }> = [
  { pattern: /^At most (\d+) steps\.$/, translate: (m) => t("At most {n} steps.", { n: m[1] ?? "" }) },
  { pattern: /^At most (\d+) connections\.$/, translate: (m) => t("At most {n} connections.", { n: m[1] ?? "" }) },
  {
    pattern: /^Two steps have the same id: (.+)\.$/,
    translate: (m) => t("Two steps have the same id: {id}.", { id: m[1] ?? "" }),
  },
  {
    pattern: /^Two connections have the same id: (.+)\.$/,
    translate: (m) => t("Two connections have the same id: {id}.", { id: m[1] ?? "" }),
  },
  {
    pattern: /^Connection (.+) points to an unknown step\.$/,
    translate: (m) => t("Connection {id} points to an unknown step.", { id: m[1] ?? "" }),
  },
  {
    pattern: /^Connection (.+) leaves the approval (.+): use Allow or Deny\.$/,
    translate: (m) =>
      t("Connection {connection} leaves the approval {step}: use Allow or Deny.", {
        connection: m[1] ?? "",
        step: m[2] ?? "",
      }),
  },
  {
    pattern: /^Connection (.+) leaves the condition (.+): use Yes or No\.$/,
    translate: (m) =>
      t("Connection {connection} leaves the condition {step}: use Yes or No.", {
        connection: m[1] ?? "",
        step: m[2] ?? "",
      }),
  },
  {
    pattern: /^Connection (.+) leaves (.+): use Next\.$/,
    translate: (m) =>
      t("Connection {connection} leaves {step}: use Next.", { connection: m[1] ?? "", step: m[2] ?? "" }),
  },
  {
    pattern: /^The trigger cannot have incoming connections \((.+)\)\.$/,
    translate: (m) => t("The trigger cannot have incoming connections ({connection}).", { connection: m[1] ?? "" }),
  },
  {
    pattern: /^The approval (.+) needs an Allow connection\.$/,
    translate: (m) => t("The approval {step} needs an Allow connection.", { step: m[1] ?? "" }),
  },
  {
    pattern: /^The approval (.+) has more than one way on for a decision\.$/,
    translate: (m) => t("The approval {step} has more than one way on for a decision.", { step: m[1] ?? "" }),
  },
  {
    pattern: /^The condition (.+) needs a Yes or a No connection\.$/,
    translate: (m) => t("The condition {step} needs a Yes or a No connection.", { step: m[1] ?? "" }),
  },
  {
    pattern: /^The condition (.+) has more than one way on for an answer\.$/,
    translate: (m) => t("The condition {step} has more than one way on for an answer.", { step: m[1] ?? "" }),
  },
  {
    pattern: /^These steps are not reachable from the trigger: (.+)\.$/,
    translate: (m) => t("These steps are not reachable from the trigger: {steps}.", { steps: m[1] ?? "" }),
  },
  {
    pattern: /^(.+) has more than one way on; keep one connection\.$/,
    translate: (m) => t("{step} has more than one way on; keep one connection.", { step: m[1] ?? "" }),
  },
  {
    pattern: /^This workflow cannot be saved: ([\s\S]+)$/,
    translate: (m) =>
      t("This workflow cannot be saved: {problems}", {
        problems: (m[1] ?? "")
          .split(/(?<=\.) (?=[A-Z"])/)
          .map((part) => workflowProblemText(part))
          .join(" "),
      }),
  },
  // What a single step still needs (`workflowNodeIssues`, and the same sentences when the program refuses a save).
  {
    pattern: /^Every step needs a title \(1–(\d+) characters\)\.$/,
    translate: (m) => t("Every step needs a title (1–{n} characters).", { n: m[1] ?? "" }),
  },
  {
    pattern: /^The routine "(.*)" in the trigger does not exist\.$/,
    translate: (m) => t('The routine "{id}" in the trigger does not exist.', { id: m[1] ?? "" }),
  },
  {
    pattern: /^The agent "(.*)" in step "(.*)" does not exist\.$/,
    translate: (m) => t('The agent "{id}" in step "{title}" does not exist.', { id: m[1] ?? "", title: m[2] ?? "" }),
  },
  {
    pattern: /^The channel "(.*)" in step "(.*)" does not exist\.$/,
    translate: (m) => t('The channel "{id}" in step "{title}" does not exist.', { id: m[1] ?? "", title: m[2] ?? "" }),
  },
  {
    pattern: /^Step "(.*)" needs an agent\.$/,
    translate: (m) => t('Step "{title}" needs an agent.', { title: m[1] ?? "" }),
  },
  {
    pattern: /^Step "(.*)" needs a channel\.$/,
    translate: (m) => t('Step "{title}" needs a channel.', { title: m[1] ?? "" }),
  },
  {
    pattern: /^Step "(.*)" needs an instruction\.$/,
    translate: (m) => t('Step "{title}" needs an instruction.', { title: m[1] ?? "" }),
  },
  {
    pattern: /^Step "(.*)" needs a text to check\.$/,
    translate: (m) => t('Step "{title}" needs a text to check.', { title: m[1] ?? "" }),
  },
  {
    pattern: /^Step "(.*)" needs a value to compare with\.$/,
    translate: (m) => t('Step "{title}" needs a value to compare with.', { title: m[1] ?? "" }),
  },
  {
    pattern: /^Step "(.*)" needs a text\.$/,
    translate: (m) => t('Step "{title}" needs a text.', { title: m[1] ?? "" }),
  },
  {
    pattern: /^Step "(.*)": the text is longer than (\d+) characters\.$/,
    translate: (m) =>
      t('Step "{title}": the text is longer than {n} characters.', { title: m[1] ?? "", n: m[2] ?? "" }),
  },
  {
    pattern: /^Step "(.*)": the value is longer than (\d+) characters\.$/,
    translate: (m) =>
      t('Step "{title}": the value is longer than {n} characters.', { title: m[1] ?? "", n: m[2] ?? "" }),
  },
];

/** One sentence about a workflow in the window language, without Electron's "Error invoking remote method" in front of it. */
export function workflowProblemText(problem: string): string {
  const sentence = withoutIpcPrefix(problem);
  for (const { pattern, translate } of PATTERNS) {
    const match = sentence.match(pattern);
    if (match) return translate(match);
  }
  return tData(sentence);
}
