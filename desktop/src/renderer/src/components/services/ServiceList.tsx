import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ServiceForm } from "./ServiceForm";
import { Plus, Eye, Layers, Loader2 } from "lucide-react";
import { getServices } from "@/lib/service-api";
import { Service, ServiceType, ServiceStatus } from "@/shared/types";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "internet", label: "Internet" },
  { value: "cable", label: "Cable TV" },
  { value: "combo", label: "Combo" },
];

const statusBadgeVariant: Record<ServiceStatus, "default" | "success" | "secondary"> = {
  active: "success",
  inactive: "secondary",
};

const typeBadgeVariant: Record<ServiceType, "default" | "success" | "warning" | "secondary"> = {
  internet: "success",
  cable: "warning",
  combo: "default",
};

export function ServiceList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = React.useState<ServiceStatus | "all">("all");
  const [typeFilter, setTypeFilter] = React.useState<ServiceType | "all">("all");
  const [search, setSearch] = React.useState("");

  const [formModalOpen, setFormModalOpen] = React.useState(false);
  const [editingService, setEditingService] = React.useState<Service | undefined>(undefined);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["services", statusFilter, typeFilter, search],
    queryFn: () => getServices(statusFilter !== "all" ? statusFilter : undefined),
    placeholderData: (previous) => previous,
  });

  const handleCreate = () => {
    setEditingService(undefined);
    setFormModalOpen(true);
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormModalOpen(true);
  };

  const filteredServices = React.useMemo(() => {
    if (!data?.data) return [];
    return data.data.filter((service: Service) => {
      const matchesStatus = statusFilter === "all" || service.status === statusFilter;
      const matchesType = typeFilter === "all" || service.type === typeFilter;
      const matchesSearch = search === "" ||
        service.name.toLowerCase().includes(search.toLowerCase()) ||
        service.type.toLowerCase().includes(search.toLowerCase()) ||
        service.description?.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesType && matchesSearch;
    });
  }, [data?.data, statusFilter, typeFilter, search]);

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Services</h2>
          <Button onClick={handleCreate} disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </Button>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="rounded-lg border p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-4 bg-muted rounded w-3/4" /></TableCell>
                    <TableCell><div className="h-4 bg-muted rounded w-1/4" /></TableCell>
                    <TableCell><div className="h-4 bg-muted rounded w-1/4" /></TableCell>
                    <TableCell><div className="h-4 bg-muted rounded w-1/2" /></TableCell>
                    <TableCell><div className="h-8 bg-muted rounded w-20" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Services</h2>
          <Button onClick={handleCreate}>Add Service</Button>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load services</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const services = filteredServices;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Services</h2>
          <p className="text-muted-foreground">Manage service types and offerings</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Service
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search name, type, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ServiceStatus | "all")}
            options={STATUS_OPTIONS}
            className="w-[160px]"
          />
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ServiceType | "all")}
            options={TYPE_OPTIONS}
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
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No services found
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.name}</TableCell>
                  <TableCell>
                    <Badge variant={typeBadgeVariant[service.type]}>
                      {service.type.charAt(0).toUpperCase() + service.type.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[service.status]}>
                      {service.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {service.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => navigate(`/services/${service.id}/plans`)}
                        aria-label={`View plans for ${service.name}`}
                        title="View plans"
                      >
                        <Layers className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(service)}
                        aria-label={`Edit ${service.name}`}
                        title="Edit service"
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

      <ServiceForm
        open={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingService(undefined);
        }}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["services"] })}
        initialData={editingService}
        isEditing={!!editingService}
      />
    </div>
  );
}