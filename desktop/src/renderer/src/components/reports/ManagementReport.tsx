import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useToast } from "@/lib/toast";
import { exportReport } from "@/lib/report-api";
import type { ReportCatalogEntry, ReportExportFormat, ReportRunParams } from "@/shared/types";
import { FileSpreadsheet, FileText, Loader2, Play } from "lucide-react";

// Free-text columns may wrap; everything else stays on one line.
const WRAPPING = new Set(["reason", "notes", "details", "address", "name", "description"]);

function toQuery(params: ReportRunParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  return q.toString();
}

/** One spec 3.11 management report: parameters, on-screen table, PDF/XLSX export. */
export function ManagementReport({ report }: { report: ReportCatalogEntry }) {
  const { success: showSuccess, error: showError, info: showInfo } = useToast();
  const [params, setParams] = React.useState<ReportRunParams>(() => {
    const today = new Date();
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
    return {
      ...(report.params.includes("dateFrom") ? { dateFrom: first, dateTo: today.toISOString().slice(0, 10) } : {}),
      ...(report.params.includes("period") ? { period: "month" as const } : {}),
      ...(report.params.includes("groupBy") ? { groupBy: "plan" as const } : {}),
    };
  });
  const [submitted, setSubmitted] = React.useState<ReportRunParams | null>(null);

  const needsCollectors = report.params.includes("collectorId");
  const needsAreas = report.params.includes("collectionAreaId");
  const { data: collectorsData } = useQuery({ queryKey: ["collectors"], queryFn: () => window.bcis.collectors.getList(), enabled: needsCollectors });
  const { data: areasData } = useQuery({ queryKey: ["collection-areas"], queryFn: () => window.bcis.collectionAreas.getList(), enabled: needsAreas });

  const { data, isFetching, error } = useQuery({
    queryKey: ["report-run", report.slug, submitted],
    queryFn: () => window.bcis.reports.run(report.slug, submitted!),
    enabled: submitted !== null,
  });
  const result = data?.data;

  const exportMutation = useMutation({
    mutationFn: (format: ReportExportFormat) => {
      const q = toQuery(params);
      return exportReport(`/api/v1/reports/run/${report.slug}/export?format=${format}${q ? `&${q}` : ""}`, format, `${report.slug}.${format}`);
    },
    onSuccess: (r) => (r.savedPath ? showSuccess("Report saved", r.savedPath) : showInfo("Export cancelled")),
    onError: (err: unknown) => showError("Export failed", err instanceof Error ? err.message : ""),
  });

  const set = (patch: Partial<ReportRunParams>) => setParams((p) => ({ ...p, ...patch }));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">{report.title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {report.params.includes("dateFrom") && <Input label="From" type="date" value={params.dateFrom ?? ""} onChange={(e) => set({ dateFrom: e.target.value || undefined })} />}
        {report.params.includes("dateTo") && <Input label="To" type="date" value={params.dateTo ?? ""} onChange={(e) => set({ dateTo: e.target.value || undefined })} />}
        {report.params.includes("period") && (
          <Select
            label="Group by"
            value={params.period}
            onChange={(e) => set({ period: e.target.value as ReportRunParams["period"] })}
            options={[
              { value: "day", label: "Day (daily)" },
              { value: "week", label: "Week (weekly)" },
              { value: "month", label: "Month (monthly)" },
              { value: "year", label: "Year (annual)" },
            ]}
          />
        )}
        {report.params.includes("groupBy") && (
          <Select
            label="Revenue by"
            value={params.groupBy}
            onChange={(e) => set({ groupBy: e.target.value as ReportRunParams["groupBy"] })}
            options={[
              { value: "plan", label: "Plan" },
              { value: "service", label: "Service type" },
              { value: "area", label: "Collection area" },
            ]}
          />
        )}
        {needsCollectors && (
          <Select
            label="Collector"
            value={params.collectorId ? String(params.collectorId) : ""}
            onChange={(e) => set({ collectorId: e.target.value ? Number(e.target.value) : undefined })}
            options={[{ value: "", label: "All collectors" }, ...(collectorsData?.data ?? []).map((c) => ({ value: String(c.id), label: c.fullName }))]}
          />
        )}
        {needsAreas && (
          <Select
            label="Area"
            value={params.collectionAreaId ? String(params.collectionAreaId) : ""}
            onChange={(e) => set({ collectionAreaId: e.target.value ? Number(e.target.value) : undefined })}
            options={[{ value: "", label: "All areas" }, ...(areasData?.data ?? []).map((a) => ({ value: String(a.id), label: a.name }))]}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setSubmitted({ ...params })} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Run
        </Button>
        <Button variant="outline" onClick={() => exportMutation.mutate("pdf")} disabled={exportMutation.isPending}>
          <FileText className="mr-2 h-4 w-4" />
          Export PDF
        </Button>
        <Button variant="outline" onClick={() => exportMutation.mutate("xlsx")} disabled={exportMutation.isPending}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Export XLSX
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Report failed"}</p>
      ) : result ? (
        <div className="space-y-2">
          <div>
            <p className="font-medium">{result.title}</p>
            <p className="text-xs text-muted-foreground">{result.subtitle}</p>
          </div>
          <div className="max-h-[60vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {result.columns.map((c) => (
                    <TableHead key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                      {c.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={result.columns.length} className="py-8 text-center text-muted-foreground">
                      No data for these parameters
                    </TableCell>
                  </TableRow>
                ) : (
                  result.rows.map((row, i) => (
                    <TableRow key={i}>
                      {result.columns.map((c) => (
                        <TableCell key={c.key} className={c.align === "right" ? "whitespace-nowrap text-right tabular-nums" : WRAPPING.has(c.key) ? undefined : "whitespace-nowrap"}>
                          {String(row[c.key] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
              {result.totals && result.rows.length > 0 && (
                <TableFooter>
                  <TableRow>
                    {result.columns.map((c) => (
                      <TableCell key={c.key} className={c.align === "right" ? "text-right tabular-nums font-semibold" : "font-semibold"}>
                        {String(result.totals![c.key] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Set the parameters and click Run to preview, or export directly.</p>
      )}
    </div>
  );
}
