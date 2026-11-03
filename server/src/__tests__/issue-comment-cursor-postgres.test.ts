import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, issueComments, issues, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS } from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.js";

describe("comment reconnect cursor on PostgreSQL", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("comment-cursor-");
    db = createDb(database.connectionString);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);
  afterAll(async () => { await db?.$client.end(); await database?.cleanup(); });

  it("keeps submillisecond precision and UUID ties in both directions without duplicates or gaps", async () => {
    const companyId = randomUUID(), issueId = randomUUID(), otherIssueId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Cursor test", issuePrefix: `C${companyId.slice(0, 6)}` });
    await db.insert(issues).values([
      { id: issueId, companyId, title: "Reconnect history" },
      { id: otherIssueId, companyId, title: "Unrelated thread" },
    ]);
    const ids = Array.from({ length: 4 }, () => randomUUID()).sort();
    await db.insert(issueComments).values(ids.map((id, index) => ({
      id, companyId, issueId, authorUserId: "person-a", body: `Message ${index}`,
      createdAt: index === 3 ? sql`'2026-11-03 12:00:00.123900+00'::timestamptz`
        : sql`'2026-11-03 12:00:00.123456+00'::timestamptz`,
    })));
    const service = issueService(db);
    const asc = await service.listComments(issueId, { companyId, order: "asc", afterCommentId: ids[1] });
    expect(asc.map(row => row.id)).toEqual(ids.slice(2));
    const desc = await service.listComments(issueId, { companyId, order: "desc", afterCommentId: ids[2] });
    expect(desc.map(row => row.id)).toEqual(ids.slice(0, 2).reverse());
    expect((await service.listComments(issueId, { companyId, order: "asc", afterCommentId: ids[1], limit: 1 })).map(row => row.id)).toEqual([ids[2]]);
    expect(await service.listComments(issueId, { companyId, order: "asc", afterCommentId: ids[3] })).toEqual([]);
    expect(await service.listComments(otherIssueId, { companyId, afterCommentId: ids[1] })).toEqual([]);
    expect(await service.listComments(issueId, { companyId: randomUUID(), afterCommentId: ids[1] })).toEqual([]);
    expect(await service.listComments(issueId, { afterCommentId: randomUUID() })).toEqual([]);
    expect(await service.listComments(issueId, { afterCommentId: "invalid" })).toEqual([]);
  });
});
