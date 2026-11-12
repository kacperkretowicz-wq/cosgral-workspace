import type { AgentEyesRequest, AgentEyesSession, StopAgentEyesInput } from "@openbot/contracts/ipc";
import { For, Show } from "solid-js";
import { Button } from "./ui";

/** COSGRAL agent eyes: the small "an agent is looking" UI (sidebar badge, bar above the conversation, card details). */

export function EyesIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" class="eyes-icon">
      <path d="M1.8 10S5 4.6 10 4.6 18.2 10 18.2 10 15 15.4 10 15.4 1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.4" />
    </svg>
  );
}

/** Small pulsing eye for an agent row: this agent is looking right now. */
export function EyesBadge() {
  return (
    <span class="eyes-badge" title="Looking">
      <EyesIcon />
      <span class="sr-only">Looking</span>
    </span>
  );
}

function framesLabel(session: AgentEyesSession): string {
  return `${session.framesCaptured} / ${session.framesPlanned} ${session.framesPlanned === 1 ? "frame" : "frames"}`;
}

export function eyesSessionSummary(session: AgentEyesSession): string {
  return `${session.phase === "watching" ? "Live" : "Capturing"} · ${framesLabel(session)}`;
}

function formatEndsAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export interface EyesBarProps {
  sessions: AgentEyesSession[];
  bots: Array<{ id: string; name: string }>;
  onStop: (input: StopAgentEyesInput) => void;
}

/**
 * Slim bar under the conversation header while at least one agent is looking at a window, screen or the camera.
 * Stop ends that agent's looking and revokes its approvals.
 */
export function EyesBar(props: EyesBarProps) {
  const botName = (botId: string) => props.bots.find((bot) => bot.id === botId)?.name ?? "An agent";
  return (
    <Show when={props.sessions.length > 0}>
      <div class="eyes-bar" role="status" aria-label="Agent eyes">
        <For each={props.sessions}>
          {(session) => (
            <div class="eyes-bar-row" data-source={session.source} data-phase={session.phase}>
              <span class="eyes-bar-icon">
                <EyesIcon />
                <span class="eyes-bar-pulse" aria-hidden="true" />
              </span>
              <span class="eyes-bar-copy">
                <strong>{botName(session.botId)}</strong>
                <span>{session.source === "camera" ? "is using" : "is looking at"}</span>
                <strong class="eyes-bar-target" title={session.targetLabel}>
                  {session.targetLabel}
                </strong>
              </span>
              <span class="eyes-bar-meta">
                {eyesSessionSummary(session)}
                <Show when={session.endsAt}>{(endsAt) => <> · until {formatEndsAt(endsAt())}</>}</Show>
              </span>
              <Button
                type="button"
                class="eyes-bar-stop"
                size="sm"
                variant="danger"
                aria-label={`Stop ${botName(session.botId)} looking`}
                onClick={() => props.onStop({ botId: session.botId })}
              >
                Stop
              </Button>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

/** Card body for an eyes approval ("screen" or "camera"): what the agent wants to look at and how. */
export function EyesRequestDetails(props: { eyes: AgentEyesRequest }) {
  const mode = () =>
    props.eyes.live
      ? `Live preview · ${props.eyes.frames} ${props.eyes.frames === 1 ? "frame" : "frames"}${
          props.eyes.intervalSeconds === null ? "" : ` every ${props.eyes.intervalSeconds}s`
        }`
      : "Single capture";
  return (
    <section class="approval-eyes" aria-label="Requested view">
      <div class="approval-detail-row">
        <span class="approval-detail-label">{props.eyes.source === "camera" ? "Camera" : "Looks at"}</span>
        <strong>{props.eyes.targetLabel}</strong>
      </div>
      <div class="approval-detail-row">
        <span class="approval-detail-label">Mode</span>
        <strong>{mode()}</strong>
      </div>
    </section>
  );
}
