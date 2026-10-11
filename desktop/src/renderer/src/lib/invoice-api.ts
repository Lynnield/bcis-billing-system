/**
 * Invoice API integration via IPC.
 */

import type {
  InvoiceListResponse,
  InvoiceDetailResponse,
  InvoiceCreateResponse,
  CreateInvoiceRequest,
  InvoiceStatus,
  InvoiceAdjustmentRequest,
} from "@/shared/types";

export async function getInvoices(params: {
  page?: number;
  pageSize?: number;
  serviceAccountId?: number;
  subscriberId?: number;
  billingPeriodId?: number;
  invoiceNumber?: string;
  status?: InvoiceStatus;
}): Promise<InvoiceListResponse> {
  return window.bcis.invoices.getList(params);
}

export async function getInvoiceById(id: number): Promise<InvoiceDetailResponse> {
  return window.bcis.invoices.getById(id);
}

export async function createInvoice(data: CreateInvoiceRequest): Promise<InvoiceCreateResponse> {
  return window.bcis.invoices.create(data);
}

export async function finalizeInvoice(id: number): Promise<InvoiceDetailResponse> {
  return window.bcis.invoices.finalize(id);
}

export async function voidInvoice(id: number, reason: string): Promise<InvoiceDetailResponse> {
  return window.bcis.invoices.void(id, reason);
}

export async function adjustInvoice(id: number, data: InvoiceAdjustmentRequest): Promise<InvoiceDetailResponse> {
  return window.bcis.invoices.adjust(id, data);
}

export async function markOverdueInvoices(): Promise<{ data: { changed: number } }> {
  return window.bcis.invoices.markOverdue();
}
