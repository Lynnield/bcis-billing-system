import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { getCollectionBatches } from "@/lib/collection-batch-api";
import { getCollectors } from "@/lib/collection-area-api";
import { CollectionBatchForm } from "./CollectionBatchForm";
import type { CollectionBatchStatus } from "@/shared/types";
import { batchStatusBadge, batchStatusLabel } from "./batch-status";
import { Plus, Eye } from "lucide-react";

const STATUS_OPTIONS: Array<{ value: CollectionBatchStatus | "all"; label: string }> = [
  { value: "all", label: "All Statuses" },
  ...(Object.keys(batchStatusLabel) as CollectionBatchStatus[]).map((s) => ({ value: s, label: batchStatusLabel[s] })),
];

const statusBadgeVariant = batchStatusBadge;

interface CollectionBatchListProps {
  onViewBatch: (batchId: number) => void;
}

export function CollectionBatchList({ onViewBatch }: CollectionBatchListProps) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [collectorFilter, setCollectorFilter] = React.useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = React.useState<CollectionBatchStatus | "all">("all");
  const [formOpen, setFormOpen] = React.useState(false);

  const { data: collectorsData } = useQuery({
    queryKey: ["collectors-for-batch-filter"],
    queryFn: () => getCollectors(),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["collection-batches", page, pageSize, collectorFilter, statusFilter],
    queryFn: () =>
      getCollectionBatches({
        page,
        pageSize,
        collectorId: collectorFilter !== "all" ? collectorFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const collectors = collectorsData?.data ?? [];
  const collectorNameById = new Map(collectors.map((c) => [c.id, c.fullName]));
  const batches = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Batch
        </Button>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Select
            value={collectorFilter === "all" ? "all" : String(collectorFilter)}
            onChange={(e) => {
              setCollectorFilter(e.target.value === "all" ? "all" : Number(e.target.value));
              setPage(1);
            }}
            options={[{ value: "all", label: "All Collectors" }, ...collectors.map((c) => ({ value: String(c.id), label: c.fullName }))]}
            className="w-[220px]"
          />
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as CollectionBatchStatus | "all");
              setPage(1);
            }}
            options={STATUS_OPTIONS}
            className="w-[180px]"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load collection batches</p>
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
                <TableHead>Collector</TableHead>
                <TableHead>Batch Date</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Remitted</TableHead>
                <TableHead>Shortage</TableHead>
                <TableHead>Overage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !data ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No collection batches found
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{collectorNameById.get(b.collectorId) ?? `#${b.collectorId}`}</TableCell>
                    <TableCell>{new Date(b.batchDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right tabular-nums">₱{b.expectedAmount}</TableCell>
                    <TableCell className="text-right tabular-nums">₱{b.remittedAmount}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {Number(b.shortageAmount) > 0 ? `₱${b.shortageAmount}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {Number(b.overageAmount) > 0 ? `₱${b.overageAmount}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant[b.status]}>{batchStatusLabel[b.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="icon" onClick={() => onViewBatch(b.id)} aria-label={`View batch ${b.id}`}>
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

      <CollectionBatchForm open={formOpen} onClose={() => setFormOpen(false)} onSuccess={() => { setFormOpen(false); refetch(); }} />
    </div>
  );
}
