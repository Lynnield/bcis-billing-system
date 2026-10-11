import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gt, ilike, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs,
  billingPeriods,
  invoices,
  invoiceAdjustments,
  invoiceLineItems,
  reconnectionRecords,
  serviceAccounts,
  servicePlans,
  services,
  subscribers,
} from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";
import { formatCents, parseMoneyToCents } from "../lib/money";
import {
  deriveInvoiceStatus,
  markOverdueInvoices,
  postedAllocatedCents,
  refreshInvoiceStatus,
  todayDate,
} from "../lib/invoice-status";

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
// Voids and post-issue adjustments are financial corrections, reviewed by
// Accounting alongside payment reversals.
const ADJUST_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.ACCOUNTING_AUDITOR];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const INVOICE_STATUSES = ["draft", "unpaid", "partially_paid", "paid", "overdue", "void", "credited"] as const;

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const moneyString = z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount");

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  serviceAccountId: z.coerce.number().int().positive().optional(),
  subscriberId: z.coerce.number().int().positive().optional(),
  billingPeriodId: z.coerce.number().int().positive().optional(),
  invoiceNumber: z.string().trim().max(50).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
});

const createInvoiceSchema = z.object({
  serviceAccountId: z.number().int().positive(),
  billingPeriodId: z.number().int().positive(),
  // Omit to have the server assign the next INV- number.
  invoiceNumber: z.string().trim().min(1).max(50).optional(),
  asDraft: z.boolean().optional(),
  issueDate: dateString.optional(),
  dueDate: dateString.optional(),
  quantity: z.number().int().min(1).max(999).optional(),
  additionalLineItems: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(255),
        quantity: z.number().int().min(1).max(999),
        unitPrice: moneyString,
      }).strict(),
    )
    .max(50)
    .optional(),
  adjustments: z
    .array(
      z.object({
        type: z.enum(["debit", "credit"]),
        amount: moneyString,
        reason: z.string().trim().min(1).max(1000),
      }).strict(),
    )
    .max(50)
    .optional(),
}).strict();

const voidSchema = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();

const adjustmentSchema = z.object({
  type: z.enum(["debit", "credit"]),
  amount: moneyString,
  reason: z.string().trim().min(1).max(1000),
}).strict();

function isConflict(err: unknown): boolean {
  let current: unknown = err;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function getInvoiceDetail(id: number) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!inv) return null;

  const [context] = await db
    .select({
      accountNumber: subscribers.accountNumber,
      subscriberId: subscribers.id,
      firstName: subscribers.firstName,
      lastName: subscribers.lastName,
      serviceNumber: serviceAccounts.serviceNumber,
      planName: servicePlans.name,
      serviceName: services.name,
      periodLabel: billingPeriods.label,
    })
    .from(invoices)
    .innerJoin(serviceAccounts, eq(serviceAccounts.id, invoices.serviceAccountId))
    .innerJoin(subscribers, eq(subscribers.id, serviceAccounts.subscriberId))
    .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
    .innerJoin(services, eq(services.id, servicePlans.serviceId))
    .innerJoin(billingPeriods, eq(billingPeriods.id, invoices.billingPeriodId))
    .where(eq(invoices.id, id))
    .limit(1);

  const lineItems = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id)).orderBy(invoiceLineItems.id);
  const adjustments = await db.select().from(invoiceAdjustments).where(eq(invoiceAdjustments.invoiceId, id)).orderBy(invoiceAdjustments.id);

  const lineTotal = lineItems.reduce((acc, li) => acc + (parseMoneyToCents(li.amount) ?? 0n), 0n);
  const debitTotal = adjustments.reduce((acc, a) => (a.type === "debit" ? acc + (parseMoneyToCents(a.amount) ?? 0n) : acc), 0n);
  const creditTotal = adjustments.reduce((acc, a) => (a.type === "credit" ? acc + (parseMoneyToCents(a.amount) ?? 0n) : acc), 0n);

  return {
    ...inv,
    context,
    lineItems,
    adjustments,
    subtotal: formatCents(lineTotal),
    adjustmentsTotal: formatCents(debitTotal - creditTotal),
  };
}

export default async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/invoices", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const { page, pageSize, serviceAccountId, subscriberId, billingPeriodId, invoiceNumber, status } = parsed.data;

    const conditions = [];
    if (serviceAccountId) conditions.push(eq(invoices.serviceAccountId, serviceAccountId));
    if (subscriberId) conditions.push(eq(serviceAccounts.subscriberId, subscriberId));
    if (billingPeriodId) conditions.push(eq(invoices.billingPeriodId, billingPeriodId));
    if (invoiceNumber) conditions.push(ilike(invoices.invoiceNumber, `%${invoiceNumber}%`));
    if (status) conditions.push(eq(invoices.status, status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .innerJoin(serviceAccounts, eq(serviceAccounts.id, invoices.serviceAccountId))
      .where(where);
    const total = totalRow?.count ?? 0;

    const data = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        totalAmount: invoices.totalAmount,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        serviceAccountId: invoices.serviceAccountId,
        billingPeriodId: invoices.billingPeriodId,
        subscriberId: serviceAccounts.subscriberId,
      })
      .from(invoices)
      .innerJoin(serviceAccounts, eq(serviceAccounts.id, invoices.serviceAccountId))
      .where(where)
      .orderBy(desc(invoices.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return reply.send({
      data,
      pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) },
    });
  });

  app.get("/api/v1/invoices/:id", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid invoice ID" });
    const detail = await getInvoiceDetail(params.data.id);
    if (!detail) return reply.code(404).send({ message: "Invoice not found" });
    return reply.send({ data: detail });
  });


  app.post("/api/v1/invoices", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const parsed = createInvoiceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid invoice data", issues: parsed.error.issues });

    try {
      const createdId = await db.transaction((tx) => createInvoiceTx(tx, parsed.data, request.currentUser!.id));
      const detail = await getInvoiceDetail(createdId);
      return reply.code(201).send({ data: detail });
    } catch (err) {
      if (err instanceof InvoiceInputError) return reply.code(400).send({ message: err.message });
      if (err instanceof BillingConflictError) return reply.code(409).send({ message: err.message });
      if (isConflict(err)) {
        return reply.code(409).send({ message: "Duplicate invoice number, or an invoice already exists for this service account and billing period" });
      }
      throw err;
    }
  });

  app.post("/api/v1/invoices/mark-overdue", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const changed = await markOverdueInvoices();
    await db.insert(auditLogs).values({
      actorUserId: request.currentUser!.id,
      action: "invoice.mark_overdue",
      entityType: "invoice",
      entityId: null,
      metadata: { changed },
    });
    return reply.send({ data: { changed } });
  });

  app.post("/api/v1/invoices/:id/finalize", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid invoice ID" });

    try {
      await db.transaction(async (tx) => {
        const [inv] = await tx.select().from(invoices).where(eq(invoices.id, params.data.id)).for("update").limit(1);
        if (!inv) throw new InvoiceNotFoundError();
        if (inv.status !== "draft") throw new InvoiceStateError(`Only draft invoices can be finalized (current status: "${inv.status}")`);
        const status = initialStatus(parseMoneyToCents(inv.totalAmount) ?? 0n, inv.dueDate);
        await tx.update(invoices).set({ status, finalizedAt: new Date() }).where(eq(invoices.id, inv.id));
        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "invoice.finalize",
          entityType: "invoice",
          entityId: inv.id,
          metadata: { oldStatus: inv.status, newStatus: status, totalAmount: inv.totalAmount },
        });
      });
      return reply.send({ data: await getInvoiceDetail(params.data.id) });
    } catch (err) {
      if (err instanceof InvoiceNotFoundError) return reply.code(404).send({ message: "Invoice not found" });
      if (err instanceof InvoiceStateError) return reply.code(409).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/invoices/:id/void", { preHandler: [authenticate, requireRoles(...ADJUST_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid invoice ID" });
    const parsed = voidSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "A reason is required to void an invoice" });

    try {
      await db.transaction(async (tx) => {
        const [inv] = await tx.select().from(invoices).where(eq(invoices.id, params.data.id)).for("update").limit(1);
        if (!inv) throw new InvoiceNotFoundError();
        if (inv.status === "void") throw new InvoiceStateError("Invoice is already void");
        // Serialize with payment posting on the same account.
        await tx.select({ id: serviceAccounts.id }).from(serviceAccounts).where(eq(serviceAccounts.id, inv.serviceAccountId)).for("update");
        const allocated = await postedAllocatedCents(tx, inv.id);
        if (allocated > 0n) {
          throw new InvoiceStateError(
            `Invoice has ${formatCents(allocated)} in posted payments applied; reverse those payments before voiding it`,
          );
        }
        await tx
          .update(invoices)
          .set({ status: "void", voidReason: parsed.data.reason, voidedByUserId: request.currentUser!.id, voidedAt: new Date() })
          .where(eq(invoices.id, inv.id));
        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "invoice.void",
          entityType: "invoice",
          entityId: inv.id,
          metadata: { reason: parsed.data.reason, oldStatus: inv.status, newStatus: "void", totalAmount: inv.totalAmount },
        });
      });
      return reply.send({ data: await getInvoiceDetail(params.data.id) });
    } catch (err) {
      if (err instanceof InvoiceNotFoundError) return reply.code(404).send({ message: "Invoice not found" });
      if (err instanceof InvoiceStateError) return reply.code(409).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/invoices/:id/adjustments", { preHandler: [authenticate, requireRoles(...ADJUST_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid invoice ID" });
    const parsed = adjustmentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid adjustment data", issues: parsed.error.issues });
    const amountCents = parseMoneyToCents(parsed.data.amount);
    if (amountCents === null || amountCents <= 0n) return reply.code(400).send({ message: "Adjustment amount must be positive" });

    try {
      await db.transaction(async (tx) => {
        const [inv] = await tx.select().from(invoices).where(eq(invoices.id, params.data.id)).for("update").limit(1);
        if (!inv) throw new InvoiceNotFoundError();
        if (inv.status === "void") throw new InvoiceStateError("A void invoice cannot be adjusted");
        await tx.select({ id: serviceAccounts.id }).from(serviceAccounts).where(eq(serviceAccounts.id, inv.serviceAccountId)).for("update");

        const oldTotal = parseMoneyToCents(inv.totalAmount) ?? 0n;
        const allocated = await postedAllocatedCents(tx, inv.id);
        const newTotal = parsed.data.type === "debit" ? oldTotal + amountCents : oldTotal - amountCents;
        if (newTotal < allocated) {
          throw new InvoiceInputError(`Credit exceeds the invoice's open balance of ${formatCents(oldTotal - allocated)}`);
        }

        await tx.insert(invoiceAdjustments).values({
          invoiceId: inv.id,
          type: parsed.data.type,
          amount: formatCents(amountCents),
          reason: parsed.data.reason,
          postIssue: inv.status !== "draft",
          createdByUserId: request.currentUser!.id,
        });
        await tx.update(invoices).set({ totalAmount: formatCents(newTotal) }).where(eq(invoices.id, inv.id));
        const newStatus = inv.status === "draft" ? "draft" : await refreshInvoiceStatus(tx, inv.id);

        await tx.insert(auditLogs).values({
          actorUserId: request.currentUser!.id,
          action: "invoice.adjust",
          entityType: "invoice",
          entityId: inv.id,
          metadata: {
            type: parsed.data.type,
            amount: formatCents(amountCents),
            reason: parsed.data.reason,
            old: { totalAmount: formatCents(oldTotal), status: inv.status },
            new: { totalAmount: formatCents(newTotal), status: newStatus },
          },
        });
      });
      return reply.code(201).send({ data: await getInvoiceDetail(params.data.id) });
    } catch (err) {
      if (err instanceof InvoiceNotFoundError) return reply.code(404).send({ message: "Invoice not found" });
      if (err instanceof InvoiceStateError) return reply.code(409).send({ message: err.message });
      if (err instanceof InvoiceInputError) return reply.code(400).send({ message: err.message });
      throw err;
    }
  });
}

// Status for a freshly finalized invoice with no payments yet.
function initialStatus(totalCents: bigint, dueDate: Date | string): "unpaid" | "overdue" | "paid" {
  const derived = deriveInvoiceStatus(totalCents, 0n, dueDate);
  return derived === "credited" ? "paid" : derived === "overdue" ? "overdue" : "unpaid";
}

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/**
 * Creates one invoice (plan line + extra lines + adjustments) inside the
 * caller's transaction, with the duplicate-period guard and an audit row.
 * Shared by POST /invoices and POST /billing-periods/:id/generate.
 */
export async function createInvoiceTx(tx: Tx, input: CreateInvoiceInput, actorUserId: number): Promise<number> {
  const [serviceAccount] = await tx
    .select({
      id: serviceAccounts.id,
      status: serviceAccounts.status,
      planId: serviceAccounts.planId,
      currentRate: serviceAccounts.currentRate,
      billingDueDay: serviceAccounts.billingDueDay,
      billingStartDate: serviceAccounts.billingStartDate,
    })
    .from(serviceAccounts)
    .where(eq(serviceAccounts.id, input.serviceAccountId))
    .limit(1);
  if (!serviceAccount) throw new InvoiceInputError("Service account does not exist");
  if (serviceAccount.status !== "active") throw new InvoiceInputError("Service account is not active");

  const [period] = await tx.select().from(billingPeriods).where(eq(billingPeriods.id, input.billingPeriodId)).limit(1);
  if (!period) throw new InvoiceInputError("Billing period does not exist");

  const [plan] = await tx.select().from(servicePlans).where(eq(servicePlans.id, serviceAccount.planId)).limit(1);
  if (!plan) throw new InvoiceInputError("Service plan no longer exists");
  if (plan.status !== "active") throw new InvoiceInputError("Service plan is not active");

  if (serviceAccount.billingStartDate && serviceAccount.billingStartDate > period.periodEnd) {
    throw new InvoiceInputError(`Billing for this account starts on ${serviceAccount.billingStartDate.toISOString().slice(0, 10)}`);
  }

  // An account-specific rate overrides the plan's current price.
  const rate = serviceAccount.currentRate ?? plan.price;
  const basePriceCents = parseMoneyToCents(rate);
  if (basePriceCents === null) throw new Error("Rate is not a valid amount");

  const quantity = input.quantity ?? 1;

  // The rate is copied onto the line item, so later plan price or rate
  // changes never alter an issued invoice (spec 3.3).
  const lineInputs: Array<{ description: string; quantity: number; unitPriceCents: bigint }> = [
    { description: serviceAccount.currentRate ? `${plan.name} (account rate)` : plan.name, quantity, unitPriceCents: basePriceCents },
  ];

  // One-time installation fee on the account's first invoice.
  const installationFeeCents = parseMoneyToCents(plan.installationFee) ?? 0n;
  if (installationFeeCents > 0n) {
    const [prior] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.serviceAccountId, serviceAccount.id), ne(invoices.status, "void")))
      .limit(1);
    if (!prior) lineInputs.push({ description: "Installation fee", quantity: 1, unitPriceCents: installationFeeCents });
  }

  // Reconnection fees from completed reconnections not yet billed (3.10).
  const unbilledReconnections = await tx
    .select({ id: reconnectionRecords.id, fee: reconnectionRecords.fee, completionDate: reconnectionRecords.completionDate })
    .from(reconnectionRecords)
    .where(
      and(
        eq(reconnectionRecords.serviceAccountId, serviceAccount.id),
        eq(reconnectionRecords.status, "completed"),
        isNull(reconnectionRecords.billedInvoiceId),
        gt(reconnectionRecords.fee, "0"),
      ),
    )
    .for("update");
  for (const r of unbilledReconnections) {
    lineInputs.push({
      description: `Reconnection fee${r.completionDate ? ` (${r.completionDate.toISOString().slice(0, 10)})` : ""}`,
      quantity: 1,
      unitPriceCents: parseMoneyToCents(r.fee) ?? 0n,
    });
  }
  for (const extra of input.additionalLineItems ?? []) {
    const extraCents = parseMoneyToCents(extra.unitPrice);
    if (extraCents === null) throw new InvoiceInputError("Invalid line item unit price");
    lineInputs.push({ description: extra.description, quantity: extra.quantity, unitPriceCents: extraCents });
  }

  let totalCents = 0n;
  for (const line of lineInputs) totalCents += line.unitPriceCents * BigInt(line.quantity);

  for (const adj of input.adjustments ?? []) {
    const adjCents = parseMoneyToCents(adj.amount);
    if (adjCents === null || adjCents === 0n) throw new InvoiceInputError("Invalid adjustment amount");
    totalCents += adj.type === "debit" ? adjCents : -adjCents;
  }
  if (totalCents < 0n) throw new InvoiceInputError("Invoice total cannot be negative");

  const issueDate = input.issueDate ?? todayDate();
  const dueDate = input.dueDate ?? accountDueDate(period.dueDate, serviceAccount.billingDueDay);

  // Atomic re-check of the duplicate guard inside the transaction; the
  // unique constraint is the backstop for the concurrent case.
  const [existing] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.serviceAccountId, serviceAccount.id), eq(invoices.billingPeriodId, period.id)))
    .limit(1);
  if (existing) throw new BillingConflictError("An invoice already exists for this service account and billing period");

  let invoiceNumber = input.invoiceNumber;
  if (!invoiceNumber) {
    const result = await tx.execute<{ n: string }>(sql`select nextval('invoice_number_seq')::text as n`);
    invoiceNumber = `INV-${result.rows[0]!.n}`;
  }

  const status = input.asDraft ? "draft" : initialStatus(totalCents, dueDate);

  const [invoice] = await tx
    .insert(invoices)
    .values({
      invoiceNumber,
      serviceAccountId: serviceAccount.id,
      billingPeriodId: period.id,
      issueDate: new Date(issueDate),
      dueDate: new Date(dueDate),
      status,
      totalAmount: formatCents(totalCents),
      finalizedAt: input.asDraft ? null : new Date(),
    })
    .returning({ id: invoices.id });

  for (const line of lineInputs) {
    await tx.insert(invoiceLineItems).values({
      invoiceId: invoice!.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: formatCents(line.unitPriceCents),
      amount: formatCents(line.unitPriceCents * BigInt(line.quantity)),
    });
  }

  if (unbilledReconnections.length > 0) {
    await tx
      .update(reconnectionRecords)
      .set({ billedInvoiceId: invoice!.id })
      .where(inArray(reconnectionRecords.id, unbilledReconnections.map((r) => r.id)));
  }

  for (const adj of input.adjustments ?? []) {
    await tx.insert(invoiceAdjustments).values({
      invoiceId: invoice!.id,
      type: adj.type,
      amount: adj.amount,
      reason: adj.reason,
      createdByUserId: actorUserId,
    });
  }

  await tx.insert(auditLogs).values({
    actorUserId,
    action: "invoice.create",
    entityType: "invoice",
    entityId: invoice!.id,
    metadata: { invoiceNumber, serviceAccountId: serviceAccount.id, billingPeriodId: period.id, status, totalAmount: formatCents(totalCents) },
  });

  return invoice!.id;
}

/** The period's due date, moved to the account's own due day in the same month. */
function accountDueDate(periodDue: Date, dueDay: number | null): string {
  const iso = periodDue.toISOString().slice(0, 10);
  if (!dueDay) return iso;
  return `${iso.slice(0, 8)}${String(dueDay).padStart(2, "0")}`;
}

export class BillingConflictError extends Error {}
export class InvoiceInputError extends Error {}
class InvoiceNotFoundError extends Error {}
class InvoiceStateError extends Error {}
