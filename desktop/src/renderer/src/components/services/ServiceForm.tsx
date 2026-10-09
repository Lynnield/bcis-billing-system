import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { CreateServiceRequest, UpdateServiceRequest, Service } from "@/shared/types";

interface ServiceFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Service;
  isEditing: boolean;
  isLoading?: boolean;
}

const TYPE_OPTIONS = [
  { value: "internet", label: "Internet" },
  { value: "cable", label: "Cable TV" },
  { value: "combo", label: "Internet + Cable (Combo)" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function ServiceForm({ open, onClose, onSuccess, initialData, isEditing, isLoading }: ServiceFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const isCreate = !isEditing;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateServiceRequest | UpdateServiceRequest>({
    defaultValues: initialData
      ? {
          type: initialData.type,
          name: initialData.name,
          description: initialData.description ?? "",
          status: initialData.status,
        }
      : {
          type: "internet",
          name: "",
          description: "",
          status: "active",
        },
  });

  const onSubmit = async (data: CreateServiceRequest | UpdateServiceRequest) => {
    try {
      if (isCreate) {
        await window.bcis.services.create(data as CreateServiceRequest);
      } else if (initialData) {
        await window.bcis.services.update(initialData.id, data as UpdateServiceRequest);
      }
      showSuccess(isCreate ? "Service created" : "Service updated");
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save service";
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
            type: initialData.type,
            name: initialData.name,
            description: initialData.description ?? "",
            status: initialData.status,
          }
        : {
            type: "internet",
            name: "",
            description: "",
            status: "active",
          });
    }
  }, [open, initialData, reset]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? "Create Service" : "Edit Service"}
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
        <Select
          label="Service Type *"
          options={TYPE_OPTIONS}
          {...register("type", { required: "Service type is required" })}
          error={errors.type?.message}
          placeholder="Select type"
        />
        <Input
          label="Name *"
          {...register("name", { required: "Name is required", maxLength: 100 })}
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