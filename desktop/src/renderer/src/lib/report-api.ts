/**
 * Report export API integration via IPC. The main process fetches the
 * binary PDF/XLSX and prompts the user for a save location.
 */

import type { ReportExportFormat, ReportExportResult } from "@/shared/types";

export async function exportReport(path: string, format: ReportExportFormat, suggestedName: string): Promise<ReportExportResult> {
  return window.bcis.reports.export({ path, format, suggestedName });
}
