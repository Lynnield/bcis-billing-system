import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { getPayments } from "@/lib/payment-api";
import { getServiceAccounts } from "@/lib/service-account-api";
import { useNavigate } from "react-router-dom";
import { PaymentDetail } from "./PaymentDetail";
import type { PaymentMethod, PaymentStatus } from "@/shared/types";
import { Plus, Eye, Loader2 } from "lucide-react";

// Matches api/src/routes/payments.ts POST_ROLES. The backend enforces this
// authoritatively; hiding the button here is a UX convenience only.
const POST_ROLES = ["Owner / Super Admin", "Administrator", "Cashier"];

const STATUS_OPTIONS: Array<{ value: PaymentStatus | "all"; label: string }> = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "posted", label: "Posted" },
  { value: "reversed", label: "Reversed" },
  { value: "cancelled", label: "Cancelled" },
];

const statusBadgeVariant: Record<PaymentStatus, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  pending: "warning",
  posted: "success",
  reversed: "destructive",
  cancelled: "secondary",
};

const methodLabel: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  other: "Other",
};

export function PaymentList() {
  const { user } = useAuth();
  const { } = useToast();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [serviceAccountFilter, setServiceAccountFilter] = React.useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = React.useState<PaymentStatus | "all">("all");
  const navigate = useNavigate();
  const [selectedPaymentId, setSelectedPaymentId] = React.useState<number | null>(null);

  const canRecordPayment = !!user && user.roles.some((r) => POST_ROLES.includes(r));

  // API caps pageSize at 100 (api/src/routes/service-accounts.ts) —
  // requesting more fails validation with 400 "Invalid query parameters".
  const { data: serviceAccountsData } = useQuery({
    queryKey: ["service-accounts-for-payment-filter"],
    queryFn: () => getServiceAccounts({ pageSize: 100 }),
    staleTime: 60_000,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["payments", page, pageSize, serviceAccountFilter, statusFilter],
    queryFn: () =>
      getPayments({
        page,
        pageSize,
        serviceAccountId: serviceAccountFilter !== "all" ? serviceAccountFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      }),
    placeholderData: (previous) => previous,
  });

  if (selectedPaymentId !== null) {
    return <PaymentDetail paymentId={selectedPaymentId} onBack={() => setSelectedPaymentId(null)} />;
  }

  const accounts = serviceAccountsData?.data ?? [];

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Payments</h2>
          <Button disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Payments</h2>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load payments</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const payments = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Payments</h2>
          <p className="text-muted-foreground">Record and review customer payments</p>
        </div>
        {canRecordPayment && (
          <Button onClick={() => navigate("/receive-payment")}>
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Select
            value={serviceAccountFilter === "all" ? "all" : String(serviceAccountFilter)}
            onChange={(e) => {
              setServiceAccountFilter(e.target.value === "all" ? "all" : Number(e.target.value));
              setPage(1);
            }}
            options={[
              { value: "all", label: "All Service Accounts" },
              ...accounts.map((a) => ({ value: String(a.id), label: a.serviceNumber })),
            ]}
            className="w-[240px]"
          />
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as PaymentStatus | "all");
              setPage(1);
            }}
            options={STATUS_OPTIONS}
            className="w-[180px]"
          />
          <Button
            variant="outline"
            onClick={() => {
              setServiceAccountFilter("all");
              setStatusFilter("all");
              setPage(1);
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service Account</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payment Date</TableHead>
              <TableHead>Receipt #</TableHead>
              <TableHead>Reference #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No payments found
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-mono">{payment.serviceAccountId}</TableCell>
                  <TableCell>{methodLabel[payment.method]}</TableCell>
                  <TableCell className="font-medium">₱{payment.amount}</TableCell>
                  <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                  <TableCell className="font-mono">{payment.receiptNumber ?? "—"}</TableCell>
                  <TableCell className="font-mono">{payment.referenceNumber ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[payment.status]}>{payment.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setSelectedPaymentId(payment.id)}
                      aria-label={`View payment ${payment.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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

    </div>
  );
}
