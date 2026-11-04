import { Router, type RequestHandler } from "express";
import type { Db } from "@paperclipai/db";
import { z } from "zod";
import { companyRoleDefinitionSchema, updateCompanyRoleSchema, assignCompanyRoleSchema } from "@paperclipai/shared/company-roles";
import { companyRoleService } from "../services/company-roles.js";
import { assertBoard, hasCompanyAccess, assertCompanyAccess } from "./authz.js";
import { forbidden, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";

export function companyRoleRoutes(db: Db) {
  const router = Router(), service = companyRoleService(db);
  const authorize: RequestHandler = (req, res, next) => {
    assertBoard(req);
    if (!req.actor.userId) throw forbidden("Board user required");
    for (const key of ["companyId", "roleId", "memberId"]) if (req.params[key]) z.uuid().parse(req.params[key]);
    if (!hasCompanyAccess(req, req.params.companyId as string)) throw notFound("Company not found");
    assertCompanyAccess(req, req.params.companyId as string);
    res.setHeader("Cache-Control", "private, no-store");
    next();
  };
  router.get("/companies/:companyId/roles", authorize, async (req, res) => {
    res.json(await service.list(req.params.companyId as string, req.actor.userId!));
  });
  router.post("/companies/:companyId/roles", authorize, validate(companyRoleDefinitionSchema), async (req, res) => {
    res.status(201).json(await service.create(req.params.companyId as string, req.actor.userId!, req.body));
  });
  router.put("/companies/:companyId/roles/:roleId", authorize, validate(updateCompanyRoleSchema), async (req, res) => {
    const { version, ...definition } = req.body;
    res.json(await service.update(req.params.companyId as string, req.actor.userId!, req.params.roleId as string, version, definition));
  });
  router.put("/companies/:companyId/members/:memberId/custom-role", authorize, validate(assignCompanyRoleSchema), async (req, res) => {
    res.json(await service.apply(req.params.companyId as string, req.actor.userId!, req.params.memberId as string, req.body.roleId, req.body.version));
  });
  return router;
}
