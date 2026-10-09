/**
 * Invoice API integration via IPC.
 */

import type {
  InvoiceListResponse,
  InvoiceDetailResponse,
  InvoiceCreateResponse,
  CreateInvoiceRequest,
  InvoiceStatus,
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