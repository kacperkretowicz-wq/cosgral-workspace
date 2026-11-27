import type { AgentEvent } from "@openbot/contracts/ipc";
import { accessRaiseCard } from "@openbot/contracts/ipc";
import { createSignal, onSettled, Show } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AccessSettings } from "../src/components/AccessSettings";
import { ActionCard } from "../src/components/ActionCard";
import { BudgetSettings } from "../src/components/BudgetSettings";
import { Heading, Text } from "../src/components/ui";
import { createMockAccess } from "./mock-access";
import { createMockBudgets } from "./mock-budgets";
import { ThemeFrame } from "./theme-frame";

type SceneName =
  | "working-folder"
  | "ask-first"
  | "full"
  | "raise"
  | "denied"
  | "ok"
  | "warning"
  | "exhausted"
  | "cost-unavailable";
function AccessScene(props: { scene: SceneName }) {
  let listener: ((event: AgentEvent) => void) | undefined;
  const api = createMockAccess((event) => listener?.(event));
  const [ready, setReady] = createSignal(false);
  onSettled(() => {
    void (async () => {
      if (props.scene === "full" || props.scene === "ask-first") {
        await api.setLevel({ botId: "demo", level: props.scene });
        const pending = api.pendingRaises()[0];
        if (pending) api.allowRaise(pending.requestId);
      }
      setReady(true);
    })();
  });
  return (
    <Show when={ready()}>
      <AccessSettings
        botId="demo"
        api={api}
        onEvent={(handler) => {
          listener = handler;
          if (props.scene === "denied")
            queueMicrotask(() =>
              api.deny({
                botId: "demo",
                threadId: null,
                kind: "file-change",
                reason: "excluded",
                path: null,
                message: "This folder is excluded at every access level.",
              }),
            );
          return () => {
            listener = undefined;
          };
        }}
      />
    </Show>
  );
}
function RaiseScene() {
  const [decision, setDecision] = createSignal("");
  const card = accessRaiseCard({ agentName: "Demo agent", from: "working-folder", to: "full" });
  return (
    <section>
      <Heading as="h3" size="sm">
        Needs you
      </Heading>
      <Show when={!decision()} fallback={<Text role="status">{decision()}</Text>}>
        <ActionCard
          card={{
            kind: "draft-preview",
            requestId: "raise-demo",
            botId: "demo",
            createdAt: "2026-11-16T12:00:00Z",
            card: {
              ...card,
              requestId: "raise-demo",
              botId: "demo",
              threadId: "demo-thread",
              turnId: "demo-turn",
              variant: "confirm",
              recipient: null,
              channel: null,
              draftId: null,
              createdAt: "2026-11-16T12:00:00Z",
            },
          }}
          onDraft={async (input) => {
            setDecision(input.decision === "send" ? "Access increase approved." : "Access unchanged.");
          }}
          onTakeover={async () => {}}
        />
      </Show>
    </section>
  );
}
function BudgetScene(props: { scene: SceneName }) {
  let listener: ((event: AgentEvent) => void) | undefined;
  const api = createMockBudgets((event) => listener?.(event));
  const [ready, setReady] = createSignal(false);
  onSettled(() => {
    void (async () => {
      await api.set({
        scope: { kind: "space" },
        period: "month",
        tokenLimit: props.scene === "cost-unavailable" ? null : 100,
        costLimitUsd: props.scene === "cost-unavailable" ? 10 : null,
        hardStop: true,
        warnPercent: 80,
      });
      api.simulate.record(
        "demo",
        props.scene === "exhausted" ? 100 : props.scene === "warning" ? 85 : 10,
        props.scene === "cost-unavailable" ? null : 0.25,
      );
      setReady(true);
    })();
  });
  return (
    <Show when={ready()}>
      <BudgetSettings
        api={api}
        onEvent={(handler) => {
          listener = handler;
          return () => {
            listener = undefined;
          };
        }}
        onDownload={() => {}}
      />
    </Show>
  );
}
function Scene(props: { scene: SceneName; theme: "dark" }) {
  return (
    <ThemeFrame theme={props.theme}>
      <main class="providers-page">
        <Heading as="h2" size="md">
          Access and budgets
        </Heading>
        {["working-folder", "ask-first", "full", "denied"].includes(props.scene) ? (
          <AccessScene scene={props.scene} />
        ) : props.scene === "raise" ? (
          <RaiseScene />
        ) : (
          <BudgetScene scene={props.scene} />
        )}
      </main>
    </ThemeFrame>
  );
}
const meta = {
  title: "Settings/Access and budgets",
  component: Scene,
  args: { scene: "working-folder", theme: "dark" },
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WorkingFolder: Story = {};
export const AskFirst: Story = { args: { scene: "ask-first" } };
export const Full: Story = { args: { scene: "full" } };
export const RaiseApproval: Story = { args: { scene: "raise" } };
export const AccessDenied: Story = { args: { scene: "denied" } };
export const BudgetOk: Story = { args: { scene: "ok" } };
export const BudgetWarning: Story = { args: { scene: "warning" } };
export const BudgetExhausted: Story = { args: { scene: "exhausted" } };
export const CostUnavailable: Story = { args: { scene: "cost-unavailable" } };
