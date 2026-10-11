import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs,
  gcashPaymentDetails,
  invoices,
  paymentAllocations,
  paymentReversals,
  payments,
  serviceAccounts,
} from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";
import { formatCents, parseMoneyToCents } from "../lib/money";
import { deriveInvoiceStatus, isInvoiceOpen, refreshInvoiceStatus } from "../lib/invoice-status";

const READ_ROLES = [
  ROLE_NAMES.OWNER,
  ROLE_NAMES.ADMINISTRATOR,
  ROLE_NAMES.CASHIER,
  ROLE_NAMES.COLLECTION_SUPERVISOR,
  ROLE_NAMES.ACCOUNTING_AUDITOR,
  ROLE_NAMES.TECHNICIAN,
  ROLE_NAMES.READ_ONLY_VIEWER,
];
const POST_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.CASHIER];
const REVERSE_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.ACCOUNTING_AUDITOR];
// GCash verification/rejection is a financial-integrity gate kept separate
// from day-to-day cashiering: Cashiers (POST_ROLES) can submit a GCash
// payment but cannot decide it themselves. Currently the same roster as
// REVERSE_ROLES, named distinctly since the two authorities are conceptually
// different even though they coincide today.
const VERIFY_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.ACCOUNTING_AUDITOR];

const PAYMENT_METHODS = ["cash", "gcash", "bank_transfer", "cheque", "other"] as const;

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const moneyString = z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount");

const createPaymentSchema = z.object({
  serviceAccountId: z.number().int().positive(),
  amount: moneyString,
  method: z.enum(PAYMENT_METHODS),
  paymentDate: dateString.optional(),
  receiptNumber: z.string().trim().max(50).optional(),
  referenceNumber: z.string().trim().max(100).optional(),
  // Non-GCash proof-of-payment reference only; GCash payments carry their
  // own proofAttachmentPath inside the gcash object below.
  proofAttachmentPath: z.string().trim().max(500).optional(),
  gcash: z
    .object({
      gcashReferenceNumber: z.string().trim().min(1).max(100),
      proofAttachmentPath: z.string().trim().max(500).optional(),
    })
    .strict()
    .optional(),
}).strict();

const reversalSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
}).strict();

const verifySchema = z.object({
  note: z.string().trim().max(2000).optional(),
}).strict();

const rejectSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
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

// Next official-receipt number from a database sequence: unique across all
// PCs, and a number is never handed out twice even if its payment is later
// reversed or its transaction rolls back.
async function nextReceiptNumber(tx: Tx): Promise<string> {
  const result = await tx.execute<{ n: string }>(sql`select nextval('receipt_number_seq')::text as n`);
  return `OR-${result.rows[0]!.n}`;
}

// Shared oldest-first allocation algorithm used both when a non-GCash
// payment is posted immediately and when a GCash payment is verified.
// Only ever allocates against invoices using posted-payment allocations as
// the balance basis — pending/cancelled payments never contribute, so a
// GCash submission that hasn't been decided yet cannot affect this.
async function allocateToOpenInvoices(
  tx: Tx,
  serviceAccountId: number,
  amountCents: bigint,
): Promise<{
  allocationsToInsert: Array<{ invoiceId: number; amount: string }>;
  invoiceStatusUpdates: Map<number, string>;
  remainingCents: bigint;
}> {
  const openInvoices = await tx
    .select()
    .from(invoices)
    .where(eq(invoices.serviceAccountId, serviceAccountId))
    .orderBy(asc(invoices.issueDate), asc(invoices.id));

  const candidates = openInvoices.filter((inv) => isInvoiceOpen(inv.status));

  let remaining = amountCents;
  const allocationsToInsert: Array<{ invoiceId: number; amount: string }> = [];
  const invoiceStatusUpdates = new Map<number, string>();

  for (const inv of candidates) {
    if (remaining <= 0n) break;
    const [allocRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${paymentAllocations.amount}), 0)::numeric(14,2)` })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(and(eq(paymentAllocations.invoiceId, inv.id), eq(payments.status, "posted")));
    const allocated = parseMoneyToCents(allocRow?.total ?? "0") ?? 0n;
    const balance = (parseMoneyToCents(inv.totalAmount) ?? 0n) - allocated;
    if (balance <= 0n) {
      // Stale status — normalize and skip.
      if (inv.status !== "paid") {
        await tx.update(invoices).set({ status: "paid" }).where(eq(invoices.id, inv.id));
      }
      continue;
    }
    const applied = remaining < balance ? remaining : balance;
    allocationsToInsert.push({ invoiceId: inv.id, amount: formatCents(applied) });
    const newBalance = balance - applied;
    invoiceStatusUpdates.set(
      inv.id,
      newBalance === 0n ? "paid" : deriveInvoiceStatus(balance + allocated, allocated + applied, inv.dueDate),
    );
    remaining -= applied;
  }

  return { allocationsToInsert, invoiceStatusUpdates, remainingCents: remaining };
}

export default async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/payments", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      serviceAccountId: z.coerce.number().int().positive().optional(),
      status: z.enum(["pending", "posted", "reversed", "cancelled"]).optional(),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const { page, pageSize, serviceAccountId, status } = query.data;

    const conditions = [];
    if (serviceAccountId) conditions.push(eq(payments.serviceAccountId, serviceAccountId));
    if (status) conditions.push(eq(payments.status, status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(payments).where(where);
    const total = totalRow?.count ?? 0;

    const data = await db
      .select()
      .from(payments)
      .where(where)
      .orderBy(desc(payments.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return reply.send({
      data,
      pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) },
    });
  });

  app.get("/api/v1/payments/:id", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid payment ID" });

    const [payment] = await db.select().from(payments).where(eq(payments.id, params.data.id)).limit(1);
    if (!payment) return reply.code(404).send({ message: "Payment not found" });

    const allocations = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id));
    const [reversal] = await db.select().from(paymentReversals).where(eq(paymentReversals.paymentId, payment.id)).limit(1);
    const [gcash] = await db.select().from(gcashPaymentDetails).where(eq(gcashPaymentDetails.paymentId, payment.id)).limit(1);

    const allocatedCents = allocations.reduce((acc, a) => acc + (parseMoneyToCents(a.amount) ?? 0n), 0n);
    const unappliedCents = (parseMoneyToCents(payment.amount) ?? 0n) - allocatedCents;

    return reply.send({
      data: {
        ...payment,
        allocations,
        reversal: reversal ?? null,
        gcash: gcash ?? null,
        unappliedAmount: formatCents(unappliedCents < 0n ? 0n : unappliedCents),
      },
    });
  });

  app.post("/api/v1/payments", { preHandler: [authenticate, requireRoles(...POST_ROLES)] }, async (request, reply) => {
    const parsed = createPaymentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid payment data", issues: parsed.error.issues });

    const amountCents = parseMoneyToCents(parsed.data.amount);
    if (amountCents === null || amountCents <= 0n) {
      return reply.code(400).send({ message: "Amount must be a positive amount with up to 2 decimal places" });
    }
    if (parsed.data.method === "gcash" && !parsed.data.gcash) {
      return reply.code(400).send({ message: "gcash.gcashReferenceNumber is required for GCash payments" });
    }
    if (parsed.data.method === "gcash" && parsed.data.proofAttachmentPath) {
      return reply.code(400).send({ message: "Use gcash.proofAttachmentPath for GCash payments" });
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Lock the service account row so concurrent payments to the same
        // account serialize their allocation decisions.
        const [account] = await tx
          .select({ id: serviceAccounts.id })
          .from(serviceAccounts)
          .where(eq(serviceAccounts.id, parsed.data.serviceAccountId))
          .for("update")
          .limit(1);
        if (!account) {
          throw new PaymentInputError("Service account does not exist");
        }

        const isGcash = parsed.data.method === "gcash";

        // GCash submissions are held pending: no allocation or invoice
        // balance change happens until an authorized reviewer verifies them
        // via POST /payments/:id/verify (or rejects via .../reject). Every
        // other method is treated as confirmed in-hand and posted/allocated
        // immediately, exactly as before.
        const { allocationsToInsert, invoiceStatusUpdates, remainingCents } = isGcash
          ? {
              allocationsToInsert: [] as Array<{ invoiceId: number; amount: string }>,
              invoiceStatusUpdates: new Map<number, string>(),
              remainingCents: amountCents,
            }
          : await allocateToOpenInvoices(tx, account.id, amountCents);

        const [payment] = await tx
          .insert(payments)
          .values({
            serviceAccountId: account.id,
            method: parsed.data.method,
            amount: formatCents(amountCents),
            paymentDate: parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : new Date(),
            // A receipt is issued when money is confirmed in hand; a pending
            // GCash submission gets its number on verification instead.
            receiptNumber: parsed.data.receiptNumber ?? (isGcash ? null : await nextReceiptNumber(tx)),
            referenceNumber: parsed.data.referenceNumber ?? null,
            proofAttachmentPath: isGcash ? null : (parsed.data.proofAttachmentPath ?? null),
            status: isGcash ? "pending" : "posted",
            postedByUserId: request.currentUser!.id,
          })
          .returning();

        for (const alloc of allocationsToInsert) {
          await tx.insert(paymentAllocations).values({
            paymentId: payment!.id,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
          });
          const newStatus = invoiceStatusUpdates.get(alloc.invoiceId)! as typeof invoices.$inferSelect.status;
          await tx.update(invoices).set({ status: newStatus }).where(eq(invoices.id, alloc.invoiceId));
        }

        if (isGcash && parsed.data.gcash) {
          await tx.insert(gcashPaymentDetails).values({
            paymentId: payment!.id,
            gcashReferenceNumber: parsed.data.gcash.gcashReferenceNumber,
            proofAttachmentPath: parsed.data.gcash.proofAttachmentPath ?? null,
            verificationStatus: "pending",
          });
        }

        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: isGcash ? "payment.gcash_submit" : "payment.post",
          entityType: "payment",
          entityId: payment!.id,
          metadata: {
            method: parsed.data.method,
            amount: formatCents(amountCents),
            serviceAccountId: account.id,
            unappliedAmount: formatCents(remainingCents),
            allocations: allocationsToInsert,
          },
        });

        return { payment: payment!, allocations: allocationsToInsert, unappliedCents: remainingCents };
      });

      return reply.code(201).send({
        data: {
          ...result.payment,
          allocations: result.allocations,
          unappliedAmount: formatCents(result.unappliedCents),
        },
      });
    } catch (err) {
      if (err instanceof PaymentInputError) {
        return reply.code(400).send({ message: err.message });
      }
      if (isConflict(err)) {
        return reply.code(409).send({ message: "Duplicate receipt number or GCash reference" });
      }
      throw err;
    }
  });

  app.post("/api/v1/payments/:id/verify", { preHandler: [authenticate, requireRoles(...VERIFY_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid payment ID" });
    const parsed = verifySchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ message: "Invalid verification data", issues: parsed.error.issues });

    try {
      const result = await db.transaction(async (tx) => {
        const [payment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, params.data.id))
          .for("update")
          .limit(1);
        if (!payment) throw new PaymentNotFoundError();
        if (payment.method !== "gcash") {
          throw new GcashMethodError("Only GCash payments require verification");
        }
        if (payment.status !== "pending") {
          throw new GcashStateError(`Payment is not pending verification (current status: "${payment.status}")`);
        }
        // Separation of duties: the reviewer may not be the same user who
        // submitted the payment, regardless of role.
        if (payment.postedByUserId === request.currentUser!.id) {
          throw new SelfReviewError("You cannot verify a payment you submitted yourself");
        }

        const [gcash] = await tx
          .select()
          .from(gcashPaymentDetails)
          .where(eq(gcashPaymentDetails.paymentId, payment.id))
          .for("update")
          .limit(1);
        if (!gcash) throw new GcashMethodError("GCash details not found for this payment");
        if (gcash.verificationStatus !== "pending") {
          throw new GcashStateError("This GCash submission has already been decided");
        }

        // Lock the service account to serialize with any concurrent
        // posting/verification affecting the same account's invoices.
        const [account] = await tx
          .select({ id: serviceAccounts.id })
          .from(serviceAccounts)
          .where(eq(serviceAccounts.id, payment.serviceAccountId))
          .for("update")
          .limit(1);
        if (!account) throw new PaymentInputError("Service account no longer exists");

        const amountCents = parseMoneyToCents(payment.amount) ?? 0n;
        const { allocationsToInsert, invoiceStatusUpdates, remainingCents } = await allocateToOpenInvoices(
          tx,
          account.id,
          amountCents,
        );

        const [updatedPayment] = await tx
          .update(payments)
          .set({ status: "posted", postedAt: new Date(), receiptNumber: payment.receiptNumber ?? (await nextReceiptNumber(tx)) })
          .where(eq(payments.id, payment.id))
          .returning();

        for (const alloc of allocationsToInsert) {
          await tx.insert(paymentAllocations).values({
            paymentId: payment.id,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
          });
          const newStatus = invoiceStatusUpdates.get(alloc.invoiceId)! as typeof invoices.$inferSelect.status;
          await tx.update(invoices).set({ status: newStatus }).where(eq(invoices.id, alloc.invoiceId));
        }

        await tx
          .update(gcashPaymentDetails)
          .set({
            verificationStatus: "verified",
            verifiedByUserId: request.currentUser!.id,
            verifiedAt: new Date(),
            verificationNote: parsed.data.note ?? null,
          })
          .where(eq(gcashPaymentDetails.paymentId, payment.id));

        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "payment.gcash_verify",
          entityType: "payment",
          entityId: payment.id,
          metadata: {
            submittedByUserId: payment.postedByUserId,
            amount: payment.amount,
            unappliedAmount: formatCents(remainingCents),
            allocations: allocationsToInsert,
            note: parsed.data.note ?? null,
          },
        });

        return { payment: updatedPayment!, allocations: allocationsToInsert, unappliedCents: remainingCents };
      });

      return reply.send({
        data: {
          ...result.payment,
          allocations: result.allocations,
          unappliedAmount: formatCents(result.unappliedCents),
        },
      });
    } catch (err) {
      if (err instanceof PaymentNotFoundError) return reply.code(404).send({ message: "Payment not found" });
      if (err instanceof GcashMethodError) return reply.code(400).send({ message: err.message });
      if (err instanceof GcashStateError) return reply.code(409).send({ message: err.message });
      if (err instanceof SelfReviewError) return reply.code(403).send({ message: err.message });
      if (err instanceof PaymentInputError) return reply.code(400).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/payments/:id/reject", { preHandler: [authenticate, requireRoles(...VERIFY_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid payment ID" });
    const parsed = rejectSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "A reason is required to reject a GCash payment" });

    try {
      const result = await db.transaction(async (tx) => {
        const [payment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, params.data.id))
          .for("update")
          .limit(1);
        if (!payment) throw new PaymentNotFoundError();
        if (payment.method !== "gcash") {
          throw new GcashMethodError("Only GCash payments can be rejected");
        }
        if (payment.status !== "pending") {
          throw new GcashStateError(`Payment is not pending a decision (current status: "${payment.status}")`);
        }
        if (payment.postedByUserId === request.currentUser!.id) {
          throw new SelfReviewError("You cannot reject a payment you submitted yourself");
        }

        const [gcash] = await tx
          .select()
          .from(gcashPaymentDetails)
          .where(eq(gcashPaymentDetails.paymentId, payment.id))
          .for("update")
          .limit(1);
        if (!gcash) throw new GcashMethodError("GCash details not found for this payment");
        if (gcash.verificationStatus !== "pending") {
          throw new GcashStateError("This GCash submission has already been decided");
        }

        // No allocations were ever created for a pending GCash payment, so
        // rejection is a pure status change — nothing to roll back.
        await tx.update(payments).set({ status: "cancelled" }).where(eq(payments.id, payment.id));

        await tx
          .update(gcashPaymentDetails)
          .set({
            verificationStatus: "rejected",
            verifiedByUserId: request.currentUser!.id,
            verifiedAt: new Date(),
            verificationNote: parsed.data.reason,
          })
          .where(eq(gcashPaymentDetails.paymentId, payment.id));

        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "payment.gcash_reject",
          entityType: "payment",
          entityId: payment.id,
          metadata: { submittedByUserId: payment.postedByUserId, reason: parsed.data.reason },
        });

        return payment.id;
      });

      return reply.send({ data: { paymentId: result, status: "cancelled" } });
    } catch (err) {
      if (err instanceof PaymentNotFoundError) return reply.code(404).send({ message: "Payment not found" });
      if (err instanceof GcashMethodError) return reply.code(400).send({ message: err.message });
      if (err instanceof GcashStateError) return reply.code(409).send({ message: err.message });
      if (err instanceof SelfReviewError) return reply.code(403).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/payments/:id/reverse", { preHandler: [authenticate, requireRoles(...REVERSE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid payment ID" });
    const parsed = reversalSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "A reason is required for reversal" });

    try {
      const result = await db.transaction(async (tx) => {
        const [payment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, params.data.id))
          .for("update")
          .limit(1);
        if (!payment) throw new ReversalNotFoundError();
        // Only a posted (confirmed) payment can be reversed. A pending
        // GCash submission has no allocations to undo — use reject instead
        // — and an already-reversed or rejected/cancelled payment cannot be
        // reversed again.
        if (payment.status !== "posted") {
          throw new ReversalConflictError(`Only posted payments can be reversed (current status: "${payment.status}")`);
        }

        // Lock the account row to serialize with concurrent postings.
        await tx
          .select({ id: serviceAccounts.id })
          .from(serviceAccounts)
          .where(eq(serviceAccounts.id, payment.serviceAccountId))
          .for("update")
          .limit(1);

        const [existingReversal] = await tx
          .select({ id: paymentReversals.id })
          .from(paymentReversals)
          .where(eq(paymentReversals.paymentId, payment.id))
          .limit(1);
        if (existingReversal) throw new ReversalConflictError("Payment has already been reversed");

        const allocations = await tx
          .select()
          .from(paymentAllocations)
          .where(eq(paymentAllocations.paymentId, payment.id));

        await tx.insert(paymentReversals).values({
          paymentId: payment.id,
          reason: parsed.data.reason,
          reversedByUserId: request.currentUser!.id,
        });
        await tx.update(payments).set({ status: "reversed" }).where(eq(payments.id, payment.id));

        // Recalculate each affected invoice from remaining posted allocations.
        const affectedIds = [...new Set(allocations.map((a) => a.invoiceId))];
        for (const invoiceId of affectedIds) {
          await refreshInvoiceStatus(tx, invoiceId);
        }

        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "payment.reverse",
          entityType: "payment",
          entityId: payment.id,
          metadata: { reason: parsed.data.reason, reversedAllocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) },
        });

        return payment.id;
      });

      return reply.send({ data: { paymentId: result, status: "reversed" } });
    } catch (err) {
      if (err instanceof ReversalNotFoundError) return reply.code(404).send({ message: "Payment not found" });
      if (err instanceof ReversalConflictError) return reply.code(409).send({ message: err.message });
      if (isConflict(err)) return reply.code(409).send({ message: "Payment has already been reversed" });
      throw err;
    }
  });
}

class PaymentInputError extends Error {}
class ReversalNotFoundError extends Error {}
class ReversalConflictError extends Error {}
class PaymentNotFoundError extends Error {}
class GcashMethodError extends Error {}
class GcashStateError extends Error {}
class SelfReviewError extends Error {}
