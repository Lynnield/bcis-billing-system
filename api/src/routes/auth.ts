import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { verifyPassword } from "../lib/password";
import { authenticate, loadActiveUserWithRoles } from "../lib/auth";

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const INVALID_CREDENTIALS = "Invalid username/email or password";

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "identifier and password are required" });
    }

    const { identifier, password } = parsed.data;

    const found = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
      .limit(1);

    const user = found[0];
    if (!user || user.status !== "active") {
      return reply.code(401).send({ message: INVALID_CREDENTIALS });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ message: INVALID_CREDENTIALS });
    }

    const safeUser = await loadActiveUserWithRoles(user.id);
    if (!safeUser) {
      return reply.code(401).send({ message: INVALID_CREDENTIALS });
    }

    const token = app.jwt.sign({ sub: String(user.id) }, { expiresIn: "1h" });

    return reply.send({ token, user: safeUser });
  });

  app.get("/api/v1/auth/me", { preHandler: [authenticate] }, async (request) => {
    return { user: request.currentUser };
  });
}
