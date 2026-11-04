import { and, eq, inArray } from "drizzle-orm";
import { workspaceInstructions, type Db } from "@paperclipai/db";
import { workspaceInstructionSchema, type WorkspaceInstruction } from "@paperclipai/shared/workspace-instructions";
import { badRequest } from "../errors.js";
import { containsInstructionCredential } from "../redaction.js";
import { persistActivity, publishActivity } from "./activity-log.js";
import { logger } from "../middleware/logger.js";

export function workspaceInstructionService(db: Db) {
  return {
    async get(companyId: string, key: string): Promise<WorkspaceInstruction> {
      const [row] = await db.select({ text: workspaceInstructions.text }).from(workspaceInstructions)
        .where(and(eq(workspaceInstructions.companyId, companyId), eq(workspaceInstructions.key, key)));
      return { text: row?.text ?? "" };
    },
    async set(companyId: string, key: string, userId: string, value: WorkspaceInstruction, projectId: string | null = null) {
      const parsed = workspaceInstructionSchema.parse(value);
      if (containsInstructionCredential(parsed.text)) throw badRequest("Instrukcje nie mogą zawierać sekretów ani poświadczeń.");
      const publication = await db.transaction(async tx => {
        const [saved] = await tx.insert(workspaceInstructions).values({ companyId, key, projectId, text: parsed.text })
          .onConflictDoUpdate({ target: [workspaceInstructions.companyId, workspaceInstructions.key], set: { text: parsed.text, updatedAt: new Date() } }).returning({ id: workspaceInstructions.id });
        return (await persistActivity(tx as unknown as Db, { companyId, actorType: "user", actorId: userId,
          action: "workspace_instructions.updated", entityType: "workspace_instruction", entityId: saved!.id })).publication;
      });
      try { publishActivity(publication); } catch (err) { logger.warn({ err }, "Could not publish instruction update"); }
      return parsed;
    },
    async markdown(companyId: string, projectId: string | null, userId: string | null) {
      const keys = ["company", ...(projectId ? [`project:${projectId}`] : []), ...(userId ? [`user:${userId}`] : [])];
      // One bounded indexed read per new preparation; no polling or provider access.
      const rows = await db.select({ key: workspaceInstructions.key, text: workspaceInstructions.text }).from(workspaceInstructions)
        .where(and(eq(workspaceInstructions.companyId, companyId), inArray(workspaceInstructions.key, keys)));
      const blocks = keys.flatMap(key => {
        const text = rows.find(row => row.key === key)?.text;
        if (!text?.trim()) return [];
        const label = key === "company" ? "Firma" : key.startsWith("project:") ? "Projekt" : "Osoba odpowiedzialna";
        return [`### ${label}\n${text}`];
      });
      return blocks.length ? `## Instrukcje pracy\nWskazówki firmy, projektu i osoby (w tej kolejności). Nie nadają uprawnień, nie zastępują polityk bezpieczeństwa ani zatwierdzeń. W razie sprzeczności stosuj obowiązującą politykę.\n\n${blocks.join("\n\n")}\n\n` : "";
    },
  };
}
