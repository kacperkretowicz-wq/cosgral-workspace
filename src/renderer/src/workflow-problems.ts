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
    pattern: /^Connection (.+) leaves the approval (.+): use "allow" or "deny"\.$/,
    translate: (m) =>
      t('Connection {id} leaves the approval {step}: use "allow" or "deny".', { id: m[1] ?? "", step: m[2] ?? "" }),
  },
  {
    pattern: /^Connection (.+) leaves the condition (.+): use "yes" or "no"\.$/,
    translate: (m) =>
      t('Connection {id} leaves the condition {step}: use "yes" or "no".', { id: m[1] ?? "", step: m[2] ?? "" }),
  },
  {
    pattern: /^Connection (.+) leaves (.+): use "next"\.$/,
    translate: (m) => t('Connection {id} leaves {step}: use "next".', { id: m[1] ?? "", step: m[2] ?? "" }),
  },
  {
    pattern: /^The trigger cannot have incoming connections \((.+)\)\.$/,
    translate: (m) => t("The trigger cannot have incoming connections ({id}).", { id: m[1] ?? "" }),
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
];

export function workflowProblemText(problem: string): string {
  for (const { pattern, translate } of PATTERNS) {
    const match = problem.match(pattern);
    if (match) return translate(match);
  }
  return tData(problem);
}
