import { Show } from "solid-js";
import type { ChannelViewMode } from "../channel-tasks";
import { Button } from "./ui";

interface ChatTasksSwitchProps {
  mode: ChannelViewMode;
  onChange: (mode: ChannelViewMode) => void;
  channelLabel?: string;
}

export function ChatTasksSwitch(props: ChatTasksSwitchProps) {
  return (
    <div class="chat-tasks-switch" role="tablist" aria-label="Channel view">
      <Button
        type="button"
        role="tab"
        aria-selected={props.mode === "chat" ? "true" : "false"}
        class={["chat-tasks-switch-tab", { "chat-tasks-switch-tab-active": props.mode === "chat" }]}
        onClick={() => props.onChange("chat")}
      >
        Chat
      </Button>
      <Button
        type="button"
        role="tab"
        aria-selected={props.mode === "tasks" ? "true" : "false"}
        class={["chat-tasks-switch-tab", { "chat-tasks-switch-tab-active": props.mode === "tasks" }]}
        onClick={() => props.onChange("tasks")}
      >
        Tasks
      </Button>
      <Show when={props.channelLabel}>
        {(label) => <span class="chat-tasks-switch-context">{label()}</span>}
      </Show>
    </div>
  );
}
