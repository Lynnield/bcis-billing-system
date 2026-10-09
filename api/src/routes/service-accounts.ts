import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, ilike, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs,
  collectionAreas,
  collectors,
  serviceAccounts,
  servicePlans,
  services,
  subscribers,
} from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";

const STATUS_VALUES = ["active", "inactive", "suspended", "disconnected", "pending_installation"] as const;

const READ_ROLES = [
  ROLE_NAMES.OWNER,
  ROLE_NAMES.ADMINISTRATOR,
  ROLE_NAMES.CASHIER,
  ROLE_NAMES.COLLECTION_SUPERVISOR,
  ROLE_NAMES.ACCOUNTING_AUDITOR,
  ROLE_NAMES.TECHNICIAN,
  ROLE_NAMES.READ_ONLY_VIEWER,
];
const WRITE_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR];
const ASSIGN_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.COLLECTION_SUPERVISOR];

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  subscriberId: z.coerce.number().int().positive().optional(),
  serviceId: z.coerce.number().int().positive().optional(),
  planId: z.coerce.number().int().positive().optional(),
  serviceNumber: z.string().trim().max(50).optional(),
  collectionAreaId: z.coerce.number().int().positive().optional(),
  collectorId: z.coerce.number().int().positive().optional(),
  status: z.enum(STATUS_VALUES).optional(),
});

const createSchema = z.object({
  subscriberId: z.number().int().positive(),
  planId: z.number().int().positive(),
  serviceNumber: z.string().trim().min(1).max(50),
  status: z.enum(STATUS_VALUES).optional(),
  collectionAreaId: z.number().int().positive().optional(),
  assignedCollectorId: z.number().int().positive().optional(),
}).strict();

const updateSchema = z.object({
  planId: z.number().int().positive().optional(),
  status: z.enum(STATUS_VALUES).optional(),
  activatedAt: z.string().datetime().nullable().optional(),
}).strict();

const statusSchema = z.object({
  status: z.enum(STATUS_VALUES),
  reason: z.string().trim().max(1000).optional(),
}).strict();

const assignmentSchema = z.object({
  collectionAreaId: z.number().int().positive().nullable().optional(),
  collectorId: z.number().int().positive().nullable().optional(),
}).strict();

function isConflict(err: unknown): boolean {
  let current: unknown = err;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function getServiceAccountDetail(id: number) {
  const rows = await db
    .select({
      id: serviceAccounts.id,
      serviceNumber: serviceAccounts.serviceNumber,
      status: serviceAccounts.status,
      activatedAt: serviceAccounts.activatedAt,
      createdAt: serviceAccounts.createdAt,
      updatedAt: serviceAccounts.updatedAt,
      subscriber: {
        id: subscribers.id,
        accountNumber: subscribers.accountNumber,
        firstName: subscribers.firstName,
        lastName: subscribers.lastName,
        status: subscribers.status,
      },
      plan: {
        id: servicePlans.id,
        name: servicePlans.name,
        price: servicePlans.price,
        status: servicePlans.status,
      },
      service: {
        id: services.id,
        type: services.type,
        name: services.name,
      },
      collectionArea: {
        id: collectionAreas.id,
        name: collectionAreas.name,
      },
      collector: {
        id: collectors.id,
        fullName: collectors.fullName,
      },
    })
    .from(serviceAccounts)
    .innerJoin(subscribers, eq(subscribers.id, serviceAccounts.subscriberId))
    .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
    .innerJoin(services, eq(services.id, servicePlans.serviceId))
    .leftJoin(collectionAreas, eq(collectionAreas.id, serviceAccounts.collectionAreaId))
    .leftJoin(collectors, eq(collectors.id, serviceAccounts.assignedCollectorId))
    .where(eq(serviceAccounts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export default async function serviceAccountRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/service-accounts", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const { page, pageSize, subscriberId, serviceId, planId, serviceNumber, collectionAreaId, collectorId, status } = parsed.data;

    const conditions = [];
    if (subscriberId) conditions.push(eq(serviceAccounts.subscriberId, subscriberId));
    if (planId) conditions.push(eq(serviceAccounts.planId, planId));
    if (serviceId) conditions.push(eq(servicePlans.serviceId, serviceId));
    if (collectionAreaId) conditions.push(eq(serviceAccounts.collectionAreaId, collectionAreaId));
    if (collectorId) conditions.push(eq(serviceAccounts.assignedCollectorId, collectorId));
    if (status) conditions.push(eq(serviceAccounts.status, status));
    if (serviceNumber) conditions.push(ilike(serviceAccounts.serviceNumber, `%${serviceNumber}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceAccounts)
      .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
      .where(where);
    const total = totalRow?.count ?? 0;

    const data = await db
      .select({
        id: serviceAccounts.id,
        serviceNumber: serviceAccounts.serviceNumber,
        status: serviceAccounts.status,
        activatedAt: serviceAccounts.activatedAt,
        subscriberId: serviceAccounts.subscriberId,
        planId: serviceAccounts.planId,
        serviceId: servicePlans.serviceId,
        collectionAreaId: serviceAccounts.collectionAreaId,
        assignedCollectorId: serviceAccounts.assignedCollectorId,
        createdAt: serviceAccounts.createdAt,
      })
      .from(serviceAccounts)
      .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
      .where(where)
      .orderBy(serviceAccounts.id)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return reply.send({
      data,
      pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) },
    });
  });

  app.get("/api/v1/service-accounts/:id", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const detail = await getServiceAccountDetail(params.data.id);
    if (!detail) return reply.code(404).send({ message: "Service account not found" });
    return reply.send({ data: detail });
  });

  app.post("/api/v1/service-accounts", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid service account data", issues: parsed.error.issues });

    const [subscriber] = await db.select().from(subscribers).where(eq(subscribers.id, parsed.data.subscriberId)).limit(1);
    if (!subscriber) return reply.code(400).send({ message: "Subscriber does not exist" });
    if (subscriber.status !== "active") return reply.code(400).send({ message: "Subscriber must be active to receive a service account" });

    const [plan] = await db.select().from(servicePlans).where(eq(servicePlans.id, parsed.data.planId)).limit(1);
    if (!plan) return reply.code(400).send({ message: "Service plan does not exist" });
    if (plan.status !== "active") return reply.code(400).send({ message: "Service plan is not active" });

    if (parsed.data.collectionAreaId !== undefined) {
      const [area] = await db.select({ id: collectionAreas.id }).from(collectionAreas).where(eq(collectionAreas.id, parsed.data.collectionAreaId)).limit(1);
      if (!area) return reply.code(400).send({ message: "Collection area does not exist" });
    }

    if (parsed.data.assignedCollectorId !== undefined) {
      const [collector] = await db.select().from(collectors).where(eq(collectors.id, parsed.data.assignedCollectorId)).limit(1);
      if (!collector) return reply.code(400).send({ message: "Collector does not exist" });
      if (
        parsed.data.collectionAreaId !== undefined &&
        collector.collectionAreaId !== null &&
        collector.collectionAreaId !== parsed.data.collectionAreaId
      ) {
        return reply.code(400).send({ message: "Collector is assigned to a different collection area" });
      }
    }

    try {
      const [row] = await db
        .insert(serviceAccounts)
        .values(parsed.data)
        .returning();
      const detail = await getServiceAccountDetail(row!.id);
      return reply.code(201).send({ data: detail });
    } catch (err) {
      if (isConflict(err)) return reply.code(409).send({ message: "Service account number already exists" });
      throw err;
    }
  });

  app.patch("/api/v1/service-accounts/:id", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid update data", issues: parsed.error.issues });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ message: "No fields to update" });

    if (parsed.data.planId !== undefined) {
      const [plan] = await db.select({ id: servicePlans.id }).from(servicePlans).where(eq(servicePlans.id, parsed.data.planId)).limit(1);
      if (!plan) return reply.code(400).send({ message: "Service plan does not exist" });
    }

    const [updated] = await db
      .update(serviceAccounts)
      .set({
        ...(parsed.data.planId !== undefined ? { planId: parsed.data.planId } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.activatedAt !== undefined
          ? { activatedAt: parsed.data.activatedAt === null ? null : new Date(parsed.data.activatedAt) }
          : {}),
      })
      .where(eq(serviceAccounts.id, params.data.id))
      .returning({ id: serviceAccounts.id });

    if (!updated) return reply.code(404).send({ message: "Service account not found" });
    const detail = await getServiceAccountDetail(updated.id);
    return reply.send({ data: detail });
  });

  app.patch("/api/v1/service-accounts/:id/status", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid status" });

    const [updated] = await db
      .update(serviceAccounts)
      .set({ status: parsed.data.status })
      .where(eq(serviceAccounts.id, params.data.id))
      .returning({ id: serviceAccounts.id });
    if (!updated) return reply.code(404).send({ message: "Service account not found" });
    const detail = await getServiceAccountDetail(updated.id);
    return reply.send({ data: detail });
  });

  app.patch("/api/v1/service-accounts/:id/collection-assignment", { preHandler: [authenticate, requireRoles(...ASSIGN_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const parsed = assignmentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid assignment data" });

    const [existing] = await db.select().from(serviceAccounts).where(eq(serviceAccounts.id, params.data.id)).limit(1);
    if (!existing) return reply.code(404).send({ message: "Service account not found" });

    const nextAreaId = parsed.data.collectionAreaId !== undefined ? parsed.data.collectionAreaId : existing.collectionAreaId;
    const nextCollectorId = parsed.data.collectorId !== undefined ? parsed.data.collectorId : existing.assignedCollectorId;

    if (nextAreaId !== null) {
      const [area] = await db.select({ id: collectionAreas.id }).from(collectionAreas).where(eq(collectionAreas.id, nextAreaId)).limit(1);
      if (!area) return reply.code(400).send({ message: "Collection area does not exist" });
    }
    if (nextCollectorId !== null) {
      const [collector] = await db.select().from(collectors).where(eq(collectors.id, nextCollectorId)).limit(1);
      if (!collector) return reply.code(400).send({ message: "Collector does not exist" });
      if (nextAreaId !== null && collector.collectionAreaId !== null && collector.collectionAreaId !== nextAreaId) {
        return reply.code(400).send({ message: "Collector is assigned to a different collection area" });
      }
    }

    const [updated] = await db
      .update(serviceAccounts)
      .set({
        ...(parsed.data.collectionAreaId !== undefined ? { collectionAreaId: parsed.data.collectionAreaId } : {}),
        ...(parsed.data.collectorId !== undefined ? { assignedCollectorId: parsed.data.collectorId } : {}),
      })
      .where(eq(serviceAccounts.id, params.data.id))
      .returning({ id: serviceAccounts.id });

    const detail = await getServiceAccountDetail(updated!.id);
    return reply.send({ data: detail });
  });

  app.patch("/api/v1/service-accounts/:id/suspend", { preHandler: [authenticate, requireRoles(ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.COLLECTION_SUPERVISOR)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const body = z.object({ reason: z.string().trim().max(1000).optional() }).strict().safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ message: "Invalid request body" });

    try {
      const previousStatus = await db.transaction(async (tx) => {
        const [account] = await tx
          .select()
          .from(serviceAccounts)
          .where(eq(serviceAccounts.id, params.data.id))
          .for("update")
          .limit(1);
        if (!account) throw new NotFoundError();
        if (account.status !== "active") {
          throw new TransitionError(`Cannot suspend an account with status "${account.status}"`);
        }
        await tx.update(serviceAccounts).set({ status: "suspended" }).where(eq(serviceAccounts.id, account.id));
        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "service_account.suspend",
          entityType: "service_account",
          entityId: account.id,
          metadata: { previousStatus: account.status, newStatus: "suspended", reason: body.data.reason ?? null },
        });
        return account.status;
      });

      const detail = await getServiceAccountDetail(params.data.id);
      return reply.send({ data: detail, message: `Service account suspended (was ${previousStatus})` });
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ message: "Service account not found" });
      if (err instanceof TransitionError) return reply.code(409).send({ message: err.message });
      throw err;
    }
  });

  app.patch("/api/v1/service-accounts/:id/reconnect", { preHandler: [authenticate, requireRoles(ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.COLLECTION_SUPERVISOR)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const body = z.object({ reason: z.string().trim().max(1000).optional() }).strict().safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ message: "Invalid request body" });

    try {
      const previousStatus = await db.transaction(async (tx) => {
        const [account] = await tx
          .select()
          .from(serviceAccounts)
          .where(eq(serviceAccounts.id, params.data.id))
          .for("update")
          .limit(1);
        if (!account) throw new NotFoundError();
        if (account.status !== "suspended") {
          throw new TransitionError(`Only a suspended account can be reconnected (current: "${account.status}")`);
        }
        await tx.update(serviceAccounts).set({ status: "active" }).where(eq(serviceAccounts.id, account.id));
        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "service_account.reconnect",
          entityType: "service_account",
          entityId: account.id,
          metadata: { previousStatus: account.status, newStatus: "active", reason: body.data.reason ?? null },
        });
        return account.status;
      });

      const detail = await getServiceAccountDetail(params.data.id);
      return reply.send({ data: detail, message: `Service account reconnected (was ${previousStatus})` });
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ message: "Service account not found" });
      if (err instanceof TransitionError) return reply.code(409).send({ message: err.message });
      throw err;
    }
  });
}

class NotFoundError extends Error {}
class TransitionError extends Error {}
