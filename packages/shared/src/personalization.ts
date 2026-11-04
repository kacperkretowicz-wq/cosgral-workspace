import { z } from "zod";

/** Presentation only; keys are company:project IDs, never execution authority. */
export const personalizationSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).default("system"),
  accent: z.enum(["cosgral", "violet", "ocean", "amber"]).default("cosgral"),
  sidebarWidth: z.number().int().min(208).max(420).default(240),
  conversationWidth: z.number().int().min(240).max(520).default(288),
  detailsOpen: z.boolean().default(false),
  views: z.record(z.string().min(1).max(160), z.enum(["chat", "table", "workflow"]))
    .refine(value => Object.keys(value).length <= 200, "Too many saved views").default({}),
}).strict();
export type Personalization = z.infer<typeof personalizationSchema>;
export const defaultPersonalization = (): Personalization => personalizationSchema.parse({});
