/**
 * Subscriber API integration via IPC.
 */

import type {
  SubscriberListResponse,
  SubscriberDetailResponse,
  CreateSubscriberRequest,
  UpdateSubscriberRequest,
  SubscriberStatusChangeRequest,
  SubscriberStatusHistoryResponse,
  SubscriberStatus,
} from "@/shared/types";

export async function getSubscribers(params: {
  page?: number;
  pageSize?: number;
  accountNumber?: string;
  name?: string;
  email?: string;
  contactNumber?: string;
  status?: SubscriberStatus;
}): Promise<SubscriberListResponse> {
  return window.bcis.subscribers.getList(params);
}

export async function getSubscriberById(id: number): Promise<SubscriberDetailResponse> {
  return window.bcis.subscribers.getById(id);
}

export async function createSubscriber(data: CreateSubscriberRequest): Promise<SubscriberDetailResponse> {
  return window.bcis.subscribers.create(data);
}

export async function updateSubscriber(id: number, data: UpdateSubscriberRequest): Promise<SubscriberDetailResponse> {
  return window.bcis.subscribers.update(id, data);
}

export async function changeSubscriberStatus(
  id: number,
  data: SubscriberStatusChangeRequest
): Promise<SubscriberDetailResponse> {
  return window.bcis.subscribers.changeStatus(id, data);
}

export async function getSubscriberStatusHistory(id: number): Promise<SubscriberStatusHistoryResponse> {
  return window.bcis.subscribers.getStatusHistory(id);
}