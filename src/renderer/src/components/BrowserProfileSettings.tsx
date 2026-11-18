import type { BrowserProfilesDesktopApi } from "@openbot/contracts/ipc";
import { parseDomainList } from "@openbot/contracts/ipc";
import { createSignal, onSettled, Show, untrack } from "solid-js";
import type { SettingsEvents } from "./AccessSettings";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Button, Field, Heading, Text, Textarea } from "./ui";
export function BrowserProfileSettings(props: {
  botId: string;
  api?: BrowserProfilesDesktopApi;
  onEvent?: SettingsEvents;
}) {
  const api = untrack(() => props.api ?? window.openbot?.browserProfiles);
  const [ready, setReady] = createSignal(false);
  const [allow, setAllow] = createSignal("");
  const [block, setBlock] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [confirm, setConfirm] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  onSettled(() => {
    let live = true;
    void api
      ?.describe({ botId: props.botId })
      .then((value) => {
        if (live) {
          setAllow(value.domains.allow.join("\n"));
          setBlock(value.domains.block.join("\n"));
          setReady(true);
        }
      })
      .catch(() => {
        if (live) setError("Could not load browser profile. Reopen settings to retry.");
      });
    const off = (props.onEvent ?? window.openbot?.agent?.onEvent)?.((event) => {
      if (event.type === "browser-profiles-changed")
        setNotice("Browser profile updated. Reopen settings to load saved domain rules; your current draft is kept.");
    });
    return () => {
      live = false;
      off?.();
    };
  });
  async function run(clear: boolean) {
    if (!api || busy()) return;
    setBusy(true);
    setError("");
    try {
      if (clear) {
        await api.clear({ botId: props.botId, confirm: true });
        setConfirm(false);
        setNotice("Browser data cleared for this agent. Domain rules are kept.");
      } else {
        const list = (text: string) =>
          text
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
        const result = await api.setDomains({
          botId: props.botId,
          allow: parseDomainList(list(allow()), "allow"),
          block: parseDomainList(list(block()), "block"),
        });
        const profile = result.profiles.find((p) => p.botId === props.botId);
        if (profile) {
          setAllow(profile.domains.allow.join("\n"));
          setBlock(profile.domains.block.join("\n"));
        }
        setNotice("Domain rules saved.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update browser profile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="providers-form" aria-label="Agent browser profile">
      <Heading as="h3" size="sm">
        Browser profile
      </Heading>
      <Text>
        This agent starts signed out in its own profile. Cookies, storage, cache and history are separate from other
        agents.
      </Text>
      <Show when={error()}>
        <Text role="alert" tone="danger">
          {error()}
        </Text>
      </Show>
      <Show when={notice()}>
        <Text role="status">{notice()}</Text>
      </Show>
      <Show
        when={ready()}
        fallback={
          <Show when={api} fallback={<Text>Browser profiles are unavailable on this connection.</Text>}>
            <CosgralLoadingSkeleton label="Loading browser profile…" />
          </Show>
        }
      >
        <form
          class="providers-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(false);
          }}
        >
          <Field
            label="Allowed domains"
            description="One domain per line. Empty allows any page except blocked domains. Includes subdomains."
          >
            <Textarea rows={3} value={allow()} disabled={busy()} onInput={(e) => setAllow(e.currentTarget.value)} />
          </Field>
          <Field
            label="Blocked domains"
            description="Blocks pages and resources, including subdomains. Block wins over allow."
          >
            <Textarea rows={3} value={block()} disabled={busy()} onInput={(e) => setBlock(e.currentTarget.value)} />
          </Field>
          <Button type="submit" disabled={busy()}>
            Save domain rules
          </Button>
        </form>
        <Show when={!confirm()}>
          <Button disabled={busy()} onClick={() => setConfirm(true)}>
            Clear browser data
          </Button>
        </Show>
        <Show when={confirm()}>
          <section aria-label="Confirm clearing browser data" class="providers-form">
            <Heading as="h4" size="sm">
              Clear this agent’s browser data?
            </Heading>
            <Text>
              This permanently removes this agent’s sign-ins, cookies, storage, cache and history. Domain rules and
              other profiles are kept.
            </Text>
            <Button disabled={busy()} onClick={() => void run(true)}>
              Confirm clear browser data
            </Button>
            <Button disabled={busy()} onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </section>
        </Show>
      </Show>
    </section>
  );
}
