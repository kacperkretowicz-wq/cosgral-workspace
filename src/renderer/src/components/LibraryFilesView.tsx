import type {
  LibraryCleanupResult,
  LibraryCounts,
  LibraryEntry,
  LibraryKind,
  LibraryOrigin,
  LibraryPage,
  LibrarySort,
} from "@openbot/contracts/ipc";
import { LIBRARY_KINDS, LIBRARY_SORTS } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { formatFileSize } from "./conversation/AttachmentCards";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Button, Input, NativeSelect } from "./ui";

type OriginFilter = "all" | LibraryOrigin;

const ORIGINS: ReadonlyArray<{ id: OriginFilter; label: string }> = [
  { id: "all", label: "All files" },
  { id: "upload", label: "Uploaded" },
  { id: "agent", label: "Made by agents" },
  { id: "chat", label: "From chats" },
];

const KIND_LABELS: Record<LibraryKind, string> = { image: "Images", document: "Documents", other: "Other" };
const SORT_LABELS: Record<LibrarySort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name",
  size: "Largest first",
};

function pickKind(value: string): LibraryKind | "" {
  return LIBRARY_KINDS.find((kind) => kind === value) ?? "";
}

function pickSort(value: string): LibrarySort {
  return LIBRARY_SORTS.find((sort) => sort === value) ?? "newest";
}

function countOf(counts: LibraryCounts | undefined, origin: OriginFilter): number {
  return counts ? counts[origin] : 0;
}

/**
 * The Library files view (window.openbot.libraryView): origin tabs with counts, filters, sorting, picking several
 * files to delete, and a clean-up of old files that first shows what it would remove.
 */
export function LibraryFilesView() {
  const view = untrack(() => window.openbot?.libraryView);
  const files = untrack(() => window.openbot?.library);
  const [page, setPage] = createSignal<LibraryPage | null>(null);
  const [origin, setOrigin] = createSignal<OriginFilter>("all");
  const [kind, setKind] = createSignal<LibraryKind | "">("");
  const [sort, setSort] = createSignal<LibrarySort>("newest");
  const [query, setQuery] = createSignal("");
  const [picked, setPicked] = createSignal<string[]>([]);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [cleanDays, setCleanDays] = createSignal(90);
  const [cleanOrigin, setCleanOrigin] = createSignal<"upload" | "agent">("upload");
  const [preview, setPreview] = createSignal<LibraryCleanupResult | null>(null);
  let serial = 0;

  async function refresh(patch: { origin?: OriginFilter; kind?: LibraryKind | ""; sort?: LibrarySort } = {}) {
    if (!view) return;
    const n = ++serial;
    try {
      const chosenKind = patch.kind ?? kind();
      const chosenOrigin = patch.origin ?? origin();
      const next = await view.page({
        query: query().trim(),
        sort: patch.sort ?? sort(),
        ...(chosenOrigin !== "all" ? { origin: chosenOrigin } : {}),
        ...(chosenKind ? { kind: chosenKind } : {}),
      });
      if (n !== serial) return;
      setPage(next);
      setPicked((ids) => ids.filter((id) => next.items.some((item) => item.id === id)));
      setError("");
    } catch (cause) {
      if (n === serial) setError(cause instanceof Error ? cause.message : t("Could not load the files."));
    }
  }

  onSettled(() => {
    void refresh();
    const listen = window.openbot?.agent?.onEvent;
    if (!listen) return;
    const off = listen((event) => {
      if (event.type === "library-changed") void refresh();
    });
    return () => {
      serial++;
      off();
    };
  });

  async function run(work: () => Promise<void>, failure: string) {
    if (busy()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setPicked((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));

  const deletePicked = () =>
    run(async () => {
      const result = await view?.deleteMany({ fileIds: picked() });
      setPicked([]);
      if (result) {
        const skipped = result.skipped.length;
        setNotice(
          t("Deleted {count} files, freed {size}.", {
            count: result.deleted.length,
            size: formatFileSize(result.freedBytes),
          }) + (skipped ? ` ${t("{count} kept (chat attachments or already gone).", { count: skipped })}` : ""),
        );
      }
      await refresh();
    }, t("Could not delete the files."));

  const previewClean = () =>
    run(async () => {
      setPreview((await view?.cleanup({ origin: cleanOrigin(), olderThanDays: cleanDays(), dryRun: true })) ?? null);
    }, t("Could not check the old files."));

  const confirmClean = () =>
    run(async () => {
      const result = await view?.cleanup({ origin: cleanOrigin(), olderThanDays: cleanDays() });
      setPreview(null);
      if (result)
        setNotice(
          t("Removed {count} old files, freed {size}.", { count: result.files, size: formatFileSize(result.bytes) }),
        );
      await refresh();
    }, t("Could not clean up."));

  const openFile = (entry: LibraryEntry, action: "open" | "download" | "reveal") =>
    run(async () => {
      await files?.open({ fileId: entry.id, action });
    }, t("Could not open the file."));

  return (
    <section class="library-view" aria-label={t("File library")}>
      <Show
        when={view}
        fallback={<p class="library-note">{t("The file library is not available in this version.")}</p>}
      >
        <nav class="library-origins" aria-label={t("Library sections")}>
          <For each={ORIGINS}>
            {(item) => (
              <Button
                type="button"
                variant="ghost"
                aria-current={origin() === item.id ? "page" : undefined}
                onClick={() => {
                  setOrigin(item.id);
                  void refresh({ origin: item.id });
                }}
              >
                {t(item.label)} <span class="library-count">{countOf(page()?.counts, item.id)}</span>
              </Button>
            )}
          </For>
        </nav>

        <form
          class="library-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void refresh();
          }}
        >
          <Input
            type="search"
            aria-label={t("Search files")}
            placeholder={t("Search files")}
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <NativeSelect
            aria-label={t("Type")}
            value={kind()}
            onChange={(event) => {
              const picked = pickKind(event.currentTarget.value);
              setKind(picked);
              void refresh({ kind: picked });
            }}
          >
            <option value="">{t("All types")}</option>
            <For each={LIBRARY_KINDS}>{(item) => <option value={item}>{t(KIND_LABELS[item])}</option>}</For>
          </NativeSelect>
          <NativeSelect
            aria-label={t("Sort")}
            value={sort()}
            onChange={(event) => {
              const picked = pickSort(event.currentTarget.value);
              setSort(picked);
              void refresh({ sort: picked });
            }}
          >
            <For each={LIBRARY_SORTS}>{(item) => <option value={item}>{t(SORT_LABELS[item])}</option>}</For>
          </NativeSelect>
          <Button type="submit">{t("Search")}</Button>
          <Show when={files}>
            <Button
              type="button"
              variant="primary"
              disabled={busy()}
              onClick={() =>
                void run(async () => {
                  await files?.choose();
                  await refresh();
                }, t("Could not add the files."))
              }
            >
              {t("Add files")}
            </Button>
          </Show>
        </form>

        <Show when={error()}>
          <p class="library-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void refresh()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={notice()}>
          <p class="library-note" role="status">
            {notice()}
          </p>
        </Show>

        <Show when={picked().length > 0}>
          <div class="library-selection" role="status">
            <span>{t("{count} selected", { count: picked().length })}</span>
            <Button type="button" variant="primary" disabled={busy()} onClick={() => void deletePicked()}>
              {t("Delete selected")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPicked([])}>
              {t("Clear selection")}
            </Button>
          </div>
        </Show>

        <Show
          when={page()}
          fallback={
            <Show when={!error()}>
              <CosgralLoadingSkeleton label={t("Loading files…")} />
            </Show>
          }
        >
          {(current) => (
            <>
              <p class="library-note">
                {t("{count} files", { count: current().total })} · {formatFileSize(current().bytes)}
              </p>
              <Show when={current().items.length === 0}>
                <p class="library-note cosgral-empty-enter">{t("No files found.")}</p>
              </Show>
              <ul class="library-list">
                <For each={current().items}>
                  {(entry) => (
                    <li class="library-row" data-picked={picked().includes(entry.id) ? "true" : "false"}>
                      <Button
                        type="button"
                        variant="ghost"
                        class="library-pick"
                        aria-pressed={picked().includes(entry.id) ? "true" : "false"}
                        aria-label={`${t("Select")} ${entry.name}`}
                        disabled={entry.origin === "chat"}
                        onClick={() => toggle(entry.id)}
                      >
                        <span class="library-pick-mark" aria-hidden="true" />
                      </Button>
                      <span class="library-name">
                        <strong>{entry.name}</strong>
                        <small>
                          {formatFileSize(entry.size)} · {entry.agentName ?? t("You")} ·{" "}
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </small>
                      </span>
                      <span class="library-actions">
                        <Button type="button" variant="ghost" onClick={() => void openFile(entry, "open")}>
                          {t("Open")}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => void openFile(entry, "reveal")}>
                          {t("Show in folder")}
                        </Button>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </>
          )}
        </Show>

        <section class="library-cleanup" aria-label={t("Clean up old files")}>
          <h3>{t("Clean up old files")}</h3>
          <div class="library-filters">
            <NativeSelect
              aria-label={t("Which files")}
              value={cleanOrigin()}
              onChange={(event) => {
                setCleanOrigin(event.currentTarget.value === "agent" ? "agent" : "upload");
                setPreview(null);
              }}
            >
              <option value="upload">{t("Uploaded")}</option>
              <option value="agent">{t("Made by agents")}</option>
            </NativeSelect>
            <label class="library-days">
              <span>{t("Older than (days)")}</span>
              <Input
                type="number"
                min={1}
                max={3650}
                value={String(cleanDays())}
                onInput={(event) => {
                  setCleanDays(Math.max(1, Math.min(3650, Number(event.currentTarget.value) || 1)));
                  setPreview(null);
                }}
              />
            </label>
            <Button type="button" disabled={busy()} onClick={() => void previewClean()}>
              {t("Check what would go")}
            </Button>
          </div>
          <Show when={preview()}>
            {(result) => (
              <p class="library-note" role="status">
                {t("{count} files, {size} would be removed.", {
                  count: result().files,
                  size: formatFileSize(result().bytes),
                })}{" "}
                <Show when={result().files > 0}>
                  <Button type="button" variant="primary" disabled={busy()} onClick={() => void confirmClean()}>
                    {t("Remove them")}
                  </Button>
                </Show>
              </p>
            )}
          </Show>
        </section>
      </Show>
    </section>
  );
}
