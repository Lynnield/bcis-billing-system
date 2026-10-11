import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { invoices, paymentAllocations, payments, serviceAccounts } from "../db/schema";
import { parseMoneyToCents } from "./money";

export const AGING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysOverdue(dueDate: Date | string, today = todayDateString()): number {
  const due = (typeof dueDate === "string" ? dueDate.slice(0, 10) : dueDate.toISOString().slice(0, 10));
  return Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000);
}

export function bucketFor(days: number): AgingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export interface InvoiceBalanceRow {
  invoiceId: number;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  issueDate: Date;
  dueDate: Date;
  serviceAccountId: number;
  subscriberId: number;
  allocated: string;
  balanceCents: bigint;
}

// Authoritative per-invoice balance: total minus allocations from posted
// payments only (allocations belonging to reversed payments are excluded).
export async function getInvoiceBalances(options?: {
  serviceAccountId?: number;
  subscriberId?: number;
  billingPeriodId?: number;
}): Promise<InvoiceBalanceRow[]> {
  // Drafts are not yet billed and void invoices are cancelled; neither is
  // a receivable.
  const conditions = [notInArray(invoices.status, ["draft", "void"])];
  if (options?.serviceAccountId !== undefined) conditions.push(eq(invoices.serviceAccountId, options.serviceAccountId));
  if (options?.subscriberId !== undefined) conditions.push(eq(serviceAccounts.subscriberId, options.subscriberId));
  if (options?.billingPeriodId !== undefined) conditions.push(eq(invoices.billingPeriodId, options.billingPeriodId));
  const where = and(...conditions);

  const rows = await db
    .select({
      invoiceId: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      totalAmount: invoices.totalAmount,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      serviceAccountId: invoices.serviceAccountId,
      subscriberId: serviceAccounts.subscriberId,
      allocated: sql<string>`coalesce(sum(case when ${payments.status} = 'posted' then ${paymentAllocations.amount} else 0 end), 0)::numeric(14,2)`,
    })
    .from(invoices)
    .innerJoin(serviceAccounts, eq(serviceAccounts.id, invoices.serviceAccountId))
    .leftJoin(paymentAllocations, eq(paymentAllocations.invoiceId, invoices.id))
    .leftJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(where)
    .groupBy(invoices.id, serviceAccounts.subscriberId);

  return rows.map((r) => {
    const balanceCents = (parseMoneyToCents(r.totalAmount) ?? 0n) - (parseMoneyToCents(r.allocated) ?? 0n);
    return { ...r, balanceCents };
  });
}
