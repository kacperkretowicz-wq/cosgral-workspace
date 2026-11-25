import {
  describeWorkflowCondition,
  WORKFLOW_CONDITION_OPERATOR_LABELS,
  type WorkflowConditionOperator,
  type WorkflowGraphDiff,
  type WorkflowNode,
} from "@openbot/contracts/ipc";
import { t } from "./i18n";

/** The operator of a condition step in the window language ("zawiera"); the contract's words are English. */
export function conditionOperatorLabel(operator: WorkflowConditionOperator): string {
  return t(WORKFLOW_CONDITION_OPERATOR_LABELS[operator]);
}

/** The line on a condition card (`{{previous}} zawiera "gotowe"`), with the operator in the window language. */
export function conditionText(node: Extract<WorkflowNode, { type: "condition" }>): string {
  return describeWorkflowCondition(node, conditionOperatorLabel);
}

/** What changed between two versions, in the window language ("Zmieniono: Agent."); the contract's sentence is English. */
export function workflowDiffText(diff: WorkflowGraphDiff): string {
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(t("Added: {titles}.", { titles: diff.added.join(", ") }));
  if (diff.removed.length > 0) parts.push(t("Removed: {titles}.", { titles: diff.removed.join(", ") }));
  if (diff.changed.length > 0) parts.push(t("Changed: {titles}.", { titles: diff.changed.join(", ") }));
  if (diff.connectionsChanged) parts.push(t("Connections changed."));
  return parts.length === 0 ? t("Only positions on the canvas changed.") : parts.join(" ");
}
