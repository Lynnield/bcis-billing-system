import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { CreatePlanRequest, UpdatePlanRequest, ServicePlan } from "@/shared/types";

interface PlanFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  serviceId: number;
  initialData?: ServicePlan;
  isEditing: boolean;
  isLoading?: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function PlanForm({ open, onClose, onSuccess, serviceId, initialData, isEditing, isLoading }: PlanFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const isCreate = !isEditing;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreatePlanRequest | UpdatePlanRequest>({
    defaultValues: initialData
      ? {
          name: initialData.name,
          description: initialData.description ?? "",
          price: initialData.price,
          status: initialData.status,
        }
      : {
          name: "",
          description: "",
          price: "0.00",
          status: "active",
        },
  });

  const onSubmit = async (data: CreatePlanRequest | UpdatePlanRequest) => {
    try {
      if (isCreate) {
        await window.bcis.plans.create(serviceId, data as CreatePlanRequest);
      } else if (initialData) {
        await window.bcis.plans.update(initialData.id, data as UpdatePlanRequest);
      }
      showSuccess(isCreate ? "Plan created" : "Plan updated");
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save plan";
      if (message.includes("already exists")) {
        setError("name", { type: "manual", message });
      } else {
        showError("Error", message);
      }
    }
  };

  React.useEffect(() => {
    if (open) {
      reset(initialData
        ? {
            name: initialData.name,
            description: initialData.description ?? "",
            price: initialData.price,
            status: initialData.status,
          }
        : {
            name: "",
            description: "",
            price: "0.00",
            status: "active",
          });
    }
  }, [open, initialData, reset]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? "Create Plan" : "Edit Plan"}
      size="md"
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
        <Input
          label="Plan Name *"
          {...register("name", { required: "Plan name is required", maxLength: 100 })}
          error={errors.name?.message}
          placeholder="e.g., Fiber Basic 50Mbps"
        />
        <Textarea
          label="Description"
          {...register("description", { maxLength: 2000 })}
          error={errors.description?.message}
          placeholder="Optional description"
          rows={3}
        />
        <Input
          label="Monthly Price (PHP) *"
          type="number"
          step="0.01"
          min="0"
          {...register("price", { 
            required: "Price is required",
            pattern: { value: /^\d+(\.\d{1,2})?$/, message: "Price must be a valid amount with up to 2 decimal places" }
          })}
          error={errors.price?.message}
          placeholder="0.00"
        />
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          {...register("status")}
          error={errors.status?.message}
          placeholder="Select status"
        />
      </form>
    </Modal>
  );
}