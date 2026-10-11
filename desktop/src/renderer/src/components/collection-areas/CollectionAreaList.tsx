import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { CollectionAreaForm } from "./CollectionAreaForm";
import { Plus, Eye, Loader2 } from "lucide-react";
import { getCollectionAreas } from "@/lib/collection-area-api";
import { CollectionArea, CollectionAreaStatus } from "@/shared/types";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const statusBadgeVariant: Record<CollectionAreaStatus, "default" | "success" | "secondary"> = {
  active: "success",
  inactive: "secondary",
};

export function CollectionAreaList() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = React.useState<CollectionAreaStatus | "all">("all");
  const [search, setSearch] = React.useState("");

  const [formModalOpen, setFormModalOpen] = React.useState(false);
  const [editingArea, setEditingArea] = React.useState<CollectionArea | undefined>(undefined);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["collection-areas", statusFilter, search],
    queryFn: () => getCollectionAreas(statusFilter !== "all" ? statusFilter : undefined),
    placeholderData: (previous) => previous,
  });

  const handleCreate = () => {
    setEditingArea(undefined);
    setFormModalOpen(true);
  };

  const handleEdit = (area: CollectionArea) => {
    setEditingArea(area);
    setFormModalOpen(true);
  };

  // All hooks above must run unconditionally on every render (Rules of
  // Hooks) — this must come before the loading/error early returns below.
  const areas = React.useMemo(() => {
    if (!data?.data) return [];
    return data.data.filter((area: CollectionArea) => {
      const matchesStatus = statusFilter === "all" || area.status === statusFilter;
      const matchesSearch = search === "" ||
        area.name.toLowerCase().includes(search.toLowerCase()) ||
        area.description?.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [data?.data, statusFilter, search]);

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Collection Areas</h2>
          <Button onClick={handleCreate} disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </Button>
        </div>
        <div className="animate-pulse space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-4 bg-muted rounded w-3/4" /></TableCell>
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
          <h2 className="text-2xl font-semibold">Collection Areas</h2>
          <Button onClick={handleCreate}>Add Collection Area</Button>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load collection areas</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Collection Areas</h2>
          <p className="text-muted-foreground">Manage collection areas for billing operations</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Collection Area
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CollectionAreaStatus | "all")}
            options={STATUS_OPTIONS}
            className="w-[160px]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No collection areas found
                </TableCell>
              </TableRow>
            ) : (
              areas.map((area) => (
                <TableRow key={area.id}>
                  <TableCell className="font-medium">{area.name}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[area.status]}>
                      {area.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {area.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEdit(area)}
                      aria-label={`Edit ${area.name}`}
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

      <CollectionAreaForm
        open={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingArea(undefined);
        }}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["collection-areas"] })}
        initialData={editingArea}
        isEditing={!!editingArea}
      />
    </div>
  );
}