import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs,
  collectionBatches,
  collectionBatchPayments,
  collectors,
  payments,
} from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";
import { formatCents, parseMoneyToCents } from "../lib/money";

const VIEW_ROLES = [
  ROLE_NAMES.OWNER,
  ROLE_NAMES.ADMINISTRATOR,
  ROLE_NAMES.CASHIER,
  ROLE_NAMES.COLLECTION_SUPERVISOR,
  ROLE_NAMES.ACCOUNTING_AUDITOR,
  ROLE_NAMES.TECHNICIAN,
  ROLE_NAMES.READ_ONLY_VIEWER,
];
const MANAGE_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.CASHIER, ROLE_NAMES.COLLECTION_SUPERVISOR];
const REMIT_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.COLLECTION_SUPERVISOR, ROLE_NAMES.ACCOUNTING_AUDITOR];

const BATCH_STATUSES = ["open", "closed", "remitted", "reconciled"] as const;

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const moneyString = z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount");

const createBatchSchema = z.object({
  collectorId: z.number().int().positive(),
  batchDate: dateString,
}).strict();

const addPaymentSchema = z.object({
  paymentId: z.number().int().positive(),
}).strict();

const remitSchema = z.object({
  remittedAmount: moneyString,
  reconciliationNotes: z.string().trim().max(2000).optional(),
}).strict();

const patchBatchSchema = z.object({
  batchDate: dateString.optional(),
}).strict();

function isConflict(err: unknown): boolean {
  let current: unknown = err;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function computeExpectedCents(batchId: number): Promise<bigint> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(14,2)` })
    .from(collectionBatchPayments)
    .innerJoin(payments, eq(payments.id, collectionBatchPayments.paymentId))
    .where(and(eq(collectionBatchPayments.batchId, batchId), eq(payments.status, "posted")));
  return parseMoneyToCents(row?.total ?? "0") ?? 0n;
}

async function getBatchDetail(id: number) {
  const [batch] = await db.select().from(collectionBatches).where(eq(collectionBatches.id, id)).limit(1);
  if (!batch) return null;

  const [collector] = await db.select().from(collectors).where(eq(collectors.id, batch.collectorId)).limit(1);
  const batchPayments = await db
    .select({
      paymentId: collectionBatchPayments.paymentId,
      amount: payments.amount,
      method: payments.method,
      status: payments.status,
      paymentDate: payments.paymentDate,
      serviceAccountId: payments.serviceAccountId,
    })
    .from(collectionBatchPayments)
    .innerJoin(payments, eq(payments.id, collectionBatchPayments.paymentId))
    .where(eq(collectionBatchPayments.batchId, id));

  const expected = await computeExpectedCents(id);
  return {
    ...batch,
    collector: collector ? { id: collector.id, fullName: collector.fullName, status: collector.status } : null,
    payments: batchPayments,
    expectedAmountComputed: formatCents(expected),
  };
}

class CollectionNotFoundError extends Error {}
class PaymentNotFoundError extends Error {}
class PaymentNotAssignableError extends Error {}
class CollectionStateError extends Error {}
class PaymentAlreadyAssignedError extends Error {}

export default async function collectionBatchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/collection-batches", { preHandler: [authenticate, requireRoles(...VIEW_ROLES)] }, async (request, reply) => {
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      collectorId: z.coerce.number().int().positive().optional(),
      status: z.enum(BATCH_STATUSES).optional(),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const { page, pageSize, collectorId, status } = query.data;

    const conditions = [];
    if (collectorId) conditions.push(eq(collectionBatches.collectorId, collectorId));
    if (status) conditions.push(eq(collectionBatches.status, status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(collectionBatches).where(where);
    const total = totalRow?.count ?? 0;

    const data = await db
      .select()
      .from(collectionBatches)
      .where(where)
      .orderBy(desc(collectionBatches.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return reply.send({
      data,
      pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) },
    });
  });

  app.get("/api/v1/collection-batches/:id", { preHandler: [authenticate, requireRoles(...VIEW_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid batch ID" });
    const detail = await getBatchDetail(params.data.id);
    if (!detail) return reply.code(404).send({ message: "Collection batch not found" });
    return reply.send({ data: detail });
  });

  app.post("/api/v1/collection-batches", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const parsed = createBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid batch data", issues: parsed.error.issues });

    const [collector] = await db.select().from(collectors).where(eq(collectors.id, parsed.data.collectorId)).limit(1);
    if (!collector) return reply.code(400).send({ message: "Collector does not exist" });
    if (collector.status !== "active") return reply.code(400).send({ message: "Collector is not active" });

    const [batch] = await db
      .insert(collectionBatches)
      .values({
        collectorId: collector.id,
        batchDate: new Date(parsed.data.batchDate),
        status: "open",
        expectedAmount: "0.00",
        remittedAmount: "0.00",
        shortageAmount: "0.00",
        overageAmount: "0.00",
      })
      .returning();

    await db.insert(auditLogs).values({
      actorUserId: request.currentUser!.id,
      action: "collection_batch.create",
      entityType: "collection_batch",
      entityId: batch!.id,
      metadata: { collectorId: collector.id, batchDate: parsed.data.batchDate },
    });

    return reply.code(201).send({ data: batch });
  });

  app.patch("/api/v1/collection-batches/:id", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid batch ID" });
    const parsed = patchBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid update data", issues: parsed.error.issues });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ message: "No fields to update" });

    const [batch] = await db.select().from(collectionBatches).where(eq(collectionBatches.id, params.data.id)).limit(1);
    if (!batch) return reply.code(404).send({ message: "Collection batch not found" });
    if (batch.status !== "open") return reply.code(409).send({ message: "Only open batches can be modified" });

    const [updated] = await db
      .update(collectionBatches)
      .set(parsed.data.batchDate ? { batchDate: new Date(parsed.data.batchDate) } : {})
      .where(eq(collectionBatches.id, batch.id))
      .returning();
    return reply.send({ data: updated });
  });

  app.post("/api/v1/collection-batches/:id/payments", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid batch ID" });
    const parsed = addPaymentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid payment assignment" });

    try {
      const result = await db.transaction(async (tx) => {
        const [batch] = await tx
          .select()
          .from(collectionBatches)
          .where(eq(collectionBatches.id, params.data.id))
          .for("update")
          .limit(1);
        if (!batch) throw new CollectionNotFoundError();
        if (batch.status !== "open") throw new CollectionStateError("Payments can only be added to an open batch");

        const [payment] = await tx.select().from(payments).where(eq(payments.id, parsed.data.paymentId)).limit(1);
        if (!payment) throw new PaymentNotFoundError();
        if (payment.status !== "posted") throw new PaymentNotAssignableError("Only posted payments can be added to a batch");

        const [already] = await tx
          .select({ batchId: collectionBatchPayments.batchId })
          .from(collectionBatchPayments)
          .where(eq(collectionBatchPayments.paymentId, payment.id))
          .limit(1);
        if (already) {
          throw new PaymentAlreadyAssignedError(
            already.batchId === batch.id
              ? "Payment is already in this batch"
              : "Payment is already assigned to another batch",
          );
        }

        await tx.insert(collectionBatchPayments).values({ batchId: batch.id, paymentId: payment.id });

        // Authoritative expected amount from the batch's posted payments.
        const [sumRow] = await tx
          .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(14,2)` })
          .from(collectionBatchPayments)
          .innerJoin(payments, eq(payments.id, collectionBatchPayments.paymentId))
          .where(and(eq(collectionBatchPayments.batchId, batch.id), eq(payments.status, "posted")));
        const expected = parseMoneyToCents(sumRow?.total ?? "0") ?? 0n;

        const [updated] = await tx
          .update(collectionBatches)
          .set({ expectedAmount: formatCents(expected) })
          .where(eq(collectionBatches.id, batch.id))
          .returning();

        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "collection_batch.payment_added",
          entityType: "collection_batch",
          entityId: batch.id,
          metadata: { paymentId: payment.id, amount: payment.amount, expectedAmount: formatCents(expected) },
        });

        return updated!;
      });

      return reply.code(201).send({ data: result });
    } catch (err) {
      if (err instanceof CollectionNotFoundError) return reply.code(404).send({ message: "Collection batch not found" });
      if (err instanceof PaymentNotFoundError) return reply.code(404).send({ message: "Payment not found" });
      if (err instanceof PaymentNotAssignableError) return reply.code(400).send({ message: err.message });
      if (err instanceof CollectionStateError) return reply.code(409).send({ message: err.message });
      if (err instanceof PaymentAlreadyAssignedError) return reply.code(409).send({ message: err.message });
      if (isConflict(err)) return reply.code(409).send({ message: "Payment is already assigned to a batch" });
      throw err;
    }
  });

  app.post("/api/v1/collection-batches/:id/remit", { preHandler: [authenticate, requireRoles(...REMIT_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid batch ID" });
    const parsed = remitSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid remittance data", issues: parsed.error.issues });

    const remittedCents = parseMoneyToCents(parsed.data.remittedAmount);
    if (remittedCents === null || remittedCents < 0n) {
      return reply.code(400).send({ message: "Remitted amount must be a non-negative amount" });
    }

    try {
      const result = await db.transaction(async (tx) => {
        const [batch] = await tx
          .select()
          .from(collectionBatches)
          .where(eq(collectionBatches.id, params.data.id))
          .for("update")
          .limit(1);
        if (!batch) throw new CollectionNotFoundError();
        if (batch.status !== "open" && batch.status !== "closed") {
          throw new CollectionStateError("Batch has already been remitted or reconciled");
        }

        const [sumRow] = await tx
          .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(14,2)` })
          .from(collectionBatchPayments)
          .innerJoin(payments, eq(payments.id, collectionBatchPayments.paymentId))
          .where(and(eq(collectionBatchPayments.batchId, batch.id), eq(payments.status, "posted")));
        const expectedCents = parseMoneyToCents(sumRow?.total ?? "0") ?? 0n;

        const diff = remittedCents - expectedCents;
        const shortageCents = diff < 0n ? -diff : 0n;
        const overageCents = diff > 0n ? diff : 0n;

        const [updated] = await tx
          .update(collectionBatches)
          .set({
            expectedAmount: formatCents(expectedCents),
            remittedAmount: formatCents(remittedCents),
            shortageAmount: formatCents(shortageCents),
            overageAmount: formatCents(overageCents),
            status: "remitted",
            reconciliationNotes: parsed.data.reconciliationNotes ?? null,
          })
          .where(eq(collectionBatches.id, batch.id))
          .returning();

        const outcome = shortageCents > 0n ? "shortage" : overageCents > 0n ? "overage" : "balanced";
        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: `collection_batch.remit.${outcome}`,
          entityType: "collection_batch",
          entityId: batch.id,
          metadata: {
            expectedAmount: formatCents(expectedCents),
            remittedAmount: formatCents(remittedCents),
            shortageAmount: formatCents(shortageCents),
            overageAmount: formatCents(overageCents),
          },
        });

        return updated!;
      });

      return reply.send({ data: result });
    } catch (err) {
      if (err instanceof CollectionNotFoundError) return reply.code(404).send({ message: "Collection batch not found" });
      if (err instanceof CollectionStateError) return reply.code(409).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/collection-batches/:id/reconcile", { preHandler: [authenticate, requireRoles(...REMIT_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid batch ID" });

    try {
      const result = await db.transaction(async (tx) => {
        const [batch] = await tx
          .select()
          .from(collectionBatches)
          .where(eq(collectionBatches.id, params.data.id))
          .for("update")
          .limit(1);
        if (!batch) throw new CollectionNotFoundError();
        if (batch.status === "reconciled") throw new CollectionStateError("Batch has already been reconciled");
        if (batch.status !== "remitted") throw new CollectionStateError("Batch must be remitted before reconciliation");

        const shortage = parseMoneyToCents(batch.shortageAmount) ?? 0n;
        const overage = parseMoneyToCents(batch.overageAmount) ?? 0n;
        const outcome = shortage > 0n ? "shortage" : overage > 0n ? "overage" : "balanced";

        const [updated] = await tx
          .update(collectionBatches)
          .set({ status: "reconciled", reconciledAt: new Date() })
          .where(eq(collectionBatches.id, batch.id))
          .returning();

        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: `collection_batch.reconcile.${outcome}`,
          entityType: "collection_batch",
          entityId: batch.id,
          metadata: {
            expectedAmount: batch.expectedAmount,
            remittedAmount: batch.remittedAmount,
            shortageAmount: batch.shortageAmount,
            overageAmount: batch.overageAmount,
            outcome,
          },
        });

        return updated!;
      });

      return reply.send({ data: result });
    } catch (err) {
      if (err instanceof CollectionNotFoundError) return reply.code(404).send({ message: "Collection batch not found" });
      if (err instanceof CollectionStateError) return reply.code(409).send({ message: err.message });
      throw err;
    }
  });
}
