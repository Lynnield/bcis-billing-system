import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/Badge";
import { SubscriberForm } from "./SubscriberForm";
import { useToast } from "@/lib/toast";
import {
  Search,
  Plus,
  Eye,
  Loader2,
} from "lucide-react";
import { getSubscribers } from "@/lib/subscriber-api";
import { Subscriber, SubscriberStatus } from "@/shared/types";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "disconnected", label: "Disconnected" },
  { value: "pending", label: "Pending" },
];

const statusBadgeVariant: Record<SubscriberStatus, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  inactive: "secondary",
  suspended: "warning",
  disconnected: "destructive",
  pending: "default",
};

export function SubscriberList() {
  const queryClient = useQueryClient();
  const { } = useToast();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [statusFilter, setStatusFilter] = React.useState<SubscriberStatus | "all">("all");
  const [searchAccountNumber, setSearchAccountNumber] = React.useState("");
  const [searchName, setSearchName] = React.useState("");
  const [searchEmail, setSearchEmail] = React.useState("");
  const [searchContact, setSearchContact] = React.useState("");

  const [formModalOpen, setFormModalOpen] = React.useState(false);
  const [editingSubscriber, setEditingSubscriber] = React.useState<Subscriber | undefined>(undefined);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["subscribers", page, pageSize, searchAccountNumber, searchName, searchEmail, searchContact, statusFilter],
    queryFn: () =>
      getSubscribers({
        page,
        pageSize,
        accountNumber: searchAccountNumber || undefined,
        name: searchName || undefined,
        email: searchEmail || undefined,
        contactNumber: searchContact || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const handleCreate = () => {
    setEditingSubscriber(undefined);
    setFormModalOpen(true);
  };

  const handleEdit = (subscriber: Subscriber) => {
    setEditingSubscriber(subscriber);
    setFormModalOpen(true);
  };

  const handleFormSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["subscribers"] });
  };

  const handleSearch = React.useCallback(() => {
    setPage(1);
  }, []);

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Subscribers</h2>
          <Button onClick={handleCreate} disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </Button>
        </div>
        <div className="animate-pulse space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-4 bg-muted rounded w-3/4" /></TableCell>
                  <TableCell><div className="h-4 bg-muted rounded w-1/2" /></TableCell>
                  <TableCell><div className="h-4 bg-muted rounded w-1/2" /></TableCell>
                  <TableCell><div className="h-4 bg-muted rounded w-1/2" /></TableCell>
                  <TableCell><div className="h-4 bg-muted rounded w-1/4" /></TableCell>
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
          <h2 className="text-2xl font-semibold">Subscribers</h2>
          <Button onClick={handleCreate}>Add Subscriber</Button>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load subscribers</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const subscribers = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Subscribers</h2>
          <p className="text-muted-foreground">Manage subscriber accounts</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Subscriber
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search account number..."
            value={searchAccountNumber}
            onChange={(e) => setSearchAccountNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Input
            placeholder="Search name..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Input
            placeholder="Search email..."
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Input
            placeholder="Search contact..."
            value={searchContact}
            onChange={(e) => setSearchContact(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SubscriberStatus | "all")}
            options={STATUS_OPTIONS}
            className="w-[180px]"
          />
          <Button onClick={handleSearch}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
          <Button variant="outline" onClick={() => {
            setSearchAccountNumber("");
            setSearchName("");
            setSearchEmail("");
            setSearchContact("");
            setStatusFilter("all");
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
              <TableHead>Account #</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscribers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No subscribers found
                </TableCell>
              </TableRow>
            ) : (
              subscribers.map((subscriber) => (
                <TableRow key={subscriber.id}>
                  <TableCell className="font-mono font-medium">{subscriber.accountNumber}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{subscriber.firstName} {subscriber.lastName}</p>
                    </div>
                  </TableCell>
                  <TableCell>{subscriber.contactNumber ?? "—"}</TableCell>
                  <TableCell>{subscriber.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[subscriber.status]}>
                      {subscriber.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(subscriber)}
                        aria-label={`Edit ${subscriber.accountNumber}`}
                      >
                        <Eye className="h-4 w-4" />
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

      <SubscriberForm
        open={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingSubscriber(undefined);
        }}
        onSuccess={handleFormSuccess}
        initialData={editingSubscriber}
        isEditing={!!editingSubscriber}
      />
    </div>
  );
}