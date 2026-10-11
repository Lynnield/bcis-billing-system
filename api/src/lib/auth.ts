import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { roles, userRoles, users } from "../db/schema";
import { loadPermissionsForRoles } from "./permissions";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  roles: string[];
  /** Permission codes granted by the user's roles, resolved per request. */
  permissions: string[];
}

export async function loadActiveUserWithRoles(userId: number): Promise<AuthUser | null> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      fullName: users.fullName,
      status: users.status,
      roleName: roles.name,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(users.id, userId));

  const first = rows[0];
  if (!first || first.status !== "active") {
    return null;
  }

  const roleNames = rows.map((r) => r.roleName).filter((r): r is string => r !== null);
  return {
    id: first.id,
    username: first.username,
    email: first.email,
    fullName: first.fullName,
    roles: roleNames,
    permissions: await loadPermissionsForRoles(roleNames),
  };
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ message: "Authentication required" });
  }

  const payload = request.user as { sub?: string };
  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    return reply.code(401).send({ message: "Invalid authentication token" });
  }

  // Roles and active status are always resolved from the database — never
  // trusted from the client or the JWT payload.
  const user = await loadActiveUserWithRoles(userId);
  if (!user) {
    return reply.code(401).send({ message: "Account unavailable or inactive" });
  }

  request.currentUser = user;
}

