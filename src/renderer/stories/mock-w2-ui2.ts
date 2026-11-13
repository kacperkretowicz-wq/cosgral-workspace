import type {
  AgentEvent,
  LibraryDesktopApi,
  LibraryItem,
  Routine,
  RoutineRun,
  RoutinesDesktopApi,
  SharedTable,
  TableRow,
  TablesDesktopApi,
  VaultDesktopApi,
  VaultItemSummary,
} from "@openbot/contracts/ipc";
export function createMockW2Ui2(
  emit: (event: AgentEvent) => void,
  resolveVault: (requestId: string, decline: boolean) => void,
) {
  const now = () => new Date().toISOString();
  let counter = 0;
  let vaultItems: VaultItemSummary[] = [
    {
      id: "vault-demo",
      kind: "login",
      label: "Demo login",
      origin: "https://example.com",
      username: "demo",
      hasTwoStepKey: false,
      cardLast4: null,
      cardExpiry: null,
      name: null,
      createdAt: now(),
      updatedAt: now(),
    },
  ];
  const vault: VaultDesktopApi = {
    status: async () => ({ encryptionAvailable: true, items: vaultItems.length }),
    list: async () => structuredClone(vaultItems),
    save: async (input) => {
      const old = vaultItems.find((item) => item.id === input.id);
      const item: VaultItemSummary = {
        id: old?.id ?? `vault-${++counter}`,
        kind: input.kind,
        label: input.label || "Demo item",
        origin: input.kind === "login" ? input.url : null,
        username: input.kind === "login" ? input.username : null,
        hasTwoStepKey: input.kind === "login" && (!!input.twoStepKey || !!old?.hasTwoStepKey),
        cardLast4: input.kind === "card" ? (input.number?.slice(-4) ?? old?.cardLast4 ?? null) : null,
        cardExpiry:
          input.kind === "card"
            ? `${String(input.expiryMonth).padStart(2, "0")}/${String(input.expiryYear).slice(-2)}`
            : null,
        name:
          input.kind === "contact" || input.kind === "apiKey"
            ? input.name
            : input.kind === "totp"
              ? input.issuer
              : null,
        createdAt: old?.createdAt ?? now(),
        updatedAt: now(),
      };
      vaultItems = [...vaultItems.filter((entry) => entry.id !== item.id), item];
      emit({ type: "vault-changed", items: vaultItems });
      return structuredClone(item);
    },
    delete: async ({ itemId }) => {
      vaultItems = vaultItems.filter((item) => item.id !== itemId);
      emit({ type: "vault-changed", items: vaultItems });
    },
    respondToRequest: async ({ requestId, decline }) => resolveVault(requestId, !!decline),
  };
  let routines: Routine[] = [
    {
      id: "routine-demo",
      botId: "chief",
      name: "Weekly review",
      prompt: "Summarise progress",
      trigger: "schedule",
      schedule: { type: "daily", time: "09:00" },
      timezone: "Europe/Warsaw",
      paused: false,
      nextRunAt: "2026-11-14T08:00:00Z",
      webhook: null,
      createdBy: "person",
      createdAt: now(),
      updatedAt: now(),
    },
  ];
  let runs: RoutineRun[] = [];
  const routinesApi: RoutinesDesktopApi = {
    list: async (botId) => structuredClone(routines.filter((item) => !botId || item.botId === botId)),
    create: async (input) => {
      const routine: Routine = {
        id: `routine-${++counter}`,
        botId: input.botId,
        name: input.name,
        prompt: input.prompt,
        trigger: input.trigger,
        schedule: input.schedule ?? null,
        timezone: input.timezone ?? "UTC",
        paused: input.paused ?? false,
        nextRunAt: null,
        webhook:
          input.trigger === "webhook"
            ? { url: "http://127.0.0.1:47900/webhooks/demo", eventTypes: input.eventTypes ?? [] }
            : null,
        createdBy: "person",
        createdAt: now(),
        updatedAt: now(),
      };
      routines = [...routines, routine];
      emit({ type: "routines-changed", routines });
      return { routine: structuredClone(routine), secret: input.trigger === "webhook" ? "whsec_DEMO_ONLY" : null };
    },
    update: async ({ routineId, ...input }) => {
      const old = routines.find((item) => item.id === routineId);
      if (!old) throw new Error("Routine not found");
      const routine = {
        ...old,
        ...input,
        webhook: old.webhook ? { ...old.webhook, eventTypes: input.eventTypes ?? old.webhook.eventTypes } : null,
      };
      routines = routines.map((item) => (item.id === routineId ? routine : item));
      emit({ type: "routines-changed", routines });
      return structuredClone(routine);
    },
    delete: async ({ routineId }) => {
      routines = routines.filter((item) => item.id !== routineId);
      emit({ type: "routines-changed", routines });
    },
    runNow: async ({ routineId }) => {
      const routine = routines.find((item) => item.id === routineId);
      if (!routine || routine.paused) throw new Error("Routine unavailable");
      const run: RoutineRun = {
        id: `run-${++counter}`,
        routineId,
        botId: routine.botId,
        cause: "manual",
        status: "done",
        reason: null,
        startedAt: now(),
        finishedAt: now(),
        deliveryId: null,
      };
      runs = [run, ...runs];
      emit({ type: "routine-run", run });
      return structuredClone(run);
    },
    listRuns: async ({ routineId }) => structuredClone(runs.filter((item) => item.routineId === routineId)),
    regenerateSecret: async ({ routineId }) => {
      const routine = routines.find((item) => item.id === routineId);
      if (!routine?.webhook) throw new Error("Webhook not found");
      return { routine: structuredClone(routine), secret: "whsec_DEMO_REPLACEMENT" };
    },
  };
  let tables: SharedTable[] = [
    {
      id: "table-demo",
      name: "Projects",
      description: "Demo records",
      columns: [
        { name: "Name", type: "text" },
        { name: "Done", type: "boolean" },
      ],
      ownerBotId: null,
      rowCount: 1,
      createdAt: now(),
      updatedAt: now(),
    },
  ];
  let rows: TableRow[] = [
    {
      id: "row-demo",
      tableId: "table-demo",
      version: 1,
      values: { Name: "Launch", Done: false },
      createdByBotId: null,
      updatedByBotId: null,
      createdAt: now(),
      updatedAt: now(),
    },
  ];
  const tablesApi: TablesDesktopApi = {
    list: async () => structuredClone(tables),
    create: async (input) => {
      const table: SharedTable = {
        id: `table-${++counter}`,
        name: input.name,
        description: input.description ?? null,
        columns: input.columns,
        ownerBotId: null,
        rowCount: 0,
        createdAt: now(),
        updatedAt: now(),
      };
      tables = [...tables, table];
      emit({ type: "tables-changed", tables });
      return structuredClone(table);
    },
    delete: async ({ tableId }) => {
      tables = tables.filter((item) => item.id !== tableId);
      rows = rows.filter((row) => row.tableId !== tableId);
      emit({ type: "tables-changed", tables });
    },
    queryRows: async ({ tableId, filters }) => {
      const list = rows.filter(
        (row) =>
          row.tableId === tableId &&
          (!filters?.length ||
            filters.every(
              (f) =>
                f.op === "contains" &&
                String(row.values[f.column] ?? "")
                  .toLowerCase()
                  .includes(String(f.value ?? "").toLowerCase()),
            )),
      );
      return { rows: structuredClone(list), total: list.length };
    },
    insertRows: async ({ tableId, rows: input }) => {
      const added: TableRow[] = input.map((values) => ({
        id: `row-${++counter}`,
        tableId,
        version: 1,
        values,
        createdByBotId: null,
        updatedByBotId: null,
        createdAt: now(),
        updatedAt: now(),
      }));
      rows = [...rows, ...added];
      emit({ type: "table-rows-changed", tableId, rowIds: added.map((item) => item.id) });
      return structuredClone(added);
    },
    updateRow: async ({ tableId, rowId, expectedVersion, values }) => {
      const old = rows.find((item) => item.id === rowId && item.tableId === tableId);
      if (!old) throw new Error("Row not found");
      if (old.version !== expectedVersion) return { status: "conflict", current: structuredClone(old) };
      const row = { ...old, values: { ...old.values, ...values }, version: old.version + 1, updatedAt: now() };
      rows = rows.map((item) => (item.id === rowId ? row : item));
      emit({ type: "table-rows-changed", tableId, rowIds: [rowId] });
      return { status: "updated", row: structuredClone(row) };
    },
    deleteRow: async ({ tableId, rowId, expectedVersion }) => {
      const old = rows.find((item) => item.id === rowId && item.tableId === tableId);
      if (!old) throw new Error("Row not found");
      if (old.version !== expectedVersion) return { status: "conflict", current: structuredClone(old) };
      rows = rows.filter((item) => item.id !== rowId);
      emit({ type: "table-rows-changed", tableId, rowIds: [rowId] });
      return { status: "deleted", rowId };
    },
  };
  let files: LibraryItem[] = [
    {
      id: "file-demo",
      name: "brief.txt",
      size: 42,
      kind: "file",
      mimeType: "text/plain",
      previewKind: "text",
      previewUrl: null,
      origin: "agent",
      createdAt: now(),
      createdByBotId: "chief",
      messageId: null,
    },
  ];
  const library: LibraryDesktopApi = {
    list: async (input) =>
      structuredClone(
        files.filter(
          (item) =>
            (!input?.query || item.name.toLowerCase().includes(input.query.toLowerCase())) &&
            (!input?.origin || item.origin === input.origin),
        ),
      ),
    usage: async () => ({
      files: files.length,
      bytes: files.reduce((sum, item) => sum + item.size, 0),
      limitBytes: 2147483648,
    }),
    choose: async () => {
      const item: LibraryItem = {
        id: `file-${++counter}`,
        name: "selected-demo.txt",
        size: 12,
        kind: "file",
        mimeType: "text/plain",
        previewKind: "text",
        previewUrl: null,
        origin: "upload",
        createdAt: now(),
        createdByBotId: null,
        messageId: null,
      };
      files = [...files, item];
      emit({ type: "library-changed", fileIds: [item.id] });
      return structuredClone([item]);
    },
    addFiles: async (input) => {
      const added: LibraryItem[] = input.map((file) => ({
        id: `file-${++counter}`,
        name: file.name,
        size: file.size,
        kind: "file",
        mimeType: file.type || "application/octet-stream",
        previewKind: "none",
        previewUrl: null,
        origin: "upload",
        createdAt: now(),
        createdByBotId: null,
        messageId: null,
      }));
      files = [...files, ...added];
      emit({ type: "library-changed", fileIds: added.map((item) => item.id) });
      return structuredClone(added);
    },
    saveFromChat: async ({ attachmentId }) => {
      const file = files.find((item) => item.id === attachmentId);
      if (!file) throw new Error("File not found");
      return structuredClone(file);
    },
    delete: async ({ fileId }) => {
      files = files.filter((file) => file.id !== fileId);
      emit({ type: "library-changed", fileIds: [fileId] });
    },
    open: async () => undefined,
    attachToDraft: async ({ fileId }) => {
      const file = files.find((item) => item.id === fileId);
      if (!file) throw new Error("File not found");
      return {
        id: `draft-${++counter}`,
        name: file.name,
        size: file.size,
        kind: file.kind,
        mimeType: file.mimeType,
        previewKind: file.previewKind,
        previewUrl: file.previewUrl,
      };
    },
  };
  return { vault, routines: routinesApi, tables: tablesApi, library };
}
