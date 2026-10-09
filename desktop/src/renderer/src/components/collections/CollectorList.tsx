import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CollectorForm } from "./CollectorForm";
import { getCollectors, getCollectionAreas } from "@/lib/collection-area-api";
import type { Collector, CollectorStatus } from "@/shared/types";
import { Plus, Pencil, Route } from "lucide-react";

const statusBadgeVariant: Record<CollectorStatus, "success" | "secondary"> = {
  active: "success",
  inactive: "secondary",
};

interface CollectorListProps {
  onViewRouteSheet: (collectorId: number) => void;
}

export function CollectorList({ onViewRouteSheet }: CollectorListProps) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Collector | undefined>(undefined);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["collectors"],
    queryFn: () => getCollectors(),
  });

  const { data: areasData } = useQuery({
    queryKey: ["collection-areas-for-collector-list"],
    queryFn: () => getCollectionAreas(),
  });

  const areaNameById = new Map((areasData?.data ?? []).map((a) => [a.id, a.name]));
  const collectors = data?.data ?? [];

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <p className="font-medium text-destructive">Failed to load collectors</p>
        <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
        <Button onClick={() => refetch()} className="mt-4" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Collector
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : collectors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No collectors yet
                </TableCell>
              </TableRow>
            ) : (
              collectors.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.fullName}</TableCell>
                  <TableCell>{c.contactNumber ?? "—"}</TableCell>
                  <TableCell>{c.collectionAreaId ? (areaNameById.get(c.collectionAreaId) ?? "—") : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[c.status]}>{c.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditing(c);
                          setFormOpen(true);
                        }}
                        aria-label={`Edit ${c.fullName}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onViewRouteSheet(c.id)}
                        aria-label={`Route sheet for ${c.fullName}`}
                      >
                        <Route className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CollectorForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(undefined);
        }}
        onSuccess={() => {
          setFormOpen(false);
          setEditing(undefined);
          queryClient.invalidateQueries({ queryKey: ["collectors"] });
        }}
        initialData={editing}
        isEditing={!!editing}
      />
    </div>
  );
}
