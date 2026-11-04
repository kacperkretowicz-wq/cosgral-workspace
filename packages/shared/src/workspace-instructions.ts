import { z } from "zod";

export const WORKSPACE_INSTRUCTION_MAX_LENGTH = 8000;
export const workspaceInstructionSchema = z.object({
  text: z.string().max(WORKSPACE_INSTRUCTION_MAX_LENGTH)
    .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Instrukcje zawierają niedozwolone znaki sterujące."),
}).strict();
export type WorkspaceInstruction = z.infer<typeof workspaceInstructionSchema>;

export type WorkspaceInstructionView = WorkspaceInstruction & { canEdit: boolean };
