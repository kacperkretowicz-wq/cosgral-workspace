import type { TeamPresenceMember } from "@openbot/contracts/ipc";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { buildAnimatedAvatarSvg } from "../blobatar";

export function TeamPersonAvatar(props: { member: TeamPresenceMember; large?: boolean }) {
  const avatarUrl = () => props.member.avatarUrl ?? null;
  const [imageFailed, setImageFailed] = createSignal(false);
  // The same finish as agents' creatures (gloss, rim light, stronger colour), so people and agents sit together.
  const generatedAvatar = createMemo(() =>
    buildAnimatedAvatarSvg(props.member.email ?? props.member.username ?? props.member.id, null),
  );
  createEffect(
    () => avatarUrl(),
    () => {
      setImageFailed(false);
    },
  );
  return (
    <span class={["person-avatar", { large: Boolean(props.large), online: props.member.online }]} aria-hidden="true">
      <Show
        when={avatarUrl() && !imageFailed()}
        fallback={<span class="person-avatar-generated" innerHTML={generatedAvatar()} />}
      >
        <img src={avatarUrl() ?? ""} alt="" draggable={false} onError={() => setImageFailed(true)} />
      </Show>
      <i />
    </span>
  );
}

export function teamMemberName(member: TeamPresenceMember): string {
  return member.name?.trim() || member.email || member.username;
}
