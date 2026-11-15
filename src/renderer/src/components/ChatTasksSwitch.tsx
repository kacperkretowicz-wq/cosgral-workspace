import { Show } from "solid-js";
import type { ChannelViewMode } from "../channel-tasks";
import { ViewTabList } from "./ui";
export function ChatTasksSwitch(props: {
  mode: ChannelViewMode;
  idPrefix: string;
  onChange: (mode: ChannelViewMode) => void;
  channelLabel?: string;
}) {
  return (
    <ViewTabList
      idPrefix={props.idPrefix}
      value={props.mode}
      onChange={(value) => props.onChange(value === "tasks" ? "tasks" : "chat")}
      tabs={[
        { value: "chat", label: "Chat" },
        { value: "tasks", label: "Tasks" },
      ]}
      label="Channel view"
      class="chat-tasks-switch"
      tabClass={(value) => ["chat-tasks-switch-tab", { "chat-tasks-switch-tab-active": props.mode === value }]}
    >
      <Show when={props.channelLabel}>{(label) => <span class="chat-tasks-switch-context">{label()}</span>}</Show>
    </ViewTabList>
  );
}
