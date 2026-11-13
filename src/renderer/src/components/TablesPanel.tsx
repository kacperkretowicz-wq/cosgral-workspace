import type { SharedTable, TableRow, TableValues, TableWriteResult } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
export function RowEditor(props: {
  table: SharedTable;
  row?: TableRow;
  onSave: (values: TableValues, version?: number) => Promise<TableWriteResult | undefined>;
  onDone: () => void;
}) {
  const [values, setValues] = createSignal<TableValues>({ ...(props.row?.values ?? {}) });
  const [conflict, setConflict] = createSignal<TableRow>();
  const [error, setError] = createSignal("");
  async function save(version?: number) {
    try {
      setError("");
      const changed = props.row
        ? Object.fromEntries(
            Object.entries(values()).filter(([key, value]) => !Object.is(value, props.row?.values[key])),
          )
        : values();
      if (props.row && Object.keys(changed).length === 0) {
        props.onDone();
        return;
      }
      const result = await props.onSave(changed, version ?? props.row?.version);
      if (result?.status === "conflict") setConflict(result.current);
      else props.onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save row.");
    }
  }
  return (
    <section class="w2-panel" aria-label="Row editor">
      <h3>{props.row ? "Edit row" : "New row"}</h3>
      <For each={props.table.columns}>
        {(column) => (
          <label>
            {column.name}
            <Show
              when={column.type === "boolean"}
              fallback={
                <input
                  aria-label={column.name}
                  type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"}
                  value={String(values()[column.name] ?? "")}
                  onInput={(e) => {
                    const raw = e.currentTarget.value;
                    setValues((old) => ({
                      ...old,
                      [column.name]: raw === "" ? null : column.type === "number" ? Number(raw) : raw,
                    }));
                  }}
                />
              }
            >
              <select
                aria-label={column.name}
                value={
                  values()[column.name] === null || values()[column.name] === undefined
                    ? ""
                    : String(values()[column.name])
                }
                onChange={(e) =>
                  setValues((old) => ({
                    ...old,
                    [column.name]: e.currentTarget.value === "" ? null : e.currentTarget.value === "true",
                  }))
                }
              >
                <option value="">Empty</option>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </Show>
          </label>
        )}
      </For>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={conflict()}>
        {(current) => (
          <div role="alert">
            <p>This row changed since you opened it. Current version {current().version}:</p>
            <pre class="channel-prewrap">{JSON.stringify(current().values, null, 2)}</pre>
            <button type="button" onClick={() => void save(current().version)}>
              Apply my changes
            </button>
            <button type="button" onClick={props.onDone}>
              Keep current
            </button>
          </div>
        )}
      </Show>
      <button type="button" onClick={() => void save()}>
        Save row
      </button>
      <button type="button" onClick={props.onDone}>
        Cancel
      </button>
    </section>
  );
}
export function TablesPanel() {
  const [tables, setTables] = createSignal<SharedTable[]>([]);
  const [selected, setSelected] = createSignal("");
  const [rows, setRows] = createSignal<TableRow[]>([]);
  const [filter, setFilter] = createSignal("");
  const [editing, setEditing] = createSignal<TableRow | "new">();
  const [conflict, setConflict] = createSignal<TableRow>();
  const [error, setError] = createSignal("");
  let seq = 0;
  const table = () => tables().find((item) => item.id === selected());
  async function loadTables() {
    const api = window.openbot.tables;
    if (!api) {
      setError("Tables are unavailable in this build.");
      return;
    }
    try {
      setTables(await api.list());
    } catch {
      setError("Could not load tables.");
    }
  }
  async function loadRows(tableId = selected()) {
    const n = ++seq;
    const api = window.openbot.tables;
    const current = tables().find((item) => item.id === tableId);
    if (!api || !current) return;
    try {
      const column = current.columns.find((item) => item.type === "text");
      const page = await api.queryRows({
        tableId: current.id,
        ...(filter().trim() && column
          ? { filters: [{ column: column.name, op: "contains" as const, value: filter().trim() }] }
          : {}),
      });
      if (n === seq) setRows(page.rows);
    } catch (e) {
      if (n === seq) setError(e instanceof Error ? e.message : "Could not load rows.");
    }
  }
  onSettled(() => {
    void loadTables();
    if (!window.openbot.tables) return;
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "tables-changed") void loadTables();
      if (event.type === "table-rows-changed") {
        void loadTables();
        void loadRows();
      }
    });
    return () => {
      seq++;
      off();
    };
  });
  async function remove(row: TableRow) {
    const api = window.openbot.tables;
    if (!api) return;
    try {
      const result = await api.deleteRow({ tableId: row.tableId, rowId: row.id, expectedVersion: row.version });
      if (result.status === "conflict") setConflict(result.current);
      else {
        setConflict(undefined);
        await loadRows();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete row.");
    }
  }
  return (
    <section class="w2-panel" aria-label="Shared tables">
      <h2>Shared tables</h2>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <label>
        Table
        <select
          value={selected()}
          onChange={(e) => {
            setSelected(e.currentTarget.value);
            setRows([]);
            setFilter("");
            void loadRows(e.currentTarget.value);
          }}
        >
          <option value="">Select a table</option>
          <For each={tables()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
        </select>
      </label>
      <Show when={table()}>
        {(current) => (
          <>
            <label>
              Filter first text column
              <input value={filter()} onInput={(e) => setFilter(e.currentTarget.value)} />
            </label>
            <button type="button" onClick={() => void loadRows()}>
              Search rows
            </button>
            <button type="button" onClick={() => setEditing("new")}>
              Add row
            </button>
            <For each={rows()}>
              {(row) => (
                <article class="w2-item">
                  <strong>Version {row.version}</strong>
                  <pre class="channel-prewrap">{JSON.stringify(row.values, null, 2)}</pre>
                  <div>
                    <button type="button" onClick={() => setEditing(row)}>
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Delete this row?")) void remove(row);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              )}
            </For>
            <Show when={editing()} keyed>
              {(item) => (
                <RowEditor
                  table={current()}
                  row={item === "new" ? undefined : item}
                  onDone={() => {
                    setEditing(undefined);
                    void loadRows();
                  }}
                  onSave={async (values, version) => {
                    const api = window.openbot.tables;
                    if (!api) throw new Error("Tables unavailable");
                    if (item === "new") {
                      await api.insertRows({ tableId: current().id, rows: [values] });
                      return;
                    }
                    return api.updateRow({
                      tableId: current().id,
                      rowId: item.id,
                      expectedVersion: version ?? item.version,
                      values,
                    });
                  }}
                />
              )}
            </Show>
            <Show when={conflict()}>
              {(row) => (
                <div role="alert">
                  <p>Row changed since you opened it. Current version {row().version}:</p>
                  <pre>{JSON.stringify(row().values, null, 2)}</pre>
                  <button type="button" onClick={() => void remove(row())}>
                    Delete current version
                  </button>
                  <button type="button" onClick={() => setConflict(undefined)}>
                    Keep current
                  </button>
                </div>
              )}
            </Show>
          </>
        )}
      </Show>
    </section>
  );
}
