/**
 * Services & Plans API integration via IPC.
 */

import type {
  ServiceListResponse,
  ServiceDetailResponse,
  CreateServiceRequest,
  UpdateServiceRequest,
  ServicePlanListResponse,
  ServicePlanDetailResponse,
  CreatePlanRequest,
  UpdatePlanRequest,
  ServiceStatus,
} from "@/shared/types";

export async function getServices(status?: ServiceStatus): Promise<ServiceListResponse> {
  return window.bcis.services.getList(status);
}

export async function getServiceById(id: number): Promise<ServiceDetailResponse> {
  return window.bcis.services.getById(id);
}

export async function createService(data: CreateServiceRequest): Promise<ServiceDetailResponse> {
  return window.bcis.services.create(data);
}

export async function updateService(id: number, data: UpdateServiceRequest): Promise<ServiceDetailResponse> {
  return window.bcis.services.update(id, data);
}

export async function getPlansByService(serviceId: number, status?: ServiceStatus): Promise<ServicePlanListResponse> {
  return window.bcis.plans.getByService(serviceId, status);
}

export async function getPlanById(id: number): Promise<ServicePlanDetailResponse> {
  return window.bcis.plans.getById(id);
}

export async function createPlan(serviceId: number, data: CreatePlanRequest): Promise<ServicePlanDetailResponse> {
  return window.bcis.plans.create(serviceId, data);
}

export async function updatePlan(id: number, data: UpdatePlanRequest): Promise<ServicePlanDetailResponse> {
  return window.bcis.plans.update(id, data);
}