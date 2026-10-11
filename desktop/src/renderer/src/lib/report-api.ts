/**
 * Report export API integration via IPC. The main process fetches the
 * binary PDF/XLSX and prompts the user for a save location.
 */

import type { ReportExportFormat, ReportExportResult, LedgerResponse, SoaResponse } from "@/shared/types";

export async function exportReport(path: string, format: ReportExportFormat, suggestedName: string): Promise<ReportExportResult> {
  return window.bcis.reports.export({ path, format, suggestedName });
}

export async function getLedger(serviceAccountId: number): Promise<LedgerResponse> {
  return window.bcis.reports.getLedger(serviceAccountId);
}

export async function getSoa(serviceAccountId: number, range?: { dateFrom?: string; dateTo?: string }): Promise<SoaResponse> {
  return window.bcis.reports.getSoa(serviceAccountId, range);
}
