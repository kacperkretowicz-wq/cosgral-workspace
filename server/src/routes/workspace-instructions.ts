import { Router, type RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { companies, projects, type Db } from "@paperclipai/db";
import { workspaceInstructionSchema } from "@paperclipai/shared/workspace-instructions";
import { z } from "zod";
import { forbidden, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { workspaceInstructionService } from "../services/workspace-instructions.js";
import { accessService } from "../services/access.js";
import { assertBoard, assertCompanyAccess, hasCompanyAccess } from "./authz.js";

export function workspaceInstructionRoutes(db: Db) {
  const router = Router();
  const service = workspaceInstructionService(db);
  const access = accessService(db);
  const authorize: RequestHandler = async (req, res, next) => {
    assertBoard(req);
    if (!req.actor.userId) throw forbidden("Board user required");
    const companyId = z.uuid().parse(req.params.companyId);
    if (!hasCompanyAccess(req, companyId) || !await db.query.companies.findFirst({ where: eq(companies.id, companyId) })) throw notFound("Company not found");
    assertCompanyAccess(req, companyId);
    // Fail closed even when the actor's memberships are absent.
    let canEdit = req.actor.source === "local_implicit" || req.actor.isInstanceAdmin === true
      || Boolean(req.actor.memberships?.some(m => m.companyId === companyId && m.status === "active" && m.membershipRole !== "viewer"));
    if (req.params.projectId) {
      const projectId = z.uuid().parse(req.params.projectId);
      const project = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.companyId, companyId)) });
      const resource = { type: "project" as const, companyId, projectId };
      if (!project || !(await access.decide({ actor: req.actor, action: "project:read", resource })).allowed) throw notFound("Project not found");
      canEdit = canEdit && (await access.decide({ actor: req.actor, action: "project:write_workspace", resource: { type: "issue", companyId, projectId, assigneeAgentId: null }, scope: { projectId, assigneeAgentId: null } })).allowed;
      res.locals.instructionKey = `project:${projectId}`;
      res.locals.instructionProjectId = projectId;
    } else {
      res.locals.instructionKey = req.path.endsWith("/company") ? "company" : `user:${req.actor.userId}`;
    }
    if (req.method === "PUT" && !canEdit) throw forbidden("Instruction write access required");
    res.locals.canEdit = canEdit;
    res.setHeader("Cache-Control", "private, no-store");
    next();
  };
  router.get(["/companies/:companyId/instructions/company", "/companies/:companyId/instructions/me", "/companies/:companyId/instructions/projects/:projectId"], authorize, async (req, res) => { res.json({ ...await service.get(req.params.companyId as string, res.locals.instructionKey), canEdit: res.locals.canEdit }); });
  router.put(["/companies/:companyId/instructions/company", "/companies/:companyId/instructions/me", "/companies/:companyId/instructions/projects/:projectId"], authorize, validate(workspaceInstructionSchema), async (req, res) => {
    res.json(await service.set(req.params.companyId as string, res.locals.instructionKey, req.actor.userId!, req.body, res.locals.instructionProjectId ?? null));
  });
  return router;
}
