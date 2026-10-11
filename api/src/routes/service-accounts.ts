import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, ilike, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs,
  collectionAreas,
  collectors,
  reconnectionRecords,
  serviceAccounts,
  servicePlans,
  services,
  subscribers,
  suspensionRecords,
  users,
} from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";
import { formatCents } from "../lib/money";
import { getInvoiceBalances } from "../lib/receivables";

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

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const rateString = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Rate must be an amount with up to 2 decimals");

// Spec 3.3 service account attributes.
const accountFields = {
  installationAddress: z.string().trim().max(255),
  billingStartDate: dateOnly,
  billingDueDay: z.number().int().min(1).max(28),
  // Account-specific monthly rate; omit/null to bill the plan's current price.
  currentRate: rateString,
};

const createSchema = z.object({
  subscriberId: z.number().int().positive(),
  planId: z.number().int().positive(),
  serviceNumber: z.string().trim().min(1).max(50),
  status: z.enum(STATUS_VALUES).optional(),
  collectionAreaId: z.number().int().positive().optional(),
  assignedCollectorId: z.number().int().positive().optional(),
  installationAddress: accountFields.installationAddress.optional(),
  billingStartDate: accountFields.billingStartDate.optional(),
  billingDueDay: accountFields.billingDueDay.optional(),
  currentRate: accountFields.currentRate.optional(),
}).strict();

const updateSchema = z.object({
  planId: z.number().int().positive().optional(),
  status: z.enum(STATUS_VALUES).optional(),
  activatedAt: z.string().datetime().nullable().optional(),
  installationAddress: accountFields.installationAddress.nullable().optional(),
  billingStartDate: accountFields.billingStartDate.nullable().optional(),
  billingDueDay: accountFields.billingDueDay.nullable().optional(),
  currentRate: accountFields.currentRate.nullable().optional(),
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
      installationAddress: serviceAccounts.installationAddress,
      billingStartDate: serviceAccounts.billingStartDate,
      billingDueDay: serviceAccounts.billingDueDay,
      currentRate: serviceAccounts.currentRate,
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
        code: servicePlans.code,
        name: servicePlans.name,
        price: servicePlans.price,
        installationFee: servicePlans.installationFee,
        reconnectionFee: servicePlans.reconnectionFee,
        speedMbps: servicePlans.speedMbps,
        channelCount: servicePlans.channelCount,
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
      const { billingStartDate, ...rest } = parsed.data;
      const [row] = await db
        .insert(serviceAccounts)
        .values({ ...rest, ...(billingStartDate ? { billingStartDate: new Date(billingStartDate) } : {}) })
        .returning();
      await db.insert(auditLogs).values({
        actorUserId: request.currentUser!.id,
        action: "service_account.create",
        entityType: "service_account",
        entityId: row!.id,
        metadata: { new: parsed.data },
      });
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

    const [before] = await db.select().from(serviceAccounts).where(eq(serviceAccounts.id, params.data.id)).limit(1);
    if (!before) return reply.code(404).send({ message: "Service account not found" });

    const d = parsed.data;
    const [updated] = await db
      .update(serviceAccounts)
      .set({
        ...(d.planId !== undefined ? { planId: d.planId } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.activatedAt !== undefined ? { activatedAt: d.activatedAt === null ? null : new Date(d.activatedAt) } : {}),
        ...(d.installationAddress !== undefined ? { installationAddress: d.installationAddress } : {}),
        ...(d.billingStartDate !== undefined ? { billingStartDate: d.billingStartDate === null ? null : new Date(d.billingStartDate) } : {}),
        ...(d.billingDueDay !== undefined ? { billingDueDay: d.billingDueDay } : {}),
        ...(d.currentRate !== undefined ? { currentRate: d.currentRate } : {}),
      })
      .where(eq(serviceAccounts.id, params.data.id))
      .returning({ id: serviceAccounts.id });

    // Plan, rate and status changes are part of the service history (3.10).
    const old = Object.fromEntries(Object.keys(d).map((k) => [k, (before as Record<string, unknown>)[k]]));
    await db.insert(auditLogs).values({
      actorUserId: request.currentUser!.id,
      action: "service_account.update",
      entityType: "service_account",
      entityId: before.id,
      metadata: { old, new: d },
    });

    const detail = await getServiceAccountDetail(updated!.id);
    return reply.send({ data: detail });
  });

  app.patch("/api/v1/service-accounts/:id/status", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid status" });

    const updatedId = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(serviceAccounts).where(eq(serviceAccounts.id, params.data.id)).for("update").limit(1);
      if (!before) return null;
      await tx.update(serviceAccounts).set({ status: parsed.data.status }).where(eq(serviceAccounts.id, before.id));
      await tx.insert(auditLogs).values({
        actorUserId: request.currentUser!.id,
        action: "service_account.status_change",
        entityType: "service_account",
        entityId: before.id,
        metadata: { previousStatus: before.status, newStatus: parsed.data.status, reason: parsed.data.reason ?? null },
      });
      return before.id;
    });
    if (!updatedId) return reply.code(404).send({ message: "Service account not found" });
    const detail = await getServiceAccountDetail(updatedId);
    return reply.send({ data: detail });
  });

  // Service history (spec 3.10): every recorded change to this account —
  // creation, plan/rate/status changes, suspensions and reconnections.
  app.get("/api/v1/service-accounts/:id/history", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const rows = await db
      .select({ id: auditLogs.id, at: auditLogs.createdAt, action: auditLogs.action, metadata: auditLogs.metadata, actorName: users.fullName })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(and(eq(auditLogs.entityType, "service_account"), eq(auditLogs.entityId, params.data.id)))
      .orderBy(sql`${auditLogs.createdAt} desc`, sql`${auditLogs.id} desc`);
    return reply.send({ data: rows });
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
    const body = z.object({ reason: z.string().trim().max(1000).optional(), notes: z.string().trim().max(2000).optional() }).strict().safeParse(request.body ?? {});
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
        await tx.insert(suspensionRecords).values({
          serviceAccountId: account.id,
          reason: body.data.reason ?? null,
          approvedByUserId: request.currentUser!.id,
          notes: body.data.notes ?? null,
        });
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

  // Spec 3.10 reconnection workflow: after a qualifying payment, a request is
  // raised (fee, technician, request date); the account becomes active only
  // when the reconnection is completed. completeNow does both in one step for
  // an office-side reconnection that needs no field visit.
  app.patch("/api/v1/service-accounts/:id/reconnect", { preHandler: [authenticate, requireRoles(ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.COLLECTION_SUPERVISOR)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const body = z.object({
      reason: z.string().trim().max(1000).optional(),
      // Defaults to the plan's reconnection fee.
      fee: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid fee").optional(),
      technicianUserId: z.number().int().positive().optional(),
      notes: z.string().trim().max(2000).optional(),
      completeNow: z.boolean().optional(),
      // Reconnect despite an unpaid overdue balance (Owner/Admin, reason required).
      overrideUnpaid: z.boolean().optional(),
    }).strict().safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ message: "Invalid request body", issues: body.error.issues });
    const b = body.data;

    const canOverride = request.currentUser!.roles.some((r) => r === ROLE_NAMES.OWNER || r === ROLE_NAMES.ADMINISTRATOR);
    if (b.overrideUnpaid && (!canOverride || !b.reason)) {
      return reply.code(403).send({ message: "Only the Owner or an Administrator can override the payment requirement, and a reason is required" });
    }

    if (b.technicianUserId !== undefined) {
      const [tech] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, b.technicianUserId)).limit(1);
      if (!tech || tech.status !== "active") return reply.code(400).send({ message: "Technician not found or inactive" });
    }

    // Qualifying payment: nothing may remain overdue on the account.
    const today = new Date().toISOString().slice(0, 10);
    const overdueCents = (await getInvoiceBalances({ serviceAccountId: params.data.id }))
      .filter((r) => r.balanceCents > 0n && r.dueDate.toISOString().slice(0, 10) < today)
      .reduce((t, r) => t + r.balanceCents, 0n);
    if (overdueCents > 0n && !b.overrideUnpaid) {
      return reply.code(409).send({
        message: `The account still has ${formatCents(overdueCents)} overdue. Collect payment before reconnecting.`,
        overdueBalance: formatCents(overdueCents),
      });
    }

    try {
      const result = await db.transaction(async (tx) => {
        const [account] = await tx.select().from(serviceAccounts).where(eq(serviceAccounts.id, params.data.id)).for("update").limit(1);
        if (!account) throw new NotFoundError();
        if (account.status !== "suspended") {
          throw new TransitionError(`Only a suspended account can be reconnected (current: "${account.status}")`);
        }
        const [pending] = await tx
          .select({ id: reconnectionRecords.id })
          .from(reconnectionRecords)
          .where(and(eq(reconnectionRecords.serviceAccountId, account.id), eq(reconnectionRecords.status, "requested")))
          .limit(1);
        if (pending) throw new TransitionError("A reconnection request is already open for this account");

        const [plan] = await tx.select({ reconnectionFee: servicePlans.reconnectionFee }).from(servicePlans).where(eq(servicePlans.id, account.planId)).limit(1);
        const fee = b.fee ?? plan?.reconnectionFee ?? "0.00";
        const completeNow = b.completeNow ?? false;

        const [record] = await tx
          .insert(reconnectionRecords)
          .values({
            serviceAccountId: account.id,
            fee,
            technicianUserId: b.technicianUserId ?? null,
            status: completeNow ? "completed" : "requested",
            completionDate: completeNow ? new Date() : null,
            completedByUserId: completeNow ? request.currentUser!.id : null,
            notes: b.notes ?? null,
            requestedByUserId: request.currentUser!.id,
          })
          .returning();
        if (completeNow) await tx.update(serviceAccounts).set({ status: "active" }).where(eq(serviceAccounts.id, account.id));

        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: completeNow ? "service_account.reconnect" : "service_account.reconnect_requested",
          entityType: "service_account",
          entityId: account.id,
          metadata: {
            reconnectionId: record!.id,
            previousStatus: account.status,
            newStatus: completeNow ? "active" : account.status,
            reason: b.reason ?? null,
            fee,
            technicianUserId: b.technicianUserId ?? null,
            overrideUnpaid: b.overrideUnpaid ?? false,
            overdueBalance: formatCents(overdueCents),
          },
        });
        return { completeNow, record: record! };
      });

      const detail = await getServiceAccountDetail(params.data.id);
      return reply.send({
        data: detail,
        reconnection: result.record,
        message: result.completeNow ? "Service account reconnected" : "Reconnection requested; the account stays suspended until it is completed",
      });
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ message: "Service account not found" });
      if (err instanceof TransitionError) return reply.code(409).send({ message: err.message });
      throw err;
    }
  });

  // Technician (or office) marks the field reconnection done.
  app.post(
    "/api/v1/service-accounts/:id/reconnections/:reconnectionId/complete",
    { preHandler: [authenticate, requireRoles(ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.COLLECTION_SUPERVISOR, ROLE_NAMES.TECHNICIAN)] },
    async (request, reply) => {
      const params = z.object({ id: z.coerce.number().int().positive(), reconnectionId: z.coerce.number().int().positive() }).safeParse(request.params);
      if (!params.success) return reply.code(400).send({ message: "Invalid IDs" });
      const body = z.object({ notes: z.string().trim().max(2000).optional() }).strict().safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ message: "Invalid request body" });

      try {
        await db.transaction(async (tx) => {
          const [account] = await tx.select().from(serviceAccounts).where(eq(serviceAccounts.id, params.data.id)).for("update").limit(1);
          if (!account) throw new NotFoundError();
          const [record] = await tx
            .select()
            .from(reconnectionRecords)
            .where(and(eq(reconnectionRecords.id, params.data.reconnectionId), eq(reconnectionRecords.serviceAccountId, account.id)))
            .for("update")
            .limit(1);
          if (!record) throw new NotFoundError();
          if (record.status !== "requested") throw new TransitionError("This reconnection has already been completed");

          await tx
            .update(reconnectionRecords)
            .set({
              status: "completed",
              completionDate: new Date(),
              completedByUserId: request.currentUser!.id,
              ...(body.data.notes ? { notes: [record.notes, body.data.notes].filter(Boolean).join("\n") } : {}),
            })
            .where(eq(reconnectionRecords.id, record.id));
          if (account.status === "suspended") {
            await tx.update(serviceAccounts).set({ status: "active" }).where(eq(serviceAccounts.id, account.id));
          }
          await tx.insert(auditLogs).values({
            actorUserId: request.currentUser!.id,
            action: "service_account.reconnect",
            entityType: "service_account",
            entityId: account.id,
            metadata: { reconnectionId: record.id, previousStatus: account.status, newStatus: "active", notes: body.data.notes ?? null },
          });
        });
        const detail = await getServiceAccountDetail(params.data.id);
        return reply.send({ data: detail, message: "Reconnection completed" });
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ message: "Reconnection not found" });
        if (err instanceof TransitionError) return reply.code(409).send({ message: err.message });
        throw err;
      }
    },
  );

  app.get("/api/v1/service-accounts/:id/suspension-history", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const rows = await db
      .select()
      .from(suspensionRecords)
      .where(eq(suspensionRecords.serviceAccountId, params.data.id))
      .orderBy(sql`${suspensionRecords.effectiveDate} desc`);
    return reply.send({ data: rows });
  });

  app.get("/api/v1/service-accounts/:id/reconnection-history", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });
    const rows = await db
      .select()
      .from(reconnectionRecords)
      .where(eq(reconnectionRecords.serviceAccountId, params.data.id))
      .orderBy(sql`${reconnectionRecords.requestDate} desc`);
    return reply.send({ data: rows });
  });
}

class NotFoundError extends Error {}
class TransitionError extends Error {}
