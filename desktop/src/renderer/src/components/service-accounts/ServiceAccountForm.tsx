import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { CreateServiceAccountRequest, UpdateServiceAccountRequest, ServiceAccountStatus } from "@/shared/types";

interface ServiceAccountFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: {
    id: number;
    subscriberId: number;
    planId: number;
    serviceNumber: string;
    status: ServiceAccountStatus;
    collectionAreaId?: number;
    assignedCollectorId?: number;
  };
  subscribers: { id: number; accountNumber: string; fullName: string; status: string }[];
  plans: { id: number; name: string; price: string; serviceName: string; serviceType: string; status: string }[];
  collectionAreas: { id: number; name: string; status: string }[];
  collectors: { id: number; fullName: string; status: string; collectionAreaId: number | null }[];
  isEditing: boolean;
  isLoading?: boolean;
}

const SERVICE_ACCOUNT_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "disconnected", label: "Disconnected" },
  { value: "pending_installation", label: "Pending Installation" },
];

// Form data includes all fields for both create and update
interface ServiceAccountFormData {
  subscriberId: number;
  planId: number;
  serviceNumber: string;
  status: ServiceAccountStatus;
  collectionAreaId?: number;
  assignedCollectorId?: number;
}

export function ServiceAccountForm({
  open,
  onClose,
  onSuccess,
  initialData,
  subscribers,
  plans,
  collectionAreas,
  collectors,
  isEditing,
  isLoading,
}: ServiceAccountFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const isCreate = !isEditing;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<ServiceAccountFormData>({
    defaultValues: initialData
      ? {
          subscriberId: initialData.subscriberId,
          planId: initialData.planId,
          serviceNumber: initialData.serviceNumber,
          status: initialData.status || "pending_installation",
          collectionAreaId: initialData.collectionAreaId ?? undefined,
          assignedCollectorId: initialData.assignedCollectorId ?? undefined,
        }
      : {
          subscriberId: 0,
          planId: 0,
          serviceNumber: "",
          status: "pending_installation",
          collectionAreaId: undefined,
          assignedCollectorId: undefined,
        },
  });

  const selectedArea = watch("collectionAreaId");

  // Filter collectors by selected area
  const availableCollectors = React.useMemo(() => {
    if (!selectedArea) return collectors.filter((c) => c.status === "active");
    return collectors.filter((c) => c.status === "active" && c.collectionAreaId === Number(selectedArea));
  }, [selectedArea, collectors]);

  const onSubmit = async (data: ServiceAccountFormData) => {
    try {
      if (isCreate) {
        const createData: CreateServiceAccountRequest = {
          subscriberId: data.subscriberId,
          planId: data.planId,
          serviceNumber: data.serviceNumber,
          status: data.status,
          collectionAreaId: data.collectionAreaId,
          assignedCollectorId: data.assignedCollectorId,
        };
        await window.bcis.serviceAccounts.create(createData);
      } else if (initialData) {
        const updateData: UpdateServiceAccountRequest = {
          planId: data.planId,
          status: data.status,
        };
        await window.bcis.serviceAccounts.update(initialData.id, updateData);
      }
      showSuccess(isCreate ? "Service account created" : "Service account updated");
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save service account";
      if (message.includes("already exists")) {
        setError("serviceNumber", { type: "manual", message });
      } else if (message.includes("Subscriber must be active")) {
        setError("subscriberId", { type: "manual", message });
      } else if (message.includes("Service plan does not exist") || message.includes("Service plan is not active")) {
        setError("planId", { type: "manual", message });
      } else if (message.includes("Collection area does not exist")) {
        setError("collectionAreaId", { type: "manual", message });
      } else if (message.includes("Collector does not exist") || message.includes("different collection area")) {
        setError("assignedCollectorId", { type: "manual", message });
      } else {
        showError("Error", message);
      }
    }
  };

  React.useEffect(() => {
    if (open) {
      reset(initialData
        ? {
            subscriberId: initialData.subscriberId,
            planId: initialData.planId,
            serviceNumber: initialData.serviceNumber,
            status: initialData.status || "pending_installation",
            collectionAreaId: initialData.collectionAreaId ?? undefined,
            assignedCollectorId: initialData.assignedCollectorId ?? undefined,
          }
        : {
            subscriberId: 0,
            planId: 0,
            serviceNumber: "",
            status: "pending_installation",
            collectionAreaId: undefined,
            assignedCollectorId: undefined,
          });
    }
  }, [open, initialData, reset]);

  const activeSubscribers = subscribers.filter((s) => s.status === "active");
  const activePlans = plans.filter((p) => p.status === "active");
  const activeAreas = collectionAreas.filter((a) => a.status === "active");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? "Create Service Account" : "Edit Service Account"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={() => handleSubmit(onSubmit)()} disabled={isLoading}>
            {isLoading ? "Saving..." : isCreate ? "Create" : "Save Changes"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Subscriber *"
            options={activeSubscribers.map((s) => ({
              value: String(s.id),
              label: `${s.accountNumber} - ${s.fullName}`,
            }))}
            {...register("subscriberId", { required: "Subscriber is required", valueAsNumber: true })}
            error={errors.subscriberId?.message}
            placeholder="Select subscriber"
          />
          <Select
            label="Service Plan *"
            options={activePlans.map((p) => ({
              value: String(p.id),
              label: `${p.name} (${p.serviceName} - ${p.serviceType}) - ₱${p.price}`,
            }))}
            {...register("planId", { required: "Service plan is required", valueAsNumber: true })}
            error={errors.planId?.message}
            placeholder="Select plan"
          />
        </div>

        <Input
          label="Service Number *"
          {...register("serviceNumber", { required: "Service number is required", maxLength: 50 })}
          disabled={isEditing}
          error={errors.serviceNumber?.message}
          placeholder="SV-001"
        />

        <Select
          label="Status"
          options={SERVICE_ACCOUNT_STATUS_OPTIONS}
          {...register("status")}
          error={errors.status?.message}
          placeholder="Select status"
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Collection Area"
            options={[{ value: "", label: "None" }, ...activeAreas.map((a) => ({ value: String(a.id), label: a.name }))]}
            {...register("collectionAreaId", { valueAsNumber: true })}
            error={errors.collectionAreaId?.message}
            placeholder="Select area (optional)"
          />
          <Select
            label="Assigned Collector"
            options={[{ value: "", label: "None" }, ...availableCollectors.map((c) => ({ value: String(c.id), label: c.fullName }))]}
            {...register("assignedCollectorId", { valueAsNumber: true })}
            error={errors.assignedCollectorId?.message}
            placeholder="Select collector (optional)"
          />
        </div>
      </form>
    </Modal>
  );
}