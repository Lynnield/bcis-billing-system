import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/Badge";
import { ServiceAccountForm } from "./ServiceAccountForm";
import { LedgerView } from "./LedgerView";
import { StatementOfAccountView } from "./StatementOfAccountView";
import { useToast } from "@/lib/toast";
import {
  Search,
  Plus,
  Eye,
  Loader2,
  BookOpen,
  Receipt,
} from "lucide-react";
import { getServiceAccounts } from "@/lib/service-account-api";
import { ServiceAccountListItem, ServiceAccountDetail, ServiceAccountStatus } from "@/shared/types";

const statusBadgeVariant: Record<ServiceAccountStatus, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  inactive: "secondary",
  suspended: "warning",
  disconnected: "destructive",
  pending_installation: "default",
};

export function ServiceAccountList() {
  const queryClient = useQueryClient();
  const { } = useToast();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [searchNumber, setSearchNumber] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<ServiceAccountStatus | "all">("all");
  const [subscriberFilter, setSubscriberFilter] = React.useState<number | "all">("all");
  const [planFilter, setPlanFilter] = React.useState<number | "all">("all");
  const [areaFilter, setAreaFilter] = React.useState<number | "all">("all");
  const [collectorFilter, setCollectorFilter] = React.useState<number | "all">("all");

  const [formModalOpen, setFormModalOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState<{
    id: number;
    subscriberId: number;
    planId: number;
    serviceNumber: string;
    status: ServiceAccountStatus;
    collectionAreaId?: number;
    assignedCollectorId?: number;
  } | undefined>(undefined);
  const [ledgerAccountId, setLedgerAccountId] = React.useState<number | null>(null);
  const [soaAccountId, setSoaAccountId] = React.useState<number | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["service-accounts", page, pageSize, searchNumber, statusFilter, subscriberFilter, planFilter, areaFilter, collectorFilter],
    queryFn: () =>
      getServiceAccounts({
        page,
        pageSize,
        serviceNumber: searchNumber || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        subscriberId: subscriberFilter !== "all" ? subscriberFilter : undefined,
        planId: planFilter !== "all" ? planFilter : undefined,
        collectionAreaId: areaFilter !== "all" ? areaFilter : undefined,
        collectorId: collectorFilter !== "all" ? collectorFilter : undefined,
      }),
    placeholderData: (previous) => previous,
  });

  if (ledgerAccountId !== null) {
    return <LedgerView serviceAccountId={ledgerAccountId} onBack={() => setLedgerAccountId(null)} />;
  }
  if (soaAccountId !== null) {
    return <StatementOfAccountView serviceAccountId={soaAccountId} onBack={() => setSoaAccountId(null)} />;
  }

  const handleCreate = () => {
    setEditingAccount(undefined);
    setFormModalOpen(true);
  };

  const handleEdit = (account: ServiceAccountDetail) => {
    setEditingAccount({
      id: account.id,
      subscriberId: account.subscriber.id,
      planId: account.plan.id,
      serviceNumber: account.serviceNumber,
      status: account.status,
      collectionAreaId: account.collectionArea?.id,
      assignedCollectorId: account.collector?.id,
    });
    setFormModalOpen(true);
  };

  const handleSearch = React.useCallback(() => {
    setPage(1);
  }, []);

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Service Accounts</h2>
          <Button onClick={handleCreate} disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </Button>
        </div>
        <div className="animate-pulse space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service #</TableHead>
                <TableHead>Subscriber</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Collector</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-4 bg-muted rounded w-3/4" /></TableCell>
                  <TableCell><div className="h-4 bg-muted rounded w-1/2" /></TableCell>
                  <TableCell><div className="h-4 bg-muted rounded w-1/2" /></TableCell>
                  <TableCell><div className="h-4 bg-muted rounded w-1/4" /></TableCell>
                  <TableCell><div className="h-4 bg-muted rounded w-1/2" /></TableCell>
                  <TableCell><div className="h-4 bg-muted rounded w-1/2" /></TableCell>
                  <TableCell><div className="h-8 bg-muted rounded w-20" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Service Accounts</h2>
          <Button onClick={handleCreate}>Add Service Account</Button>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load service accounts</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const accounts = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Service Accounts</h2>
          <p className="text-muted-foreground">Manage service accounts and subscriptions</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Service Account
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search service number..."
            value={searchNumber}
            onChange={(e) => setSearchNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ServiceAccountStatus | "all")}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "suspended", label: "Suspended" },
              { value: "disconnected", label: "Disconnected" },
              { value: "pending_installation", label: "Pending Installation" },
            ]}
            className="w-[180px]"
          />
          <Select
            value={subscriberFilter}
            onChange={(e) => setSubscriberFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            options={[{ value: "all", label: "All Subscribers" }]}
            className="w-[180px]"
          />
          <Button onClick={handleSearch}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
          <Button variant="outline" onClick={() => {
            setSearchNumber("");
            setStatusFilter("all");
            setSubscriberFilter("all");
            setPlanFilter("all");
            setAreaFilter("all");
            setCollectorFilter("all");
            setPage(1);
          }}>
            Clear
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service #</TableHead>
              <TableHead>Subscriber</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Collector</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No service accounts found
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account: ServiceAccountListItem) => (
                <TableRow key={account.id}>
                  <TableCell className="font-mono font-medium">{account.serviceNumber}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{account.subscriberId}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{account.planId}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[account.status]}>
                      {account.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{account.collectionAreaId ?? "—"}</TableCell>
                  <TableCell>{account.assignedCollectorId ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          // Fetch full detail for editing
                          window.bcis.serviceAccounts.getById(account.id).then((res) => {
                            if (res.data) handleEdit(res.data);
                          });
                        }}
                        aria-label={`Edit ${account.serviceNumber}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setLedgerAccountId(account.id)}
                        aria-label={`Ledger for ${account.serviceNumber}`}
                      >
                        <BookOpen className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setSoaAccountId(account.id)}
                        aria-label={`Statement of account for ${account.serviceNumber}`}
                      >
                        <Receipt className="h-4 w-4" />
                      </Button>
                    </div>
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

      <ServiceAccountForm
        open={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingAccount(undefined);
        }}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["service-accounts"] })}
        initialData={editingAccount}
        subscribers={[]}
        plans={[]}
        collectionAreas={[]}
        collectors={[]}
        isEditing={!!editingAccount}
      />
    </div>
  );
}