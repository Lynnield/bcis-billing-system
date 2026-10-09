/**
 * Dashboard API integration.
 * All API calls go through the main process via IPC for security.
 */

import type {
  DashboardSummaryResponse,
  ReceivablesReportResponse,
  CollectionsReportResponse,
} from "../../../shared/types";

export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  return window.bcis.dashboard.getSummary();
}

export async function getReceivablesReport(): Promise<ReceivablesReportResponse> {
  return window.bcis.dashboard.getReceivables();
}

export async function getCollectionsReport(): Promise<CollectionsReportResponse> {
  return window.bcis.dashboard.getCollections();
}