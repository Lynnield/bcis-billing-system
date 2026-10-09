/**
 * Collection Areas & Collectors API integration via IPC.
 */

import type {
  CollectionAreaListResponse,
  CollectionAreaDetailResponse,
  CreateCollectionAreaRequest,
  UpdateCollectionAreaRequest,
  CollectorListResponse,
  CollectionAreaStatus,
  CollectorStatus,
} from "@/shared/types";

export async function getCollectionAreas(status?: CollectionAreaStatus): Promise<CollectionAreaListResponse> {
  return window.bcis.collectionAreas.getList(status);
}

export async function getCollectionAreaById(id: number): Promise<CollectionAreaDetailResponse> {
  return window.bcis.collectionAreas.getById(id);
}

export async function createCollectionArea(data: CreateCollectionAreaRequest): Promise<CollectionAreaDetailResponse> {
  return window.bcis.collectionAreas.create(data);
}

export async function updateCollectionArea(id: number, data: UpdateCollectionAreaRequest): Promise<CollectionAreaDetailResponse> {
  return window.bcis.collectionAreas.update(id, data);
}

export async function getCollectors(status?: CollectorStatus): Promise<CollectorListResponse> {
  return window.bcis.collectors.getList(status);
}