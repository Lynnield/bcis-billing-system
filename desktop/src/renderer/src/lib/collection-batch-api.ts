/**
 * Collection batch API integration via IPC.
 */

import type {
  CollectionBatchListResponse,
  CollectionBatchDetailResponse,
  CreateCollectionBatchRequest,
  RemitBatchRequest,
  CollectionBatchStatus,
} from "@/shared/types";

export async function getCollectionBatches(params: {
  page?: number;
  pageSize?: number;
  collectorId?: number;
  status?: CollectionBatchStatus;
}): Promise<CollectionBatchListResponse> {
  return window.bcis.collectionBatches.getList(params);
}

export async function getCollectionBatchById(id: number): Promise<CollectionBatchDetailResponse> {
  return window.bcis.collectionBatches.getById(id);
}

export async function createCollectionBatch(data: CreateCollectionBatchRequest): Promise<CollectionBatchDetailResponse> {
  return window.bcis.collectionBatches.create(data);
}

export async function addPaymentToBatch(batchId: number, paymentId: number): Promise<CollectionBatchDetailResponse> {
  return window.bcis.collectionBatches.addPayment(batchId, paymentId);
}

export async function remitCollectionBatch(id: number, data: RemitBatchRequest): Promise<CollectionBatchDetailResponse> {
  return window.bcis.collectionBatches.remit(id, data);
}

export async function reconcileCollectionBatch(id: number): Promise<CollectionBatchDetailResponse> {
  return window.bcis.collectionBatches.reconcile(id);
}
