import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { Search, Eye, Loader2, Plus, Clock } from "lucide-react";
import { getInvoices, markOverdueInvoices } from "@/lib/invoice-api";
import type { InvoiceStatus } from "@/shared/types";
import { InvoiceForm } from "./InvoiceForm";
import { InvoiceDetail } from "./InvoiceDetail";
import { invoiceStatusBadge, invoiceStatusLabel } from "./invoice-status";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  ...(Object.keys(invoiceStatusLabel) as InvoiceStatus[]).map((s) => ({ value: s, label: invoiceStatusLabel[s] })),
];

// Matches api/src/routes/invoices.ts WRITE_ROLES (UX only; server enforces).
const WRITE_ROLES = ["Owner / Super Admin", "Administrator"];

interface InvoiceListProps {
  initialStatus?: InvoiceStatus;
  /** Restrict to one billing period (the "Current Billing" view). */
  billingPeriodId?: number;
  title?: string;
  subtitle?: string;
}

export function InvoiceList({ initialStatus, billingPeriodId, title = "Invoices", subtitle = "Issued, draft and voided invoices" }: InvoiceListProps = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const canWrite = !!user && user.roles.some((r) => WRITE_ROLES.includes(r));

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [searchInput, setSearchInput] = React.useState("");
  const [searchNumber, setSearchNumber] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>(initialStatus ?? "all");
  const [formOpen, setFormOpen] = React.useState(false);
  const [viewingId, setViewingId] = React.useState<number | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["invoices", page, pageSize, searchNumber, statusFilter, billingPeriodId],
    queryFn: () =>
      getInvoices({
        page,
        pageSize,
        invoiceNumber: searchNumber || undefined,
        billingPeriodId,
        status: statusFilter !== "all" ? (statusFilter as InvoiceStatus) : undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const overdueMutation = useMutation({
    mutationFn: markOverdueInvoices,
    onSuccess: (res) => {
      showSuccess("Overdue check complete", `${res.data.changed} invoice(s) marked overdue`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err: unknown) => showError("Overdue check failed", err instanceof Error ? err.message : "Request failed"),
  });

  const handleSearch = React.useCallback(() => {
    setSearchNumber(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  // All hooks above must run unconditionally on every render (Rules of
  // Hooks) — the detail early-return comes after the last one.
  if (viewingId !== null) {
    return <InvoiceDetail invoiceId={viewingId} onBack={() => setViewingId(null)} />;
  }

  const invoices = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => overdueMutation.mutate()} disabled={!canWrite || overdueMutation.isPending}>
            <Clock className="mr-2 h-4 w-4" />
            {overdueMutation.isPending ? "Checking…" : "Mark Overdue"}
          </Button>
          <Button onClick={() => setFormOpen(true)} disabled={!canWrite}>
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search invoice number..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
            className="w-[180px]"
          />
          <Button onClick={handleSearch}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSearchInput("");
              setSearchNumber("");
              setStatusFilter("all");
              setPage(1);
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load invoices</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !data ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
                    Loading…
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No invoices found
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>
                      <Badge variant={invoiceStatusBadge[invoice.status]}>{invoiceStatusLabel[invoice.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{invoice.totalAmount}</TableCell>
                    <TableCell>{invoice.issueDate.slice(0, 10)}</TableCell>
                    <TableCell>{invoice.dueDate.slice(0, 10)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="icon" onClick={() => setViewingId(invoice.id)} aria-label={`View ${invoice.invoiceNumber}`}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          showPageSize
        />
      )}

      <InvoiceForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => {
          setFormOpen(false);
          queryClient.invalidateQueries({ queryKey: ["invoices"] });
        }}
      />
    </div>
  );
}
