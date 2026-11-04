import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authUsers, companyMemberships } from "@paperclipai/db";
import { logActivity, publishActivity, type ActivityPublication } from "../services/activity-log.js";
import {
  authSessionSchema,
  currentUserProfileSchema,
  updateCurrentUserProfileSchema,
} from "@paperclipai/shared";
import { unauthorized } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { resolveSentryDsns } from "../sentry-dsn.js";

async function loadCurrentUserProfile(db: Db, userId: string) {
  const user = await db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      name: authUsers.name,
      image: authUsers.image,
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    throw unauthorized("Signed-in user not found");
  }

  return currentUserProfileSchema.parse({
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
  });
}

export function authRoutes(db: Db) {
  const router = Router();

  router.get("/get-session", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      throw unauthorized("Board authentication required");
    }

    const user = await loadCurrentUserProfile(db, req.actor.userId);
    res.json(authSessionSchema.parse({
      session: {
        id: `paperclip:${req.actor.source ?? "none"}:${req.actor.userId}`,
        userId: req.actor.userId,
      },
      user,
      // The browser reads this value to open its own Sentry gate — see
      // `ui/src/lib/sentry.ts`. `req.actor.type` already gates this whole
      // handler, so no second authorization check runs here. This field
      // carries the front-end DSN only; it never carries the backend DSN.
      sentryDsn: resolveSentryDsns().frontend,
      // Match the server SDK's runtime environment, including in reused images.
      sentryEnvironment: process.env.SENTRY_ENVIRONMENT || null,
    }));
  });

  router.get("/profile", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      throw unauthorized("Board authentication required");
    }

    res.json(await loadCurrentUserProfile(db, req.actor.userId));
  });

  router.patch("/profile", validate(updateCurrentUserProfileSchema), async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      throw unauthorized("Board authentication required");
    }

    const patch = updateCurrentUserProfileSchema.parse(req.body);
    const userId = req.actor.userId;
    const now = new Date();

    const publications: ActivityPublication[] = [];
    const updated = await db.transaction(async (tx) => {
      const updated = await tx
        .update(authUsers)
        .set({
          name: patch.name,
          ...(patch.image !== undefined ? { image: patch.image } : {}),
          updatedAt: now,
        })
        .where(eq(authUsers.id, userId))
        .returning({
          id: authUsers.id,
          email: authUsers.email,
          name: authUsers.name,
          image: authUsers.image,
        })
        .then((rows) => rows[0] ?? null);

      if (!updated) throw unauthorized("Signed-in user not found");
      const memberships = await tx.select({ companyId: companyMemberships.companyId })
        .from(companyMemberships).where(and(
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, userId),
          eq(companyMemberships.status, "active"),
        ));
      for (const membership of memberships) {
        await logActivity(tx as unknown as Db, {
          companyId: membership.companyId, actorType: "user", actorId: userId,
          action: "user.profile_updated", entityType: "user", entityId: updated.id,
          responsibleUserIdOverride: updated.id,
        }, publications);
      }
      return updated;
    });

    if (!updated) {
      throw unauthorized("Signed-in user not found");
    }

    for (const publication of publications) publishActivity(publication);

    res.json(currentUserProfileSchema.parse({
      id: updated.id,
      email: updated.email ?? null,
      name: updated.name ?? null,
      image: updated.image ?? null,
    }));
  });

  return router;
}
