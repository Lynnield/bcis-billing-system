import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { subscribers, subscriberStatusHistory, users } from "../db/schema";
import { authenticate } from "../lib/auth";
import { requirePermission } from "../lib/permissions";

const statusValues = ["active", "inactive", "suspended", "disconnected", "pending"] as const;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  accountNumber: z.string().trim().max(50).optional(),
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().max(255).optional(),
  contactNumber: z.string().trim().max(50).optional(),
  status: z.enum(statusValues).optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const createSchema = z.object({
  accountNumber: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  contactNumber: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(255).optional(),
  addressLine1: z.string().trim().min(1).max(255),
  addressLine2: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(4000).optional(),
  status: z.enum(statusValues).optional(),
});

const updateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    contactNumber: z.string().trim().max(50).nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    addressLine1: z.string().trim().min(1).max(255).optional(),
    addressLine2: z.string().trim().max(255).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    province: z.string().trim().max(100).nullable().optional(),
    postalCode: z.string().trim().max(20).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

const statusChangeSchema = z.object({
  status: z.enum(statusValues),
  reason: z.string().trim().max(1000).optional(),
});



function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code?: string }).code === "23505") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

const subscriberColumns = {
  id: subscribers.id,
  accountNumber: subscribers.accountNumber,
  firstName: subscribers.firstName,
  lastName: subscribers.lastName,
  contactNumber: subscribers.contactNumber,
  email: subscribers.email,
  addressLine1: subscribers.addressLine1,
  addressLine2: subscribers.addressLine2,
  city: subscribers.city,
  province: subscribers.province,
  postalCode: subscribers.postalCode,
  notes: subscribers.notes,
  status: subscribers.status,
  createdAt: subscribers.createdAt,
  updatedAt: subscribers.updatedAt,
};

export default async function subscriberRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/subscribers",
    { preHandler: [authenticate, requirePermission("subscriber.view")] },
    async (request, reply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ message: "Invalid query parameters" });
      }
      const { page, pageSize, accountNumber, name, email, contactNumber, status } = parsed.data;

      const conditions = [];
      if (accountNumber) conditions.push(ilike(subscribers.accountNumber, `%${accountNumber}%`));
      if (name) {
        conditions.push(
          or(ilike(subscribers.firstName, `%${name}%`), ilike(subscribers.lastName, `%${name}%`)),
        );
      }
      if (email) conditions.push(ilike(subscribers.email, `%${email}%`));
      if (contactNumber) conditions.push(ilike(subscribers.contactNumber, `%${contactNumber}%`));
      if (status) conditions.push(eq(subscribers.status, status));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(subscribers)
        .where(where);
      const total = totalRow?.count ?? 0;

      const data = await db
        .select(subscriberColumns)
        .from(subscribers)
        .where(where)
        .orderBy(subscribers.lastName, subscribers.firstName)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return reply.send({
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        },
      });
    },
  );

  app.get(
    "/api/v1/subscribers/:id",
    { preHandler: [authenticate, requirePermission("subscriber.view")] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ message: "Invalid subscriber ID" });
      }
      const [row] = await db
        .select(subscriberColumns)
        .from(subscribers)
        .where(eq(subscribers.id, params.data.id))
        .limit(1);
      if (!row) {
        return reply.code(404).send({ message: "Subscriber not found" });
      }
      return reply.send({ data: row });
    },
  );

  app.post(
    "/api/v1/subscribers",
    { preHandler: [authenticate, requirePermission("subscriber.manage")] },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ message: "Invalid subscriber data", issues: parsed.error.issues });
      }

      try {
        const created = await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(subscribers)
            .values({ ...parsed.data, status: parsed.data.status ?? "pending" })
            .returning();

          await tx.insert(subscriberStatusHistory).values({
            subscriberId: row!.id,
            oldStatus: null,
            newStatus: row!.status,
            changedByUserId: request.currentUser!.id,
            note: "Subscriber created",
          });

          return row!;
        });

        return reply.code(201).send({ data: created });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return reply.code(409).send({ message: "Account number already exists" });
        }
        throw err;
      }
    },
  );

  app.patch(
    "/api/v1/subscribers/:id",
    { preHandler: [authenticate, requirePermission("subscriber.manage")] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ message: "Invalid subscriber ID" });
      }
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ message: "Invalid update data", issues: parsed.error.issues });
      }
      if (Object.keys(parsed.data).length === 0) {
        return reply.code(400).send({ message: "No fields to update" });
      }

      const [updated] = await db
        .update(subscribers)
        .set(parsed.data)
        .where(eq(subscribers.id, params.data.id))
        .returning();

      if (!updated) {
        return reply.code(404).send({ message: "Subscriber not found" });
      }
      return reply.send({ data: updated });
    },
  );

  app.delete(
    "/api/v1/subscribers/:id",
    { preHandler: [authenticate, requirePermission("subscriber.manage")] },
    async () => {
      return {
        message:
          "Subscribers cannot be deleted because historical financial records depend on them. Use PATCH /api/v1/subscribers/:id/status to deactivate.",
      };
    },
  );

  app.patch(
    "/api/v1/subscribers/:id/status",
    { preHandler: [authenticate, requirePermission("subscriber.manage")] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ message: "Invalid subscriber ID" });
      }
      const parsed = statusChangeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ message: "Invalid status change" });
      }

      try {
        const result = await db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(subscribers)
            .where(eq(subscribers.id, params.data.id))
            .limit(1);

          if (!current) {
            return { error: 404 as const };
          }
          if (current.status === parsed.data.status) {
            return { error: 409 as const };
          }

          const [updated] = await tx
            .update(subscribers)
            .set({ status: parsed.data.status })
            .where(eq(subscribers.id, current.id))
            .returning();

          await tx.insert(subscriberStatusHistory).values({
            subscriberId: current.id,
            oldStatus: current.status,
            newStatus: parsed.data.status,
            changedByUserId: request.currentUser!.id,
            note: parsed.data.reason ?? null,
          });

          return { updated: updated! };
        });

        if ("error" in result && result.error === 404) {
          return reply.code(404).send({ message: "Subscriber not found" });
        }
        if ("error" in result && result.error === 409) {
          return reply
            .code(409)
            .send({ message: "Subscriber already has the requested status; no change recorded" });
        }
        return reply.send({ data: result.updated });
      } catch (err) {
        throw err;
      }
    },
  );

  app.get(
    "/api/v1/subscribers/:id/status-history",
    { preHandler: [authenticate, requirePermission("subscriber.view")] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ message: "Invalid subscriber ID" });
      }

      const [exists] = await db
        .select({ id: subscribers.id })
        .from(subscribers)
        .where(eq(subscribers.id, params.data.id))
        .limit(1);
      if (!exists) {
        return reply.code(404).send({ message: "Subscriber not found" });
      }

      const history = await db
        .select({
          id: subscriberStatusHistory.id,
          oldStatus: subscriberStatusHistory.oldStatus,
          newStatus: subscriberStatusHistory.newStatus,
          note: subscriberStatusHistory.note,
          createdAt: subscriberStatusHistory.createdAt,
          changedBy: users.username,
        })
        .from(subscriberStatusHistory)
        .leftJoin(users, eq(users.id, subscriberStatusHistory.changedByUserId))
        .where(eq(subscriberStatusHistory.subscriberId, params.data.id))
        .orderBy(desc(subscriberStatusHistory.createdAt), desc(subscriberStatusHistory.id));

      return reply.send({ data: history });
    },
  );
}
