import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import type { JoinServerInput } from "@openbot/contracts/ipc";
import { createSignal, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Button, Dialog, Input, Textarea } from "./ui";

interface JoinServerDialogProps {
  inviteUrl: string;
  accountEmail: string;
  /** Without an account service the person joins with a name and a password chosen for the server. */
  localProfile?: boolean;
  onClose: () => void;
  onJoin: (input: JoinServerInput) => Promise<void>;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/u;
const PASSWORD_MIN_LENGTH = 12;

export function JoinServerDialog(props: JoinServerDialogProps) {
  const [inviteUrl, setInviteUrl] = createSignal(untrack(() => props.inviteUrl));
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  // A link that only brings the new address of a server the person already joined: no name and password are needed.
  const addressUpdate = () => inviteUrl().trim().startsWith("cosgral://update?");
  const credentialsValid = () =>
    addressUpdate() ||
    !props.localProfile ||
    (USERNAME_PATTERN.test(username().trim()) && password().length >= PASSWORD_MIN_LENGTH);

  async function join() {
    if (busy() || !credentialsValid()) return;
    setBusy(true);
    setError(null);
    try {
      await props.onJoin(
        props.localProfile && !addressUpdate()
          ? { inviteUrl: inviteUrl().trim(), username: username().trim(), password: password() }
          : { inviteUrl: inviteUrl().trim() },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not join the server."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy() && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay class="remote-dialog-backdrop">
          <Dialog.Content as="section" class="remote-dialog">
            <header>
              <div>
                <span class="remote-dialog-eyebrow">{t("Remote server")}</span>
                <Dialog.Title as="h2" id="join-title">
                  {t("Join a COSGRAL team")}
                </Dialog.Title>
              </div>
              <Button type="button" aria-label={t("Close")} disabled={busy()} onClick={props.onClose}>
                ×
              </Button>
            </header>
            <Dialog.Description>
              {props.localProfile
                ? t(
                    "Paste the one-time invitation link and choose the name and password you will use on this server. If the link has a Tailscale address, Tailscale must be on and signed in to the same network as the host.",
                  )
                : t("Paste the one-time invitation link. You will join with your signed-in COSGRAL account.")}
            </Dialog.Description>
            <label class="remote-field">
              <span>{t("Invitation link")}</span>
              <Textarea
                value={inviteUrl()}
                onInput={(event) => setInviteUrl(event.currentTarget.value)}
                rows="3"
                maxlength={INPUT_LIMITS.inviteUrl}
                spellcheck={false}
              />
            </label>
            <Show when={addressUpdate()}>
              <p class="remote-inline-note">
                {t(
                  "This link only brings the new address of a server you already joined. No name or password is needed.",
                )}
              </p>
            </Show>
            <Show
              when={props.localProfile && !addressUpdate()}
              fallback={
                <Show when={!addressUpdate()}>
                  <div class="remote-account-chip">
                    <span aria-hidden="true">@</span>
                    <div>
                      <small>{t("Joining as")}</small>
                      <strong>{props.accountEmail}</strong>
                    </div>
                  </div>
                </Show>
              }
            >
              <label class="remote-field">
                <span>{t("Your name on this server")}</span>
                <Input
                  value={username()}
                  autocomplete="username"
                  maxlength={32}
                  onInput={(event) => setUsername(event.currentTarget.value)}
                />
                <small>{t("3 to 32 letters, numbers, dots, dashes or underscores. Others will see this name.")}</small>
              </label>
              <label class="remote-field">
                <span>{t("Your password on this server")}</span>
                <Input
                  type="password"
                  value={password()}
                  autocomplete="new-password"
                  maxlength={256}
                  onInput={(event) => setPassword(event.currentTarget.value)}
                />
                <small>{t("At least 12 characters. It is saved only on this computer, encrypted.")}</small>
              </label>
            </Show>
            <Show when={error()}>{(message) => <p class="remote-dialog-error">{message()}</p>}</Show>
            <footer>
              <Button
                type="button"
                class="remote-secondary-button"
                disabled={busy() || !inviteUrl().trim()}
                onClick={props.onClose}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="button"
                class="remote-primary-button"
                disabled={busy() || !credentialsValid()}
                onClick={() => void join()}
              >
                {busy()
                  ? addressUpdate()
                    ? t("Updating…")
                    : t("Joining…")
                  : addressUpdate()
                    ? t("Update the address")
                    : t("Join server")}
              </Button>
            </footer>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
