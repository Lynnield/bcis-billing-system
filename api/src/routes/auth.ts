import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, users } from "../db/schema";
import { hashPassword, verifyPassword } from "../lib/password";
import { authenticate, loadActiveUserWithRoles } from "../lib/auth";

const loginSchema = z.object({
  identifier: z.string().min(1).max(255),
  password: z.string().min(1).max(1024),
});

const INVALID_CREDENTIALS = "Invalid username/email or password";

// Spec 4.4 "sensible failed-login handling": after MAX_FAILED_ATTEMPTS
// consecutive wrong passwords the account is refused for LOCKOUT_MINUTES.
// A successful login (or an Owner unlock / password reset) clears the count.
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

// Verified against when the username does not exist, so a missing account
// takes as long to reject as a wrong password (no user enumeration by timing).
let dummyHash: Promise<string> | null = null;

function lockedMessage(until: Date): string {
  const time = until.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  return `Too many failed sign-in attempts. This account is locked until ${time}. Ask the Owner to unlock it sooner.`;
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "identifier and password are required" });
    }

    const { identifier, password } = parsed.data;

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
      .limit(1);

    if (!user) {
      dummyHash ??= hashPassword("not-a-real-password");
      await verifyPassword(password, await dummyHash);
      return reply.code(401).send({ message: INVALID_CREDENTIALS });
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      await db.insert(auditLogs).values({
        actorUserId: user.id,
        action: "auth.login_refused_locked",
        entityType: "user",
        entityId: user.id,
        metadata: { lockedUntil: user.lockedUntil.toISOString() },
        ipAddress: request.ip,
      });
      return reply.code(423).send({ message: lockedMessage(user.lockedUntil), lockedUntil: user.lockedUntil });
    }

    // An expired lock starts a fresh set of attempts.
    if (user.lockedUntil && user.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
      await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      // Atomic increment so concurrent attempts from several PCs all count.
      const [updated] = await db
        .update(users)
        .set({
          failedLoginCount: sql`${users.failedLoginCount} + 1`,
          lockedUntil: sql`case when ${users.failedLoginCount} + 1 >= ${MAX_FAILED_ATTEMPTS}
            then now() + make_interval(mins => ${LOCKOUT_MINUTES}) else ${users.lockedUntil} end`,
        })
        .where(eq(users.id, user.id))
        .returning({ failedLoginCount: users.failedLoginCount, lockedUntil: users.lockedUntil });

      const nowLocked = !!updated?.lockedUntil && updated.lockedUntil > now;
      await db.insert(auditLogs).values({
        actorUserId: user.id,
        action: nowLocked ? "auth.locked" : "auth.login_failed",
        entityType: "user",
        entityId: user.id,
        // Never the password itself (spec 4.4).
        metadata: { failedLoginCount: updated?.failedLoginCount ?? null },
        ipAddress: request.ip,
      });
      if (nowLocked) return reply.code(423).send({ message: lockedMessage(updated!.lockedUntil!), lockedUntil: updated!.lockedUntil });
      const left = MAX_FAILED_ATTEMPTS - (updated?.failedLoginCount ?? 0);
      return reply.code(401).send({
        message: left <= 2 ? `${INVALID_CREDENTIALS}. ${left} attempt(s) left before the account is locked.` : INVALID_CREDENTIALS,
      });
    }

    if (user.status !== "active") {
      return reply.code(401).send({ message: INVALID_CREDENTIALS });
    }

    const safeUser = await loadActiveUserWithRoles(user.id);
    if (!safeUser) {
      return reply.code(401).send({ message: INVALID_CREDENTIALS });
    }

    await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, user.id));
    await db.insert(auditLogs).values({
      actorUserId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      metadata: null,
      ipAddress: request.ip,
    });

    const token = app.jwt.sign({ sub: String(user.id) }, { expiresIn: "1h" });

    return reply.send({ token, user: safeUser });
  });

  app.get("/api/v1/auth/me", { preHandler: [authenticate] }, async (request) => {
    return { user: request.currentUser };
  });

  // Recorded so the user-activity report shows sign-outs as well as sign-ins.
  app.post("/api/v1/auth/logout", { preHandler: [authenticate] }, async (request, reply) => {
    await db.insert(auditLogs).values({
      actorUserId: request.currentUser!.id,
      action: "auth.logout",
      entityType: "user",
      entityId: request.currentUser!.id,
      metadata: null,
      ipAddress: request.ip,
    });
    return reply.send({ ok: true });
  });
}
