import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { gcashPaymentDetails, invoices, payments, serviceAccounts, servicePlans, subscribers } from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";

const READ_ROLES = [
  ROLE_NAMES.OWNER,
  ROLE_NAMES.ADMINISTRATOR,
  ROLE_NAMES.CASHIER,
  ROLE_NAMES.COLLECTION_SUPERVISOR,
  ROLE_NAMES.ACCOUNTING_AUDITOR,
  ROLE_NAMES.TECHNICIAN,
  ROLE_NAMES.READ_ONLY_VIEWER,
];
// Technicians see service information only (spec 3.1), so financial
// documents (invoices, receipts, GCash references) are not searched for them.
const FINANCIAL_ROLES = READ_ROLES.filter((r) => r !== ROLE_NAMES.TECHNICIAN);

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

/** Escape LIKE wildcards so user input is matched literally. */
function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface SearchHit {
  kind: "service_account" | "invoice" | "payment";
  /** What matched, e.g. "account number", "receipt number". */
  matchedOn: string;
  reference: string;
  subscriberId: number;
  subscriberName: string;
  accountNumber: string;
  serviceAccountId: number;
  serviceNumber: string;
  serviceStatus: string;
  planName: string;
  invoiceId?: number;
  paymentId?: number;
}

// Spec 3.2: global search by account number, name, contact number, address,
// receipt number, invoice number and GCash reference. Every hit resolves to
// a service account, which is what the cashier/operator acts on.
export default async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/search", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: "Enter at least 2 characters to search" });
    const { q, limit } = parsed.data;
    const term = likeContains(q);
    const canSeeFinancial = request.currentUser!.roles.some((r) => (FINANCIAL_ROLES as string[]).includes(r));

    const accountColumns = {
      subscriberId: subscribers.id,
      subscriberName: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}`,
      accountNumber: subscribers.accountNumber,
      serviceAccountId: serviceAccounts.id,
      serviceNumber: serviceAccounts.serviceNumber,
      serviceStatus: serviceAccounts.status,
      planName: servicePlans.name,
    };

    const accountRows = await db
      .select({
        ...accountColumns,
        matchedOn: sql<string>`case
          when ${subscribers.accountNumber} ilike ${term} then 'account number'
          when ${serviceAccounts.serviceNumber} ilike ${term} then 'service number'
          when ${subscribers.contactNumber} ilike ${term} then 'contact number'
          when (${subscribers.firstName} || ' ' || ${subscribers.lastName}) ilike ${term} then 'name'
          else 'address' end`,
      })
      .from(serviceAccounts)
      .innerJoin(subscribers, eq(subscribers.id, serviceAccounts.subscriberId))
      .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
      .where(
        or(
          ilike(subscribers.accountNumber, term),
          ilike(serviceAccounts.serviceNumber, term),
          ilike(subscribers.contactNumber, term),
          sql`(${subscribers.firstName} || ' ' || ${subscribers.lastName}) ilike ${term}`,
          ilike(subscribers.addressLine1, term),
          ilike(subscribers.addressLine2, term),
          ilike(subscribers.city, term),
        ),
      )
      .orderBy(subscribers.lastName, subscribers.firstName, serviceAccounts.serviceNumber)
      .limit(limit);

    const hits: SearchHit[] = accountRows.map((r) => ({ kind: "service_account", reference: r.serviceNumber, ...r }));

    if (canSeeFinancial) {
      const invoiceRows = await db
        .select({ ...accountColumns, invoiceId: invoices.id, reference: invoices.invoiceNumber })
        .from(invoices)
        .innerJoin(serviceAccounts, eq(serviceAccounts.id, invoices.serviceAccountId))
        .innerJoin(subscribers, eq(subscribers.id, serviceAccounts.subscriberId))
        .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
        .where(ilike(invoices.invoiceNumber, term))
        .limit(limit);
      hits.push(...invoiceRows.map((r) => ({ kind: "invoice" as const, matchedOn: "invoice number", ...r })));

      const receiptRows = await db
        .select({ ...accountColumns, paymentId: payments.id, reference: sql<string>`coalesce(${payments.receiptNumber}, '')` })
        .from(payments)
        .innerJoin(serviceAccounts, eq(serviceAccounts.id, payments.serviceAccountId))
        .innerJoin(subscribers, eq(subscribers.id, serviceAccounts.subscriberId))
        .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
        .where(or(ilike(payments.receiptNumber, term), ilike(payments.referenceNumber, term)))
        .limit(limit);
      hits.push(...receiptRows.map((r) => ({ kind: "payment" as const, matchedOn: "receipt / reference number", ...r })));

      const gcashRows = await db
        .select({ ...accountColumns, paymentId: payments.id, reference: gcashPaymentDetails.gcashReferenceNumber })
        .from(gcashPaymentDetails)
        .innerJoin(payments, eq(payments.id, gcashPaymentDetails.paymentId))
        .innerJoin(serviceAccounts, eq(serviceAccounts.id, payments.serviceAccountId))
        .innerJoin(subscribers, eq(subscribers.id, serviceAccounts.subscriberId))
        .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
        .where(ilike(gcashPaymentDetails.gcashReferenceNumber, term))
        .limit(limit);
      hits.push(...gcashRows.map((r) => ({ kind: "payment" as const, matchedOn: "GCash reference", ...r })));
    }

    return reply.send({ data: hits });
  });
}
