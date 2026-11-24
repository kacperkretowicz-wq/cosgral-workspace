import type { MachineFileEntry, MachineFileRefusal, MachineFolderGrant, MachineListing } from "@openbot/contracts/ipc";
import { MACHINE_FILES_COPY_LIMIT, MACHINE_FILES_LIMITS } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { appLocale, t, tn } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { CosgralPanelState } from "./CosgralPanelState";
import { formatFileSize } from "./conversation/AttachmentCards";
import { Button, NativeSelect } from "./ui";
import { ArrowUp, ChevronRight, Copy, File, Folder, Plus, X } from "./ui/icons";

/** A refusal as a sentence for the person. */
const REFUSAL_TEXT: Record<MachineFileRefusal, string> = {
  "not-granted": "This folder is no longer shared. Add it again.",
  "bot-not-allowed": "This folder is not shared with this agent.",
  "outside-folder": "That path is outside the shared folder.",
  "blocked-name": "This file looks like a secret (a key or a password store), so it stays hidden.",
  "not-found": "The file or folder is gone.",
  "not-a-folder": "That is a file, not a folder.",
  "not-a-file": "That is a folder, not a file.",
  "too-large": "The file is larger than the library allows.",
};

function parentOf(relativePath: string): string {
  const parts = relativePath.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

/**
 * Library › Files › This computer (window.openbot.machineFiles): folders the person shares with the program for this
 * run. Browse inside them, open a file in its app or show it in its folder, and copy picked files into the library.
 * Files that look like secrets are never listed; nothing on disk is changed.
 */
export function MachineFilesView(props: { onCopied?: () => void }) {
  const api = untrack(() => window.openbot?.machineFiles);
  const [grants, setGrants] = createSignal<MachineFolderGrant[] | null>(null);
  const [grantId, setGrantId] = createSignal<string | null>(null);
  const [path, setPath] = createSignal("");
  const [listing, setListing] = createSignal<MachineListing | null>(null);
  const [picked, setPicked] = createSignal<string[]>([]);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const current = () => grants()?.find((grant) => grant.id === grantId()) ?? null;

  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? t(cause.message) : failure);
    } finally {
      setBusy(false);
    }
  };

  const load = async (id: string | null, relativePath: string) => {
    setPicked([]);
    setListing(null);
    if (!api || !id) return;
    setListing(await api.list({ grantId: id, relativePath }));
  };

  const go = (relativePath: string) =>
    run(async () => {
      setPath(relativePath);
      await load(grantId(), relativePath);
    }, t("Could not open the folder."));

  const loadGrants = async (prefer?: string) => {
    const list = (await api?.grants()) ?? [];
    setGrants(list);
    const keep = list.find((grant) => grant.id === (prefer ?? grantId()))?.id ?? list[0]?.id ?? null;
    if (keep !== grantId() || prefer) {
      setGrantId(keep);
      setPath("");
    }
    await load(keep, keep === grantId() ? path() : "");
  };

  onSettled(() => {
    void run(() => loadGrants(), t("Could not load the shared folders."));
  });

  const addFolder = () =>
    run(async () => {
      const grant = await api?.grant();
      if (grant) await loadGrants(grant.id);
    }, t("Could not share the folder."));

  const stopSharing = () =>
    run(async () => {
      const id = grantId();
      if (!id) return;
      await api?.revoke({ grantId: id });
      setGrantId(null);
      await loadGrants();
    }, t("Could not stop sharing the folder."));

  const openEntry = (entry: MachineFileEntry, action: "open" | "reveal") =>
    run(async () => {
      const id = grantId();
      if (id) await api?.open({ grantId: id, relativePath: entry.relativePath, action });
    }, t("Could not open the file."));

  const toggle = (relativePath: string) =>
    setPicked((list) =>
      list.includes(relativePath)
        ? list.filter((item) => item !== relativePath)
        : list.length >= MACHINE_FILES_COPY_LIMIT
          ? list
          : [...list, relativePath],
    );

  const copyPicked = () =>
    run(async () => {
      const id = grantId();
      if (!id || !api) return;
      const result = await api.copyToLibrary({ grantId: id, relativePaths: picked() });
      setPicked([]);
      const added = tn(result.added, "{count} file copied to the library.", "{count} files copied to the library.");
      const refused = result.refused[0];
      setNotice(refused ? `${added} ${t(REFUSAL_TEXT[refused.reason])}` : added);
      if (result.added > 0) props.onCopied?.();
    }, t("Could not copy the files."));

  const crumbs = () => {
    const parts = path().split("/").filter(Boolean);
    return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join("/") }));
  };

  const okListing = () => {
    const result = listing();
    return result?.status === "ok" ? result : null;
  };
  const refusal = () => {
    const result = listing();
    return result?.status === "refused" ? result.reason : null;
  };

  const EntryRow = (row: { entry: MachineFileEntry }) => {
    const entry = row.entry;
    const isPicked = () => picked().includes(entry.relativePath);
    return (
      <li class="library-row" data-picked={isPicked() ? "true" : "false"}>
        <Button
          type="button"
          variant="ghost"
          class="library-pick"
          aria-pressed={isPicked() ? "true" : "false"}
          aria-label={`${t("Select")} ${entry.name}`}
          disabled={entry.kind === "folder"}
          onClick={() => toggle(entry.relativePath)}
        >
          <span class="library-pick-mark" aria-hidden="true" />
        </Button>
        <span class="library-type" data-type={entry.kind} aria-hidden="true">
          <Show when={entry.kind === "folder"} fallback={<File size={18} stroke-width={1.5} />}>
            <Folder size={18} stroke-width={1.5} />
          </Show>
        </span>
        <span class="library-name">
          <strong>{entry.name}</strong>
          <small>
            {entry.kind === "folder" ? t("Folder") : formatFileSize(entry.size)} ·{" "}
            {new Date(entry.modifiedAt).toLocaleDateString(appLocale())}
          </small>
        </span>
        <span class="library-actions">
          <Show
            when={entry.kind === "folder"}
            fallback={
              <>
                <Button type="button" variant="ghost" onClick={() => void openEntry(entry, "open")}>
                  {t("Open")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => void openEntry(entry, "reveal")}>
                  {t("Show in folder")}
                </Button>
              </>
            }
          >
            <Button
              type="button"
              variant="ghost"
              aria-label={`${t("Open folder")} ${entry.name}`}
              onClick={() => void go(entry.relativePath)}
            >
              {t("Open")}
            </Button>
          </Show>
        </span>
      </li>
    );
  };

  return (
    <section class="library-machine" aria-label={t("Files on this computer")}>
      <Show
        when={api}
        fallback={<CosgralPanelState kind="unavailable" title={t("Files on this computer are not available here.")} />}
      >
        <div class="library-filters">
          <Show when={(grants()?.length ?? 0) > 0}>
            <NativeSelect
              aria-label={t("Shared folder")}
              value={grantId() ?? ""}
              onChange={(event) => {
                const id = event.currentTarget.value;
                void run(async () => {
                  setGrantId(id);
                  setPath("");
                  await load(id, "");
                }, t("Could not open the folder."));
              }}
            >
              <For each={grants() ?? []}>{(grant) => <option value={grant.id}>{grant.label}</option>}</For>
            </NativeSelect>
          </Show>
          <Button type="button" variant="primary" disabled={busy()} onClick={() => void addFolder()}>
            <Plus size={15} stroke-width={1.75} aria-hidden="true" />
            {t("Share a folder")}
          </Button>
          <Show when={current()}>
            <Button type="button" variant="ghost" disabled={busy()} onClick={() => void stopSharing()}>
              <X size={15} stroke-width={1.75} aria-hidden="true" />
              {t("Stop sharing")}
            </Button>
          </Show>
        </div>

        <Show when={error()}>
          {(message) => (
            <CosgralPanelState
              kind="error"
              title={message()}
              actionLabel={t("Retry")}
              onAction={() => void run(() => loadGrants(), t("Could not load the shared folders."))}
            />
          )}
        </Show>
        <Show when={notice()}>
          <p class="library-note" role="status">
            {notice()}
          </p>
        </Show>

        <Show
          when={grants()}
          fallback={
            <Show when={!error()}>
              <CosgralLoadingSkeleton label={t("Loading folders…")} />
            </Show>
          }
        >
          {(list) => (
            <Show
              when={current()}
              fallback={
                <Show when={list().length === 0}>
                  <CosgralPanelState
                    kind="empty"
                    title={t("No shared folders.")}
                    detail={t(
                      "Share a folder to browse it here and copy files to the library. The program remembers it until you close it; files with keys or passwords stay hidden.",
                    )}
                  />
                </Show>
              }
            >
              {(grant) => (
                <>
                  <nav class="library-crumbs" aria-label={t("Folder path")}>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-current={path() === "" ? "page" : undefined}
                      onClick={() => void go("")}
                    >
                      <Folder size={15} stroke-width={1.5} aria-hidden="true" />
                      {grant().label}
                    </Button>
                    <For each={crumbs()}>
                      {(crumb) => (
                        <>
                          <ChevronRight size={14} stroke-width={1.5} aria-hidden="true" />
                          <Button
                            type="button"
                            variant="ghost"
                            aria-current={path() === crumb.path ? "page" : undefined}
                            onClick={() => void go(crumb.path)}
                          >
                            {crumb.name}
                          </Button>
                        </>
                      )}
                    </For>
                  </nav>
                  <p class="library-note" title={grant().root}>
                    {grant().root}
                  </p>

                  <Show when={picked().length > 0}>
                    <div class="library-selection" role="status">
                      <span>{t("{count} selected", { count: picked().length })}</span>
                      <Button type="button" variant="primary" disabled={busy()} onClick={() => void copyPicked()}>
                        <Copy size={15} stroke-width={1.75} aria-hidden="true" />
                        {t("Copy to library")}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setPicked([])}>
                        {t("Clear selection")}
                      </Button>
                    </div>
                  </Show>

                  <Show when={listing()} fallback={<CosgralLoadingSkeleton label={t("Loading files…")} />}>
                    <Show when={refusal()}>
                      {(reason) => <CosgralPanelState kind="error" title={t(REFUSAL_TEXT[reason()])} />}
                    </Show>
                    <Show when={okListing()}>
                      {(ok) => (
                        <>
                          <Show when={path() !== ""}>
                            <Button type="button" variant="ghost" onClick={() => void go(parentOf(path()))}>
                              <ArrowUp size={15} stroke-width={1.5} aria-hidden="true" />
                              {t("Up one folder")}
                            </Button>
                          </Show>
                          <Show when={ok().entries.length === 0}>
                            <CosgralPanelState kind="empty" title={t("This folder is empty.")} />
                          </Show>
                          <ul class="library-list">
                            <For each={ok().entries}>{(entry) => <EntryRow entry={entry} />}</For>
                          </ul>
                          <Show when={ok().truncated}>
                            <p class="library-note">
                              {t("Only the first {count} items are shown.", {
                                count: MACHINE_FILES_LIMITS.entriesPerListing,
                              })}
                            </p>
                          </Show>
                        </>
                      )}
                    </Show>
                  </Show>
                </>
              )}
            </Show>
          )}
        </Show>
      </Show>
    </section>
  );
}
