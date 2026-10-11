import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs,
  collectionBatchAccounts,
  collectionBatches,
  collectionBatchPayments,
  collectors,
  payments,
  serviceAccounts,
} from "../db/schema";
import { authenticate } from "../lib/auth";
import { requirePermission } from "../lib/permissions";
import { formatCents, parseMoneyToCents } from "../lib/money";
import { getInvoiceBalances } from "../lib/receivables";



const BATCH_STATUSES = ["open", "in_progress", "submitted", "remitted", "reconciled", "closed"] as const;
// Statuses in which collections may still be recorded against the batch.
const COLLECTING = ["open", "in_progress"];

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

const reconcileSchema = z.object({
  // Required when the remittance has a shortage or overage, so a difference
  // can never be reconciled without someone explicitly accepting it.
  acknowledgeDifference: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();

const closeSchema = z.object({
  confirm: z.literal(true),
  notes: z.string().trim().max(2000).optional(),
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Cash the collector must physically remit. GCash, bank transfer and cheque
// payments never pass through the collector's hands, so they are tracked as
// non-cash collections and never count toward a shortage.
async function computeExpectedCents(exec: typeof db | Tx, batchId: number): Promise<bigint> {
  const [row] = await exec
    .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(14,2)` })
    .from(collectionBatchPayments)
    .innerJoin(payments, eq(payments.id, collectionBatchPayments.paymentId))
    .where(and(eq(collectionBatchPayments.batchId, batchId), eq(payments.status, "posted"), eq(payments.method, "cash")));
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

  const expected = await computeExpectedCents(db, id);
  const routeAccounts = await db
    .select({
      serviceAccountId: collectionBatchAccounts.serviceAccountId,
      serviceNumber: serviceAccounts.serviceNumber,
      balanceDue: collectionBatchAccounts.balanceDue,
    })
    .from(collectionBatchAccounts)
    .innerJoin(serviceAccounts, eq(serviceAccounts.id, collectionBatchAccounts.serviceAccountId))
    .where(eq(collectionBatchAccounts.batchId, id));

  let cashCents = 0n;
  let nonCashCents = 0n;
  const collectedAccounts = new Set<number>();
  for (const p of batchPayments) {
    if (p.status !== "posted") continue;
    const amt = parseMoneyToCents(p.amount) ?? 0n;
    if (p.method === "cash") cashCents += amt;
    else nonCashCents += amt;
    collectedAccounts.add(p.serviceAccountId);
  }
  const expectedReceivable = parseMoneyToCents(batch.expectedReceivable) ?? 0n;
  const uncollected = expectedReceivable - cashCents - nonCashCents;
  const remitted = parseMoneyToCents(batch.remittedAmount) ?? 0n;
  const isRemitted = ["remitted", "reconciled", "closed"].includes(batch.status);

  return {
    ...batch,
    collector: collector ? { id: collector.id, fullName: collector.fullName, status: collector.status } : null,
    payments: batchPayments,
    routeAccounts,
    expectedAmountComputed: formatCents(expected),
    // Spec 3.8 / 4.3 reconciliation summary.
    summary: {
      expectedReceivable: formatCents(expectedReceivable),
      cashCollected: formatCents(cashCents),
      nonCashCollected: formatCents(nonCashCents),
      uncollected: formatCents(uncollected < 0n ? 0n : uncollected),
      accountsOnRoute: routeAccounts.length,
      accountsCollected: collectedAccounts.size,
      expectedCash: formatCents(expected),
      remittedCash: isRemitted ? formatCents(remitted) : null,
      difference: isRemitted ? formatCents(remitted - expected) : null,
    },
  };
}

class CollectionNotFoundError extends Error {}
class PaymentNotFoundError extends Error {}
class PaymentNotAssignableError extends Error {}
class CollectionStateError extends Error {}
class PaymentAlreadyAssignedError extends Error {}
class DifferenceNotAcknowledgedError extends Error {}

export default async function collectionBatchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/collection-batches", { preHandler: [authenticate, requirePermission("collection.view")] }, async (request, reply) => {
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

  app.get("/api/v1/collection-batches/:id", { preHandler: [authenticate, requirePermission("collection.view")] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid batch ID" });
    const detail = await getBatchDetail(params.data.id);
    if (!detail) return reply.code(404).send({ message: "Collection batch not found" });
    return reply.send({ data: detail });
  });

  app.post("/api/v1/collection-batches", { preHandler: [authenticate, requirePermission("collection.manage_batches")] }, async (request, reply) => {
    const parsed = createBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid batch data", issues: parsed.error.issues });

    const [collector] = await db.select().from(collectors).where(eq(collectors.id, parsed.data.collectorId)).limit(1);
    if (!collector) return reply.code(400).send({ message: "Collector does not exist" });
    if (collector.status !== "active") return reply.code(400).send({ message: "Collector is not active" });

    // Snapshot the collector's route: every assigned account with a balance
    // due right now. This is the batch's expected receivable, fixed at open.
    const assigned = await db
      .select({ id: serviceAccounts.id })
      .from(serviceAccounts)
      .where(and(eq(serviceAccounts.assignedCollectorId, collector.id), inArray(serviceAccounts.status, ["active", "suspended"])));
    const route: Array<{ serviceAccountId: number; balanceCents: bigint }> = [];
    for (const acc of assigned) {
      const rows = await getInvoiceBalances({ serviceAccountId: acc.id });
      const due = rows.reduce((t, r) => (r.balanceCents > 0n ? t + r.balanceCents : t), 0n);
      if (due > 0n) route.push({ serviceAccountId: acc.id, balanceCents: due });
    }
    const expectedReceivable = route.reduce((t, r) => t + r.balanceCents, 0n);

    const batch = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(collectionBatches)
        .values({
          collectorId: collector.id,
          batchDate: new Date(parsed.data.batchDate),
          status: "open",
          expectedAmount: "0.00",
          remittedAmount: "0.00",
          shortageAmount: "0.00",
          overageAmount: "0.00",
          expectedReceivable: formatCents(expectedReceivable),
        })
        .returning();
      for (const r of route) {
        await tx.insert(collectionBatchAccounts).values({
          batchId: created!.id,
          serviceAccountId: r.serviceAccountId,
          balanceDue: formatCents(r.balanceCents),
        });
      }
      await tx.insert(auditLogs).values({
        actorUserId: request.currentUser!.id,
        action: "collection_batch.create",
        entityType: "collection_batch",
        entityId: created!.id,
        metadata: {
          collectorId: collector.id,
          batchDate: parsed.data.batchDate,
          routeAccounts: route.length,
          expectedReceivable: formatCents(expectedReceivable),
        },
      });
      return created!;
    });

    return reply.code(201).send({ data: batch });
  });

  app.patch("/api/v1/collection-batches/:id", { preHandler: [authenticate, requirePermission("collection.manage_batches")] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid batch ID" });
    const parsed = patchBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid update data", issues: parsed.error.issues });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ message: "No fields to update" });

    const [batch] = await db.select().from(collectionBatches).where(eq(collectionBatches.id, params.data.id)).limit(1);
    if (!batch) return reply.code(404).send({ message: "Collection batch not found" });
    if (!COLLECTING.includes(batch.status)) return reply.code(409).send({ message: "Only open or in-progress batches can be modified" });

    const [updated] = await db
      .update(collectionBatches)
      .set(parsed.data.batchDate ? { batchDate: new Date(parsed.data.batchDate) } : {})
      .where(eq(collectionBatches.id, batch.id))
      .returning();
    return reply.send({ data: updated });
  });

  app.post("/api/v1/collection-batches/:id/payments", { preHandler: [authenticate, requirePermission("collection.manage_batches")] }, async (request, reply) => {
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
        if (!COLLECTING.includes(batch.status)) {
          throw new CollectionStateError("Payments can only be added while the batch is open or in progress");
        }

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

        // Authoritative expected cash from the batch's posted cash payments.
        const expected = await computeExpectedCents(tx, batch.id);

        // The first recorded collection moves the batch into the field.
        const [updated] = await tx
          .update(collectionBatches)
          .set({ expectedAmount: formatCents(expected), status: "in_progress" })
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

  app.post("/api/v1/collection-batches/:id/remit", { preHandler: [authenticate, requirePermission("collection.reconcile")] }, async (request, reply) => {
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
        if (![...COLLECTING, "submitted"].includes(batch.status)) {
          throw new CollectionStateError("Batch has already been remitted or reconciled");
        }

        const expectedCents = await computeExpectedCents(tx, batch.id);

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
            submittedAt: batch.submittedAt ?? new Date(),
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

  app.post("/api/v1/collection-batches/:id/submit", { preHandler: [authenticate, requirePermission("collection.manage_batches")] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid batch ID" });

    try {
      const result = await db.transaction(async (tx) => {
        const [batch] = await tx.select().from(collectionBatches).where(eq(collectionBatches.id, params.data.id)).for("update").limit(1);
        if (!batch) throw new CollectionNotFoundError();
        if (!COLLECTING.includes(batch.status)) {
          throw new CollectionStateError(`Only an open or in-progress batch can be submitted (current status: "${batch.status}")`);
        }
        const expected = await computeExpectedCents(tx, batch.id);
        const [updated] = await tx
          .update(collectionBatches)
          .set({ status: "submitted", submittedAt: new Date(), expectedAmount: formatCents(expected) })
          .where(eq(collectionBatches.id, batch.id))
          .returning();
        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "collection_batch.submit",
          entityType: "collection_batch",
          entityId: batch.id,
          metadata: { oldStatus: batch.status, newStatus: "submitted", expectedCash: formatCents(expected) },
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

  app.post("/api/v1/collection-batches/:id/reconcile", { preHandler: [authenticate, requirePermission("collection.reconcile")] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid batch ID" });
    const body = reconcileSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ message: "Invalid reconciliation data", issues: body.error.issues });

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
        if (outcome !== "balanced" && (!body.data.acknowledgeDifference || !body.data.notes)) {
          throw new DifferenceNotAcknowledgedError(
            `This batch has a ${outcome} of ${formatCents(shortage > 0n ? shortage : overage)}. Acknowledge the difference and record an explanation to reconcile it.`,
          );
        }

        const [updated] = await tx
          .update(collectionBatches)
          .set({
            status: "reconciled",
            reconciledAt: new Date(),
            reconciledByUserId: request.currentUser!.id,
            ...(body.data.notes ? { reconciliationNotes: body.data.notes } : {}),
          })
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
            notes: body.data.notes ?? null,
          },
        });

        return updated!;
      });

      return reply.send({ data: result });
    } catch (err) {
      if (err instanceof CollectionNotFoundError) return reply.code(404).send({ message: "Collection batch not found" });
      if (err instanceof CollectionStateError) return reply.code(409).send({ message: err.message });
      if (err instanceof DifferenceNotAcknowledgedError) return reply.code(409).send({ message: err.message, requiresAcknowledgement: true });
      throw err;
    }
  });

  app.post("/api/v1/collection-batches/:id/close", { preHandler: [authenticate, requirePermission("collection.close")] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid batch ID" });
    const body = closeSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ message: "Closing a batch requires explicit confirmation (confirm: true)" });

    try {
      const result = await db.transaction(async (tx) => {
        const [batch] = await tx.select().from(collectionBatches).where(eq(collectionBatches.id, params.data.id)).for("update").limit(1);
        if (!batch) throw new CollectionNotFoundError();
        if (batch.status !== "reconciled") {
          throw new CollectionStateError(`Only a reconciled batch can be closed (current status: "${batch.status}")`);
        }
        const [updated] = await tx
          .update(collectionBatches)
          .set({ status: "closed", closedAt: new Date(), closedByUserId: request.currentUser!.id, closingNotes: body.data.notes ?? null })
          .where(eq(collectionBatches.id, batch.id))
          .returning();
        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "collection_batch.close",
          entityType: "collection_batch",
          entityId: batch.id,
          metadata: {
            reconciledByUserId: batch.reconciledByUserId,
            shortageAmount: batch.shortageAmount,
            overageAmount: batch.overageAmount,
            notes: body.data.notes ?? null,
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
