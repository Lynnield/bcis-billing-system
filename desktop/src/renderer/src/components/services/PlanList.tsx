import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { PlanForm } from "./PlanForm";
import { ArrowLeft, Plus, Eye, Loader2 } from "lucide-react";
import { getPlansByService } from "@/lib/service-api";
import { ServicePlan, ServiceStatus, Service } from "@/shared/types";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const statusBadgeVariant: Record<ServiceStatus, "default" | "success" | "secondary"> = {
  active: "success",
  inactive: "secondary",
};

interface PlanListProps {
  service: Service;
  onBack: () => void;
}

export function PlanList({ service, onBack }: PlanListProps) {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = React.useState<ServiceStatus | "all">("all");
  const [search, setSearch] = React.useState("");

  const [formModalOpen, setFormModalOpen] = React.useState(false);
  const [editingPlan, setEditingPlan] = React.useState<ServicePlan | undefined>(undefined);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["plans", service.id, statusFilter, search],
    queryFn: () => getPlansByService(service.id, statusFilter !== "all" ? statusFilter : undefined),
    placeholderData: (previous) => previous,
  });

  const handleCreate = () => {
    setEditingPlan(undefined);
    setFormModalOpen(true);
  };

  const handleEdit = (plan: ServicePlan) => {
    setEditingPlan(plan);
    setFormModalOpen(true);
  };

  // All hooks above must run unconditionally on every render (Rules of
  // Hooks) — this must come before the loading/error early returns below.
  const plans = React.useMemo(() => {
    if (!data?.data) return [];
    return data.data.filter((plan: ServicePlan) => {
      const matchesStatus = statusFilter === "all" || plan.status === statusFilter;
      const matchesSearch = search === "" ||
        plan.name.toLowerCase().includes(search.toLowerCase()) ||
        plan.description?.toLowerCase().includes(search.toLowerCase()) ||
        plan.price.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [data?.data, statusFilter, search]);

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h2 className="text-2xl font-semibold">{service.name}</h2>
              <p className="text-muted-foreground">{service.type} plans</p>
            </div>
          </div>
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
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-4 bg-muted rounded w-3/4" /></TableCell>
                  <TableCell><div className="h-4 bg-muted rounded w-1/4" /></TableCell>
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
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h2 className="text-2xl font-semibold">{service.name}</h2>
              <p className="text-muted-foreground">{service.type} plans</p>
            </div>
          </div>
          <Button onClick={handleCreate}>Add Plan</Button>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load plans</p>
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
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-semibold">{service.name}</h2>
            <p className="text-muted-foreground">{service.type} plans</p>
          </div>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Plan
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search name, price..."
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
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Includes</TableHead>
              <TableHead className="text-right">Monthly (₱)</TableHead>
              <TableHead className="text-right">Install / Reconnect (₱)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No plans found
                </TableCell>
              </TableRow>
            ) : (
              plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-mono text-sm">{plan.code ?? "—"}</TableCell>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[plan.speedMbps ? `${plan.speedMbps} Mbps` : null, plan.channelCount ? `${plan.channelCount} ch` : null].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{plan.price}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{plan.installationFee} / {plan.reconnectionFee}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[plan.status]}>
                      {plan.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEdit(plan)}
                      aria-label={`Edit ${plan.name}`}
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

      <PlanForm
        open={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingPlan(undefined);
        }}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["plans", service.id] })}
        serviceId={service.id}
        serviceType={service.type}
        initialData={editingPlan}
        isEditing={!!editingPlan}
      />
    </div>
  );
}