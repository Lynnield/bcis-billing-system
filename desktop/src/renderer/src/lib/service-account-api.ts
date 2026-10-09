/**
 * Service Account API integration via IPC.
 */

import type {
  ServiceAccountListResponse,
  ServiceAccountDetailResponse,
  CreateServiceAccountRequest,
  UpdateServiceAccountRequest,
  ServiceAccountStatusChangeRequest,
  ServiceAccountCollectionAssignmentRequest,
  ServiceAccountStatus,
} from "@/shared/types";

export async function getServiceAccounts(params: {
  page?: number;
  pageSize?: number;
  subscriberId?: number;
  serviceId?: number;
  planId?: number;
  serviceNumber?: string;
  collectionAreaId?: number;
  collectorId?: number;
  status?: ServiceAccountStatus;
}): Promise<ServiceAccountListResponse> {
  return window.bcis.serviceAccounts.getList(params);
}

export async function getServiceAccountById(id: number): Promise<ServiceAccountDetailResponse> {
  return window.bcis.serviceAccounts.getById(id);
}

export async function createServiceAccount(data: CreateServiceAccountRequest): Promise<ServiceAccountDetailResponse> {
  return window.bcis.serviceAccounts.create(data);
}

export async function updateServiceAccount(id: number, data: UpdateServiceAccountRequest): Promise<ServiceAccountDetailResponse> {
  return window.bcis.serviceAccounts.update(id, data);
}

export async function changeServiceAccountStatus(
  id: number,
  data: ServiceAccountStatusChangeRequest
): Promise<ServiceAccountDetailResponse> {
  return window.bcis.serviceAccounts.changeStatus(id, data);
}

export async function updateServiceAccountCollectionAssignment(
  id: number,
  data: ServiceAccountCollectionAssignmentRequest
): Promise<ServiceAccountDetailResponse> {
  return window.bcis.serviceAccounts.updateCollectionAssignment(id, data);
}

export async function suspendServiceAccount(
  id: number,
  reason?: string
): Promise<ServiceAccountDetailResponse & { message?: string }> {
  return window.bcis.serviceAccounts.suspend(id, reason);
}

export async function reconnectServiceAccount(
  id: number,
  reason?: string
): Promise<ServiceAccountDetailResponse & { message?: string }> {
  return window.bcis.serviceAccounts.reconnect(id, reason);
}