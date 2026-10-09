import type { FastifyInstance } from "fastify";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";
import { db } from "../db";
import { roles, userRoles, users } from "../db/schema";
import { eq } from "drizzle-orm";

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
}
