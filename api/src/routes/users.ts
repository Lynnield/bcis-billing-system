import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";
import { hashPassword } from "../lib/password";
import { db } from "../db";
import { auditLogs, roles, userRoles, users } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

const MANAGE_ROLES = [ROLE_NAMES.OWNER];
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(100),
  email: z.string().trim().email().max(255),
  fullName: z.string().trim().min(1).max(255),
  password: z.string().min(12).max(200),
  roleIds: z.array(z.number().int().positive()).min(1),
}).strict();

const updateUserSchema = z.object({
  email: z.string().trim().email().max(255).optional(),
  fullName: z.string().trim().min(1).max(255).optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).strict();

const updateRolesSchema = z.object({
  roleIds: z.array(z.number().int().positive()).min(1),
}).strict();

const resetPasswordSchema = z.object({
  password: z.string().min(12).max(200),
}).strict();

function isConflict(err: unknown): boolean {
  let current: unknown = err;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function getUserWithRoles(id: number) {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      fullName: users.fullName,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      lockedUntil: users.lockedUntil,
      failedLoginCount: users.failedLoginCount,
      createdAt: users.createdAt,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(users.id, id));

  const first = rows[0];
  if (!first) return null;
  return {
    id: first.id,
    username: first.username,
    email: first.email,
    fullName: first.fullName,
    status: first.status,
    lastLoginAt: first.lastLoginAt,
    lockedUntil: first.lockedUntil,
    failedLoginCount: first.failedLoginCount,
    createdAt: first.createdAt,
    roles: rows.filter((r) => r.roleId !== null).map((r) => ({ id: r.roleId!, name: r.roleName! })),
  };
}

class UserNotFoundError extends Error {}
class RoleNotFoundError extends Error {}
class SelfDeactivationError extends Error {}

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/users/me", { preHandler: [authenticate] }, async (request) => {
    return { user: request.currentUser };
  });

  app.get(
    "/api/v1/users",
    { preHandler: [authenticate, requireRoles(ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR)] },
    async () => {
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          fullName: users.fullName,
          status: users.status,
          roleName: roles.name,
          lastLoginAt: users.lastLoginAt,
          lockedUntil: users.lockedUntil,
          createdAt: users.createdAt,
        })
        .from(users)
        .leftJoin(userRoles, eq(userRoles.userId, users.id))
        .leftJoin(roles, eq(roles.id, userRoles.roleId));

      const byUser = new Map<number, Record<string, unknown>>();
      for (const row of rows) {
        let entry = byUser.get(row.id);
        if (!entry) {
          entry = {
            id: row.id,
            username: row.username,
            email: row.email,
            fullName: row.fullName,
            status: row.status,
            roles: [] as string[],
            lastLoginAt: row.lastLoginAt,
            // Only report a lock that is still in force.
            lockedUntil: row.lockedUntil && row.lockedUntil > new Date() ? row.lockedUntil : null,
            createdAt: row.createdAt,
          };
          byUser.set(row.id, entry);
        }
        if (row.roleName) {
          (entry.roles as string[]).push(row.roleName);
        }
      }
      return { users: [...byUser.values()] };
    },
  );

  app.get(
    "/api/v1/roles",
    { preHandler: [authenticate, requireRoles(ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR)] },
    async () => {
      const all = await db.select().from(roles);
      return { roles: all };
    },
  );

  // Everything below is Owner-only: user administration is the single
  // most sensitive capability in the system (it can grant any other
  // capability), so unlike most "Owner + Administrator" routes this one
  // does not extend to Administrator.
  app.post("/api/v1/users", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid user data", issues: parsed.error.issues });

    const roleRows = await db.select().from(roles).where(inArray(roles.id, parsed.data.roleIds));
    if (roleRows.length !== parsed.data.roleIds.length) {
      return reply.code(400).send({ message: "One or more roles do not exist" });
    }

    try {
      const result = await db.transaction(async (tx) => {
        const passwordHash = await hashPassword(parsed.data.password);
        const [user] = await tx
          .insert(users)
          .values({
            username: parsed.data.username,
            email: parsed.data.email,
            fullName: parsed.data.fullName,
            passwordHash,
            status: "active",
          })
          .returning();
        await tx.insert(userRoles).values(parsed.data.roleIds.map((roleId) => ({ userId: user!.id, roleId })));
        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "user.create",
          entityType: "user",
          entityId: user!.id,
          metadata: { username: parsed.data.username, roleIds: parsed.data.roleIds },
        });
        return user!.id;
      });

      const detail = await getUserWithRoles(result);
      return reply.code(201).send({ data: detail });
    } catch (err) {
      if (isConflict(err)) return reply.code(409).send({ message: "A user with that username or email already exists" });
      throw err;
    }
  });

  app.patch("/api/v1/users/:id", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid user ID" });
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid update data", issues: parsed.error.issues });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ message: "No fields to update" });

    try {
      const updated = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(users).where(eq(users.id, params.data.id)).for("update").limit(1);
        if (!existing) throw new UserNotFoundError();
        if (params.data.id === request.currentUser!.id && parsed.data.status === "inactive") {
          throw new SelfDeactivationError();
        }

        await tx.update(users).set(parsed.data).where(eq(users.id, params.data.id));
        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "user.update",
          entityType: "user",
          entityId: params.data.id,
          metadata: { changes: parsed.data },
        });
        return params.data.id;
      });

      const detail = await getUserWithRoles(updated);
      return reply.send({ data: detail });
    } catch (err) {
      if (err instanceof UserNotFoundError) return reply.code(404).send({ message: "User not found" });
      if (err instanceof SelfDeactivationError) return reply.code(409).send({ message: "You cannot deactivate your own account" });
      if (isConflict(err)) return reply.code(409).send({ message: "A user with that email already exists" });
      throw err;
    }
  });

  app.put("/api/v1/users/:id/roles", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid user ID" });
    const parsed = updateRolesSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid role data", issues: parsed.error.issues });

    try {
      const updated = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(users).where(eq(users.id, params.data.id)).for("update").limit(1);
        if (!existing) throw new UserNotFoundError();

        const roleRows = await tx.select().from(roles).where(inArray(roles.id, parsed.data.roleIds));
        if (roleRows.length !== parsed.data.roleIds.length) throw new RoleNotFoundError();

        await tx.delete(userRoles).where(eq(userRoles.userId, params.data.id));
        await tx.insert(userRoles).values(parsed.data.roleIds.map((roleId) => ({ userId: params.data.id, roleId })));
        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "user.roles_update",
          entityType: "user",
          entityId: params.data.id,
          metadata: { roleIds: parsed.data.roleIds },
        });
        return params.data.id;
      });

      const detail = await getUserWithRoles(updated);
      return reply.send({ data: detail });
    } catch (err) {
      if (err instanceof UserNotFoundError) return reply.code(404).send({ message: "User not found" });
      if (err instanceof RoleNotFoundError) return reply.code(400).send({ message: "One or more roles do not exist" });
      throw err;
    }
  });

  app.post("/api/v1/users/:id/reset-password", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid user ID" });
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Password must be at least 12 characters" });

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, params.data.id)).limit(1);
    if (!existing) return reply.code(404).send({ message: "User not found" });

    const passwordHash = await hashPassword(parsed.data.password);
    // A reset also clears any failed-login lock.
    await db.update(users).set({ passwordHash, failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, params.data.id));
    await db.insert(auditLogs).values({
      actorUserId: request.currentUser!.id,
      action: "user.reset_password",
      entityType: "user",
      entityId: params.data.id,
      metadata: {},
    });

    return reply.send({ data: { userId: params.data.id } });
  });

  app.post("/api/v1/users/:id/unlock", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid user ID" });
    const [existing] = await db.select({ id: users.id, lockedUntil: users.lockedUntil, failedLoginCount: users.failedLoginCount }).from(users).where(eq(users.id, params.data.id)).limit(1);
    if (!existing) return reply.code(404).send({ message: "User not found" });

    await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, existing.id));
    await db.insert(auditLogs).values({
      actorUserId: request.currentUser!.id,
      action: "user.unlock",
      entityType: "user",
      entityId: existing.id,
      metadata: { old: { lockedUntil: existing.lockedUntil, failedLoginCount: existing.failedLoginCount } },
    });
    return reply.send({ data: { userId: existing.id } });
  });
}
