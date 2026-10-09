/**
 * Backup & restore API integration via IPC. Owner-only on the server.
 */

import type { BackupListResponse, BackupDetailResponse } from "@/shared/types";

export async function getBackups(): Promise<BackupListResponse> {
  return window.bcis.backup.getList();
}

export async function createBackup(): Promise<BackupDetailResponse> {
  return window.bcis.backup.create();
}

export async function verifyBackup(id: number): Promise<BackupDetailResponse> {
  return window.bcis.backup.verify(id);
}

export async function restoreBackup(id: number): Promise<BackupDetailResponse> {
  return window.bcis.backup.restore(id);
}
