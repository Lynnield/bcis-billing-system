import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "../db";
import {
  billingPeriods,
  invoices,
  invoiceAdjustments,
  invoiceLineItems,
  serviceAccounts,
  servicePlans,
  services,
  subscribers,
} from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";
import { formatCents, parseMoneyToCents } from "../lib/money";

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

const INVOICE_STATUSES = ["unpaid", "partially_paid", "paid", "overdue", "void"] as const;

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
  invoiceNumber: z.string().trim().min(1).max(50),
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

    const account = await db
      .select({
        id: serviceAccounts.id,
        status: serviceAccounts.status,
        planId: serviceAccounts.planId,
      })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, parsed.data.serviceAccountId))
      .limit(1);
    const serviceAccount = account[0];
    if (!serviceAccount) return reply.code(400).send({ message: "Service account does not exist" });
    if (serviceAccount.status !== "active") return reply.code(400).send({ message: "Service account is not active" });

    const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.id, parsed.data.billingPeriodId)).limit(1);
    if (!period) return reply.code(400).send({ message: "Billing period does not exist" });

    const [plan] = await db.select().from(servicePlans).where(eq(servicePlans.id, serviceAccount.planId)).limit(1);
    if (!plan) return reply.code(400).send({ message: "Service plan no longer exists" });
    if (plan.status !== "active") return reply.code(400).send({ message: "Service plan is not active" });

    const basePriceCents = parseMoneyToCents(plan.price);
    if (basePriceCents === null) return reply.code(500).send({ message: "Plan price is not a valid amount" });

    const quantity = parsed.data.quantity ?? 1;

    // Exact line items: base plan line + validated additional lines.
    const lineInputs: Array<{ description: string; quantity: number; unitPriceCents: bigint }> = [
      { description: plan.name, quantity, unitPriceCents: basePriceCents },
    ];
    for (const extra of parsed.data.additionalLineItems ?? []) {
      const extraCents = parseMoneyToCents(extra.unitPrice);
      if (extraCents === null) {
        return reply.code(400).send({ message: "Invalid line item unit price" });
      }
      lineInputs.push({ description: extra.description, quantity: extra.quantity, unitPriceCents: extraCents });
    }

    let totalCents = 0n;
    for (const line of lineInputs) {
      totalCents += line.unitPriceCents * BigInt(line.quantity);
    }

    for (const adj of parsed.data.adjustments ?? []) {
      const adjCents = parseMoneyToCents(adj.amount);
      if (adjCents === null || adjCents === 0n) {
        return reply.code(400).send({ message: "Invalid adjustment amount" });
      }
      totalCents += adj.type === "debit" ? adjCents : -adjCents;
    }

    if (totalCents < 0n) {
      return reply.code(400).send({ message: "Invoice total cannot be negative" });
    }

    const issueDate = parsed.data.issueDate ?? new Date().toISOString().slice(0, 10);
    const dueDate = parsed.data.dueDate ?? period.dueDate.toISOString().slice(0, 10);

    try {
      const createdId = await db.transaction(async (tx) => {
        // Atomic re-check of the duplicate guard inside the transaction.
        const [existing] = await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(and(eq(invoices.serviceAccountId, serviceAccount.id), eq(invoices.billingPeriodId, period.id)))
          .limit(1);
        if (existing) {
          throw new BillingConflictError("An invoice already exists for this service account and billing period");
        }

        const [invoice] = await tx
          .insert(invoices)
          .values({
            invoiceNumber: parsed.data.invoiceNumber,
            serviceAccountId: serviceAccount.id,
            billingPeriodId: period.id,
            issueDate: new Date(issueDate),
            dueDate: new Date(dueDate),
            status: "unpaid",
            totalAmount: formatCents(totalCents),
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

        for (const adj of parsed.data.adjustments ?? []) {
          await tx.insert(invoiceAdjustments).values({
            invoiceId: invoice!.id,
            type: adj.type,
            amount: adj.amount,
            reason: adj.reason,
            createdByUserId: request.currentUser!.id,
          });
        }

        return invoice!.id;
      });

      const detail = await getInvoiceDetail(createdId);
      return reply.code(201).send({ data: detail });
    } catch (err) {
      if (err instanceof BillingConflictError) {
        return reply.code(409).send({ message: err.message });
      }
      if (isConflict(err)) {
        return reply.code(409).send({ message: "An invoice already exists for this service account and billing period" });
      }
      throw err;
    }
  });
}

class BillingConflictError extends Error {}
