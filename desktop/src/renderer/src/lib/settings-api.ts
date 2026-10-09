/**
 * Collections settings API integration via IPC (configurable grace period
 * and suspension threshold, 3.10). Owner/Administrator only for writes.
 */

import type { CollectionsSettings, CollectionsSettingsResponse } from "@/shared/types";

export async function getCollectionsSettings(): Promise<CollectionsSettingsResponse> {
  return window.bcis.settings.getCollections();
}

export async function updateCollectionsSettings(data: CollectionsSettings): Promise<CollectionsSettingsResponse> {
  return window.bcis.settings.updateCollections(data);
}
