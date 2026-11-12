import { For, Show } from "solid-js";
import { channelTaskStateLabel, type ChannelTask } from "../channel-tasks";
import { Badge, Button } from "./ui";

interface ChannelTasksPanelProps {
  tasks: ChannelTask[];
  onStop?: (taskId: string) => void;
  onResume?: (taskId: string) => void;
}

export function ChannelTasksPanel(props: ChannelTasksPanelProps) {
  return (
    <section class="channel-tasks-panel" aria-label="Zadania kanału">
      <Show
        when={props.tasks.length > 0}
        fallback={<p class="channel-tasks-empty">Brak zadań w tym kanale.</p>}
      >
        <ul class="channel-tasks-list">
          <For each={props.tasks}>
            {(task) => (
              <li class="channel-task-row" data-state={task.state}>
                <div class="channel-task-copy">
                  <strong>{task.title}</strong>
                  <span>
                    {task.ownerBotName} · {channelTaskStateLabel(task.state)}
                  </span>
                </div>
                <Badge size="sm" tone={task.state === "waiting" ? "warning" : "neutral"}>
                  {channelTaskStateLabel(task.state)}
                </Badge>
                <div class="channel-task-actions">
                  <Show when={task.state === "running" || task.state === "waiting"}>
                    <Button type="button" size="sm" onClick={() => props.onStop?.(task.id)}>
                      Stop
                    </Button>
                  </Show>
                  <Show when={task.state === "cancelled" || task.state === "failed"}>
                    <Button type="button" size="sm" onClick={() => props.onResume?.(task.id)}>
                      Wznów
                    </Button>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
