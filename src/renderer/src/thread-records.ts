import type { AgentEvent } from "@openbot/contracts/ipc";
import { createEffect, createSignal, onSettled } from "solid-js";

/** Thread-scoped saved records plus live updates; a late list never replaces a newer event. */
export function createThreadRecords<T extends { botId: string; threadId: string }>(options: {
  enabled: boolean;
  params: () => { botId: string; threadId?: string | null };
  list: (params: { botId: string; threadId?: string | null }) => Promise<T[]>;
  key: (record: T) => string;
  fromEvent: (event: AgentEvent) => T | undefined;
}) {
  const [records, setRecords] = createSignal<T[]>([]);
  const [error, setError] = createSignal("");
  let generation = 0;
  const changed = new Set<string>();
  const matches = (record: T) => {
    const params = options.params();
    return record.botId === params.botId && (!params.threadId || record.threadId === params.threadId);
  };
  const put = (record: T) => {
    if (!matches(record)) return;
    changed.add(options.key(record));
    setRecords((current) => [record, ...current.filter((item) => options.key(item) !== options.key(record))]);
  };
  createEffect(options.params, (params) => {
    const serial = ++generation;
    changed.clear();
    setRecords([]);
    setError("");
    if (!options.enabled) return;
    void options
      .list(params)
      .then((saved) => {
        if (serial !== generation) return;
        setRecords((current) => [
          ...current.filter((item) => changed.has(options.key(item))),
          ...saved.filter((item) => matches(item) && !changed.has(options.key(item))),
        ]);
      })
      .catch((e) => {
        if (serial === generation) setError(e instanceof Error ? e.message : "Could not load this thread.");
      });
  });
  onSettled(() => {
    if (!options.enabled) return;
    const off = window.openbot.agent.onEvent((event) => {
      const record = options.fromEvent(event);
      if (record) put(record);
    });
    return () => {
      generation++;
      off();
    };
  });
  return { records, error, put };
}
