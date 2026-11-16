import type { AcpLoginState, AcpPresetInfo } from "@openbot/contracts/ipc";
import { isSafeAcpLoginUrl } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";
import { Badge, Button, Card, Field, Heading, Input, Text } from "./ui";

export function AcpLoginCard(props: {
  state: AcpLoginState;
  name: string;
  onStart: () => Promise<unknown>;
  onCancel: () => Promise<unknown>;
  onCode: (code: string) => Promise<unknown>;
}) {
  let input: HTMLInputElement | undefined;
  createEffect(
    () => `${props.state.phase}:${props.state.url ?? ""}`,
    () => {
      if (input) input.value = "";
    },
  );
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const running = () => ["starting", "code-required"].includes(props.state.phase);
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch {
      setError("Sign-in could not continue. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="providers-form" aria-label={`${props.name} sign-in`}>
      <Text as="p" role="status">
        {props.state.signedIn
          ? "Signed in"
          : props.state.phase === "cancelled"
            ? "Sign-in cancelled"
            : props.state.phase === "starting"
              ? "Waiting for sign-in…"
              : "Authentication required. Sign in to use this agent."}
      </Text>
      <Show when={props.state.message}>
        <Text
          as="p"
          role={props.state.phase === "error" || props.state.message?.includes("invalid_grant") ? "alert" : "status"}
          tone={props.state.phase === "error" ? "danger" : "secondary"}
        >
          {props.state.message?.includes("invalid_grant")
            ? "Code rejected, a new link was issued"
            : props.state.message}
        </Text>
      </Show>
      <Show when={error()}>
        <Text role="alert" tone="danger">
          {error()}
        </Text>
      </Show>
      <Show when={props.state.phase === "code-required"}>
        <Button
          disabled={!isSafeAcpLoginUrl(props.state.url)}
          onClick={() => {
            const url = props.state.url;
            if (isSafeAcpLoginUrl(url)) void act(() => window.openbot.openUrl(url));
          }}
        >
          Open sign-in page
        </Button>
        <form
          class="providers-form"
          onSubmit={(event) => {
            event.preventDefault();
            const code = input?.value ?? "";
            if (input) input.value = "";
            void act(() => props.onCode(code));
          }}
        >
          <Field label="Authorization code" description="Paste the code from the sign-in page. It is not saved.">
            <Input ref={input} type="password" autocomplete="off" spellcheck={false} required maxlength={512} />
          </Field>
          <Button type="submit" disabled={busy()}>
            Submit code
          </Button>
        </form>
      </Show>
      <Show
        when={running()}
        fallback={
          <Show when={!props.state.signedIn}>
            <Button disabled={busy()} onClick={() => void act(props.onStart)}>
              Log in
            </Button>
          </Show>
        }
      >
        <Button
          disabled={busy()}
          onClick={() => {
            if (input) input.value = "";
            void act(props.onCancel);
          }}
        >
          Cancel
        </Button>
      </Show>
    </section>
  );
}

export function AcpPresetCard(props: { preset: AcpPresetInfo; onAdded: () => void }) {
  const [command, setCommand] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  return (
    <div class="providers-form">
      <Text as="strong">{props.preset.name}</Text>
      <Show when={!props.preset.detectedCommand}>
        <Text as="p">Command not found. Install it from the official page or provide its command.</Text>
      </Show>
      <Button onClick={() => void window.openbot.openUrl(props.preset.installUrl)}>
        Official installation instructions
      </Button>
      <Field label={`${props.preset.name} command`}>
        <Input
          value={command()}
          maxlength={520}
          placeholder={props.preset.detectedCommand ?? props.preset.command}
          onInput={(e) => setCommand(e.currentTarget.value)}
        />
      </Field>
      <Show when={error()}>
        <Text role="alert" tone="danger">
          {error()}
        </Text>
      </Show>
      <Show
        when={props.preset.added}
        fallback={
          <Button
            disabled={busy() || !(command().trim() || props.preset.detectedCommand)}
            onClick={async () => {
              setBusy(true);
              try {
                await window.openbot.acpPresets?.add({
                  presetId: props.preset.id,
                  command: command().trim() || undefined,
                });
                props.onAdded();
              } catch {
                setError("Could not add this command. Check its path and try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Add {props.preset.name}
          </Button>
        }
      >
        <Badge>Added</Badge>
      </Show>
    </div>
  );
}
export function AcpPresets() {
  const [presets, setPresets] = createSignal<AcpPresetInfo[]>([]);
  const refresh = () => {
    void window.openbot.acpPresets
      ?.list()
      .then(setPresets)
      .catch(() => undefined);
  };
  onSettled(() => {
    if (!window.openbot?.acpPresets) return;
    refresh();
    return window.openbot.agent.onEvent((event) => {
      if (event.type === "acp-agents-changed") refresh();
    });
  });
  return (
    <Show when={presets().length}>
      <Card class="providers-section">
        <Heading as="h2" size="md">
          Quick add ACP agents
        </Heading>
        <For each={presets()}>{(preset) => <AcpPresetCard preset={preset} onAdded={refresh} />}</For>
      </Card>
    </Show>
  );
}
export function AcpAgentLogin(props: { id: string; name: string }) {
  const [state, setState] = createSignal<AcpLoginState>();
  onSettled(() => {
    if (!window.openbot?.acpLogin) return;
    void window.openbot.acpLogin
      ?.list()
      .then((list) => setState(list.find((s) => s.agentId === props.id)))
      .catch(() => undefined);
    return window.openbot.agent.onEvent((event) => {
      if (event.type === "acp-login-changed" && event.state.agentId === props.id) setState(event.state);
    });
  });
  return (
    <Show when={state()}>
      {(s) => (
        <AcpLoginCard
          state={s()}
          name={props.name}
          onStart={async () => {
            const next = await window.openbot.acpLogin?.start({ agentId: props.id });
            if (next) setState(next);
          }}
          onCancel={async () => {
            const next = await window.openbot.acpLogin?.cancel({ agentId: props.id });
            if (next) setState(next);
          }}
          onCode={async (code) => {
            const next = await window.openbot.acpLogin?.submitCode({ agentId: props.id, code });
            if (next) setState(next);
          }}
        />
      )}
    </Show>
  );
}
