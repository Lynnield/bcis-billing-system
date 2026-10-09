/**
 * Receivables API integration via IPC.
 */

import type { ReceivableInvoicesResponse, AgingSummaryResponse, SuspensionCandidatesResponse, AgingBucketKey } from "@/shared/types";

export async function getOutstandingInvoices(params: {
  page?: number;
  pageSize?: number;
  serviceAccountId?: number;
  subscriberId?: number;
  overdueOnly?: boolean;
  bucket?: AgingBucketKey;
}): Promise<ReceivableInvoicesResponse> {
  return window.bcis.receivables.getInvoices(params);
}

export async function getAgingSummary(): Promise<AgingSummaryResponse> {
  return window.bcis.receivables.getAging();
}

export async function getSuspensionCandidates(): Promise<SuspensionCandidatesResponse> {
  return window.bcis.receivables.getSuspensionCandidates();
}
