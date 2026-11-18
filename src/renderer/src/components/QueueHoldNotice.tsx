import type { QueueSnapshot } from "@openbot/contracts/ipc";
import { Show } from "solid-js";
import { Button, Text } from "./ui";

/**
 * COSGRAL W12 (BE-N): the line above the message box that says why the queue waits (`QueueSnapshot.heldReason` + `heldKind`).
 * The button to the budget settings belongs only to a budget hold; a restart, a full server or a full thread list has nothing
 * the person can change here, so those show the sentence alone. A snapshot from an older server has no `heldKind`: it was a budget.
 */
export function QueueHoldNotice(props: { queue: QueueSnapshot | undefined; onOpenBudget?: () => void }) {
  const kind = () => props.queue?.heldKind ?? "budget";
  return (
    <Show when={props.queue?.heldReason}>
      <div class="providers-form" role="status" data-hold-kind={kind()}>
        <Text>Message queued: {props.queue?.heldReason}</Text>
        <Show when={kind() === "budget"}>
          <Button onClick={() => props.onOpenBudget?.()}>Review budget settings</Button>
        </Show>
      </div>
    </Show>
  );
}
