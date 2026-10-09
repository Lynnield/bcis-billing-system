/**
 * Billing Period API integration via IPC.
 */

import type {
  BillingPeriodListResponse,
  BillingPeriodDetailResponse,
  CreateBillingPeriodRequest,
  UpdateBillingPeriodRequest,
} from "@/shared/types";

export async function getBillingPeriods(params: {
  page?: number;
  pageSize?: number;
}): Promise<BillingPeriodListResponse> {
  return window.bcis.billingPeriods.getList(params);
}

export async function getBillingPeriodById(id: number): Promise<BillingPeriodDetailResponse> {
  return window.bcis.billingPeriods.getById(id);
}

export async function createBillingPeriod(data: CreateBillingPeriodRequest): Promise<BillingPeriodDetailResponse> {
  return window.bcis.billingPeriods.create(data);
}

export async function updateBillingPeriod(id: number, data: UpdateBillingPeriodRequest): Promise<BillingPeriodDetailResponse> {
  return window.bcis.billingPeriods.update(id, data);
}