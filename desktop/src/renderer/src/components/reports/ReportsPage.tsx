import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/lib/toast";
import { exportReport } from "@/lib/report-api";
import type { ReportExportFormat } from "@/shared/types";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { ManagementReport } from "./ManagementReport";

interface ReportParams {
  serviceAccountId: string;
  dateFrom: string;
  dateTo: string;
}

interface ReportDef {
  key: string;
  label: string;
  description: string;
  needsServiceAccountId?: boolean;
  needsDateRange?: boolean;
  buildPath: (params: ReportParams, format: ReportExportFormat) => string;
  suggestedName: (format: ReportExportFormat) => string;
}

function dateQuery(params: ReportParams): string {
  const q = new URLSearchParams();
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  return q.toString();
}

const REPORT_DEFS: ReportDef[] = [
  {
    key: "dashboard",
    label: "Management Dashboard Summary",
    description: "Key KPIs: active subscribers, outstanding/overdue AR, current month collections.",
    buildPath: (_params, format) => `/api/v1/reports/dashboard/export?format=${format}`,
    suggestedName: (format) => `management-dashboard.${format}`,
  },
  {
    key: "collections",
    label: "Collection Report",
    description: "Posted payments in a date range, with totals by method and collector.",
    needsDateRange: true,
    buildPath: (params, format) => {
      const q = dateQuery(params);
      return `/api/v1/reports/collections/export?format=${format}${q ? `&${q}` : ""}`;
    },
    suggestedName: (format) => `collection-report.${format}`,
  },
  {
    key: "receivables",
    label: "Accounts Receivable Report",
    description: "Total/overdue outstanding balances and aging bucket totals.",
    buildPath: (_params, format) => `/api/v1/reports/receivables/export?format=${format}`,
    suggestedName: (format) => `receivables-report.${format}`,
  },
  {
    key: "aging",
    label: "AR Aging Report",
    description: "Outstanding balance broken down by Current / 1-30 / 31-60 / 61-90 / 90+ days.",
    buildPath: (_params, format) => `/api/v1/reports/aging/export?format=${format}`,
    suggestedName: (format) => `ar-aging-report.${format}`,
  },
  {
    key: "collectors",
    label: "Collector Performance & Remittance",
    description: "Per-collector expected vs. remitted totals, shortages and overages, in a date range.",
    needsDateRange: true,
    buildPath: (params, format) => {
      const q = dateQuery(params);
      return `/api/v1/reports/collectors/export?format=${format}${q ? `&${q}` : ""}`;
    },
    suggestedName: (format) => `collector-performance-report.${format}`,
  },
  {
    key: "ledger",
    label: "Subscriber Ledger",
    description: "Full chronological debit/credit history with running balance for one service account.",
    needsServiceAccountId: true,
    buildPath: (params, format) => `/api/v1/reports/ledger/${params.serviceAccountId}/export?format=${format}`,
    suggestedName: (format) => `ledger.${format}`,
  },
  {
    key: "soa",
    label: "Statement of Account",
    description: "Printable statement of outstanding invoices for one service account.",
    needsServiceAccountId: true,
    buildPath: (params, format) => `/api/v1/reports/soa/${params.serviceAccountId}/export?format=${format}`,
    suggestedName: (format) => `statement-of-account.${format}`,
  },
];

export function ReportsPage() {
  const { success: showSuccess, error: showError, info: showInfo } = useToast();
  const { data: catalogData } = useQuery({ queryKey: ["report-catalog"], queryFn: () => window.bcis.reports.getCatalog() });
  const catalog = catalogData?.data ?? [];
  // "m:<slug>" selects a management report; anything else a statement/export.
  const [selectedKey, setSelectedKey] = React.useState(REPORT_DEFS[0]!.key);
  const selectedManagement = selectedKey.startsWith("m:") ? catalog.find((c) => `m:${c.slug}` === selectedKey) : undefined;
  const [params, setParams] = React.useState<ReportParams>({ serviceAccountId: "", dateFrom: "", dateTo: "" });

  const selected = REPORT_DEFS.find((r) => r.key === selectedKey) ?? REPORT_DEFS[0]!;

  const exportMutation = useMutation({
    mutationFn: (format: ReportExportFormat) => exportReport(selected.buildPath(params, format), format, selected.suggestedName(format)),
    onSuccess: (result) => {
      if (result.savedPath) {
        showSuccess("Report saved", result.savedPath);
      } else {
        showInfo("Export cancelled", "No file was saved.");
      }
    },
    onError: (err: unknown) => showError("Export failed", err instanceof Error ? err.message : "Unknown error"),
  });

  const canExport = !selected.needsServiceAccountId || params.serviceAccountId.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Reports</h2>
        <p className="text-muted-foreground">Generate management and operational reports as PDF or XLSX.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="rounded-lg border divide-y self-start">
          {catalog.length > 0 && (
            <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40">Management reports</p>
          )}
          {catalog.map((c) => (
            <button
              key={c.slug}
              onClick={() => setSelectedKey(`m:${c.slug}`)}
              className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                selectedKey === `m:${c.slug}` ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"
              }`}
            >
              {c.title}
            </button>
          ))}
          <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40">Statements &amp; summaries</p>
          {REPORT_DEFS.map((r) => (
            <button
              key={r.key}
              onClick={() => setSelectedKey(r.key)}
              className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                r.key === selectedKey ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {selectedManagement ? (
          <div className="rounded-lg border p-6">
            <ManagementReport key={selectedManagement.slug} report={selectedManagement} />
          </div>
        ) : (
        <div className="rounded-lg border p-6 space-y-4">
          <div>
            <h3 className="font-medium">{selected.label}</h3>
            <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
          </div>

          {selected.needsServiceAccountId && (
            <Input
              label="Service Account ID *"
              type="number"
              min="1"
              value={params.serviceAccountId}
              onChange={(e) => setParams((p) => ({ ...p, serviceAccountId: e.target.value }))}
              placeholder="e.g. 42"
              helperText="Find the ID on the Service Accounts screen."
            />
          )}

          {selected.needsDateRange && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="From"
                type="date"
                value={params.dateFrom}
                onChange={(e) => setParams((p) => ({ ...p, dateFrom: e.target.value }))}
              />
              <Input
                label="To"
                type="date"
                value={params.dateTo}
                onChange={(e) => setParams((p) => ({ ...p, dateTo: e.target.value }))}
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => exportMutation.mutate("pdf")}
              disabled={!canExport || exportMutation.isPending}
            >
              <FileText className="mr-2 h-4 w-4" />
              {exportMutation.isPending && exportMutation.variables === "pdf" ? "Exporting..." : "Export PDF"}
            </Button>
            <Button
              variant="outline"
              onClick={() => exportMutation.mutate("xlsx")}
              disabled={!canExport || exportMutation.isPending}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {exportMutation.isPending && exportMutation.variables === "xlsx" ? "Exporting..." : "Export XLSX"}
            </Button>
          </div>
          {!canExport && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <FileDown className="h-3.5 w-3.5" />
              Enter a service account ID to enable export.
            </p>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
