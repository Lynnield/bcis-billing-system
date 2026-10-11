import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/Badge";
import type { AuditLogQuery, AuditLogRow } from "@/shared/types";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

const ENTITY_OPTIONS = [
  { value: "", label: "All records" },
  { value: "payment", label: "Payments" },
  { value: "invoice", label: "Invoices" },
  { value: "billing_period", label: "Billing runs" },
  { value: "collection_batch", label: "Collection batches" },
  { value: "service_account", label: "Service accounts" },
  { value: "subscriber", label: "Subscribers" },
  { value: "user", label: "Users" },
  { value: "payment_proof", label: "Payment proofs" },
  { value: "backup_history", label: "Backups" },
  { value: "application_settings", label: "Settings" },
];

function actionVariant(action: string): "destructive" | "warning" | "secondary" {
  if (/reverse|void|reject|restore|shortage|deactivat/.test(action)) return "destructive";
  if (/adjust|overage|reset_password|role/.test(action)) return "warning";
  return "secondary";
}

/** Spec 4.4 / 3.1: read-only audit trail for the Owner and Accounting / Auditor. */
export function AuditLogPage() {
  const [filters, setFilters] = React.useState<AuditLogQuery>({ page: 1, pageSize: 50 });
  const [draft, setDraft] = React.useState({ action: "", entityType: "", entityId: "", dateFrom: "", dateTo: "" });
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const { data: actionsData } = useQuery({ queryKey: ["audit-actions"], queryFn: () => window.bcis.audit.getActions(), staleTime: 60_000 });
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => window.bcis.audit.getList(filters),
    placeholderData: (prev) => prev,
  });

  const apply = () =>
    setFilters({
      page: 1,
      pageSize: filters.pageSize,
      ...(draft.action ? { action: draft.action } : {}),
      ...(draft.entityType ? { entityType: draft.entityType } : {}),
      ...(/^\d+$/.test(draft.entityId) ? { entityId: Number(draft.entityId) } : {}),
      ...(draft.dateFrom ? { dateFrom: draft.dateFrom } : {}),
      ...(draft.dateTo ? { dateTo: draft.dateTo } : {}),
    });

  const rows: AuditLogRow[] = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Audit Log</h2>
        <p className="text-muted-foreground">Every posted financial and administrative change, with who did it and when. Read-only.</p>
      </div>

      <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-3 xl:grid-cols-6">
        <Select
          label="Action"
          value={draft.action}
          onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          options={[{ value: "", label: "All actions" }, ...(actionsData?.data ?? []).map((a) => ({ value: a, label: a }))]}
        />
        <Select label="Record type" value={draft.entityType} onChange={(e) => setDraft({ ...draft, entityType: e.target.value })} options={ENTITY_OPTIONS} />
        <Input label="Record ID" inputMode="numeric" value={draft.entityId} onChange={(e) => setDraft({ ...draft, entityId: e.target.value })} />
        <Input label="From" type="date" value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} />
        <Input label="To" type="date" value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} />
        <div className="flex items-end gap-2">
          <Button onClick={apply}>Filter</Button>
          <Button
            variant="outline"
            onClick={() => {
              setDraft({ action: "", entityType: "", entityId: "", dateFrom: "", dateTo: "" });
              setFilters({ page: 1, pageSize: filters.pageSize });
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load audit log"}</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Date / Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !data ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No audit records match
                  </TableCell>
                </TableRow>
              ) : (
                rows.flatMap((r) => [
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <TableCell>
                      {expanded === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{r.actorName ?? r.actorUsername ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={actionVariant(r.action)} className="font-mono">
                        {r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {r.entityType}
                      {r.entityId !== null ? ` #${r.entityId}` : ""}
                    </TableCell>
                  </TableRow>,
                  expanded === r.id ? (
                    <TableRow key={`${r.id}-detail`}>
                      <TableCell />
                      <TableCell colSpan={4}>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">
                          {JSON.stringify(r.metadata ?? {}, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  ) : null,
                ])
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {data?.pagination && (
        <Pagination
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          total={data.pagination.total}
          pageSize={data.pagination.pageSize}
          onPageChange={(page) => setFilters({ ...filters, page })}
          onPageSizeChange={(pageSize) => setFilters({ ...filters, page: 1, pageSize })}
          showPageSize
        />
      )}
    </div>
  );
}
